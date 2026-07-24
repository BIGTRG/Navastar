// Role-based access control. The permission matrix is the single source of truth;
// every API route declares the permission(s) it requires and the Fastify guard
// checks the caller's roles against this matrix.
import { Role } from "@navastar/db";

export { Role };

/**
 * Permissions are coarse capability strings, `resource:action`. Keep them stable —
 * routes reference them by name. Add new ones here, not inline in routes.
 */
export const Permission = {
  // auction intake / quoting / booking (Module 1)
  AUCTION_LOT_CREATE: "auction_lot:create",
  QUOTE_CREATE: "quote:create",
  SHIPMENT_BOOK: "shipment:book",
  // shipments
  SHIPMENT_READ_OWN: "shipment:read_own",
  SHIPMENT_READ_ALL: "shipment:read_all",
  SHIPMENT_TRACK: "shipment:track",
  // driver
  DRIVER_JOBS_READ: "driver_jobs:read",
  INSPECTION_SUBMIT: "inspection:submit",
  POD_SUBMIT: "pod:submit",
  MEDIA_UPLOAD: "media:upload",
  // ops / dispatch
  OPS_DASHBOARD_READ: "ops_dashboard:read",
  DISPATCH_ASSIGN: "dispatch:assign",
  // qa
  QA_REVIEW: "qa:review",
  // admin / revenue
  ADMIN_ALL: "admin:all",
  REVENUE_CONFIG: "revenue:config",
  // margin visibility — the gate that keeps drivers from seeing Navastar's margin
  MARGIN_VIEW: "margin:view",
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];

const P = Permission;

/** Role → granted permissions. `admin` is granted everything via ADMIN_ALL. */
export const ROLE_PERMISSIONS: Record<Role, PermissionKey[]> = {
  [Role.customer]: [
    P.AUCTION_LOT_CREATE,
    P.QUOTE_CREATE,
    P.SHIPMENT_BOOK,
    P.SHIPMENT_READ_OWN,
    P.SHIPMENT_TRACK,
  ],
  [Role.auction_partner]: [P.AUCTION_LOT_CREATE, P.QUOTE_CREATE, P.SHIPMENT_BOOK, P.SHIPMENT_TRACK],
  [Role.independent_carrier]: [
    P.DRIVER_JOBS_READ,
    P.INSPECTION_SUBMIT,
    P.POD_SUBMIT,
    P.MEDIA_UPLOAD,
    P.SHIPMENT_TRACK,
  ],
  [Role.employee_driver]: [
    P.DRIVER_JOBS_READ,
    P.INSPECTION_SUBMIT,
    P.POD_SUBMIT,
    P.MEDIA_UPLOAD,
    P.SHIPMENT_TRACK,
  ],
  [Role.lease_operator]: [
    P.DRIVER_JOBS_READ,
    P.INSPECTION_SUBMIT,
    P.POD_SUBMIT,
    P.MEDIA_UPLOAD,
    P.SHIPMENT_TRACK,
  ],
  [Role.dispatcher]: [
    P.SHIPMENT_READ_ALL,
    P.OPS_DASHBOARD_READ,
    P.DISPATCH_ASSIGN,
    P.SHIPMENT_TRACK,
    P.MARGIN_VIEW,
    P.QUOTE_CREATE,
    P.DRIVER_JOBS_READ,
    P.MEDIA_UPLOAD,
    P.INSPECTION_SUBMIT,
    P.POD_SUBMIT,
  ],
  [Role.qa_reviewer]: [P.QA_REVIEW, P.SHIPMENT_READ_ALL, P.SHIPMENT_TRACK],
  [Role.equipment_lessor]: [P.SHIPMENT_TRACK],
  [Role.admin]: [P.ADMIN_ALL], // expanded to all permissions by hasPermission()
};

const ALL_PERMISSIONS = Object.values(P) as PermissionKey[];

/** Does a set of roles grant a permission? admin (ADMIN_ALL) grants everything. */
export function hasPermission(roles: Role[], required: PermissionKey): boolean {
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role] ?? [];
    if (perms.includes(P.ADMIN_ALL)) return true;
    if (perms.includes(required)) return true;
  }
  return false;
}

/** Flattened permission set for a role list (admin → everything). */
export function permissionsFor(roles: Role[]): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) {
      if (p === P.ADMIN_ALL) {
        ALL_PERMISSIONS.forEach((x) => set.add(x));
      } else {
        set.add(p);
      }
    }
  }
  return [...set];
}

/** True if any of these roles is allowed to see Navastar's margin. */
export function canViewMargin(roles: Role[]): boolean {
  return hasPermission(roles, P.MARGIN_VIEW);
}
