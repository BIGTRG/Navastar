// Module 14 — multi-commodity + equipment marketplace guards (no DB).
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

describe("Module 14 — shipping/equipment guards", () => {
  const cases: Array<[string, string, object | undefined]> = [
    ["GET", "/api/handling-profiles", undefined],
    ["POST", "/api/shipments", { commodityType: "BOAT", description: "x", pickup: { lat: 1, lng: 2 }, dropoff: { lat: 3, lng: 4 } }],
    ["POST", "/api/equipment/listings", { title: "T", assetType: "TRAILER", dailyRateCents: 100 }],
    ["GET", "/api/equipment/listings", undefined],
    ["POST", "/api/equipment/listings/x/lease", {}],
    ["GET", "/api/equipment/my-leases", undefined],
  ];
  for (const [method, url, payload] of cases) {
    it(`${method} ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: method as "GET" | "POST", url, payload });
      expect(res.statusCode).toBe(401);
    });
  }
});
