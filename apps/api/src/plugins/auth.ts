// Auth + RBAC. Registers @fastify/jwt, exposes `authenticate` (verify token) and
// `requirePermission(...)` (enforce the RBAC matrix). Every non-public route uses
// one of these. Unauthorized → 401, forbidden → 403.
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { hasPermission, type AuthPrincipal, type PermissionKey } from "@navastar/shared";
import { env } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    requirePermission: (...perms: PermissionKey[]) => preHandlerHookHandler;
  }
  interface FastifyRequest {
    principal: AuthPrincipal | null;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AuthPrincipal;
    user: AuthPrincipal;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorateRequest("principal", null);

  app.decorate("authenticate", async function (req: FastifyRequest, reply: FastifyReply) {
    try {
      await req.jwtVerify();
      req.principal = req.user;
    } catch {
      return reply.code(401).send({ error: "unauthorized", message: "Valid token required." });
    }
  });

  app.decorate("requirePermission", function (...perms: PermissionKey[]): preHandlerHookHandler {
    return async function (req: FastifyRequest, reply: FastifyReply) {
      // Run authenticate first if the route didn't already.
      if (!req.principal) {
        try {
          await req.jwtVerify();
          req.principal = req.user;
        } catch {
          return reply.code(401).send({ error: "unauthorized", message: "Valid token required." });
        }
      }
      const roles = req.principal?.roles ?? [];
      const ok = perms.every((p) => hasPermission(roles, p));
      if (!ok) {
        return reply.code(403).send({
          error: "forbidden",
          message: `Missing required permission(s): ${perms.join(", ")}`,
        });
      }
    };
  });
});
