// P0 #5 — login is rate-limited against brute force.
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

describe("login rate limiting", () => {
  it("returns 429 after exceeding the login limit (10/min)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "a@b.co", password: "x" } });
      statuses.push(res.statusCode);
    }
    expect(statuses).toContain(429);
  });
});
