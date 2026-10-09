import "server-only";

import { cache } from "react";
import { getSetting, setSetting } from "@/lib/settings";
import type { ReportKind } from "@/lib/report-upload";

/**
 * The two things the organisers supply late: the application participants test, and
 * the Challenge 4 starting CSV.
 *
 * Both were module constants until now, which meant supplying them was a code change
 * and a redeploy. On the morning of the event that is the wrong shape entirely — the
 * URL may be decided an hour before, and the CSV may be re-exported after someone
 * spots a mistake in it. So they live in `app_settings` and are read per request.
 *
 * Read per request, deliberately. `cache()` here is React's request-scoped memo, not a
 * cross-request cache: several components on one page share a single query, and the
 * next request sees whatever the administrator has just saved. That is what makes
 * "change it without restarting the app" true rather than nearly true.
 */

export const APP_UNDER_TEST_URL = "app_under_test_url";
export const CSV_KEY = "challenge4_csv_key";
export const CSV_FILENAME = "challenge4_csv_filename";
export const CSV_SIZE = "challenge4_csv_size";
export const CSV_UPLOADED_AT = "challenge4_csv_uploaded_at";

export const KNOWN_BUGS_KEY = "known_bugs_pdf_key";
export const KNOWN_BUGS_FILENAME = "known_bugs_pdf_filename";
export const KNOWN_BUGS_SIZE = "known_bugs_pdf_size";
export const KNOWN_BUGS_UPLOADED_AT = "known_bugs_pdf_uploaded_at";

export const AI_EVAL_KEY = "ai_evaluation_key";
export const AI_EVAL_FILENAME = "ai_evaluation_filename";
export const AI_EVAL_SIZE = "ai_evaluation_size";
export const AI_EVAL_KIND = "ai_evaluation_kind";
export const AI_EVAL_UPLOADED_AT = "ai_evaluation_uploaded_at";

/** The address participants open to do Challenge 1 and 2. Null until it is set. */
export const getApplicationUrl = cache(async (): Promise<string | null> => {
  const value = await getSetting(APP_UNDER_TEST_URL);
  return value?.trim() ? value.trim() : null;
});

export async function setApplicationUrl(url: string | null): Promise<void> {
  await setSetting(APP_UNDER_TEST_URL, url ?? "");
}

export interface Challenge4Csv {
  key: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: Date | null;
}

/**
 * Metadata for the uploaded CSV. The bytes themselves stay in object storage and are
 * served through an authorised route, exactly like a participant's own uploads —
 * a file nobody has to sign in for is a file that leaks before the event starts.
 */
export const getChallenge4Csv = cache(async (): Promise<Challenge4Csv | null> => {
  const [key, filename, size, uploadedAt] = await Promise.all([
    getSetting(CSV_KEY),
    getSetting(CSV_FILENAME),
    getSetting(CSV_SIZE),
    getSetting(CSV_UPLOADED_AT),
  ]);

  if (!key?.trim()) return null;

  const parsedDate = uploadedAt ? new Date(uploadedAt) : null;

  return {
    key: key.trim(),
    filename: filename?.trim() || "challenge4.csv",
    sizeBytes: Number(size) || 0,
    uploadedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
  };
});

export async function setChallenge4Csv(csv: Challenge4Csv | null): Promise<void> {
  if (!csv) {
    await Promise.all([
      setSetting(CSV_KEY, ""),
      setSetting(CSV_FILENAME, ""),
      setSetting(CSV_SIZE, ""),
      setSetting(CSV_UPLOADED_AT, ""),
    ]);
    return;
  }

  await Promise.all([
    setSetting(CSV_KEY, csv.key),
    setSetting(CSV_FILENAME, csv.filename),
    setSetting(CSV_SIZE, String(csv.sizeBytes)),
    setSetting(CSV_UPLOADED_AT, (csv.uploadedAt ?? new Date()).toISOString()),
  ]);
}

export interface KnownBugsPdf {
  key: string;
  filename: string;
  sizeBytes: number;
  uploadedAt: Date | null;
}

/**
 * Who may read the seeded-defect list.
 *
 * A named function rather than an inline comparison because it is the rule that keeps
 * Challenge 1 meaningful. A participant who reads this document has nothing left to
 * find, and the check guarding it should be something that can be stated, tested, and
 * pointed at — not two `!==` in the middle of a route handler.
 *
 * Note that this is not "any signed-in user", which is what the Challenge 4 CSV uses.
 * That file is for participants; this one is the answer key.
 */
export function canReadJudgeOnlyFile(role: string | null | undefined): boolean {
  return role === "JUDGE" || role === "SUPER_ADMIN";
}

/** The seeded-defect list. Named for its own route, so the rule reads at the call site. */
export function canReadKnownBugs(role: string | null | undefined): boolean {
  return canReadJudgeOnlyFile(role);
}

/**
 * The AI evaluation report. Same audience, same reasoning.
 *
 * It describes how participants' submissions scored against an automated assessment,
 * which is material a participant must not see while the event is running and has no
 * business seeing afterwards either.
 */
export function canReadAiEvaluation(role: string | null | undefined): boolean {
  return canReadJudgeOnlyFile(role);
}

