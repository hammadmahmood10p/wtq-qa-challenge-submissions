"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { encryptCnic, hashCnic } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { signupConflictField } from "@/lib/prisma-errors";
import { LIMITS, rateLimitByIp } from "@/lib/rate-limit";
import { judgeSignupSchema, participantSignupSchema } from "@/lib/validation/auth";

export interface SignupState {
  ok: boolean;
  /** Field-level messages, keyed by form field name. */
  errors?: Record<string, string>;
  /** Whole-form message, for anything not attributable to one field. */
  message?: string;
}

/**
 * Maps a Zod failure onto the form. Only the first issue per field is shown —
 * a stack of four messages under one input helps nobody.
 */
function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/**
 * Translates a database uniqueness violation into the field the participant can
 * actually fix.
 *
 * Requirement 10: the same person must not be able to register twice. The unique
 * indexes are the real enforcement — checking first and then inserting would leave a
 * race between two simultaneous signups, and with 1000 people registering at once
 * that race would be hit.
 *
 * This does confirm which identifiers are already registered, which is user
 * enumeration. On a signup form that is the right trade: someone who cannot be told
 * "this email is already registered" cannot complete the form. Login (Day 3) makes
 * the opposite choice and stays deliberately vague.
 */
const CONFLICT_MESSAGES = {
  email: "An account with this email already exists.",
  idCardNumber: "An account with this ID card number already exists.",
  phone: "An account with this phone number already exists.",
} as const;

function uniqueViolation(error: unknown): Record<string, string> | null {
  const field = signupConflictField(error);
  if (field === null) return null;
  if (field === "unknown") return { form: "An account with these details already exists." };
  return { [field]: CONFLICT_MESSAGES[field] };
}

export async function signUpParticipant(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const limit = await rateLimitByIp("signup", LIMITS.signupPerIp);
  if (!limit.allowed) {
    return {
      ok: false,
      message: `Too many signup attempts. Please try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`,
    };
  }

  const parsed = participantSignupSchema.safeParse({
    idCardNumber: formData.get("idCardNumber"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    location: formData.get("location"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const data = parsed.data;

  // Set inside the try, acted on after it: redirect() signals by throwing, so calling
  // it inside the try would be caught by the error handling below.
  let created = false;

  try {
    const user = await db.user.create({
      data: {
        role: "PARTICIPANT",
        email: data.email,
        fullName: data.fullName,
        passwordHash: await hashPassword(data.password),
        // Requirement 6: participants need no approval.
        status: "ACTIVE",
        participantProfile: {
          create: {
            idCardHash: hashCnic(data.idCardNumber),
            idCardEncrypted: encryptCnic(data.idCardNumber),
            phoneE164: data.phone,
            location: data.location,
          },
        },
      },
    });

    // Never log the CNIC or phone themselves into the audit metadata — the whole
    // point of encrypting them is that they do not sit in plaintext elsewhere.
    await audit({
      action: "participant.signup",
      actorId: user.id,
      actorRole: "PARTICIPANT",
      entityType: "user",
      entityId: user.id,
      metadata: { location: data.location },
    });

    created = true;
  } catch (error) {
    const conflict = uniqueViolation(error);
    if (conflict) return { ok: false, errors: conflict };

    console.error("[signup:participant]", error);
    return { ok: false, message: "Something went wrong creating your account. Please try again." };
  }

  if (created) redirect("/login?registered=participant");
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function signUpJudge(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const limit = await rateLimitByIp("signup", LIMITS.signupPerIp);
  if (!limit.allowed) {
    return {
      ok: false,
      message: `Too many signup attempts. Please try again in ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).`,
    };
  }

  const parsed = judgeSignupSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const data = parsed.data;
  let created = false;

  try {
    const user = await db.user.create({
      data: {
        role: "JUDGE",
        email: data.email,
        fullName: data.fullName,
        passwordHash: await hashPassword(data.password),
        // Requirement 7: a judge cannot log in until a super admin approves them.
        // The email domain is a filter; this is the gate.
        status: "PENDING_APPROVAL",
        judgeProfile: { create: {} },
      },
    });

    await audit({
      action: "judge.signup",
      actorId: user.id,
      actorRole: "JUDGE",
      entityType: "user",
      entityId: user.id,
    });

    created = true;
  } catch (error) {
    const conflict = uniqueViolation(error);
    if (conflict) return { ok: false, errors: conflict };

    console.error("[signup:judge]", error);
    return { ok: false, message: "Something went wrong creating your account. Please try again." };
  }

  if (created) redirect("/signup/judge/pending");
  return { ok: false, message: "Something went wrong. Please try again." };
}
