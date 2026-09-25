"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { judgeWhere, participantWhere } from "@/lib/roster";
import { storage } from "@/lib/storage";
import { rosterQuerySchema, type RosterQuery } from "@/lib/validation/admin";

/**
 * Permanently deleting accounts in bulk.
 *
 * This exists for test data. One run of the bulk import makes a thousand accounts, and
 * clearing them afterwards should not mean opening a SQL client — that is how someone
 * ends up running a DELETE with no WHERE clause the night before the event.
 *
 * Which makes the design problem the opposite of the import's. The import should be
 * easy; this should be hard to do by accident. So it deletes exactly the set the admin
 * is already looking at, tells them how many that is and names some of them, says out
 * loud when submitted work is among them, never touches a super admin, and will not
 * run until the count has been typed back.
 *
 * It is a real delete, not the soft one the per-row Remove button performs. Soft
 * deletes are right for someone taken out of the event by mistake; they are useless for
 * clearing a thousand test rows, because the rows stay.
 */

/** Deleted in chunks so a thousand-row cascade cannot outrun a transaction timeout. */
const CHUNK = 100;

export interface DeletePreview {
  total: number;
  /** A few names, so the admin can see what they are about to destroy. */
  sample: { fullName: string; email: string }[];
  /** How many of them have work that will go with them. */
  withWork: number;
}

function whereFor(kind: "participant" | "judge", query: RosterQuery) {
  return kind === "participant" ? participantWhere(query) : judgeWhere(query);
}

export async function previewBulkDelete(
  kind: "participant" | "judge",
  rawQuery: RosterQuery,
): Promise<DeletePreview> {
  await requireRole("SUPER_ADMIN");

  // Re-parsed rather than trusted: this argument crosses the wire, and it decides
  // which rows get destroyed.
  const query = rosterQuerySchema.parse(rawQuery);
  const where = whereFor(kind, query);

  const [total, sample] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { fullName: true, email: true },
    }),
  ]);

  // "Work" means different things either side: a participant's own submission, or the
  // reviews a judge has been holding. Both are lost, and both are worth naming before
  // rather than after.
  const withWork =
    kind === "participant"
      ? await db.user.count({
          where: {
            AND: [
              where,
              { participantProfile: { attempt: { state: { in: ["SUBMITTED", "EXPIRED"] } } } },
            ],
          },
        })
      : await db.user.count({ where: { AND: [where, { evaluations: { some: {} } }] } });

  return { total, sample, withWork };
}

export interface DeleteResult {
  deleted: number;
  filesRemoved: number;
  error?: string;
}

/**
 * Deletes everything the filter matches.
 *
 * The confirmation is the count, typed back, and it is checked here rather than only in
 * the browser: the number the server counts is the number that will be deleted, so a
 * page left open since yesterday showing 40 must not be able to authorise deleting 400.
 */
export async function bulkDelete(
  kind: "participant" | "judge",
  rawQuery: RosterQuery,
  confirmedCount: number,
): Promise<DeleteResult> {
  const admin = await requireRole("SUPER_ADMIN");

  const query = rosterQuerySchema.parse(rawQuery);
  const where = whereFor(kind, query);

  const targets = await db.user.findMany({ where, select: { id: true } });
  const ids = targets.map((t) => t.id);

  if (ids.length === 0) {
    return { deleted: 0, filesRemoved: 0, error: "Nothing matches that filter any more." };
  }

  if (ids.length !== confirmedCount) {
    return {
      deleted: 0,
      filesRemoved: 0,
      error: `This filter now matches ${ids.length} accounts rather than ${confirmedCount}. Nothing was deleted — check the filter and try again.`,
    };
  }

  // Storage is not transactional, so the keys are collected before anything is removed
  // and the files deleted afterwards. The worst case that way is an orphaned file,
  // which costs disk; the other order risks destroying a file for a database change
  // that then fails.
  const fileKeys = kind === "participant" ? await uploadKeysFor(ids) : [];

  let deleted = 0;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);

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
      const result = await tx.user.deleteMany({
        where: { id: { in: chunk }, role: kind === "participant" ? "PARTICIPANT" : "JUDGE" },
      });

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
    metadata: {
      deleted,
      filesRemoved,
      filter: { q: query.q ?? null, status: query.status, location: query.location },
    },
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
