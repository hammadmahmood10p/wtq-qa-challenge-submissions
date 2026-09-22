import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id. The library exports this as an ambient `const enum`, which cannot be
 * imported under isolatedModules, so the value is inlined — it is part of the
 * published API and will not change.
 */
const ARGON2ID = 2;

/**
 * Password hashing.
 *
 * Argon2id at OWASP's recommended minimum (m=19 MiB, t=2, p=1). The parameters are a
 * deliberate balance for this event rather than a copied default: hashing is the most
 * CPU-expensive thing the app does, and ~1000 participants logging in inside a ten
 * minute window is our worst spike. Raising memoryCost strengthens each hash and
 * lowers how many logins a server can absorb per second, so any change here has to be
 * re-checked against the Day 12 load test, not just against a security table.
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed stored hash, so a corrupt row
 * fails as a rejected login instead of a 500.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/**
 * Burns roughly the same CPU as a real verification.
 *
 * Login (Day 3) must take the same time whether or not the account exists. Without
 * this, response timing tells an attacker which of 1000 CNICs are registered — and
 * this audience will measure it.
 */
export async function fakeVerify(): Promise<void> {
  await hash("timing-equalisation-placeholder", OPTIONS);
}
