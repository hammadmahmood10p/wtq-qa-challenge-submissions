"use server";

import { revalidatePath } from "next/cache";
import type { ChallengeTrack } from "@/generated/prisma/enums";
import { AttemptClosedError, requireWritableAttempt } from "@/lib/attempt";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export interface TrackResult {
  ok: boolean;
  closed?: boolean;
  error?: string;
  track?: ChallengeTrack;
}

/**
 * Commits a participant to Challenge 3 or Challenge 4.
 *
 * The second irreversible decision in the product, after final submission, so it is
 * guarded the same way: the choice is written with the WHERE clause doing the work, and
 * a second attempt — a double click, two tabs, a replayed request — cannot change a
 * choice already made.
 *
 * It is a deliberate, confirmed action rather than a side effect of opening a page.
 * Locking someone out of a challenge because they clicked a tab to see what was in it
 * would be indefensible, and there is no way back.
 */
export async function chooseTrack(track: ChallengeTrack): Promise<TrackResult> {
  const user = await requireRole("PARTICIPANT");

  if (track !== "C3" && track !== "C4") {
    return { ok: false, error: "That is not a challenge you can choose." };
  }

  try {
    const attempt = await requireWritableAttempt(user.id);

    const { count } = await db.attempt.updateMany({
      // Only an attempt that has not already chosen. Whoever gets there first wins,
      // and everyone else reads back what they wrote.
      where: { id: attempt.id, chosenTrack: null },
      data: { chosenTrack: track, chosenTrackAt: new Date() },
    });

    const current = await db.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
      select: { chosenTrack: true },
    });

    if (count > 0) {
      await audit({
        action: "attempt.track_chosen",
        actorId: user.id,
        actorRole: "PARTICIPANT",
        entityType: "attempt",
        entityId: attempt.id,
        metadata: { track },
      });
    } else if (current.chosenTrack !== track) {
      // They already committed to the other one. Say so plainly rather than failing
      // silently — this is the one thing they cannot undo.
      return {
        ok: false,
        track: current.chosenTrack ?? undefined,
        error: `You have already chosen Challenge ${current.chosenTrack === "C3" ? 3 : 4}. That choice cannot be changed.`,
      };
    }

    revalidatePath("/challenge/run");
    revalidatePath("/challenge");

    return { ok: true, track: current.chosenTrack ?? track };
  } catch (error) {
    if (error instanceof AttemptClosedError) {
      return { ok: false, closed: true, error: "Your challenge has ended." };
    }
    console.error("[chooseTrack]", error);
    return { ok: false, error: "Could not record your choice. Please try again." };
  }
}
