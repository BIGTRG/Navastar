// The AuctionConnector seam. Every auction house — launch partners (BidNow,
// Auctora, Auction of America) and the majors (Copart, IAA, Manheim, ADESA) —
// is one adapter implementing this interface. Core never imports a concrete
// adapter; it goes through the registry. Adding a house = new file + register().
import type { AuctionPartnerCode } from "@navastar/db";

/** Canonical, normalized lot the platform understands. */
export interface NormalizedLot {
  externalLotId: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  title?: string;
  salePriceCents?: number;
  buyerName?: string;
  buyerEmail?: string;
  location?: string;
  lat?: number;
  lng?: number;
  raw?: Record<string, unknown>;
}

/** Whatever the intake endpoint received (already-normalized fields + raw blob). */
export interface RawLotInput extends Partial<NormalizedLot> {
  externalLotId: string;
  raw?: Record<string, unknown>;
}

export interface StatusPushInput {
  externalLotId: string;
  trackingId: string;
  status: string;
  etaAt?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface WidgetConfig {
  /** Button label rendered by the embeddable "Deliver with Navastar" widget. */
  label: string;
  /** Partner theming hook (brand color, etc.). */
  accent?: string;
  /** Deep-link template the widget uses to start intake for a lot. */
  intakePathTemplate: string; // e.g. "/deliver?partner=BIDNOW&lot={externalLotId}"
}

export interface AuctionConnector {
  code: AuctionPartnerCode;
  name: string;
  /** Map a partner payload to the canonical lot (partner-specific field names live here). */
  normalize(input: RawLotInput): NormalizedLot;
  /** Push status/tracking back to the partner. Stubbed for MVP (logs only). */
  pushStatus(input: StatusPushInput): Promise<{ ok: boolean; detail?: string }>;
  /** Config for the embeddable "Deliver with Navastar" button/widget. */
  widget(): WidgetConfig;
}
