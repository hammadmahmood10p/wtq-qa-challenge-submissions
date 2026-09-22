# WTQ 2026 — QA Challenge Submission Portal
## Architecture, Technology Stack & Phased Delivery Plan

**Status:** ⚠️ **PARTIALLY SUPERSEDED by [`DELIVERY_PLAN.md`](./DELIVERY_PLAN.md)**
**Date:** 2026-09-22

> **Read this first.** This document was written before the event date (10 Oct 2026, 17 days away) and the team size (one person) were known. Its **stack recommendation (§2)** and **phase plan (§6)** are obsolete — `DELIVERY_PLAN.md` replaces them.
>
> Still current and authoritative: **§3 architectural rules**, **§4 data model**, **§5 requirement decisions D1–D13**, **§8 risk register**.

---

## 1. Executive summary

We are building a time-boxed, high-concurrency assessment platform for **1000+ registered participants**, a panel of judges, and a super admin, for a single-day event with a **3-hour hard clock** per participant.

Three characteristics dominate every design decision:

1. **It is an exam, not a CRUD app.** The clock, the one-shot final submission, and the score lock are *integrity* features. Anything enforced only in the browser will be defeated.
2. **The users are professional QA testers.** 1000 people whose entire skill set is finding defects will be hitting this portal for three hours. Every validation gap, IDOR, race condition and unhandled error state we leave open *will* be found — and probably reported to us mid-event.
3. **There is no second chance.** A crash at hour two destroys 1000 people's work and the event's reputation. Draft autosave, server-authoritative state and a rehearsed rollback plan are not polish — they are early-phase concerns.

The plan below is deliberately sequenced so that the **participant experience (the irreversible part) is built, hardened and load-tested first**, and the judge experience — which happens *after* the event, with far fewer users and no time pressure — comes second.

---

## 2. Recommended technology stack

### 2.1 Summary

| Layer | Recommendation | Why |
|---|---|---|
| Language | **TypeScript** end to end | One language, shared validation schemas and types between API and UI — eliminates a whole class of contract bugs |
| Frontend | **React 19 + Vite** | Fastest dev loop, smallest ops burden, large hiring pool |
| Routing / data | **React Router** + **TanStack Query** | Query gives us caching, retry-on-network-blip and background refetch for free — important on flaky event Wi-Fi |
| Styling | **Tailwind CSS v4** + **shadcn/ui** | Fully custom look without writing a design system from scratch; we own the component code, so theming is unconstrained |
| Animation | **Framer Motion** for page/element transitions, CSS for micro-interactions | Declarative, respects `prefers-reduced-motion`, no jank |
| Forms | **React Hook Form** + **Zod** | Zod schemas are shared with the backend — one source of truth for every validation rule |
| Backend | **NestJS** on Node 22 LTS | Opinionated modular structure: guards for RBAC, interceptors for audit logging, DI for testability. Pays for itself the moment more than one developer touches the codebase |
| ORM | **Prisma** | Type-safe queries, first-class migrations, readable schema file that doubles as documentation |
| Database | **PostgreSQL 16** | As requested. Strong constraints, transactional integrity, JSONB where we want flexibility |
| Auth | **JWT access token + rotating refresh token in httpOnly, SameSite=Strict cookies** | Immune to XSS token theft; refresh rotation gives us instant revocation when an admin blocks a user |
| Passwords | **Argon2id** (fallback bcrypt cost 12) | Current OWASP recommendation |
| File storage | **S3-compatible object storage** (AWS S3 / Azure Blob / MinIO) | Never store PDFs in Postgres or on the app disk — it breaks horizontal scaling and backups |
| Cache / rate limit | **Redis** | Rate limiting, refresh-token denylist, distributed lock for judge claim |
| Runtime infra | **Docker + Docker Compose** for dev; managed Postgres + container host for prod | Reproducible environments; "works on my machine" is not acceptable on event day |
| Monorepo | **pnpm workspaces** — `apps/api`, `apps/web`, `packages/shared` | Shared Zod schemas, enums and DTOs live in `packages/shared` |
| Testing | Vitest (unit), Supertest (API), Playwright (E2E) | Playwright covers the critical path: signup → login → timer → submit → lock |
| Observability | Pino structured logs + Sentry + health endpoints | On event day we need to know something is wrong before participants tell us |

### 2.2 Alternatives considered and rejected

