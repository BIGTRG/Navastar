// Module 10 — Webhook delivery. Partners register endpoints; when a subscribed
// event fires on the bus we POST the payload with an HMAC-SHA256 signature and log
// the delivery. At-least-once via the bus (outbox-backed for durable topics).
import { createHmac } from "node:crypto";
import { prisma, WebhookStatus } from "@navastar/db";
import { bus, type DomainEvent } from "../events.js";

export function sign(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

async function deliver(topic: string, payload: Record<string, unknown>) {
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { active: true, events: { has: topic } } });
  for (const ep of endpoints) {
    const body = JSON.stringify({ event: topic, data: payload, at: new Date().toISOString() });
    const record = await prisma.webhookDelivery.create({
      data: { endpointId: ep.id, event: topic, payload: payload as object, attempts: 1 },
    });
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-navastar-signature": sign(ep.secret, body) },
        body,
        signal: AbortSignal.timeout(5000),
      });
      await prisma.webhookDelivery.update({
        where: { id: record.id },
        data: { status: res.ok ? WebhookStatus.SUCCESS : WebhookStatus.FAILED, responseCode: res.status },
      });
    } catch {
      await prisma.webhookDelivery.update({ where: { id: record.id }, data: { status: WebhookStatus.FAILED } });
    }
  }
}

let wired = false;
/** Subscribe webhook delivery to all bus events (idempotent). */
export function initWebhooks() {
  if (wired) return;
  wired = true;
  bus.on("*", (evt: DomainEvent) => {
    void deliver(evt.topic, evt.payload).catch((err) => console.error("[webhooks] delivery error:", err));
  });
}
