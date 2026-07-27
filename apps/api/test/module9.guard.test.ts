// Module 9 — payments endpoint guards (no DB).
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

describe("Module 9 — payments guards", () => {
  const cases: Array<[string, string, object | undefined]> = [
    ["GET", "/api/payments/shipments/x", undefined],
    ["POST", "/api/payments/shipments/x/init-escrow", undefined],
    ["GET", "/api/payments/my-payouts", undefined],
    ["POST", "/api/payments/x/quickpay", undefined],
    ["POST", "/api/payments/settle-weekly", undefined],
  ];
  for (const [method, url, payload] of cases) {
    it(`${method} ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: method as "GET" | "POST", url, payload });
      expect(res.statusCode).toBe(401);
    });
  }
});
