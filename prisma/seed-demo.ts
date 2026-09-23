import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { encryptCnic, hashCnic } from "../src/lib/crypto";

try {
  process.loadEnvFile();
} catch {
  // variables already injected
}

/**
 * Demo accounts, for walking through the application by hand.
 *
 * Every password here is written down in plain sight, so this must never run against
 * the real event database. It refuses in production, and the accounts it creates are
 * listed in docs/DEMO_ACCOUNTS.md, which is git-ignored.
 *
 * Re-running replaces them, so the passwords below are always the live ones.
 */
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo accounts in production.");
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  }),
});

const PASSWORDS = {
  admin: "WtqAdmin2026!",
  judge: "WtqJudge2026!",
  participant: "WtqPlayer2026!",
} as const;

const ADMINS = [{ email: "superadmin@10pearls.com", fullName: "Sara Malik (Super Admin)" }];

const JUDGES = [
  { email: "judge@10pearls.com", fullName: "Nadia Rehman", approved: true },
  { email: "judge.pending@10pearls.com", fullName: "Hina Siddiqui", approved: false },
];

const PARTICIPANTS = [
  {
    email: "participant@example.com",
    fullName: "Ayesha Khan",
    cnic: "4210112345671",
    phone: "+923001234561",
    location: "KARACHI" as const,
    status: "ACTIVE" as const,
  },
  {
    email: "participant.lahore@example.com",
    fullName: "Fatima Sheikh",
    cnic: "3520112345672",
    phone: "+923001234562",
    location: "LAHORE" as const,
    status: "ACTIVE" as const,
  },
  {
    email: "participant.islamabad@example.com",
    fullName: "Zainab Tariq",
    cnic: "6110112345673",
    phone: "+923001234563",
    location: "ISLAMABAD" as const,
    status: "ACTIVE" as const,
  },
  {
    // Here so the roster shows a blocked badge and the block/unblock controls.
    email: "participant.blocked@example.com",
    fullName: "Maryam Iqbal",
    cnic: "4210112345674",
    phone: "+923001234564",
    location: "KARACHI" as const,
    status: "BLOCKED" as const,
  },
];

async function main() {
  const emails = [
    ...ADMINS.map((a) => a.email),
    ...JUDGES.map((j) => j.email),
    ...PARTICIPANTS.map((p) => p.email),
  ];

  // Evaluations first. `evaluations.judgeId` restricts deletion, so a demo judge who
  // has been assigned a submission cannot be removed while those rows exist. That is
  // the right rule — scores must not vanish with a judge — and the application only
  // ever soft deletes, so it matters here alone.
  await db.evaluation.deleteMany({
    where: {
      OR: [
        { judge: { email: { in: emails } } },
        { attempt: { participant: { user: { email: { in: emails } } } } },
      ],
    },
  });

  // Replace rather than update, so the passwords printed below are always correct.
  const { count } = await db.user.deleteMany({ where: { email: { in: emails } } });
  if (count) console.log(`Removed ${count} existing demo account(s).`);

  for (const admin of ADMINS) {
    await db.user.create({
      data: {
        role: "SUPER_ADMIN",
        email: admin.email,
        fullName: admin.fullName,
        passwordHash: await hash(PASSWORDS.admin),
        status: "ACTIVE",
        // Deliberately false: a forced change on every reseed would make these
        // accounts tiresome to use for a quick look round.
        mustChangePassword: false,
      },
    });
  }

  for (const judge of JUDGES) {
    await db.user.create({
      data: {
        role: "JUDGE",
        email: judge.email,
        fullName: judge.fullName,
        passwordHash: await hash(PASSWORDS.judge),
        status: judge.approved ? "ACTIVE" : "PENDING_APPROVAL",
        mustChangePassword: false,
        judgeProfile: { create: judge.approved ? { approvedAt: new Date() } : {} },
      },
    });
  }

  for (const p of PARTICIPANTS) {
    await db.user.create({
      data: {
        role: "PARTICIPANT",
        email: p.email,
        fullName: p.fullName,
        passwordHash: await hash(PASSWORDS.participant),
        status: p.status,
        mustChangePassword: false,
        participantProfile: {
          create: {
            idCardHash: hashCnic(p.cnic),
            idCardEncrypted: encryptCnic(p.cnic),
            phoneE164: p.phone,
            location: p.location,
          },
        },
      },
    });
  }

  // The login rate limiter counts against a normalised identity, and a demo session
  // will sign in far more often than a person would.
  await db.rateLimit.deleteMany({});

  console.log(`\n✓ ${ADMINS.length} admin, ${JUDGES.length} judges, ${PARTICIPANTS.length} participants`);
  console.log("\nSee docs/DEMO_ACCOUNTS.md for the credentials.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
