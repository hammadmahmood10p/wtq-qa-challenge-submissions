/**
 * Validation for the Challenge 4 starting CSV.
 *
 * A CSV has no magic number — it is just text — so unlike a PDF there is nothing
 * definitive to check for. The checks here are therefore the other way round: rather
 * than proving it *is* a CSV, they catch the things it obviously is not.
 *
 * That asymmetry is deliberate. This file is uploaded once, by an administrator,
 * possibly minutes before a thousand people need it. A validator that is too clever
 * and rejects a perfectly good semicolon-delimited export on event day is a worse
 * failure than one that accepts a slightly odd file. So: refuse the mistakes people
 * actually make — an .xlsx renamed to .csv, a PDF picked by accident — and let
 * anything textual through.
 */

/** Generous: a starting test-case CSV is kilobytes. This is for typos, not capacity. */
export const CSV_MAX_BYTES = 5 * 1024 * 1024;

export type CsvProblem = "empty" | "too_large" | "binary" | "spreadsheet";

export function csvProblemMessage(problem: CsvProblem): string {
  switch (problem) {
    case "empty":
      return "That file is empty. Please choose the CSV again.";
    case "too_large":
      return `That file is larger than ${Math.round(CSV_MAX_BYTES / 1024 / 1024)}MB. A test-case CSV should be far smaller — is it the right file?`;
    case "binary":
      return "That does not look like a CSV — it contains binary data. Export it as CSV and try again.";
    case "spreadsheet":
      return "That is a spreadsheet, not a CSV. In Excel or Sheets, use File → Save as / Export → CSV.";
  }
}

/** Signatures of the formats people reach for when they mean "spreadsheet". */
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // .xlsx, .ods — both zip archives
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]); // legacy .xls
const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

export function validateCsv(bytes: Buffer): CsvProblem | null {
  if (bytes.length === 0) return "empty";
  if (bytes.length > CSV_MAX_BYTES) return "too_large";

  const head = bytes.subarray(0, 4);
  if (head.equals(ZIP) || head.equals(OLE)) return "spreadsheet";
  if (head.equals(PDF)) return "binary";

  // A NUL byte does not occur in text. Checking only the first 8KB keeps this cheap
  // and is more than enough — a binary file betrays itself immediately.
  if (bytes.subarray(0, 8192).includes(0x00)) return "binary";

  return null;
}

/**
 * Strips anything a filename could smuggle.
 *
 * It is echoed back in a Content-Disposition header on download, so a quote or a
 * newline in it is a header-injection opportunity and a path separator is a traversal
 * one. The stored object key is a UUID regardless; this is only for display.
 */
export function safeCsvFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "challenge4.csv";
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  if (!/[a-z0-9]/i.test(cleaned)) return "challenge4.csv";

  return cleaned.toLowerCase().endsWith(".csv") ? cleaned : `${cleaned}.csv`;
}

/**
 * A preview of what was uploaded, for the admin console.
 *
 * Showing the first few lines back is the cheapest possible guard against the mistake
 * no validator can catch: uploading last year's file, or the wrong export. Nobody
 * reads a success message, but they will notice unfamiliar column headers.
 */
export function previewCsv(bytes: Buffer, lines = 3): string[] {
  return bytes
    .subarray(0, 4096)
    .toString("utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .slice(0, lines)
    .map((line) => (line.length > 160 ? `${line.slice(0, 160)}…` : line));
}
