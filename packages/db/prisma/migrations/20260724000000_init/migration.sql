-- CreateEnum
CREATE TYPE "Role" AS ENUM ('customer', 'independent_carrier', 'employee_driver', 'lease_operator', 'dispatcher', 'qa_reviewer', 'admin', 'auction_partner', 'equipment_lessor');

-- CreateEnum
CREATE TYPE "CommodityType" AS ENUM ('VEHICLE', 'BOAT', 'EQUIPMENT', 'FREIGHT', 'WHITE_GLOVE', 'HIGH_VALUE', 'LIVE_ANIMALS');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'QUOTED', 'BOOKED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LegStatus" AS ENUM ('PLANNED', 'ASSIGNED', 'EN_ROUTE_PICKUP', 'AT_PICKUP', 'LOADED', 'EN_ROUTE_DROPOFF', 'AT_DROPOFF', 'DELIVERED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('BUYER', 'SELLER', 'SHIPPER', 'CONSIGNEE', 'PICKUP_CONTACT', 'DROPOFF_CONTACT');

-- CreateEnum
CREATE TYPE "CarrierKind" AS ENUM ('INTERNAL_FLEET', 'INDEPENDENT');

-- CreateEnum
CREATE TYPE "DriverType" AS ENUM ('EMPLOYEE_W2', 'INDEPENDENT', 'LEASE_ON');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('TRUCK', 'TRAILER', 'CAR_HAULER', 'FLATBED', 'ENCLOSED', 'OTHER');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CustodyEventType" AS ENUM ('CREATED', 'QUOTED', 'BOOKED', 'ASSIGNED', 'PICKUP_ARRIVED', 'INSPECTED_PICKUP', 'LOADED', 'IN_TRANSIT', 'DROPOFF_ARRIVED', 'INSPECTED_DROPOFF', 'POD_SIGNED', 'DELIVERED', 'EXCEPTION', 'HANDOFF');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BOL', 'POD', 'TITLE', 'INSPECTION_PHOTO', 'INSPECTION_VIDEO', 'SIGNATURE', 'VIN_PHOTO', 'ODOMETER_PHOTO', 'INSURANCE_CERT', 'OTHER');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('PICKUP', 'DROPOFF', 'INTERIM');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('INFO', 'MINOR', 'MODERATE', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AIDecisionKind" AS ENUM ('PRICING', 'MATCHING', 'INSPECTION', 'ETA', 'DOCUMENT_OCR', 'CARRIER_LOOKUP', 'SUPPORT_COPILOT', 'FRAUD_RISK');

-- CreateEnum
CREATE TYPE "DecidedBy" AS ENUM ('ai', 'human');

