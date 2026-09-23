import { ExternalLink, Lock, Sparkles } from "lucide-react";
import type { ChallengeTrack } from "@/generated/prisma/enums";
import { Alert } from "@/components/ui/alert";
import type { Challenge } from "@/lib/challenge-content";
import { isChallengeOpen } from "@/lib/challenge-content";

/**
 * One challenge briefing. Shared by the information page and the workspace tabs, so
 * the wording a participant reads before starting is the wording they can check
 * halfway through.
 */
export function ChallengeBrief({
  challenge,
  showSubmitLink,
  chosenTrack,
  choiceControl,
}: {
  challenge: Challenge;
  showSubmitLink?: boolean;
  chosenTrack?: ChallengeTrack | null;
  /** The "choose this challenge" control, for the two alternatives. */
  choiceControl?: React.ReactNode;
}) {
  const open = isChallengeOpen(challenge, chosenTrack ?? null);
  const closedByChoice = Boolean(challenge.track && chosenTrack && !open);

  return (
    <article className="space-y-6">
      <header>
        <p className="text-muted font-mono text-[11px] tracking-[0.18em] uppercase">
          Challenge {challenge.number}
        </p>
        <h2 className="font-display mt-1.5 text-xl font-bold sm:text-2xl">{challenge.title}</h2>
        <p className="text-muted mt-2 max-w-2xl">{challenge.summary}</p>
      </header>

      {closedByChoice && (
        <Alert variant="info" title="This challenge is closed to you">
          <span className="flex items-center gap-1.5">
            <Lock size={13} />
            You chose Challenge {chosenTrack === "C3" ? 3 : 4}, and that cannot be changed.
          </span>
        </Alert>
      )}

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

      {choiceControl}

      {showSubmitLink && open && (
        <a
          href={challenge.href}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-violet hover:bg-violet-hover inline-flex items-center gap-2 rounded-(--radius-control) px-4 py-2.5 text-sm font-medium text-white transition-colors"
        >
          Open Challenge {challenge.number} submission
          <ExternalLink size={14} />
        </a>
      )}
    </article>
  );
}
