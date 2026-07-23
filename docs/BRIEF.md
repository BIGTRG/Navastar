# Navastar Logistics — Master Brief

> This is the canonical product brief, saved verbatim so the spec lives in the repo.
> Architecture decisions derived from it live in [ARCHITECTURE.md](./ARCHITECTURE.md).
> Build order and checkpoint status live in [ROADMAP.md](./ROADMAP.md).

---

Build the full "Navastar Logistics" platform — an AI-powered, multi-commodity transport & logistics operating system that is also a licensed property broker, with vehicle auctions as the launch channel. This is a large system: build it in PHASES, module by module. After each module, stop, show me what you built and how to run it, and wait for my go before the next. Ask before any irreversible decision.

Treat this message as the master brief. Also create a /docs folder and save this brief plus an architecture README so the spec lives in the repo.

## THREE PILLARS (apply everywhere)
1. AI-FIRST: AI runs the engine — pricing, dispatch/matching, ETA, damage inspection, document OCR (BOL/VIN/odometer), fraud/risk, forecasting, support copilot. Build it, and position it, as an AI-powered platform. Stub AI behind clean interfaces now so real vendors plug in later.
2. HUMAN-IN-THE-LOOP + QA: AI does the work, a human can review/override (especially photos/video and damage findings), and a QA function audits behind both the AI and the drivers. Rule: AI does it → a human approves → QA verifies. Every AI output stores {model, version, confidence, decidedBy:'ai'|'human', approvedBy, qaStatus, timestamp}; below a configurable confidence it routes to a human.
3. CONNECTED VIA API: API-first; the platform lives inside auction sites and partner systems. Provide an embeddable "Deliver with Navastar" widget/SDK. Build a pluggable AuctionConnector interface with concrete adapters for our launch partners — BidNow, Auctora, and Auction of America — plus the major houses (Copart, IAA, Manheim, ADESA). Each adapter: import won lots, push status/tracking back, and render the "Deliver with Navastar" button/widget. New auctions are added by dropping in a new adapter, not by changing core code.

## STACK
Frontend: React + Vite + TypeScript + Tailwind. Backend: Node + TypeScript (Fastify), Postgres via Prisma. Real-time: WebSocket/SSE. Maps: Leaflet+OSM for the MVP behind a clean MapProvider adapter; wire HERE Maps for production (automotive-grade data + truck-specific routing — height/weight/hazmat). Media storage: MinIO (S3-compatible, self-hosted) via an S3 adapter. Domain: navastarlogistics.com. Auth: JWT + roles. Event bus: in-process emitter + transactional outbox, swappable for Kafka. docker-compose for Postgres + MinIO; seed demo data.

## ROLES
customer/auction buyer, independent carrier, employee driver (W-2), lease-on operator, dispatcher/ops, QA reviewer, admin, auction/API partner, equipment lessor.

## DATA MODEL (Prisma)
Shipment, Leg, Party, CargoItem (vehicle: vin/make/model + generic attrs), HandlingProfile, Carrier, Driver, Vehicle/Asset, CustodyEvent (append-only, hash-chained), TrackingPoint, Document, Inspection (+Finding), Payment/Settlement, EscrowTransaction (FEE_COLLECTED→FUNDS_HELD→BOL_SIGNED→RELEASED→PAID), AuctionLot, AuctionPartner (BidNow, Auctora, Auction of America, Copart, IAA, Manheim, ADESA), EquipmentListing/Lease, QAReview, AIDecision, Rating, Insurance/Claim, User/Role.

## MODULES (build in this phase order)

### PHASE 1 — MVP
1. Auction intake (API + UI): POST /api/auction/lots → draft shipment; "Deliver with Navastar" → POST /api/quotes (AI pricing) → instant quote → Book (returns tracking id).
2. Customer tracking: GET /api/shipments/:id + live location over WS; live map, ETA, status timeline.
3. Driver app: job list; guided pickup with AI walk-around inspection (stub) → condition score + findings on a vehicle diagram the driver approves/edits; auto-read VIN/odometer (stub); delivery with signature + photo POD.
4. Ops dashboard: KPIs, shipments table (fleet or carrier), exceptions; Global GPS map of all active drivers (fleet=blue, contractor=red) + roster + filters.
5. QA console: review queue; AI findings + custody + POD; Pass/Fix/Fail; feeds reliability scores.

