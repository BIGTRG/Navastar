// Module 4 — ops endpoint guards (no DB). Ops is dispatcher/admin gated.
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

describe("Module 4 — ops guards", () => {
  for (const url of ["/api/ops/kpis", "/api/ops/shipments", "/api/ops/drivers", "/api/ops/exceptions"]) {
    it(`GET ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    });
  }

  it("POST /api/ops/drivers/:id/roam without a token → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/ops/drivers/x/roam" });
    expect(res.statusCode).toBe(401);
  });
});
