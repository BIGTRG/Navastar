// Zod request/response contracts shared by API and web. API-first: these are the
// wire shapes. Keep them the single source of truth for both sides.
import { z } from "zod";

// ── Auth ──────────────────────────────────────────────────────
export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequest>;

// ── Auction intake (Module 1) ─────────────────────────────────
// Partners POST won lots. `partnerCode` selects the AuctionConnector adapter.
export const auctionLotIntake = z.object({
  partnerCode: z.enum([
    "BIDNOW",
    "AUCTORA",
    "AUCTION_OF_AMERICA",
    "COPART",
    "IAA",
    "MANHEIM",
    "ADESA",
  ]),
  externalLotId: z.string().min(1),
  vin: z.string().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  title: z.string().optional(),
  salePriceCents: z.number().int().nonnegative().optional(),
  buyerName: z.string().optional(),
  buyerEmail: z.string().email().optional(),
  location: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  // arbitrary original partner payload, retained for audit
  raw: z.record(z.unknown()).optional(),
});
export type AuctionLotIntake = z.infer<typeof auctionLotIntake>;

// ── Quote (Module 1) ──────────────────────────────────────────
export const quoteRequest = z.object({
  shipmentId: z.string().min(1),
  // pickup/dropoff can be provided now or already attached to the draft shipment
  dropoff: z
    .object({
      name: z.string().optional(),
      line1: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      postal: z.string().optional(),
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  enclosed: z.boolean().optional(),
});
export type QuoteRequest = z.infer<typeof quoteRequest>;

// ── Book (Module 1) ───────────────────────────────────────────
export const bookRequest = z.object({
  shipmentId: z.string().min(1),
  quoteId: z.string().min(1),
  contact: z
    .object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    })
    .optional(),
});
export type BookRequest = z.infer<typeof bookRequest>;
