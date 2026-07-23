# Navastar Logistics — Architecture

AI-powered, multi-commodity transport & logistics operating system that is also a
licensed property broker. Vehicle auctions are the launch channel. See
[BRIEF.md](./BRIEF.md) for the canonical product spec.

## The three pillars (enforced in code, not just docs)

| Pillar | How the codebase enforces it |
|---|---|
| **1. AI-first** | Every AI capability is an interface in `@navastar/shared` (`aiPricing`, `aiMatching`, `aiInspection`, `aiEta`, `documentOcr`, `carrierLookup`, `supportCopilot`, `fraudRisk`). MVP ships a `stub` implementation selected by `AI_PROVIDER`. Every call returns an **AI envelope** and writes an `AIDecision` row. |
| **2. Human-in-the-loop + QA** | The AI envelope carries `{model, version, confidence, decidedBy, approvedBy, qaStatus, timestamp}`. Below `AI_CONFIDENCE_THRESHOLD` the decision is flagged `needsHumanReview`. QA reviews sit behind both AI and drivers via `QAReview`. Rule enforced end-to-end: **AI does it → a human approves → QA verifies.** |
| **3. Connected via API** | API-first (every feature is an HTTP endpoint before it is a screen). Auctions plug in through the `AuctionConnector` interface in `@navastar/connectors`; adding an auction house = dropping in an adapter, never editing core. The `"Deliver with Navastar"` widget is a first-class embeddable. |

## Monorepo layout

```
navastar/
├─ apps/
│  ├─ web/            React + Vite + TS + Tailwind (customer + ops + driver + QA UIs)
│  └─ api/            Fastify + TS  (REST + WS/SSE, JWT auth, RBAC, event bus + outbox)
├─ packages/
│  ├─ db/             Prisma schema, migrations, seed, PrismaClient export, hash-chain helper
│  ├─ shared/         Types, Zod contracts, env loader, the 8 AI interfaces (+ stub impls),
│  │                  the AI-envelope + AIDecision logger, RBAC role/permission matrix
│  ├─ connectors/     AuctionConnector interface + adapters (BidNow, Auctora, Auction of
│  │                  America, Copart, IAA, Manheim, ADESA) + a registry
│  └─ providers/      MapProvider (OSM→HERE), S3/MinIO storage, EscrowConnector — all pluggable
├─ docs/              BRIEF.md, ARCHITECTURE.md, ROADMAP.md
├─ docker-compose.yml           local dev infra: Postgres + MinIO
└─ docker-compose.prod.yml      (added in deploy phase) web + api + postgres + minio + Caddy
```

Package graph (deps flow downward, no cycles):

```
        apps/web ─────┐
                      ├──► packages/shared ──► packages/db
        apps/api ─────┤
                      ├──► packages/connectors ──► packages/shared
                      └──► packages/providers ───► packages/shared
```

## Stack decisions

| Concern | MVP choice | Production swap | Seam |
|---|---|---|---|
| Frontend | React + Vite + TS + Tailwind | — | — |
| Backend | Fastify + TS | — | — |
| DB | Postgres + Prisma | same | `@navastar/db` |
| Real-time | SSE + WebSocket (`@fastify/websocket`) | same | `RealtimeHub` in api |
| Maps | Leaflet + OSM (no key) | HERE (truck routing: height/weight/hazmat) | `MapProvider` |
| Media | MinIO (S3-compatible) | S3 / any S3 API | `StorageProvider` |
| AI | `stub` impls | Ravin/UVeye/OCR/FMCSA/etc. | 8 AI interfaces |
| Escrow | `stub` state machine | real provider via env | `EscrowConnector` |
| Event bus | in-process emitter + transactional outbox | Kafka | `EventBus` + `outbox` table |
| Auth | JWT + roles | same | `@fastify/jwt` + RBAC guard |

## Cross-cutting primitives

### AI envelope + AIDecision log
Every AI output is wrapped:

```ts
type AIEnvelope<T> = {
  result: T;
  model: string;
  version: string;
  confidence: number;        // 0..1
  decidedBy: "ai" | "human";
  approvedBy?: string | null; // userId of approver
  qaStatus: "pending" | "pass" | "fix" | "fail";
  needsHumanReview: boolean;  // confidence < AI_CONFIDENCE_THRESHOLD
  timestamp: string;         // ISO
};
```

`runAi(kind, input, fn)` executes the capability, computes `needsHumanReview`, and
persists an `AIDecision` row. Nothing calls an AI vendor directly.

### Hash-chained custody
`CustodyEvent` rows are **append-only** and **hash-chained** per shipment:
`hash = sha256(prevHash + canonicalJson(payload))`. The chain is verifiable with
`verifyCustodyChain(shipmentId)`. Tampering with any historical event breaks the chain.
Implemented in `@navastar/db`.

### Transactional outbox
State changes and their emitted events are written in the **same DB transaction**
(`Outbox` table). A relay drains the outbox to the `EventBus` (in-process now, Kafka
later) so no event is lost on crash and delivery is at-least-once.

### RBAC
Roles (from the brief): `customer`, `independent_carrier`, `employee_driver`,
`lease_operator`, `dispatcher`, `qa_reviewer`, `admin`, `auction_partner`,
`equipment_lessor`. A permission matrix lives in `@navastar/shared`; every route
declares required permission(s) and the Fastify guard enforces it. **Drivers never
see Navastar's margin** — margin fields are stripped from any driver-scoped response.

## Money model (implemented progressively across phases)
- Margin = `customerRate × (1 − marginPct)`, per commodity. Drivers see only their pay.
- Fee collected **up front at booking**. Standard payout **weekly & free**.
- **Quick-pay** (instant/same-day) is opt-in and charges a fee — for outside carriers
  **and** our own drivers. Its own revenue stream.
- Escrow/assurance fee applies on **both** sides (configurable).
- Escrow state machine: `FEE_COLLECTED → FUNDS_HELD → BOL_SIGNED → RELEASED → PAID`.
  Digital-BOL e-sign fires the release event.

Six revenue streams (Phase 3 admin backboard, all DB-backed, no redeploy):
margin % per commodity · subscription tiers · quick-pay fee % · load-board connection
fee · payment/escrow fee · value-add pricing.

## Non-negotiables (checklist enforced every module)
- [x] API-first — endpoint before screen
- [x] CustodyEvents append-only + hash-chained
- [x] Drivers never see Navastar's margin
- [x] Every AI decision has confidence + human-approval + QA hook
- [x] Seed demo data
- [x] RBAC on every endpoint
- [x] Basic tests per module

## Deployment
Local: `docker compose up -d` (Postgres + MinIO) then `pnpm dev`. Production (Hetzner):
`docker-compose.prod.yml` with web + api + postgres (persistent volume) + MinIO + Caddy
(auto-HTTPS, WebSocket upgrade headers). Nightly `pg_dump`. One-command deploy:
`git pull && docker compose -f docker-compose.prod.yml up -d --build`. Added in the
deployment phase; see ROADMAP.
