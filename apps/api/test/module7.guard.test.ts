// Module 7 — load board endpoint guards (no DB).
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

describe("Module 7 — load board guards", () => {
  const cases: Array<[string, string, object | undefined]> = [
    ["GET", "/api/loadboard/posts", undefined],
    ["POST", "/api/loadboard/posts", { shipmentId: "x" }],
    ["POST", "/api/loadboard/posts/x/bids", { amountCents: 1000 }],
    ["GET", "/api/loadboard/posts/x/bids", undefined],
    ["POST", "/api/loadboard/bids/x/award", undefined],
    ["POST", "/api/loadboard/subscribe", { tier: "PRO" }],
  ];
  for (const [method, url, payload] of cases) {
    it(`${method} ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: method as "GET" | "POST", url, payload });
      expect(res.statusCode).toBe(401);
    });
  }
});
