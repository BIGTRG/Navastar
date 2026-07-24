// Money helpers. Amounts are integer minor units (cents). Percentages are basis
// points (bps): 1% = 100 bps, 100% = 10_000 bps.

export const BPS_DENOMINATOR = 10_000;

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function pctToBps(pct: number): number {
  return Math.round(pct * 100);
}

export function bpsToPct(bps: number): number {
  return bps / 100;
}

/**
 * Split a customer rate into Navastar's margin and the carrier/driver payout.
 *   payout = customerRate × (1 − marginBps/10000)
 *   margin = customerRate − payout
 * Drivers are only ever shown `payoutCents`; `marginCents` must never reach them.
 */
export function splitRate(customerRateCents: number, marginBps: number): {
  customerRateCents: number;
  marginBps: number;
  marginCents: number;
  payoutCents: number;
} {
  const payoutCents = Math.round(customerRateCents * (1 - marginBps / BPS_DENOMINATOR));
  return {
    customerRateCents,
    marginBps,
    marginCents: customerRateCents - payoutCents,
    payoutCents,
  };
}
