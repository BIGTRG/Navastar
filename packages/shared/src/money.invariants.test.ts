// P2 — money invariants (property-style). splitRate and fee math must never
// leak cents, go negative, or exceed the customer rate.
import { describe, it, expect } from "vitest";
import { splitRate } from "./money.js";

const RATES = [0, 1, 99, 100, 12345, 100000, 999999, 250000, 3333333];
const BPS = [0, 1, 250, 1500, 2200, 5000, 9999, 10000];

describe("splitRate invariants", () => {
  it("margin + payout always equals the customer rate exactly (no lost cents)", () => {
    for (const rate of RATES) for (const bps of BPS) {
      const s = splitRate(rate, bps);
      expect(s.marginCents + s.payoutCents).toBe(rate);
    }
  });

  it("margin and payout are never negative and never exceed the rate", () => {
    for (const rate of RATES) for (const bps of BPS) {
      const s = splitRate(rate, bps);
      expect(s.marginCents).toBeGreaterThanOrEqual(0);
      expect(s.payoutCents).toBeGreaterThanOrEqual(0);
      expect(s.marginCents).toBeLessThanOrEqual(rate);
      expect(s.payoutCents).toBeLessThanOrEqual(rate);
    }
  });

  it("higher margin bps never decreases the margin (monotonic)", () => {
    for (const rate of RATES) {
      let prev = -1;
      for (const bps of [...BPS].sort((a, b) => a - b)) {
        const m = splitRate(rate, bps).marginCents;
        expect(m).toBeGreaterThanOrEqual(prev);
        prev = m;
      }
    }
  });

  it("0 bps -> all payout; 10000 bps -> all margin", () => {
    for (const rate of RATES) {
      expect(splitRate(rate, 0).payoutCents).toBe(rate);
      expect(splitRate(rate, 10000).marginCents).toBe(rate);
    }
  });
});
