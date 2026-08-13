// Module 9 — Payments API. Ops views a shipment's money + escrow state; drivers/
// carriers see ONLY their own payouts (never margin or the customer charge) and
// can opt a pending payout into instant quick-pay for a fee; admin runs the free
// weekly settlement. Booking auto-collects the fee + opens escrow via events, but
// an explicit init-escrow endpoint is provided for demoing pre-booked shipments.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idParams, idSchema } from "../lib/validation.js";
import { prisma, PaymentDirection } from "@navastar/db";
import { Permission } from "@navastar/shared";
import { initEscrowForShipment, quickPay, quickPayForShipment, settleWeekly } from "../lib/payments.js";

export default async function paymentRoutes(app: FastifyInstance) {
  // Ops: full money view for a shipment (inbound charge, payouts, escrow state).
  app.get(
    "/api/payments/shipments/:id",
    { preHandler: [app.requirePermission(Permission.PAYMENTS_VIEW)] },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
      const [payments, escrow] = await Promise.all([
        prisma.payment.findMany({ where: { shipmentId: shipment.id }, orderBy: { createdAt: "asc" } }),
        prisma.escrowTransaction.findUnique({ where: { shipmentId: shipment.id } }),
      ]);
      return {
        payments: payments.map((p) => ({
          id: p.id,
          direction: p.direction,
          method: p.method,
          status: p.status,
          amountCents: p.amountCents,
          feeCents: p.feeCents,
          quickPay: p.quickPay,
          memo: p.memo,
          settledAt: p.settledAt,
        })),
        escrow: escrow
          ? { state: escrow.state, feeCents: escrow.feeCents, heldCents: escrow.heldCents, releasedCents: escrow.releasedCents }
          : null,
      };
    }
  );

  // Manually collect fee + open escrow (booking normally does this via events).
  app.post(
    "/api/payments/shipments/:id/init-escrow",
    { preHandler: [app.requirePermission(Permission.PAYMENTS_VIEW)] },
    async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const shipment = await prisma.shipment.findFirst({ where: { OR: [{ id }, { trackingId: id }] } });
      if (!shipment) return reply.code(404).send({ error: "shipment_not_found" });
      await initEscrowForShipment(shipment.id);
      const escrow = await prisma.escrowTransaction.findUnique({ where: { shipmentId: shipment.id } });
      return { shipmentId: shipment.id, escrow: escrow ? { state: escrow.state } : null };
    }
  );

  // Driver/carrier: my payouts only. Never exposes margin or customer charges.
  app.get(
    "/api/payments/my-payouts",
    { preHandler: [app.requirePermission(Permission.PAYOUT_VIEW_OWN)] },
    async (req) => {
      const userId = req.principal?.userId;
      const driver = userId ? await prisma.driver.findUnique({ where: { userId } }) : null;
      const carrier = userId ? await prisma.carrier.findFirst({ where: { ownerUserId: userId } }) : null;
      const orFilters = [];
      if (driver) orFilters.push({ driverId: driver.id });
      if (carrier) orFilters.push({ carrierId: carrier.id });
      const payouts = orFilters.length
        ? await prisma.payment.findMany({
            where: { direction: PaymentDirection.PAYOUT, OR: orFilters },
            include: { shipment: { select: { trackingId: true } } },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : [];
      return {
        payouts: payouts.map((p) => ({
          id: p.id,
          trackingId: p.shipment?.trackingId ?? null,
          grossCents: p.amountCents, // the driver's pay (already margin-free)
          feeCents: p.feeCents,
          netCents: p.amountCents - p.feeCents,
          method: p.method,
          status: p.status,
          quickPay: p.quickPay,
          settledAt: p.settledAt,
        })),
      };
    }
  );

  // Opt a pending payout into instant quick-pay (fee applies; both drivers + carriers).
  app.post(
    "/api/payments/:paymentId/quickpay",
    { preHandler: [app.requirePermission(Permission.PAYOUT_VIEW_OWN)] },
    async (req, reply) => {
      const { paymentId } = z.object({ paymentId: idSchema }).parse(req.params);
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      if (!payment) return reply.code(404).send({ error: "payment_not_found" });

      // Ownership: the payout must belong to the caller's driver or carrier.
      const userId = req.principal?.userId;
      const driver = userId ? await prisma.driver.findUnique({ where: { userId } }) : null;
      const carrier = userId ? await prisma.carrier.findFirst({ where: { ownerUserId: userId } }) : null;
      const owns = (payment.driverId && payment.driverId === driver?.id) || (payment.carrierId && payment.carrierId === carrier?.id);
      if (!owns) return reply.code(403).send({ error: "not_your_payout" });

      try {
        const res = await quickPay(paymentId);
        return res;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 500;
        return reply.code(status).send({ error: (e as Error).message });
      }
    }
  );

  // Driver/carrier or ops: instant quick-pay for a shipment's pending payout.
  // Fee is configurable (quickPayFeeBps in RevenueConfig, default 150bps = 1.5%).
  // Available to both outside carriers AND internal drivers.
  app.post(
    "/api/payments/quick-pay/:shipmentId",
    { preHandler: [app.requirePermission(Permission.PAYOUT_VIEW_OWN)] },
    async (req, reply) => {
      const { shipmentId } = z.object({ shipmentId: idSchema }).parse(req.params);
      const userId = req.principal?.userId;
      try {
        const res = await quickPayForShipment(shipmentId, userId);
        return res;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 500;
        return reply.code(status).send({ error: (e as Error).message });
      }
    }
  );

  // Admin: run the free weekly settlement for all pending standard payouts.
  app.post(
    "/api/payments/settle-weekly",
    { preHandler: [app.requirePermission(Permission.PAYMENTS_SETTLE)] },
    async () => {
      return settleWeekly();
    }
  );
}
