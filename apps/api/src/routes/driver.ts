// Module 3 — Driver app. Job list, guided pickup with AI walk-around inspection
// (condition score + findings the driver approves/edits), VIN/odometer OCR, and
// delivery with signature + photo POD. Every AI output runs through runAi() so it
// carries confidence, routes to a human below threshold, and is QA-auditable.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  prisma,
  appendCustodyEvent,
  InspectionType,
  FindingSeverity,
  DecidedBy,
  ShipmentStatus,
  CustodyEventType,
  DocumentType,
  AIDecisionKind,
} from "@navastar/db";
import { Permission, getAi, runAi } from "@navastar/shared";
import { getStorageProvider } from "@navastar/providers";
import { publishToOutbox, bus } from "../events.js";
import { advanceStatus } from "../lib/tracking.js";
import { serializeShipment } from "../lib/serialize.js";

const ACTIVE: ShipmentStatus[] = [
  ShipmentStatus.BOOKED,
  ShipmentStatus.ASSIGNED,
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
];

const inspectionBody = z.object({
  type: z.nativeEnum(InspectionType).default(InspectionType.PICKUP),
  cargoItemId: z.string().optional(),
  imageKeys: z.array(z.string()).default([]),
});

const approveBody = z.object({
  conditionScore: z.number().int().min(0).max(100).optional(),
  findings: z
    .array(
      z.object({
        panel: z.string().optional(),
        kind: z.string(),
        severity: z.nativeEnum(FindingSeverity).default(FindingSeverity.MINOR),
        note: z.string().optional(),
        source: z.nativeEnum(DecidedBy).default(DecidedBy.human),
        confidence: z.number().optional(),
      })
    )
    .default([]),
});

const ocrBody = z.object({
  imageKey: z.string().min(1),
  kind: z.enum(["VIN", "ODOMETER", "BOL", "TITLE"]),
});

const cargoBody = z.object({ vin: z.string().optional(), odometer: z.number().int().optional() });

const podBody = z.object({
  signerName: z.string().min(1),
  signatureKey: z.string().optional(),
  photoKeys: z.array(z.string()).default([]),
});

