# WTQ 2026 — Delivery Plan (operative)

**Event date:** Saturday, 10 October 2026
**Plan revised:** Tuesday, 22 September 2026 — **14 working days remaining** (weekdays only)
**Team:** one QA Automation Engineer (you) + Claude (me) writing the bulk of the code
**Supersedes:** the phase plan and stack choice in `ARCHITECTURE_AND_PHASES.md`. That document's **data model (§4), decisions (§5) and risk register (§8) still stand.**

---

## 1. The whole application ships on 10 October

An earlier draft of this plan deferred every judging screen until after the event, on the assumption that judging happened later. **That was wrong.** Judges begin reviewing on event day, as soon as participants finish, in order to finalise the winners. Super admin, participants and judges all need a working application on 10 October.

This removes the deferral that made a 14-day plan comfortable. **Scope grew by roughly four days; the calendar did not.** Three things absorb it, and none of them is "test less on the participant path".

### 1.1 Absorbing the growth

**(a) Build the read-only renderers alongside the write ones.** A judge reviewing Challenge 1 is looking at exactly the data a participant wrote. If the drawer component is built on Day 6 with a `readOnly` mode, and the PDF viewer and GitHub link on Day 7 the same way, the judge's review page on Day 9 becomes assembly rather than new construction. The submission table is likewise **one component** serving both the admin and judge views with different permissions. *Saves ~1.5 days, and only works if it is decided now — retrofitting it later costs more than it saves.*

**(b) Defer the judging features that are not needed to pick a winner.** See §5.

**(c) Split the freeze in two.** See §1.2.

### 1.2 Two freeze dates, because the two paths carry different risk

| | Participant path | Judge path |
|---|---|---|
| Concurrency | ~1000 simultaneous | ~10–30 |
| Duration | One irreversible 3-hour run | Rolling, resumable |
| Starts | ~10:00 on event day | ~13:00, after submissions close |
| Cost of a bug | **Unrecoverable.** Lost work, public failure | Recoverable. Judge refreshes; I hotfix live |
| **Freeze** | **Wed 7 Oct — unmoved** | **Fri 9 Oct evening** |

This is the honest way to fit the extra scope. The participant run is the part that cannot be repaired while it is happening, so its freeze, load test and rehearsal are untouched. The judge path is low-concurrency, starts three hours later, and tolerates a same-day fix — so it can take the compression.

**What this is not:** an excuse to ship the judge path untested. It is covered by the Day 13 security pass and the Day 13 rehearsal; it simply does not need the 1200-user load test, and it can accept a Friday-evening freeze.

---

## 2. Stack — one person, zero ops, unknown deployment target

The constraints changed, so the stack changed with them. The original plan's separate NestJS API bought a cleaner security boundary and independent scaling; with a solo developer and 14 days, two deployables and a CORS boundary are pure cost. Reversed.

| Layer | Choice | Why this, now |
|---|---|---|
| **Framework** | **Next.js 15 (App Router), TypeScript**, `output: 'standalone'` | One codebase, one deploy, one pipeline. Standalone output runs on **any** Node host — see §2.1 |
| **UI** | Tailwind v4 + **shadcn/ui** + **Framer Motion** | Fastest route to a product that does not look ordinary |
| **Database** | **PostgreSQL 16**, reached only through `DATABASE_URL` | Neon free tier for development today; whatever IT provides in production. No code change either way |
| **ORM** | **Prisma** | Type-safe, migrations, schema doubles as documentation |
| **Auth** | **Custom session: JWT in an httpOnly, SameSite=Strict cookie** (`jose`) | Login by email *or* CNIC *or* phone with role and status gating is awkward in Auth.js. ~150 lines, easier to reason about |
| **Passwords** | **`@node-rs/argon2`** | Argon2id with prebuilt binaries. Plain `argon2` needs native compilation and fails on several hosts |
| **File storage** | **`StorageAdapter` interface** — local-disk, S3, Azure Blob | ~120 lines that make the PDF storage decision reversible |
| **Rate limiting** | Postgres-backed, optional Redis driver | No Redis server required |
| **Testing** | **Playwright** | Plays to your strengths. Critical-path suite, run before every deploy |
| **Load testing** | **k6** | 1200 virtual users on **production infrastructure** |
| **Email** | **None** | Admin-managed password reset removed the need |

