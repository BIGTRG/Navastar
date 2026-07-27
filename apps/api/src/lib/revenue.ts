// Shared access to the single-row RevenueConfig (all six monetization levers).
import { prisma } from "@navastar/db";

export async function revenueConfig() {
  return prisma.revenueConfig.upsert({ where: { id: "revenue" }, update: {}, create: { id: "revenue" } });
}

/** feeBps of amountCents, rounded to cents. */
export function feeOf(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10000);
}
