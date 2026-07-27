// Module 15 — Deeper AI endpoints: support copilot (customer + agent handoff),
// demand/revenue forecasting, and on-demand fraud check. Each AI call runs through
// runAi so it is logged with confidence + the human-in-the-loop hook.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, ShipmentStatus, AIDecisionKind } from "@navastar/db";
import { Permission, getAi, runAi } from "@navastar/shared";

const BOOKED_PLUS: ShipmentStatus[] = [
  ShipmentStatus.BOOKED,
  ShipmentStatus.ASSIGNED,
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.DELIVERED,
  ShipmentStatus.COMPLETED,
];

export default async function aiRoutes(app: FastifyInstance) {
  // Support copilot — any authenticated user. Always offers a human handoff.
  app.post("/api/ai/support", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({ question: z.string().min(1), shipmentId: z.string().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const ai = getAi();
    const envelope = await runAi(AIDecisionKind.SUPPORT_COPILOT, body.data, () => ai.supportCopilot(body.data), {
      shipmentId: body.data.shipmentId ?? null,
    });
    return {
      answer: envelope.result.answer,
      citations: envelope.result.citations,
      humanHandoffAvailable: true,
      ai: { model: envelope.model, confidence: envelope.confidence, needsHumanReview: envelope.needsHumanReview },
    };
  });

  // Demand + revenue forecast from recent history (ops).
  app.get("/api/ai/forecast", { preHandler: [app.requirePermission(Permission.OPS_DASHBOARD_READ)] }, async () => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const recent = await prisma.shipment.findMany({
      where: { createdAt: { gte: since }, status: { in: BOOKED_PLUS } },
      select: { quotedPriceCents: true },
    });
    const count = recent.length;
    const avgPerDay = count / 30;
    const avgPriceCents = count ? Math.round(recent.reduce((s, r) => s + (r.quotedPriceCents ?? 0), 0) / count) : 0;
    const projectedVolume7d = Math.round(avgPerDay * 7);
    const projectedGmvCents = projectedVolume7d * avgPriceCents;
    // Confidence grows with sample size (more history → steadier forecast).
    const confidence = Math.max(0.3, Math.min(0.9, count / 40));
    return {
      window: "trailing_30d",
      history: { bookings: count, avgPerDay: Math.round(avgPerDay * 10) / 10, avgPriceCents },
      forecastNext7d: { projectedVolume: projectedVolume7d, projectedGmvCents },
      model: "navastar-forecast",
      confidence: Math.round(confidence * 100) / 100,
    };
  });

  // On-demand fraud/risk check for a subject (ops/monitoring).
  app.post("/api/ai/fraud-check", { preHandler: [app.requirePermission(Permission.MONITORING_VIEW)] }, async (req, reply) => {
    const body = z
      .object({ subjectId: z.string(), context: z.enum(["booking", "carrier_onboarding", "payout"]).default("booking") })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const ai = getAi();
    const envelope = await runAi(AIDecisionKind.FRAUD_RISK, body.data, () => ai.fraudRisk(body.data));
    return { riskScore: envelope.result.riskScore, flags: envelope.result.flags, ai: { model: envelope.model, confidence: envelope.confidence } };
  });
}
