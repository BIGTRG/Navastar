// Password hashing + JWT payload shape. Hashing uses bcryptjs so the seed
// (@navastar/db) and the API produce/verify identical hashes.
import bcrypt from "bcryptjs";
import type { Role } from "@navastar/db";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** What we sign into the JWT and rehydrate on every request. */
export interface AuthPrincipal {
  userId: string;
  email: string;
  roles: Role[];
  name: string;
}
