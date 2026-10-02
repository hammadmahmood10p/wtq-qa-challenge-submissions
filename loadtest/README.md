# Load test — command reference

**The full document is [`docs/LOAD_TESTING.md`](../docs/LOAD_TESTING.md)** — what it
tests, why it is built this way, how to read the results, and what it does not cover.
This file is only the commands, kept short so the two cannot drift apart.

All commands run from the **repository root** in **Git Bash**, on the **laptop**.

---

## Setup

```bash
k6 version                                   # expect v1.2.3 or later
node loadtest/generate-accounts.mjs 500 50   # writes loadtest/accounts/
```

Then in the browser, as super admin: **Bulk Create** `participants.csv` on the
Participants tab and `judges.csv` on the Judges tab.

## Smoke test

Always before a full run.

```bash
k6 run -e BASE_URL=https://validate-submission-portal.womentechquest.com \
       -e VUS=5 -e HOLD=30 -e ARRIVAL=10 \
       -e ACCOUNTS=../accounts/participants.json \
       loadtest/k6/participants.js
```

Looking for `logins ok 5` and `failed 0`.

## Full run — about two hours

```bash
loadtest/run-tiers.sh https://validate-submission-portal.womentechquest.com
```

Shorter first pass:

```bash
HOLD=60 PARTICIPANT_TIERS="50 200 500" JUDGE_TIERS="20" \
  loadtest/run-tiers.sh https://validate-submission-portal.womentechquest.com
```

Watch the VM at the same time, in another terminal:

```bash
ssh ubuntu@10.0.5.99
watch -n 5 'free -h | head -2; echo; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"'
```

## Report

```bash
node loadtest/report.mjs > loadtest/results/REPORT.md
```

## Clean up

Browser: **Bulk Remove** on both tabs, search `loadtest`, Select all shown, Confirm.

```bash
rm -rf loadtest/accounts
```

---

## Knobs

| Variable | Default | What it does |
|---|---|---|
| `BASE_URL` | the deployed host | target |
| `VUS` | 50 / 5 | virtual users for one run |
| `HOLD` | 120 | seconds at full load |
| `ARRIVAL` | 120 | seconds to ramp up — models how fast the crowd arrives |
| `COOLDOWN` | 330 | seconds between tiers; must exceed the 300s rate-limit window |
| `INSECURE` | false | `true` to accept a self-signed certificate |
| `PARTICIPANT_TIERS` | `50 100 150 200 300 400 500` | |
| `JUDGE_TIERS` | `5 10 20 30 50` | 20 is the event maximum; above is stress |
