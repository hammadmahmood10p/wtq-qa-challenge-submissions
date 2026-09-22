import { ExternalLink, Sparkles } from "lucide-react";
import type { Challenge } from "@/lib/challenge-content";
import { Alert } from "@/components/ui/alert";

/**
 * One challenge briefing. Shared by the information page and the workspace tabs so
 * the wording a participant reads before starting is exactly the wording they can
 * check halfway through.
 */
export function ChallengeBrief({
  challenge,
  showSubmitLink,
}: {
  challenge: Challenge;
  showSubmitLink?: boolean;
}) {
  return (
    <article className="space-y-6">
      <header>
        <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
          Challenge {challenge.number}
        </p>
        <h2 className="font-display mt-1.5 text-xl font-bold sm:text-2xl">{challenge.title}</h2>
        <p className="text-muted mt-2 max-w-2xl">{challenge.summary}</p>
      </header>

      {challenge.notes?.map((note) => (
        <Alert key={note} variant="success">
          <span className="flex items-center gap-1.5">
            <Sparkles size={14} />
            {note}
          </span>
        </Alert>
      ))}

      <div className="space-y-5">
        {challenge.sections.map((section) => (
          <section key={section.heading}>
            <h3 className="font-display text-sm font-semibold">{section.heading}</h3>
            <ul className="mt-2 space-y-1.5">
              {section.items.map((item) => (
                <li key={item} className="text-muted flex gap-2.5 text-sm">
                  <span aria-hidden="true" className="bg-violet mt-2 size-1 shrink-0 rounded-full" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {showSubmitLink && (
        <a
          href={challenge.href}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-violet hover:bg-violet-hover inline-flex items-center gap-2 rounded-(--radius-control) px-4 py-2.5 text-sm font-medium text-white transition-colors"
        >
          {challenge.submitLabel}
          <ExternalLink size={14} />
        </a>
      )}
    </article>
  );
}
