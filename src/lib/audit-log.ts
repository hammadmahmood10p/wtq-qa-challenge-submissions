import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import {
  actionsInCategory,
  describeAction,
  describeMetadata,
  type AuditCategory,
  type AuditTone,
} from "@/lib/audit-labels";

/**
 * Reading the audit trail.
 *
 * The rows are written throughout the application and never updated or deleted; this
 * is the only place that reads them. Two things make the difference between a log and
 * a usable one, and both happen here:
 *
 *   - the actor is resolved to a name, because `actorId` is a UUID
 *   - the *target* is resolved too, because "blocked an account" without saying whose
 *     answers half the question
 *
 * Targets are looked up in one batched query per page rather than one per row.
 */

export const AUDIT_PAGE_SIZE = 50;

export interface AuditQuery {
  page: number;
  /** Name or email of the person who acted. */
  q?: string;
  /** Defaults to staff only — judges and super admins — which is what this page is for. */
  who: "STAFF" | "SUPER_ADMIN" | "JUDGE" | "PARTICIPANT" | "ALL";
  category: AuditCategory | "ALL";
}

export interface AuditRow {
  id: string;
  at: Date;
  action: string;
  label: string;
  category: AuditCategory;
  tone: AuditTone;
  /** Null for actions the system took on its own, such as a timer auto-submit. */
  actorName: string | null;
  actorEmail: string | null;
  actorRole: Role | null;
  /** Who or what it was done to, where that is knowable. */
  targetName: string | null;
  targetKind: string | null;
  detail: string | null;
  ip: string | null;
}

function whereFor(query: AuditQuery): Prisma.AuditLogWhereInput {
  const conditions: Prisma.AuditLogWhereInput[] = [];

  switch (query.who) {
    case "STAFF":
      conditions.push({ actorRole: { in: ["SUPER_ADMIN", "JUDGE"] } });
      break;
    case "ALL":
      break;
    default:
      conditions.push({ actorRole: query.who });
  }

  if (query.category !== "ALL") {
    conditions.push({ action: { in: actionsInCategory(query.category) } });
  }

  if (query.q) {
    // Matches the person who acted, not the person acted upon: "what did this judge
    // do" is the question this page exists to answer.
    conditions.push({
      actor: {
        OR: [
          { fullName: { contains: query.q, mode: "insensitive" } },
          { email: { contains: query.q, mode: "insensitive" } },
        ],
      },
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

export async function listAuditEvents(query: AuditQuery) {
  const where = whereFor(query);

  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      // Newest first, with id as the tiebreaker: several rows can share a timestamp
      // when one action writes more than one, and without it a page boundary can
      // repeat or skip a row.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        action: true,
        actorRole: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ip: true,
        actor: { select: { fullName: true, email: true } },
      },
    }),
  ]);

  const targets = await resolveTargets(rows);

  const result: AuditRow[] = rows.map((row) => {
    const descriptor = describeAction(row.action);
    const target = row.entityId ? targets.get(row.entityId) : undefined;

    return {
      id: row.id,
      at: row.createdAt,
      action: row.action,
      label: descriptor.label,
      category: descriptor.category,
      tone: descriptor.tone,
      actorName: row.actor?.fullName ?? null,
      actorEmail: row.actor?.email ?? null,
      actorRole: row.actorRole,
      targetName: target ?? null,
      targetKind: row.entityType,
      detail: describeMetadata(row.metadata),
      ip: row.ip,
    };
  });

  return {
    rows: result,
    total,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
  };
}

/**
 * Names for the things these rows point at.
 *
 * `entityType` says what kind of id it is. Users are looked up directly; attempts and
 * evaluations resolve to the participant they belong to, because that is the name an
 * admin is scanning for — nobody remembers an attempt by its id.
 *
 * Three queries for a page of fifty, regardless of how many rows point where.
 */
async function resolveTargets(
  rows: { entityType: string | null; entityId: string | null }[],
): Promise<Map<string, string>> {
  const byKind = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.entityId || !row.entityType) continue;
    const set = byKind.get(row.entityType) ?? new Set<string>();
    set.add(row.entityId);
    byKind.set(row.entityType, set);
  }

  const names = new Map<string, string>();

  const userIds = [...(byKind.get("user") ?? [])];
  const attemptIds = [...(byKind.get("attempt") ?? [])];
  const evaluationIds = [...(byKind.get("evaluation") ?? [])];

  const [users, attempts, evaluations] = await Promise.all([
    userIds.length > 0
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
      : [],
    // An attempt row carries the *attempt's* id, not the participant's, so this
    // resolves through the attempt to the person whose work it is — which is the name
    // an admin is scanning the column for.
    attemptIds.length > 0
      ? db.attempt.findMany({
          where: { id: { in: attemptIds } },
          select: {
            id: true,
            participant: { select: { user: { select: { fullName: true } } } },
          },
        })
      : [],
    evaluationIds.length > 0
      ? db.evaluation.findMany({
          where: { id: { in: evaluationIds } },
          select: {
            id: true,
            attempt: { select: { participant: { select: { user: { select: { fullName: true } } } } } },
          },
        })
      : [],
  ]);

  for (const user of users) names.set(user.id, user.fullName);
  for (const attempt of attempts) names.set(attempt.id, attempt.participant.user.fullName);
  for (const evaluation of evaluations) {
    names.set(evaluation.id, evaluation.attempt.participant.user.fullName);
  }

  return names;
}

/** Headline numbers for the top of the page. */
export async function auditSummary() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total, last24h, failedLogins, masterPasswordUses] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.count({ where: { createdAt: { gte: since } } }),
    db.auditLog.count({ where: { action: "auth.login_failed", createdAt: { gte: since } } }),
    db.auditLog.count({ where: { action: "auth.login_master_password" } }),
  ]);

  return { total, last24h, failedLogins, masterPasswordUses };
}
