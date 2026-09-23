import Link from "next/link";
import { BrandLockup } from "@/components/brand/logos";

/**
 * Shell for every unauthenticated screen: login, signup and the confirmation pages.
 *
 * Two columns on a wide screen — the event on the left, the form on the right — so the
 * branding has somewhere to live that is not on top of the thing someone is trying to
 * fill in. Stacked below that, with the marks reduced to a compact row, because on a
 * phone a tall hero just pushes the password field off the screen.
 *
 * On a laptop the shell is pinned to the viewport and only the form column scrolls.
 * The participant form is long, and the alternative is the brand panel sliding away
 * while someone fills in their CNIC — the page would lose its footing halfway down.
 * A phone keeps the ordinary page scroll: there is one column there, and hijacking it
 * would break pull-to-refresh and the on-screen keyboard's own scrolling.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-2 lg:overflow-hidden">
      {/* ---- Brand panel ---- */}
      <section className="bg-surface-raised relative overflow-hidden px-6 py-10 lg:flex lg:flex-col lg:justify-center lg:px-12 lg:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full opacity-[0.18] blur-[100px]"
          style={{ background: "var(--brand-gradient)" }}
        />

        {/* Centred in the panel, but the type inside stays ranged left — a centred
            block of left-aligned text, not centred text. */}
        <div className="relative mx-auto w-full max-w-md">
          <Link href="/" className="inline-flex">
            {/* Compact on a phone, generous on a laptop. */}
            <BrandLockup height={42} className="lg:hidden" />
            <BrandLockup height={88} className="hidden lg:flex" />
          </Link>

          <p className="text-muted mt-8 hidden font-mono text-[11px] tracking-[0.2em] uppercase lg:block">
            Women Tech Quest 2026 · 10 October
          </p>

          <h1 className="font-display mt-3 hidden text-4xl leading-tight font-bold lg:block">
            <span className="brand-text">QA Challenge Portal</span>
          </h1>

          <p className="text-muted mt-4 hidden text-sm lg:block">
            Submit your work for the Women Tech Quest QA challenges, and follow it
            through to review.
          </p>
        </div>
      </section>

      {/* ---- Form panel ---- */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-6 lg:min-h-0 lg:items-start lg:overflow-y-auto lg:py-16">
        <div className="w-full max-w-md lg:my-auto">
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
