import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads .env on its own. Next.js still does, so this is only for
// the CLI. In deployed environments the variables are already injected and there is
// no file to read, hence the catch.
try {
  process.loadEnvFile();
} catch {
  // no .env file — expected in CI and production
}

/**
 * Prisma CLI configuration (migrate, studio, db push, seed).
 *
 * Note the connection split, which is deliberate — see R1 in docs/DELIVERY_PLAN.md:
 *
 *   DIRECT_DATABASE_URL  used here, by the CLI. Schema migrations cannot run through a
 *                        connection pooler, which rewrites and multiplexes statements.
 *   DATABASE_URL         used at runtime by src/lib/db.ts. MUST be the pooled endpoint;
 *                        1000 concurrent participants against a direct connection will
 *                        exhaust the server's connection limit and take the event down.
 *
 * In local development the two are usually the same value, so a mistake here stays
 * invisible until load. Keep them distinct in every deployed environment.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
