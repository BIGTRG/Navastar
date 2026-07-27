import { describe, it, expect } from "vitest";
import { Role } from "@navastar/db";
import { hasPermission, canViewMargin, Permission } from "./rbac.js";
import { hashApiKey } from "./auth.js";

describe("hashApiKey", () => {
  it("is deterministic and never returns the plaintext", () => {
    const h = hashApiKey("demo-key-bidnow");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("demo-key");
    expect(hashApiKey("demo-key-bidnow")).toBe(h);
    expect(hashApiKey("different")).not.toBe(h);
  });
});

describe("RBAC", () => {
  it("customer can create quotes + book, but cannot see margin", () => {
    const roles = [Role.customer];
    expect(hasPermission(roles, Permission.QUOTE_CREATE)).toBe(true);
    expect(hasPermission(roles, Permission.SHIPMENT_BOOK)).toBe(true);
    expect(canViewMargin(roles)).toBe(false);
  });

  it("DRIVERS NEVER SEE MARGIN (non-negotiable)", () => {
    for (const role of [Role.employee_driver, Role.independent_carrier, Role.lease_operator]) {
      expect(canViewMargin([role])).toBe(false);
    }
  });

  it("dispatcher and admin can see margin", () => {
    expect(canViewMargin([Role.dispatcher])).toBe(true);
    expect(canViewMargin([Role.admin])).toBe(true);
  });

  it("admin (ADMIN_ALL) is granted every permission", () => {
    const all = Object.values(Permission);
    for (const p of all) expect(hasPermission([Role.admin], p)).toBe(true);
  });

  it("a driver cannot create auction lots", () => {
    expect(hasPermission([Role.employee_driver], Permission.AUCTION_LOT_CREATE)).toBe(false);
  });
});