- **Next.js full-stack** — Attractive (one deploy, SSR), but blurring API and UI makes the *security boundary* harder to reason about, and this app is security-sensitive. A separate API also lets us scale the API tier independently during the 3-hour spike. Rejected, but worth revisiting if the team prefers a single deployable.
- **.NET 8 / ASP.NET Core Web API** — Excellent, and if the 10Pearls team's depth is strongest in C#, this is a *better* choice than NestJS regardless of architectural preference. Team skill beats architect preference here — please confirm which way to go (**Q1**).
- **Firebase / Supabase as the entire backend** — Fastest to build, but the scoring lock, judge claim and audit trail need real server-side business rules. Supabase remains a strong option as *managed Postgres + storage* while we keep our own API.
- **MongoDB** — Rejected. Relational integrity (a score must belong to a real submission by a real participant) is exactly what we need.

### 2.3 Local environment note

The dev machine currently has Node 24 and pnpm, but **no Docker and no PostgreSQL**. Before Phase 0 we need either Docker Desktop installed — preferred, since it gives Postgres + Redis + MinIO in one command — or a managed Postgres instance (Neon / Supabase / Azure Database for PostgreSQL) for development.

---

## 3. High-level architecture

```
                        ┌─────────────────────────────────┐
  Participants ─┐       │   CDN / static host             │
  Judges ───────┼──────▶│   React SPA (Vite build)        │
  Super Admin ──┘       └───────────────┬─────────────────┘
                                        │ HTTPS, httpOnly cookies
                                        ▼
                        ┌─────────────────────────────────┐
                        │   NestJS API (2+ instances)     │
                        │  ┌───────────────────────────┐  │
                        │  │ Auth & RBAC guards        │  │
                        │  │ Attempt / timer service   │  │ ← server-authoritative clock
                        │  │ Submission service        │  │
                        │  │ Evaluation & score lock   │  │
                        │  │ Audit interceptor         │  │
                        │  └───────────────────────────┘  │
                        └──┬──────────┬──────────┬────────┘
                           ▼          ▼          ▼
                    ┌──────────┐ ┌────────┐ ┌──────────────┐
                    │ Postgres │ │ Redis  │ │ Object store │
                    │    16    │ │ locks, │ │ PDFs (signed │
                    │          │ │ limits │ │  URLs only)  │
                    └──────────┘ └────────┘ └──────────────┘
```

### 3.1 Non-negotiable architectural rules

1. **The clock lives on the server.** The browser renders a countdown derived from `attempt.ends_at` plus a measured client/server offset. Every write endpoint independently re-checks `now() < attempt.ends_at`. Editing system time, pausing JS, or closing the laptop changes nothing.
2. **Every state transition is a server-side guard, not a disabled button.** "Submit Final Score" being greyed out is a *hint*; the API rejects the call if all three task scores have not been saved.
3. **Files are never served from the API by path.** Uploads get an opaque UUID key; downloads go through a short-lived signed URL scoped to the requesting role.
4. **Everything that matters is audited.** Who logged in, who blocked whom, who scored what, who unlocked a submission — append-only `audit_log`, immutable, queryable by the super admin.
5. **Drafts autosave continuously.** Bug reports, test cases, PDF uploads and GitHub links are persisted as *drafts* the moment they are saved, independent of the final submit. A browser crash at 2h59m must cost the participant nothing.

---

## 4. Data model (first cut)

```
users
  id (uuid pk) · role (SUPER_ADMIN|JUDGE|PARTICIPANT) · email (citext, unique)
  full_name · password_hash · status (PENDING_APPROVAL|ACTIVE|BLOCKED|SUBMITTED_LOCKED|REMOVED)
  created_at · last_login_at · created_by (uuid, null unless an admin added the account)

participant_profiles
  user_id (pk, fk users) · id_card_number (unique, normalised) · phone (unique, E.164)
  location (KARACHI|LAHORE|ISLAMABAD)

judge_profiles
  user_id (pk, fk users) · approved_by · approved_at

attempts                                  -- one participant's 3-hour run
  id · participant_id (unique fk) · started_at · ends_at · duration_minutes
  state (NOT_STARTED|IN_PROGRESS|SUBMITTED|EXPIRED) · submitted_at · auto_submitted (bool)

challenge1_items                          -- bug reports AND test cases, one table
  id · attempt_id · kind (BUG_REPORT|TEST_CASE) · title · description
  position (int) · created_at · updated_at

challenge2_submission
  attempt_id (pk) · file_key · original_filename · size_bytes · content_type · uploaded_at

challenge3_submission
  attempt_id (pk) · github_url · verified_public (bool) · saved_at

evaluations                               -- one judge's review of one attempt
  id · attempt_id · judge_id · claimed_at
  score_c1 · score_c1_saved_at
  score_c2 · score_c2_bonus · score_c2_saved_at
  score_c3 · score_c3_saved_at
  total_score (generated) · status (IN_PROGRESS|SUBMITTED) · submitted_at
  UNIQUE (attempt_id)                     -- see decision D3

evaluation_unlocks
  id · evaluation_id · unlocked_by (super admin) · reason · unlocked_at

audit_log
  id · actor_id · actor_role · action · entity_type · entity_id
  metadata (jsonb) · ip · user_agent · created_at
```

