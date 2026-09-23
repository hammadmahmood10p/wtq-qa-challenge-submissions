import { cache } from "react";
import type { Attempt } from "@/generated/prisma/client";
import type { ChallengeTrack } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * The attempt: one participant's single, irreversible 3-hour run.
 *
 * Everything here is server-authoritative by design (architectural rule 1). The
 * browser renders a countdown derived from `endsAt`, but nothing it does — changing
 * the system clock, pausing JavaScript, closing the laptop, opening ten tabs — can
 * change when the attempt ends or whether a write is still allowed.
 */

export const DEFAULT_DURATION_MINUTES = 180;

export interface AttemptView {
  id: string;
  state: Attempt["state"];
  startedAt: Date | null;
  endsAt: Date | null;
  submittedAt: Date | null;
  autoSubmitted: boolean;
  durationMinutes: number;
  chosenTrack: ChallengeTrack | null;
  /** Server time at the moment this was read, so the client can correct its own clock. */
  serverNow: Date;
  remainingMs: number;
}

async function durationMinutes(): Promise<number> {
  const setting = await db.appSetting.findUnique({
    where: { key: "attempt_duration_minutes" },
  });
  const parsed = Number(setting?.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DURATION_MINUTES;
}

/** Creates the NOT_STARTED row on first sight. Does not start the clock. */
async function ensureAttempt(participantId: string): Promise<Attempt> {
  const existing = await db.attempt.findUnique({ where: { participantId } });
  if (existing) return existing;

  try {
    return await db.attempt.create({
      data: { participantId, durationMinutes: await durationMinutes() },
    });
  } catch {
    // Two tabs loading at once both tried to create it; the unique index settled it.
    return db.attempt.findUniqueOrThrow({ where: { participantId } });
  }
}

/**
 * Starts the clock. Idempotent.
 *
 * The guard is in the WHERE clause, not in a read-then-write: a double click, a
 * refresh at the wrong moment, or two tabs racing must never produce a second
 * `startedAt` and hand someone extra time. Only a row still in NOT_STARTED is
 * updated, and everyone else reads back whatever the winner wrote.
 */
export async function startAttempt(participantId: string): Promise<AttemptView> {
  await ensureAttempt(participantId);

  const now = new Date();
  const minutes = await durationMinutes();
  const endsAt = new Date(now.getTime() + minutes * 60_000);

  const { count } = await db.attempt.updateMany({
    where: { participantId, state: "NOT_STARTED" },
    data: { state: "IN_PROGRESS", startedAt: now, endsAt, durationMinutes: minutes },
  });

  if (count > 0) {
    await audit({
      action: "attempt.started",
      actorId: participantId,
      actorRole: "PARTICIPANT",
      entityType: "attempt",
      entityId: participantId,
      metadata: { endsAt: endsAt.toISOString(), durationMinutes: minutes },
    });
  }

  return getAttempt(participantId);
}

/**
 * Reads the attempt, auto-submitting it if the time has run out.
 *
 * Decision D1 is a hard auto-submit: at zero, whatever was saved is submitted and the
 * participant is locked out, exactly as if they had pressed the button. Both routes
 * go through finalizeAttempt so they cannot drift apart.
 *
 * It resolves on read rather than from a scheduled job. Any request that touches the
 * attempt settles it — so there is no cron to fail silently while a participant keeps
 * typing, and an attempt whose browser was closed at 2h50m is still sealed correctly.
 */
export const getAttempt = cache(async (participantId: string): Promise<AttemptView> => {
  let attempt = await ensureAttempt(participantId);
  const serverNow = new Date();

  if (attempt.state === "IN_PROGRESS" && attempt.endsAt && attempt.endsAt <= serverNow) {
    // Imported lazily: attempt-submit imports this module for its types, and a static
    // import both ways is a cycle.
    const { finalizeAttempt } = await import("@/lib/attempt-submit");
    await finalizeAttempt(participantId, { auto: true });

    attempt = await db.attempt.findUniqueOrThrow({ where: { participantId } });
  }

  const state = attempt.state;

  return {
    id: attempt.id,
    state,
    startedAt: attempt.startedAt,
    endsAt: attempt.endsAt,
    submittedAt: attempt.submittedAt,
    autoSubmitted: attempt.autoSubmitted,
    durationMinutes: attempt.durationMinutes,
    chosenTrack: attempt.chosenTrack,
    serverNow,
    remainingMs: attempt.endsAt ? Math.max(0, attempt.endsAt.getTime() - serverNow.getTime()) : 0,
  };
});

/** True only while there is time on the clock and nothing has been submitted. */
export function isWritable(attempt: AttemptView): boolean {
  return attempt.state === "IN_PROGRESS" && attempt.remainingMs > 0;
}

export class AttemptClosedError extends Error {
  constructor(readonly state: Attempt["state"]) {
    super("This attempt is no longer open for changes.");
    this.name = "AttemptClosedError";
  }
}

/**
 * The guard every write must pass through.
 *
 * A disabled button is a hint; this is the rule (architectural rule 2). Challenge
 * saves on Days 6 to 8 all call it, so a request replayed after time is up — or
 * fired from a tab left open past the deadline — is refused by the server rather
 * than by the interface that happens to be on screen.
 */
export async function requireWritableAttempt(participantId: string): Promise<AttemptView> {
  const attempt = await getAttempt(participantId);
  if (!isWritable(attempt)) throw new AttemptClosedError(attempt.state);
  return attempt;
}
