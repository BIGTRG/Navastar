// Module 5 — QA console. QA audits BEHIND both the AI and the driver: the review
// queue is driver-approved inspections still qaStatus=pending. A reviewer sees the
// AI findings, the hash-chained custody chain (verified), and the POD/photos, then
// Pass/Fix/Fail. Decisions write a QAReview, set qaStatus on the inspection + its
// AIDecision, and feed driver/carrier reliability (trust) scores. This closes the
// "AI does it → a human approves → QA verifies" loop.
import type { FastifyInstance } from "fastify";
import { idParams } from "../lib/validation.js";
import { z } from "zod";
import { prisma, QAStatus, verifyCustodyChain, DocumentType } from "@navastar/db";
import { Permission } from "@navastar/shared";
import { getStorageProvider } from "@navastar/providers";
import { publishToOutbox } from "../events.js";

// Trust-score deltas by QA outcome (0..100, clamped).
const TRUST_DELTA: Record<"pass" | "fix" | "fail", number> = { pass: 2, fix: -3, fail: -8 };
const clampScore = (n: number) => Math.max(0, Math.min(100, n));

export default async function qaRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.requirePermission(Permission.QA_REVIEW)] };

  // Review queue + status counts. Pending = driver-approved but not yet QA'd.
  app.get("/api/qa/queue", guard, async () => {
    const [pending, counts] = await Promise.all([
      prisma.inspection.findMany({
        where: { qaStatus: QAStatus.pending },
        include: {
          shipment: { select: { trackingId: true } },
          aiDecision: { select: { confidence: true, needsHumanReview: true, model: true } },
          _count: { select: { findings: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      prisma.inspection.groupBy({ by: ["qaStatus"], _count: { _all: true } }),
    ]);

    const countBy: Record<string, number> = { pending: 0, pass: 0, fix: 0, fail: 0 };
    for (const c of counts) countBy[c.qaStatus] = c._count._all;

    return {
      counts: countBy,
      queue: pending.map((i) => ({
        inspectionId: i.id,
        shipmentId: i.shipmentId,
        trackingId: i.shipment.trackingId,
        type: i.type,
        conditionScore: i.conditionScore,
        findingsCount: i._count.findings,
        approved: i.approvedByUserId != null,
        aiConfidence: i.aiDecision?.confidence ?? null,
        needsHumanReview: i.aiDecision?.needsHumanReview ?? false,
        createdAt: i.createdAt,
      })),
    };
  });

  // Full review context: findings + custody (verified) + POD/photos + AI envelope.
  app.get("/api/qa/inspections/:id", guard, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const inspection = await prisma.inspection.findUnique({
      where: { id },
      include: {
        findings: true,
        aiDecision: true,
        shipment: {
          include: {
            custodyEvents: { orderBy: { sequence: "asc" } },
            cargoItems: true,
            documents: true,
          },
        },
      },
    });
    if (!inspection) return reply.code(404).send({ error: "inspection_not_found" });

    const chain = await verifyCustodyChain(inspection.shipmentId);
    const storage = getStorageProvider();
    const QA_DOC_TYPES: DocumentType[] = [DocumentType.POD, DocumentType.SIGNATURE, DocumentType.INSPECTION_PHOTO];
    const docs = await Promise.all(
      inspection.shipment.documents
        .filter((d) => QA_DOC_TYPES.includes(d.type))
        .map(async (d) => ({ id: d.id, type: d.type, url: await storage.getUrl(d.storageKey) }))
    );

    return {
      inspection: {
        id: inspection.id,
        type: inspection.type,
        conditionScore: inspection.conditionScore,
        qaStatus: inspection.qaStatus,
        approvedByUserId: inspection.approvedByUserId,
      },
      findings: inspection.findings.map((f) => ({
        panel: f.panel,
        kind: f.kind,
        severity: f.severity,
        note: f.note,
        source: f.source, // ai vs human — QA sees who logged each finding
        confidence: f.confidence,
      })),
      ai: inspection.aiDecision
        ? {
            model: inspection.aiDecision.model,
            version: inspection.aiDecision.version,
            confidence: inspection.aiDecision.confidence,
            needsHumanReview: inspection.aiDecision.needsHumanReview,
            qaStatus: inspection.aiDecision.qaStatus,
            approvedByUserId: inspection.aiDecision.approvedByUserId,
          }
        : null,
      cargo: inspection.shipment.cargoItems.map((c) => ({ description: c.description, vin: c.vin, odometer: c.odometer })),
      custody: {
        ok: chain.ok, // tamper-evidence result surfaced to QA
        length: chain.length,
        brokenAtSequence: chain.brokenAtSequence ?? null,
        events: inspection.shipment.custodyEvents.map((e) => ({
          sequence: e.sequence,
          type: e.type,
          at: e.createdAt,
          hash: e.hash,
        })),
      },
      documents: docs,
    };
  });

  // Pass / Fix / Fail. Writes a QAReview, sets qaStatus, feeds reliability scores.
  app.post("/api/qa/inspections/:id/decision", guard, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = z.object({ status: z.enum(["pass", "fix", "fail"]), note: z.string().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });

    const inspection = await prisma.inspection.findUnique({ where: { id } });
    if (!inspection) return reply.code(404).send({ error: "inspection_not_found" });

    const status = body.data.status as QAStatus;
    const delta = TRUST_DELTA[body.data.status];

    const result = await prisma.$transaction(async (tx) => {
      const review = await tx.qAReview.create({
        data: {
          shipmentId: inspection.shipmentId,
          aiDecisionId: inspection.aiDecisionId,
          reviewerId: req.principal?.userId ?? null,
          status,
          note: body.data.note,
          decidedAt: new Date(),
        },
      });
      await tx.inspection.update({ where: { id }, data: { qaStatus: status } });
      if (inspection.aiDecisionId) {
        await tx.aIDecision.update({ where: { id: inspection.aiDecisionId }, data: { qaStatus: status } });
      }

      // Feed reliability: adjust the driver and their carrier's trust score.
      let driverTrust: number | null = null;
      if (inspection.driverId) {
        const driver = await tx.driver.findUnique({ where: { id: inspection.driverId } });
        if (driver) {
          const updated = await tx.driver.update({
            where: { id: driver.id },
            data: { trustScore: clampScore(driver.trustScore + delta) },
          });
          driverTrust = updated.trustScore;
          if (driver.carrierId) {
            const carrier = await tx.carrier.findUnique({ where: { id: driver.carrierId } });
            if (carrier) {
              await tx.carrier.update({
                where: { id: carrier.id },
                data: { trustScore: clampScore(carrier.trustScore + Math.round(delta / 2)) },
              });
            }
          }
        }
      }

      await publishToOutbox(tx, "qa.reviewed", { inspectionId: id, shipmentId: inspection.shipmentId, status });
      return { review, driverTrust };
    });

    return { qaReviewId: result.review.id, status, driverTrustScore: result.driverTrust };
  });

  // Reliability scores derived from QA outcomes (feeds trust). Read-only summary.
  app.get("/api/qa/reliability", guard, async () => {
    const drivers = await prisma.driver.findMany({
      where: { active: true },
      include: { inspections: { select: { qaStatus: true } }, carrier: { select: { legalName: true, trustScore: true } } },
      orderBy: { trustScore: "desc" },
    });
    return {
      drivers: drivers.map((d) => {
        const total = d.inspections.length;
        const passed = d.inspections.filter((i) => i.qaStatus === QAStatus.pass).length;
        return {
          id: d.id,
          name: d.name,
          type: d.type,
          trustScore: d.trustScore,
          carrier: d.carrier?.legalName ?? "Navastar Fleet",
          carrierTrust: d.carrier?.trustScore ?? null,
          reviewed: total,
          passRate: total > 0 ? Math.round((passed / total) * 100) : null,
        };
      }),
    };
  });
}
