// API entrypoint. Loads env, starts the outbox relay, and listens.
import "./config.js"; // side-effect: load root .env + validate
import { env } from "./config.js";
import { buildApp } from "./server.js";
import { startOutboxRelay, stopOutboxRelay } from "./events.js";
import { startWebhookRetry, stopWebhookRetry } from "./lib/webhooks.js";
import { prisma } from "@navastar/db";

async function main() {
  const app = await buildApp();
  startOutboxRelay();
  startWebhookRetry(); // retry failed webhook deliveries with backoff

  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`Navastar API listening on :${env.API_PORT}`);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down…`);
    stopOutboxRelay();
    stopWebhookRetry();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
