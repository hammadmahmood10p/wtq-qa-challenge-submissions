import { z } from "zod";
import { cnicSchema, emailSchema, fullNameSchema, phoneSchema } from "@/lib/validation/auth";
import { isJudgeEmail, JUDGE_EMAIL_DOMAIN } from "@/lib/normalize";

/**
 * The signup form's location field is a set of radio buttons, so its schema takes the
 * stored value and its message says "select". A spreadsheet says "Karachi", and the
 * person who typed it is not selecting anything — so the case is normalised here and
 * the message names the three cities instead of telling them to pick one.
 */
const csvLocationSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(
    z.enum(["KARACHI", "LAHORE", "ISLAMABAD"], {
      message: "City must be Karachi, Lahore or Islamabad",
    }),
  );

/** What each column is called when something is wrong with it. */
const LABELS: Record<string, string> = {
  fullName: "Full name",
  email: "Email",
  phone: "Phone number",
  idCardNumber: "ID card number",
  location: "City",
};

/**
 * Turning a spreadsheet into accounts.
 *
 * On event morning a thousand people should not be filling in a signup form, so the
 * organisers upload a file instead. Everything here is pure: parsing, validation and
 * the password rule. The database work lives in the server action, which means this —
 * the part that decides what a row *means* — can be tested exhaustively without one.
 *
 * The governing principle is that one bad row must never stop the import. A file
 * assembled from three cities by several people will contain a missing phone number
 * and a transposed CNIC, and discovering that at row 400 must not undo rows 1 to 399.
 * So every row is judged on its own and the failures are collected into a report.
 */

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * A small RFC-4180 reader: quoted fields, embedded commas, doubled quotes, and both
 * line endings.
 *
 * Written rather than taken from a library because the shape of the problem is tiny
 * and the failure mode of getting it wrong — a name containing a comma silently
 * shifting every later column — is the kind of thing that would be discovered by a
 * participant unable to log in.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // A byte-order mark would otherwise become part of the first header.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the second half of a CRLF.
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Column names people actually type.
 *
 * These files are assembled by hand under time pressure, so "Full Name", "full_name"
 * and "name" all have to mean the same thing. Rejecting a file over a header is a
 * self-inflicted delay on the one morning that cannot absorb one.
 */
const ALIASES: Record<string, string[]> = {
  fullName: ["fullname", "name", "participantname", "judgename", "full"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber", "cell"],
  cnic: ["cnic", "idcard", "idcardnumber", "nic", "cnicnumber", "idnumber", "id"],
  location: ["location", "city", "campus"],
};

const canonical = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

export function mapHeaders(headerRow: string[]): Record<string, number> {
  const found: Record<string, number> = {};

  headerRow.forEach((raw, index) => {
    const key = canonical(raw);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (found[field] === undefined && aliases.includes(key)) found[field] = index;
    }
  });

  return found;
}

/**
 * How many accounts one round trip creates.
 *
 * Small on purpose. Argon2 costs tens of milliseconds per password by design, so a
 * batch is about a second of work — short enough that a dropped connection loses
 * almost nothing, frequent enough that the progress bar actually moves.
 */
export const BATCH_SIZE = 20;

export const PARTICIPANT_COLUMNS = ["fullName", "email", "phone", "cnic", "location"] as const;
export const JUDGE_COLUMNS = ["fullName", "email", "phone"] as const;

export const PARTICIPANT_TEMPLATE =
  "fullName,email,phone,cnic,location\n" +
  "Ayesha Khan,ayesha@example.com,0300-1234561,42101-1234567-1,Karachi\n" +
  "Fatima Sheikh,fatima@example.com,0300-1234562,35201-1234567-2,Lahore\n";

export const JUDGE_TEMPLATE =
  "fullName,email,phone\n" +
  "Nadia Rehman,nadia@10pearls.com,0300-1111111\n" +
  "Hina Siddiqui,hina@10pearls.com,0300-2222222\n";

