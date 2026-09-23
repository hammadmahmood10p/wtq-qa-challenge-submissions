"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import type { ChallengeKey, ChallengeTrack } from "@/generated/prisma/enums";
import {
  saveBonusAction,
  saveScoresAction,
  submitFinalScoreAction,
  unlockEvaluationAction,
} from "@/app/actions/evaluation";
import { computeTotal, isComplete, maxScoreFor, rubricFor, scorableChallenges } from "@/lib/scoring";

export type EvaluationStatus = "ASSIGNED" | "IN_PROGRESS" | "SUBMITTED";

/**
 * The score state for one submission, shared across the page.
 *
 * It exists because of where the brief puts things: the running total sits in the
 * header, and the fields that change it sit inside the task tabs, several components
 * away. Passing the numbers up and down would mean the header and the fields could
 * disagree, which on a scoring screen is the one thing that must never happen.
 *
 * Values are held as the strings the judge typed, not as numbers. A half-typed "1" on
 * the way to "10", and an emptied box, both have to survive without the total lurching
 * or a 0 appearing in a field somebody is still using.
 */

interface ScoringState {
  attemptId: string;
  track: ChallengeTrack | null;
  status: EvaluationStatus;
  /** False for a judge looking at someone else's assignment. */
  canScore: boolean;
  canUnlock: boolean;

  values: Record<string, string>;
  setValue: (criterion: string, value: string) => void;
  bonus: string;
  setBonus: (value: string) => void;

  total: number;
  maxTotal: number;
  complete: boolean;
  /** Criteria changed since their last save, per challenge. */
  dirty: Set<string>;

  pending: boolean;
  error: string | null;
  savedAt: Partial<Record<ChallengeKey, number>>;

  saveChallenge: (challenge: ChallengeKey) => void;
  saveBonusValue: () => void;
  submitFinal: () => Promise<boolean>;
  unlock: (reason: string) => Promise<boolean>;
}

const Ctx = createContext<ScoringState | null>(null);

export function useScoring(): ScoringState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useScoring used outside ScoringProvider");
  return value;
}

/** "" for an unscored criterion, so an empty box never reads as a deliberate zero. */
function toField(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseField(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ScoringProvider({
  attemptId,
  track,
  status: initialStatus,
  canScore,
  canUnlock,
  initialScores,
  initialBonus,
  children,
}: {
  attemptId: string;
  track: ChallengeTrack | null;
  status: EvaluationStatus;
  canScore: boolean;
  canUnlock: boolean;
  initialScores: Record<string, number>;
  initialBonus: number | null;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<EvaluationStatus>(initialStatus);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const challenge of scorableChallenges(track)) {
      for (const criterion of rubricFor(challenge).criteria) {
        seeded[criterion.key] = toField(initialScores[criterion.key]);
      }
    }
    return seeded;
  });
  const [bonus, setBonusValue] = useState(initialBonus === null ? "" : String(initialBonus));

  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<Partial<Record<ChallengeKey, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setValue = useCallback((criterion: string, value: string) => {
    setValues((prev) => ({ ...prev, [criterion]: value }));
    setDirty((prev) => new Set(prev).add(criterion));
    setError(null);
  }, []);

  const setBonus = useCallback((value: string) => {
    setBonusValue(value);
    setDirty((prev) => new Set(prev).add("bonus"));
    setError(null);
  }, []);

  const { total, complete } = useMemo(() => {
    const scores = new Map<string, number>();
    for (const [key, raw] of Object.entries(values)) {
      const parsed = parseField(raw);
      if (parsed !== null) scores.set(key, parsed);
    }

    return {
      total: computeTotal(scores, track, parseField(bonus)),
      complete: isComplete(track, new Set(scores.keys())),
    };
  }, [values, bonus, track]);

  const saveChallenge = useCallback(
    (challenge: ChallengeKey) => {
      setError(null);

      const payload: Record<string, number | null> = {};
      const keys = rubricFor(challenge).criteria.map((c) => c.key);
      for (const key of keys) payload[key] = parseField(values[key] ?? "");

      startTransition(async () => {
        const result = await saveScoresAction(attemptId, challenge, payload);

        if (!result.ok) {
          setError(result.message ?? "Could not save. Please try again.");
          return;
        }

        setSavedAt((prev) => ({ ...prev, [challenge]: Date.now() }));
        setDirty((prev) => {
          const next = new Set(prev);
          for (const key of keys) next.delete(key);
          return next;
        });
        setStatus((prev) => (prev === "ASSIGNED" ? "IN_PROGRESS" : prev));
      });
    },
    [attemptId, values],
  );

  const saveBonusOnly = useCallback(() => {
    const parsed = parseField(bonus);
    if (parsed === null) {
      setError("Enter a bonus between -5 and 5.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveBonusAction(attemptId, parsed);

      if (!result.ok) {
        setError(result.message ?? "Could not save the bonus.");
        return;
      }

      setDirty((prev) => {
        const next = new Set(prev);
        next.delete("bonus");
        return next;
      });
      setStatus((prev) => (prev === "ASSIGNED" ? "IN_PROGRESS" : prev));
    });
  }, [attemptId, bonus]);

  const submitFinal = useCallback(async () => {
    setError(null);
    const result = await submitFinalScoreAction(attemptId);

    if (!result.ok) {
      setError(result.message ?? "Could not submit the final score.");
      return false;
    }

    setStatus("SUBMITTED");
    setDirty(new Set());
    return true;
  }, [attemptId]);

  const unlock = useCallback(
    async (reason: string) => {
      setError(null);
      const result = await unlockEvaluationAction(attemptId, reason);

      if (!result.ok) {
        setError(result.message ?? "Could not reopen this score.");
        return false;
      }

      setStatus("IN_PROGRESS");
      return true;
    },
    [attemptId],
  );

  const value: ScoringState = {
    attemptId,
    track,
    status,
    // A locked evaluation is read-only for everyone until it is explicitly reopened,
    // including for the super admin who can reopen it. Editing a "submitted" result
    // in place would leave no trace that it had changed.
    canScore: canScore && status !== "SUBMITTED",
    canUnlock,
    values,
    setValue,
    bonus,
    setBonus,
    total,
    maxTotal: maxScoreFor(track),
    complete,
    dirty,
    pending,
    error,
    savedAt,
    saveChallenge,
    saveBonusValue: saveBonusOnly,
    submitFinal,
    unlock,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
