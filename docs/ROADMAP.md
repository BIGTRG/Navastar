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
- ✅ **Module 6 — Dispatch & matching engine**: scores active drivers on capability + proximity (MapProvider) + economics (payout − deadhead) + trust (driver+carrier), ranks eligible-first, logged as an AI MATCHING decision with confidence. Auto-assign best or dispatcher-choose; assignment creates a Leg with driver payout (margin hidden), advances to ASSIGNED with custody event + live/outbox events. Web Dispatch board with factor bars.
- ✅ **Module 7 — Load board**: ops posts booked/unassigned shipments as overflow loads; vetted carriers with an **active subscription** browse + bid; ops views bids (carrier trust/safety/authority) and awards → assigns the load to the winning carrier and charges a **per-load connection fee** (Payment, inbound revenue). New models: LoadPost, Bid, Subscription, and **RevenueConfig** (single-row, DB-backed levers for all six streams — Module 13's admin backboard builds on it). Web Load board (carrier bid view + ops post/award view).
- ✅ **Module 8 — Carrier & driver onboarding**: dual track (Employee W-2 / Independent / lease-on); FMCSA QCMobile auto-fill by DOT/MC (carrierLookup stub, logged as AI CARRIER_LOOKUP); carrier insurance + authority capture; license + background-check stub for employees; ops verification queue. New: OnboardingStatus + driver/carrier onboarding fields.
- ✅ **Module 9 — Payments, settlement & escrow**: fee collected UP FRONT at booking (event-driven) opening escrow FEE_COLLECTED→FUNDS_HELD; POD/BOL sign-off (pod.signed) fires BOL_SIGNED→RELEASED + creates a payout; standard payout WEEKLY & FREE (settle-weekly) vs opt-in quick-pay (instant, fee — both drivers & carriers, its own revenue stream); EscrowConnector stub drives the state machine. Drivers/carriers see only their own net pay. Web Pay tab (my payouts + quick-pay, weekly settlement).

## Phase 3 — Platform & partners
- ✅ **Module 10 — Public/Partner API + webhooks + OpenAPI + widget**: partner API-key auth (x-api-key → AuctionPartner); partner endpoints to import lots + track + register webhooks; HMAC-signed webhook delivery on subscribed bus events (WebhookEndpoint/WebhookDelivery); OpenAPI 3 spec at `/api/openapi.json` + interactive docs at `/api/docs`; embeddable "Deliver with Navastar" widget served at `/api/widget.js`.
- ✅ **Module 11 — Custody & compliance service**: commodity rules engine (pure rule functions: commodity-enabled gate, Live-Animals gate, enclosed-required, hazmat endorsement, high-value handling, VIN-present) returning severity-tagged violations; custody chain **verify** (tamper-evidence) + **export** (evidence with hashes). Web Compliance tab.
- ✅ **Module 12 — Ratings & trust; Insurance & claims; Carrier-monitoring**: ratings feed driver/carrier trust; insurance capture; claims desk (file/list/status); **carrier-monitoring (separate from GPS)** — FMCSA authority, insurance validity + lapse alerts (≤30d/expired), safety/trust/risk scores, refresh re-pulls carrierLookup (FMCSA) + fraudRisk (double-broker) — both stubs, vendor-adapter seam for Highway/MyCarrierPortal/Carrier411. New carrier fields riskScore/lastMonitoredAt. Web Trust & Risk tab.
- ✅ **Module 13 — Revenue & Monetization admin backboard**: one control panel for all SIX streams (margin % per commodity, subscription tier prices, quick-pay fee %, load-board connection fee, escrow/assurance fee %, value-add), every lever DB-backed via RevenueConfig (no redeploy); commodity on/off toggles (Live Animals OFF until flipped). Live dashboard: GMV, revenue by stream, MRR, blended take rate. Web Revenue admin tab (admin only).

## Phase 4 — Expansion
- ✅ **Module 14 — Multi-commodity + equipment leasing**: create draft shipments for ANY enabled commodity (boats/equipment/freight/white-glove/high-value/live-animals-when-on) with a handling profile — quote/book flow then applies; disabled commodities rejected by the rules engine. Equipment leasing marketplace: lessors list, carriers/operators lease (reserves the listing). Web Equipment tab + "Ship any commodity" card.
- ✅ **Module 15 — Deeper AI**: per-capability vendor routing via CompositeAIProvider (inspection → Ravin / ProovStation-UVeye / **our own model**; OCR → vendor; selected by env, zero-key fallback to stub) — real vendors drop in with no call-site changes. Support copilot endpoint (AI-first + human handoff), demand/revenue forecasting, on-demand fraud check; each AI call logged via runAi. Web Copilot tab (support chat + ops forecast).

## Deployment (self-hosted on Hetzner)
- ✅ **`docker-compose.prod.yml`** — web (Caddy: SPA + auto-HTTPS + reverse-proxy for API & WebSocket) + api + postgres (persistent volume) + minio (+ bucket setup). Dockerfiles for api (tsx runtime, Alpine + musl Prisma engine) and web (build → Caddy).
- ✅ **Nightly pg_dump backup** sidecar (keeps last 14) + **one-command deploy** (`scripts/deploy.sh` = git pull && compose up -d --build) + **"Deploy to your own Hetzner server"** guide ([docs/DEPLOY.md](./DEPLOY.md): DNS A record, ufw 22/80/443, MinIO media, restores).
