// P0 #1 — object-level shipment authorization (pure decision, no DB).
import { describe, it, expect } from "vitest";
import { Role } from "@navastar/db";
import { canAccessShipment } from "../src/lib/access.js";

const ctx = (over: Partial<Parameters<typeof canAccessShipment>[1]> = {}) => ({
  ownerUserId: "u-owner",
  driverUserIds: ["u-driver"],
  carrierOwnerUserIds: ["u-carrier"],
  ...over,
});

describe("canAccessShipment", () => {
  it("allows the owning customer", () => {
    expect(canAccessShipment({ userId: "u-owner", roles: [Role.customer] }, ctx())).toBe(true);
  });

  it("DENIES a different customer (the core P0 bug)", () => {
    expect(canAccessShipment({ userId: "u-other", roles: [Role.customer] }, ctx())).toBe(false);
  });

  it("allows an assigned driver and the owning carrier", () => {
    expect(canAccessShipment({ userId: "u-driver", roles: [Role.employee_driver] }, ctx())).toBe(true);
    expect(canAccessShipment({ userId: "u-carrier", roles: [Role.independent_carrier] }, ctx())).toBe(true);
  });

  it("denies an unrelated driver/carrier", () => {
    expect(canAccessShipment({ userId: "u-nope", roles: [Role.employee_driver] }, ctx())).toBe(false);
  });

  it("allows ops/QA/admin (SHIPMENT_READ_ALL) for any shipment", () => {
    expect(canAccessShipment({ userId: "x", roles: [Role.dispatcher] }, ctx({ ownerUserId: "someone" }))).toBe(true);
    expect(canAccessShipment({ userId: "x", roles: [Role.qa_reviewer] }, ctx({ ownerUserId: "someone" }))).toBe(true);
    expect(canAccessShipment({ userId: "x", roles: [Role.admin] }, ctx({ ownerUserId: "someone" }))).toBe(true);
  });

  it("denies an unauthenticated caller", () => {
    expect(canAccessShipment(null, ctx())).toBe(false);
  });

  it("denies when the shipment has no owner and caller is a plain customer", () => {
    expect(canAccessShipment({ userId: "u1", roles: [Role.customer] }, ctx({ ownerUserId: null }))).toBe(false);
  });
});
