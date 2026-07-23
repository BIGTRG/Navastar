// @navastar/db — Prisma client singleton + custody hash-chain helpers.
import { PrismaClient, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

// Re-export the generated client types/enums so the rest of the monorepo
// imports domain enums (ShipmentStatus, Role, ...) from one place.
export * from "@prisma/client";
export { Prisma };

// ── Prisma singleton (avoids exhausting connections during dev HMR) ──
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ─────────────────────────────────────────────────────────────
// Custody hash-chain
// ─────────────────────────────────────────────────────────────
// CustodyEvents are append-only and hash-chained per shipment:
//   hash = sha256(prevHash + canonicalJson(payload))
// The genesis prevHash is a fixed sentinel. Any edit to a historical event
// breaks every subsequent hash — see verifyCustodyChain().

export const GENESIS_HASH = "0".repeat(64);

/** Deterministic JSON: object keys sorted recursively so hashing is stable. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

export function custodyHash(prevHash: string, payload: unknown): string {
  return createHash("sha256")
    .update(prevHash + canonicalJson(payload))
    .digest("hex");
}

export type AppendCustodyInput = {
  shipmentId: string;
  type: Prisma.CustodyEventCreateInput["type"];
  actorType: "system" | "ai" | "driver" | "user";
  actorId?: string | null;
  payload: Record<string, unknown>;
};

/**
 * Append a custody event, computing sequence + hash from the current chain head.
 * Pass a transaction client (`tx`) when this must be atomic with other writes
 * (e.g. status change + custody event + outbox row).
 */
export async function appendCustodyEvent(
  client: Prisma.TransactionClient | PrismaClient,
  input: AppendCustodyInput
) {
  const head = await client.custodyEvent.findFirst({
    where: { shipmentId: input.shipmentId },
    orderBy: { sequence: "desc" },
  });
  const sequence = head ? head.sequence + 1 : 0;
  const prevHash = head ? head.hash : GENESIS_HASH;
  const hash = custodyHash(prevHash, input.payload);

  return client.custodyEvent.create({
    data: {
      shipmentId: input.shipmentId,
      sequence,
      type: input.type,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      prevHash,
      hash,
    },
  });
}

/** Recompute the chain and report the first broken link, if any. */
export async function verifyCustodyChain(
  shipmentId: string
): Promise<{ ok: boolean; brokenAtSequence?: number; length: number }> {
  const events = await prisma.custodyEvent.findMany({
    where: { shipmentId },
    orderBy: { sequence: "asc" },
  });
  let prevHash = GENESIS_HASH;
  for (const e of events) {
    const expected = custodyHash(prevHash, e.payload);
    if (e.prevHash !== prevHash || e.hash !== expected) {
      return { ok: false, brokenAtSequence: e.sequence, length: events.length };
    }
    prevHash = e.hash;
  }
  return { ok: true, length: events.length };
}
