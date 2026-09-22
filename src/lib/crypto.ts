import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { normalizeCnic } from "@/lib/normalize";

/**
 * CNIC protection — see §3.1 of docs/DELIVERY_PLAN.md.
 *
 * A CNIC is a national identity number and the most sensitive field we hold. But it is
 * also a login credential and a uniqueness key, so it cannot simply be encrypted:
 * AES output is non-deterministic, which makes the column unindexable and would break
 * both login-by-CNIC and duplicate detection.
 *
 * So we store two derivations of it:
 *
 *   hashCnic()    deterministic, peppered HMAC-SHA256 -> unique index, lookups
 *   encryptCnic() AES-256-GCM ciphertext              -> display only
 *
 * The pepper lives in the environment, not the database, so a dump of the database
 * alone does not let an attacker confirm whether a given CNIC is present.
 */

const KEY = Buffer.from(env.CNIC_ENCRYPTION_KEY, "base64");
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;

/** Deterministic. The same CNIC always produces the same hash, so it can be indexed. */
export function hashCnic(cnic: string): string {
  const normalized = normalizeCnic(cnic);
  return createHmac("sha256", env.CNIC_PEPPER).update(normalized).digest("base64url");
}

/** Non-deterministic. Format: base64(iv | ciphertext | authTag). */
export function encryptCnic(cnic: string): string {
  const normalized = normalizeCnic(cnic);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString("base64");
}

export function decryptCnic(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Constant-time string comparison, for anything an attacker could probe by timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