-- CreateEnum
CREATE TYPE "QAStatus" AS ENUM ('pending', 'pass', 'fix', 'fail');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('INBOUND', 'PAYOUT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'ACH', 'ESCROW', 'QUICK_PAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'SETTLED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EscrowState" AS ENUM ('FEE_COLLECTED', 'FUNDS_HELD', 'BOL_SIGNED', 'RELEASED', 'PAID');

-- CreateEnum
CREATE TYPE "AuctionPartnerCode" AS ENUM ('BIDNOW', 'AUCTORA', 'AUCTION_OF_AMERICA', 'COPART', 'IAA', 'MANHEIM', 'ADESA');

-- CreateEnum
CREATE TYPE "InsuranceType" AS ENUM ('CARGO', 'LIABILITY', 'PHYSICAL_DAMAGE');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'APPROVED', 'DENIED', 'PAID', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('LISTED', 'RESERVED', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('PENDING', 'DOCS_SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "LoadPostStatus" AS ENUM ('OPEN', 'AWARDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PRO', 'FLEET');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "roles" "Role"[] DEFAULT ARRAY['customer']::"Role"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commodity" (
    "id" TEXT NOT NULL,
    "type" "CommodityType" NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "marginBps" INTEGER NOT NULL DEFAULT 1500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commodity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "line1" TEXT,
    "line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postal" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "kind" "CarrierKind" NOT NULL DEFAULT 'INDEPENDENT',
    "legalName" TEXT NOT NULL,
    "dba" TEXT,
    "dotNumber" TEXT,
    "mcNumber" TEXT,
    "authorityActive" BOOLEAN NOT NULL DEFAULT false,
    "safetyScore" INTEGER,
    "trustScore" INTEGER NOT NULL DEFAULT 50,
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "fmcsaVerifiedAt" TIMESTAMP(3),
    "riskScore" INTEGER,
    "lastMonitoredAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "type" "DriverType" NOT NULL DEFAULT 'INDEPENDENT',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "licenseNo" TEXT,
    "licenseState" TEXT,
    "licenseVerified" BOOLEAN NOT NULL DEFAULT false,
    "backgroundCheckStatus" TEXT,
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'PENDING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "trustScore" INTEGER NOT NULL DEFAULT 50,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "userId" TEXT,
    "carrierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "label" TEXT NOT NULL,
    "plate" TEXT,
    "capacity" INTEGER,
    "carrierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionPartner" (
    "id" TEXT NOT NULL,
    "code" "AuctionPartnerCode" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "apiKeyHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PENDING',
    "responseCode" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionLot" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "externalLotId" TEXT NOT NULL,
    "vin" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "title" TEXT,
    "salePriceCents" INTEGER,
    "buyerName" TEXT,
    "buyerEmail" TEXT,
    "location" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandlingProfile" (
    "id" TEXT NOT NULL,
    "commodity" "CommodityType" NOT NULL,
    "name" TEXT NOT NULL,
    "requiresEnclosed" BOOLEAN NOT NULL DEFAULT false,
    "requiresLiftgate" BOOLEAN NOT NULL DEFAULT false,
    "hazmat" BOOLEAN NOT NULL DEFAULT false,
    "liveCargo" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandlingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "commodityId" TEXT NOT NULL,
    "buyerId" TEXT,
    "pickupId" TEXT,
    "dropoffId" TEXT,
    "auctionLotId" TEXT,
    "ownerUserId" TEXT,
    "quotedPriceCents" INTEGER,
    "marginBps" INTEGER,
    "distanceMiles" DOUBLE PRECISION,
    "etaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "profileId" TEXT,
    "description" TEXT NOT NULL,
    "vin" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "odometer" INTEGER,
    "attrs" JSONB,
    "valueCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Leg" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" "LegStatus" NOT NULL DEFAULT 'PLANNED',
    "originLabel" TEXT,
    "destLabel" TEXT,
    "originLat" DOUBLE PRECISION,
    "originLng" DOUBLE PRECISION,
    "destLat" DOUBLE PRECISION,
    "destLng" DOUBLE PRECISION,
    "carrierId" TEXT,
    "driverId" TEXT,
    "assetId" TEXT,
    "payoutCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustodyEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "CustodyEventType" NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustodyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingPoint" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedMph" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT,
    "type" "DocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "cargoItemId" TEXT,
    "driverId" TEXT,
    "type" "InspectionType" NOT NULL,
    "conditionScore" INTEGER,
    "aiDecisionId" TEXT,
    "approvedByUserId" TEXT,
    "qaStatus" "QAStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "panel" TEXT,
    "kind" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL DEFAULT 'MINOR',
    "note" TEXT,
    "source" "DecidedBy" NOT NULL DEFAULT 'ai',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIDecision" (
    "id" TEXT NOT NULL,
    "kind" "AIDecisionKind" NOT NULL,
    "shipmentId" TEXT,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "decidedBy" "DecidedBy" NOT NULL DEFAULT 'ai',
    "approvedByUserId" TEXT,
    "qaStatus" "QAStatus" NOT NULL DEFAULT 'pending',
    "needsHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QAReview" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT,
    "aiDecisionId" TEXT,
    "reviewerId" TEXT,
    "status" "QAStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "QAReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "driverId" TEXT,
    "carrierId" TEXT,
    "quickPay" BOOLEAN NOT NULL DEFAULT false,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscrowTransaction" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "state" "EscrowState" NOT NULL DEFAULT 'FEE_COLLECTED',
    "provider" TEXT NOT NULL DEFAULT 'stub',
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "heldCents" INTEGER NOT NULL DEFAULT 0,
    "releasedCents" INTEGER NOT NULL DEFAULT 0,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscrowTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT,
    "authorId" TEXT,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insurance" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "type" "InsuranceType" NOT NULL,
    "provider" TEXT NOT NULL,
    "policyNo" TEXT,
    "coverageCents" INTEGER,
    "effectiveAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'OPEN',
    "amountCents" INTEGER,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "distanceMiles" DOUBLE PRECISION,
    "etaAt" TIMESTAMP(3),
    "status" "QuoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "aiDecisionId" TEXT,
    "model" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentListing" (
    "id" TEXT NOT NULL,
    "lessorUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "description" TEXT,
    "dailyRateCents" INTEGER NOT NULL,
    "location" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "lesseeUserId" TEXT NOT NULL,
    "status" "LeaseStatus" NOT NULL DEFAULT 'LISTED',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "rateCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadPost" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "postedByUserId" TEXT,
    "status" "LoadPostStatus" NOT NULL DEFAULT 'OPEN',
    "targetPayoutCents" INTEGER,
    "minBidCents" INTEGER,
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "loadPostId" TEXT NOT NULL,
    "carrierId" TEXT,
    "bidderUserId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "status" "BidStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "renewsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueConfig" (
    "id" TEXT NOT NULL DEFAULT 'revenue',
    "subFreePriceCents" INTEGER NOT NULL DEFAULT 0,
    "subProPriceCents" INTEGER NOT NULL DEFAULT 9900,
    "subFleetPriceCents" INTEGER NOT NULL DEFAULT 29900,
    "quickPayFeeBps" INTEGER NOT NULL DEFAULT 150,
    "loadBoardConnectionFeeCents" INTEGER NOT NULL DEFAULT 4900,
    "escrowFeeBps" INTEGER NOT NULL DEFAULT 100,
    "valueAddPricing" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Commodity_type_key" ON "Commodity"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_dotNumber_key" ON "Carrier"("dotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_mcNumber_key" ON "Carrier"("mcNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionPartner_code_key" ON "AuctionPartner"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionPartner_apiKeyHash_key" ON "AuctionPartner"("apiKeyHash");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_partnerId_idx" ON "WebhookEndpoint"("partnerId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_idx" ON "WebhookDelivery"("endpointId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionLot_partnerId_externalLotId_key" ON "AuctionLot"("partnerId", "externalLotId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingId_key" ON "Shipment"("trackingId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_auctionLotId_key" ON "Shipment"("auctionLotId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_commodityId_idx" ON "Shipment"("commodityId");

-- CreateIndex
CREATE INDEX "Shipment_ownerUserId_idx" ON "Shipment"("ownerUserId");

-- CreateIndex
CREATE INDEX "Leg_shipmentId_idx" ON "Leg"("shipmentId");

-- CreateIndex
CREATE INDEX "Leg_driverId_idx" ON "Leg"("driverId");

-- CreateIndex
CREATE INDEX "CustodyEvent_shipmentId_idx" ON "CustodyEvent"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CustodyEvent_shipmentId_sequence_key" ON "CustodyEvent"("shipmentId", "sequence");

-- CreateIndex
CREATE INDEX "TrackingPoint_shipmentId_recordedAt_idx" ON "TrackingPoint"("shipmentId", "recordedAt");

-- CreateIndex
CREATE INDEX "Document_shipmentId_idx" ON "Document"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_aiDecisionId_key" ON "Inspection"("aiDecisionId");

-- CreateIndex
CREATE INDEX "Inspection_shipmentId_idx" ON "Inspection"("shipmentId");

-- CreateIndex
CREATE INDEX "AIDecision_kind_idx" ON "AIDecision"("kind");

-- CreateIndex
CREATE INDEX "AIDecision_shipmentId_idx" ON "AIDecision"("shipmentId");

-- CreateIndex
CREATE INDEX "AIDecision_needsHumanReview_idx" ON "AIDecision"("needsHumanReview");

-- CreateIndex
CREATE INDEX "QAReview_status_idx" ON "QAReview"("status");

-- CreateIndex
CREATE INDEX "Payment_shipmentId_idx" ON "Payment"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EscrowTransaction_shipmentId_key" ON "EscrowTransaction"("shipmentId");

-- CreateIndex
CREATE INDEX "Rating_subjectType_subjectId_idx" ON "Rating"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Insurance_carrierId_idx" ON "Insurance"("carrierId");

-- CreateIndex
CREATE INDEX "Quote_shipmentId_idx" ON "Quote"("shipmentId");

-- CreateIndex
CREATE INDEX "Outbox_publishedAt_idx" ON "Outbox"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoadPost_shipmentId_key" ON "LoadPost"("shipmentId");

-- CreateIndex
CREATE INDEX "LoadPost_status_idx" ON "LoadPost"("status");

-- CreateIndex
CREATE INDEX "Bid_loadPostId_idx" ON "Bid"("loadPostId");

-- CreateIndex
CREATE INDEX "Bid_carrierId_idx" ON "Bid"("carrierId");

-- CreateIndex
CREATE INDEX "Subscription_carrierId_idx" ON "Subscription"("carrierId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Carrier" ADD CONSTRAINT "Carrier_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AuctionPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionLot" ADD CONSTRAINT "AuctionLot_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "AuctionPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_commodityId_fkey" FOREIGN KEY ("commodityId") REFERENCES "Commodity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_pickupId_fkey" FOREIGN KEY ("pickupId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_dropoffId_fkey" FOREIGN KEY ("dropoffId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_auctionLotId_fkey" FOREIGN KEY ("auctionLotId") REFERENCES "AuctionLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoItem" ADD CONSTRAINT "CargoItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoItem" ADD CONSTRAINT "CargoItem_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "HandlingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Leg" ADD CONSTRAINT "Leg_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustodyEvent" ADD CONSTRAINT "CustodyEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingPoint" ADD CONSTRAINT "TrackingPoint_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingPoint" ADD CONSTRAINT "TrackingPoint_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_cargoItemId_fkey" FOREIGN KEY ("cargoItemId") REFERENCES "CargoItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_aiDecisionId_fkey" FOREIGN KEY ("aiDecisionId") REFERENCES "AIDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIDecision" ADD CONSTRAINT "AIDecision_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIDecision" ADD CONSTRAINT "AIDecision_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QAReview" ADD CONSTRAINT "QAReview_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QAReview" ADD CONSTRAINT "QAReview_aiDecisionId_fkey" FOREIGN KEY ("aiDecisionId") REFERENCES "AIDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QAReview" ADD CONSTRAINT "QAReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscrowTransaction" ADD CONSTRAINT "EscrowTransaction_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insurance" ADD CONSTRAINT "Insurance_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "EquipmentListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadPost" ADD CONSTRAINT "LoadPost_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_loadPostId_fkey" FOREIGN KEY ("loadPostId") REFERENCES "LoadPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderUserId_fkey" FOREIGN KEY ("bidderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

