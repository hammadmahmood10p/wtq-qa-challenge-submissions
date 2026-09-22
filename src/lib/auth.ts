import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { getSessionUser, type SessionUser } from "@/lib/session";

/**
 * Authorisation helpers for server components and server actions.
 *
 * Middleware only checks that a token looks valid — it cannot reach the database from
 * the edge runtime. These are the real checks, and every protected page and action
 * must call one. A route that forgets is unprotected, which is why the role layouts
 * call them once at the top rather than leaving it to each page.
 */

/** Where each role belongs after logging in. */
export const HOME_FOR_ROLE: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  JUDGE: "/judge",
  PARTICIPANT: "/challenge",
};

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // A bootstrap or admin-reset password must be changed before anything else.
  if (user.mustChangePassword) redirect("/change-password");

  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();

  if (!roles.includes(user.role)) {
    // Send them to their own area rather than showing a 403. Nothing here is secret
    // enough to warrant an error page, and a wrong-role visit is nearly always a
    // stale bookmark rather than an attack.
    redirect(HOME_FOR_ROLE[user.role]);
  }

  return user;
}

/**
 * Like requireUser, but permits the forced-password-change screen itself —
 * otherwise that page would redirect to itself forever.
 */
export async function requireUserAllowingPasswordChange(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
