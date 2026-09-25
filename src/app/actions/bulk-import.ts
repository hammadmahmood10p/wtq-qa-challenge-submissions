"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import {
  parseJudges,
  parseParticipants,
  type JudgeRow,
  type ParsedImport,
  type ParticipantRow,
  type RowProblem,
} from "@/lib/bulk-import";
import { encryptCnic, hashCnic } from "@/lib/crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { signupConflictField } from "@/lib/prisma-errors";

/**
 * Bulk account creation, in two halves.
 *
 * `previewBulkImport` reads the file and says what it found without writing anything.
 * `createBulkBatch` then creates a slice of the accepted rows at a time, called
 * repeatedly by the browser.
 *
 * It is split for two reasons. Hashing a password with Argon2 costs tens of
 * milliseconds by design, so a thousand accounts is well over a minute of work — long
 * enough to hit a proxy's read timeout, and far too long to leave somebody staring at
 * a spinner with no idea whether anything was created. Batching gives a progress bar
 * and makes a dropped connection cost one batch instead of the whole import.
 *
 * The preview is the second reason, and the better one: it turns "import a thousand
 * accounts" into something you can look at before you commit to it.
 */

export interface ImportPreview {
  kind: "participant" | "judge";
  totalDataRows: number;
  /** Rows that passed validation, ready to create. */
  accepted: (ParticipantRow | JudgeRow)[];
  /** Rows that will not be created, with the reasons. */
  problems: RowProblem[];
  missingColumns: string[];
  error?: string;
}

const MAX_CSV_BYTES = 5 * 1024 * 1024;

export async function previewBulkImport(
  kind: "participant" | "judge",
  formData: FormData,
): Promise<ImportPreview> {
  await requireRole("SUPER_ADMIN");

  const empty: ImportPreview = {
    kind,
    totalDataRows: 0,
    accepted: [],
    problems: [],
    missingColumns: [],
  };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ...empty, error: "Choose a CSV file to import." };
  }

  if (file.size > MAX_CSV_BYTES) {
    return { ...empty, error: "That file is larger than 5MB. Is it the right file?" };
  }

  const text = Buffer.from(await file.arrayBuffer()).toString("utf8");

  if (text.includes("\u0000")) {
    return {
      ...empty,
      error: "That does not look like a CSV — it contains binary data. Export it as CSV and try again.",
    };
  }

  const parsed: ParsedImport<ParticipantRow> | ParsedImport<JudgeRow> =
    kind === "participant" ? parseParticipants(text) : parseJudges(text);

  return {
    kind,
    totalDataRows: parsed.totalDataRows,
    accepted: parsed.rows,
    problems: parsed.problems,
    missingColumns: parsed.missingColumns,
  };
}

export interface BatchResult {
  created: number;
  problems: RowProblem[];
}

/** Turns a unique-constraint violation into something an organiser can act on. */
function conflictProblem(error: unknown): string {
  switch (signupConflictField(error)) {
    case "email":
      return "An account with this email already exists";
    case "idCardNumber":
      return "An account with this ID card number already exists";
    case "phone":
      return "An account with this phone number already exists";
    case "unknown":
      return "An account with these details already exists";
    default:
      return null as unknown as string;
  }
}

/**
 * Creates one batch.
 *
 * Each row is its own attempt: a clash on row nine must not roll back rows one to
 * eight, so there is no transaction around the batch. That is the whole point of the
 * feature — the organisers asked for an import that keeps going.
 */
export async function createBulkBatch(
  kind: "participant" | "judge",
  rows: (ParticipantRow | JudgeRow)[],
  startLine: number,
): Promise<BatchResult> {
  const admin = await requireRole("SUPER_ADMIN");

  let created = 0;
  const problems: RowProblem[] = [];

  for (const [index, row] of rows.entries()) {
    const line = startLine + index;

    try {
      const passwordHash = await hashPassword(row.password);

      if (kind === "participant") {
        const participant = row as ParticipantRow;
        await db.user.create({
          data: {
            role: "PARTICIPANT",
            email: participant.email,
            fullName: participant.fullName,
            passwordHash,
            status: "ACTIVE",
            // Not forced to change it: the password is built from their own details
            // precisely so nobody has to be told it, and a forced change on arrival
            // would reintroduce the queue this feature exists to remove.
            mustChangePassword: false,
            passwordIsDerived: true,
            createdById: admin.id,
            participantProfile: {
              create: {
                idCardHash: hashCnic(participant.idCardNumber),
                idCardEncrypted: encryptCnic(participant.idCardNumber),
                phoneE164: participant.phone,
                location: participant.location,
              },
            },
          },
        });
      } else {
        const judge = row as JudgeRow;
        await db.user.create({
          data: {
            role: "JUDGE",
            email: judge.email,
            fullName: judge.fullName,
            passwordHash,
            // Requirement 10: an imported judge is approved by the act of importing.
            // The approval queue exists to vet people who sign themselves up, not to
            // make an admin confirm a list they just supplied.
            status: "ACTIVE",
            mustChangePassword: false,
            passwordIsDerived: true,
            createdById: admin.id,
            judgeProfile: {
              create: {
                phoneE164: judge.phone,
                approvedById: admin.id,
                approvedAt: new Date(),
              },
            },
          },
        });
      }

      created++;
    } catch (error) {
      const conflict = conflictProblem(error);

      if (conflict) {
        problems.push({ line, name: row.fullName, email: row.email, problems: [conflict] });
      } else {
        console.error("[bulk-import]", error);
        problems.push({
          line,
          name: row.fullName,
          email: row.email,
          problems: ["Could not be created — an unexpected error occurred"],
        });
      }
    }
  }

  return { created, problems };
}

/** Called once when the import finishes, so the audit records one event and not 1000. */
export async function finishBulkImport(
  kind: "participant" | "judge",
  summary: { created: number; failed: number; totalDataRows: number },
): Promise<void> {
  const admin = await requireRole("SUPER_ADMIN");

  await audit({
    action: kind === "participant" ? "admin.participants_imported" : "admin.judges_imported",
    actorId: admin.id,
    actorRole: "SUPER_ADMIN",
    entityType: "user",
    metadata: summary,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath("/admin/judges");
}
