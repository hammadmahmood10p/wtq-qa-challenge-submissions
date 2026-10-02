# Load test — execution plan

Everything needed to run the load and stress tests for WTQ 2026, in order. Nothing here
runs itself; follow it top to bottom when IT's follow-up scan has cleared.

**Target:** `https://validate-submission-portal.womentechquest.com`
**Generator:** your laptop
**Tiers:** participants 50, 100, 150, 200, 300, 400, 500 · judges 5, 10, 20, 30, 50

Judges are capped at **20** for the event. The 30 and 50 tiers are stress beyond the
requirement, run to show headroom, and the report labels them that way.

---

## Before anything

### Do not run this while a security scan is in progress

The two corrupt each other. Your latency figures will include their probing, and their
scan will see timeouts and rate-limit refusals that look like findings. Wait for the
rescan to close.

### Take a backup first

On the VM:

```bash
~/backup-wtq.sh
ls -lh ~/backups/db/
```

This test creates 550 accounts and signs in as them several thousand times. Nothing it
does is destructive, but a backup taken five minutes earlier costs nothing.

### Know what you are looking for

This is not a benchmark. Four questions:

| Question | Where it shows up |
|---|---|
| Can 500 people behind one NAT address all sign in? | `rate_limited_ip` in every tier |
| Does the database connection pool hold? (capped at 10 per replica, 2 replicas) | failure rate and p99 climbing together |
| Is the submissions table fast enough for 20 judges refreshing it? | judge tiers, `GET /judge` p95 |
| Does the VM have the memory? (7.8 GB, 2 Node replicas + PostgreSQL) | watched separately, see step 6 |

The first is the one most likely to bite. `loginPerIp` is **300 sign-ins per five
minutes from one address**, and every participant at a venue shares one NAT address.

---

## Step 1 — Install k6 (laptop, once)

In **PowerShell as Administrator**:

```powershell
winget install k6 --accept-source-agreements --accept-package-agreements
```

Close and reopen your terminal, then in **Git Bash**:

```bash
k6 version
```

If `winget` is unavailable, download the Windows binary from
`https://github.com/grafana/k6/releases`, unzip it, and put `k6.exe` somewhere on your
`PATH`.

---

## Step 2 — Generate the test accounts (laptop)

From the repository root, in **Git Bash**:

```bash
node loadtest/generate-accounts.mjs 500 50
```

Writes four files into `loadtest/accounts/`:

| File | Purpose |
|---|---|
| `participants.csv` | feed to Bulk Create on the Participants tab |
| `judges.csv` | feed to Bulk Create on the Judges tab |
| `participants.json` | credentials k6 signs in with |
| `judges.json` | credentials k6 signs in with |

Every account is marked `loadtest` in its name and email, and the CNICs sit in a
`9999…` range no real card occupies — so clearing them up later involves no judgement
about whether a row might be a real participant.

The directory is git-ignored. It holds credentials; delete it after the run.

---

## Step 3 — Create the accounts (browser)

In the admin console, signed in as super admin:

1. **Participants → Bulk Create** → upload `loadtest/accounts/participants.csv`
2. Wait for it to finish; the report should show 500 created, 0 skipped
3. **Judges → Bulk Create** → upload `loadtest/accounts/judges.csv` → 50 created

Bulk-created judges need no approval, so they can sign in immediately.

If any row is skipped, the error report names the field. Fix the generator rather than
the CSV, so the credentials JSON stays in step with what was actually created.

---

## Step 4 — Smoke test one tier (laptop)

Never start a twelve-tier run on an untested script.

```bash
k6 run -e BASE_URL=https://validate-submission-portal.womentechquest.com \
       -e VUS=5 -e HOLD=30 -e ARRIVAL=10 \
       -e ACCOUNTS=../accounts/participants.json \
       loadtest/k6/participants.js
```

You are looking for `logins ok 5` and `failed 0`. If sign-ins fail:

| Symptom | Cause |
|---|---|
| `Could not find the login action fields` | the login form markup changed — see `hiddenField()` in `k6/lib.js` |
| `logins ok 0`, `failed 5` | wrong credentials — the accounts were not created, or the CSV and JSON drifted apart |
| TLS errors | add `-e INSECURE=true` (only valid while the self-signed certificate is in use) |

