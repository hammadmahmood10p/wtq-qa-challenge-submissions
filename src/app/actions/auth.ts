"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { HOME_FOR_ROLE } from "@/lib/auth";
import {
  INVALID_CREDENTIALS,
  PARTICIPANT_LOGINS_CLOSED,
  loginRefusalMessage,
} from "@/lib/auth-messages";
import { db } from "@/lib/db";
import { fakeVerify, hashPassword, verifyPassword } from "@/lib/password";
import { LIMITS, accountRateLimitKey, rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import {
  createSession,
  destroySession,
  getSessionUser,
  revokeAllSessions,
} from "@/lib/session";
import { participantLoginsDisabled } from "@/lib/settings";
import { findUserByIdentifier } from "@/lib/user-lookup";
import { changePasswordSchema, loginSchema } from "@/lib/validation/login";

export interface AuthState {
  errors?: Record<string, string>;
  message?: string;
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ipLimit = await rateLimitByIp("login", LIMITS.loginPerIp);
  if (!ipLimit.allowed) {
    return {
      message: `Too many login attempts. Please wait ${Math.ceil(ipLimit.retryAfterSeconds / 60)} minute(s) and try again.`,
    };
  }

  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { errors };
  }

  const { username, password } = parsed.data;

  // Per-account as well as per-IP: a venue full of participants shares one NAT
  // address, so an IP limit alone cannot be tight enough to stop an attack on a
  // single account without locking out a whole city. The key is built from the
  // normalised identifier so the budget cannot be multiplied by retyping the same
  // person a different way.
  const accountLimit = await rateLimit(accountRateLimitKey(username), LIMITS.loginPerAccount);
  if (!accountLimit.allowed) {
    return {
      message: `Too many attempts for this account. Please wait ${Math.ceil(accountLimit.retryAfterSeconds / 60)} minute(s) and try again.`,
    };
  }

  const user = await findUserByIdentifier(username);

  if (!user) {
    // Spend the same CPU a real verification would, so response time does not reveal
    // whether the account exists.
    await fakeVerify();
    return { message: INVALID_CREDENTIALS };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    await audit({
      action: "auth.login_failed",
      actorId: user.id,
      actorRole: user.role,
      entityType: "user",
      entityId: user.id,
      metadata: { reason: "bad_password" },
    });
    return { message: INVALID_CREDENTIALS };
  }

  // Password is correct — only now is it safe to explain a status refusal.
  const refusal = loginRefusalMessage(user.status);
  if (refusal) {
    await audit({
      action: "auth.login_failed",
      actorId: user.id,
      actorRole: user.role,
      entityType: "user",
      entityId: user.id,
      metadata: { reason: `status_${user.status.toLowerCase()}` },
    });

    return { message: refusal };
  }

  // Checked after the password, for the same reason the status refusals are: before
  // it, this would tell anyone typing a guess whether the account is a participant.
  if (user.role === "PARTICIPANT" && (await participantLoginsDisabled())) {
    await audit({
      action: "auth.login_failed",
      actorId: user.id,
      actorRole: user.role,
      entityType: "user",
      entityId: user.id,
      metadata: { reason: "participant_logins_disabled" },
    });

    return { message: PARTICIPANT_LOGINS_CLOSED };
  }

  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await audit({
    action: "auth.login",
    actorId: user.id,
    actorRole: user.role,
    entityType: "user",
    entityId: user.id,
  });

  redirect(user.mustChangePassword ? "/change-password" : HOME_FOR_ROLE[user.role]);
}

export async function logout(): Promise<void> {
  const user = await getSessionUser();

  if (user) {
    await audit({
      action: "auth.logout",
      actorId: user.id,
      actorRole: user.role,
      entityType: "user",
      entityId: user.id,
    });
  }

  await destroySession();
  redirect("/login");
}

export async function changePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { errors };
  }

  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!record) redirect("/login");

  if (!(await verifyPassword(record.passwordHash, parsed.data.currentPassword))) {
    return { errors: { currentPassword: "That is not your current password." } };
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(parsed.data.newPassword),
      mustChangePassword: false,
    },
  });

  await audit({
    action: "auth.password_changed",
    actorId: user.id,
    actorRole: user.role,
    entityType: "user",
    entityId: user.id,
  });

  // Every other session belonged to whoever knew the old password — which, after an
  // admin reset, may not be only this user.
  await revokeAllSessions(user.id);
  await createSession(user.id);

  redirect(HOME_FOR_ROLE[user.role]);
}
