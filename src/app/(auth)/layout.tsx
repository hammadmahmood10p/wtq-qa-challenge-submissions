import Link from "next/link";
import { BrandLockup } from "@/components/brand/logos";

/**
 * Shell for every unauthenticated screen: login, signup and the confirmation pages.
 *
 * Two columns on a wide screen — the event on the left, the form on the right — so the
 * branding has somewhere to live that is not on top of the thing someone is trying to
 * fill in. Stacked below that, with the marks reduced to a compact row, because on a
 * phone a tall hero just pushes the password field off the screen.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---- Brand panel ---- */}
      <section className="bg-surface-raised relative overflow-hidden px-6 py-10 lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full opacity-[0.18] blur-[100px]"
          style={{ background: "var(--brand-gradient)" }}
        />

        <div className="relative mx-auto w-full max-w-md lg:mx-0">
          <Link href="/" className="inline-flex">
            {/* Compact on a phone, generous on a laptop. */}
            <BrandLockup height={42} className="lg:hidden" />
            <BrandLockup height={96} className="hidden lg:flex" />
          </Link>

          <p className="text-muted mt-8 hidden font-mono text-[11px] tracking-[0.2em] uppercase lg:block">
            Women Tech Quest 2026 · 10 October
          </p>

          <h1 className="font-display mt-3 hidden text-4xl leading-tight font-bold lg:block">
            <span className="brand-text">QA Challenge Portal</span>
          </h1>

          <p className="text-muted mt-4 hidden max-w-sm text-sm lg:block">
            Submit your work for the Women Tech Quest QA challenges, and follow it
            through to review.
          </p>
        </div>
      </section>

      {/* ---- Form panel ---- */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:py-16">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <p className="text-muted font-mono text-[11px] tracking-[0.2em] uppercase">
              Women Tech Quest 2026
            </p>
            <p className="font-display brand-text mt-1 text-xl font-bold">
              QA Challenge Portal
            </p>
          </div>

          {children}
        </div>
      </section>
    </div>
  );
}
