// Fleet roam simulator — random-walks a driver's last-known position and emits
// `driver.location` events so the ops Global GPS map shows live movement in a
// demo. Dispatcher/admin only. Mirrors the shipment simulator pattern.
import { prisma } from "@navastar/db";
import { bus } from "../events.js";

const roaming = new Map<string, NodeJS.Timeout>();

export async function startRoam(driverId: string, intervalMs = 2000): Promise<{ alreadyRunning: boolean }> {
  if (roaming.has(driverId)) return { alreadyRunning: true };
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw Object.assign(new Error("driver_not_found"), { statusCode: 404 });

  let lat = driver.lastLat ?? 39.5;
  let lng = driver.lastLng ?? -98.35;

  const timer = setInterval(() => {
    void (async () => {
      // Small random step (~0.5–1.5 mi).
      lat += (hash(driverId + lat) - 0.5) * 0.02;
      lng += (hash(driverId + lng) - 0.5) * 0.02;
      try {
        await prisma.driver.update({
          where: { id: driverId },
          data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() },
        });
        bus.emitEvent({
          topic: "driver.location",
          payload: { driverId, lat, lng, type: driver.type, name: driver.name },
          id: `${driverId}:${Date.now()}`,
          at: new Date().toISOString(),
        });
      } catch {
        stopRoam(driverId);
      }
    })();
  }, intervalMs);
  timer.unref?.();
  roaming.set(driverId, timer);
  return { alreadyRunning: false };
}

export function stopRoam(driverId: string): boolean {
  const t = roaming.get(driverId);
  if (!t) return false;
  clearInterval(t);
  roaming.delete(driverId);
  return true;
}

export function roamingIds(): string[] {
  return [...roaming.keys()];
}

// Deterministic pseudo-random in [0,1) from a string (Date.now/Math.random-free).
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
