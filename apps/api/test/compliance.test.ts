// Module 11 — commodity rules engine (pure) + endpoint guards.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CommodityType } from "@navastar/db";
import { evaluateRules } from "../src/lib/compliance.js";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/server.js";

const base = {
  profile: null,
  cargo: [{ vin: "1HGCM82633A004352", valueCents: 1_000_000 }],
  hasEnclosedAsset: false,
  status: "BOOKED",
};

describe("evaluateRules", () => {
  it("passes for an enabled vehicle with a VIN", () => {
    const r = evaluateRules({ commodity: { type: CommodityType.VEHICLE, enabled: true }, ...base });
    expect(r.ok).toBe(true);
    expect(r.violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("errors when the commodity is disabled (e.g. Live Animals OFF)", () => {
    const r = evaluateRules({ commodity: { type: CommodityType.LIVE_ANIMALS, enabled: false }, ...base });
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.rule === "commodity_enabled" && v.severity === "error")).toBe(true);
  });

  it("warns on enclosed requirement without an enclosed asset", () => {
    const r = evaluateRules({
      commodity: { type: CommodityType.HIGH_VALUE, enabled: true },
      profile: { requiresEnclosed: true, requiresLiftgate: false, hazmat: false, liveCargo: false },
      cargo: [{ vin: "X", valueCents: 9_000_000 }],
      hasEnclosedAsset: false,
      status: "ASSIGNED",
    });
    expect(r.violations.some((v) => v.rule === "enclosed_required")).toBe(true);
    expect(r.violations.some((v) => v.rule === "high_value_handling")).toBe(true);
    expect(r.ok).toBe(true); // warnings don't block
  });

  it("flags a missing VIN as info for vehicles", () => {
    const r = evaluateRules({ commodity: { type: CommodityType.VEHICLE, enabled: true }, ...base, cargo: [{ vin: null, valueCents: 100 }] });
    expect(r.violations.some((v) => v.rule === "vin_present" && v.severity === "info")).toBe(true);
  });
});

describe("Module 11 — compliance guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  for (const url of ["/api/compliance/rules", "/api/compliance/shipments/x/check", "/api/custody/shipments/x/verify", "/api/custody/shipments/x/export"]) {
    it(`GET ${url} without a token → 401`, async () => {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    });
  }
});
