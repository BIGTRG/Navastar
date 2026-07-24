# Navastar Logistics

AI-powered, multi-commodity transport & logistics operating system — and a licensed
property broker — with vehicle auctions as the launch channel.

- **Master brief:** [`docs/BRIEF.md`](docs/BRIEF.md)
- **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Build roadmap / checkpoints:** [`docs/ROADMAP.md`](docs/ROADMAP.md)

Built in phases, one module per checkpoint. **Current status: Phase 1 · Module 1 —
Auction intake (API + UI).**

## The three pillars
1. **AI-first** — pricing/matching/inspection/ETA/OCR/fraud behind clean interfaces (stubbed now, real vendors later). Every AI output is logged with confidence.
2. **Human-in-the-loop + QA** — AI does it → a human approves → QA verifies. Low-confidence outputs route to a human.
3. **Connected via API** — API-first; auctions plug in through `AuctionConnector` adapters; embeddable "Deliver with Navastar" widget.

## Monorepo layout
```
apps/web          React + Vite + TS + Tailwind  (Deliver-with-Navastar flow)
apps/api          Fastify + TS  (REST, JWT auth, RBAC, event bus + outbox)
packages/db       Prisma schema, seed, custody hash-chain helpers
packages/shared   env, RBAC, money math, AI envelope + 8 AI interfaces (stub), contracts
packages/connectors  AuctionConnector + 7 adapters (BidNow, Auctora, Auction of America, Copart, IAA, Manheim, ADESA)
packages/providers   MapProvider (OSM→HERE), Storage (S3/MinIO), EscrowConnector
docs/             brief + architecture + roadmap
```

## Prerequisites
- **Node 20+** and **pnpm 9+** (`corepack enable` then `corepack prepare pnpm@9 --activate`)
- **Docker** (for Postgres + MinIO)

## Run it locally
```bash
# 0. from the repo root
cp .env.example .env

# 1. install
pnpm install

# 2. start infra (Postgres + MinIO)
pnpm infra:up            # docker compose up -d

# 3. create schema + generate client + seed demo data
pnpm db:generate
pnpm db:push
pnpm db:seed

# 4. run API + web together
pnpm dev
```
- API → http://localhost:4000  (`GET /health`, `GET /ready`)
- Web → http://localhost:5173
- MinIO console → http://localhost:9001  (user/pass from `.env`)

### Try the flow
1. Open the web app and sign in as **buyer@demo.navastar** / **password123**.
2. **Deliver with Navastar** tab → *Deliver with Navastar →* creates a draft shipment from a won BidNow lot.
3. *Get AI quote* → instant AI-priced quote with a **confidence badge** (low confidence shows "routes to human review").
4. *Book this quote* → returns a **tracking id** (`NAV-XXXX-XXXX`).
5. **Track** tab → paste the tracking id to see status + the **hash-chained custody timeline**.

Other demo logins (all `password123`): `dispatch@demo.navastar` (can see margin), `admin@demo.navastar`, `qa@demo.navastar`, `driver@demo.navastar`.

## Test
```bash
pnpm db:generate   # required once so @navastar/db can import the client
pnpm test          # unit tests: money/margin, RBAC, custody hash-chain, connectors, API guards
```

## API quick reference (Module 1)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | get a JWT |
| GET | `/api/connectors` | public | list auction adapters + widget config |
| POST | `/api/auction/lots` | `auction_lot:create` | won lot → draft shipment |
| POST | `/api/quotes` | `quote:create` | AI instant quote |
| POST | `/api/shipments/:id/book` | `shipment:book` | accept quote → tracking id |
| GET | `/api/shipments/:id` | any authed | status + custody timeline (margin stripped) |
| GET | `/api/shipments/:id/track` | any authed | recent positions, current, ETA, pickup/dropoff |
| POST | `/api/shipments/:id/tracking` | `shipment:track` | ingest a live position (driver/device) |
| POST | `/api/shipments/:id/simulate` | `dispatch:assign` | demo: move shipment pickup→dropoff |
| WS | `/ws/shipments/:id?token=` | valid JWT | live `tracking.point` / `shipment.status` stream |

### Try live tracking (Module 2)
Book a shipment (Module 1 flow), copy its tracking id, then in the **Track** tab paste it.
Sign in as `dispatch@demo.navastar` and click **▶ Simulate movement** — the map marker
walks the lane, ETA recomputes, and status advances (PICKED_UP → IN_TRANSIT → DELIVERED)
live over the WebSocket.

### Try the Driver app (Module 3)
Sign in as `driver@demo.navastar` → **Driver app** tab → open a job:
1. **Run AI walk-around** → condition score + AI findings appear on a vehicle diagram; click panels to add damage, edit severities, then **Approve** (human-in-the-loop; QA verifies later).
2. **Auto-read** VIN + odometer (OCR stub).
3. **Complete pickup** → status advances.
4. **Delivery** → sign on the pad, attach photos, **Submit POD** → Delivered. Photos/signature upload **directly to MinIO** via presigned URLs; POD fires the escrow-release hook.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/driver/jobs` | `driver_jobs:read` | active jobs (margin stripped) |
| POST | `/api/uploads/presign` | `media:upload` | presigned direct-to-storage PUT |
| POST | `/api/shipments/:id/inspections` | `inspection:submit` | AI walk-around → findings |
| POST | `/api/inspections/:id/approve` | `inspection:submit` | driver approves/edits findings |
| POST | `/api/shipments/:id/ocr` | `inspection:submit` | VIN/odometer OCR |
| POST | `/api/shipments/:id/pickup` | `inspection:submit` | complete pickup |
| POST | `/api/shipments/:id/pod` | `pod:submit` | signature + photo POD → Delivered |

### Try the Ops dashboard (Module 4)
Sign in as `dispatch@demo.navastar` → **Ops** tab: KPI cards (GMV, revenue, blended take
rate, needs-review…), a filterable **shipments table** (margin column visible to
dispatch/admin), the **exceptions / human-review queue**, and the **Global GPS map** of
active drivers (fleet = blue, contractor = red). Click **▶** on a driver in the roster to
roam them — the dot moves live over the ops WebSocket.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/ops/kpis` | `ops_dashboard:read` | operation KPIs |
| GET | `/api/ops/shipments` | `ops_dashboard:read` | filterable shipments table |
| GET | `/api/ops/drivers` | `ops_dashboard:read` | fleet roster (+ positions) |
| GET | `/api/ops/exceptions` | `ops_dashboard:read` | exceptions + review queue |
| WS | `/ws/ops?token=` | valid JWT | live `driver.location` stream |

Deployment to a self-hosted Hetzner server (Caddy auto-HTTPS, nightly backups,
one-command deploy) is added in the deployment phase — see the roadmap.
