import { describe, it, expect } from "vitest";
import { Role } from "@navastar/db";
import { hasPermission, canViewMargin, Permission } from "./rbac.js";

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
