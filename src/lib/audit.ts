import { headers } from "next/headers";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

/**
 * Append-only audit trail.
 *
 * Rule 4 in docs/ARCHITECTURE_AND_PHASES.md §3.1. On event day, "did the system do
 * that or did someone?" needs an answer, and reconstructing it from application logs
 * after the fact is not an answer.
 *
 * Writing an audit row must never break the action it is recording — a failed insert
 * here should not cost a participant their submission — so failures are logged and
 * swallowed.
 */

export type AuditAction =
  | "participant.signup"
  | "judge.signup"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_changed"
  | "admin.participant_created"
  | "admin.participant_blocked"
  | "admin.participant_unblocked"
  | "admin.participant_removed"
  | "admin.password_reset"
  | "admin.judge_approved"
  | "admin.judge_rejected"
  | "attempt.started"
  | "attempt.submitted"
  | "attempt.auto_submitted"
  | "evaluation.assigned"
  | "evaluation.score_saved"
  | "evaluation.submitted"
  | "evaluation.unlocked";

interface AuditInput {
  action: AuditAction;
  actorId?: string | null;
  actorRole?: Role | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Best-effort client details. Behind a proxy, x-forwarded-for is the real client. */
export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return {
      ip: forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
      userAgent: h.get("user-agent"),
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = await requestContext();
    await db.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: (input.metadata ?? {}) as object,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record", input.action, error);
  }
}
