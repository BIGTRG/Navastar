// Event bus = in-process emitter + transactional outbox. State changes write an
// Outbox row in the SAME transaction as the change; a relay drains the outbox to
// the emitter (at-least-once). Swap the emitter for Kafka later without touching
// producers. Real-time features (WS/SSE, Module 2) subscribe to `bus`.
import { EventEmitter } from "node:events";
import { prisma, Prisma } from "@navastar/db";

export type DomainEvent = {
  topic: string;
  payload: Record<string, unknown>;
  id: string;
  at: string;
};

class DomainBus extends EventEmitter {
  emitEvent(evt: DomainEvent) {
    this.emit(evt.topic, evt);
    this.emit("*", evt);
  }
}

export const bus = new DomainBus();

/** Write an event to the outbox inside a transaction (durable, atomic). */
export async function publishToOutbox(
  tx: Prisma.TransactionClient,
  topic: string,
  payload: Record<string, unknown>
): Promise<void> {
  await tx.outbox.create({
    data: { topic, payload: payload as Prisma.InputJsonValue },
  });
}

let timer: NodeJS.Timeout | null = null;

/** Poll the outbox and deliver undelivered events to the in-process bus. */
export function startOutboxRelay(intervalMs = 500): () => void {
  if (timer) return stopOutboxRelay;
  const tick = async () => {
    try {
      const pending = await prisma.outbox.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      for (const row of pending) {
        bus.emitEvent({
          topic: row.topic,
          payload: (row.payload ?? {}) as Record<string, unknown>,
          id: row.id,
          at: row.createdAt.toISOString(),
        });
        await prisma.outbox.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
      }
    } catch (err) {
      // Relay must never crash the process; log and retry next tick.
      // eslint-disable-next-line no-console
      console.error("[outbox] relay error:", err);
    }
  };
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return stopOutboxRelay;
}

export function stopOutboxRelay(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
