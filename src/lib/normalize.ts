/**
 * Identity normalisation.
 *
 * Decision D5 in docs/DELIVERY_PLAN.md: a participant may type their CNIC as
 * 42101-1234567-8, 4210112345678 or "42101 1234567 8", and their phone as
 * 0300-1234567, +923001234567 or 923001234567. All of these are one person.
 *
 * Every one of these functions is applied on BOTH signup and login, so whatever a
 * participant types at 10am on event day resolves to the account they created.
 */

export const CNIC_LENGTH = 13;

/** Strips everything that is not a digit. `42101-1234567-8` -> `4210112345678`. */
export function normalizeCnic(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidCnic(input: string): boolean {
  return normalizeCnic(input).length === CNIC_LENGTH;
}

/** Display form, for the super admin's screens: `4210112345678` -> `42101-1234567-8`. */
export function formatCnic(input: string): string {
  const d = normalizeCnic(input);
  if (d.length !== CNIC_LENGTH) return input;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

/** Masked form. See Q13 — proposed for the judges' table. */
export function maskCnic(input: string): string {
  const d = normalizeCnic(input);
  if (d.length !== CNIC_LENGTH) return "•••••";
  return `${d.slice(0, 5)}*****${d.slice(-3)}`;
}

/**
 * Pakistani mobile numbers to E.164.
 *   03001234567    -> +923001234567
 *   3001234567     -> +923001234567
 *   00923001234567 -> +923001234567
 *   +92 300 1234567 -> +923001234567
 * Returns null when the input cannot be understood, so the caller can show a
 * field-level error rather than silently storing something wrong.
 */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");

  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);

  // Local trunk form: 03001234567
  if (d.startsWith("0") && d.length === 11) d = `92${d.slice(1)}`;
  // Bare national form: 3001234567
  else if (d.length === 10 && d.startsWith("3")) d = `92${d}`;

  // Pakistani mobile numbers are 92 + 3XXXXXXXXX
  if (!/^923\d{9}$/.test(d)) return null;

  return `+${d}`;
}

export function formatPhone(e164: string): string {
  const m = /^\+92(\d{3})(\d{7})$/.exec(e164);
  return m ? `0${m[1]}-${m[2]}` : e164;
}

/** Emails are compared case-insensitively; we store the lowercased form. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export const JUDGE_EMAIL_DOMAIN = "@10pearls.com";

export function isJudgeEmail(input: string): boolean {
  return normalizeEmail(input).endsWith(JUDGE_EMAIL_DOMAIN);
}

/** What kind of identifier did someone type into the single "Username" field? */
export type IdentifierKind = "email" | "cnic" | "phone";

export function detectIdentifier(
  input: string,
): { kind: IdentifierKind; value: string } | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.includes("@")) {
    return { kind: "email", value: normalizeEmail(raw) };
  }

  const digits = raw.replace(/\D/g, "");

  // 13 digits is a CNIC. Phone numbers are 10-13 digits but never exactly 13
  // in a form that starts 92 or 0, so check CNIC first and fall through.
  if (digits.length === CNIC_LENGTH && !raw.includes("+")) {
    return { kind: "cnic", value: digits };
  }

  const phone = normalizePhone(raw);
  if (phone) return { kind: "phone", value: phone };

  return null;
}
