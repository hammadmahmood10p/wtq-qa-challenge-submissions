import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { ParticipantForm } from "./participant-form";

export const metadata: Metadata = { title: "Participant signup — WTQ 2026" };

export default function ParticipantSignupPage() {
  return (
    <div className="border-border bg-surface shadow-(--shadow-raised) rounded-(--radius-card) border p-6 sm:p-8">
      <Link
        href="/signup"
        className="text-muted hover:text-text mb-5 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Back
      </Link>

      <h1 className="font-display text-xl font-bold">Register as a Participant</h1>
      <p className="text-muted mt-1.5 mb-7 text-sm">
        Use the same details you registered for Women Tech Quest with. You will be able to
        log in as soon as you are done.
      </p>

      <ParticipantForm />
    </div>
  );
}
