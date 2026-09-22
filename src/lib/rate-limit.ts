import { db } from "@/lib/db";
import { requestContext } from "@/lib/audit";
import { detectIdentifier } from "@/lib/normalize";

/**
 * Fixed-window rate limiting, backed by Postgres so no Redis server is needed.
 *
 * A fixed window lets through up to 2x the limit across a window boundary. That is a
 * known and accepted trade for this event: the purpose here is to stop credential
 * stuffing and signup floods from 1000 bored QA engineers, not to meter an API
 * precisely. If IT provides Redis, swap the storage and keep this interface.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Per-IP limits have to be sized for the event, not for a typical web app.
 *
 * All three cities start at the same time, and a venue full of participants shares
 * one NAT address — so from the server's point of view, several hundred people look
 * like one very busy client. A limit tuned for a single user would lock out a whole
 * city at 10am, which is a far worse outcome than the abuse it prevents.
 *
 * The per-IP number is therefore only a crude ceiling against a flood. The real
 * credential-stuffing defence is the per-account limit below, which an attacker
 * cannot dilute by spreading attempts across addresses.
 *
 * These numbers are a judgement, not a measurement — revisit them against the Day 12
 * load test, which is the first time we will see real concurrency.
 */
export const LIMITS = {
  signupPerIp: { limit: 300, windowSeconds: 600 },
  loginPerIp: { limit: 300, windowSeconds: 300 },
  /** Per person, not per typed string — see accountRateLimitKey. */
  loginPerAccount: { limit: 10, windowSeconds: 300 },
} as const;

export async function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStartCutoff = new Date(now.getTime() - windowSeconds * 1000);

  try {
    // One statement, so concurrent requests cannot both read a stale count and
    // then both write. The window resets in the same operation that increments it.
    const rows = await db.$queryRaw<{ count: number; window_start: Date }[]>`
      INSERT INTO rate_limits (key, count, "windowStart")
      VALUES (${key}, 1, ${now})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limits."windowStart" < ${windowStartCutoff} THEN 1
          ELSE rate_limits.count + 1
        END,
        "windowStart" = CASE
          WHEN rate_limits."windowStart" < ${windowStartCutoff} THEN ${now}
          ELSE rate_limits."windowStart"
        END
      RETURNING count, "windowStart" AS window_start
    `;

    const row = rows[0];
    if (!row) return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };

    const elapsed = (now.getTime() - new Date(row.window_start).getTime()) / 1000;
    return {
      allowed: row.count <= limit,
      remaining: Math.max(0, limit - row.count),
      retryAfterSeconds: Math.max(0, Math.ceil(windowSeconds - elapsed)),
    };
  } catch (error) {
    // Fail open. A rate limiter that takes the event down when the database hiccups
    // is worse than the abuse it prevents.
    console.error("[rate-limit] check failed, allowing request", error);
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

/**
 * The counter key for a login attempt against one account.
 *
 * It must be built from the *normalised* identifier, not the string that was typed.
 * One participant can be named six ways — `0300-5555551`, `+923005555551`,
 * `42101-5555555-1`, `4210155555551`, and their email in any case — and keying on the
 * raw input gives each of those its own budget. That multiplies an attacker's
 * allowance by the number of formats they can think of, which is exactly the property
 * a per-account limit exists to deny.
 *
 * Unrecognised input falls back to a lowercased raw key: it cannot match an account
 * anyway, and it still needs a counter so junk cannot be used to probe for free.
 */
export function accountRateLimitKey(username: string): string {
  const identifier = detectIdentifier(username);
  if (!identifier) return `login:account:raw:${username.trim().toLowerCase()}`;
  return `login:account:${identifier.kind}:${identifier.value}`;
}

export async function rateLimitByIp(
  scope: string,
  config: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const { ip } = await requestContext();
  return rateLimit(`${scope}:ip:${ip ?? "unknown"}`, config);
}

/** Housekeeping, for a scheduled call or a manual run. */
export async function pruneRateLimits(olderThanSeconds = 3600): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const { count } = await db.rateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
  return count;
}
