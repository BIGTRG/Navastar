// RealtimeHub — fan-out of per-shipment live events to connected clients
// (WebSocket now; the same hub can feed SSE). It subscribes to the in-process
// event bus and forwards `tracking.point` and `shipment.status` events to the
// clients watching that shipment. Transport-agnostic: a client is anything with
// a send(string) function.
import { bus, type DomainEvent } from "./events.js";

export interface RealtimeClient {
  send: (data: string) => void;
}

const LIVE_TOPICS = new Set(["tracking.point", "shipment.status"]);
// Global room key for fleet-wide events (ops Global GPS map).
export const OPS_ROOM = "ops";

class RealtimeHub {
  private rooms = new Map<string, Set<RealtimeClient>>();
  private started = false;

  /** Begin bridging bus events to subscribers (idempotent). */
  start(): void {
    if (this.started) return;
    this.started = true;
    bus.on("*", (evt: DomainEvent) => {
      // Fleet-wide driver positions → the ops room.
      if (evt.topic === "driver.location") {
        this.publish(OPS_ROOM, { type: evt.topic, ...evt.payload });
        return;
      }
      // Per-shipment live events → that shipment's room.
      if (!LIVE_TOPICS.has(evt.topic)) return;
      const shipmentId = evt.payload.shipmentId as string | undefined;
      if (!shipmentId) return;
      this.publish(shipmentId, { type: evt.topic, ...evt.payload });
    });
  }

  subscribe(shipmentId: string, client: RealtimeClient): () => void {
    let room = this.rooms.get(shipmentId);
    if (!room) {
      room = new Set();
      this.rooms.set(shipmentId, room);
    }
    room.add(client);
    return () => {
      const r = this.rooms.get(shipmentId);
      if (!r) return;
      r.delete(client);
      if (r.size === 0) this.rooms.delete(shipmentId);
    };
  }

  publish(shipmentId: string, payload: Record<string, unknown>): void {
    const room = this.rooms.get(shipmentId);
    if (!room || room.size === 0) return;
    const data = JSON.stringify(payload);
    for (const client of room) {
      try {
        client.send(data);
      } catch {
        // Drop dead sockets silently; close handler cleans up subscription.
      }
    }
  }

  /** Number of clients watching a shipment (for tests/introspection). */
  count(shipmentId: string): number {
    return this.rooms.get(shipmentId)?.size ?? 0;
  }
}

export const hub = new RealtimeHub();
