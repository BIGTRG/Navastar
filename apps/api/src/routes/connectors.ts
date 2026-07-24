// Public metadata for the embeddable "Deliver with Navastar" widget/SDK: which
// auction houses are wired and how each renders its button. Public so partner
// sites can bootstrap the widget without a user token.
import type { FastifyInstance } from "fastify";
import { listConnectors } from "@navastar/connectors";
import { prisma } from "@navastar/db";

export default async function connectorRoutes(app: FastifyInstance) {
  app.get("/api/connectors", async () => {
    const partners = await prisma.auctionPartner.findMany({ select: { code: true, enabled: true } });
    const enabledByCode = new Map(partners.map((p) => [p.code, p.enabled]));
    return {
      connectors: listConnectors().map((c) => ({
        code: c.code,
        name: c.name,
        enabled: enabledByCode.get(c.code) ?? true,
        widget: c.widget(),
      })),
    };
  });
}