**Constraints to enforce in the database, not just in code:** unique `email`, unique `id_card_number`, unique `phone`, `UNIQUE(attempt_id)` on evaluations, `CHECK` constraints on score ranges, and a partial index for fast "not reviewed" filtering.

---

## 5. Requirement decisions, gaps and recommendations

These are places where the brief is silent, or where I would push back. **Each one needs your call before the phase that implements it.**

### D1 — What happens when the 3-hour timer hits zero?
The brief does not say. Three options:
- **(a) Hard auto-submit** — everything saved so far is submitted, participant is locked out. *Recommended.* Fairest and simplest to explain.
- (b) Read-only grace — work freezes, participant sees a summary and must click submit.
- (c) Soft warning only — unfair to those who submit on time.

**Recommendation: (a)**, with visible warnings at 30 / 10 / 5 / 1 minutes remaining and a colour shift on the timer.

### D2 — The scoring scale is undefined
We need the maximum score per challenge (e.g. C1 = 50, C2 = 30, C3 = 20?) and confirmation that the **+5 bonus for Challenge 2** is a separate additive field. Without this we cannot validate score input or build a leaderboard. Related: is scoring free-form numeric, or do we want a **rubric** — a few weighted criteria per challenge — so scores are consistent across judges? A rubric adds roughly 3 dev-days and materially improves fairness with a large judging panel.

### D3 — "When any judge reviewed it, status becomes Reviewed" needs a claim model
With 1000 submissions and a panel of judges, two judges *will* open the same submission simultaneously and enter different scores. The brief implies one review per submission. Options:
- **(a) Claim/lock** — a judge opens a submission and it is claimed by them; others see "Being reviewed by X". The claim expires after inactivity. *Recommended — smallest change to your stated requirement.*
- (b) Admin assignment — the super admin assigns buckets of participants to judges up front. Best for balanced workload; needs an assignment UI.
- (c) Multi-judge averaging — two judges per submission, score averaged. Highest fairness, doubles judging effort.

**Recommendation: (a) now, with (b) as a later enhancement** if the panel is large.

### D4 — Judge signup only checks the email domain
Anyone who can receive `@10pearls.com` mail — or who simply *types* such an address — creates a pending judge account. Super admin approval is the real gate, which is acceptable, but I recommend adding **email verification via one-time code** so the approval queue is not full of typos and impostors. Low cost, high value. Depends on an SMTP decision (**Q4**).

### D5 — Login by ID card / phone / email needs normalisation rules
`42101-1234567-8`, `4210112345678` and `42101 1234567 8` must resolve to the *same* identity, or duplicate accounts slip through and logins fail confusingly. The same applies to phone: `0300-1234567`, `+923001234567`, `923001234567`. **Recommendation:** store a normalised form — digits only for CNIC, E.164 for phone — in a unique column, match on that, and display the formatted original. We also need to confirm the CNIC format rule: is it always 13 digits?

### D6 — Participant is "inactivated and cannot log in again" after submitting
Implemented as `status = SUBMITTED_LOCKED`. But we should confirm: after the event, do participants get to **see their submission or score**? If so, that is a read-only post-event mode rather than a permanent lockout — a small change now, and much harder to retrofit once accounts are dead. **Recommendation:** lock them out during the event, and keep the option of an admin-flipped "results published" read-only view.

### D7 — Blocking a participant mid-test
If the super admin blocks someone at 1h30m, what happens to their in-flight attempt and their work? **Recommendation:** the session is revoked immediately via the refresh-token denylist, the attempt is frozen in place, and the work is preserved and visible to judges and admin. This must be deliberate, not accidental.

