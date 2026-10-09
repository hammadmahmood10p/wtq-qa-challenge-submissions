import { ExternalLink, Sparkles } from "lucide-react";

/**
 * The automated assessment, on the Challenge 2 and 3 review tabs.
 *
 * Opens in a new tab rather than a dialog. A judge reads it against the submission,
 * switching back and forth, and a modal would shut every time they wanted to look at
 * the work underneath it — the same reasoning as the known bugs document.
 *
 * Rendered only when a report has been uploaded, so the button is never an offer that
 * leads to a 404.
 */
export function AiEvaluationLink({
  challenge,
  kind,
}: {
  challenge: "C2" | "C3";
  kind: "pdf" | "html";
}) {
  const number = challenge.slice(1);

  return (
    <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={14} className="text-violet shrink-0" />
          AI evaluation — Challenge {number}
        </p>
        <p className="text-muted mt-1 text-xs">
          What the automated assessment made of the Challenge {number} reports. A second opinion,
          not a score — the mark is yours.
        </p>
      </div>

      <a
        href={`/api/files/ai-evaluation/${challenge.toLowerCase()}`}
        target="_blank"
        rel="noopener noreferrer"
        className="border-border bg-surface-raised hover:border-violet/50 inline-flex shrink-0 items-center gap-2 rounded-(--radius-control) border px-3.5 py-2 text-xs font-medium transition-colors"
      >
        View AI Evaluation
        <span className="text-muted font-mono text-[10px] uppercase">
          {kind === "html" ? "web" : "pdf"}
        </span>
        <ExternalLink size={12} className="text-muted shrink-0" />
      </a>
    </div>
  );
}
