# Pending items

Everything the build is waiting on, and everything deferred until after the event.
Reviewed at the Day 12 freeze; nothing here should reach 10 October unresolved unless
it is marked *post-event*.

**Last updated:** after the four-challenge change

---

## 1. Blocked on information from the organisers

| # | Needed | Where it plugs in | Consequence if it arrives late |
|---|---|---|---|
| ~~**P1**~~ | ~~The application under test~~ | Super Admin → Overview → Event configuration | **No longer blocking.** The URL is set from the admin console and reaches the briefing, Challenge 1 and Challenge 2 on the next page load — no redeploy, no restart. Still needs the actual address before the event |
| ~~**P2**~~ | ~~The Challenge 4 CSV~~ | Super Admin → Overview → Event configuration | **No longer blocking.** Uploaded from the admin console, stored in object storage and served through an authorised route. Replacing it takes effect at once. Still needs the actual file |
| **P3** | **Deployment target** from 10Pearls IT | Environment variables only — the app is host-agnostic by design (§2.1) | Gates the load test and the dress rehearsal, which are worthless run anywhere other than where the event runs. Also gates P4 |
| **P4** | **Database region**, once P3 is known | Recreate the Neon project in the matching region | Currently us-east-2 (Ohio), ~205–280ms per query from Pakistan. Two minutes now, painful once participants have registered. See R1b |
| ~~**P5**~~ | ~~Score scale~~ | `src/lib/scoring.ts` | **Closed.** The organisers supplied the full rubric: ten criteria across four challenges, plus a +5 bonus for choosing Challenge 3 that a judge may adjust to −5 |
| **P6** | **Judging model** — how many judges, and whether every submission gets a full review or only a shortlist | Assignment logic on Day 8 | An event-design decision. ~1000 submissions reviewed in one afternoon may not be physically possible; see §3.4 |
| **P7** | **Branding** — palette now aligned with the WTQ26 Learning Portal | `src/app/globals.css`, visible at `/design-preview` | Done. Indigo primary, lavender surfaces, deep-navy panels, with periwinkle/gold/green taken from the event mark |
| ~~**P8**~~ | ~~The official 10Pearls logo~~ | `public/10pearls-logo.webp`, used by `TenPearlsLogo` | **Closed.** The organisers supplied the official mark, replacing the type wordmark that stood in for it. Single colour on transparency, so dark mode inverts it rather than needing a second file. An SVG would still be preferable if one turns up |

---

## 2. Decisions still open

| # | Question | Default if unanswered |
|---|---|---|
| **Q6** | Laptops only, or must the challenge work on mobile? | Built for laptop; responsive down to tablet |
| **Q12** | Do participants see their scores after the event? | No. Accounts lock on submission; a read-only results mode would need to be added |
| **Q13** | Mask the CNIC from judges (`42101*****678`)? | `maskCnic()` exists and is unused. Currently judges would see it in full, per the brief |
| **D8 numbers** | Caps of 50 bug reports, 50 test cases, 200-character titles, 5000-character descriptions | As listed. Generous enough that nobody writing in good faith meets them |
| **Tabs** | The brief says clicking a challenge tab opens its submission page in a new browser tab. Taken literally that navigates away from the workspace and takes the clock with it | Tab shows the details; an explicit link opens the submission page in a new tab |
| **Reopen clock** | A reopened attempt gets a fresh window the admin types in, prefilled with what was left at submission. It does not resume a paused clock, because nothing pauses | Admin decides, 5–240 minutes. Sensible for a mis-submission and for a laptop that died, which need different amounts |
| **Taking over a claim** | Anyone may take an unassigned submission, for themselves or on a colleague's behalf, since the dropdown lists the whole panel. Once taken, only the judge holding it or a super admin may move it | A claim any passer-by could overwrite would not be worth showing. Say the word if you want judges able to take work off each other freely |
| **Results view** | Day 10 listed one. The Participants Submission Details table already is one: filter to Reviewed, pick a city, sort the Score column descending | No separate results page. Say the word if you want a dedicated ranked view — per city, top N, exportable — and it is a small page on top of the same query |
| **Reattempt keeps nothing** | Clearing an attempt for a fresh run deletes the first submission outright — one attempt row per participant, so there is nowhere to archive it | Confirmed by the organisers. If the old work ever needs keeping, that is a schema change to multiple attempts per participant |

---

## 3. Known technical debt

| # | Item | Why it is deferred |
|---|---|---|
| **T1** | `middleware.ts` uses a convention Next 16 deprecates in favour of `proxy` | Works, warns on dev start. A framework convention change is not worth the risk this close to the event |
| **T2** | Server action body limit raised to 25MB for Challenge 2 uploads | Fine functionally; the concurrency behaviour of large uploads is a Day 12 load-test question, not a correctness one |
| **T3** | GitHub reachability check is best-effort and unauthenticated | Rate limits and outages must never cost a participant their submission, so it warns rather than blocks |
| ~~**T4**~~ | ~~No offline retry queue for autosave~~ | **Closed on Day 11.** `src/lib/retry-save.ts`: a save that cannot reach the server is repeated on a widening delay (1s, 2s, 4s, 8s, then every 15s) and wakes early on `online`. A newer edit cancels an older retry, so a stale value cannot land last. The distinction it turns on is *settled* versus *unreachable* — a server that answers "no" has settled the matter, a request that never arrived has not. Verified by dropping the network mid-attempt and reconnecting |
| **T5** | Cross-tab closure uses BroadcastChannel, which is same-browser only | Correct for the scenario in the brief (several tabs, one machine). A second *device* would notice at the next status poll instead, within a minute. Not worth a server-push channel for this event |
| **T7** | Accessibility is verified by an axe pass run by hand, not in CI | Day 11 added `@axe-core/playwright` and got all 16 screens to zero WCAG 2.1 AA violations. Wiring it into the e2e suite belongs with the suite refresh, which is still outstanding |
| **T6** | `lucide-react@1.47.0` renders icon paths without React keys | A defect in the library, not in our code: its `Icon` forwardRef maps `iconNode` straight to `createElement` with no key, so every page with an icon logs a key warning in development. Cosmetic — it costs a little reconciliation work and nothing else. Not worth a dependency bump this close to the event |

---

## 4. Deferred past the event

Not needed to run 10 October or to pick a winner:

- CSV/XLSX score export — a sorted results table is enough on the day
- Analytics dashboard and charts
- Audit **log viewer UI** — rows are written throughout; query directly if needed
- Bulk participant import — add it when the registration list exists
- Judge email verification — unnecessary, the super admin approves every judge
- Scoring rubric — free-form numeric scores with server-side max validation
