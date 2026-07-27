// Partner API-key auth for the public/partner API. A partner presents its key via
// `x-api-key` (or `Authorization: Bearer <key>`); we resolve the AuctionPartner and
// attach it to the request. Separate from user JWT auth — partners are machines.
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { prisma } from "@navastar/db";
import { hashApiKey } from "@navastar/shared";

export interface PartnerPrincipal {
  id: string;
  code: string;
  name: string;
}

declare module "fastify" {
  interface FastifyInstance {
    requirePartner: preHandlerHookHandler;
  }
  interface FastifyRequest {
    partner: PartnerPrincipal | null;
  }
}

export default fp(async function partnerPlugin(app: FastifyInstance) {
  app.decorateRequest("partner", null);

  app.decorate("requirePartner", async function (req: FastifyRequest, reply: FastifyReply) {
    const header = (req.headers["x-api-key"] as string | undefined) ?? bearer(req.headers.authorization);
    if (!header) return reply.code(401).send({ error: "unauthorized", message: "API key required (x-api-key)." });
    // Look up by hash — the plaintext key is never stored.
    const partner = await prisma.auctionPartner.findFirst({ where: { apiKeyHash: hashApiKey(header), enabled: true } });
    if (!partner) return reply.code(401).send({ error: "invalid_api_key" });
    req.partner = { id: partner.id, code: partner.code, name: partner.name };
  });
});

function bearer(auth: string | undefined): string | undefined {
  if (!auth) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m?.[1];
}
