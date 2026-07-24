// Module 5 — QA endpoint guards (no DB). QA console is qa_reviewer/admin gated.
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

describe("Module 5 — QA guards", () => {
  for (const url of ["/api/qa/queue", "/api/qa/reliability", "/api/qa/inspections/x"]) {
    it(`GET ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    });
  }

  it("POST /api/qa/inspections/:id/decision without a token → 401", async () => {
    const res = await app.inject({ method: "POST", url: "/api/qa/inspections/x/decision", payload: { status: "pass" } });
    expect(res.statusCode).toBe(401);
  });
});
