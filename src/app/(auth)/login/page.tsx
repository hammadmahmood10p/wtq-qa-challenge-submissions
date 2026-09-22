import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Log in — WTQ 2026" };

/**
 * Placeholder. The real login form is Day 3 (docs/DELIVERY_PLAN.md §4) — a single
 * "Username" field accepting email, CNIC or phone, plus password.
 *
 * It exists now so the signup flow has somewhere to land and the success message has
 * somewhere to appear.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;

  return (
    <div className="border-border bg-surface shadow-(--shadow-raised) space-y-5 rounded-(--radius-card) border p-6 sm:p-8">
      {registered === "participant" && (
        <Alert variant="success" title="Account created">
          <p className="flex items-start gap-1.5">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 opacity-0" aria-hidden="true" />
            <span>You can now log in with your email, ID card number or phone number.</span>
          </p>
        </Alert>
      )}

      <div>
        <h1 className="font-display text-xl font-bold">Log in</h1>
        <p className="text-muted mt-1.5 text-sm">
          The login form is being built — it lands on Day 3.
        </p>
      </div>

      <p className="text-muted text-sm">
        Need an account?{" "}
        <Link href="/signup" className="text-violet font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