---

## Step 5 — Run every tier (laptop)

```bash
loadtest/run-tiers.sh https://validate-submission-portal.womentechquest.com
```

**This takes about two hours.** Roughly nine minutes per tier, twelve tiers. Most of
that is the 330-second pause between tiers, which is deliberate: the rate-limit window
is 300 seconds, and tiers run back to back would spend the next tier's sign-in budget
on the previous one's, producing a rate-limit wall that is an artefact of the test
rather than a property of the system.

To shorten it for a first pass:

```bash
HOLD=60 PARTICIPANT_TIERS="50 200 500" JUDGE_TIERS="20" \
  loadtest/run-tiers.sh https://validate-submission-portal.womentechquest.com
```

The run continues past a failing tier on purpose. The point of ascending tiers is to
find where the ceiling is and how it degrades, not to stop at the first sign of it.

---

## Step 6 — Watch the VM while it runs (second terminal)

Open a second window and leave this running throughout:

```bash
ssh ubuntu@10.0.5.99
watch -n 5 'free -h | head -2; echo; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"; echo; sudo -u postgres psql -tAc "select count(*) || \" db connections\" from pg_stat_activity where datname = \"wtq2026\";"'
```

Three things to note down, because k6 cannot see them:

- **Memory** — if the two app replicas plus PostgreSQL approach 7.8 GB, that is the
  finding, whatever the latency says
- **Database connections** — should sit at or below 20 (10 per replica). At the cap
  with latency climbing means the pool is the bottleneck
- **CPU** — sustained 100% across 8 vCPU during the sign-in burst is expected and fine;
  Argon2id is meant to be expensive

---

## Step 7 — Build the report (laptop)

```bash
node loadtest/report.mjs > loadtest/results/REPORT.md
```

Each tier gets one of three verdicts:

| Verdict | Meaning |
|---|---|
| **PASS** | within every budget, nobody rate-limited |
| **RATE-LIMITED** | everything that got through was healthy, but the limiter refused some sign-ins — a configuration finding, not a capacity one |
| **FAIL** | exceeded the failure rate, the latency budget, or sign-ins did not produce sessions |

Add your memory and connection-count observations from step 6 by hand; they are the
part the report cannot generate.

---

## Step 8 — Clean up (browser, then laptop)

**This matters.** 550 accounts left behind would appear in the real roster on event day.

1. **Participants → Bulk Remove** → search `loadtest` → **Select all 500 shown** →
   Delete → Confirm
2. **Judges → Bulk Remove** → search `loadtest` → Select all → Delete → Confirm
3. Verify both rosters are back to their real counts
4. On the laptop: `rm -rf loadtest/accounts`

Searching `loadtest` before selecting all is what makes this safe — Select all acts on
what the search has narrowed to, not on the whole roster.

---

## What this does not test

Say so in the report rather than letting it be assumed:

- **The submission spike.** Every participant uploading a PDF in the final ten minutes
  is the heaviest moment of the event. Exercising it means driving a server action with
  a multipart file body, and it fills the disk with real uploads — it needs its own run
  against a disposable database, not a tier in this sequence.
- **Three hours of accumulated state.** These runs are minutes long. Autosave growth,
  session table growth and connection churn across a full attempt are not represented.
- **Venue networks.** The generator is on one corporate connection. Participants will be
  on venue wifi, which will be slower and less reliable than anything measured here.

---

## If the per-IP limiter trips

Expected, and the most valuable thing this test can tell you. The fix is a number in
`src/lib/rate-limit.ts`:

```ts
loginPerIp: { limit: 300, windowSeconds: 300 },
```

It needs to comfortably exceed the largest venue's headcount within a five-minute
window, while still being low enough to be worth having. Decide the number from what
the test shows, change it, redeploy, and re-run only the affected tier.

The per-account limit (10 per five minutes) should **not** be raised — it is what stops
someone grinding at a single participant's account, and no real person signs in ten
times in five minutes.
