// Connector registry. Core resolves adapters by code through here — never by
// importing a concrete class. Register a new house in ALL_CONNECTORS and it's live.
import type { AuctionPartnerCode } from "@navastar/db";
import type { AuctionConnector } from "./types.js";
import {
  BidNowConnector,
  AuctoraConnector,
  AuctionOfAmericaConnector,
  CopartConnector,
  IAAConnector,
  ManheimConnector,
  ADESAConnector,
} from "./adapters.js";

const ALL_CONNECTORS: AuctionConnector[] = [
  new BidNowConnector(),
  new AuctoraConnector(),
  new AuctionOfAmericaConnector(),
  new CopartConnector(),
  new IAAConnector(),
  new ManheimConnector(),
  new ADESAConnector(),
];

const byCode = new Map<AuctionPartnerCode, AuctionConnector>(
  ALL_CONNECTORS.map((c) => [c.code, c])
);

export function getConnector(code: AuctionPartnerCode): AuctionConnector {
  const c = byCode.get(code);
  if (!c) throw new Error(`No AuctionConnector registered for partner code: ${code}`);
  return c;
}

export function listConnectors(): AuctionConnector[] {
  return [...ALL_CONNECTORS];
}
