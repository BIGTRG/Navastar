// P2-15 — consistent input validation. Shared schemas for path params and
// pagination so every route rejects malformed ids/queries with a 400 (mapped in
// server.ts's error handler) before anything reaches the database.
import { z } from "zod";

// Opaque resource ids (cuid / customer-facing tracking ids / slugs). Deliberately
// permissive on format but strict on shape: non-empty, bounded length, and a
// conservative token charset — this rejects empty/overlong ids and path-traversal
// or injection-style input without over-fitting to a single id scheme.
export const idSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "invalid id");

/** `{ id }` path params — the common case. */
export const idParams = z.object({ id: idSchema });

/**
 * Bounded pagination for list endpoints that accept client-controlled paging.
 * `take` is clamped to [1, maxTake]; `skip` is non-negative. Both optional with
 * sensible defaults so a client can never request an unbounded result set.
 */
export function paginationQuery(defaultTake = 50, maxTake = 200) {
  return z.object({
    take: z.coerce.number().int().min(1).max(maxTake).optional().default(defaultTake),
    skip: z.coerce.number().int().min(0).optional().default(0),
  });
}
