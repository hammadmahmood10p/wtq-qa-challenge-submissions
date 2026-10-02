# Load testing — setup, execution and interpretation

Everything about how the load test environment is built, what it exercises, how to run
it, and how to read what comes back.

`loadtest/README.md` is the short command reference. This is the full account.

| | |
|---|---|
| **Target** | `https://validate-submission-portal.womentechquest.com` → NAT → `10.0.5.99` |
| **Generator** | Hammad's laptop, Windows, k6 v1.2.3 |
| **Scale** | 500 participants, 50 judges (20 is the event maximum for judges) |
| **Event** | Saturday 10 October 2026, three cities, one three-hour attempt |

---

## 1. What this is for

Not "how fast is it". A throughput number nobody can act on is worth nothing. This
exists to answer four specific questions, each of which has a plausible failure that
would spoil the event.

### 1.1 Can 500 people behind one address all sign in?

The sharpest question, and the one most likely to produce a finding.

`src/lib/rate-limit.ts` allows **300 sign-ins per five minutes from one IP address**.
Every participant at a venue arrives through that venue's single NAT address, and they
all arrive within the same ten minutes. Karachi alone is expected to be the largest
group.

If the limiter trips, participants see *"Too many login attempts. Please wait N
minute(s) and try again"* at 9:55am, which is the worst possible moment.

This is a configuration question, not a capacity one — but it can only be answered by
generating the right shape of traffic, which means arriving fast, from one address.

### 1.2 Does the database connection pool hold?

`src/lib/db.ts` caps the pool at **10 connections per process**. Two app replicas means
a ceiling of 20 connections to PostgreSQL, deliberately, because an uncapped pool
multiplied by replicas is how a database runs out of connections.

Twenty is a judgement, not a measurement. If it is too low, latency climbs while CPU
stays idle — requests queue behind the pool rather than behind the work.

### 1.3 Is the submissions table fast enough for the judges?

The heaviest read in the application. Every row decrypts an ID card number, resolves a
judge claim, and — since the Challenges Accepted column — derives a completion count
from the participant's actual work.

Twenty judges pressing Refresh is more database work than five hundred participants
watching a clock. It is also the part that is used *after* everyone has submitted, when
there is the most data to read.

### 1.4 Does the VM have the memory?

8 vCPU, **7.8 GB RAM**, 98 GB disk, running two Node replicas, nginx and PostgreSQL on
one machine. The runbook flagged RAM as at the floor rather than comfortable.

k6 cannot see this. It is watched separately (§6.2).

---

## 2. What is being loaded

The thing under test is a Next.js 16 application behind nginx, with PostgreSQL on the
same VM.

```
  laptop (k6)                    VM 10.0.5.99
  ─────────────                  ─────────────────────────────────
  500 virtual users  ──https──►  nginx 1.30.5
                                   │ (load balances)
                                   ├─► wtq-app-1  (Node, pool max 10)
                                   └─► wtq-app-2  (Node, pool max 10)
                                           │
                                           ▼
                                   PostgreSQL 16 (on the host)
```

Every request from k6 traverses the same path a participant's would: public DNS, the
corporate NAT, nginx, TLS termination, one of the two replicas, and the database.

---

## 3. Why this needed building rather than scripting

**Nothing this application writes is a REST endpoint.** Login, autosave, submit — all
of them are Next.js **Server Actions**. There is no `POST /api/login` to aim at. A
Server Action is a POST to the page's own URL, identified by a hash that the framework
generates at build time.

That rules out the obvious approach of writing `http.post('/api/login', {...})`.

### 3.1 The way in

The login form is rendered with Next's **no-JavaScript fallback**: a plain
`multipart/form-data` POST to `/login` carrying four hidden fields that name the action.

```html
<form action="" encType="multipart/form-data" method="POST">
  <input type="hidden" name="$ACTION_REF_1" />
  <input type="hidden" name="$ACTION_1:0" value='{"id":"60c4a5f6ea…","bound":"$@1"}' />
  <input type="hidden" name="$ACTION_1:1" value="[{}]" />
  <input type="hidden" name="$ACTION_KEY" value="k2a24e94b…" />
  <input name="username" /> <input name="password" type="password" />
</form>
```

So `loadtest/k6/lib.js` fetches `/login`, reads those four values out of the HTML, and
posts them back with real credentials. Verified against a running server before
anything else was built.

### 3.2 Why the fields are read at runtime, not pasted in

The action id is a **build hash**. Measured on 2 October 2026:

| Build | `$ACTION_1:0` id |
|---|---|
| local development | `60308b400da440643afb14788181246e6d1345f86b` |
| deployed production | `60c4a5f6ea0bb7a906960b894dad050de552cae4b8` |

A script with one of these pasted in would have reported a perfectly healthy login rate
while never authenticating anybody — because an unmatched action still returns HTTP
200. The script therefore extracts them every run, and **throws** if the form shape
changes, rather than carrying on and reporting green.

---

## 4. The environment

### 4.1 Machines

