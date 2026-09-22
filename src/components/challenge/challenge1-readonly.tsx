import { FileText } from "lucide-react";
import type { Challenge1Item } from "@/lib/challenge1";

/**
 * Challenge 1 as a judge sees it.
 *
 * Built on Day 6 alongside the editable version rather than on Day 9, because the two
 * render the same data and keeping them together is what turns the judge's review page
 * into assembly instead of a second implementation (DELIVERY_PLAN §1.1a).
 *
 * A server component with no interactivity: a judge cannot edit a participant's work,
 * and the surest way to guarantee that is for the editing code not to be here at all.
 */
export function Challenge1ReadOnly({
  bugReports,
  testCases,
}: {
  bugReports: Challenge1Item[];
  testCases: Challenge1Item[];
}) {
  return (
    <div className="space-y-10">
      <ReadOnlySection
        title="Bug Reports"
        emptyMessage="This participant did not submit any bug reports."
        items={bugReports}
      />
      <ReadOnlySection
        title="Test Cases"
        emptyMessage="This participant did not submit any test cases."
        items={testCases}
      />
    </div>
  );
}

function ReadOnlySection({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: Challenge1Item[];
  emptyMessage: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-muted text-xs tabular-nums">
          {items.length} {items.length === 1 ? "entry" : "entries"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border-border text-muted rounded-(--radius-card) border border-dashed p-8 text-center text-sm">
          <FileText size={18} className="mx-auto mb-2 opacity-50" />
          {emptyMessage}
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="border-border bg-surface rounded-(--radius-card) border p-4"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-muted shrink-0 font-mono text-xs">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-medium">
                  {item.title.trim() || (
                    <span className="text-muted italic">Untitled</span>
                  )}
                </h3>
              </div>

              {item.description.trim() ? (
                // Preserved exactly as written: steps and indentation carry meaning in
                // a bug report, and reflowing them would destroy it.
                <pre className="text-muted mt-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                  {item.description}
                </pre>
              ) : (
                <p className="text-muted mt-3 text-sm italic">No description given.</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
