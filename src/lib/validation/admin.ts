import { z } from "zod";
import { JUDGE_EMAIL_DOMAIN, isJudgeEmail } from "@/lib/normalize";
import { cnicSchema, emailSchema, fullNameSchema, locationSchema, phoneSchema } from "./auth";

/**
 * Admin-created accounts.
 *
 * No password field: the admin cannot choose someone else's password. The account is
 * created with a generated temporary one, shown once, and a change is forced at first
 * login. That keeps "the admin knows your password" from ever being true for longer
 * than one sign-in.
 */
export const adminCreateParticipantSchema = z.object({
  idCardNumber: cnicSchema,
  fullName: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  location: locationSchema,
});

/**
 * A second super admin.
 *
 * Same domain rule as judges. A super admin can block every account, read every ID
 * card and reopen any result, so "who may hold this" should not be a free-text field —
 * requiring a 10Pearls address makes handing it to an outside address a deliberate
 * code change rather than a typo.
 */
export const adminCreateSuperAdminSchema = z.object({
  email: emailSchema.refine(
    isJudgeEmail,
    `A super admin must have a ${JUDGE_EMAIL_DOMAIN} email address`,
  ),
  fullName: fullNameSchema,
});

export const adminCreateJudgeSchema = z.object({
  email: emailSchema.refine(
    isJudgeEmail,
    `Judges must have a ${JUDGE_EMAIL_DOMAIN} email address`,
  ),
  fullName: fullNameSchema,
});

/** Filters for the participant and judge tables. */
export const rosterQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["ALL", "ACTIVE", "BLOCKED", "SUBMITTED_LOCKED", "REMOVED", "PENDING_APPROVAL"]).default("ALL"),
  location: z.enum(["ALL", "KARACHI", "LAHORE", "ISLAMABAD"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
});

export type RosterQuery = z.infer<typeof rosterQuerySchema>;

export const PAGE_SIZE = 25;