### PHASE 2 — Brokerage & network
6. Dispatch & matching engine (capability + proximity + economics + trust; auto-assign or offer).
7. Load board: overflow loads for vetted carriers to bid on; per-load connection fee; subscription access.
8. Carrier & driver onboarding: dual track — Employee (W-2) and Independent/lease-on. FMCSA QCMobile auto-fill by DOT/MC; carrier insurance/authority monitoring; license-scan + background for employees.
9. Payments, settlement & pay models: card/ACH, escrow, quick-pay (no cash); margin = customer rate × (1 − margin%), per commodity; drivers see only their pay. Fee collected UP FRONT at booking; standard payout WEEKLY & FREE; instant/same-day "quick-pay" is opt-in and charges a fee — for BOTH outside carriers AND our own drivers — its own revenue stream. Escrow/assurance fee applies on BOTH sides (configurable, TBD).
   - ESCROW / ASSURANCE INSTANT-PAYOUT: pluggable EscrowConnector; fee up front, balance held; BOL sign-off = release event → paid directly same-day; digital-BOL e-sign fires the release. State machine FEE_COLLECTED→FUNDS_HELD→BOL_SIGNED→RELEASED→PAID. Stub now, real provider via env config.

### PHASE 3 — Platform & partners
10. Public/Partner API + webhooks + OpenAPI + sandbox; embeddable "Deliver with Navastar" widget/SDK.
11. Custody & compliance service: hash-chained custody events; commodity rules engine.
12. Ratings & trust; Insurance & claims; Carrier-monitoring service (SEPARATE from GPS — FMCSA authority active, insurance valid today with lapse alerts, safety score, fraud/double-broker risk; FMCSA free feed now, vendor adapter for Highway/MyCarrierPortal/Carrier411).
13. Revenue & Monetization admin backboard — control panel for all SIX streams: (1) margin % per commodity, (2) subscription tiers/prices, (3) quick-pay fee %, (4) load-board connection fee, (5) payment/escrow fee, (6) value-add pricing. Live dashboard: GMV, revenue by stream, MRR, blended take rate. All levers DB-backed (no redeploy). Also: commodity on/off toggles (Live Animals ships OFF, flip ON when ready).

### PHASE 4 — Expansion
14. Multi-commodity handling profiles (boats, equipment, freight, white-glove, high-value, live animals when toggled on); equipment leasing marketplace.
15. Deeper AI: real vendors (damage AI — Ravin AI for phone walk-around, UVeye/ProovStation for drive-through lanes later; OCR; support copilot; forecasting; fraud). Design so we can train and swap in our OWN inspection model later.

## AI INTERFACES (stub now, wire real later)
aiPricing, aiMatching, aiInspection, aiEta, documentOcr, carrierLookup(FMCSA), supportCopilot, fraudRisk. Each returns a confidence and logs an AIDecision.

## NON-NEGOTIABLES
API-first; CustodyEvents append-only + hash-chained; drivers never see Navastar's margin; every AI decision has confidence + human-approval + QA hook; seed demo data; RBAC on every endpoint; basic tests per module.

## DEPLOYMENT (self-hosted on Hetzner)
Production docker-compose.yml: web, api, postgres (persistent volume), MinIO, Caddy reverse proxy w/ auto-HTTPS (pass WebSocket upgrade headers). All config in .env.example (DB, JWT, domain=navastarlogistics.com, HERE key, MinIO keys). Nightly pg_dump backup; one-command deploy (git pull && docker compose up -d --build); README "Deploy to your own Hetzner server" (DNS A record, ufw 22/80/443). Runnable locally first with docker compose up.

Start now: scaffold the monorepo (web + api + db + docs), set up Prisma schema + seed, then build PHASE 1 module 1. Show me the plan first.
