import { z } from "zod";
import { passwordSchema } from "./auth";

/**
 * Requirement 8: exactly two fields, both required.
 * Requirement 9: the username may be a registered email, ID card number or phone.
 *
 * Validation here is deliberately shallow — "is it non-empty". Rejecting a
 * malformed identifier before checking the password would tell an attacker which
 * formats exist without them needing a password at all.
 */
export const loginSchema = z.object({
  username: z.string().trim().min(1, "Please enter your email, ID card number or phone number"),
  password: z.string().min(1, "Please enter your password"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Please enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
    if (data.currentPassword === data.newPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Your new password must be different from your current one",
      });
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
