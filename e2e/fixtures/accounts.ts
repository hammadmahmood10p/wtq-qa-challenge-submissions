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

export async function cleanupAccounts() {
  const db = await connect();
  try {
    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${E2E_PREFIX}%`]);
  } finally {
    await db.end();
  }
}
