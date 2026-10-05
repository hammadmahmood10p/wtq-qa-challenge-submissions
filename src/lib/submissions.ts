import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { progressForAttempts } from "@/lib/attempt-progress";
import { TOTAL_CHALLENGES } from "@/lib/challenge-progress";
import { isEntryComplete } from "@/lib/challenge1-limits";
import { decryptCnic } from "@/lib/crypto";
import { db } from "@/lib/db";
import { maxScoreFor } from "@/lib/scoring";
import { formatCnic } from "@/lib/normalize";

/**
 * The Participants Submission Details table.
 *
 * One query serving both the judges' screen and the super admin's, because the brief
 * specifies the same columns for both and two implementations would drift. Judges all
 * see the same list, in the same order, with the same names against the same rows —
 * that shared view is what stops two of them opening the same submission.
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
  /** Exact number of challenges finished. Not a database column — see below. */
  challenges: "ALL" | "0" | "1" | "2" | "3";
  sort: SubmissionSort;
  dir: SortDirection;
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
  /** What this participant's route was out of, so the score reads as 88 / 105. */
  maxScore: number;
  judgeName: string | null;
  judgeId: string | null;
  assigned: boolean;

  /**
   * The holding judge's note, shown to the whole panel. Null when nothing is written.
   *
   * Everyone sees it; only the judge who holds the submission can change it, which the
   * table works out by comparing `judgeId` against the person looking.
   */
  comment: string | null;

  /**
   * How many of the three challenges this participant actually finished.
   *
   * Counted the same way the participant's own screen counted it, so a judge and a
   * participant never disagree about what was handed in. Half-written work does not
   * count: see src/lib/challenge-progress.ts.
   */
  challengesCompleted: number;
  challengesTotal: number;
}

function orderBy(
  sort: SubmissionSort,
  dir: SortDirection,
): Prisma.AttemptOrderByWithRelationInput[] {
  const columns: Prisma.AttemptOrderByWithRelationInput[] = (() => {
    switch (sort) {
      case "score":
        // Requirement 7: the Score column sorts. Unscored submissions always sink to
        // the bottom rather than interleaving — a judge sorting by score is looking
        // for the high scores, not for the gaps.
        return [
          { evaluation: { totalScore: { sort: dir, nulls: "last" } } },
          { submittedAt: "asc" },
        ];
      case "name":
        return [{ participant: { user: { fullName: dir } } }];
      case "location":
        return [{ participant: { location: dir } }, { participant: { user: { fullName: "asc" } } }];
      default:
        return [{ submittedAt: dir }];
    }
  })();

  // A last resort that can never tie, so the order is total.
  //
  // Postgres is free to return equally-ranked rows in any order it likes, and two
  // participants submitting in the same millisecond — or two unscored submissions —
  // are equally ranked under every sort above. Without this, the same row could
  // appear on page one and again on page two while another never appeared at all.
  // The Challenges Accepted filter makes that worse still, because it reads the ids
  // in one query and the rows in another, and the two have to agree.
  return [...columns, { id: "asc" }];
}

