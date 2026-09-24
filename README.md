# WTQ 2026 — QA Challenge Submission Portal

The portal participants, judges and organisers use for the Women Tech Quest 2026 QA
challenge — **Saturday 10 October 2026**, across Karachi, Lahore and Islamabad.

Participants register, work through four QA challenges against a three-hour
server-authoritative clock, and submit once. Judges score the submissions against a
published rubric. A super admin runs the roster and the event.

---

## Getting started

```bash
git clone https://github.com/hammadmahmood10p/wtq-qa-challenge-submissions.git
cd wtq-qa-challenge-submissions
cp .env.example .env     # then fill it in — see docs/SETUP.md
pnpm install
pnpm db:deploy
pnpm db:seed
pnpm dev
```

**Read [docs/SETUP.md](docs/SETUP.md) for the full walkthrough**, including where to
get a database and what each environment variable does. It takes about 15 minutes from
nothing, and every step in it has been run from a clean clone.

To deploy rather than develop, read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Documentation

| Document | What it covers |
|---|---|
| [SETUP.md](docs/SETUP.md) | Running it locally, from a clean machine |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Putting it into production |
| [ARCHITECTURE_AND_PHASES.md](docs/ARCHITECTURE_AND_PHASES.md) | The data model and the decisions behind it |
| [DELIVERY_PLAN.md](docs/DELIVERY_PLAN.md) | Schedule, risks and freeze dates |
| [PENDING.md](docs/PENDING.md) | What is still open, and what is knowingly imperfect |
| [DESIGN_LANGUAGE.md](docs/DESIGN_LANGUAGE.md) | Colour, type, motion and accessibility |

---

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 ·
PostgreSQL 16 · Vitest · Playwright

One Node process and one database. No separate API, no Redis, no message broker.

---

## Checks

```bash
pnpm typecheck    # TypeScript
pnpm lint         # ESLint
pnpm test         # unit tests — no database needed
pnpm build        # production build
```
