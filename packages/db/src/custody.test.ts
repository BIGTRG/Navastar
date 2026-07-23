import { describe, it, expect } from "vitest";
import { custodyHash, canonicalJson, GENESIS_HASH } from "./index.js";

describe("custody hash-chain (pure)", () => {
  it("canonicalJson is key-order independent", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("hash is deterministic for the same prevHash + payload", () => {
    const h1 = custodyHash(GENESIS_HASH, { type: "CREATED", n: 1 });
    const h2 = custodyHash(GENESIS_HASH, { n: 1, type: "CREATED" });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changing the payload changes the hash (tamper-evident)", () => {
    const a = custodyHash(GENESIS_HASH, { odometer: 84213 });
    const b = custodyHash(GENESIS_HASH, { odometer: 99999 });
    expect(a).not.toBe(b);
  });

  it("chains: each link depends on the previous hash", () => {
    const h0 = custodyHash(GENESIS_HASH, { seq: 0 });
    const h1 = custodyHash(h0, { seq: 1 });
    // recomputing link 1 from the WRONG prev breaks it
    const tampered = custodyHash(GENESIS_HASH, { seq: 1 });
    expect(h1).not.toBe(tampered);
  });
});