export default async function driverRoutes(app: FastifyInstance) {
  // Driver job list (active shipments). Margin is stripped for drivers.
  app.get(
    "/api/driver/jobs",
    { preHandler: [app.requirePermission(Permission.DRIVER_JOBS_READ)] },
    async (req) => {
      const shipments = await prisma.shipment.findMany({
        where: { status: { in: ACTIVE } },
        include: { pickup: true, dropoff: true, cargoItems: true, commodity: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const roles = req.principal?.roles ?? [];
      return {
        jobs: shipments.map((s) => ({
          ...serializeShipment(s, roles),
          cargo: s.cargoItems.map((c) => ({ description: c.description, vin: c.vin, odometer: c.odometer })),
          pickup: s.pickup ? { name: s.pickup.name, city: s.pickup.city, lat: s.pickup.lat, lng: s.pickup.lng } : null,
          dropoff: s.dropoff ? { name: s.dropoff.name, city: s.dropoff.city } : null,
        })),
      };
    }
  );

  // AI walk-around inspection → condition score + findings (driver reviews next).
  app.post(
    "/api/shipments/:id/inspections",
    { preHandler: [app.requirePermission(Permission.INSPECTION_SUBMIT)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = inspectionBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });

      const driver = req.principal ? await prisma.driver.findUnique({ where: { userId: req.principal.userId } }) : null;

      const ai = getAi();
      const envelope = await runAi(
        AIDecisionKind.INSPECTION,
        { shipmentId: shipment.id, imageKeys: parsed.data.imageKeys },
        () =>
          ai.aiInspection({
            shipmentId: shipment.id,
            cargoItemId: parsed.data.cargoItemId,
            imageKeys: parsed.data.imageKeys,
          }),
        { shipmentId: shipment.id }
      );

      const inspection = await prisma.inspection.create({
        data: {
          shipmentId: shipment.id,
          cargoItemId: parsed.data.cargoItemId ?? null,
          driverId: driver?.id ?? null,
          type: parsed.data.type,
          conditionScore: envelope.result.conditionScore,
          aiDecisionId: envelope.aiDecisionId,
          findings: {
            create: envelope.result.findings.map((f) => ({
              panel: f.panel,
              kind: f.kind,
              severity: f.severity as FindingSeverity,
              source: DecidedBy.ai,
              confidence: f.confidence,
            })),
          },
        },
        include: { findings: true },
      });

      return reply.code(201).send({
        inspectionId: inspection.id,
        conditionScore: inspection.conditionScore,
        findings: inspection.findings,
        ai: {
          model: envelope.model,
          version: envelope.version,
          confidence: envelope.confidence,
          needsHumanReview: envelope.needsHumanReview, // photos/damage tend to route to human
          decidedBy: envelope.decidedBy,
          qaStatus: envelope.qaStatus,
        },
      });
    }
  );

  // Driver approves/edits the AI findings (human-in-the-loop). Replaces findings
  // with the reviewed set and marks the AIDecision human-approved.
  app.post(
    "/api/inspections/:id/approve",
    { preHandler: [app.requirePermission(Permission.INSPECTION_SUBMIT)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = approveBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const inspection = await prisma.inspection.findUnique({ where: { id } });
      if (!inspection) return reply.code(404).send({ error: "inspection_not_found" });

      const updated = await prisma.$transaction(async (tx) => {
        await tx.finding.deleteMany({ where: { inspectionId: id } });
        const insp = await tx.inspection.update({
          where: { id },
          data: {
            approvedByUserId: req.principal?.userId ?? null,
            conditionScore: parsed.data.conditionScore ?? inspection.conditionScore,
            findings: {
              create: parsed.data.findings.map((f) => ({
                panel: f.panel,
                kind: f.kind,
                severity: f.severity,
                note: f.note,
                source: f.source,
                confidence: f.confidence,
              })),
            },
          },
          include: { findings: true },
        });
        // Mark the AI decision human-approved (approver recorded).
        if (inspection.aiDecisionId) {
          await tx.aIDecision.update({
            where: { id: inspection.aiDecisionId },
            data: { approvedByUserId: req.principal?.userId ?? null },
          });
        }
        return insp;
      });

      return { inspectionId: updated.id, conditionScore: updated.conditionScore, findings: updated.findings, approvedBy: req.principal?.userId };
    }
  );

  // Auto-read VIN / odometer (stub OCR). Returns fields for the driver to confirm.
  app.post(
    "/api/shipments/:id/ocr",
    { preHandler: [app.requirePermission(Permission.INSPECTION_SUBMIT)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = ocrBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });

      const ai = getAi();
      const envelope = await runAi(
        AIDecisionKind.DOCUMENT_OCR,
        { imageKey: parsed.data.imageKey, kind: parsed.data.kind },
        () => ai.documentOcr({ imageKey: parsed.data.imageKey, kind: parsed.data.kind }),
        { shipmentId: shipment.id }
      );
      return {
        fields: envelope.result.fields,
        ai: { model: envelope.model, confidence: envelope.confidence, needsHumanReview: envelope.needsHumanReview },
      };
    }
  );

  // Driver confirms VIN/odometer onto the cargo item.
  app.post(
    "/api/shipments/:id/cargo/:cargoId",
    { preHandler: [app.requirePermission(Permission.INSPECTION_SUBMIT)] },
    async (req, reply) => {
      const { cargoId } = req.params as { id: string; cargoId: string };
      const parsed = cargoBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const cargo = await prisma.cargoItem.update({
        where: { id: cargoId },
        data: { vin: parsed.data.vin, odometer: parsed.data.odometer },
      });
      return { cargoItemId: cargo.id, vin: cargo.vin, odometer: cargo.odometer };
    }
  );

  // Complete pickup → status PICKED_UP + hash-chained custody event.
  app.post(
    "/api/shipments/:id/pickup",
    { preHandler: [app.requirePermission(Permission.INSPECTION_SUBMIT)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
      const updated = await advanceStatus(
        shipment.id,
        ShipmentStatus.PICKED_UP,
        CustodyEventType.INSPECTED_PICKUP,
        { type: "driver", id: req.principal?.userId }
      );
      return { shipmentId: updated.id, status: updated.status };
    }
  );

  // Delivery: signature + photo POD → DELIVERED. Fires `pod.signed` (escrow
  // release hook for Module 9) and a `shipment.status` live event.
  app.post(
    "/api/shipments/:id/pod",
    { preHandler: [app.requirePermission(Permission.POD_SUBMIT)] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = podBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });

      await prisma.$transaction(async (tx) => {
        if (parsed.data.signatureKey) {
          await tx.document.create({
            data: { shipmentId: shipment.id, type: DocumentType.SIGNATURE, storageKey: parsed.data.signatureKey, meta: { signerName: parsed.data.signerName } },
          });
        }
        for (const key of parsed.data.photoKeys) {
          await tx.document.create({ data: { shipmentId: shipment.id, type: DocumentType.POD, storageKey: key } });
        }
        await appendCustodyEvent(tx, {
          shipmentId: shipment.id,
          type: CustodyEventType.POD_SIGNED,
          actorType: "driver",
          actorId: req.principal?.userId ?? null,
          payload: { signerName: parsed.data.signerName, photos: parsed.data.photoKeys.length },
        });
        await tx.shipment.update({ where: { id: shipment.id }, data: { status: ShipmentStatus.DELIVERED } });
        await appendCustodyEvent(tx, {
          shipmentId: shipment.id,
          type: CustodyEventType.DELIVERED,
          actorType: "driver",
          actorId: req.principal?.userId ?? null,
          payload: { status: ShipmentStatus.DELIVERED },
        });
        // Escrow release hook (Module 9): digital-BOL/POD sign-off = release event.
        await publishToOutbox(tx, "pod.signed", { shipmentId: shipment.id, signerName: parsed.data.signerName });
      });

      bus.emitEvent({
        topic: "shipment.status",
        payload: { shipmentId: shipment.id, status: ShipmentStatus.DELIVERED, at: new Date().toISOString() },
        id: `${shipment.id}:delivered`,
        at: new Date().toISOString(),
      });

      return reply.code(200).send({ shipmentId: shipment.id, status: ShipmentStatus.DELIVERED });
    }
  );
}
