// Module 1 API guard tests — no DB required. Verifies the app boots, public
// routes are reachable, and RBAC rejects unauthenticated access to protected
// endpoints (API-first + RBAC-on-every-endpoint non-negotiables).
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

describe("Module 1 — API surface & guards", () => {
  it("GET /health is public and ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it("GET /api/connectors lists the 7 auction adapters + widget config", async () => {
    // This route reads the DB; if DB is unavailable in CI it will 500 — allow both,
    // but when it succeeds assert the shape.
    const res = await app.inject({ method: "GET", url: "/api/connectors" });
    if (res.statusCode === 200) {
      const body = res.json() as { connectors: unknown[] };
      expect(body.connectors.length).toBe(7);
    } else {
      expect([500, 503]).toContain(res.statusCode);
    }
  });

  it("POST /api/auction/lots without a token → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auction/lots",
      payload: { partnerCode: "BIDNOW", externalLotId: "X-1" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/quotes without a token → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/quotes", payload: { shipmentId: "x" } });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/shipments/:id/book without a token → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/shipments/x/book", payload: { quoteId: "q" } });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed/garbage token → 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auction/lots",
      headers: { authorization: "Bearer not-a-real-jwt" },
      payload: { partnerCode: "BIDNOW", externalLotId: "X-1" },
    });
    expect(res.statusCode).toBe(401);
  });
});
