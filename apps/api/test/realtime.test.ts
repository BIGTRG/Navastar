// RealtimeHub unit tests — no server, no DB. Verifies subscription fan-out and
// the event-bus bridge that powers live customer tracking.
import { describe, it, expect } from "vitest";
import { hub } from "../src/realtime.js";
import { bus } from "../src/events.js";

function fakeClient() {
  const received: string[] = [];
  return { send: (d: string) => received.push(d), received };
}

describe("RealtimeHub", () => {
  it("fans out publishes only to subscribers of that shipment", () => {
    const a = fakeClient();
    const b = fakeClient();
    const unsubA = hub.subscribe("ship-1", a);
    hub.subscribe("ship-2", b);

    hub.publish("ship-1", { type: "tracking.point", lat: 1, lng: 2 });
    expect(a.received).toHaveLength(1);
    expect(b.received).toHaveLength(0);
    expect(JSON.parse(a.received[0]!)).toMatchObject({ type: "tracking.point", lat: 1 });

    unsubA();
    hub.publish("ship-1", { type: "tracking.point", lat: 3, lng: 4 });
    expect(a.received).toHaveLength(1); // no delivery after unsubscribe
    expect(hub.count("ship-1")).toBe(0);
  });

  it("bridges bus events to subscribers once started", () => {
    hub.start(); // idempotent
    const c = fakeClient();
    hub.subscribe("ship-9", c);
    bus.emitEvent({
      topic: "tracking.point",
      payload: { shipmentId: "ship-9", lat: 10, lng: 20 },
      id: "x",
      at: "2026-01-01T00:00:00.000Z",
    });
    expect(c.received).toHaveLength(1);
    expect(JSON.parse(c.received[0]!)).toMatchObject({ type: "tracking.point", shipmentId: "ship-9", lat: 10 });
  });

  it("ignores non-live bus topics", () => {
    hub.start();
    const c = fakeClient();
    hub.subscribe("ship-x", c);
    bus.emitEvent({ topic: "shipment.booked", payload: { shipmentId: "ship-x" }, id: "y", at: "t" });
    expect(c.received).toHaveLength(0);
  });
});
