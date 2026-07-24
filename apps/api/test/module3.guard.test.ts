// Module 3 — driver/media endpoint guards (no DB). RBAC on every endpoint.
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

describe("Module 3 — driver/media guards", () => {
  const cases: Array<[string, string, object | undefined]> = [
    ["GET", "/api/driver/jobs", undefined],
    ["POST", "/api/uploads/presign", { kind: "POD", filename: "a.jpg", mimeType: "image/jpeg" }],
    ["POST", "/api/shipments/x/inspections", { type: "PICKUP", imageKeys: [] }],
    ["POST", "/api/inspections/x/approve", { findings: [] }],
    ["POST", "/api/shipments/x/ocr", { imageKey: "k", kind: "VIN" }],
    ["POST", "/api/shipments/x/pickup", {}],
    ["POST", "/api/shipments/x/pod", { signerName: "Jane" }],
  ];

  for (const [method, url, payload] of cases) {
    it(`${method} ${url} without a token → 401`, async () => {
      const res = await app.inject({ method: method as "GET" | "POST", url, payload });
      expect(res.statusCode).toBe(401);
    });
  }
});
