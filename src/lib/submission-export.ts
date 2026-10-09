import "server-only";

import type { ChallengeKey } from "@/generated/prisma/enums";
import { decryptCnic } from "@/lib/crypto";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import type { ZipEntry } from "@/lib/zip";

/**
 * Exporting every uploaded report for one challenge as a single archive.
 *
 * The organisers mark offline and in bulk, and downloading five hundred reports one
 * "View File" at a time is not a workflow. The whole set comes down as one zip, named
 * so the files sort and identify themselves without opening them.
 *
 * Two things shape the implementation.
 *
 * **Nothing is held in memory that does not have to be.** The rows are read once, and
 * each report is fetched from storage only as the archive reaches it. Five hundred
 * reports at twenty megabytes is ten gigabytes; buffering that on a shared VM would
 * take the app down for everyone still being judged.
 *
 * **A missing report is not an error.** Participants who skipped a challenge, or ran
 * out of time, simply have no row — the export passes over them and carries on. An
 * export that refuses to run because one of five hundred people did not upload
 * anything would be useless on exactly the day it is needed.
 */

export const EXPORTABLE_CHALLENGES: ChallengeKey[] = ["C2", "C3"];

export function isExportableChallenge(value: string): value is "C2" | "C3" {
  return (EXPORTABLE_CHALLENGES as string[]).includes(value);
}

/** The number in "Challenge 2", from the enum key. */
export function challengeNumber(challenge: "C2" | "C3"): number {
  return Number(challenge.slice(1));
}

/**
 * The name one report takes inside the archive.
 *
 * `<last five of the CNIC>-<FullNameNoSpaces>-Challenge-<n>.pdf`, as the organisers
 * asked. The CNIC leads because it is the one identifier guaranteed unique — two
 * participants can share a name, and in a thousand-person event they will.
 *
 * Only the last five digits, deliberately. The archive is enough to identify a
 * submission without carrying a complete national ID number into a folder on somebody's
 * laptop, and the file is being taken out of the application's access controls the
 * moment it is downloaded.
 */
export function exportFilename(options: {
  idCardNumber: string;
  fullName: string;
  challenge: "C2" | "C3";
}): string {
  const digits = options.idCardNumber.replace(/\D/g, "");
  const last5 = digits.slice(-5) || "00000";

  // Spaces out, so the name is one token: "Hammad Mahmood" becomes "HammadMahmood".
  const name = options.fullName.replace(/\s+/g, "") || "Unnamed";

  return `${last5}-${name}-Challenge-${challengeNumber(options.challenge)}.pdf`;
}

export interface ExportPlan {
  /** How many reports the archive will hold. */
  count: number;
  entries: AsyncIterable<ZipEntry>;
}

/**
 * Lists the reports to export and returns them as a lazy iterable.
 *
 * Only sealed attempts: an attempt still in progress has not been handed in, and a
 * half-written report is not something to put in front of a judge.
 */
export async function planSubmissionExport(challenge: "C2" | "C3"): Promise<ExportPlan> {
  const rows = await db.challengeSubmission.findMany({
    where: {
      challenge,
      fileKey: { not: null },
      attempt: { state: { in: ["SUBMITTED", "EXPIRED"] } },
    },
    select: {
      fileKey: true,
      attempt: {
        select: {
          participant: {
            select: {
              idCardEncrypted: true,
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
  });

  // Decrypted here rather than in the loop below, so the sort order is settled before
  // the first byte goes out — once the archive is streaming there is no going back.
  const files = rows
    .filter((row) => row.fileKey)
    .map((row) => ({
      key: row.fileKey!,
      name: exportFilename({
        idCardNumber: decryptCnic(row.attempt.participant.idCardEncrypted),
        fullName: row.attempt.participant.user.fullName,
        challenge,
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Two participants can share a surname and the last five digits of a CNIC. Vanishingly
  // unlikely, but a duplicate name inside a zip is a report that silently overwrites
  // another, and a judge would never know a submission was missing.
  const seen = new Map<string, number>();
  for (const file of files) {
    const count = seen.get(file.name) ?? 0;
    seen.set(file.name, count + 1);
    if (count > 0) file.name = file.name.replace(/\.pdf$/, `-${count + 1}.pdf`);
  }

  async function* entries(): AsyncIterable<ZipEntry> {
    for (const file of files) {
      yield {
        name: file.name,
        body: async () => {
          const { body } = await storage().get(file.key);
          return body;
        },
      };
    }
  }

  return { count: files.length, entries: entries() };
}

/** What the downloaded archive is called. Dated, because these get kept. */
export function exportArchiveName(challenge: "C2" | "C3", now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `WTQ2026-Challenge-${challengeNumber(challenge)}-Submissions-${date}.zip`;
}