export async function listSubmissions(query: SubmissionsQuery) {
  const conditions: Prisma.AttemptWhereInput[] = [
    // Only sealed attempts are reviewable. An expired one counts: it still holds work.
    { state: { in: ["SUBMITTED", "EXPIRED"] } },
  ];

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
  const ordering = orderBy(query.sort, query.dir);

  /**
   * The Challenges Accepted filter, which cannot be a WHERE clause.
   *
   * How many challenges someone finished is derived — from whether their findings are
   * paired, whether a PDF landed, whether the required questions were answered — and
   * lives in challenge-progress.ts rather than in a column. Storing it would mean a
   * migration, a backfill, and a number that silently goes stale the moment the rule
   * changes or a participant saves another answer.
   *
   * So when this filter is on, the ids matching the other filters are read in sort
   * order, counted, filtered, and only then paginated. It costs one extra query over
   * a narrow column, and it keeps the filter honest: the number a judge filters by is
   * the same number the column shows, by construction.
   */
  let pageIds: string[] | null = null;
  let filteredTotal: number | null = null;

  if (query.challenges !== "ALL") {
    const wanted = Number(query.challenges);

    const candidates = await db.attempt.findMany({
      where,
      orderBy: ordering,
      select: { id: true, chosenTrack: true },
    });

    const completedByAttempt = await progressForAttempts(candidates);
    const matching = candidates.filter((a) => completedByAttempt.get(a.id) === wanted);

    filteredTotal = matching.length;
    pageIds = matching
      .slice((query.page - 1) * SUBMISSIONS_PAGE_SIZE, query.page * SUBMISSIONS_PAGE_SIZE)
      .map((a) => a.id);
  }

  const [total, attempts] = await Promise.all([
    filteredTotal ?? db.attempt.count({ where }),
    db.attempt.findMany({
      // When the filter narrowed things down the page is already chosen by id, so the
      // same ordering is applied again here — IN does not preserve the order it was
      // given, and the tiebreaker above is what makes the two runs agree.
      where: pageIds ? { id: { in: pageIds } } : where,
      orderBy: ordering,
      skip: pageIds ? 0 : (query.page - 1) * SUBMISSIONS_PAGE_SIZE,
      take: SUBMISSIONS_PAGE_SIZE,
      select: {
        id: true,
        submittedAt: true,
        autoSubmitted: true,
        chosenTrack: true,
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
            comment: true,
            judge: { select: { fullName: true } },
          },
        },
      },
    }),
  ]);

  // One pair of queries for the whole page rather than a pair per row.
  const completed = await progressForAttempts(
    attempts.map((a) => ({ id: a.id, chosenTrack: a.chosenTrack })),
  );

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
      maxScore: maxScoreFor(attempt.chosenTrack),
      judgeName: evaluation?.judge?.fullName ?? null,
      judgeId: evaluation?.judgeId ?? null,
      // "Somebody holds this right now" — which, since the judge became nullable, is
      // no longer the same question as "has this been looked at". A released or
      // reopened submission has a row full of scores and nobody against it.
      assigned: Boolean(evaluation?.judgeId),
      comment: evaluation?.comment ?? null,
      challengesCompleted: completed.get(attempt.id) ?? 0,
      challengesTotal: TOTAL_CHALLENGES,
    };
  });

  return {
    rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / SUBMISSIONS_PAGE_SIZE)),
  };
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
      chosenTrack: true,
      participant: {
        select: {
          idCardEncrypted: true,
          location: true,
          user: { select: { fullName: true, email: true } },
        },
      },
      challenge1Entries: {
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
      },
      submissions: {
        select: {
          challenge: true,
          fileKey: true,
          originalFilename: true,
          sizeBytes: true,
          uploadedAt: true,
          githubUrl: true,
          verifiedPublic: true,
          answers: true,
          savedAt: true,
        },
      },
      evaluation: {
        select: {
          id: true,
          judgeId: true,
          status: true,
          bonusPoints: true,
          totalScore: true,
          submittedAt: true,
          judge: { select: { fullName: true } },
          scores: { select: { criterion: true, score: true } },
        },
      },
    },
  });

  if (!attempt) return null;

  return {
    ...attempt,
    /**
     * Only the findings that were actually finished.
     *
     * Filtered rather than deleted at submission time. The visible result is the same
     * — a judge never sees a half-written drawer — but the participant's text survives
     * in the database, which matters if anyone ever has to answer "what did she
     * actually write?" after the fact. Destroying work to tidy a screen is a poor
     * trade when the screen can simply not show it.
     */
    challenge1Entries: attempt.challenge1Entries.filter(isEntryComplete),
    idCardNumber: formatCnic(decryptCnic(attempt.participant.idCardEncrypted)),
  };
}
