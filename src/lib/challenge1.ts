import "server-only";

import type { Challenge1ItemKind } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * Challenge 1: bug reports and test cases.
 *
 * Both are the same shape — a title and a description — so they share a table and
 * differ only by `kind`. That keeps ordering, autosave, the caps and the judge's
 * read-only view as one implementation rather than two that drift apart.
 *
 * The caps and labels live in ./challenge1-limits so that client components can read
 * them without dragging the database driver into the browser bundle.
 */
export {
  DESCRIPTION_MAX,
  KIND_LABELS,
  MAX_ITEMS_PER_KIND,
  TITLE_MAX,
} from "./challenge1-limits";

export interface Challenge1Item {
  id: string;
  kind: Challenge1ItemKind;
  title: string;
  description: string;
  position: number;
  updatedAt: Date;
}

export async function listChallenge1Items(attemptId: string): Promise<Challenge1Item[]> {
  return db.challenge1Item.findMany({
    where: { attemptId },
    orderBy: [{ kind: "asc" }, { position: "asc" }],
    select: {
      id: true,
      kind: true,
      title: true,
      description: true,
      position: true,
      updatedAt: true,
    },
  });
}

export function groupByKind(items: Challenge1Item[]) {
  return {
    BUG_REPORT: items.filter((i) => i.kind === "BUG_REPORT"),
    TEST_CASE: items.filter((i) => i.kind === "TEST_CASE"),
  };
}

/**
 * Confirms the item belongs to this participant's own attempt.
 *
 * Every item is addressed by an opaque id that travels to the browser, so without
 * this check one participant could edit or delete another's work by changing a value
 * in a request — the first thing a room full of QA engineers will try. Ownership is
 * re-derived from the session on every write; it is never taken from the request.
 */
export async function assertOwnsItem(itemId: string, participantId: string): Promise<void> {
  const item = await db.challenge1Item.findFirst({
    where: { id: itemId, attempt: { participantId } },
    select: { id: true },
  });

  if (!item) throw new Error("Item not found");
}
