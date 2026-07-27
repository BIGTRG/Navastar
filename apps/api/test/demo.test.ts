// P0 #4 — demo simulators must be off in production.
import { describe, it, expect, afterEach } from "vitest";
import { demoEnabled } from "../src/lib/demo.js";

const orig = { NODE_ENV: process.env.NODE_ENV, ENABLE_DEMO: process.env.ENABLE_DEMO };
afterEach(() => {
  process.env.NODE_ENV = orig.NODE_ENV;
  process.env.ENABLE_DEMO = orig.ENABLE_DEMO;
});

describe("demoEnabled", () => {
  it("is OFF in production by default", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_DEMO;
    expect(demoEnabled()).toBe(false);
  });
  it("can be explicitly opted in with ENABLE_DEMO=true", () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_DEMO = "true";
    expect(demoEnabled()).toBe(true);
  });
  it("is ON outside production (dev/test)", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ENABLE_DEMO;
    expect(demoEnabled()).toBe(true);
  });
});
