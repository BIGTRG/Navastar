// Module 15 — deeper AI: composite provider routing (no DB) + endpoint guards.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { CompositeAIProvider, RavinInspectionProvider, StubAIProvider } from "@navastar/shared";
import { buildApp } from "../src/server.js";

describe("CompositeAIProvider", () => {
  it("routes inspection to the override provider, pricing to the base", async () => {
    const base = new StubAIProvider();
    const composite = new CompositeAIProvider(base, { inspection: new RavinInspectionProvider("") });
    const insp = await composite.aiInspection({ shipmentId: "s1", imageKeys: [] });
    expect(insp.model).toBe("ravin-ai");
    const price = await composite.aiPricing({ commodity: "VEHICLE", distanceMiles: 100 });
    expect(price.model).toBe("navastar-stub");
  });
});

describe("Module 15 — AI endpoint guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  it("POST /api/ai/support without a token → 401", async () => {
    expect((await app.inject({ method: "POST", url: "/api/ai/support", payload: { question: "hi" } })).statusCode).toBe(401);
  });
  it("GET /api/ai/forecast without a token → 401", async () => {
    expect((await app.inject({ method: "GET", url: "/api/ai/forecast" })).statusCode).toBe(401);
  });
  it("POST /api/ai/fraud-check without a token → 401", async () => {
    expect((await app.inject({ method: "POST", url: "/api/ai/fraud-check", payload: { subjectId: "x" } })).statusCode).toBe(401);
  });
});
