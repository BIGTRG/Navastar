// PaymentProcessor seam (Plan of Correction P1 #6). Charges (customer inbound) and
// payouts (carrier/driver outbound) go through this interface, so a real processor
// (Stripe, Adyen, …) plugs in via PAYMENT_PROVIDER with no changes to the payments
// service. Every call takes an idempotency key so retries never double-move money.
import { loadEnv } from "@navastar/shared";
import Stripe from "stripe";

export type ProcessorStatus = "succeeded" | "pending" | "failed";

export interface ChargeInput {
  amountCents: number;
  currency?: "USD";
  method?: "CARD" | "ACH";
  memo?: string;
  idempotencyKey: string;
  /** Stripe Customer ID for saved payment methods */
  customerId?: string;
  /** Stripe PaymentMethod ID */
  paymentMethodId?: string;
}
export interface PayoutInput {
  amountCents: number;
  currency?: "USD";
  memo?: string;
  idempotencyKey: string;
  /** Stripe Connected Account ID for carrier/driver payouts */
  destination?: string;
  /** Use instant payout method (requires debit card on file) */
  instant?: boolean;
}
export interface RefundInput {
  chargeRef: string;
  amountCents?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  idempotencyKey: string;
}
export interface CustomerInput {
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, string>;
}
export interface ConnectedAccountInput {
  email: string;
  /** "express" recommended for carriers/drivers */
  type?: "express" | "standard" | "custom";
  country?: string;
  metadata?: Record<string, string>;
}
export interface ProcessorResult {
  externalRef: string;
  status: ProcessorStatus;
}
export interface CustomerResult {
  customerId: string;
  email?: string | null;
  name?: string | null;
}
export interface ConnectedAccountResult {
  accountId: string;
  onboardingUrl?: string;
}

export interface PaymentProcessor {
  name: string;
  charge(input: ChargeInput): Promise<ProcessorResult>;
  payout(input: PayoutInput): Promise<ProcessorResult>;
  refund(input: RefundInput): Promise<ProcessorResult>;
  createCustomer(input: CustomerInput): Promise<CustomerResult>;
  createConnectedAccount(input: ConnectedAccountInput): Promise<ConnectedAccountResult>;
}

/** Map a Stripe error code/type to our ProcessorStatus. */
function stripeStatusFromError(err: unknown): ProcessorStatus {
  if (err && typeof err === "object" && "type" in err) {
    const e = err as Stripe.StripeRawError;
    // card declined, insufficient funds, expired, etc. → failed
    if (
      e.type === "card_error" ||
      e.type === "invalid_request_error" ||
      e.code === "insufficient_funds" ||
      e.code === "card_declined"
    ) {
      return "failed";
    }
    // rate limit, API errors → pending (caller should retry)
    if (e.type === "rate_limit_error" || e.type === "api_error") {
      return "pending";
    }
  }
  return "failed";
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
  async refund(input: RefundInput): Promise<ProcessorResult> {
    return { externalRef: `re_stub_${input.idempotencyKey}`, status: "succeeded" };
  }
  async createCustomer(input: CustomerInput): Promise<CustomerResult> {
    return { customerId: `cus_stub_${Date.now()}`, email: input.email, name: input.name };
  }
  async createConnectedAccount(input: ConnectedAccountInput): Promise<ConnectedAccountResult> {
    return { accountId: `acct_stub_${Date.now()}`, onboardingUrl: undefined };
  }
}

/** Stripe adapter — wires PaymentIntents/Transfers/Payouts/Refunds with the SDK. */
export class StripePaymentProcessor implements PaymentProcessor {
  name = "stripe";
  private stripe: Stripe;

  constructor(private secretKey: string) {
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required for the stripe payment provider");
    this.stripe = new Stripe(secretKey, {
      apiVersion: "2025-06-30.basil" as Stripe.LatestApiVersion,
      appInfo: { name: "navastar-logistics", version: "0.1.0" },
    });
  }

  /** Charge a customer via Stripe PaymentIntents (confirm=true for immediate capture). */
  async charge(input: ChargeInput): Promise<ProcessorResult> {
    try {
      const params: Stripe.PaymentIntentCreateParams = {
        amount: input.amountCents,
        currency: (input.currency ?? "USD").toLowerCase(),
        payment_method_types: input.method === "ACH" ? ["us_bank_account"] : ["card"],
        confirm: true,
        metadata: { memo: input.memo ?? "" },
      };
      if (input.customerId) params.customer = input.customerId;
      if (input.paymentMethodId) params.payment_method = input.paymentMethodId;

      const pi = await this.stripe.paymentIntents.create(params, {
        idempotencyKey: input.idempotencyKey,
      });

      const status: ProcessorStatus =
        pi.status === "succeeded"
          ? "succeeded"
          : pi.status === "requires_capture" || pi.status === "processing"
          ? "pending"
          : "failed";

      return { externalRef: pi.id, status };
    } catch (err) {
      const status = stripeStatusFromError(err);
      // Re-throw so callers can inspect; preserve the Stripe error details.
      const msg = err instanceof Error ? err.message : String(err);
      throw Object.assign(new Error(`Stripe charge failed: ${msg}`), { status, cause: err });
    }
  }

