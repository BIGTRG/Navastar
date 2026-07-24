// P1 #7 — webhook signature is deterministic, timestamp-bound, and integrity-bound.
import { describe, it, expect } from "vitest";
import { signPayload } from "../src/lib/webhooks.js";

describe("signPayload", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event: "shipment.booked", data: { shipmentId: "s1" } });

  it("is deterministic for the same (secret, timestamp, body)", () => {
    expect(signPayload(secret, 1000, body)).toBe(signPayload(secret, 1000, body));
    expect(signPayload(secret, 1000, body)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("changes with the timestamp (replay resistance)", () => {
    expect(signPayload(secret, 1000, body)).not.toBe(signPayload(secret, 1001, body));
  });

  it("changes with the body (tamper resistance) and the secret", () => {
    expect(signPayload(secret, 1000, body)).not.toBe(signPayload(secret, 1000, body + " "));
    expect(signPayload(secret, 1000, body)).not.toBe(signPayload("other", 1000, body));
  });
});
