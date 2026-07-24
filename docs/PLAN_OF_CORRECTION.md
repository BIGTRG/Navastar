# Navastar — Plan of Correction

The platform is feature-complete across all 15 modules + deployment, and passes
**106 unit/guard tests + typecheck + build**. But breadth was built fast, and the
runtime was never exercised against a real database here (no Docker on the build
machine). This document is the honest list of what must be corrected before real
users, prioritized. Severity: **P0** (blocks any real deploy / security bug) ·
**P1** (before production traffic) · **P2** (hardening/quality) · **P3** (nice-to-have).

---

## P0 — Correctness & security blockers

### 1. Object-level authorization is missing on shipment reads/writes
Today `GET /api/shipments/:id`, `/track`, `POST /api/quotes`, and `/book` check a
*permission* but not *ownership* — any authenticated customer can read or act on
**any** shipment by id. `Permission.SHIPMENT_READ_OWN` exists but is not enforced.
- **Fix:** bind shipments to their buyer (`buyerId`/owning `userId`); in each
  handler assert `caller owns the shipment` unless they hold `SHIPMENT_READ_ALL`
  (ops/QA). Drivers: only shipments on a leg assigned to them. Add an
  `assertCanAccessShipment(principal, shipment)` helper and cover it with tests.
- **Files:** `apps/api/src/routes/shipments.ts`, `quotes.ts`, `tracking.ts`.

### 2. No integration tests — every DB path is unverified
All 106 tests are pure units or 401 guards. The actual flows (intake → quote →
book → assign → POD → escrow release → payout) have **never run end-to-end**.
- **Fix:** stand up a disposable Postgres (testcontainers or a CI service),
  `prisma db push`, seed, and write integration tests for each module's happy
  path + key failure paths. Target: every route hit against a real DB at least once.

### 3. Schema is applied with `prisma db push`, not migrations
The prod container runs `db push` on boot, which can **drop columns/data** on a
divergent schema. Unsafe for a database with real data.
- **Fix:** generate a baseline migration (`prisma migrate dev --name init`), commit
  `prisma/migrations/`, and switch the container to `prisma migrate deploy`.
- **Files:** `Dockerfile.api` CMD, add `packages/db/prisma/migrations/`.

### 4. Demo simulators are live in production code
`POST /api/shipments/:id/simulate`, `/api/ops/drivers/:id/roam`, and the
movement/roam timers are demo-only but always registered.
- **Fix:** gate them behind `NODE_ENV !== "production"` (or an `ENABLE_DEMO` flag)
  so they can't be triggered against real operations.
- **Files:** `routes/tracking.ts`, `routes/ops.ts`, `lib/simulator.ts`, `lib/driverSim.ts`.

### 5. Secrets stored in plaintext
`AuctionPartner.apiKey` and `WebhookEndpoint.secret` are stored/compared in
plaintext; login has no brute-force protection.
- **Fix:** hash partner API keys (compare by hash), keep webhook secrets encrypted
  at rest; add rate-limiting on `/api/auth/login` and the partner endpoints
  (`@fastify/rate-limit`).

---

## P1 — Before production traffic

### 6. Payments/escrow are stubs with no real processor or idempotency guarantees
`EscrowConnector` and all payment methods are stubs. Escrow init is event-driven
off the outbox relay; if the relay isn't running, the up-front fee isn't collected.
- **Fix:** integrate a real processor (Stripe/Adyen/…) behind the existing seams;
  add idempotency keys on every money mutation; add a reconciliation job; assert
  the relay is healthy (already `unref`'d — add a liveness check + metric).

### 7. Webhook delivery has no retry/backoff or replay protection
`lib/webhooks.ts` attempts once and marks FAILED; no retries, no dedupe, no
timestamp in the signature (replayable).
- **Fix:** exponential-backoff retry queue (drain `WebhookDelivery` where FAILED),
  include a timestamp in the signed payload, document a tolerance window.

### 8. CORS + MinIO are wide open
API uses `origin: true` (reflects any origin); MinIO sets
`MINIO_API_CORS_ALLOW_ORIGIN: "*"`.
- **Fix:** lock API CORS to `https://${DOMAIN}`; scope MinIO CORS to the app origin;
  put MinIO behind the documented subdomain with least-privilege bucket policy.

### 9. JWT lifecycle
No refresh tokens, no revocation/blocklist, no forced logout on role change.
Web doesn't handle 401 (expired token) — it silently fails.
- **Fix:** short-lived access + refresh tokens (or sliding sessions); web
  interceptor that clears the token and redirects to login on 401.

### 10. Load-board / equipment ownership + concurrency
Bidding/award and equipment leasing have minimal guards; two awards or two leases
racing could double-book. Load posts don't expire.
- **Fix:** wrap award/lease in `SELECT … FOR UPDATE`-style transactions (Prisma
  interactive txn with a status re-check), enforce `LoadPost.expiresAt`.

---

## P2 — Hardening & quality

- **11. Observability:** structured JSON logs with request ids, error tracking
  (Sentry), and metrics (Prometheus). Health/ready exist; add `/metrics`.
- **12. CI/CD:** GitHub Actions to run `pnpm typecheck` + `pnpm test` on every PR,
  build the Docker images, and gate merges to `main`.
- **13. Web refactor:** `apps/web/src/App.tsx` is one large file with ~15 role-gated
  tabs. Split into a router + per-route lazy-loaded pages; add an error boundary;
  extract the repeated fetch/loading/error pattern into a `useApi` hook.
- **14. N+1 / query cost:** monitoring, ops shipments, and revenue dashboard load
  broad sets in memory. Move aggregations to SQL (`groupBy`/raw) before scale.
- **15. Input/validation coverage:** a few endpoints accept path ids without
  format checks; add consistent zod validation on params and pagination caps.
- **16. Seed idempotency:** a couple of `createMany` blocks are guarded by a
  `count()===0` check that can double-insert after a partial seed — make them
  upserts keyed on natural keys.
- **17. AI honesty in UI:** pricing/matching/inspection/forecast are deterministic
  stubs. Label them "estimate (stub model)" until real vendors are wired, so no one
  mistakes stub confidence for a real model.
- **18. Money correctness:** add currency handling (single-currency today),
  property-based tests around `splitRate`/fee rounding, and non-negative invariants
  at write time.

## P3 — Nice-to-have

- **19. Accessibility pass** on the web (labels, focus, contrast, keyboard).
- **20. E2E UI tests** (Playwright) for the core customer + driver + ops journeys.
- **21. Rate/route caching**, CDN for the SPA, image thumbnails for inspection media.
- **22. Multi-tenant / white-label** theming for partner-embedded deployments.

---

## Suggested sequence
1. **Push to GitHub** (`gh auth login`) so the work is backed up and reviewable.
2. **P0 in order:** #3 migrations → #2 integration harness → #1 authorization (with
   tests) → #4 simulator gating → #5 secret hashing + rate limit.
3. Run the full stack once on Docker/Hetzner and smoke-test each module live.
4. **P1** as production readiness, then **P2** as the platform takes real traffic.

Each P0/P1 item is small and localized — most are 1–3 files plus tests. I can take
them one at a time on their own branches, same as the module builds.
