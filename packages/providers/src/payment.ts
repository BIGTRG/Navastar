// PaymentProcessor seam (Plan of Correction P1 #6). Charges (customer inbound) and
// payouts (carrier/driver outbound) go through this interface, so a real processor
// (Stripe, Adyen, …) plugs in via PAYMENT_PROVIDER with no changes to the payments
// service. Every call takes an idempotency key so retries never double-move money.
import { loadEnv } from "@navastar/shared";

export type ProcessorStatus = "succeeded" | "pending" | "failed";

export interface ChargeInput {
  amountCents: number;
  currency?: "USD";
  method?: "CARD" | "ACH";
  memo?: string;
  idempotencyKey: string;
}
export interface PayoutInput {
  amountCents: number;
  currency?: "USD";
  memo?: string;
  idempotencyKey: string;
}
export interface ProcessorResult {
  externalRef: string;
  status: ProcessorStatus;
}

export interface PaymentProcessor {
  name: string;
  charge(input: ChargeInput): Promise<ProcessorResult>;
  payout(input: PayoutInput): Promise<ProcessorResult>;
}

/** No-network stub — money moves are simulated, references are deterministic. */
export class StubPaymentProcessor implements PaymentProcessor {
  name = "stub";
  async charge(input: ChargeInput): Promise<ProcessorResult> {
    return { externalRef: `ch_stub_${input.idempotencyKey}`, status: "succeeded" };
  }
  async payout(input: PayoutInput): Promise<ProcessorResult> {
    return { externalRef: `po_stub_${input.idempotencyKey}`, status: "succeeded" };
  }
}

/** Stripe adapter placeholder — wire PaymentIntents/Transfers with the SDK later. */
export class StripePaymentProcessor implements PaymentProcessor {
  name = "stripe";
  constructor(private secretKey: string) {}
  async charge(input: ChargeInput): Promise<ProcessorResult> {
    if (!this.secretKey) throw new Error("STRIPE_SECRET_KEY is required for the stripe payment provider");
    // TODO(prod): stripe.paymentIntents.create({ amount, currency, ... },
    //   { idempotencyKey: input.idempotencyKey })
    throw new Error("Stripe charge not implemented — set PAYMENT_PROVIDER=stub or wire the SDK.");
  }
  async payout(input: PayoutInput): Promise<ProcessorResult> {
    if (!this.secretKey) throw new Error("STRIPE_SECRET_KEY is required for the stripe payment provider");
    // TODO(prod): stripe.transfers.create(..., { idempotencyKey: input.idempotencyKey })
    throw new Error("Stripe payout not implemented — set PAYMENT_PROVIDER=stub or wire the SDK.");
  }
}

let cached: PaymentProcessor | null = null;
export function getPaymentProcessor(): PaymentProcessor {
  if (cached) return cached;
  const env = loadEnv();
  cached = env.PAYMENT_PROVIDER === "stripe" ? new StripePaymentProcessor(env.STRIPE_SECRET_KEY) : new StubPaymentProcessor();
  return cached;
}

export function setPaymentProcessor(p: PaymentProcessor | null): void {
  cached = p;
}
