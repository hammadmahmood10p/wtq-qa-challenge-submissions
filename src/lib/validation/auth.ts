import { z } from "zod";
import {
  CNIC_LENGTH,
  JUDGE_EMAIL_DOMAIN,
  isJudgeEmail,
  normalizeCnic,
  normalizeEmail,
  normalizePhone,
} from "@/lib/normalize";

/**
 * Signup validation, shared by the browser and the server.
 *
 * The same schema runs in both places deliberately: the client copy gives immediate
 * field-level feedback, and the server copy is the one that actually decides. A
 * participant who disables JavaScript, or posts straight to the action, meets exactly
 * the same rules.
 */

export const PASSWORD_MIN = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(200, "Password is too long")
  .refine((v) => /[a-z]/.test(v), "Include at least one lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Include at least one uppercase letter")
  .refine((v) => /\d/.test(v), "Include at least one number");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your full name")
  .max(120, "Name is too long");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address")
  .transform(normalizeEmail);

/** Accepts any format the participant types; stores digits only. See D5. */
export const cnicSchema = z
  .string()
  .trim()
  .min(1, "ID card number is required")
  .transform(normalizeCnic)
  .refine(
    (v) => v.length === CNIC_LENGTH,
    `ID card number must be ${CNIC_LENGTH} digits (dashes optional)`,
  );

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform(normalizePhone)
  .refine((v): v is string => v !== null, "Enter a valid Pakistani mobile number");

export const locationSchema = z.enum(["KARACHI", "LAHORE", "ISLAMABAD"], {
  message: "Please select your city",
});

/** Requirement 4/5: confirm must match. Reported on the confirm field, where the fix is. */
const passwordsMustMatch = (
  data: { password: string; confirmPassword: string },
  ctx: z.RefinementCtx,
) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Passwords do not match",
    });
  }
};

export const participantSignupSchema = z
  .object({
    idCardNumber: cnicSchema,
    fullName: fullNameSchema,
    email: emailSchema,
    phone: phoneSchema,
    location: locationSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .superRefine(passwordsMustMatch);

export const judgeSignupSchema = z
  .object({
    // The domain check is a filter, not an authorisation: the real gate is super admin
    // approval (requirement 7), because anyone can type a 10pearls address.
    email: emailSchema.refine(
      isJudgeEmail,
      `Judges must register with a ${JUDGE_EMAIL_DOMAIN} email address`,
    ),
    fullName: fullNameSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .superRefine(passwordsMustMatch);

export type ParticipantSignupInput = z.input<typeof participantSignupSchema>;
export type ParticipantSignupData = z.output<typeof participantSignupSchema>;
export type JudgeSignupInput = z.input<typeof judgeSignupSchema>;
export type JudgeSignupData = z.output<typeof judgeSignupSchema>;

/** Rough strength signal for the meter. Presentational only — never a gate. */
export function passwordStrength(value: string): 0 | 1 | 2 | 3 | 4 {
  if (!value) return 0;
  let score = 0;
  if (value.length >= PASSWORD_MIN) score++;
  if (value.length >= 14) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}
