# Navastar — Build Roadmap & Checkpoint Log

One checkpoint per module. After each: stop, show what was built + how to run it, wait
for go. Legend: ✅ done · 🟡 in progress · ⬜ not started.

## Phase 0 — Foundation (scaffold)
- ✅ Monorepo scaffold (pnpm + Turborepo)
- ✅ `/docs` — brief + architecture + roadmap
- ✅ Prisma schema (full data model) + seed demo data
- ✅ docker-compose (Postgres + MinIO)
- ✅ Cross-cutting: AI envelope + AIDecision logger, hash-chained custody, event bus + outbox, RBAC matrix, provider adapters (Map/S3/Escrow), AuctionConnector + adapters

## Phase 1 — MVP
- ✅ **Module 1 — Auction intake** (API + UI): `POST /api/auction/lots` → draft shipment; "Deliver with Navastar" → `POST /api/quotes` (AI pricing) → instant quote → Book (returns tracking id)
- ✅ **Module 2 — Customer tracking**: live location over WebSocket (RealtimeHub + event-bus bridge), live Leaflet/OSM map, live ETA recompute via MapProvider, status timeline; demo movement simulator (`POST /api/shipments/:id/simulate`)
- ✅ **Module 3 — Driver app**: job list; guided pickup with AI walk-around inspection (condition score + findings on an editable vehicle diagram, human-approved), VIN/odometer OCR stub, complete-pickup; delivery with signature pad + photo POD. **Real MinIO/S3 storage adapter** (presigned direct-to-storage uploads). POD fires `pod.signed` (escrow-release hook for Module 9).
- ✅ **Module 4 — Ops dashboard**: KPIs (active/delivered/exceptions/GMV/revenue/blended take rate/avg AI confidence/needs-review), filterable shipments table (status/commodity/search, margin shown to margin:view roles), exceptions + human-review queue, and the **Global GPS map** of active drivers (fleet=blue / contractor=red) live over a WS ops channel with roster + filters + roam simulator.
- ✅ **Module 5 — QA console**: review queue (driver-approved inspections pending QA) showing AI findings (with source), the verified hash-chained custody chain, and POD/photos; Pass/Fix/Fail writes a QAReview + sets qaStatus on inspection & AIDecision; decisions feed driver/carrier reliability (trust) scores. Reliability leaderboard with pass rates. **Completes the AI → human-approve → QA-verify loop and closes Phase 1.**

## Phase 2 — Brokerage & network
- ⬜ Module 6 — Dispatch & matching engine
- ⬜ Module 7 — Load board
- ⬜ Module 8 — Carrier & driver onboarding (W-2 + independent/lease-on; FMCSA auto-fill)
- ⬜ Module 9 — Payments, settlement & pay models (escrow, quick-pay)

## Phase 3 — Platform & partners
- ⬜ Module 10 — Public/Partner API + webhooks + OpenAPI + sandbox + widget/SDK
- ⬜ Module 11 — Custody & compliance service (commodity rules engine)
- ⬜ Module 12 — Ratings & trust; Insurance & claims; Carrier-monitoring (separate from GPS)
- ⬜ Module 13 — Revenue & Monetization admin backboard (6 streams + commodity toggles)

## Phase 4 — Expansion
- ⬜ Module 14 — Multi-commodity handling profiles + equipment leasing marketplace
- ⬜ Module 15 — Deeper AI (real vendors; train/swap our own inspection model)

## Deployment (self-hosted on Hetzner)
- ⬜ `docker-compose.prod.yml` (web + api + postgres + minio + Caddy auto-HTTPS)
- ⬜ Nightly pg_dump backup + one-command deploy + "Deploy to your own Hetzner server" README
