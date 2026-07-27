// Module 6 — Dispatch & matching. GET a queue of shipments needing a driver, run
// the matching engine (logged as an AI MATCHING decision), and assign — either
// auto (best eligible candidate) or a dispatcher-chosen driver. Assignment creates
// a Leg with the driver's payout (driver never sees margin), advances the shipment
// to ASSIGNED with a hash-chained custody event, and emits live + outbox events.
import type { FastifyInstance } from "fastify";
import { idParams } from "../lib/validation.js";
import { z } from "zod";
import {
  prisma,
  appendCustodyEvent,
  ShipmentStatus,
  LegStatus,
  CustodyEventType,
  AIDecisionKind,
} from "@navastar/db";
import { Permission, runAi } from "@navastar/shared";
import { publishToOutbox, bus } from "../events.js";
import { computeMatches, pickAssetFor } from "../lib/matching.js";

export default async function dispatchRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.requirePermission(Permission.DISPATCH_ASSIGN)] };

  // Shipments booked but not yet assigned to a driver.
  app.get("/api/dispatch/queue", guard, async () => {
    const shipments = await prisma.shipment.findMany({
      where: { status: ShipmentStatus.BOOKED, legs: { none: { driverId: { not: null } } } },
      include: { pickup: true, dropoff: true, cargoItems: true, commodity: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return {
      queue: shipments.map((s) => ({
        id: s.id,
        trackingId: s.trackingId,
        commodityType: s.commodity.type,
        cargo: s.cargoItems[0]?.description ?? null,
        origin: s.pickup?.city ?? null,
        dest: s.dropoff?.city ?? null,
        etaAt: s.etaAt,
      })),
    };
  });

  // Run the matching engine (logged as an AI MATCHING decision).
  app.post("/api/dispatch/shipments/:id/match", guard, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });

    const envelope = await runAi(
      AIDecisionKind.MATCHING,
      { shipmentId: shipment.id },
      async () => {
        const result = await computeMatches(shipment.id);
        return { result, model: "navastar-matcher", version: "0.1.0", confidence: result.confidence };
      },
      { shipmentId: shipment.id }
    );

    return {
      shipmentId: shipment.id,
      payoutCents: envelope.result.payoutCents,
      candidates: envelope.result.candidates,
      ai: {
        model: envelope.model,
        version: envelope.version,
        confidence: envelope.confidence,
        needsHumanReview: envelope.needsHumanReview, // low separation → dispatcher decides
        decidedBy: envelope.decidedBy,
      },
    };
  });

  // Assign a driver — auto (best eligible) or a specified driverId.
  app.post("/api/dispatch/shipments/:id/assign", guard, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = z.object({ driverId: z.string().optional(), mode: z.enum(["auto", "manual"]).optional() }).parse(req.body ?? {});
    const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
    if (shipment.status !== ShipmentStatus.BOOKED && shipment.status !== ShipmentStatus.ASSIGNED) {
      return reply.code(409).send({ error: "not_assignable", message: `Shipment is ${shipment.status}.` });
    }

    // Choose the driver.
    let driverId = body.driverId;
    let payoutCents: number | null = null;
    if (!driverId) {
      const match = await computeMatches(shipment.id);
      const best = match.candidates.find((c) => c.eligible);
      if (!best) return reply.code(422).send({ error: "no_eligible_driver", message: "No eligible driver to auto-assign." });
      driverId = best.driverId;
      payoutCents = match.payoutCents;
    } else {
      const match = await computeMatches(shipment.id);
      payoutCents = match.payoutCents;
      const chosen = match.candidates.find((c) => c.driverId === driverId);
      if (chosen && !chosen.eligible) {
        return reply.code(409).send({ error: "driver_ineligible", message: chosen.reason });
      }
    }

    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return reply.code(404).send({ error: "driver_not_found" });
    const assetId = await pickAssetFor(driver.id);

    const leg = await prisma.$transaction(async (tx) => {
      const seq = await tx.leg.count({ where: { shipmentId: shipment.id } });
      const created = await tx.leg.create({
        data: {
          shipmentId: shipment.id,
          sequence: seq,
          status: LegStatus.ASSIGNED,
          carrierId: driver.carrierId ?? null,
          driverId: driver.id,
          assetId,
          payoutCents, // the ONLY money a driver sees
        },
      });
      await tx.shipment.update({ where: { id: shipment.id }, data: { status: ShipmentStatus.ASSIGNED } });
      await appendCustodyEvent(tx, {
        shipmentId: shipment.id,
        type: CustodyEventType.ASSIGNED,
        actorType: "user",
        actorId: req.principal?.userId ?? null,
        payload: { driverId: driver.id, carrierId: driver.carrierId ?? null },
      });
      await publishToOutbox(tx, "shipment.assigned", { shipmentId: shipment.id, driverId: driver.id });
      return created;
    });

    bus.emitEvent({
      topic: "shipment.status",
      payload: { shipmentId: shipment.id, status: ShipmentStatus.ASSIGNED, at: new Date().toISOString() },
      id: `${shipment.id}:assigned`,
      at: new Date().toISOString(),
    });

    return reply.code(200).send({
      shipmentId: shipment.id,
      status: ShipmentStatus.ASSIGNED,
      legId: leg.id,
      driver: { id: driver.id, name: driver.name },
      payoutCents,
    });
  });
}
