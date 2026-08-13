# Navastar Logistics — Master Brief

> Build the full "Navastar Logistics" platform — an AI-powered, multi-commodity transport & logistics operating system that is also a licensed property broker, with vehicle auctions as the launch channel.

## THREE PILLARS (apply everywhere)

### 1. AI-FIRST
AI runs the engine — pricing, dispatch/matching, ETA, damage inspection, document OCR (BOL/VIN/odometer), fraud/risk, forecasting, support copilot. Build it, and position it, as an AI-powered platform. Stub AI behind clean interfaces now so real vendors plug in later.

### 2. HUMAN-IN-THE-LOOP + QA
AI does the work, a human can review/override (especially photos/video and damage findings), and a QA function audits behind both the AI and the drivers. Rule: AI does it → a human approves → QA verifies. Every AI output stores `{model, version, confidence, decidedBy:'ai'|'human', approvedBy, qaStatus, timestamp}`; below a configurable confidence it routes to a human.

### 3. CONNECTED VIA API
API-first; the platform lives inside auction sites and partner systems. Provide an embeddable "Deliver with Navastar" widget/SDK. Build a pluggable AuctionConnector interface with concrete adapters for launch partners — BidNow, Auctora, and Auction of America — plus the major houses (Copart, IAA, Manheim, ADESA). Each adapter: import won lots, push status/tracking back, and render the "Deliver with Navastar" button/widget. New auctions are added by dropping in a new adapter, not by changing core code.

## STACK
- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Node + TypeScript (Fastify), Postgres via Prisma
- Real-time: WebSocket/SSE
- Maps: Leaflet+OSM for MVP; **HERE Maps for production** (automotive-grade + truck routing)
- Media storage: **MinIO** (S3-compatible, self-hosted)
- Payments: **Stripe** (charges, payouts, Connect, instant payouts)
- Domain: **navastarlogistics.com**
- Auth: JWT + roles
- Event bus: in-process emitter + transactional outbox; swappable for Kafka
- Docker Compose for Postgres + MinIO; Caddy reverse proxy

## BRAND
- Primary blue: #203088
- Accent/CTA red: #B4182A
- Bright accent: #E4181E
- Silver: #B0B0B8
- Charcoal: #333333
- Background: #F2F4F7
- Headings: Montserrat/Arial Black (bold sans)
- Body: Inter/Arial
- Logo: text wordmark "NAVA"(blue)+"STAR"(red)+"LOGISTICS"(grey)

## ROLES
customer/auction buyer, independent carrier, employee driver (W-2), lease-on operator, dispatcher/ops, QA reviewer, admin, auction/API partner, equipment lessor

## DATA MODEL (Prisma)
Shipment, Leg, Party, CargoItem, HandlingProfile, Carrier, Driver, Vehicle/Asset, CustodyEvent (append-only, hash-chained), TrackingPoint, Document, Inspection (+Finding), Payment/Settlement, EscrowTransaction (state machine), AuctionLot, AuctionPartner, EquipmentListing/Lease, QAReview, AIDecision, Rating, Insurance/Claim, User/Role, LoadPost, Bid, Subscription, RevenueConfig, Commodity, Outbox

## MODULES (build in phase order)

### PHASE 1 — MVP (core loop)
1. Auction intake (API + UI): won lot → draft shipment → AI quote → Book
2. Customer tracking: live map + ETA + status timeline
3. Driver app: job list, AI walk-around inspection, VIN/odometer OCR, delivery with signature + photo POD
4. Ops dashboard: KPIs, shipments table, exceptions, global GPS fleet map
5. QA console: review queue, AI findings + custody + POD, Pass/Fix/Fail

### PHASE 2 — Brokerage & network
7. Dispatch & matching engine (capability + proximity + economics + trust)
8. Load board: overflow loads, per-load fee, subscription access
9. Carrier & driver onboarding (dual track: W-2 + independent)
10. Payments, settlement & pay models: Stripe, escrow, quick-pay
11. Escrow/assurance instant-payout (BOL sign-off = release trigger)

### PHASE 3 — Platform & partners
12. Public/Partner API + webhooks + OpenAPI + SDK
13. Custody & compliance: hash-chained events, commodity rules
14. Ratings & trust, Insurance & claims, Carrier monitoring (FMCSA)
15. Revenue & Monetization admin backboard (7 revenue streams)

### PHASE 4 — Expansion
16. Multi-commodity handling profiles
17. Equipment leasing marketplace

## AI INTERFACES
`aiPricing`, `aiMatching`, `aiInspection`, `aiEta`, `documentOcr`, `carrierLookup` (FMCSA), `supportCopilot`, `fraudRisk`. Each returns confidence + logs AIDecision.

## REVENUE STREAMS (all DB-backed, admin-editable)
1. Margin % per commodity
2. Subscription tiers/prices
3. Quick-pay fee %
4. Load-board connection fee
5. Payment/escrow assurance fee
6. Value-add pricing

## NON-NEGOTIABLES
- API-first
- CustodyEvents append-only + hash-chained
- Drivers never see Navastar's margin
- Every AI decision has confidence + human-approval + QA hook
- Seed demo data so every screen has content
- RBAC on every endpoint
- Basic tests per module

## DEPLOYMENT
- Self-hosted on Hetzner
- Docker Compose: web, api, postgres, MinIO, Caddy
- Caddy with automatic HTTPS + WebSocket upgrade
- Nightly pg_dump backup
- One-command deploy: `git pull && docker compose up -d --build`
- Domain: navastarlogistics.com
