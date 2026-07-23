// Response serializers that enforce a non-negotiable: DRIVERS NEVER SEE MARGIN.
// Any shipment payload leaving the API is passed through here with the caller's
// roles; margin-bearing fields are stripped unless the caller can view margin.
import { canViewMargin, splitRate, type Role } from "@navastar/shared";

const MARGIN_FIELDS = ["marginBps", "marginCents"] as const;

/** Strip margin fields from an object unless the roles are allowed to see them. */
export function stripMargin<T extends Record<string, unknown>>(obj: T, roles: Role[]): Partial<T> {
  if (canViewMargin(roles)) return obj;
  const clone: Record<string, unknown> = { ...obj };
  for (const f of MARGIN_FIELDS) delete clone[f];
  return clone as Partial<T>;
}

/**
 * Shape a shipment for the wire. Customers/partners see the quoted price;
 * dispatch/admin additionally see margin; drivers see only their payout (never
 * the customer price or margin) — enforced by the caller choosing driverView.
 */
export function serializeShipment(
  shipment: {
    id: string;
    trackingId: string;
    status: string;
    quotedPriceCents: number | null;
    marginBps: number | null;
    distanceMiles: number | null;
    etaAt: Date | null;
    commodityId: string;
  },
  roles: Role[]
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: shipment.id,
    trackingId: shipment.trackingId,
    status: shipment.status,
    quotedPriceCents: shipment.quotedPriceCents,
    distanceMiles: shipment.distanceMiles,
    etaAt: shipment.etaAt,
    commodityId: shipment.commodityId,
  };
  if (canViewMargin(roles) && shipment.quotedPriceCents != null && shipment.marginBps != null) {
    const split = splitRate(shipment.quotedPriceCents, shipment.marginBps);
    base.marginBps = split.marginBps;
    base.marginCents = split.marginCents;
    base.payoutCents = split.payoutCents;
  }
  return base;
}
