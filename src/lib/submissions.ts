import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { decryptCnic } from "@/lib/crypto";
import { db } from "@/lib/db";
import { formatCnic } from "@/lib/normalize";

/**
 * The Participants Submission Details table.
 *
 * One query serving both the judges' screen and the super admin's, because the brief
 * specifies the same columns for both and two implementations would drift. What
 * differs is only the scope — a judge defaults to their own queue — and whether the
 * scoring controls appear, which is decided on the review page.
 */

export const SUBMISSIONS_PAGE_SIZE = 25;

export type SubmissionSort = "score" | "name" | "submitted" | "location";
export type SortDirection = "asc" | "desc";

export interface SubmissionsQuery {
  page: number;
  q?: string;
  /** Requirement: "Not reviewed" until a judge has finalised a score. */
  review: "ALL" | "REVIEWED" | "NOT_REVIEWED";
  location: "ALL" | "KARACHI" | "LAHORE" | "ISLAMABAD";
  sort: SubmissionSort;
  dir: SortDirection;
  /** Set for a judge looking at their own queue. */
  assignedTo?: string;
}

export interface SubmissionRow {
  attemptId: string;
  idCardNumber: string;
  fullName: string;
  location: string;
  submittedAt: Date | null;
  autoSubmitted: boolean;
  reviewed: boolean;
  /** Null until a judge submits a final score — the column stays empty before then. */
  totalScore: number | null;
  judgeName: string | null;
  judgeId: string | null;
  assigned: boolean;
}

function orderBy(
  sort: SubmissionSort,
  dir: SortDirection,
): Prisma.AttemptOrderByWithRelationInput[] {
  switch (sort) {
    case "score":
      // Requirement 7: the Score column sorts. Unscored submissions always sink to the
      // bottom rather than interleaving — a judge sorting by score is looking for the
      // high scores, not for the gaps.
      return [{ evaluation: { totalScore: { sort: dir, nulls: "last" } } }, { submittedAt: "asc" }];
    case "name":
      return [{ participant: { user: { fullName: dir } } }];
    case "location":
      return [{ participant: { location: dir } }, { participant: { user: { fullName: "asc" } } }];
    default:
      return [{ submittedAt: dir }];
  }
}

export async function listSubmissions(query: SubmissionsQuery) {
  const conditions: Prisma.AttemptWhereInput[] = [
    // Only sealed attempts are reviewable. An expired one counts: it still holds work.
    { state: { in: ["SUBMITTED", "EXPIRED"] } },
  ];

  if (query.assignedTo) {
    conditions.push({ evaluation: { judgeId: query.assignedTo } });
  }

  if (query.review === "REVIEWED") {
    conditions.push({ evaluation: { status: "SUBMITTED" } });
  } else if (query.review === "NOT_REVIEWED") {
    // Either nobody has finalised it, or nobody has been assigned it at all.
    conditions.push({
      OR: [{ evaluation: { is: null } }, { evaluation: { status: { not: "SUBMITTED" } } }],
    });
  }

  if (query.location !== "ALL") {
    conditions.push({ participant: { location: query.location } });
  }

  if (query.q) {
    // Name and email only. The ID card number is a peppered HMAC plus ciphertext
    // (§3.1), so there is no plaintext column to match a fragment against.
    conditions.push({
      participant: {
        user: {
          OR: [
            { fullName: { contains: query.q, mode: "insensitive" } },
            { email: { contains: query.q, mode: "insensitive" } },
          ],
        },
      },
    });
  }

  const where: Prisma.AttemptWhereInput = { AND: conditions };

  const [total, attempts] = await Promise.all([
    db.attempt.count({ where }),
    db.attempt.findMany({
      where,
      orderBy: orderBy(query.sort, query.dir),
      skip: (query.page - 1) * SUBMISSIONS_PAGE_SIZE,
      take: SUBMISSIONS_PAGE_SIZE,
      select: {
        id: true,
        submittedAt: true,
        autoSubmitted: true,
        participant: {
          select: {
            idCardEncrypted: true,
            location: true,
            user: { select: { fullName: true } },
          },
        },
        evaluation: {
          select: {
            status: true,
            totalScore: true,
            judgeId: true,
            judge: { select: { fullName: true } },
          },
        },
      },
    }),
  ]);

  const rows: SubmissionRow[] = attempts.map((attempt) => {
    const evaluation = attempt.evaluation;
    const reviewed = evaluation?.status === "SUBMITTED";

    return {
      attemptId: attempt.id,
      idCardNumber: formatCnic(decryptCnic(attempt.participant.idCardEncrypted)),
      fullName: attempt.participant.user.fullName,
      location: attempt.participant.location,
      submittedAt: attempt.submittedAt,
      autoSubmitted: attempt.autoSubmitted,
      reviewed,
      // Empty until the review is finalised, per the brief.
      totalScore: reviewed && evaluation?.totalScore ? Number(evaluation.totalScore) : null,
      judgeName: evaluation?.judge.fullName ?? null,
      judgeId: evaluation?.judgeId ?? null,
      assigned: Boolean(evaluation),
    };
  });

  return {
    rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / SUBMISSIONS_PAGE_SIZE)),
  };
}

export async function judgeQueueCounts(judgeId: string) {
  const [assigned, reviewed] = await Promise.all([
    db.evaluation.count({ where: { judgeId, status: { not: "SUBMITTED" } } }),
    db.evaluation.count({ where: { judgeId, status: "SUBMITTED" } }),
  ]);

  return { assigned, reviewed };
}

export async function submissionCounts() {
  const [total, reviewed, unassigned] = await Promise.all([
    db.attempt.count({ where: { state: { in: ["SUBMITTED", "EXPIRED"] } } }),
    db.evaluation.count({ where: { status: "SUBMITTED" } }),
    db.attempt.count({
      where: { state: { in: ["SUBMITTED", "EXPIRED"] }, evaluation: null },
    }),
  ]);

  return { total, reviewed, unassigned };
}

/**
 * Everything one participant submitted, for the review page.
 *
 * Returns null rather than throwing when the attempt is not reviewable, so the caller
 * can answer 404 — a judge following a stale link should see "not found", not a crash.
 */
export async function getSubmissionDetail(attemptId: string) {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, state: { in: ["SUBMITTED", "EXPIRED"] } },
    select: {
      id: true,
      submittedAt: true,
      autoSubmitted: true,
      startedAt: true,
      participant: {
        select: {
          idCardEncrypted: true,
          location: true,
          user: { select: { fullName: true, email: true } },
        },
      },
      challenge1Items: {
        orderBy: [{ kind: "asc" }, { position: "asc" }],
        select: {
          id: true,
          kind: true,
          title: true,
          description: true,
          position: true,
          updatedAt: true,
        },
      },
      challenge2: {
        select: { originalFilename: true, sizeBytes: true, uploadedAt: true },
      },
      challenge3: { select: { githubUrl: true, verifiedPublic: true } },
      evaluation: {
        select: {
          id: true,
          judgeId: true,
          status: true,
          scoreC1: true,
          scoreC2: true,
          scoreC2Bonus: true,
          scoreC3: true,
          totalScore: true,
          submittedAt: true,
          judge: { select: { fullName: true } },
        },
      },
    },
  });

  if (!attempt) return null;

  return {
    ...attempt,
    idCardNumber: formatCnic(decryptCnic(attempt.participant.idCardEncrypted)),
  };
}
