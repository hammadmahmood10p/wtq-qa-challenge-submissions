import { Bug, FileText, FlaskConical, Info } from "lucide-react";
import type { Challenge1Entry } from "@/lib/challenge1";
import { challenge1Signals, signalsFor, type Challenge1Signal } from "@/lib/challenge1-signals";

/**
 * Challenge 1 as a judge sees it.
 *
 * Each finding shows its bug report and its test case side by side, in the pairing the
 * participant chose — which is the point of pairing them, and what the Test Cases
 * criterion is partly judging.
 *
 * A server component with no interactivity: a judge cannot edit a participant's work,
 * and the surest way to guarantee that is for the editing code not to be here at all.
 */
export function Challenge1ReadOnly({ entries }: { entries: Challenge1Entry[] }) {
  if (entries.length === 0) {
    return (
      <div className="border-border text-muted rounded-(--radius-card) border border-dashed p-8 text-center text-sm">
        <FileText size={18} className="mx-auto mb-2 opacity-50" />
        This participant did not submit any findings.
      </div>
    );
  }

  // Computed once for the whole set rather than per half, so the two halves of a
  // finding are always read from the same pass over it.
  const signalsByEntry = new Map<string, Challenge1Signal[]>(
    entries.map((entry) => [
      entry.id,
      challenge1Signals({
        bugTitle: entry.bugTitle,
        bugDescription: entry.bugDescription,
        testTitle: entry.testTitle,
        testDescription: entry.testDescription,
        bugEvidenceCount: entry.attachments.filter((a) => a.slot === "BUG").length,
      }),
    ]),
  );

  const flagged = entries.filter((entry) => (signalsByEntry.get(entry.id) ?? []).length > 0).length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Findings</h2>
        <p className="text-muted text-xs tabular-nums">
          {entries.length} {entries.length === 1 ? "finding" : "findings"}
        </p>
      </div>

      {/* Said once, at the top. A judge who sees amber labels on half the findings
          needs to know what they mean and, more importantly, what they do not mean. */}
      {flagged > 0 && (
        <p className="text-muted text-xs">
          <Info size={12} className="mr-1 inline shrink-0 align-[-2px]" />
          The amber labels mark parts of the rubric that could not be found in the text. They are a
          prompt to look, not a judgement — the wording is the participant&apos;s and the decision
          is yours.
        </p>
      )}

      <ol className="space-y-3">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            className="border-border bg-surface overflow-hidden rounded-(--radius-card) border"
          >
            <div className="border-border text-muted border-b px-4 py-2 font-mono text-xs">
              Finding {String(index + 1).padStart(2, "0")}
            </div>

            <div className="grid lg:grid-cols-2">
              <Half
                icon={Bug}
                label="Bug report"
                title={entry.bugTitle}
                description={entry.bugDescription}
                evidence={entry.attachments.filter((a) => a.slot === "BUG")}
                signals={signalsFor(signalsByEntry.get(entry.id) ?? [], "bug")}
              />
              <Half
                icon={FlaskConical}
                label="Test case"
                title={entry.testTitle}
                description={entry.testDescription}
                evidence={entry.attachments.filter((a) => a.slot === "TEST")}
                signals={signalsFor(signalsByEntry.get(entry.id) ?? [], "test")}
                bordered
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Half({
  icon: Icon,
  label,
  title,
  description,
  evidence,
  signals,
  bordered,
}: {
  icon: typeof Bug;
  label: string;
  title: string;
  description: string;
  evidence: Challenge1Entry["attachments"];
  signals: Challenge1Signal[];
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? "border-border border-t p-4 lg:border-t-0 lg:border-l" : "p-4"}>
      <p className="text-violet flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <Icon size={13} />
        {label}
      </p>

      <h3 className="mt-2 font-medium">
        {title.trim() || <span className="text-muted italic">Untitled</span>}
      </h3>

      {description.trim() ? (
        // Preserved exactly as written: indentation and step numbering carry meaning in
        // a bug report, and reflowing them would destroy it.
        <pre className="text-muted mt-2.5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
          {description}
        </pre>
      ) : (
        <p className="text-muted mt-2.5 text-sm italic">No description given.</p>
      )}

      {/* What the rubric asks for and this half does not appear to contain. A prompt
          to look, never a verdict — see src/lib/challenge1-signals.ts. */}
      {signals.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {signals.map((flag) => (
            <li
              key={flag.key}
              className="border-warning/40 bg-warning/8 text-warning-strong inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium"
            >
              <Info size={11} className="shrink-0" />
              {flag.label}
            </li>
          ))}
        </ul>
      )}

      {evidence.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {evidence.map((item) => (
            <li key={item.id}>
              <a
                href={`/api/files/evidence/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`${item.originalFilename} — open full size`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/evidence/${item.id}`}
                  alt={item.originalFilename}
                  className="border-border hover:border-violet h-20 w-28 rounded-(--radius-control) border object-cover transition-colors"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
