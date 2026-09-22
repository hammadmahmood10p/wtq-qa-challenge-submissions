import type { Challenge1ItemKind } from "@/generated/prisma/enums";

/**
 * Challenge 1's limits and labels.
 *
 * Deliberately separate from src/lib/challenge1.ts, which touches the database. The
 * drawer and section components are client components and need these numbers, and
 * importing them from a module that also imports Prisma drags the Postgres driver —
 * and its `dns` and `fs` requires — into the browser bundle, where the build fails.
 *
 * Nothing in this file may import anything server-only.
 */

/**
 * Caps, per decision D8.
 *
 * 1000 participants times unlimited free-text drawers is a real payload and abuse
 * surface, and an accidental paste of a 40MB log would otherwise be accepted. These
 * are generous enough that nobody writing in good faith will meet them; the numbers
 * are worth confirming with the organisers.
 */
export const MAX_ITEMS_PER_KIND = 50;
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;

export const KIND_LABELS: Record<Challenge1ItemKind, { singular: string; plural: string }> = {
  BUG_REPORT: { singular: "Bug Report", plural: "Bug Reports" },
  TEST_CASE: { singular: "Test Case", plural: "Test Cases" },
};