### D8 — "Add Bug Report" with no limits
1000 participants times unlimited free-text drawers is a real payload-size and abuse surface. **Recommendation:** a soft cap (e.g. 50 bug reports and 50 test cases per participant), title ≤ 200 characters, description ≤ 5000 characters, enforced server-side with a friendly message. Please confirm the numbers.

### D9 — PDF upload constraints
We need: maximum size (**recommend 20 MB**), one file or several (the brief implies one — please confirm), replace-on-reupload behaviour, and MIME *and* magic-byte validation, since checking the extension alone is trivially bypassed and this audience will try. Virus scanning if 10Pearls policy requires it.

### D10 — GitHub link validation
The brief requires a public repository whose name contains `wtq26`. We can validate the format client-side and **verify the repository is actually public and reachable** via an unauthenticated GitHub API call at save time, showing a warning rather than a hard block — GitHub rate limits and outages should not cost a participant their submission.

### D11 — The application under test and the Challenge 3 CSV
Challenge 1 needs an `<Application Link>`, and Challenge 3 needs a downloadable CSV of roughly 20 test cases. Who provides these, and are they hosted by us or externally? They need to survive 1000 concurrent users too — if the buggy e-commerce app falls over at 10:00 AM, the whole challenge stalls.

### D12 — Super admin account creation
This is not a signup flow. It is seeded via migration or CLI with a forced password change on first login, and ideally 2FA. Please confirm how many super admins there will be.

### D13 — Multiple tabs
The brief opens challenge submission pages in new browser tabs. That is fine, but the timer must stay consistent across tabs — each tab derives from the same server `ends_at` — and the "everything is submitted" event must propagate to all open tabs immediately, via BroadcastChannel with server rejection as the backstop.

---

## 6. Phased delivery plan

Estimates assume **2 full-stack developers and 1 QA**, and are in *working days*. They exclude your review cycles.

---

### Phase 0 — Foundations *(3–4 days)*

**Goal:** an empty but production-shaped skeleton that deploys.

- pnpm monorepo: `apps/api`, `apps/web`, `packages/shared`
- Docker Compose: Postgres 16, Redis, MinIO
- Prisma schema v1, first migration, seed script (super admin, sample users)
- NestJS skeleton: config module, health check, Pino logging, global validation pipe, standard error envelope
- React + Vite + Tailwind + shadcn/ui skeleton, plus **design tokens: palette, typography scale, spacing, motion durations, dark mode**
- ESLint/Prettier, Husky pre-commit, GitHub Actions CI (lint, typecheck, test, build)
- Deploy the empty app to a staging environment **on day one** — first deployment should never be left to the end

**Exit criteria:** `pnpm dev` brings up the whole stack locally, the staging URL is live, CI is green.

---

### Phase 1 — Identity & Access *(5–6 days)*

**Goal:** all three roles can be created and can log in, securely.

- Signup: role chooser, then the participant form (CNIC, name, email, phone, location radios, password twice) and the judge form (`@10pearls.com` enforced server-side, name, password twice)
- Normalisation and uniqueness for email / CNIC / phone (D5); duplicate detection returns a clear, non-enumerating message
- Password policy, Argon2id hashing, strength meter in the UI
- Login by **email, CNIC or phone** plus password, through a single "Username" field
- JWT access token plus rotating refresh token in httpOnly cookies; logout; refresh denylist in Redis
- RBAC guards on the API, route protection in the SPA
- Judge accounts land in `PENDING_APPROVAL` and are refused login with an explanatory message
- Rate limiting on auth endpoints, per IP and per account, with generic failure messages
- Seeded super admin with forced password change
- Optional, per D4: email verification code

**Exit criteria:** Playwright E2E covers signup → login → role-correct landing page for all three roles; a security review of the auth module passes.

---

### Phase 2 — Super Admin Console *(5–6 days)*

**Goal:** the event team can run the roster.

- Admin shell: sidebar navigation, page transitions, breadcrumbs
- **Manage Participants** — searchable, filterable (location, status), paginated table; add / block / unblock / remove as a soft delete; CSV export; **bulk import of the 1000 pre-registered participants** (strongly recommended — see **Q3**)
- **Manage Judges** — approval queue with approve and reject, plus add / block / remove
- Audit log viewer with filters
- Dashboard tiles: registrations by city, attempts in progress, submissions received, reviews completed

**Exit criteria:** an admin can take a judge from signup to approved-and-logged-in, and can block a participant whose session then dies instantly.

---

### Phase 3 — Participant Challenge Runtime *(10–12 days)* ⚠️ **highest risk**

