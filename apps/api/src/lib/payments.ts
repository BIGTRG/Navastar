// Module 9 — Payments, settlement & escrow. Money model:
//  - Fee collected UP FRONT at booking; escrow opens FEE_COLLECTED → FUNDS_HELD.
//  - Digital-BOL / POD sign-off = release event → BOL_SIGNED → RELEASED, and a
//    driver/carrier PAYOUT is created.
//  - Standard payout is WEEKLY & FREE. Quick-pay (instant, same-day) is opt-in and
//    charges a fee — for BOTH outside carriers AND our own drivers (a revenue
//    stream). Escrow/assurance fee applies on booking (configurable).
// The EscrowConnector (stub now, real vendor via env) drives the state machine.
import {
  prisma,
  EscrowState,
  PaymentDirection,
  PaymentMethod,
  PaymentStatus,
} from "@navastar/db";
import { splitRate } from "@navastar/shared";
import { getEscrowConnector, getPaymentProcessor } from "@navastar/providers";
import { bus } from "../events.js";
import { revenueConfig, feeOf } from "./revenue.js";

/** Collect the up-front fee and open+fund escrow for a freshly booked shipment. */
export async function initEscrowForShipment(shipmentId: string) {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { escrow: true } });
  if (!shipment || shipment.escrow) return; // idempotent
  if (shipment.quotedPriceCents == null || shipment.marginBps == null) return;

  const cfg = await revenueConfig();
  const price = shipment.quotedPriceCents;
  const assuranceFee = feeOf(price, cfg.escrowFeeBps);
  const heldCents = splitRate(price, shipment.marginBps).payoutCents;

  const escrowConn = getEscrowConnector();
  const opened = await escrowConn.open({ shipmentId, feeCents: assuranceFee, holdCents: heldCents });
  const funded = await escrowConn.fund(opened.externalRef);

  // Charge the customer via the payment processor (idempotent per shipment).
  const charge = await getPaymentProcessor().charge({
    amountCents: price,
    method: "CARD",
    memo: "booking_fee_up_front",
    idempotencyKey: `charge:${shipmentId}`,
  });

  await prisma.$transaction(async (tx) => {
    // Inbound customer payment — fee captured up front at booking.
    await tx.payment.create({
      data: {
        shipmentId,
        direction: PaymentDirection.INBOUND,
        method: PaymentMethod.CARD,
        status: PaymentStatus.CAPTURED,
        amountCents: price,
        feeCents: assuranceFee,
        memo: "booking_fee_up_front",
        externalRef: charge.externalRef,
        idempotencyKey: `charge:${shipmentId}`,
      },
    });
    await tx.escrowTransaction.create({
      data: {
        shipmentId,
        state: funded.state, // FUNDS_HELD
        provider: escrowConn.name,
        feeCents: assuranceFee,
        heldCents,
        externalRef: opened.externalRef,
      },
    });
  });
}

/** POD/BOL sign-off → release escrow and create the (weekly-free) payout.
 *  actorId / actorType are recorded on the EscrowTransaction for audit.
 */
export async function releaseEscrowForShipment(
  shipmentId: string,
  actor?: { actorId?: string | null; actorType?: string }
) {
  const escrow = await prisma.escrowTransaction.findUnique({ where: { shipmentId } });
  if (!escrow || escrow.state !== EscrowState.FUNDS_HELD) return;

  const escrowConn = getEscrowConnector();
  await escrowConn.signBol(escrow.externalRef!);
  const released = await escrowConn.release(escrow.externalRef!);

  const leg = await prisma.leg.findFirst({
    where: { shipmentId, payoutCents: { not: null } },
    orderBy: { sequence: "desc" },
  });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.escrowTransaction.update({
      where: { shipmentId },
      data: {
        state: released.state,
        releasedCents: escrow.heldCents,
        // Persist actor + timestamp for the state transition audit.
        lastActorId: actor?.actorId ?? null,
        lastActorType: actor?.actorType ?? "system",
        lastTransitionAt: now,
      },
    });
    if (leg?.payoutCents != null) {
      // Standard payout: PENDING, settled free on the weekly run.
      await tx.payment.create({
        data: {
          shipmentId,
          direction: PaymentDirection.PAYOUT,
          method: PaymentMethod.ACH,
          status: PaymentStatus.PENDING,
          amountCents: leg.payoutCents,
          driverId: leg.driverId,
          carrierId: leg.carrierId,
          memo: "carrier_payout_weekly",
          idempotencyKey: `payout:${shipmentId}`,
        },
      });
    }
  });

  bus.emitEvent({
    topic: "escrow.released",
    payload: { shipmentId, releasedCents: escrow.heldCents },
    id: `${shipmentId}:escrow-released`,
    at: new Date().toISOString(),
  });
}

