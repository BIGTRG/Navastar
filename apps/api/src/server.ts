// Builds the Fastify app (no listen) so tests can import it directly.
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import authPlugin from "./plugins/auth.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import auctionRoutes from "./routes/auction.js";
import quoteRoutes from "./routes/quotes.js";
import shipmentRoutes from "./routes/shipments.js";
import connectorRoutes from "./routes/connectors.js";
import trackingRoutes from "./routes/tracking.js";
import uploadRoutes from "./routes/uploads.js";
import driverRoutes from "./routes/driver.js";
import opsRoutes from "./routes/ops.js";
import qaRoutes from "./routes/qa.js";
import dispatchRoutes from "./routes/dispatch.js";
import loadboardRoutes from "./routes/loadboard.js";
import onboardingRoutes from "./routes/onboarding.js";
import { hub } from "./realtime.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: process.env.LOG_LEVEL ?? "info" },
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);
  await app.register(authPlugin);

  // Bridge the event bus to live WebSocket subscribers.
  hub.start();

  // Public + Module 1 routes.
  await app.register(healthRoutes);
  await app.register(connectorRoutes);
  await app.register(authRoutes);
  await app.register(auctionRoutes);
  await app.register(quoteRoutes);
  await app.register(shipmentRoutes);
  // Module 2 — live tracking (REST + WebSocket).
  await app.register(trackingRoutes);
  // Module 3 — driver app (media + guided pickup + inspection + POD).
  await app.register(uploadRoutes);
  await app.register(driverRoutes);
  // Module 4 — ops dashboard (KPIs, shipments, exceptions, Global GPS map).
  await app.register(opsRoutes);
  // Module 5 — QA console (review queue, Pass/Fix/Fail, reliability scores).
  await app.register(qaRoutes);
  // Module 6 — dispatch & matching (queue, AI match, auto/manual assign).
  await app.register(dispatchRoutes);
  // Module 7 — load board (post, browse, bid, award, subscribe).
  await app.register(loadboardRoutes);
  // Module 8 — carrier & driver onboarding (dual track, FMCSA, verify).
  await app.register(onboardingRoutes);

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({
      error: status >= 500 ? "internal_error" : "request_error",
      message: err.message,
    });
  });

  return app;
}
