import type { FastifyInstance } from "fastify";
import { prisma } from "@navastar/db";
import { loginRequest, verifyPassword, type AuthPrincipal } from "@navastar/shared";

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login → { token, user }. Tightly rate-limited (brute-force).
  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = loginRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "bad_request", issues: parsed.error.issues });
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }
    const principal: AuthPrincipal = {
      userId: user.id,
      email: user.email,
      roles: user.roles,
      name: user.name,
    };
    const token = app.jwt.sign(principal);
    return { token, user: principal };
  });

  // GET /api/auth/me → current principal (for the web app to hydrate).
  app.get("/api/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.principal };
  });
}