### 2.1 Deployment portability

The 10Pearls IT team will decide where this runs and we do not yet know the answer. Building against Vercel-specific services and then being told "deploy to Azure" on 5 October would be a disaster, so the app is host-agnostic from day one: no platform-only APIs, `output: 'standalone'` producing a plain Node server, everything external in environment variables (`DATABASE_URL`, `STORAGE_DRIVER`, `SESSION_SECRET`, `CNIC_PEPPER`), storage behind an interface, and a Dockerfile in the repo. **Cost: about half a day.** Cheapest insurance on the project.

---

## 3. Locked decisions

| Ref | Decision | Locked as |
|---|---|---|
| **D1** | Timer hits zero | **Hard auto-submit.** Warnings at 30 / 10 / 5 / 1 minutes with escalating colour. Enforced server-side even with every browser closed |
| **D3** | Judge collisions | **Changed — see §3.2.** Auto-assignment on submit, with claim/lock as backstop |
| **D2** | Scoring scale | **No longer deferrable — see §3.3.** Needed by **2 Oct** |
| **Password reset** | Super-admin managed | Temporary password shown on screen once; forced change at next login. **No email service anywhere** |
| **D5** | CNIC format | **13 digits, no dashes** (`4210112345678`). Input normalised by stripping non-digits. Phone in E.164 |
| **D10** | CNIC as PII | Encrypted at rest — **with the caveat in §3.1** |
| **Branding** | Original identity | The Aurora palette in `DESIGN_LANGUAGE.md`, pending your approval |

### 3.1 Encrypting the CNIC — a correction

Encrypting it naively **breaks login-by-CNIC and duplicate detection**, because a randomly-encrypted column cannot be indexed or equality-matched. Two columns:

- `id_card_hash` — deterministic **HMAC-SHA256** with a server-side pepper, unique-indexed. Login and duplicate detection match on this.
- `id_card_encrypted` — **AES-256-GCM**, decrypted only where a screen must show the number.

### 3.2 D3 changed: auto-assignment beats claim/lock now that judging is same-day

Claim/lock was the right answer when judging was unhurried. Under same-day time pressure it is the wrong shape: judges browse a shared list, collide, and waste minutes deciding what to pick up.

**New approach:** when a participant submits, the submission is **auto-assigned to the judge with the fewest pending reviews** (~20 lines). Each judge opens the app and sees *their own queue*, already balanced, with nothing to choose. Claim/lock remains underneath as a backstop, and the super admin can reassign. Better throughput, better UX under pressure, and no more code than the original.

### 3.3 The scoring scale is now urgent

"Define the scale later" worked when judging happened the following week. With scoring and winner selection on the same day, **the maximum score per challenge and the +5 Challenge 2 bonus are needed by 2 October** — they are built on Day 10. The values stay in configuration rows rather than hardcoded, so a late change is cheap, but the numbers have to exist before that day.

### 3.4 An operational problem worth raising early

If all ~1000 participants submit and every submission is reviewed across three challenges on the same afternoon, that is a very large amount of judging. With 20 judges it is 50 submissions each; at five minutes apiece that is over four hours *after* a three-hour event. **Please sanity-check this before event day.** If it does not fit, the options are more judges, a shortlist (e.g. judges score Challenge 1 for everyone, and only the top N proceed to full review), or accepting that winners are announced later. This is an event-design decision rather than a software one, but the software should match whichever you choose — and knowing by **2 October** lets me build for it.

---

## 4. Day-by-day schedule — 14 working days

