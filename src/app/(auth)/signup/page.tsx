import { ArrowRight, Gavel, Users } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create an account — WTQ 2026" };

/**
 * Requirement 3: the signup flow opens with a choice of role.
 *
 * Splitting into two routes rather than toggling one form keeps each route's fields,
 * validation and rules entirely separate — which matters because the two paths differ
 * in more than their fields: participants are active immediately, judges are not.
 */

const ROLES = [
  {
    href: "/signup/participant",
    icon: Users,
    title: "Register as a Participant",
    description:
      "Take on the three QA challenges. Sign up with the ID card number, email and phone you registered with.",
    note: "Ready to log in straight away",
  },
  {
    href: "/signup/judge",
    icon: Gavel,
    title: "Register as a Judge",
    description:
      "Evaluate and score participant submissions. Requires a 10Pearls email address.",
    note: "Needs super admin approval before first login",
  },
];

export default function SignupChoicePage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold">Create your account</h1>
        <p className="text-muted mt-2 text-sm">How will you be taking part?</p>
      </div>

      <div className="space-y-3">
        {ROLES.map(({ href, icon: Icon, title, description, note }) => (
          <Link
            key={href}
            href={href}
            className="group border-border bg-surface shadow-(--shadow-card) hover:border-violet/50 block rounded-(--radius-card) border p-5 transition-all duration-(--duration-standard) hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-4">
              <span className="bg-violet/10 text-violet flex size-10 shrink-0 items-center justify-center rounded-(--radius-control)">
                <Icon size={19} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-display font-semibold">{title}</h2>
                  <ArrowRight
                    size={15}
                    className="text-muted shrink-0 transition-transform duration-(--duration-standard) group-hover:translate-x-1"
                  />
                </div>
                <p className="text-muted mt-1.5 text-sm">{description}</p>
                <p className="text-muted/80 mt-2.5 font-mono text-[11px] tracking-wide uppercase">
                  {note}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="text-muted text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-violet font-medium hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
