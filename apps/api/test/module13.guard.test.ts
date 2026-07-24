// Module 13 — revenue admin guards (no DB). REVENUE_CONFIG (admin) only.
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

describe("Module 13 — revenue admin guards", () => {
  const cases: Array<[string, string, object | undefined]> = [
    ["GET", "/api/admin/revenue/config", undefined],
    ["PATCH", "/api/admin/revenue/config", { quickPayFeeBps: 200 }],
    ["PATCH", "/api/admin/commodities/LIVE_ANIMALS", { enabled: true }],
    ["GET", "/api/admin/revenue/dashboard", undefined],
  ];
  for (const [method, url, payload] of cases) {
    it(`${method} ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: method as "GET" | "PATCH", url, payload });
      expect(res.statusCode).toBe(401);
    });
  }
});
