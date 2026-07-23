// Concrete auction adapters. Launch partners first, then the majors. Most just
// name themselves; Copart/Manheim override normalize() to show partner-specific
// field mapping (their raw payloads use different keys).
import { AuctionPartnerCode } from "@navastar/db";
import { BaseConnector } from "./base.js";
import type { NormalizedLot, RawLotInput } from "./types.js";

// ── Launch partners ───────────────────────────────────────────
export class BidNowConnector extends BaseConnector {
  code = AuctionPartnerCode.BIDNOW;
  name = "BidNow";
}

export class AuctoraConnector extends BaseConnector {
  code = AuctionPartnerCode.AUCTORA;
  name = "Auctora";
}

export class AuctionOfAmericaConnector extends BaseConnector {
  code = AuctionPartnerCode.AUCTION_OF_AMERICA;
  name = "Auction of America";
}

// ── Majors ────────────────────────────────────────────────────
export class CopartConnector extends BaseConnector {
  code = AuctionPartnerCode.COPART;
  name = "Copart";

  // Copart's feed calls the lot "lot_number" and nests the vehicle under "vehicle".
  override normalize(input: RawLotInput): NormalizedLot {
    const base = super.normalize(input);
    const raw = (input.raw ?? {}) as Record<string, unknown>;
    const vehicle = (raw.vehicle ?? {}) as Record<string, unknown>;
    return {
      ...base,
      externalLotId: input.externalLotId || String(raw.lot_number ?? ""),
      vin: base.vin ?? (vehicle.vin as string | undefined),
      make: base.make ?? (vehicle.make as string | undefined),
      model: base.model ?? (vehicle.model as string | undefined),
      year: base.year ?? (vehicle.year as number | undefined),
    };
  }
}

export class IAAConnector extends BaseConnector {
  code = AuctionPartnerCode.IAA;
  name = "IAA";
}

export class ManheimConnector extends BaseConnector {
  code = AuctionPartnerCode.MANHEIM;
  name = "Manheim";

  // Manheim uses "unitId" for the lot and cents already, but camelCases the buyer.
  override normalize(input: RawLotInput): NormalizedLot {
    const base = super.normalize(input);
    const raw = (input.raw ?? {}) as Record<string, unknown>;
    return {
      ...base,
      externalLotId: input.externalLotId || String(raw.unitId ?? ""),
      buyerName: base.buyerName ?? (raw.buyerAccountName as string | undefined),
    };
  }
}

export class ADESAConnector extends BaseConnector {
  code = AuctionPartnerCode.ADESA;
  name = "ADESA";
}
