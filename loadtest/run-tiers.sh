#!/usr/bin/env bash
# Runs every tier in order and writes one result file per tier.
#
# Run from the repository root, in Git Bash:
#   loadtest/run-tiers.sh https://validate-submission-portal.womentechquest.com
#
# Tiers ascend so that a failure tells you where the ceiling is rather than only that
# there is one — and so the run can be stopped the moment a tier breaks without having
# wasted time on larger ones that were never going to pass.
#
# Between tiers it pauses. That is not politeness: the per-IP login limiter allows 300
# sign-ins per five minutes, and tiers run back to back would spend the next tier's
# budget on the previous one's — reporting a rate-limit wall that is an artefact of the
# test rather than a property of the system.
#
# Override via environment:
#   PARTICIPANT_TIERS, JUDGE_TIERS, HOLD, ARRIVAL, COOLDOWN, INSECURE

set -uo pipefail

BASE_URL="${1:-${BASE_URL:-}}"

if [[ -z "$BASE_URL" ]]; then
  echo "usage: loadtest/run-tiers.sh <base-url>" >&2
  exit 1
fi

PARTICIPANT_TIERS="${PARTICIPANT_TIERS:-50 100 150 200 300 400 500}"
JUDGE_TIERS="${JUDGE_TIERS:-5 10 20 30 50}"
HOLD="${HOLD:-120}"
ARRIVAL="${ARRIVAL:-120}"
COOLDOWN="${COOLDOWN:-330}"
INSECURE="${INSECURE:-false}"

command -v k6 >/dev/null || { echo "error: k6 is not installed — see loadtest/README.md" >&2; exit 1; }

for f in loadtest/accounts/participants.json loadtest/accounts/judges.json; do
  [[ -f "$f" ]] || { echo "error: $f missing — run: node loadtest/generate-accounts.mjs 500 50" >&2; exit 1; }
done

mkdir -p loadtest/results

echo "Target:      $BASE_URL"
echo "Participants: $PARTICIPANT_TIERS"
echo "Judges:       $JUDGE_TIERS"
echo "Hold ${HOLD}s · arrival ${ARRIVAL}s · cooldown between tiers ${COOLDOWN}s"
echo

failed_tiers=()

run_tier() {
  local script="$1" kind="$2" vus="$3" accounts="$4"

  echo "──────────────────────────────────────────────"
  echo "  ${kind} — ${vus} virtual users"
  echo "──────────────────────────────────────────────"

  k6 run \
    -e "BASE_URL=${BASE_URL}" \
    -e "VUS=${vus}" \
    -e "HOLD=${HOLD}" \
    -e "ARRIVAL=${ARRIVAL}" \
    -e "INSECURE=${INSECURE}" \
    -e "ACCOUNTS=${accounts}" \
    "$script"
  local status=$?

  # k6 exits non-zero when a threshold fails. That is a result, not a reason to stop:
  # the point of ascending tiers is to find where it breaks, which means running past
  # the first break to see how it degrades.
  if [[ $status -ne 0 ]]; then
    echo "  ⚠ ${kind} @ ${vus} VUs did not meet its thresholds (exit ${status})"
    failed_tiers+=("${kind}@${vus}")
  fi

  echo "  cooling down ${COOLDOWN}s so the next tier starts with a fresh rate-limit window…"
  sleep "$COOLDOWN"
}

for vus in $PARTICIPANT_TIERS; do
  run_tier loadtest/k6/participants.js participants "$vus" "../accounts/participants.json"
done

for vus in $JUDGE_TIERS; do
  run_tier loadtest/k6/judges.js judges "$vus" "../accounts/judges.json"
done

echo
echo "=============================================="
if [[ ${#failed_tiers[@]} -eq 0 ]]; then
  echo "  Every tier met its thresholds."
else
  echo "  Tiers that missed a threshold: ${failed_tiers[*]}"
  echo "  This is information, not necessarily a fault — read the report."
fi
echo "=============================================="
echo
echo "Now build the report:"
echo "  node loadtest/report.mjs > loadtest/results/REPORT.md"
