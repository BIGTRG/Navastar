// Module 2 — tracking endpoint guards (no DB). Confirms RBAC on ingest/simulate.
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

describe("Module 2 — tracking guards", () => {
  it("POST /api/shipments/:id/tracking without a token → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/shipments/x/tracking",
      payload: { lat: 1, lng: 2 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/shipments/:id/simulate without a token → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/shipments/x/simulate", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/shipments/:id/track without a token → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/shipments/x/track" });
    expect(res.statusCode).toBe(401);
  });
});
