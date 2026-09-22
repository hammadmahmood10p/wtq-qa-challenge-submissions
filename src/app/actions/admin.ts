"use server";

import { revalidatePath } from "next/cache";
import { assignUnassignedSubmissions } from "@/lib/attempt-submit";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { encryptCnic, hashCnic } from "@/lib/crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { signupConflictField } from "@/lib/prisma-errors";
import { revokeAllSessions } from "@/lib/session";
import { formatTempPassword, generateTempPassword } from "@/lib/temp-password";
import { adminCreateJudgeSchema, adminCreateParticipantSchema } from "@/lib/validation/admin";

export interface AdminState {
  ok?: boolean;
  errors?: Record<string, string>;
  message?: string;
  /**
   * Shown once, never stored in readable form. The admin has to pass it on before
   * closing the dialog — there is no email service to fall back on.
   */
  tempPassword?: string;
}

function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

const CONFLICTS = {
  email: "An account with this email already exists.",
  idCardNumber: "An account with this ID card number already exists.",
  phone: "An account with this phone number already exists.",
} as const;

function conflictErrors(error: unknown): Record<string, string> | null {
  const field = signupConflictField(error);
  if (field === null) return null;
  if (field === "unknown") return { form: "An account with these details already exists." };
  return { [field]: CONFLICTS[field] };
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath("/admin/judges");
}

// ---------------------------------------------------------------------------
// Creating accounts
// ---------------------------------------------------------------------------

export async function adminCreateParticipant(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const parsed = adminCreateParticipantSchema.safeParse({
    idCardNumber: formData.get("idCardNumber"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    location: formData.get("location"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const data = parsed.data;
  const tempPassword = generateTempPassword();

  try {
    const user = await db.user.create({
      data: {
        role: "PARTICIPANT",
        email: data.email,
        fullName: data.fullName,
        passwordHash: await hashPassword(tempPassword),
        status: "ACTIVE",
        mustChangePassword: true,
        createdById: admin.id,
        participantProfile: {
          create: {
            idCardHash: hashCnic(data.idCardNumber),
            idCardEncrypted: encryptCnic(data.idCardNumber),
            phoneE164: data.phone,
            location: data.location,
          },
        },
      },
    });

    await audit({
      action: "admin.participant_created",
      actorId: admin.id,
      actorRole: "SUPER_ADMIN",
      entityType: "user",
      entityId: user.id,
      metadata: { location: data.location },
    });
  } catch (error) {
    const conflict = conflictErrors(error);
    if (conflict) return { errors: conflict };

    console.error("[admin:createParticipant]", error);
    return { message: "Could not create the participant. Please try again." };
  }

  refresh();
  return { ok: true, tempPassword: formatTempPassword(tempPassword) };
}

export async function adminCreateJudge(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const parsed = adminCreateJudgeSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const data = parsed.data;
  const tempPassword = generateTempPassword();

  try {
    const user = await db.user.create({
      data: {
        role: "JUDGE",
        email: data.email,
        fullName: data.fullName,
        passwordHash: await hashPassword(tempPassword),
        // Added by an admin, so it is approved by definition — the approval queue
        // exists to vet self-registrations, not the admin's own entries.
        status: "ACTIVE",
        mustChangePassword: true,
        createdById: admin.id,
        judgeProfile: { create: { approvedById: admin.id, approvedAt: new Date() } },
      },
    });

    await audit({
      action: "admin.judge_approved",
      actorId: admin.id,
      actorRole: "SUPER_ADMIN",
      entityType: "user",
      entityId: user.id,
      metadata: { createdByAdmin: true },
    });
  } catch (error) {
    const conflict = conflictErrors(error);
    if (conflict) return { errors: conflict };

    console.error("[admin:createJudge]", error);
    return { message: "Could not create the judge. Please try again." };
  }

  refresh();
  return { ok: true, tempPassword: formatTempPassword(tempPassword) };
}

// ---------------------------------------------------------------------------
// Managing accounts
// ---------------------------------------------------------------------------

/**
 * Blocking takes effect immediately, mid-attempt if necessary (D7).
 *
 * Revoking the sessions is the part that matters: without it the person keeps working
 * on a cryptographically valid token until it expires, and an admin who has just
 * blocked someone would reasonably believe they had stopped them.
 *
 * Their work is deliberately left intact and visible to judges — blocking a person is
 * not the same as discarding what they did.
 */
export async function adminBlockUser(userId: string): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  if (userId === admin.id) {
    return { message: "You cannot block your own account." };
  }

  await db.user.update({ where: { id: userId }, data: { status: "BLOCKED" } });
  await revokeAllSessions(userId);

  await audit({
    action: "admin.participant_blocked",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "user",
    entityId: userId,
  });

  refresh();
  return { ok: true };
}

export async function adminUnblockUser(userId: string): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return { message: "That account no longer exists." };

  await db.user.update({
    where: { id: userId },
    data: { status: "ACTIVE", deletedAt: null },
  });

  await audit({
    action: "admin.participant_unblocked",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "user",
    entityId: userId,
  });

  refresh();
  return { ok: true };
}

/**
 * Removal is a soft delete.
 *
 * A hard delete would take the person's submission and their audit trail with them,
 * and on event day an admin under pressure will occasionally remove the wrong row.
 * Soft delete keeps the evidence and makes the mistake reversible from the UI.
 */
export async function adminRemoveUser(userId: string): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  if (userId === admin.id) {
    return { message: "You cannot remove your own account." };
  }

  await db.user.update({
    where: { id: userId },
    data: { status: "REMOVED", deletedAt: new Date() },
  });
  await revokeAllSessions(userId);

  await audit({
    action: "admin.participant_removed",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "user",
    entityId: userId,
  });

  refresh();
  return { ok: true };
}

export async function adminResetPassword(userId: string): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const tempPassword = generateTempPassword();

  await db.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
    },
  });

  // Whoever held the old password may still have an open session.
  await revokeAllSessions(userId);

  await audit({
    action: "admin.password_reset",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "user",
    entityId: userId,
  });

  refresh();
  return { ok: true, tempPassword: formatTempPassword(tempPassword) };
}

// ---------------------------------------------------------------------------
// The judge approval queue (requirement 7)
// ---------------------------------------------------------------------------

export async function adminApproveJudge(userId: string): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const judge = await db.user.findFirst({
    where: { id: userId, role: "JUDGE" },
    select: { id: true, status: true },
  });
  if (!judge) return { message: "That judge account no longer exists." };
  if (judge.status !== "PENDING_APPROVAL") {
    return { message: "That account has already been dealt with." };
  }

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { status: "ACTIVE" } }),
    db.judgeProfile.update({
      where: { userId },
      data: { approvedById: admin.id, approvedAt: new Date() },
    }),
  ]);

  await audit({
    action: "admin.judge_approved",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "user",
    entityId: userId,
  });

  // Judges are often approved after the first participants have finished, and a
  // submission with no evaluation row is invisible to the judging screens. Closing
  // the gap here means nobody has to notice it.
  await assignUnassignedSubmissions();

  refresh();
  return { ok: true };
}

/**
 * Rejection is a soft delete rather than a hard one, so a mistaken rejection can be
 * restored and an impostor's attempt stays on record.
 */
export async function adminRejectJudge(userId: string): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  await db.user.update({
    where: { id: userId },
    data: { status: "REMOVED", deletedAt: new Date() },
  });

  await audit({
    action: "admin.judge_rejected",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "user",
    entityId: userId,
  });

  refresh();
  return { ok: true };
}