**Goal:** the irreversible, time-boxed participant journey. This phase gets the most QA attention.

- **Information page** — the full briefing, well typeset. The "Let's begin with the challenge" button renders **only** when the attempt has not started, so the same page opened in a second tab during the test shows the information without the button. Server-driven, not a URL flag.
- **Attempt start** — the server creates the `attempt` with `started_at` and `ends_at`, idempotently: a double-click or a refresh cannot restart or extend the clock
- **Sticky header** — HH:MM:SS countdown with server offset correction and periodic drift re-sync, escalating visual states, and the always-active **Submit** button
- **Three challenge tabs** with rewritten, well-structured briefs for Challenges 1, 2 and 3
- **Challenge 1 page (new tab)** — Bug Reports and Test Cases sections; "Add Bug Report" and "Add Another Bug Report" spawning animated expand/collapse drawers with Title and Description plus a Save button; the same pattern for Test Cases; delete and reorder; **debounced autosave with a visible Saved / Saving… indicator**; limits per D8
- **Challenge 2 page (new tab)** — PDF upload with drag-and-drop, progress bar, type/size/magic-byte validation, replace, and Save
- **Challenge 3 page (new tab)** — GitHub URL field with `wtq26` format validation and a reachability check, and Save
- **Final submit** — the confirmation modal exactly as specified, then: attempt sealed, all writes rejected, sessions revoked, account set to `SUBMITTED_LOCKED`, forced logout, and a friendly terminal thank-you page. Fully transactional.
- **Timer expiry** per D1, enforced server-side even if every browser is closed
- Cross-tab state sync (D13), and "you have an attempt in progress" recovery on reconnect
- Offline / connection-loss banner with a retry queue for autosave

**Exit criteria:** load test at **1200 concurrent participants** starting within a 10-minute window; killing the browser at 2h55m loses nothing; verified impossible to extend the clock, submit twice, or write after submit.

---

### Phase 4 — Judge Evaluation & Scoring *(7–8 days)*

**Goal:** judges can score every submission accurately and without collisions.

- **Participants Submission Details** table — a shared component also used by the admin: ID card number, full name, location, submission link, review status, score, judge name. **Sortable Score column**, server-side pagination, search, and filters by status, location and judge.
- The submission link opens that participant's full submission in a new tab
- **Review page:** total score banner at the top, starting at 0 and summing live, with three sub-tabs
  - Task 1 — bug reports and test cases rendered read-only and readable, plus Score and **Save**
  - Task 2 — a **View File** button opening the PDF inline in the browser via a signed URL, with no download, plus Score and **Save**
  - Task 3 — the GitHub link opening in a new tab, plus Score and **Save**
- **Submit Final Score** enabled only when all three are saved, enforced server-side. On submit the evaluation is locked, review status flips to Reviewed, and the judge name is recorded.
- Claim/lock model per D3
- **Super admin unlock** with a mandatory reason, fully audited; unlocked evaluations are flagged in the UI
- Admin view of the same table, plus score export (CSV/XLSX) and a leaderboard

**Exit criteria:** two judges cannot double-score one submission; a locked evaluation cannot be modified without an audited admin unlock.

---

### Phase 5 — Experience & Visual Polish *(5–6 days)*

**Goal:** it should look like a flagship event product, not an internal tool.

- Full design pass: cohesive palette, depth and gradients, illustrated empty states, custom event branding
- Motion: page transitions, drawer expand/collapse, tab crossfades, timer pulse, confetti on successful submission, skeleton loaders — all honouring `prefers-reduced-motion`
- Responsive down to tablet; decide the mobile policy (**Q6**)
- Accessibility: keyboard navigation, focus management for drawers and modals, ARIA labels, contrast at WCAG AA or better, screen-reader announcement of the timer at intervals
- Micro-copy and error-message review — every failure state says what happened and what to do next
- Lighthouse ≥ 90, bundle budget, code splitting

---

### Phase 6 — Hardening & Load *(5–6 days)*

- Load test with k6 or Artillery: 1200 concurrent attempts, login spike, upload storm
- Penetration pass against our own app: IDOR on attempt and submission IDs, timer tampering, race on final submit, upload abuse, mass assignment, rate-limit bypass, JWT handling
- Database tuning: indexes, connection pooling via PgBouncer, slow-query review
- Backups: automated Postgres backups plus a **restore rehearsal**, and object-store versioning
- Full E2E regression suite in CI
- Sentry alerting, dashboards, health and readiness endpoints

