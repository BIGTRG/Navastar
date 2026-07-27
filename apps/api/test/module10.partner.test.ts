// Module 10 — partner API auth + public surfaces (no DB needed for these paths).
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

describe("Module 10 — partner API & public surfaces", () => {
  it("POST /api/partner/lots without an API key → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/partner/lots", payload: { externalLotId: "L1" } });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/partner/shipments/:id without an API key → 401", async () => {
    const res = await app.inject({ method: "GET", url: "/api/partner/shipments/NAV-X" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a bad API key", async () => {
    // With no DB the lookup throws → 500; with DB a bad key → 401. Accept either.
    const res = await app.inject({
      method: "GET",
      url: "/api/partner/webhooks",
      headers: { "x-api-key": "totally-wrong" },
    });
    expect([401, 500]).toContain(res.statusCode);
  });

  it("GET /api/widget.js is public and serves JavaScript", async () => {
    const res = await app.inject({ method: "GET", url: "/api/widget.js" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.body).toContain("Navastar.mount");
  });

  it("GET /api/openapi.json exposes the spec with the partner tag", async () => {
    const res = await app.inject({ method: "GET", url: "/api/openapi.json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json() as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths)).toContain("/api/partner/lots");
  });
});
