import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Role, UserStatus } from "@/generated/prisma/enums";
import { requestContext } from "@/lib/audit";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Sessions.
 *
 * A signed JWT in an httpOnly cookie carries only a session id. The session itself
 * lives in the database, which is what makes revocation instant — and we need instant:
 * blocking a participant mid-attempt (D7) and locking an account on final submission
 * (requirement 5) both have to kill every open tab immediately, not whenever a token
 * happens to expire. A self-contained JWT cannot do that.
 *
 * The cost is one query per request. It is a primary-key lookup joined to the user
 * row, so it is cheap on the database — but it is latency-bound, which is why R1b
 * (co-locating the database with the app) matters as much as it does.
 */

export const SESSION_COOKIE = "wtq_session";

/**
 * Long enough to cover a full event day: a 3-hour attempt plus the waiting, plus
 * judging into the evening. Short enough that an unattended laptop is not open
 * indefinitely.
 */
const SESSION_TTL_HOURS = 12;

const secret = new TextEncoder().encode(env.SESSION_SECRET);

export interface SessionUser {
  id: string;
  role: Role;
  status: UserStatus;
  email: string;
  fullName: string;
  mustChangePassword: boolean;
}

export async function createSession(userId: string): Promise<void> {
  const { ip, userAgent } = await requestContext();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);

  const session = await db.session.create({
    data: { userId, expiresAt, ip, userAgent },
  });

  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // not readable by script, so XSS cannot steal it
    sameSite: "strict", // no cross-site submission of an authenticated request
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Current user, or null.
 *
 * Wrapped in React's cache() so a layout, a page and a component in the same render
 * share one query rather than issuing three.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let sessionId: string;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    sessionId = payload.sub;
  } catch {
    // Expired, tampered with, or signed by a rotated secret.
    return null;
  }

  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: {
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          role: true,
          status: true,
          email: true,
          fullName: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  // The account may have been blocked, removed or locked since this session began.
  // Checking status here is what makes an admin's action take effect immediately.
  if (session.user.status !== "ACTIVE") return null;

  return session.user;
});

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.sub) {
        await db.session.updateMany({
          where: { id: payload.sub, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // Nothing to revoke; still clear the cookie below.
    }
  }

  store.delete(SESSION_COOKIE);
}

/**
 * Revokes every session for a user.
 *
 * Called when an admin blocks or removes someone, when a password is reset, and on
 * final submission. `updateMany` rather than a delete so the audit trail keeps the
 * record of the sessions that existed.
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}