| Role | What |
|---|---|
| Generator | Windows laptop, Git Bash, k6 v1.2.3, Node for the helper scripts |
| Target | Ubuntu 24.04, 8 vCPU, 7.8 GB RAM, 98 GB disk |
| Observer | a second SSH session to the VM, watching memory and connections |

**The generator must not run on the VM.** It would consume the CPU being measured and
report the generator's own limits as the application's.

### 4.2 Test accounts

550 accounts, created through the application's own Bulk Create so that they exist
exactly as real accounts do — same hashing, same profile rows, same everything.

They are marked three ways so cleanup needs no judgement:

| Mark | Value |
|---|---|
| Email | `loadtest-p00000@example.com`, `loadtest-j000@10pearls.com` |
| Name | `Loadtest P00000`, `Loadtest J000` |
| CNIC | `9999…` — a range no issued card occupies |

Passwords are **derived, not stored**: `generate-accounts.mjs` computes them with the
same rule the application uses — first name plus the last five digits of the CNIC
(participants) or phone (judges). That is why the CSV and the credentials file cannot
drift apart; they come from one definition.

### 4.3 Files

| File | Role |
|---|---|
| `loadtest/generate-accounts.mjs` | writes the CSVs and the credentials JSON |
| `loadtest/k6/lib.js` | login, custom metrics, thresholds, per-tier result capture |
| `loadtest/k6/participants.js` | the participant profile |
| `loadtest/k6/judges.js` | the judge profile |
| `loadtest/run-tiers.sh` | runs every tier in order |
| `loadtest/report.mjs` | aggregates the results into a report |
| `loadtest/accounts/` | **git-ignored** — holds credentials |
| `loadtest/results/` | **git-ignored** — holds output |

---

## 5. Setup — steps 1 to 4

### Step 1 — Install k6 · ✅ done 2 Oct 2026

In **PowerShell**:

```powershell
winget install --id GrafanaLabs.k6 --scope user --accept-source-agreements --accept-package-agreements
```

Installed to `C:\Program Files\k6\k6.exe` and added to the machine `PATH`.

Confirm in a **new Git Bash window**:

```bash
k6 version
# k6.exe v1.2.3 (commit/e4a5a88f7c, go1.24.6, windows/amd64)
```

If `k6` is not found, the shell predates the PATH change — open a new one.

### Step 2 — Generate the accounts · ✅ done 2 Oct 2026

From the repository root in **Git Bash**:

```bash
node loadtest/generate-accounts.mjs 500 50
```

Produces, in `loadtest/accounts/`:

| File | Contents |
|---|---|
| `participants.csv` | 500 rows — `fullName,email,phone,cnic,location` |
| `judges.csv` | 50 rows — `fullName,email,phone` |
| `participants.json` | 500 `{username, password}` pairs for k6 |
| `judges.json` | 50 pairs |

Verified: 500 unique CNICs, 500 unique phone numbers, no collisions.

### Step 3 — Create the accounts · ⬜ needs the browser

Signed into the admin console as super admin:

1. **Participants → Bulk Create**
2. Upload `loadtest/accounts/participants.csv`
3. Confirm the preview, then run it — expect **500 created, 0 skipped**
4. **Judges → Bulk Create**
5. Upload `loadtest/accounts/judges.csv` — expect **50 created, 0 skipped**

Bulk-created judges need no approval, so they can sign in immediately.

If any row is skipped, the report names the field and the row. Fix
`generate-accounts.mjs` and regenerate rather than hand-editing the CSV — otherwise the
credentials file no longer matches what was created, and every k6 sign-in for that row
fails for a reason that looks like a server problem.

### Step 4 — Smoke test · ⬜ needs step 3

Never start a two-hour run on an untested script.

```bash
k6 run -e BASE_URL=https://validate-submission-portal.womentechquest.com \
       -e VUS=5 -e HOLD=30 -e ARRIVAL=10 \
       -e ACCOUNTS=../accounts/participants.json \
       loadtest/k6/participants.js
```

Success looks like:

```
  participants @ 5 VUs
  requests 23   failed 0.00%
  logins ok 5   failed 0   rate-limited ip 0   account 0
  all thresholds passed
```

| Symptom | Cause | Fix |
|---|---|---|
| `Could not find the login action fields` | login form markup changed | update `hiddenField()` in `k6/lib.js` |
| `logins ok 0, failed 5` | credentials wrong | step 3 did not run, or the CSV was hand-edited |
| `x509: certificate signed by unknown authority` | self-signed certificate still installed | add `-e INSECURE=true` |
| `rate-limited ip 5` | a previous run used the budget | wait five minutes |

Already validated without needing accounts: all four action fields are present in the
**production** build's `/login`, with `username` and `password` inputs — so §3.1 holds
against the real deployment, not only against dev.

---

## 6. Execution — steps 5 and 6

### 6.1 Run the tiers

```bash
loadtest/run-tiers.sh https://validate-submission-portal.womentechquest.com
```

**Participants:** 50 · 100 · 150 · 200 · 300 · 400 · 500
**Judges:** 5 · 10 · **20 (event maximum)** · 30 · 50 *(stress beyond requirement)*

