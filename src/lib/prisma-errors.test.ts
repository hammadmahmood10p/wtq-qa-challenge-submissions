import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { signupConflictField, uniqueConstraintName } from "./prisma-errors";

/**
 * These fixtures are copied from real errors produced by Prisma 7.10 on Neon.
 *
 * The regression they guard against already happened once: meta.target, which older
 * Prisma populated, is undefined under the pg driver adapter. Every duplicate signup
 * silently became a vague "these details already exist" message. If a future upgrade
 * moves the constraint name again, these tests fail instead of the UX quietly rotting.
 */

function p2002(meta: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.10.0",
    meta,
  });
}

function driverAdapterMeta(index: string, table: string) {
  return {
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "23505",
        originalMessage: `duplicate key value violates unique constraint "${index}"`,
        kind: "UniqueConstraintViolation",
        constraint: { index },
        table,
      },
    },
  };
}

describe("uniqueConstraintName", () => {
  it("reads the Prisma 7 driver adapter shape", () => {
    expect(uniqueConstraintName(p2002(driverAdapterMeta("users_email_key", "users")))).toBe(
      "users_email_key",
    );
  });

  it("still reads the classic meta.target shape", () => {
    expect(uniqueConstraintName(p2002({ target: ["email"] }))).toBe("email");
    expect(uniqueConstraintName(p2002({ target: "email" }))).toBe("email");
  });

  it("falls back to parsing the Postgres message", () => {
    const error = p2002({
      driverAdapterError: {
        cause: {
          originalMessage: 'duplicate key value violates unique constraint "users_email_key"',
        },
      },
    });
    expect(uniqueConstraintName(error)).toBe("users_email_key");
  });

  it("returns null for errors that are not unique violations", () => {
    expect(uniqueConstraintName(new Error("boom"))).toBeNull();
    expect(
      uniqueConstraintName(
        new Prisma.PrismaClientKnownRequestError("not found", {
          code: "P2025",
          clientVersion: "7.10.0",
        }),
      ),
    ).toBeNull();
  });
});

describe("signupConflictField", () => {
  it.each([
    ["users_email_key", "users", "email"],
    ["participant_profiles_idCardHash_key", "participant_profiles", "idCardNumber"],
    ["participant_profiles_phoneE164_key", "participant_profiles", "phone"],
  ])("maps %s to the %s form field", (index, table, expected) => {
    expect(signupConflictField(p2002(driverAdapterMeta(index, table)))).toBe(expected);
  });

  it("reports an unrecognised constraint as unknown, not as a field", () => {
    expect(signupConflictField(p2002(driverAdapterMeta("some_other_key", "attempts")))).toBe(
      "unknown",
    );
  });

  it("returns null when the error is not a conflict at all", () => {
    expect(signupConflictField(new Error("network"))).toBeNull();
  });
});