| # | Date | Work | Milestone |
|---|---|---|---|
| 1 | **Tue 22 Sep** | **Foundations.** Repo scaffold, Neon dev database, Prisma schema v1, design tokens, storage adapter, Dockerfile, CI | Skeleton running |
| 2 | Wed 23 Sep | **Auth I.** Participant and judge signup, CNIC/phone normalisation, HMAC + AES for CNIC, duplicate detection, Argon2id | Accounts can be created |
| 3 | Thu 24 Sep | **Auth II.** Login by email/CNIC/phone, sessions, RBAC, forced password change, seeded super admin, rate limiting | All three roles log in |
| 4 | Fri 25 Sep | **Admin.** Participants list, add / block / unblock / remove / reset password. Judge approval queue. Audit log | You can run the roster |
| 5 | Mon 28 Sep | **Runtime I.** Information page, idempotent attempt start, server-authoritative timer, sticky header, three challenge tabs | The clock runs and cannot be cheated |
| 6 | Tue 29 Sep | **Runtime II.** Challenge 1 drawers, add / edit / delete / reorder, debounced autosave — **plus the read-only renderer** | Largest screen done, judge view free |
| 7 | Wed 30 Sep | **Runtime III.** Challenge 2 PDF upload **and inline viewer**, Challenge 3 GitHub link **and link-out view** | All three submissions work both ways |
| 8 | Thu 1 Oct | **Runtime IV.** Confirmation modal, transactional final submit, account lock, forced logout, auto-submit at expiry, cross-tab sync, **auto-assignment to judges** | **Full participant run works end to end** |
| 9 | Fri 2 Oct | **Judging I.** Submission table (shared admin/judge) with score sorting and filters, judge queue, review page with three sub-tabs | Judges can see and open work |
| 10 | Mon 5 Oct | **Judging II.** Per-task score save, live total banner, Submit Final Score with lock, super-admin unlock, results view | **Winners can be determined** |
| 11 | Tue 6 Oct | **Polish.** Visual design pass, animations, responsive, accessibility, micro-copy, error states — both surfaces | It stops looking like an internal tool |
| 12 | **Wed 7 Oct** | **Load test + security pass.** k6 at 1200 users; IDOR, timer tampering, double-submit race, upload validation, rate limits. **PARTICIPANT PATH FREEZE** | Proven at scale and against attack |
| 13 | Thu 8 Oct | **Production deploy**, backups verified by an actual restore, run-book, **dress rehearsal with 20–30 testers** — participants *and* judges | Real-world proof |
| 14 | Fri 9 Oct | Fix **only** what the rehearsal found. **JUDGE PATH FREEZE** at end of day | Ready |
| — | **Sat 10 Oct** | **EVENT.** Participants ~10:00, judging from ~13:00. Monitoring, on-call, admin console staffed | |

### 4.1 The compromise, stated plainly

**Day 12 merges the load test and the security pass into one day.** In the previous plan they were separate. This is the single place where the extra judging scope was paid for out of testing, and it is the weakest point in the schedule.

**What getting the weekends back (26–27 Sep, 3–4 Oct) would buy** — in priority order:
1. Separate the load test and security pass again *(this is the one that matters)*
2. Restore the second polish day
3. A second dress rehearsal, so the 8th is not the only one
4. Build the deferred judging features in §5 rather than deferring them

If any weekend time becomes available, that is where it goes.

### 4.2 The dates that must not move

1. **Wed 7 Oct — participant path freeze.** Anything not done is cut.
2. **Thu 8 Oct — dress rehearsal.** A system that has never carried real users is unproven.
3. **Fri 9 Oct — fixes only.** A feature added the day before an event is how events fail.

---

## 5. Scope — the definition of done

**In, for 10 October:**
- Participant signup and login (email / CNIC / phone); judge signup, admin approval, judge login
- Super admin: approve judges, add / block / remove participants, reset passwords, audit log
- Information page with the begin button, correctly hidden when opened mid-test
- Server-authoritative 3-hour timer with escalating warnings
- Challenge 1 drawers with autosave; Challenge 2 PDF upload; Challenge 3 GitHub link
- Final submit: confirmation modal, transactional seal, forced logout, account lock; auto-submit at expiry
- Submission details table for judges and admin, with score sorting
- Judge review page: three sub-tabs, per-task score save, live total, Submit Final Score with lock
- Auto-assignment of submissions to judges; super-admin unlock
- Results view sufficient to determine winners
- Backups with a rehearsed restore

**Deferred past the event — not needed to pick a winner:**
- CSV/XLSX score export *(a sorted results table is enough on the day)*
- Analytics dashboard and charts
- Audit **log viewer UI** — rows are still written, just queried directly if needed
- Bulk participant import — add it when you have the list
- Judge email verification — unnecessary, the super admin approves every judge
- Scoring rubric — free-form numeric scores with server-side max validation on the day

