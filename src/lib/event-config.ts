import "server-only";

import { cache } from "react";
import { getSetting, setSetting } from "@/lib/settings";

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
