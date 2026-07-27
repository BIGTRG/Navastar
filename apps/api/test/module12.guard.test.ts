// Module 12 — trust / insurance / monitoring guards (no DB).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/server.js";

let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe("Module 12 — trust/insurance/monitoring guards", () => {
  const cases: Array<[string, string, object | undefined]> = [
    ["POST", "/api/ratings", { subjectType: "carrier", subjectId: "x", stars: 5 }],
    ["POST", "/api/carriers/x/insurance", { provider: "P" }],
    ["POST", "/api/claims", { shipmentId: "x", description: "d" }],
    ["GET", "/api/claims", undefined],
    ["GET", "/api/monitoring/carriers", undefined],
    ["POST", "/api/monitoring/carriers/x/refresh", undefined],
  ];
  for (const [method, url, payload] of cases) {
    it(`${method} ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: method as "GET" | "POST", url, payload });
      expect(res.statusCode).toBe(401);
    });
  }
});