Each tier: ramp up over 120s → hold 120s → ramp down 15s → **pause 330s**.

**Total ≈ 2 hours.** Most of it is the pauses, and they are not optional: the
rate-limit window is 300 seconds, so tiers run back to back would spend the next
tier's sign-in budget on the previous one's and manufacture a rate-limit wall that is
an artefact of the test.

Shorter first pass:

```bash
HOLD=60 PARTICIPANT_TIERS="50 200 500" JUDGE_TIERS="20" \
  loadtest/run-tiers.sh https://validate-submission-portal.womentechquest.com
```

The run **continues past a failing tier** deliberately. The question is where the
ceiling is and how it degrades, not whether one exists.

### 6.2 Watch the VM at the same time

Second terminal, for the whole run:

```bash
ssh ubuntu@10.0.5.99
watch -n 5 'free -h | head -2; echo; docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"'
```

And in a third, or between tiers:

```bash
sudo -u postgres psql -tAc "select count(*) from pg_stat_activity where datname='wtq2026';"
```

Three readings to record by hand, because k6 cannot see them:

| Reading | Healthy | Finding |
|---|---|---|
| Memory | under ~6 GB of 7.8 | approaching 7.8 GB — the finding, whatever latency says |
| DB connections | at or below 20 | pinned at 20 with latency climbing → the pool is the bottleneck |
| CPU | spikes to 100% during sign-in bursts | sustained 100% at low tiers |

CPU at 100% during a sign-in burst is **expected and correct**. Argon2id is deliberately
expensive; cheap sign-ins would mean weak hashing.

---

## 7. Reading the results — step 7

```bash
node loadtest/report.mjs > loadtest/results/REPORT.md
```

### 7.1 Budgets

| Budget | Value | Why |
|---|---|---|
| Failed requests | under 1% | anything higher is visible to participants |
| Page read p95 | under 2000 ms | the workspace must not feel stalled |
| Sign-in p95 | under 4000 ms | deliberately loose — Argon2id is meant to cost |

### 7.2 Verdicts

| Verdict | Meaning | Action |
|---|---|---|
| **PASS** | within budget, nobody rate-limited | none |
| **RATE-LIMITED** | everything that got through was healthy, but sign-ins were refused | raise `loginPerIp` — §8 |
| **FAIL** | exceeded failure rate or latency, or sign-ins produced no session | investigate before the event |

**Rate limiting is reported separately from failure throughout, on purpose.** Being
refused by the limiter is the system working as designed. Folded into an error rate it
would read as the server struggling, when what actually happened is that it declined to
admit a crowd faster than its own rule allows — a real finding, but a configuration
one.

### 7.3 Add by hand

The report cannot generate §6.2's readings. Append them under *Conclusions*: peak
memory, peak database connections, and whether CPU saturated.

---

## 8. If the per-IP limiter trips

Expected, and the single most valuable thing this test can tell you.

```ts
// src/lib/rate-limit.ts
loginPerIp: { limit: 300, windowSeconds: 300 },
```

Raise `limit` to comfortably exceed the largest venue's headcount in a five-minute
window, redeploy, and re-run only the affected tier.

**Do not raise `loginPerAccount`** (10 per five minutes). That is what stops someone
grinding at one participant's account, and no real person signs in ten times in five
minutes.

---

## 9. Cleanup — step 8

550 accounts left behind would appear in the real roster on event day.

1. **Participants → Bulk Remove** → search `loadtest` → **Select all 500 shown** →
   Delete → Confirm
2. **Judges → Bulk Remove** → search `loadtest` → Select all → Delete → Confirm
3. Check both rosters are back to their real counts
4. On the laptop: `rm -rf loadtest/accounts`

Searching `loadtest` before selecting all is what makes this safe: Select all acts on
what the search narrowed to, never on the whole roster.

---

## 10. What this does not cover

Stated plainly so it is not assumed otherwise.

- **The submission spike.** Every participant uploading a PDF in the final ten minutes
  is the heaviest moment of the event. Driving it means a multipart Server Action
  carrying a real file, and it fills the disk with real uploads — it needs its own run
  against a disposable database, not a tier in this sequence.
- **Three hours of accumulated state.** These runs last minutes. Autosave growth,
  session-table growth and connection churn across a full attempt are not represented.
- **Venue networks.** The generator sits on one corporate connection. Participants will
  be on venue wifi — slower, lossier, and not measurable from here.
- **Judging writes.** Judges read the table here; they do not save scores. Score writes
  are low-volume and low-concurrency by nature.

---

## 11. Before you start — checklist

- [ ] IT's follow-up security scan has **completed** — the two corrupt each other
- [ ] Database backed up: `~/backup-wtq.sh` on the VM
- [ ] k6 responds to `k6 version` in a fresh Git Bash window
- [ ] `loadtest/accounts/` regenerated
- [ ] 500 participants and 50 judges bulk-created, 0 skipped
- [ ] Smoke test passes with `logins ok 5`
- [ ] Second terminal open on the VM watching memory
- [ ] Two hours available, or a shortened tier list chosen
