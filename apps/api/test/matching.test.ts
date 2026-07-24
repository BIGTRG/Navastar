// Module 6 — matching engine unit tests (pure scoring, no DB) + endpoint guards.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { compositeScore } from "../src/lib/matching.js";
import { buildApp } from "../src/server.js";

describe("compositeScore", () => {
  it("is 0 for all-zero factors and 1 for all-one factors", () => {
    expect(compositeScore({ capability: 0, proximity: 0, economics: 0, trust: 0 })).toBe(0);
    expect(compositeScore({ capability: 1, proximity: 1, economics: 1, trust: 1 })).toBeCloseTo(1, 6);
  });

  it("rewards a closer, more-trusted driver over a distant one", () => {
    const near = compositeScore({ capability: 1, proximity: 0.9, economics: 0.8, trust: 0.9 });
    const far = compositeScore({ capability: 1, proximity: 0.1, economics: 0.3, trust: 0.5 });
    expect(near).toBeGreaterThan(far);
  });

  it("an ineligible (capability 0) candidate scores below an eligible one, all else equal", () => {
    const eligible = compositeScore({ capability: 1, proximity: 0.5, economics: 0.5, trust: 0.5 });
    const ineligible = compositeScore({ capability: 0, proximity: 0.5, economics: 0.5, trust: 0.5 });
    expect(eligible).toBeGreaterThan(ineligible);
  });
});

describe("Module 6 — dispatch guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /api/dispatch/queue without a token → 401", async () => {
    expect((await app.inject({ method: "GET", url: "/api/dispatch/queue" })).statusCode).toBe(401);
  });
  it("POST /api/dispatch/shipments/:id/match without a token → 401", async () => {
    expect((await app.inject({ method: "POST", url: "/api/dispatch/shipments/x/match" })).statusCode).toBe(401);
  });
  it("POST /api/dispatch/shipments/:id/assign without a token → 401", async () => {
    expect((await app.inject({ method: "POST", url: "/api/dispatch/shipments/x/assign", payload: {} })).statusCode).toBe(401);
  });
});
