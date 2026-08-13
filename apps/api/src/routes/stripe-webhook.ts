// Stripe Webhook Handler (Module 9 / Track A4)
//
// Receives and verifies Stripe webhook events, then reconciles payment and
// escrow state in the DB. Stripe requires the raw (unparsed) request body
// for HMAC-SHA256 signature verification.
//
// This plugin is registered WITHOUT fastify-plugin decoration, so its
// addContentTypeParser override is scoped to this encapsulated context only.
// The global JSON parser for all other routes is unaffected.
//
// Handles:
//   payment_intent.succeeded      → mark INBOUND payment CAPTURED
//   payment_intent.payment_failed → mark INBOUND payment FAILED
//   transfer.created              → confirm PAYOUT externalRef (in-transit)
//   payout.paid                   → mark PAYOUT SETTLED, advance escrow to PAID
//   payout.failed                 → mark PAYOUT FAILED
//
// Each handler emits an event to the internal bus for downstream subscribers.
import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { loadEnv } from "@navastar/shared";
import { prisma, PaymentStatus, EscrowState } from "@navastar/db";
import { bus } from "../events.js";

/** Initialize a Stripe client from env. Returns null if key is absent. */
function getStripe(): Stripe | null {
  const env = loadEnv();
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-06-30.basil" as Stripe.LatestApiVersion,
    appInfo: { name: "navastar-logistics-webhook", version: "0.1.0" },
  });
}

export default async function stripeWebhookRoutes(app: FastifyInstance) {
  // Override the application/json content-type parser for this plugin scope only.
  // Since this plugin is NOT wrapped with fastify-plugin, Fastify treats it as
  // an encapsulated child context — the override does NOT leak to other routes.
  // This gives us the raw Buffer Stripe needs for HMAC verification.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body)
  );

  app.post(
    "/api/webhooks/stripe",
    async (req, reply) => {
      const env = loadEnv();

      if (!env.STRIPE_WEBHOOK_SECRET) {
        app.log.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — rejecting");
        return reply.code(400).send({ error: "webhook_not_configured" });
      }

      const stripe = getStripe();
      if (!stripe) {
        return reply.code(400).send({ error: "stripe_not_configured" });
      }

      const sig = req.headers["stripe-signature"] as string | undefined;
      if (!sig) {
        return reply.code(400).send({ error: "missing_stripe_signature" });
      }

      let event: Stripe.Event;
      try {
        // req.body is a Buffer (raw bytes) due to the content-type parser above.
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          sig,
          env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        app.log.warn(
          `[stripe-webhook] Signature verification failed: ${(err as Error).message}`
        );
        return reply.code(400).send({ error: "invalid_signature" });
      }

      app.log.info(`[stripe-webhook] ${event.type} id=${event.id}`);

      try {
        await handleStripeEvent(event);
      } catch (err) {
        // Business logic errors → 200 so Stripe does not retry endlessly.
        app.log.error(
          `[stripe-webhook] Handler error for ${event.type}: ${(err as Error).message}`
        );
        return reply.code(200).send({ received: true, handlerError: (err as Error).message });
      }

      return reply.code(200).send({ received: true });
    }
  );
}

// ── Event dispatcher ─────────────────────────────────────────────────────────

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded":
      await onPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    case "payment_intent.payment_failed":
      await onPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    case "transfer.created":
      await onTransferCreated(event.data.object as Stripe.Transfer);
      break;
    case "payout.paid":
      await onPayoutPaid(event.data.object as Stripe.Payout);
      break;
    case "payout.failed":
      await onPayoutFailed(event.data.object as Stripe.Payout);
      break;
    default:
      // Acknowledged but not processed — safe to ignore.
      break;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * payment_intent.succeeded
 * Customer charge captured successfully.
 * Find the Payment row by externalRef and mark CAPTURED.
 */
async function onPaymentIntentSucceeded(pi: Stripe.PaymentIntent): Promise<void> {
  const payment = await prisma.payment.findFirst({ where: { externalRef: pi.id } });
  if (!payment) return; // Race: may arrive before the row is written; idempotent.

  if (
    payment.status === PaymentStatus.CAPTURED ||
    payment.status === PaymentStatus.SETTLED
  ) {
    return; // Already terminal.
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: PaymentStatus.CAPTURED },
  });

  bus.emitEvent({
    topic: "payment.captured",
    payload: {
      paymentId: payment.id,
      shipmentId: payment.shipmentId,
      amountCents: pi.amount,
      currency: pi.currency,
      stripePaymentIntentId: pi.id,
    },
    id: `stripe:pi_succeeded:${pi.id}`,
    at: new Date().toISOString(),
  });
}

