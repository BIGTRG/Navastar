// Object-level authorization for shipments (Plan of Correction P0 #1). A route
// permission ("can this role do X") is NOT enough — we also enforce that the
// caller is entitled to THIS shipment: the owning customer, an assigned driver,
// the owning carrier, or a role with SHIPMENT_READ_ALL (ops/QA/admin).
import { prisma, type Role } from "@navastar/db";
import { hasPermission, Permission } from "@navastar/shared";

export interface ShipmentAccessContext {
  ownerUserId: string | null;
  driverUserIds: string[]; // users of drivers on this shipment's legs
  carrierOwnerUserIds: string[]; // owner users of carriers on this shipment's legs
}

/** Pure access decision — unit-tested without a DB. */
export function canAccessShipment(
  principal: { userId: string; roles: Role[] } | null,
  ctx: ShipmentAccessContext
): boolean {
  if (!principal) return false;
  // Ops/QA/admin may read any shipment.
  if (hasPermission(principal.roles, Permission.SHIPMENT_READ_ALL)) return true;
  // The owning customer.
  if (ctx.ownerUserId && ctx.ownerUserId === principal.userId) return true;
  // An assigned driver or the owning carrier.
  if (ctx.driverUserIds.includes(principal.userId)) return true;
  if (ctx.carrierOwnerUserIds.includes(principal.userId)) return true;
  return false;
}

export class AccessError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

/**
 * Load a shipment (by id or trackingId), enforce access, and return it. Throws
 * AccessError(404) if missing, AccessError(403) if the caller isn't entitled.
 */
export async function assertShipmentAccess(
  principal: { userId: string; roles: Role[] } | null,
  idOrTracking: string
) {
  const shipment = await prisma.shipment.findFirst({
    where: { OR: [{ id: idOrTracking }, { trackingId: idOrTracking }] },
    include: { legs: { include: { driver: true, carrier: true } } },
  });
  if (!shipment) throw new AccessError(404, "shipment_not_found");

  const driverUserIds = shipment.legs.map((l) => l.driver?.userId).filter((x): x is string => !!x);
  const carrierOwnerUserIds = shipment.legs.map((l) => l.carrier?.ownerUserId).filter((x): x is string => !!x);

  if (!canAccessShipment(principal, { ownerUserId: shipment.ownerUserId, driverUserIds, carrierOwnerUserIds })) {
    throw new AccessError(403, "forbidden");
  }
  return shipment;
}
