// Module 13 — Revenue & Monetization admin backboard. One control panel for all
// SIX revenue streams, every lever DB-backed (no redeploy): (1) margin % per
// commodity, (2) subscription tier prices, (3) quick-pay fee %, (4) load-board
// connection fee, (5) payment/escrow assurance fee %, (6) value-add pricing. Plus
// commodity on/off toggles (Live Animals ships OFF until flipped on). Live
// dashboard: GMV, revenue by stream, MRR, blended take rate.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  prisma,
  CommodityType,
  ShipmentStatus,
  PaymentMethod,
  SubscriptionStatus,
  Prisma,
} from "@navastar/db";
import { Permission, splitRate } from "@navastar/shared";
import { revenueConfig } from "../lib/revenue.js";

const BOOKED_PLUS: ShipmentStatus[] = [
  ShipmentStatus.BOOKED,
  ShipmentStatus.ASSIGNED,
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.DELIVERED,
  ShipmentStatus.COMPLETED,
];

export default async function adminRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.requirePermission(Permission.REVENUE_CONFIG)] };

  // All levers + commodity toggles.
  app.get("/api/admin/revenue/config", guard, async () => {
    const [cfg, commodities] = await Promise.all([
      revenueConfig(),
      prisma.commodity.findMany({ orderBy: { label: "asc" } }),
    ]);
    return {
      config: {
        subFreePriceCents: cfg.subFreePriceCents,
        subProPriceCents: cfg.subProPriceCents,
        subFleetPriceCents: cfg.subFleetPriceCents,
        quickPayFeeBps: cfg.quickPayFeeBps,
        loadBoardConnectionFeeCents: cfg.loadBoardConnectionFeeCents,
        escrowFeeBps: cfg.escrowFeeBps,
        valueAddPricing: cfg.valueAddPricing,
      },
      commodities: commodities.map((c) => ({ type: c.type, label: c.label, enabled: c.enabled, marginBps: c.marginBps })),
    };
  });

  // Update revenue levers (partial).
  app.patch("/api/admin/revenue/config", guard, async (req, reply) => {
    const body = z
      .object({
        subFreePriceCents: z.number().int().min(0).optional(),
        subProPriceCents: z.number().int().min(0).optional(),
        subFleetPriceCents: z.number().int().min(0).optional(),
        quickPayFeeBps: z.number().int().min(0).max(10000).optional(),
        loadBoardConnectionFeeCents: z.number().int().min(0).optional(),
        escrowFeeBps: z.number().int().min(0).max(10000).optional(),
        valueAddPricing: z.record(z.unknown()).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const updated = await prisma.revenueConfig.update({
      where: { id: "revenue" },
      data: { ...body.data, valueAddPricing: body.data.valueAddPricing as Prisma.InputJsonValue | undefined },
    });
    return { ok: true, updatedAt: updated.updatedAt };
  });

  // Toggle a commodity on/off + set its margin. (Live Animals ships OFF by default.)
  app.patch("/api/admin/commodities/:type", guard, async (req, reply) => {
    const { type } = req.params as { type: string };
    if (!(type in CommodityType)) return reply.code(400).send({ error: "bad_commodity" });
    const body = z.object({ enabled: z.boolean().optional(), marginBps: z.number().int().min(0).max(10000).optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "bad_request", issues: body.error.issues });
    const c = await prisma.commodity.update({ where: { type: type as CommodityType }, data: body.data });
    return { type: c.type, enabled: c.enabled, marginBps: c.marginBps };
  });

  // Live revenue dashboard: GMV, revenue by stream, MRR, blended take rate.
  app.get("/api/admin/revenue/dashboard", guard, async () => {
    const [moneyShipments, payments, activeSubs] = await Promise.all([
      prisma.shipment.findMany({
        where: { status: { in: BOOKED_PLUS }, quotedPriceCents: { not: null } },
        select: { quotedPriceCents: true, marginBps: true },
      }),
      prisma.payment.findMany({ select: { method: true, amountCents: true, feeCents: true, memo: true } }),
      prisma.subscription.findMany({ where: { status: SubscriptionStatus.ACTIVE }, select: { priceCents: true } }),
    ]);

    let gmvCents = 0;
    let marginCents = 0;
    for (const s of moneyShipments) {
      const price = s.quotedPriceCents ?? 0;
      gmvCents += price;
      if (s.marginBps != null) marginCents += splitRate(price, s.marginBps).marginCents;
    }

    const quickPayFeeCents = payments.filter((p) => p.method === PaymentMethod.QUICK_PAY).reduce((s, p) => s + p.feeCents, 0);
    const connectionFeeCents = payments.filter((p) => p.memo === "load_board_connection_fee").reduce((s, p) => s + p.amountCents, 0);
    const escrowFeeCents = payments.filter((p) => p.memo === "booking_fee_up_front").reduce((s, p) => s + p.feeCents, 0);
    const mrrCents = activeSubs.reduce((s, x) => s + x.priceCents, 0);

    // Transactional revenue (excludes recurring MRR) for the blended take rate.
    const transactionalRevenueCents = marginCents + quickPayFeeCents + connectionFeeCents + escrowFeeCents;

    return {
      gmvCents,
      streams: {
        margin: marginCents, // (1)
        subscriptionMrr: mrrCents, // (2)
        quickPayFees: quickPayFeeCents, // (3)
        loadBoardConnectionFees: connectionFeeCents, // (4)
        escrowAssuranceFees: escrowFeeCents, // (5)
        valueAdd: 0, // (6) configurable; usage not yet metered
      },
      mrrCents,
      transactionalRevenueCents,
      blendedTakeRateBps: gmvCents > 0 ? Math.round((transactionalRevenueCents / gmvCents) * 10000) : 0,
    };
  });
}
