// Module 12 — Ratings & trust, Insurance & claims, and Carrier-monitoring.
// Carrier-monitoring is SEPARATE from the GPS map: it tracks FMCSA authority,
// insurance validity + lapse alerts, safety score, and fraud/double-broker risk.
// FMCSA free feed now (carrierLookup stub) with a vendor adapter seam for
// Highway/MyCarrierPortal/Carrier411 later.
import type { FastifyInstance } from "fastify";
import { idParams, idSchema } from "../lib/validation.js";
import { z } from "zod";
import { prisma, InsuranceType, ClaimStatus, AIDecisionKind } from "@navastar/db";
import { Permission, getAi, runAi } from "@navastar/shared";

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const LAPSE_WINDOW_DAYS = 30;

export default async function trustRoutes(app: FastifyInstance) {
  // ── Ratings & trust ──
  app.post("/api/ratings", { preHandler: [app.requirePermission(Permission.RATING_SUBMIT)] }, async (req, reply) => {
    const body = z
      .object({
        subjectType: z.enum(["carrier", "driver", "customer"]),
        subjectId: z.string(),
        stars: z.number().int().min(1).max(5),
        comment: z.string().optional(),
        shipmentId: z.string().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });

    const rating = await prisma.rating.create({
      data: { ...body.data, authorId: req.principal?.userId ?? null },
    });
    // Ratings feed trust: nudge the subject's trustScore toward stars×20.
    const target = body.data.stars * 20;
    if (body.data.subjectType === "driver") {
      const d = await prisma.driver.findUnique({ where: { id: body.data.subjectId } });
      if (d) await prisma.driver.update({ where: { id: d.id }, data: { trustScore: clamp(Math.round(d.trustScore * 0.8 + target * 0.2)) } });
    } else if (body.data.subjectType === "carrier") {
      const c = await prisma.carrier.findUnique({ where: { id: body.data.subjectId } });
      if (c) await prisma.carrier.update({ where: { id: c.id }, data: { trustScore: clamp(Math.round(c.trustScore * 0.8 + target * 0.2)) } });
    }
    return reply.code(201).send({ ratingId: rating.id });
  });

  app.get("/api/ratings/:subjectType/:subjectId", { preHandler: [app.authenticate] }, async (req) => {
    const { subjectType, subjectId } = z
      .object({ subjectType: z.string().min(1).max(32), subjectId: idSchema })
      .parse(req.params);
    const ratings = await prisma.rating.findMany({ where: { subjectType, subjectId }, orderBy: { createdAt: "desc" }, take: 50 });
    const avg = ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : null;
    return {
      count: ratings.length,
      average: avg != null ? Math.round(avg * 10) / 10 : null,
      recent: ratings.slice(0, 10).map((r) => ({ stars: r.stars, comment: r.comment, at: r.createdAt })),
    };
  });

  // ── Insurance ──
  app.post("/api/carriers/:id/insurance", { preHandler: [app.requirePermission(Permission.INSURANCE_MANAGE)] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = z
      .object({
        type: z.nativeEnum(InsuranceType).default(InsuranceType.CARGO),
        provider: z.string(),
        policyNo: z.string().optional(),
        coverageCents: z.number().int().optional(),
        effectiveAt: z.string().datetime().optional(),
        expiresAt: z.string().datetime().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const ins = await prisma.insurance.create({
      data: {
        carrierId: id,
        type: body.data.type,
        provider: body.data.provider,
        policyNo: body.data.policyNo,
        coverageCents: body.data.coverageCents,
        effectiveAt: body.data.effectiveAt ? new Date(body.data.effectiveAt) : null,
        expiresAt: body.data.expiresAt ? new Date(body.data.expiresAt) : null,
      },
    });
    return reply.code(201).send({ insuranceId: ins.id });
  });

  // ── Claims ──
  app.post("/api/claims", { preHandler: [app.requirePermission(Permission.CLAIM_FILE)] }, async (req, reply) => {
    const body = z.object({ shipmentId: z.string(), amountCents: z.number().int().optional(), description: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id: body.data.shipmentId }, { trackingId: body.data.shipmentId }] } });
    if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
    const claim = await prisma.claim.create({
      data: { shipmentId: shipment.id, amountCents: body.data.amountCents ?? null, description: body.data.description },
    });
    return reply.code(201).send({ claimId: claim.id, status: claim.status });
  });

  app.get("/api/claims", { preHandler: [app.requirePermission(Permission.CLAIM_MANAGE)] }, async () => {
    const claims = await prisma.claim.findMany({ include: { shipment: { select: { trackingId: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return { claims: claims.map((c) => ({ id: c.id, trackingId: c.shipment.trackingId, status: c.status, amountCents: c.amountCents, description: c.description, createdAt: c.createdAt })) };
  });

  app.post("/api/claims/:id/status", { preHandler: [app.requirePermission(Permission.CLAIM_MANAGE)] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = z.object({ status: z.nativeEnum(ClaimStatus) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const claim = await prisma.claim.update({ where: { id }, data: { status: body.data.status } });
    return { claimId: claim.id, status: claim.status };
  });

  // ── Carrier-monitoring (separate from GPS) ──
  app.get("/api/monitoring/carriers", { preHandler: [app.requirePermission(Permission.MONITORING_VIEW)] }, async () => {
    const carriers = await prisma.carrier.findMany({ where: { active: true }, include: { insurances: true }, orderBy: { legalName: "asc" } });
    const now = Date.now();
    return {
      carriers: carriers.map((c) => {
        const active = c.insurances.filter((i) => i.active);
        const valid = active.filter((i) => !i.expiresAt || i.expiresAt.getTime() > now);
        const alerts: string[] = [];
        if (!c.authorityActive) alerts.push("FMCSA authority INACTIVE");
        if (valid.length === 0) alerts.push("No valid insurance on file");
        for (const i of active) {
          if (i.expiresAt) {
            const days = Math.round((i.expiresAt.getTime() - now) / 86_400_000);
            if (days < 0) alerts.push(`${i.type} insurance EXPIRED`);
            else if (days <= LAPSE_WINDOW_DAYS) alerts.push(`${i.type} insurance lapses in ${days}d`);
          }
        }
        if ((c.riskScore ?? 0) >= 60) alerts.push(`High fraud/double-broker risk (${c.riskScore})`);
        return {
          id: c.id,
          legalName: c.legalName,
          dotNumber: c.dotNumber,
          authorityActive: c.authorityActive,
          insuranceValid: valid.length > 0,
          safetyScore: c.safetyScore,
          trustScore: c.trustScore,
          riskScore: c.riskScore,
          lastMonitoredAt: c.lastMonitoredAt,
          alerts,
        };
      }),
    };
  });

  // Refresh a carrier's monitoring posture from FMCSA + fraud model (both stubs).
  app.post("/api/monitoring/carriers/:id/refresh", { preHandler: [app.requirePermission(Permission.MONITORING_VIEW)] }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const carrier = await prisma.carrier.findUnique({ where: { id } });
    if (!carrier) return reply.code(404).send({ error: "carrier_not_found" });

    const ai = getAi();
    const lookup = await runAi(
      AIDecisionKind.CARRIER_LOOKUP,
      { dotNumber: carrier.dotNumber, mcNumber: carrier.mcNumber },
      () => ai.carrierLookup({ dotNumber: carrier.dotNumber ?? undefined, mcNumber: carrier.mcNumber ?? undefined })
    );
    const fraud = await runAi(
      AIDecisionKind.FRAUD_RISK,
      { subjectId: carrier.id, context: "carrier_onboarding" },
      () => ai.fraudRisk({ context: "carrier_onboarding", subjectId: carrier.id })
    );

    const updated = await prisma.carrier.update({
      where: { id },
      data: {
        authorityActive: lookup.result.authorityActive,
        safetyScore: lookup.result.safetyScore ?? carrier.safetyScore,
        riskScore: fraud.result.riskScore,
        lastMonitoredAt: new Date(),
      },
    });
    return {
      carrierId: updated.id,
      authorityActive: updated.authorityActive,
      safetyScore: updated.safetyScore,
      riskScore: updated.riskScore,
      fraudFlags: fraud.result.flags,
    };
  });
}
