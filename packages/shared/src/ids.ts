// Human-facing id generation (tracking ids). Not cryptographic — Prisma cuid()
// remains the primary key; this is the friendly id customers quote.
import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I/L)

/** e.g. NAV-7F3K-9QP2 */
export function generateTrackingId(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `NAV-${block()}-${block()}`;
}
