// Builds the Fastify app (no listen) so tests can import it directly.
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import authPlugin from "./plugins/auth.js";
import partnerPlugin from "./plugins/partner.js";
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
import paymentRoutes from "./routes/payments.js";
import partnerRoutes from "./routes/partner.js";
import complianceRoutes from "./routes/compliance.js";
import trustRoutes from "./routes/trust.js";
import adminRoutes from "./routes/admin.js";
import shippingRoutes from "./routes/shipping.js";
import equipmentRoutes from "./routes/equipment.js";
import aiRoutes from "./routes/ai.js";
import { hub } from "./realtime.js";
import { initPayments } from "./lib/payments.js";
import { initWebhooks } from "./lib/webhooks.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === "test" ? false : { level: process.env.LOG_LEVEL ?? "info" },
  });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(websocket);

  // OpenAPI (served at /api/openapi.json) + interactive docs at /api/docs.
  await app.register(swagger, {
    openapi: {
      info: { title: "Navastar Logistics API", version: "0.1.0", description: "Public + partner API for the Navastar platform." },
      tags: [
        { name: "partner", description: "Partner (API-key) endpoints" },
        { name: "public", description: "Public endpoints" },
      ],
      components: {
        securitySchemes: { apiKey: { type: "apiKey", name: "x-api-key", in: "header" } },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });
  // Machine-readable spec (swagger-ui also serves it at /api/docs/json).
  app.get("/api/openapi.json", async () => app.swagger());

  await app.register(authPlugin);
  await app.register(partnerPlugin);

  // Bridge the event bus to live WebSocket subscribers.
  hub.start();
  // Wire payment side-effects (fee-on-booking, escrow-release-on-POD).
  initPayments();
  // Wire outbound webhook delivery to partner endpoints.
  initWebhooks();

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
  // Module 9 — payments, settlement & escrow.
  await app.register(paymentRoutes);
  // Module 10 — public/partner API + webhooks + widget.
  await app.register(partnerRoutes);
  // Module 11 — custody & compliance (rules engine + chain verify/export).
  await app.register(complianceRoutes);
  // Module 12 — ratings & trust, insurance & claims, carrier-monitoring.
  await app.register(trustRoutes);
  // Module 13 — revenue & monetization admin backboard.
  await app.register(adminRoutes);
  // Module 14 — multi-commodity shipping + equipment leasing marketplace.
  await app.register(shippingRoutes);
  await app.register(equipmentRoutes);
  // Module 15 — deeper AI (support copilot, forecasting, fraud).
  await app.register(aiRoutes);

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({
      error: status >= 500 ? "internal_error" : "request_error",
      message: err.message,
    });
  });

  return app;
}
