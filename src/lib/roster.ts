import type { Prisma } from "@/generated/prisma/client";
import type { AttemptState } from "@/generated/prisma/enums";
import { remainingMinutesAtSubmit } from "@/lib/attempt-admin-limits";
import { derivePassword } from "@/lib/bulk-import";
import { decryptCnic, hashCnic } from "@/lib/crypto";
import { db } from "@/lib/db";
import { detectIdentifier, formatCnic, formatPhone } from "@/lib/normalize";
import { PAGE_SIZE, type RosterQuery } from "@/lib/validation/admin";

/**
 * Roster queries for the admin console.
 *
 * Note what search can and cannot do, because it is a direct consequence of §3.1.
 * The CNIC is stored as a peppered HMAC plus ciphertext, so there is no plaintext
 * column to run a LIKE against: **a partial ID card number cannot be searched.** A
 * full one can, exactly, via its hash. The same is true of phone numbers.
 *
 * This is a real trade — encrypting the CNIC costs us partial search — and the admin
 * UI says so out loud rather than silently returning nothing.
 */

export interface RosterRow {
  id: string;
  fullName: string;
  email: string;
  status: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  idCardNumber?: string;
  phone?: string;
  location?: string;
  approvedAt?: Date | null;

  /**
   * The password, where it can still be known.
   *
   * Recomputed from the person's own details rather than stored: a bulk import built
   * it from their name and number, and `passwordIsDerived` says whether that is still
   * what the stored hash represents. Null the moment anyone changes it — and for
   * anyone who chose their own — because from then on the derivation is a guess.
   */
  derivedPassword?: string | null;

  /**
   * The participant's run, where there is one. The roster is where a super admin
   * decides whether to hand an attempt back or clear it, and neither decision can be
   * made from the account status alone: SUBMITTED_LOCKED says they finished, not what
   * state their work is in or how much of their clock they had left.
   */
  attempt?: {
    state: AttemptState;
    /** Minutes left when it sealed; null if it ran out of time instead. */
    remainingMinutes: number | null;
    reopenCount: number;
    resetCount: number;
    /** Set while an admin has handed it back and it has not been resubmitted. */
    reopenedAt: Date | null;
    /**
     * When they sealed Challenge 1. Null means it is still theirs to edit — and
     * drives the Unlock button, which is the only way back once it is set.
     */
    challenge1LockedAt: Date | null;
  } | null;
}

function searchWhere(q: string | undefined): Prisma.UserWhereInput | null {
  if (!q) return null;

  const identifier = detectIdentifier(q);

  // An exact CNIC or phone resolves through the profile's indexed columns.
  if (identifier?.kind === "cnic") {
    return { participantProfile: { idCardHash: hashCnic(identifier.value) } };
  }
  if (identifier?.kind === "phone") {
    return { participantProfile: { phoneE164: identifier.value } };
  }

  // Anything else is treated as a name or email fragment.
  return {
    OR: [
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ],
  };
}

/**
 * The filter behind the participants table.
 *
 * Split out from the query it serves so the conditions can be read and tested on their
 * own. It was exported for the filter-driven bulk delete, which now works from ticked
 * rows instead; the split is kept because the function reads better than the inline
 * block it replaced.
 */
export function participantWhere(query: RosterQuery): Prisma.UserWhereInput {
  const conditions: Prisma.UserWhereInput[] = [{ role: "PARTICIPANT" }];

  if (query.status !== "ALL") {
    conditions.push({ status: query.status });
  } else {
    // Removed accounts are hidden unless explicitly asked for — otherwise the roster
    // slowly fills with rows nobody wants to see.
    conditions.push({ status: { not: "REMOVED" } });
  }

  if (query.location !== "ALL") {
    conditions.push({ participantProfile: { location: query.location } });
  }

  const search = searchWhere(query.q);
  if (search) conditions.push(search);

  return { AND: conditions };
}

/**
 * Column ordering for the roster tables.
 *
 * Every ordering ends in a tiebreaker that cannot tie. Postgres may return equally
 * ranked rows in any order it likes, and with 25 rows to a page that is not academic:
 * two participants in the same city, under a sort by location, could otherwise appear
 * on page one and again on page three while a third never appeared at all.
 *
 * Status sorts by its stored value rather than by the words on screen. They happen to
 * read sensibly — ACTIVE, BLOCKED, PENDING_APPROVAL, REMOVED, SUBMITTED_LOCKED — and
 * the alternative is a CASE expression that has to be revisited every time the enum
 * changes.
 *
 * Location is a Postgres enum, so it sorts in declaration order — Karachi, Lahore,
 * Islamabad — rather than alphabetically. That is the order the three cities appear in
 * everywhere else in the product: the signup radio cards, the roster filter, the
 * import template. Sorting them A to Z here would be the one place they came out in a
 * different order. Making it alphabetical would mean ordering on `location::text`,
 * which Prisma cannot express and which would cost a raw query.
 */
