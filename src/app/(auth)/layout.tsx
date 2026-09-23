import Link from "next/link";
import { BrandLockup } from "@/components/brand/logos";

/**
 * Shell for every unauthenticated screen: signup, login, and the confirmation pages.
 *
 * A single quiet wash of the brand gradient sits behind the card. The gradient is
 * otherwise reserved, so this is the one ambient use — enough to establish the event
 * without competing with the form someone is trying to fill in.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.12] blur-[90px]"
        style={{ background: "var(--brand-gradient)" }}
      />

      <div className="relative w-full max-w-lg">
        <Link href="/" className="mb-8 flex flex-col items-center gap-4">
          <BrandLockup wtqSize={64} />
          <span className="text-center">
            <span className="text-muted block font-mono text-[11px] tracking-[0.2em] uppercase">
              Women Tech Quest 2026
            </span>
            <span className="font-display brand-text mt-1.5 block text-2xl font-bold">
              QA Challenge Portal
            </span>
          </span>
        </Link>

        {children}
      </div>
    </div>
  );
}
