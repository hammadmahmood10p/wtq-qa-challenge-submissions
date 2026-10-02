"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";

/**
 * Permanently deleting accounts, chosen one by one.
 *
 * This exists for test data. One run of the bulk import makes a thousand accounts, and
 * clearing them afterwards should not mean opening a SQL client — that is how someone
 * ends up running a DELETE with no WHERE clause the night before the event.
 *
 * It used to delete whatever the table's filters matched, with the count typed back as
 * confirmation. That was safe but indirect: you confirmed a *number*, trusting that the
 * filter still meant what you thought. Now the admin ticks the actual rows, so the
 * thing confirmed is the thing seen. The server is told ids and deletes exactly those —
 * no filter is re-evaluated at delete time, so nothing can drift between choosing and
 * confirming.
 *
 * It is a real delete, not the soft one the per-row Remove button performs. Soft
 * deletes are right for someone taken out of the event by mistake; they are useless for
 * clearing a thousand test rows, because the rows stay.
 */

/** Deleted in chunks so a thousand-row cascade cannot outrun a transaction timeout. */
const CHUNK = 100;

/** Guards against anything that is not an id reaching a query. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DeletableRow {
  id: string;
  fullName: string;
  email: string;
  status: string;
  location: string | null;
  /**
   * Whether deleting this one destroys something.
   *
   * A participant who has submitted, or a judge holding reviews. Shown against the row
   * so the consequence is visible at the moment of ticking the box, rather than as a
   * count in a dialog after the choice is made.
   */
  hasWork: boolean;
}

/**
 * Everyone who could be deleted, in one list.
 *
 * Deliberately not filtered by whatever the table happens to be showing: this is a
 * cleanup tool, and an account hidden by a filter is exactly the one you forget to
 * remove. Removed accounts are included too — soft-deleted rows are still rows, and
 * clearing them is the job.
 */
export async function listDeletable(kind: "participant" | "judge"): Promise<DeletableRow[]> {
  await requireRole("SUPER_ADMIN");

  const role = kind === "participant" ? "PARTICIPANT" : "JUDGE";

  const users = await db.user.findMany({
    where: { role },
    orderBy: [{ fullName: "asc" }],
    select: {
      id: true,
      fullName: true,
      email: true,
      status: true,
      participantProfile: {
        select: {
          location: true,
          attempt: { select: { state: true } },
        },
      },
      // One cheap boolean per judge rather than a count: all that matters is whether
      // there is anything to lose.
      _count: kind === "judge" ? { select: { evaluations: true } } : undefined,
    },
  });

  return users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    status: user.status,
    location: user.participantProfile?.location ?? null,
    hasWork:
      kind === "participant"
        ? user.participantProfile?.attempt?.state === "SUBMITTED" ||
          user.participantProfile?.attempt?.state === "EXPIRED"
        : (user._count?.evaluations ?? 0) > 0,
  }));
}

export interface DeleteResult {
  deleted: number;
  filesRemoved: number;
  error?: string;
}

/**
 * Deletes exactly the accounts named, and nothing else.
 *
 * The role condition in the WHERE clause is the backstop: ids arrive from a browser, so
 * a request naming a super admin's id must delete nothing rather than be trusted.
 */
export async function deleteSelected(
  kind: "participant" | "judge",
  ids: string[],
): Promise<DeleteResult> {
  const admin = await requireRole("SUPER_ADMIN");

  const role = kind === "participant" ? "PARTICIPANT" : "JUDGE";

  // Deduplicated, shape-checked, and never the person doing the deleting.
  const targets = [...new Set(ids)].filter((id) => UUID.test(id) && id !== admin.id);

  if (targets.length === 0) {
    return { deleted: 0, filesRemoved: 0, error: "Nothing was selected." };
  }

  // Storage is not transactional, so the keys are collected before anything is removed
  // and the files deleted afterwards. The worst case that way is an orphaned file,
  // which costs disk; the other order risks destroying a file for a database change
  // that then fails.
  const fileKeys = kind === "participant" ? await uploadKeysFor(targets) : [];

  let deleted = 0;

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);

    deleted += await db.$transaction(async (tx) => {
      // An evaluation's judge is a restricting reference, so a judge who has been
      // assigned anything cannot be deleted until those rows go. A participant's
      // evaluation hangs off their attempt and would cascade, but clearing it the same
      // way keeps both paths identical.
      if (kind === "judge") {
        await tx.evaluation.deleteMany({ where: { judgeId: { in: chunk } } });
      } else {
        await tx.evaluation.deleteMany({
          where: { attempt: { participantId: { in: chunk } } },
        });
      }

      // Profiles, attempts, entries, attachments, submissions and sessions all cascade
      // from the user. Audit rows deliberately do not: the trail outlives the account,
      // with its actor set to null.
      const result = await tx.user.deleteMany({ where: { id: { in: chunk }, role } });

      return result.count;
    });
  }

  let filesRemoved = 0;
  const adapter = storage();

  for (const key of fileKeys) {
    try {
      await adapter.delete(key);
      filesRemoved++;
    } catch {
      // An orphaned file costs disk. Failing the whole operation over one would cost
      // the admin their afternoon.
    }
  }

  await audit({
    action: kind === "participant" ? "admin.participants_bulk_deleted" : "admin.judges_bulk_deleted",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "user",
    metadata: { deleted, filesRemoved, selected: targets.length },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath("/admin/judges");

  return { deleted, filesRemoved };
}

/** Every uploaded file belonging to these participants: reports and screenshots. */
async function uploadKeysFor(ids: string[]): Promise<string[]> {
  const keys: string[] = [];

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);

    const [submissions, attachments] = await Promise.all([
      db.challengeSubmission.findMany({
        where: { attempt: { participantId: { in: chunk } }, fileKey: { not: null } },
        select: { fileKey: true },
      }),
      db.challenge1Attachment.findMany({
        where: { entry: { attempt: { participantId: { in: chunk } } } },
        select: { fileKey: true },
      }),
    ]);

    for (const s of submissions) if (s.fileKey) keys.push(s.fileKey);
    for (const a of attachments) keys.push(a.fileKey);
  }

  return keys;
}
