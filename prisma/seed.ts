import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

try {
  process.loadEnvFile();
} catch {
  // no .env file — expected in CI and production
}

// Seeding goes through the direct connection, like migrations: it is a one-off
// administrative task and has no reason to consume the application's pool.
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  }),
});

/**
 * Default application settings.
 *
 * The scoring scale is deliberately not hardcoded (D2). It is still undefined as of
 * 22 Sep and is needed by 2 Oct, so it lives here as configuration that can be changed
 * on the day without a deployment. A max of 0 means "not yet configured", and the
 * judging screens must refuse to accept scores until real values are set.
 */
const DEFAULT_SETTINGS: Record<string, string> = {
  attempt_duration_minutes: "180",
  max_score_c1: "0",
  max_score_c2: "0",
  max_score_c2_bonus: "5",
  max_score_c3: "0",
  results_published: "false",
};

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log(`✓ app settings (${Object.keys(DEFAULT_SETTINGS).length})`);

  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log("• skipped super admin — SEED_SUPER_ADMIN_EMAIL / _PASSWORD not set");
    return;
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• super admin already exists (${email})`);
    return;
  }

  await db.user.create({
    data: {
      role: "SUPER_ADMIN",
      email,
      fullName: "Super Admin",
      passwordHash: await hash(password),
      status: "ACTIVE",
      // The seed password is in an env file and likely in someone's shell history.
      // It is a bootstrap credential, not a real one.
      mustChangePassword: true,
    },
  });

  console.log(`✓ super admin created (${email}) — password change forced at first login`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