/**
 * The defect list the organisers seeded into the application under test.
 *
 * Same shape as the CSV above, and deliberately not the same audience. This document
 * is the answer key: it says what was broken on purpose, which is exactly what a
 * participant must not know while they are testing. It is served to judges and super
 * admins only, and the route enforces that rather than trusting the absence of a link.
 *
 * Kept out of the repository for the same reason. A file in `deploy/` or `docs/` is a
 * file in everyone's clone, and the people who most want to read it are the ones with
 * the most reason to go looking.
 */
export const getKnownBugsPdf = cache(async (): Promise<KnownBugsPdf | null> => {
  const [key, filename, size, uploadedAt] = await Promise.all([
    getSetting(KNOWN_BUGS_KEY),
    getSetting(KNOWN_BUGS_FILENAME),
    getSetting(KNOWN_BUGS_SIZE),
    getSetting(KNOWN_BUGS_UPLOADED_AT),
  ]);

  if (!key?.trim()) return null;

  const parsedDate = uploadedAt ? new Date(uploadedAt) : null;

  return {
    key: key.trim(),
    filename: filename?.trim() || "known-bugs.pdf",
    sizeBytes: Number(size) || 0,
    uploadedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
  };
});

export async function setKnownBugsPdf(pdf: KnownBugsPdf | null): Promise<void> {
  if (!pdf) {
    await Promise.all([
      setSetting(KNOWN_BUGS_KEY, ""),
      setSetting(KNOWN_BUGS_FILENAME, ""),
      setSetting(KNOWN_BUGS_SIZE, ""),
      setSetting(KNOWN_BUGS_UPLOADED_AT, ""),
    ]);
    return;
  }

  await Promise.all([
    setSetting(KNOWN_BUGS_KEY, pdf.key),
    setSetting(KNOWN_BUGS_FILENAME, pdf.filename),
    setSetting(KNOWN_BUGS_SIZE, String(pdf.sizeBytes)),
    setSetting(KNOWN_BUGS_UPLOADED_AT, (pdf.uploadedAt ?? new Date()).toISOString()),
  ]);
}

export interface AiEvaluationReport {
  key: string;
  filename: string;
  sizeBytes: number;
  /** Decides how the file is served: a PDF inline, a web page sandboxed. */
  kind: ReportKind;
  uploadedAt: Date | null;
}

/**
 * The automated assessment of the Challenge 2 and 3 reports.
 *
 * The organisers run the exported submissions through a separate tool and upload what
 * it produces — a PDF or a web page — for judges to read beside the work itself. Same
 * audience as the seeded-defect list, and the same reason: it says how a submission
 * scored, which is not a participant's to see.
 *
 * `kind` is stored rather than inferred at serving time. The bytes were already
 * examined once on upload, and re-sniffing on every request would mean the answer
 * could differ between the two.
 */
export const getAiEvaluationReport = cache(async (): Promise<AiEvaluationReport | null> => {
  const [key, filename, size, kind, uploadedAt] = await Promise.all([
    getSetting(AI_EVAL_KEY),
    getSetting(AI_EVAL_FILENAME),
    getSetting(AI_EVAL_SIZE),
    getSetting(AI_EVAL_KIND),
    getSetting(AI_EVAL_UPLOADED_AT),
  ]);

  if (!key?.trim()) return null;

  const parsedDate = uploadedAt ? new Date(uploadedAt) : null;

  return {
    key: key.trim(),
    filename: filename?.trim() || "ai-evaluation.pdf",
    sizeBytes: Number(size) || 0,
    // Defaults to pdf: a stored value that is neither must not become "serve this as
    // a web page", which is the one of the two that can run anything.
    kind: kind === "html" ? "html" : "pdf",
    uploadedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
  };
});

export async function setAiEvaluationReport(report: AiEvaluationReport | null): Promise<void> {
  if (!report) {
    await Promise.all([
      setSetting(AI_EVAL_KEY, ""),
      setSetting(AI_EVAL_FILENAME, ""),
      setSetting(AI_EVAL_SIZE, ""),
      setSetting(AI_EVAL_KIND, ""),
      setSetting(AI_EVAL_UPLOADED_AT, ""),
    ]);
    return;
  }

  await Promise.all([
    setSetting(AI_EVAL_KEY, report.key),
    setSetting(AI_EVAL_FILENAME, report.filename),
    setSetting(AI_EVAL_SIZE, String(report.sizeBytes)),
    setSetting(AI_EVAL_KIND, report.kind),
    setSetting(AI_EVAL_UPLOADED_AT, (report.uploadedAt ?? new Date()).toISOString()),
  ]);
}

/**
 * Whether a string is an address we are willing to send a participant to.
 *
 * Returns the normalised URL or null. Only http and https: a `javascript:` or `data:`
 * link typed into an admin field would be rendered as an anchor on a page a thousand
 * people are about to open, and "the administrator is trusted" is not a reason to
 * leave that open — it is one typo and one paste away from being wrong.
 */
export function normaliseApplicationUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Accept a bare host — someone will paste "shop.example.com" and be right to.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return null;

  return parsed.toString();
}
