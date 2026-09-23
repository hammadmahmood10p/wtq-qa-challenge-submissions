import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { JudgeForm } from "./judge-form";

export const metadata: Metadata = { title: "Judge signup — WTQ 2026" };

export default function JudgeSignupPage() {
  return (
    <div className="border-border bg-surface shadow-(--shadow-raised) rounded-(--radius-card) border p-6 sm:p-8">
      <Link
        href="/signup"
        className="text-muted hover:text-text mb-5 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        Back
      </Link>

      <h1 className="font-display text-xl font-bold">Register as a Judge</h1>
      <p className="text-muted mt-1.5 mb-7 text-sm">
        Judges evaluate and score participant submissions across every challenge.
      </p>

      <JudgeForm />
    </div>
  );
}
