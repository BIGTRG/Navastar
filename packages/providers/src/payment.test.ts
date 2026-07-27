import { describe, it, expect } from "vitest";
import { StubPaymentProcessor, StripePaymentProcessor, getPaymentProcessor } from "./payment.js";

describe("PaymentProcessor", () => {
  it("stub charge/payout succeed with deterministic idempotent refs", async () => {
    const p = new StubPaymentProcessor();
    const c = await p.charge({ amountCents: 1000, idempotencyKey: "k1" });
    expect(c.status).toBe("succeeded");
    expect(c.externalRef).toBe("ch_stub_k1");
    const po = await p.payout({ amountCents: 900, idempotencyKey: "k2" });
    expect(po.externalRef).toBe("po_stub_k2");
  });

  it("stripe adapter refuses without a key (fail-safe)", async () => {
    const s = new StripePaymentProcessor("");
    await expect(s.charge({ amountCents: 100, idempotencyKey: "x" })).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });

  it("defaults to the stub processor in tests", () => {
    expect(getPaymentProcessor().name).toBe("stub");
  });
});