/**
 * payment_intent.payment_failed
 * Customer charge failed (card declined, insufficient funds, etc.).
 * Mark the Payment row FAILED and emit event for ops.
 */
async function onPaymentIntentFailed(pi: Stripe.PaymentIntent): Promise<void> {
  const payment = await prisma.payment.findFirst({ where: { externalRef: pi.id } });
  if (!payment) return;
  if (payment.status === PaymentStatus.FAILED) return;

  const failureMessage =
    pi.last_payment_error?.message ?? pi.last_payment_error?.code ?? "unknown";

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.FAILED,
      memo: `payment_failed: ${failureMessage}`,
    },
  });

  bus.emitEvent({
    topic: "payment.failed",
    payload: {
      paymentId: payment.id,
      shipmentId: payment.shipmentId,
      amountCents: pi.amount,
      reason: failureMessage,
      stripePaymentIntentId: pi.id,
    },
    id: `stripe:pi_failed:${pi.id}`,
    at: new Date().toISOString(),
  });
}

/**
 * transfer.created
 * Stripe Connect transfer to a carrier/driver account created.
 * Confirm the externalRef on the payout row and emit an in-transit event.
 */
async function onTransferCreated(transfer: Stripe.Transfer): Promise<void> {
  const payment = await prisma.payment.findFirst({ where: { externalRef: transfer.id } });
  if (!payment) return;

  // Transfer is in-transit; no status change yet — payout.paid handles settlement.
  bus.emitEvent({
    topic: "payout.transfer_created",
    payload: {
      paymentId: payment.id,
      shipmentId: payment.shipmentId,
      amountCents: transfer.amount,
      destination: transfer.destination as string,
      stripeTransferId: transfer.id,
    },
    id: `stripe:transfer_created:${transfer.id}`,
    at: new Date().toISOString(),
  });
}

/**
 * payout.paid
 * Stripe payout (standard or instant) reached the destination bank.
 * Mark PAYOUT SETTLED; advance escrow to PAID if in RELEASED state.
 */
async function onPayoutPaid(payout: Stripe.Payout): Promise<void> {
  const payment = await prisma.payment.findFirst({ where: { externalRef: payout.id } });
  if (!payment) return;
  if (payment.status === PaymentStatus.SETTLED) return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.SETTLED,
      settledAt: new Date(payout.arrival_date * 1000),
    },
  });

  // Advance escrow to PAID when in RELEASED state.
  const escrow = await prisma.escrowTransaction.findUnique({
    where: { shipmentId: payment.shipmentId },
  });
  if (escrow?.state === EscrowState.RELEASED && escrow.externalRef) {
    const { getEscrowConnector } = await import("@navastar/providers");
    try {
      const paid = await getEscrowConnector().markPaid(escrow.externalRef);
      await prisma.escrowTransaction.update({
        where: { shipmentId: payment.shipmentId },
        data: { state: paid.state },
      });
    } catch {
      // Escrow may already be PAID — safe to ignore.
    }
  }

  bus.emitEvent({
    topic: "payout.settled",
    payload: {
      paymentId: payment.id,
      shipmentId: payment.shipmentId,
      amountCents: payout.amount,
      arrivalDate: payout.arrival_date,
      stripePayoutId: payout.id,
      method: payout.method, // "standard" | "instant"
    },
    id: `stripe:payout_paid:${payout.id}`,
    at: new Date().toISOString(),
  });
}

/**
 * payout.failed
 * Stripe payout rejected by the bank (invalid routing number, closed account, etc.).
 * Mark PAYOUT FAILED and emit event for ops to re-queue or investigate.
 */
async function onPayoutFailed(payout: Stripe.Payout): Promise<void> {
  const payment = await prisma.payment.findFirst({ where: { externalRef: payout.id } });
  if (!payment) return;
  if (payment.status === PaymentStatus.FAILED) return;

  const failureCode = payout.failure_code ?? "unknown";
  const failureMessage = payout.failure_message ?? failureCode;

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: PaymentStatus.FAILED,
      memo: `payout_failed: ${failureMessage}`,
    },
  });

  bus.emitEvent({
    topic: "payout.failed",
    payload: {
      paymentId: payment.id,
      shipmentId: payment.shipmentId,
      amountCents: payout.amount,
      failureCode,
      failureMessage,
      stripePayoutId: payout.id,
    },
    id: `stripe:payout_failed:${payout.id}`,
    at: new Date().toISOString(),
  });
}
