import { describe, it, expect } from "vitest";
import { splitRate, formatUSD, pctToBps } from "./money.js";

describe("splitRate", () => {
  it("splits a customer rate into margin + payout (margin = rate × marginBps)", () => {
    const s = splitRate(100000, 1500); // $1000 @ 15%
    expect(s.payoutCents).toBe(85000);
    expect(s.marginCents).toBe(15000);
    expect(s.payoutCents + s.marginCents).toBe(s.customerRateCents);
  });

  it("0% margin → driver gets the whole rate", () => {
    const s = splitRate(50000, 0);
    expect(s.payoutCents).toBe(50000);
    expect(s.marginCents).toBe(0);
  });

  it("payout never exceeds the customer rate", () => {
    for (const bps of [0, 500, 1500, 3000, 9000]) {
      const s = splitRate(123456, bps);
      expect(s.payoutCents).toBeLessThanOrEqual(s.customerRateCents);
      expect(s.marginCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("helpers", () => {
  it("formats USD from cents", () => {
    expect(formatUSD(85000)).toBe("$850.00");
  });
  it("converts percent to bps", () => {
    expect(pctToBps(15)).toBe(1500);
  });
});
