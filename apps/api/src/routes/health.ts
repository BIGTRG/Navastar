import type { FastifyInstance } from "fastify";
import { prisma } from "@navastar/db";

export default async function healthRoutes(app: FastifyInstance) {
  // Liveness — no DB.
  app.get("/health", async () => ({ ok: true, service: "navastar-api" }));

  // Readiness — checks the DB connection.
  app.get("/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: "up" };
    } catch {
      return reply.code(503).send({ ok: false, db: "down" });
    }
  });
}
