import { CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Confetti } from "@/components/challenge/confetti";

export const metadata: Metadata = { title: "Submitted — WTQ 2026" };

/**
 * The terminal page, and deliberately public.
 *
 * Submitting revokes every session and locks the account, so by the time a participant
 * arrives here they are already signed out — an authenticated page could not render.
 * Being told "thank you" and then bounced to a login form would be a poor way to end
 * three hours of work.
 *
 * The reason comes from the query string, which is only ever cosmetic: it decides
 * which of two sentences to show and nothing else. Whether the attempt is really
 * sealed was settled in the database long before this page loaded.
 */
export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const expired = reason === "expired";

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.16] blur-[90px]"
        style={{ background: "var(--brand-gradient)" }}
      />

      {/* Only for a finished submission. Running out of time is a completion too,
          but it is not an achievement and should not be dressed as one. */}
      {!expired && <Confetti />}

      <div className="border-border bg-surface shadow-(--shadow-raised) rise-in relative w-full max-w-md rounded-(--radius-card) border p-8 text-center">
        <span
          className={`mx-auto flex size-14 items-center justify-center rounded-full ${
            expired ? "bg-warning/10 text-warning-strong" : "bg-success/10 text-success-strong"
          }`}
        >
          {expired ? <Clock size={26} /> : <CheckCircle2 size={26} />}
        </span>

        <h1 className="font-display mt-5 text-2xl font-bold">
          {expired ? "Time is up" : "Thank you"}
        </h1>

        <p className="text-muted mt-3 text-sm">
          {expired
            ? "Your three hours have ended. Everything you saved has been submitted for review — there is nothing further you need to do."
            : "Your challenges have been submitted for review. Thank you for taking part in Women Tech Quest 2026."}
        </p>

        <p className="text-muted mt-6 text-xs">
          Your account is now closed, so you will not be able to log in again. The
          organising team will share the results.
        </p>

        <Link href="/login" className="text-violet mt-7 inline-block text-sm font-medium hover:underline">
          Back to the login page
        </Link>
      </div>
    </div>
  );
}
