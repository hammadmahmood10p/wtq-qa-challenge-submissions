"use server";

import { revalidatePath } from "next/cache";
import { reopenAttempt, resetAttempt } from "@/lib/attempt-admin";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { encryptCnic, hashCnic } from "@/lib/crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { signupConflictField } from "@/lib/prisma-errors";
import { LAST_ADMIN_MESSAGE, wouldStrandTheEvent } from "@/lib/last-admin";
import { revokeAllSessions } from "@/lib/session";
import {
  PARTICIPANT_LOGINS_DISABLED,
  setParticipantLoginsDisabled,
} from "@/lib/settings";
import { formatTempPassword, generateTempPassword } from "@/lib/temp-password";
import {
  adminCreateJudgeSchema,
  adminCreateParticipantSchema,
  adminCreateSuperAdminSchema,
} from "@/lib/validation/admin";

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
/**
 * Refuses an action that would leave nobody able to administer the event.
 *
 * Returns a message when the action must not proceed, null when it may.
 */
async function strandingRefusal(userId: string): Promise<string | null> {
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });

  if (!target) return null;

  const otherActiveSuperAdmins = await db.user.count({
    where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, id: { not: userId } },
  });

  return wouldStrandTheEvent({
    targetRole: target.role,
    targetStatus: target.status,
    otherActiveSuperAdmins,
  })
    ? LAST_ADMIN_MESSAGE
    : null;
}

export async function adminBlockUser(userId: string): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  if (userId === admin.id) {
    return { message: "You cannot block your own account." };
  }

  const stranded = await strandingRefusal(userId);
  if (stranded) return { message: stranded };

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

  const stranded = await strandingRefusal(userId);
  if (stranded) return { message: stranded };

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

  // Nothing to backfill: submissions are not assigned in advance, so a judge
  // approved late sees the same shared list as everyone else and simply takes work
  // off it. They do become selectable in the Judge column from this moment.
  revalidatePath("/judge");
  revalidatePath("/admin/submissions");

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

// ---------------------------------------------------------------------------
// Undoing a sealed attempt
// ---------------------------------------------------------------------------

/**
 * Hands a submitted attempt back so the participant can carry on where they stopped.
 *
 * Their saved work is untouched; only the clock and the lock change. While it is open
 * again the submission is out of every judging queue, and submitting a second time
 * overwrites the first in place — there is one attempt row per participant, so a
 * duplicate is not something the schema can express.
 */
export async function adminReopenAttempt(
  participantId: string,
  minutes: number,
): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const result = await reopenAttempt(participantId, { minutes, adminId: admin.id });
  if (!result.ok) return { message: result.message };

  refresh();
  revalidatePath("/admin/submissions");
  revalidatePath("/judge");
  return { ok: true };
}

/**
 * Clears a submitted attempt so the participant starts again from nothing.
 *
 * Destructive and not recoverable: their findings, evidence, uploads, links, answers
 * and any scoring are deleted. The confirmation in the interface spells that out,
 * because from the roster this looks a lot like reopening and is not.
 */
export async function adminResetAttempt(participantId: string): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const result = await resetAttempt(participantId, { adminId: admin.id });
  if (!result.ok) return { message: result.message };

  refresh();
  revalidatePath("/admin/submissions");
  revalidatePath("/judge");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The participant login gate
// ---------------------------------------------------------------------------

/**
 * Opens or closes participant logins for everyone at once.
 *
 * Deliberately does not touch anybody's session: someone already working carries on,
 * and their three hours are not disturbed by an administrative decision about the
 * front door. Signing people out is a separate, separately confirmed action.
 */
export async function adminSetParticipantLogins(disabled: boolean): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  await setParticipantLoginsDisabled(disabled);

  await audit({
    action: disabled ? "admin.participant_logins_disabled" : "admin.participant_logins_enabled",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "setting",
    entityId: PARTICIPANT_LOGINS_DISABLED,
  });

  refresh();
  return { ok: true };
}

/**
 * Signs every participant out, everywhere, at once.
 *
 * The emergency stop. Saved work survives — everything autosaves — but anything typed
 * and not yet saved is lost, and attempt clocks keep running, so this is not a pause.
 * Judges and admins are untouched: whatever went wrong, the people fixing it need to
 * stay logged in.
 */
export async function adminSignOutAllParticipants(): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const { count } = await db.session.updateMany({
    where: { revokedAt: null, user: { role: "PARTICIPANT" } },
    data: { revokedAt: new Date() },
  });

  await audit({
    action: "admin.participants_signed_out",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "session",
    metadata: { sessionsRevoked: count },
  });

  refresh();
  return { ok: true, message: `Signed out ${count} participant session(s).` };
}

// ---------------------------------------------------------------------------
// Super admins
// ---------------------------------------------------------------------------

/**
 * Creates another super admin.
 *
 * The highest-privilege action in the product, so it behaves like the others rather
 * than specially: a temporary password shown once, a forced change at first login, and
 * an audit entry naming who created whom. The password is never stored anywhere
 * readable and never emailed — there is no mail service — so the creating admin has to
 * hand it over before closing the dialog.
 */
export async function adminCreateSuperAdmin(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const admin = await requireRole("SUPER_ADMIN");

  const parsed = adminCreateSuperAdminSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
  });

  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const data = parsed.data;
  const tempPassword = generateTempPassword();

  try {
    const user = await db.user.create({
      data: {
        role: "SUPER_ADMIN",
        email: data.email,
        fullName: data.fullName,
        passwordHash: await hashPassword(tempPassword),
        status: "ACTIVE",
        mustChangePassword: true,
        createdById: admin.id,
      },
    });

    await audit({
      action: "admin.super_admin_created",
      actorId: admin.id,
      actorRole: "SUPER_ADMIN",
      entityType: "user",
      entityId: user.id,
      metadata: { email: data.email, fullName: data.fullName },
    });
  } catch (error) {
    const conflict = conflictErrors(error);
    if (conflict) return { errors: conflict };

    console.error("[admin:createSuperAdmin]", error);
    return { message: "Could not create the super admin. Please try again." };
  }

  refresh();
  revalidatePath("/admin/admins");
  return { ok: true, tempPassword: formatTempPassword(tempPassword) };
}
