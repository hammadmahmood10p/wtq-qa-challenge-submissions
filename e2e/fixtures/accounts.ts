import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { encryptCnic, hashCnic } from "../../src/lib/crypto";
import { hashPassword } from "../../src/lib/password";

/**
 * Test accounts, created and torn down around the suite.
 *
 * Seeded with plain SQL through `pg` rather than through Prisma: Playwright transpiles
 * specs as CommonJS, and the generated Prisma client is ESM (it uses import.meta), so
 * importing it here fails before any test runs. The tables are simple enough that raw
 * inserts are no worse, and this keeps the fixture free of that constraint.
 *
 * Every account is prefixed `e2e.` so cleanup is a single DELETE that cannot touch a
 * real registration. These run against the development database and must never be
 * pointed at production.
 */

export const E2E_PASSWORD = "Challenge2026";
export const E2E_PREFIX = "e2e.";

export const ACCOUNTS = {
  participant: {
    email: "e2e.participant@example.com",
    cnic: "4210155555551",
    cnicFormatted: "42101-5555555-1",
    phone: "+923005555551",
    phoneLocal: "0300-5555551",
    fullName: "E2E Participant",
  },
  blocked: {
    email: "e2e.blocked@example.com",
    cnic: "4210155555552",
    phone: "+923005555552",
    fullName: "E2E Blocked",
  },
  locked: {
    email: "e2e.locked@example.com",
    cnic: "4210155555553",
    phone: "+923005555553",
    fullName: "E2E Submitted",
  },
  pendingJudge: { email: "e2e.pending@10pearls.com", fullName: "E2E Pending Judge" },
  judge: { email: "e2e.judge@10pearls.com", fullName: "E2E Judge" },
  admin: { email: "e2e.admin@10pearls.com", fullName: "E2E Admin" },
} as const;

async function connect() {
  const client = new Client({
    connectionString: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  await client.connect();
  return client;
}

export async function seedAccounts() {
  const db = await connect();
  try {
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${E2E_PREFIX}%`]);

    // The suite logs in far more often than a person would, and the per-account limit
    // is deliberately tight (10 per 5 minutes). Clearing the counters keeps the tests
    // measuring the app rather than the rate limiter — a real limit that these runs
    // legitimately exceed.
    await db.query(`DELETE FROM rate_limits`);

    const passwordHash = await hashPassword(E2E_PASSWORD);

    const addUser = async (
      email: string,
      fullName: string,
      role: "PARTICIPANT" | "JUDGE" | "SUPER_ADMIN",
      status: "ACTIVE" | "BLOCKED" | "SUBMITTED_LOCKED" | "PENDING_APPROVAL",
    ) => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO users (id, role, email, "fullName", "passwordHash", status, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [id, role, email, fullName, passwordHash, status],
      );
      return id;
    };

    const addParticipant = async (
      a: { email: string; cnic: string; phone: string; fullName: string },
      status: "ACTIVE" | "BLOCKED" | "SUBMITTED_LOCKED",
      location: "KARACHI" | "LAHORE" | "ISLAMABAD",
    ) => {
      const id = await addUser(a.email, a.fullName, "PARTICIPANT", status);
      await db.query(
        `INSERT INTO participant_profiles ("userId", "idCardHash", "idCardEncrypted", "phoneE164", location)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, hashCnic(a.cnic), encryptCnic(a.cnic), a.phone, location],
      );
    };

    await addParticipant(ACCOUNTS.participant, "ACTIVE", "KARACHI");
    await addParticipant(ACCOUNTS.blocked, "BLOCKED", "LAHORE");
    await addParticipant(ACCOUNTS.locked, "SUBMITTED_LOCKED", "ISLAMABAD");

    const pendingId = await addUser(
      ACCOUNTS.pendingJudge.email,
      ACCOUNTS.pendingJudge.fullName,
      "JUDGE",
      "PENDING_APPROVAL",
    );
    await db.query(`INSERT INTO judge_profiles ("userId") VALUES ($1)`, [pendingId]);

    const judgeId = await addUser(
      ACCOUNTS.judge.email,
      ACCOUNTS.judge.fullName,
      "JUDGE",
      "ACTIVE",
    );
    await db.query(`INSERT INTO judge_profiles ("userId", "approvedAt") VALUES ($1, NOW())`, [
      judgeId,
    ]);

    await addUser(ACCOUNTS.admin.email, ACCOUNTS.admin.fullName, "SUPER_ADMIN", "ACTIVE");
  } finally {
    await db.end();
  }
}

/**
 * Puts a participant back before the start line.
 *
 * An attempt is deliberately once-only and unrestartable, which is exactly what makes
 * it awkward to test — so the reset happens in the database rather than through any
 * route the application exposes. There is no "start again" path in the product, and
 * there must not be.
 */
export async function resetAttempt(email: string) {
  const db = await connect();
  try {
    await db.query(
      `DELETE FROM attempts
       WHERE "participantId" IN (SELECT id FROM users WHERE email = $1)`,
      [email],
    );

    // The suite signs the same participant in once per test, which a real person
    // would never do — the per-account limit is 10 attempts in 5 minutes and it is
    // deliberately tight. Clearing the counters keeps these tests measuring the
    // product rather than the limiter.
    await db.query(`DELETE FROM rate_limits`);
  } finally {
    await db.end();
  }
}

/** Puts a participant mid-attempt, with the clock running. */
export async function startAttemptFor(email: string, minutes = 180) {
  const db = await connect();
  try {
    await db.query(
      `INSERT INTO attempts (id, "participantId", "startedAt", "endsAt", "durationMinutes", state, "updatedAt")
       SELECT gen_random_uuid(), id, NOW(), NOW() + make_interval(mins => $2::int), $2::int, 'IN_PROGRESS', NOW()
       FROM users WHERE email = $1
       ON CONFLICT ("participantId") DO UPDATE
         SET "startedAt" = NOW(),
             "endsAt" = NOW() + make_interval(mins => $2::int),
             "durationMinutes" = $2::int,
             state = 'IN_PROGRESS',
             "updatedAt" = NOW()`,
      [email, minutes],
    );
  } finally {
    await db.end();
  }
}

/**
 * Ends an attempt without deleting it, so the work stays behind.
 *
 * This is how a tab left open past the deadline is simulated: the server has moved on
 * and the page has not noticed, which is exactly the state a post-close write arrives
 * in.
 */
export async function closeAttempt(email: string, state: "SUBMITTED" | "EXPIRED" = "SUBMITTED") {
  const db = await connect();
  try {
    await db.query(
      `UPDATE attempts SET state = $2, "submittedAt" = NOW(), "updatedAt" = NOW()
       WHERE "participantId" IN (SELECT id FROM users WHERE email = $1)`,
      [email, state],
    );
  } finally {
    await db.end();
  }
}

/** Reads Challenge 1 titles straight from the database, bypassing the interface. */
export async function challenge1Titles(email: string): Promise<string[]> {
  const db = await connect();
  try {
    const result = await db.query<{ title: string }>(
      `SELECT i.title
       FROM challenge1_items i
       JOIN attempts a ON a.id = i."attemptId"
       JOIN users u ON u.id = a."participantId"
       WHERE u.email = $1
       ORDER BY i.kind, i.position`,
      [email],
    );
    return result.rows.map((r) => r.title);
  } finally {
    await db.end();
  }
}

export async function cleanupAccounts() {
  const db = await connect();
  try {
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${E2E_PREFIX}%`]);
  } finally {
    await db.end();
  }
}
