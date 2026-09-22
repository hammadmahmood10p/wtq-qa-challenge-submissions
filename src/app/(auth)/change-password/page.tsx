import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { requireUserAllowingPasswordChange } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change your password — WTQ 2026" };

/**
 * Forced for the seeded super admin and after any admin-issued password reset, since
 * that temporary password was read aloud or typed into a chat window. Also reachable
 * voluntarily by anyone signed in.
 */
export default async function ChangePasswordPage() {
  const user = await requireUserAllowingPasswordChange();
  const forced = user.mustChangePassword;

  return (
    <div className="border-border bg-surface shadow-(--shadow-raised) space-y-6 rounded-(--radius-card) border p-6 sm:p-8">
      <div>
        <h1 className="font-display text-xl font-bold">
          {forced ? "Set a new password" : "Change your password"}
        </h1>
        <p className="text-muted mt-1.5 text-sm">
          Signed in as <span className="font-mono text-xs">{user.email}</span>
        </p>
      </div>

      {forced && (
        <Alert variant="warning" title="A password change is required">
          Your current password was issued to you rather than chosen by you. Please set
          your own before continuing.
        </Alert>
      )}

      <ChangePasswordForm />
    </div>
  );
}
