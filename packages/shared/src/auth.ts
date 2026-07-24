// Password hashing + JWT payload shape. Hashing uses bcryptjs so the seed
// (@navastar/db) and the API produce/verify identical hashes.
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import type { Role } from "@navastar/db";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Hash a partner API key for storage/lookup. API keys are high-entropy, so a fast
 * SHA-256 (not bcrypt) is appropriate — the plaintext key is never persisted.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** What we sign into the JWT and rehydrate on every request. */
export interface AuthPrincipal {
  userId: string;
  email: string;
  roles: Role[];
  name: string;
}