/** Opt a PENDING payout into instant pay: charge the quick-pay fee, settle now. */
export async function quickPay(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.direction !== PaymentDirection.PAYOUT) {
    throw Object.assign(new Error("not_a_payout"), { statusCode: 409 });
  }
  if (payment.status !== PaymentStatus.PENDING) {
    throw Object.assign(new Error("payout_not_pending"), { statusCode: 409 });
  }
  const cfg = await revenueConfig();
  const fee = feeOf(payment.amountCents, cfg.quickPayFeeBps);
  const netCents = payment.amountCents - fee;

  // Instant payout through the processor (idempotent per payment).
  // Uses Stripe instant payout method (same-day) if the processor supports it.
  const po = await getPaymentProcessor().payout({
    amountCents: netCents,
    memo: "carrier_payout_quickpay",
    idempotencyKey: `payout-instant:${paymentId}`,
    instant: true, // Stripe: method='instant', requires debit card on file
  });

  // Log the quick-pay fee as a separate inbound revenue record.
  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: paymentId },
      data: {
        method: PaymentMethod.QUICK_PAY,
        quickPay: true,
        feeCents: fee,
        status: PaymentStatus.SETTLED,
        settledAt: new Date(),
        memo: "carrier_payout_quickpay",
        externalRef: po.externalRef,
      },
    });
    // Record the fee as Navastar revenue (INBOUND, same shipment).
    if (fee > 0) {
      await tx.payment.create({
        data: {
          shipmentId: payment.shipmentId,
          direction: PaymentDirection.INBOUND,
          method: PaymentMethod.QUICK_PAY,
          status: PaymentStatus.CAPTURED,
          amountCents: fee,
          feeCents: 0,
          memo: "quick_pay_fee_revenue",
          idempotencyKey: `qp-fee:${paymentId}`,
        },
      });
    }
    return p;
  });

  // Mark escrow PAID (best-effort; escrow may already be RELEASED).
  const escrow = await prisma.escrowTransaction.findUnique({ where: { shipmentId: payment.shipmentId } });
  if (escrow?.externalRef && escrow.state === EscrowState.RELEASED) {
    try {
      const paid = await getEscrowConnector().markPaid(escrow.externalRef);
      await prisma.escrowTransaction.update({
        where: { shipmentId: payment.shipmentId },
        data: {
          state: paid.state,
          lastActorType: "system",
          lastTransitionAt: new Date(),
        },
      });
    } catch {
      /* escrow already advanced */
    }
  }

  bus.emitEvent({
    topic: "payment.quickpay_settled",
    payload: { paymentId: updated.id, shipmentId: payment.shipmentId, feeCents: fee, netCents, externalRef: po.externalRef },
    id: `${paymentId}:quickpay`,
    at: new Date().toISOString(),
  });

  return { paymentId: updated.id, feeCents: fee, netCents, settledAt: updated.settledAt };
}

/**
 * Quick-pay by shipmentId: finds the latest PENDING PAYOUT for the shipment
 * and triggers instant pay. Used by the POST /api/payments/quick-pay/:shipmentId route.
 */
export async function quickPayForShipment(shipmentId: string, requestorUserId?: string) {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw Object.assign(new Error("shipment_not_found"), { statusCode: 404 });

  // Find the most recent pending PAYOUT for this shipment.
  const payment = await prisma.payment.findFirst({
    where: { shipmentId, direction: PaymentDirection.PAYOUT, status: PaymentStatus.PENDING },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) throw Object.assign(new Error("no_pending_payout"), { statusCode: 409 });

  // Ownership check: only the payout owner (or an ops user with no driver/carrier)
  // may trigger quick-pay via this route. Callers should enforce permissions first.
  if (requestorUserId) {
    const driver = await prisma.driver.findUnique({ where: { userId: requestorUserId } });
    const carrier = await prisma.carrier.findFirst({ where: { ownerUserId: requestorUserId } });
    const owns =
      (!driver && !carrier) || // ops user — allowed
      (payment.driverId && payment.driverId === driver?.id) ||
      (payment.carrierId && payment.carrierId === carrier?.id);
    if (!owns) throw Object.assign(new Error("not_your_payout"), { statusCode: 403 });
  }

  return quickPay(payment.id);
}

/** The free weekly settlement run: settle all PENDING (non-quick-pay) payouts. */
export async function settleWeekly() {
  const pending = await prisma.payment.findMany({
    where: { direction: PaymentDirection.PAYOUT, status: PaymentStatus.PENDING, quickPay: false },
  });
  const processor = getPaymentProcessor();
  let settled = 0;
  for (const p of pending) {
    const po = await processor.payout({ amountCents: p.amountCents, memo: "carrier_payout_weekly", idempotencyKey: `payout-weekly:${p.id}` });
    await prisma.payment.update({ where: { id: p.id }, data: { status: PaymentStatus.SETTLED, settledAt: new Date(), externalRef: po.externalRef } });
    const escrow = await prisma.escrowTransaction.findUnique({ where: { shipmentId: p.shipmentId } });
    if (escrow?.externalRef && escrow.state === EscrowState.RELEASED) {
      try {
        const paid = await getEscrowConnector().markPaid(escrow.externalRef);
        await prisma.escrowTransaction.update({
          where: { shipmentId: p.shipmentId },
          data: {
            state: paid.state,
            lastActorType: "system",
            lastTransitionAt: new Date(),
          },
        });
      } catch {
        /* ignore */
      }
    }
    settled++;
  }
  return { settled };
}

let wired = false;
/** Subscribe payment side-effects to booking + POD events (idempotent). */
export function initPayments() {
  if (wired) return;
  wired = true;
  bus.on("shipment.booked", (e: { payload: Record<string, unknown> }) => {
    void initEscrowForShipment(e.payload.shipmentId as string).catch((err) =>
      console.error("[payments] initEscrow error:", err)
    );
  });
  bus.on("pod.signed", (e: { payload: Record<string, unknown> }) => {
    const actor = {
      actorId: e.payload.approvedByUserId as string | undefined ?? null,
      actorType: e.payload.dispatcherApproved ? "user" : (e.payload.autoApproved ? "ai" : "system"),
    };
    void releaseEscrowForShipment(e.payload.shipmentId as string, actor).catch((err) =>
      console.error("[payments] releaseEscrow error:", err)
    );
  });
}
