import { db } from "@/lib/db";
import { requestContext } from "@/lib/audit";

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

export const LIMITS = {
  /** Per IP. Generous, because a venue full of participants shares one NAT address. */
  signupPerIp: { limit: 20, windowSeconds: 600 },
  /** Per IP. Day 3 will add a tighter per-account limit alongside this. */
  loginPerIp: { limit: 30, windowSeconds: 300 },
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
