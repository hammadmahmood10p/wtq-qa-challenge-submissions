import type { Prisma } from "@/generated/prisma/client";
import type { AttemptState } from "@/generated/prisma/enums";
import { remainingMinutesAtSubmit } from "@/lib/attempt-admin-limits";
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

export async function listParticipants(query: RosterQuery) {
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

  const where: Prisma.UserWhereInput = { AND: conditions };

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
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
    attempt: u.participantProfile?.attempt
      ? {
          state: u.participantProfile.attempt.state,
          remainingMinutes: remainingMinutesAtSubmit(u.participantProfile.attempt),
          reopenCount: u.participantProfile.attempt.reopenCount,
          resetCount: u.participantProfile.attempt.resetCount,
          reopenedAt: u.participantProfile.attempt.reopenedAt,
        }
      : null,
  }));

  return { rows, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function listJudges(query: RosterQuery) {
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

  const where: Prisma.UserWhereInput = { AND: conditions };

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      // Pending approvals first: that is the queue the admin is here to clear.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        judgeProfile: { select: { approvedAt: true } },
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
