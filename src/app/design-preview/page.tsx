import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Aurora palette reference.
 *
 * Not linked from the application — it exists so the design language in
 * docs/DESIGN_LANGUAGE.md can be reviewed against something real rather than a list
 * of hex codes, and so the tokens can be checked in both themes after a change.
 */

const swatches = [
  { name: "Aurora Violet", varName: "--aurora-violet", use: "Primary actions, active tabs, focus" },
  { name: "Aurora Magenta", varName: "--aurora-magenta", use: "Gradient partner, accents" },
  { name: "Aurora Amber", varName: "--aurora-amber", use: "Achievement, bonus score" },
  { name: "Success", varName: "--success", use: "Saved indicator, approved" },
  { name: "Warning", varName: "--warning", use: "Unsaved changes, pending" },
  { name: "Danger", varName: "--danger", use: "Destructive, validation errors" },
  { name: "Info", varName: "--info", use: "Briefing callouts" },
];

const timerStates = [
  { label: "3:00:00 – 0:30:00", time: "02:47:13", varName: "--timer-calm", note: "Calm. No motion." },
  { label: "0:30:00 – 0:10:00", time: "00:24:08", varName: "--timer-caution", note: "Toast: 30 minutes remaining" },
  { label: "0:10:00 – 0:05:00", time: "00:07:42", varName: "--timer-warning", note: "Digits gain weight" },
  { label: "Under 0:05:00", time: "00:02:19", varName: "--timer-critical", note: "Pulse + reassurance banner" },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-20">
      <header className="mb-14 flex items-start justify-between gap-4">
        <div>
          <p className="text-muted font-mono text-xs tracking-widest uppercase">
            Women Tech Quest 2026
          </p>
          <h1 className="font-display mt-3 text-4xl leading-tight font-bold sm:text-5xl">
            <span className="aurora-text">QA Challenge Portal</span>
          </h1>
          <p className="text-muted mt-4 max-w-xl text-base">
            Day 1 — foundations. Project scaffold, data model and design tokens are in
            place. This page is a stand-in for the login screen, built so the Aurora
            palette can be reviewed against something real.
          </p>
        </div>
        <ThemeToggle />
      </header>

      {/* Gradient specimen */}
      <section className="mb-14">
        <div
          className="shadow-(--shadow-raised) flex h-36 items-end rounded-(--radius-card) p-6"
          style={{ background: "var(--aurora-gradient)" }}
        >
          <span className="font-display text-lg font-semibold text-white drop-shadow">
            Aurora — violet → magenta → amber
          </span>
        </div>
        <p className="text-muted mt-3 text-sm">
          Reserved for the hero, the begin button, progress fills and the submission
          celebration. Used nowhere else, so it never becomes wallpaper.
        </p>
      </section>

      {/* Palette */}
      <section className="mb-14">
        <h2 className="font-display mb-5 text-xl font-semibold">Palette</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {swatches.map((s) => (
            <div
              key={s.name}
              className="border-border bg-surface shadow-(--shadow-card) flex items-center gap-4 rounded-(--radius-card) border p-4"
            >
              <div
                className="h-12 w-12 shrink-0 rounded-(--radius-control)"
                style={{ background: `var(${s.varName})` }}
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="text-muted truncate text-xs">{s.use}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Timer ramp */}
      <section className="mb-14">
        <h2 className="font-display mb-2 text-xl font-semibold">The countdown ramp</h2>
        <p className="text-muted mb-5 max-w-2xl text-sm">
          The single most emotionally charged element in the product. Colour lets a
          participant read their remaining time peripherally — but every step is paired
          with a text cue, so colour is never the only signal.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {timerStates.map((t) => (
            <div
              key={t.label}
              className="border-border bg-surface-raised shadow-(--shadow-card) rounded-(--radius-card) border p-5"
            >
              <p className="text-muted font-mono text-[11px] tracking-wider uppercase">
                {t.label}
              </p>
              <p
                className="font-display tabular mt-2 text-4xl font-bold"
                style={{ color: `var(${t.varName})` }}
              >
                {t.time}
              </p>
              <p className="text-muted mt-2 text-sm">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Type */}
      <section className="mb-14">
        <h2 className="font-display mb-5 text-xl font-semibold">Typography</h2>
        <div className="border-border bg-surface shadow-(--shadow-card) space-y-4 rounded-(--radius-card) border p-6">
          <p className="font-display text-3xl font-bold">Sora — display and countdown</p>
          <p className="text-base">
            Inter — body text. Chosen for legibility at small sizes across a
            three-hour working session, which is a very different demand from a landing
            page read for thirty seconds.
          </p>
          <p className="font-mono text-sm">
            JetBrains Mono — https://github.com/example/storeTask-wtq26
          </p>
        </div>
      </section>

      <footer className="border-border text-muted border-t pt-6 text-sm">
        <p>
          Palette and rationale in{" "}
          <code className="font-mono text-xs">docs/DESIGN_LANGUAGE.md</code>. Schedule in{" "}
          <code className="font-mono text-xs">docs/DELIVERY_PLAN.md</code>.
        </p>
      </footer>
    </main>
  );
}
