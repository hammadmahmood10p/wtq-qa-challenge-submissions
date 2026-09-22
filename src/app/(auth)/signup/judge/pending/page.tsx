import { Clock } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account pending approval — WTQ 2026" };

/**
 * Requirement 7: a judge account exists but cannot be used until a super admin
 * approves it. Saying so plainly here avoids a confused judge trying to log in,
 * being refused, and assuming their signup failed.
 */
export default function JudgePendingPage() {
  return (
    <div className="border-border bg-surface shadow-(--shadow-raised) rounded-(--radius-card) border p-8 text-center">
      <span className="bg-warning/10 text-warning mx-auto flex size-12 items-center justify-center rounded-full">
        <Clock size={22} />
      </span>

      <h1 className="font-display mt-5 text-xl font-bold">Your account is awaiting approval</h1>

      <p className="text-muted mx-auto mt-3 max-w-sm text-sm">
        Thanks for registering as a judge. A super admin needs to approve your account
        before you can log in — you will not be able to sign in until then.
      </p>

      <p className="text-muted mx-auto mt-3 max-w-sm text-sm">
        If it is urgent, contact the Women Tech Quest organising team directly.
      </p>

      <Link
        href="/login"
        className="text-violet mt-7 inline-block text-sm font-medium hover:underline"
      >
        Go to login
      </Link>
    </div>
  );
}