function rosterOrderBy(
  query: RosterQuery,
  fallback: Prisma.UserOrderByWithRelationInput[],
): Prisma.UserOrderByWithRelationInput[] {
  const dir = query.dir;

  switch (query.sort) {
    case "name":
      return [{ fullName: dir }, { id: "asc" }];
    case "status":
      return [{ status: dir }, { fullName: "asc" }, { id: "asc" }];
    case "location":
      return [{ participantProfile: { location: dir } }, { fullName: "asc" }, { id: "asc" }];
    default:
      return [...fallback, { id: "asc" }];
  }
}

export async function listParticipants(query: RosterQuery) {
  const where = participantWhere(query);

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: rosterOrderBy(query, [{ createdAt: "desc" }]),
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        passwordIsDerived: true,
        participantProfile: {
          select: {
            idCardEncrypted: true,
            phoneE164: true,
            location: true,
            attempt: {
              select: {
                state: true,
                endsAt: true,
                submittedAt: true,
                reopenedAt: true,
                reopenCount: true,
                challenge1LockedAt: true,
                resetCount: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const rows: RosterRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    // Decrypted only here, for the super admin's screen. Judges will see a masked
    // form instead (Q13, still open).
    idCardNumber: u.participantProfile
      ? formatCnic(decryptCnic(u.participantProfile.idCardEncrypted))
      : undefined,
    phone: u.participantProfile ? formatPhone(u.participantProfile.phoneE164) : undefined,
    location: u.participantProfile?.location,
    derivedPassword:
      u.passwordIsDerived && u.participantProfile
        ? derivePassword(u.fullName, decryptCnic(u.participantProfile.idCardEncrypted))
        : null,
    attempt: u.participantProfile?.attempt
      ? {
          state: u.participantProfile.attempt.state,
          remainingMinutes: remainingMinutesAtSubmit(u.participantProfile.attempt),
          reopenCount: u.participantProfile.attempt.reopenCount,
          resetCount: u.participantProfile.attempt.resetCount,
          reopenedAt: u.participantProfile.attempt.reopenedAt,
          challenge1LockedAt: u.participantProfile.attempt.challenge1LockedAt,
        }
      : null,
  }));

  return { rows, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** The filter behind the judges table. Same reasoning as its sibling above. */
export function judgeWhere(query: RosterQuery): Prisma.UserWhereInput {
  const conditions: Prisma.UserWhereInput[] = [{ role: "JUDGE" }];

  if (query.status !== "ALL") {
    conditions.push({ status: query.status });
  } else {
    conditions.push({ status: { not: "REMOVED" } });
  }

  if (query.q) {
    conditions.push({
      OR: [
        { fullName: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

export async function listJudges(query: RosterQuery) {
  const where = judgeWhere(query);

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      // Pending approvals first by default: that is the queue the admin is here to
      // clear. An explicit sort overrides it.
      orderBy: rosterOrderBy(query, [{ status: "asc" }, { createdAt: "desc" }]),
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        passwordIsDerived: true,
        judgeProfile: { select: { approvedAt: true, phoneE164: true } },
      },
    }),
  ]);

  const rows: RosterRow[] = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    approvedAt: u.judgeProfile?.approvedAt ?? null,
    phone: u.judgeProfile?.phoneE164 ? formatPhone(u.judgeProfile.phoneE164) : undefined,
    derivedPassword:
      u.passwordIsDerived && u.judgeProfile?.phoneE164
        ? derivePassword(u.fullName, u.judgeProfile.phoneE164)
        : null,
  }));

  return { rows, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function rosterCounts() {
  const [participants, participantsBlocked, judgesPending, judgesActive] = await Promise.all([
    db.user.count({ where: { role: "PARTICIPANT", status: { not: "REMOVED" } } }),
    db.user.count({ where: { role: "PARTICIPANT", status: "BLOCKED" } }),
    db.user.count({ where: { role: "JUDGE", status: "PENDING_APPROVAL" } }),
    db.user.count({ where: { role: "JUDGE", status: "ACTIVE" } }),
  ]);

  return { participants, participantsBlocked, judgesPending, judgesActive };
}

/**
 * The people who can administer the event.
 *
 * A small list by design — it exists so an admin can see who else holds this before
 * adding another, and so an account nobody recognises is visible rather than buried
 * in the audit log.
 */
export async function listSuperAdmins() {
  const users = await db.user.findMany({
    where: { role: "SUPER_ADMIN", status: { not: "REMOVED" } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      fullName: true,
      email: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      createdBy: { select: { fullName: true } },
    },
  });

  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    status: u.status,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    createdByName: u.createdBy?.fullName ?? null,
  }));
}

export type SuperAdminRow = Awaited<ReturnType<typeof listSuperAdmins>>[number];