// ---------------------------------------------------------------------------
// The password rule
// ---------------------------------------------------------------------------

/**
 * First name, then the last five digits of the CNIC (participants) or phone (judges).
 *
 * Chosen by the organisers so that nobody has to be told their password: it is built
 * from two things they already know. That is also why it is derived rather than
 * stored — the admin console recomputes it from the record instead of keeping a
 * readable copy of a thousand passwords.
 *
 * Deliberately not forced through the signup password policy. "Ali" with a CNIC
 * ending 34561 gives an eight-character password, under the ten-character minimum a
 * person choosing their own would face. Padding it, or rejecting the row, would break
 * the one property that matters here — that the participant can work it out — and the
 * account lives for a single day behind a login that does not enforce the policy.
 */
export function firstNameOf(fullName: string): string {
  const firstWord = fullName.trim().split(/\s+/)[0] ?? "";

  // Punctuation is stripped because of how people really fill in a spreadsheet: a row
  // reading "Sheikh, Fatima" would otherwise produce a password with a comma in it,
  // which is unpleasant to dictate down a phone and easy to mistype. Letters and
  // digits only, in any script, so names outside ASCII survive intact.
  return firstWord.replace(/[^\p{L}\p{N}]/gu, "");
}

export function lastFiveDigits(value: string): string {
  return value.replace(/\D/g, "").slice(-5);
}

export function derivePassword(fullName: string, digitsSource: string): string {
  return firstNameOf(fullName) + lastFiveDigits(digitsSource);
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

export interface ParticipantRow {
  fullName: string;
  email: string;
  phone: string;
  idCardNumber: string;
  location: "KARACHI" | "LAHORE" | "ISLAMABAD";
  password: string;
}

export interface JudgeRow {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

export interface RowProblem {
  /** 1-based, counting the header, so it matches what the spreadsheet shows. */
  line: number;
  name: string;
  email: string;
  problems: string[];
}

/** Everything a file turned into, before anything is written. */
export interface ParsedImport<TRow> {
  rows: TRow[];
  problems: RowProblem[];
  /** Header names that were expected and not found. */
  missingColumns: string[];
  totalDataRows: number;
}

const cell = (row: string[], index: number | undefined) =>
  index === undefined ? "" : (row[index] ?? "").trim();

/**
 * Collects every problem in a row rather than stopping at the first.
 *
 * Someone correcting a thousand-row file wants all of a row's faults at once; being
 * told about the phone number, fixing it, re-uploading and then being told about the
 * email is three trips through a process that takes minutes.
 */
function validate(
  fields: {
    key: string;
    value: string;
    schema: {
      safeParse: (v: unknown) => {
        success: boolean;
        data?: unknown;
        error?: { issues: { message: string }[] };
      };
    };
  }[],
): { values: Record<string, string>; problems: string[] } {
  const values: Record<string, string> = {};
  const problems: string[] = [];

  for (const field of fields) {
    const label = LABELS[field.key] ?? field.key;

    if (field.value === "") {
      problems.push(`${label} is missing`);
      continue;
    }

    const parsed = field.schema.safeParse(field.value);
    if (parsed.success) {
      values[field.key] = String(parsed.data);
    } else {
      problems.push(parsed.error?.issues[0]?.message ?? `${label} is not valid`);
    }
  }

  return { values, problems };
}

export function parseParticipants(text: string): ParsedImport<ParticipantRow> {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], problems: [], missingColumns: [...PARTICIPANT_COLUMNS], totalDataRows: 0 };
  }

  const headers = mapHeaders(table[0]);
  const missingColumns = PARTICIPANT_COLUMNS.filter((c) => headers[c] === undefined);
  if (missingColumns.length > 0) {
    return { rows: [], problems: [], missingColumns, totalDataRows: table.length - 1 };
  }

  const rows: ParticipantRow[] = [];
  const problems: RowProblem[] = [];

  // Within-file duplicates are worth catching here: two rows with one email would
  // otherwise fail at the database with a message about a conflict, which does not
  // tell the organiser that their own file contains the person twice.
  const seenEmail = new Set<string>();
  const seenCnic = new Set<string>();
  const seenPhone = new Set<string>();

  table.slice(1).forEach((raw, index) => {
    const line = index + 2;
    const name = cell(raw, headers.fullName);
    const email = cell(raw, headers.email);

    const { values, problems: issues } = validate([
      { key: "fullName", value: name, schema: fullNameSchema },
      { key: "email", value: email, schema: emailSchema },
      { key: "phone", value: cell(raw, headers.phone), schema: phoneSchema },
      { key: "idCardNumber", value: cell(raw, headers.cnic), schema: cnicSchema },
      { key: "location", value: cell(raw, headers.location), schema: csvLocationSchema },
    ]);

    if (issues.length === 0) {
      if (seenEmail.has(values.email)) issues.push("This email appears earlier in the file");
      if (seenCnic.has(values.idCardNumber)) issues.push("This ID card number appears earlier in the file");
      if (seenPhone.has(values.phone)) issues.push("This phone number appears earlier in the file");
    }

    if (issues.length > 0) {
      problems.push({ line, name, email, problems: issues });
      return;
    }

    seenEmail.add(values.email);
    seenCnic.add(values.idCardNumber);
    seenPhone.add(values.phone);

    rows.push({
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      idCardNumber: values.idCardNumber,
      location: values.location as ParticipantRow["location"],
      password: derivePassword(values.fullName, values.idCardNumber),
    });
  });

  return { rows, problems, missingColumns: [], totalDataRows: table.length - 1 };
}

