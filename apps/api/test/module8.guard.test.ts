// Module 8 — onboarding endpoint guards (no DB).
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

describe("Module 8 — onboarding guards", () => {
  const cases: Array<[string, string, object | undefined]> = [
    ["POST", "/api/onboarding/carrier/lookup", { dotNumber: "1" }],
    ["POST", "/api/onboarding/carrier", { legalName: "X" }],
    ["POST", "/api/onboarding/driver", { name: "X", type: "INDEPENDENT" }],
    ["GET", "/api/onboarding/status", undefined],
    ["GET", "/api/onboarding/pending", undefined],
    ["POST", "/api/onboarding/carrier/x/verify", {}],
    ["POST", "/api/onboarding/driver/x/verify", {}],
  ];
  for (const [method, url, payload] of cases) {
    it(`${method} ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: method as "GET" | "POST", url, payload });
      expect(res.statusCode).toBe(401);
    });
  }
});