  /** Transfer funds to a connected carrier/driver account (Stripe Connect). */
  async payout(input: PayoutInput): Promise<ProcessorResult> {
    try {
      if (input.destination) {
        // Stripe Connect transfer → connected account
        const transfer = await this.stripe.transfers.create(
          {
            amount: input.amountCents,
            currency: (input.currency ?? "USD").toLowerCase(),
            destination: input.destination,
            metadata: { memo: input.memo ?? "" },
          },
          { idempotencyKey: input.idempotencyKey }
        );
        return { externalRef: transfer.id, status: "succeeded" };
      } else if (input.instant) {
        // Instant payout to Navastar's own bank account (same-day, fee applies)
        const payout = await this.stripe.payouts.create(
          {
            amount: input.amountCents,
            currency: (input.currency ?? "USD").toLowerCase(),
            method: "instant",
            metadata: { memo: input.memo ?? "" },
          },
          { idempotencyKey: input.idempotencyKey }
        );
        const status: ProcessorStatus =
          payout.status === "paid"
            ? "succeeded"
            : payout.status === "pending" || payout.status === "in_transit"
            ? "pending"
            : "failed";
        return { externalRef: payout.id, status };
      } else {
        // Standard ACH payout
        const payout = await this.stripe.payouts.create(
          {
            amount: input.amountCents,
            currency: (input.currency ?? "USD").toLowerCase(),
            method: "standard",
            metadata: { memo: input.memo ?? "" },
          },
          { idempotencyKey: input.idempotencyKey }
        );
        const status: ProcessorStatus =
          payout.status === "paid"
            ? "succeeded"
            : payout.status === "pending" || payout.status === "in_transit"
            ? "pending"
            : "failed";
        return { externalRef: payout.id, status };
      }
    } catch (err) {
      const status = stripeStatusFromError(err);
      const msg = err instanceof Error ? err.message : String(err);
      throw Object.assign(new Error(`Stripe payout failed: ${msg}`), { status, cause: err });
    }
  }

  /** Issue a full or partial refund on a PaymentIntent or Charge. */
  async refund(input: RefundInput): Promise<ProcessorResult> {
    try {
      const params: Stripe.RefundCreateParams = {
        payment_intent: input.chargeRef,
        reason: input.reason ?? "requested_by_customer",
        metadata: {},
      };
      if (input.amountCents != null) params.amount = input.amountCents;

      const refund = await this.stripe.refunds.create(params, {
        idempotencyKey: input.idempotencyKey,
      });

      const status: ProcessorStatus =
        refund.status === "succeeded"
          ? "succeeded"
          : refund.status === "pending"
          ? "pending"
          : "failed";

      return { externalRef: refund.id, status };
    } catch (err) {
      const status = stripeStatusFromError(err);
      const msg = err instanceof Error ? err.message : String(err);
      throw Object.assign(new Error(`Stripe refund failed: ${msg}`), { status, cause: err });
    }
  }

  /** Create a Stripe Customer for storing payment methods (cards, ACH mandates). */
  async createCustomer(input: CustomerInput): Promise<CustomerResult> {
    const customer = await this.stripe.customers.create({
      email: input.email,
      name: input.name,
      phone: input.phone,
      metadata: input.metadata ?? {},
    });
    return { customerId: customer.id, email: customer.email, name: customer.name };
  }

  /**
   * Create a Stripe Connect Express account for a carrier or driver.
   * Returns the account ID + an onboarding URL to send them to.
   */
  async createConnectedAccount(input: ConnectedAccountInput): Promise<ConnectedAccountResult> {
    const account = await this.stripe.accounts.create({
      type: input.type ?? "express",
      email: input.email,
      country: input.country ?? "US",
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      metadata: input.metadata ?? {},
    });

    // Generate an onboarding link (expires in 1 hour).
    const link = await this.stripe.accountLinks.create({
      account: account.id,
      refresh_url: "https://navastarlogistics.com/onboarding/refresh",
      return_url: "https://navastarlogistics.com/onboarding/complete",
      type: "account_onboarding",
    });

    return { accountId: account.id, onboardingUrl: link.url };
  }
}

let cached: PaymentProcessor | null = null;
export function getPaymentProcessor(): PaymentProcessor {
  if (cached) return cached;
  const env = loadEnv();
  cached =
    env.PAYMENT_PROVIDER === "stripe"
      ? new StripePaymentProcessor(env.STRIPE_SECRET_KEY)
      : new StubPaymentProcessor();
  return cached;
}

export function setPaymentProcessor(p: PaymentProcessor | null): void {
  cached = p;
}