export function parseJudges(text: string): ParsedImport<JudgeRow> {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], problems: [], missingColumns: [...JUDGE_COLUMNS], totalDataRows: 0 };
  }

  const headers = mapHeaders(table[0]);
  const missingColumns = JUDGE_COLUMNS.filter((c) => headers[c] === undefined);
  if (missingColumns.length > 0) {
    return { rows: [], problems: [], missingColumns, totalDataRows: table.length - 1 };
  }

  const rows: JudgeRow[] = [];
  const problems: RowProblem[] = [];
  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();

  table.slice(1).forEach((raw, index) => {
    const line = index + 2;
    const name = cell(raw, headers.fullName);
    const email = cell(raw, headers.email);

    const { values, problems: issues } = validate([
      { key: "fullName", value: name, schema: fullNameSchema },
      { key: "email", value: email, schema: emailSchema },
      { key: "phone", value: cell(raw, headers.phone), schema: phoneSchema },
    ]);

    // The domain rule is the judges' own, so it is checked here rather than folded
    // into the shared email schema.
    if (values.email && !isJudgeEmail(values.email)) {
      issues.push(`A judge needs a ${JUDGE_EMAIL_DOMAIN} email address`);
    }

    if (issues.length === 0) {
      if (seenEmail.has(values.email)) issues.push("This email appears earlier in the file");
      if (seenPhone.has(values.phone)) issues.push("This phone number appears earlier in the file");
    }

    if (issues.length > 0) {
      problems.push({ line, name, email, problems: issues });
      return;
    }

    seenEmail.add(values.email);
    seenPhone.add(values.phone);

    rows.push({
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      password: derivePassword(values.fullName, values.phone),
    });
  });

  return { rows, problems, missingColumns: [], totalDataRows: table.length - 1 };
}

/** The failure report, as a file the organisers can correct and re-upload. */
export function problemsToCsv(problems: RowProblem[]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

  return (
    "line,name,email,problem\n" +
    problems
      .map((p) => [p.line, p.name, p.email, p.problems.join("; ")].map((v) => escape(String(v))).join(","))
      .join("\n") +
    "\n"
  );
}
