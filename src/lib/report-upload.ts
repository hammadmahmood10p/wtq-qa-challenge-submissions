/**
 * Accepting a report that may be a PDF or a web page.
 *
 * The AI evaluation tool produces one or the other depending on how it is run, and the
 * organisers should not have to care which. Both are accepted, both are checked, and
 * the kind is recorded so the serving route knows how to hand it back.
 *
 * Pure, so the rules can be tested without a database or a request — and so the upload
 * form and the server apply the same ones.
 */

export type ReportKind = "pdf" | "html";

export type ReportProblem = "empty" | "too_large" | "unsupported";

const PDF_MAGIC = Buffer.from("%PDF-");

/** Enough of the file to recognise it without reading a twenty-megabyte buffer twice. */
const SNIFF_BYTES = 1024;

export function reportProblemMessage(problem: ReportProblem, maxBytes: number): string {
  switch (problem) {
    case "empty":
      return "That file is empty.";
    case "too_large":
      return `That file is too large. The limit is ${Math.floor(maxBytes / 1024 / 1024)}MB.`;
    case "unsupported":
      return "Upload a PDF or an HTML file. Nothing else is accepted.";
  }
}

/**
 * What kind of report this is, from its contents rather than its name.
 *
 * The extension is a hint and nothing more — anyone can rename a file. A PDF is
 * identified by its magic bytes, and HTML by actually looking like HTML. A file that
 * is neither is refused rather than guessed at, because the kind decides how it is
 * served and guessing wrong means serving an unknown file as a web page.
 */
export function detectReportKind(bytes: Buffer): ReportKind | null {
  if (bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return "pdf";

  // Only the opening of the file, lowercased, with a leading byte-order mark and any
  // whitespace ignored — editors and export tools add both.
  const head = bytes
    .subarray(0, SNIFF_BYTES)
    .toString("utf8")
    .replace(/^﻿/, "")
    .trimStart()
    .toLowerCase();

  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return "html";

  // Some generators omit the doctype and open with a comment, an XML declaration or a
  // stray <head>. Accept those too, but only when a real html or body tag follows.
  if (head.startsWith("<") && /<(html|head|body)[\s>]/.test(head)) return "html";

  return null;
}

export function validateReport(
  bytes: Buffer,
  maxBytes: number,
): { problem: ReportProblem } | { kind: ReportKind } {
  if (bytes.length === 0) return { problem: "empty" };
  if (bytes.length > maxBytes) return { problem: "too_large" };

  const kind = detectReportKind(bytes);
  if (!kind) return { problem: "unsupported" };

  return { kind };
}

/** The media type to store and serve this kind under. */
export function reportContentType(kind: ReportKind): string {
  return kind === "pdf" ? "application/pdf" : "text/html; charset=utf-8";
}

/**
 * A filename safe to echo back in a Content-Disposition header.
 *
 * The same reasoning as `safeFilename` in pdf.ts: a quote or a newline in a filename
 * is a header-injection opportunity, and a path separator is a traversal one. The
 * extension is forced to match what the file actually is, so a PDF renamed `.html` is
 * served and saved as the PDF it is.
 */
export function safeReportFilename(name: string, kind: ReportKind): string {
  const base = name.split(/[\\/]/).pop() ?? "report";

  const cleaned = base
    .replace(/\.[^.]*$/, "") // drop whatever extension it arrived with
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  const stem = /[a-z0-9]/i.test(cleaned) ? cleaned : "report";
  return `${stem}.${kind}`;
}
