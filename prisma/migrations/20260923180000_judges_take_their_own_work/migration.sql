-- Judging moved from automatic assignment to judges taking work from a shared list.
--
-- The rows the old scheme created are actively misleading now: they put a judge's name
-- against a submission that judge never chose, and the Judge column is meant to mean
-- "this person is reviewing this". Anything untouched is therefore removed, and the
-- submission goes back to being available.
--
-- Real work is left alone. An evaluation is real if it has a score against any
-- criterion, a bonus the judge set, or a submitted total — none of which can exist
-- unless somebody opened it and did something.
DELETE FROM "evaluations" e
WHERE e."status" = 'ASSIGNED'
  AND e."totalScore" IS NULL
  AND e."bonusPoints" IS NULL
  AND e."submittedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "evaluation_scores" s WHERE s."evaluationId" = e."id"
  );
