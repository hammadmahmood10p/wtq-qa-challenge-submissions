import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { HOME_FOR_ROLE } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in — WTQ 2026" };

/**
 * Requirement 2: the login page is the main page of the application.
 * See src/app/page.tsx, which routes "/" here.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; loggedOut?: string }>;
}) {
  // Already signed in — no reason to show a login form.
  const user = await getSessionUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : HOME_FOR_ROLE[user.role]);

  const { registered, loggedOut } = await searchParams;

  return (
    <div className="border-border bg-surface shadow-(--shadow-raised) space-y-6 rounded-(--radius-card) border p-6 sm:p-8">
      {registered === "participant" && (
        <Alert variant="success" title="Account created">
          You can log in now with your email, ID card number or phone number.
        </Alert>
      )}

      {loggedOut === "1" && <Alert variant="info">You have been logged out.</Alert>}

      <div>
        {/* Not "Welcome back". Almost everyone who reaches this page does so for the
            first time, on the morning of the event, with credentials they have never
            used — greeting them as a returning visitor is the first thing the product
            would say to them, and it would be wrong. */}
        <h1 className="font-display text-xl font-bold">Welcome to Women Tech Quest</h1>
        <p className="text-muted mt-1.5 text-sm">Log in to continue to the QA challenges.</p>
      </div>

      <LoginForm />
    </div>
  );
}