---

## 6. Risks

**R0 — The deployment target is unknown.** *Top risk.* The Day 12 load test and Day 13 rehearsal are worthless if they run somewhere other than where the event runs. **Mitigation:** §2.1 portability, plus IT's answer by **Friday 25 September** — a week is the minimum to get TLS, backups and access sorted before Day 12.

**R1 — Database connections under load.** 1000 concurrent users will exhaust a direct Postgres pool. **Mitigation:** a **pooled** connection string from day one, a single Prisma client with an explicit pool cap, verified under k6. A one-line configuration mistake that takes the whole event down.

**R1b — Database region.** *Found on Day 1.* The development database is on Neon in **AWS us-east-2 (Ohio)**, and a single round trip from Pakistan measures **~205–280 ms**. That is tolerable for development and unacceptable in production: one page render makes several queries, so the latency multiplies, and every query holds a pool connection for its whole duration — which shrinks effective pool capacity by roughly the same factor. The rule is that **the database must sit in the same region as the application server**, and the application should sit near the participants. Latency between a user and the app costs one round trip; latency between the app and the database costs one per query.

**Mitigation:** once IT answers R0, recreate the Neon project in the matching region. A Neon project cannot be moved between regions — it has to be recreated — so this is a two-minute job **now, while the database holds nothing but a seeded admin**, and a painful one after 1000 people have registered. Do it before participant registration opens.

**R2 — Judging capacity on the day (§3.4).** The software may work perfectly and the winners still not be decided in time. **Mitigation:** confirm the judging model by 2 Oct.

**R3 — You are a single point of failure.** **Mitigation:** the Day 13 run-book is not optional, and a second person must be walked through the admin console before the 8th.

**R4 — Password resets with no email.** Expect dozens at 10:05 AM. **Mitigation:** two-click admin reset, and **2–3 people staffing the admin console** on the day.

**R5 — Work lost mid-attempt.** **Mitigation:** debounced autosave, server-side state, offline retry queue. Verified in the rehearsal by killing a browser mid-run.

**R6 — 1000 QA engineers attacking the portal.** **Mitigation:** Day 12 exists for this. Server-authoritative everything.

**R7 — The application under test (Q8) is not ready.** Challenge 1 is unusable without it, and it must survive 1000 users. **Mitigation:** needed by **2 Oct** for the information page.

**R8 — Scope creep.** At 14 days, one new requirement now displaces testing directly. **Mitigation:** §5 is the contract.

---

## 7. What I need from you

**By Friday 25 September — hard:**

| # | Needed | Why |
|---|---|---|
| Q5 | **Deployment target from 10Pearls IT** — cloud or on-prem, which provider, what Postgres, what object storage, who does TLS and backups | R0 |
| — | Approval of the Aurora palette in `DESIGN_LANGUAGE.md` | Sets design tokens before the polish day |

**By Thursday 2 October:**

| # | Needed |
|---|---|
| Q7 | **Score scale per challenge and the +5 bonus** — now on the critical path (§3.3) |
| Q9 | **How many judges**, and whether all submissions get full review or only a shortlist (§3.4) |
| Q8 | The buggy e-commerce application link and the Challenge 3 CSV, plus who hosts them |
| Q13 | Mask the CNIC from judges (`42101*****678`), or show it in full? |
| Q6 | Laptops only, or must the challenge work on mobile? |
| — | Who is the second person trained on the admin console, and who staffs it on the day |
| — | 20–30 volunteers named for the 8 October rehearsal |

**Any time:**

| # | Needed |
|---|---|
| Q12 | Do participants see their scores after the event? |
| — | Whether any weekend time can be freed (§4.1) |

---

## 8. Recommendation

Start Day 1 **today**. The judging scope has consumed the last of the slack, and every day spent deciding now comes directly out of the load test or the rehearsal.

Two things to chase in parallel, neither of which blocks today's scaffold: **IT's deployment target** by Friday, and **the judging model** (§3.4) by 2 October — the second determines whether picking winners on the day is physically possible, regardless of how well the software works.
