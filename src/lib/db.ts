import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * A single Prisma client for the whole process.
 *
 * This matters more than it looks. R1 in docs/DELIVERY_PLAN.md: under 1000 concurrent
 * participants, a client constructed per request opens a pool per request and exhausts
 * the database's connection limit within seconds.
 *
 * Prisma 7 uses a driver adapter, which is useful here — it lets us cap the pool
 * explicitly rather than trusting a default. With N app instances the database sees
 * up to N x max connections, so this number and the instance count have to be chosen
 * together against the server's limit. Verify under k6 on Day 12.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({
    // MUST be the pooled endpoint in production. See prisma.config.ts.
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === "production" ? 10 : 5,
    // Fail fast rather than queueing forever behind an exhausted pool: a participant
    // seeing "try again" beats a request that hangs until the browser gives up.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

// Next.js hot-reloads modules on every edit in development, which would leak a new
// pool each time.
if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
