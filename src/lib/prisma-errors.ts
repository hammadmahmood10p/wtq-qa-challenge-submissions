import { Prisma } from "@/generated/prisma/client";

/**
 * Works out which unique index a P2002 violated.
 *
 * This is fiddlier than it should be. Prisma 7 with the pg driver adapter leaves
 * `meta.target` undefined and reports the constraint under
 * `meta.driverAdapterError.cause.constraint.index` instead. Without handling that,
 * every duplicate signup collapses to a generic "these details already exist" and a
 * participant has no idea which of their three identifiers is the problem.
 *
 * All three known shapes are tried, most reliable first, so a Prisma upgrade that
 * moves this again degrades to the generic message rather than crashing — and
 * prisma-errors.test.ts fails loudly when it happens.
 */
export function uniqueConstraintName(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }

  const meta = error.meta as Record<string, unknown> | undefined;

  // Shape 1: classic Prisma — meta.target is the field or index name(s).
  const target = meta?.target;
  if (Array.isArray(target) && target.length > 0) return target.map(String).join(",");
  if (typeof target === "string" && target.length > 0) return target;

  // Shape 2: Prisma 7 driver adapters — the Postgres constraint name.
  const cause = (meta?.driverAdapterError as { cause?: Record<string, unknown> } | undefined)?.cause;
  const index = (cause?.constraint as { index?: string } | undefined)?.index;
  if (typeof index === "string" && index.length > 0) return index;

  // Shape 3: last resort — dig it out of the Postgres message.
  const original = typeof cause?.originalMessage === "string" ? cause.originalMessage : error.message;
  const match = /unique constraint "([^"]+)"/.exec(original);
  return match?.[1] ?? null;
}

/**
 * Maps a unique violation onto the form field a user can actually fix.
 * Returns null when the conflict is not one of the identifiers we collect.
 */
export function signupConflictField(
  error: unknown,
): "email" | "idCardNumber" | "phone" | "unknown" | null {
  const constraint = uniqueConstraintName(error);
  if (constraint === null) return null;

  const name = constraint.toLowerCase();
  if (name.includes("email")) return "email";
  if (name.includes("idcardhash")) return "idCardNumber";
  if (name.includes("phone")) return "phone";
  return "unknown";
}
