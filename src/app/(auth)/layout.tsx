import Link from "next/link";

/**
 * Shell for every unauthenticated screen: signup, login, and the confirmation pages.
 *
 * A single quiet Aurora glow sits behind the card. The gradient is otherwise reserved
 * (DESIGN_LANGUAGE.md §4.1), so this is the one ambient use — enough to establish the
 * brand without competing with the form someone is trying to fill in.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-[0.16] blur-[90px]"
        style={{ background: "var(--aurora-gradient)" }}
      />

      <div className="relative w-full max-w-lg">
        <Link href="/" className="mb-8 block text-center">
          <p className="text-muted font-mono text-[11px] tracking-[0.2em] uppercase">
            Women Tech Quest 2026
          </p>
          <p className="font-display aurora-text mt-1.5 text-2xl font-bold">QA Challenge Portal</p>
        </Link>

        {children}
      </div>
    </div>
  );
}
