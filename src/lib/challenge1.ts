import "server-only";

import type { Challenge1Slot } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * Challenge 1: paired findings.
 *
 * Each entry is one bug report and the test case that covers it, side by side. They
 * were separate lists until the organisers asked for them to be paired — which is how
 * a tester actually works, and means a judge can see which test case belongs to which
 * bug rather than inferring it.
 *
 * The caps and labels live in ./challenge1-limits so client components can read them
 * without dragging the database driver into the browser bundle.
 */
export {
  DESCRIPTION_MAX,
  MAX_ENTRIES,
  TITLE_MAX,
} from "./challenge1-limits";

export interface EntryAttachment {
  id: string;
  slot: Challenge1Slot;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  position: number;
}

export interface Challenge1Entry {
  id: string;
  bugTitle: string;
  bugDescription: string;
  testTitle: string;
  testDescription: string;
  position: number;
  attachments: EntryAttachment[];
}

export async function listChallenge1Entries(attemptId: string): Promise<Challenge1Entry[]> {
  const rows = await db.challenge1Entry.findMany({
    where: { attemptId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      bugTitle: true,
      bugDescription: true,
      testTitle: true,
      testDescription: true,
      position: true,
      attachments: {
        orderBy: [{ slot: "asc" }, { position: "asc" }],
        select: {
          id: true,
          slot: true,
          originalFilename: true,
          contentType: true,
          sizeBytes: true,
          position: true,
        },
      },
    },
  });

  return rows;
}

/**
 * Confirms the entry belongs to this participant's own attempt.
 *
 * Entries are addressed by opaque ids that travel to the browser, so without this one
 * participant could edit or delete another's work by changing a value in a request —
 * the first thing a room full of QA engineers will try. Ownership is re-derived from
 * the session on every write, never taken from the request.
 */
export async function assertOwnsEntry(entryId: string, participantId: string): Promise<void> {
  const entry = await db.challenge1Entry.findFirst({
    where: { id: entryId, attempt: { participantId } },
    select: { id: true },
  });

  if (!entry) throw new Error("Entry not found");
}

export async function assertOwnsAttachment(
  attachmentId: string,
  participantId: string,
): Promise<void> {
  const attachment = await db.challenge1Attachment.findFirst({
    where: { id: attachmentId, entry: { attempt: { participantId } } },
    select: { id: true },
  });

  if (!attachment) throw new Error("Attachment not found");
}
