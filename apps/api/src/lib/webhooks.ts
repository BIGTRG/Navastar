// Module 10 / P1 #7 — Webhook delivery with retry/backoff + replay-resistant
// signatures. Partners register endpoints; subscribed bus events are POSTed with
// an HMAC-SHA256 signature over `${timestamp}.${body}` (Stripe-style) plus the
// timestamp header, so receivers can reject stale replays. Failed deliveries are
// retried with exponential backoff by a background relay (at-least-once).
import { createHmac } from "node:crypto";
import { prisma, WebhookStatus } from "@navastar/db";
import { bus, type DomainEvent } from "../events.js";

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000; // 30s, 60s, 120s, 240s, …
const REPLAY_TOLERANCE_SECONDS = 300;

/** HMAC-SHA256 over `${timestamp}.${body}` — receivers verify freshness + integrity. */
export function signPayload(secret: string, timestamp: number, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function backoffFor(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), 30 * 60_000);
}

/** Attempt (or re-attempt) one delivery; updates its status + attempt count. */
async function attemptDelivery(deliveryId: string, endpointUrl: string, secret: string, event: string, payload: unknown) {
  const timestamp = Math.floor(new Date().getTime() / 1000);
  const body = JSON.stringify({ event, data: payload, at: new Date().toISOString() });
  await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { attempts: { increment: 1 } } });
  try {
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-navastar-timestamp": String(timestamp),
        "x-navastar-signature": signPayload(secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: res.ok ? WebhookStatus.SUCCESS : WebhookStatus.FAILED, responseCode: res.status },
    });
    return res.ok;
  } catch {
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: WebhookStatus.FAILED } });
    return false;
  }
}

/** Fan a bus event out to every subscribed endpoint (first attempt). */
async function deliver(topic: string, payload: Record<string, unknown>) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { active: true, events: { has: topic } } });
  for (const ep of endpoints) {
    const rec = await prisma.webhookDelivery.create({
      data: { endpointId: ep.id, event: topic, payload: payload as object, attempts: 0 },
    });
    await attemptDelivery(rec.id, ep.url, ep.secret, topic, payload);
  }
}

let timer: NodeJS.Timeout | null = null;

/** Retry FAILED deliveries with exponential backoff until MAX_ATTEMPTS. */
export function startWebhookRetry(intervalMs = 30_000): () => void {
  if (timer) return stopWebhookRetry;
  const tick = async () => {
    try {
      const failed = await prisma.webhookDelivery.findMany({
        where: { status: WebhookStatus.FAILED, attempts: { lt: MAX_ATTEMPTS } },
        include: { endpoint: true },
        take: 50,
      });
      const now = Date.now();
      for (const d of failed) {
        // Space retries by backoff since the row was created (approximate anchor).
        if (now - d.createdAt.getTime() < backoffFor(d.attempts)) continue;
        if (!d.endpoint.active) continue;
        await attemptDelivery(d.id, d.endpoint.url, d.endpoint.secret, d.event, d.payload);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[webhooks] retry error:", err);
    }
  };
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return stopWebhookRetry;
}

export function stopWebhookRetry(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export const REPLAY_TOLERANCE = REPLAY_TOLERANCE_SECONDS;

let wired = false;
/** Subscribe webhook delivery to all bus events (idempotent). */
export function initWebhooks() {
  if (wired) return;
  wired = true;
  bus.on("*", (evt: DomainEvent) => {
    void deliver(evt.topic, evt.payload).catch((err) => console.error("[webhooks] delivery error:", err));
  });
}