---

### Phase 7 — Event Readiness *(3–4 days)*

- Production deployment, DNS, TLS, WAF
- **Full dress rehearsal with 30–50 real testers** on production infrastructure, end to end, timer and all
- Run-book: how to extend a timer in an emergency, unblock a stuck participant, restore a lost submission, roll back
- Support channel and on-call rota for event day
- Pre-loaded participant roster, seeded judges, verified Challenge 1 application link and Challenge 3 CSV

---

### 6.1 Timeline summary

| Phase | Days | Cumulative |
|---|---|---|
| 0 — Foundations | 3–4 | 4 |
| 1 — Identity & Access | 5–6 | 10 |
| 2 — Super Admin Console | 5–6 | 16 |
| 3 — Participant Runtime ⚠️ | 10–12 | 28 |
| 4 — Judge Evaluation | 7–8 | 36 |
| 5 — Experience & Polish | 5–6 | 42 |
| 6 — Hardening & Load | 5–6 | 48 |
| 7 — Event Readiness | 3–4 | **~52 working days (~10–11 weeks)** |

**If the event date is sooner than that**, the compression order is: merge Phase 5 into Phases 3 and 4 so polish happens as we build; cut the admin bulk-import and leaderboard to manual CSV; defer the rubric. **Do not compress Phases 6 and 7** — they are what stop the event from failing publicly.

Phases 2 and 4 can run in parallel with Phase 3 if we add a second frontend developer. Phase 3 is the critical path either way.

---

## 7. Open questions

| # | Question | Blocks |
|---|---|---|
| Q1 | **Backend stack: NestJS/TypeScript or .NET?** What is the team's actual strength? | Phase 0 |
| Q2 | **Event date**, and the expected peak concurrency window — do all 1000 start at once, or in city waves? | Whole plan |
| Q3 | Are the 1000 participants **already registered elsewhere**? If so we should bulk-import them, and possibly skip open signup entirely — far safer than letting 1000 people self-register with mistyped CNICs | Phases 1–2 |
| Q4 | Is email sending available (SendGrid / SES / SMTP)? Needed for verification, approval notices and password reset — **note that the brief has no password-reset flow at all, and with 1000 users we will need one** | Phase 1 |
| Q5 | Hosting target — AWS, Azure, or 10Pearls on-prem? This determines the object storage and managed Postgres choices | Phase 0 |
| Q6 | Will participants work on **laptops only**, or must the challenge run on mobile? What about judges? | Phase 5 |
| Q7 | **Score scale and rubric**, per D2 | Phase 4 |
| Q8 | Who supplies the **buggy e-commerce application** and the **Challenge 3 CSV**, and where are they hosted? | Phase 3 |
| Q9 | How many judges, and how many reviews per judge? This drives D3 | Phase 4 |
| Q10 | Any data-residency or privacy requirement for CNIC and phone numbers? CNIC is sensitive PII — I recommend encrypting it at rest and masking it in most UI views | Phase 1 |
| Q11 | Is there a branding kit — logo, colours, fonts — for Women Tech Quest? | Phase 5 |
| Q12 | Do participants see their scores after the event (D6)? | Phase 3 |

---

## 8. Top risks

| Risk | Impact | Mitigation |
|---|---|---|
| Work lost to a crash or network drop mid-attempt | Catastrophic | Continuous draft autosave, server-side state, offline queue, retry |
| Login stampede at T-0 | 1000 people locked out at the start | Load test, horizontal scaling, connection pooling, staggered start by city if needed |
| Participants (QA experts) breaking the portal | Reputational, mid-event chaos | Server-authoritative everything, a dedicated pen-test phase, a dress rehearsal |
| Two judges scoring the same submission | Disputed results | Claim/lock (D3) plus `UNIQUE(attempt_id)` |
| The application under test goes down | Challenge 1 unusable | Owner and capacity confirmed in advance (Q8); host it ourselves if possible |
| Scope creep beyond these requirements | Missed date | This document is the baseline; changes are assessed against the phase plan |

---

## 9. Recommended next steps

1. You review this document and answer **Q1–Q12** — Q1, Q2 and Q3 are the true blockers.
2. Confirm or amend decisions **D1–D13**.
3. I build a **clickable UI prototype of the participant runtime** — information page, timer, three challenge tabs, submit modal — before any backend code. It is the highest-risk, highest-visibility surface, and seeing it early is the cheapest way to catch a misunderstanding.
4. On approval, Phase 0 begins.
