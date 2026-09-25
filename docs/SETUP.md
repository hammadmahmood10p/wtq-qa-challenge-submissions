# Local setup

Everything needed to go from a fresh machine to the portal running on
`http://localhost:3000`, in order, with nothing assumed.

Allow about **15 minutes**, most of which is creating a free database.

If you only want to deploy this rather than develop on it, read
[DEPLOYMENT.md](./DEPLOYMENT.md) instead.

---

## 0. What you are installing

A Next.js application with a PostgreSQL database. There is no separate backend, no
message queue and no Redis — the whole thing is one Node process plus one database.
File uploads go to local disk in development and to object storage in production.

---

## 1. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| **Node.js** | 20.9 or newer (22 LTS recommended) | `node -v` |
| **pnpm** | 12.x | `pnpm -v` |
| **Git** | any recent | `git --version` |
| **PostgreSQL** | 16, local or hosted — step 3 | — |

### Installing Node

Download the **LTS** build from <https://nodejs.org>, or use a version manager
(`nvm`, `fnm`, `volta`). Anything from 20.9 up works; the project is developed on 24
and built in CI on 22.

### Installing pnpm

pnpm ships with Node via Corepack. Enable it rather than installing pnpm globally, so
you get the exact version this repository pins:

```bash
corepack enable
```

The version is pinned in `package.json` (`"packageManager": "pnpm@12.4.2"`), so the
first `pnpm` command inside the project will fetch and use it automatically.

> If `corepack enable` fails with a permissions error on macOS or Linux, prefix it
> with `sudo`. On Windows, run the terminal as Administrator once.

---

## 2. Clone the repository

```bash
git clone https://github.com/hammadmahmood10p/wtq-qa-challenge-submissions.git
cd wtq-qa-challenge-submissions
git checkout develop
```

`develop` is the working branch. `main` holds released work.

---

## 3. Get a PostgreSQL 16 database

Any Postgres 16 or newer works — nothing in the code is vendor-specific. Pick one
route.

> The project is moving to a **self-hosted PostgreSQL** for development and production
> alike. Route A is the target. The hosted route is kept because it is still the
> fastest way to get going if you have no Postgres to hand. See
> [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md).

### Route A — PostgreSQL on your own machine (the target setup)

**Windows** — install from <https://www.postgresql.org/download/windows/>, keep port
5432, tick **Command Line Tools**, and add the install's `bin` directory to `PATH`
(typically under `C:/Program Files/PostgreSQL/17/bin`).

**macOS** — `brew install postgresql@17 && brew services start postgresql@17`

**Linux** — `sudo apt install -y postgresql-17 && sudo systemctl enable --now postgresql`

Then create a database and a role for the application, rather than letting it connect
as the superuser:

```sql
CREATE ROLE wtq_app WITH LOGIN PASSWORD 'choose-one';
CREATE DATABASE wtq2026 OWNER wtq_app;
```

Both URLs take the same value, because a plain server has no pooler:

```
postgresql://wtq_app:choose-one@localhost:5432/wtq2026
```

### Route B — Docker

```bash
docker run --name wtq-postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=wtq2026 \
  -p 5432:5432 -v wtq-pgdata:/var/lib/postgresql/data -d postgres:17
```

Connection string: `postgresql://postgres:postgres@localhost:5432/wtq2026`. The named
volume is what stops the data vanishing when the container is replaced.

### Route C — Neon (hosted, free, no install)

1. Sign up at <https://neon.tech> and create a project. Choose a region near you.
2. On the project dashboard, open **Connection string**.
3. Copy **both** forms:
   - **Pooled** — the host contains `-pooler`. This becomes `DATABASE_URL`.
   - **Direct** — the host has no `-pooler`. This becomes `DIRECT_DATABASE_URL`.

If the dashboard only shows one, toggle *Connection pooling* to reveal the other.

> **Why two URLs?** Schema migrations cannot run through a connection pooler, because
> a pooler rewrites and multiplexes statements — so the Prisma CLI gets its own direct
> string. **With no pooler in front of the database, both values are simply the same**,
> which is the case for a self-hosted server. The split only starts to matter if
> PgBouncer is put in front of it later. See R1 in
> [DELIVERY_PLAN.md](./DELIVERY_PLAN.md) and §2 of
> [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md).

---

## 4. Create your environment file

```bash
cp .env.example .env
```

Generate the three secrets:

```bash
pnpm gen:secrets
```

That prints three lines. Paste them into `.env`, replacing the `replace-me`
placeholders:

```
SESSION_SECRET=UT2XEb0D_x-gEDx4JeYdjGg8e4oKpSevNLM-FTYy-wSgx2Mbc9ybQatq1Je_dJAk
CNIC_PEPPER=lgns9zTmetr0lJAhAUe7Dq_q3F_jWPt-GR6k0dePCho
CNIC_ENCRYPTION_KEY=OYvulz6NmLS8eBoPB/b28+33zjy2x7UnNYTjhD50R88=
```

Then set the two database URLs from step 3, and choose an admin login:

```
DATABASE_URL="postgresql://…"
DIRECT_DATABASE_URL="postgresql://…"

SEED_SUPER_ADMIN_EMAIL="admin@10pearls.com"
SEED_SUPER_ADMIN_PASSWORD="pick-something-strong"
```

Leave everything else at its default for local work.

### What each variable does

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled connection, used by the running app |
| `DIRECT_DATABASE_URL` | Direct connection, used by `prisma migrate` and the seeds |
| `SESSION_SECRET` | Signs session tokens. Changing it logs everyone out |
| `CNIC_PEPPER` | HMAC pepper for the ID-card lookup hash |
| `CNIC_ENCRYPTION_KEY` | AES-256 key (32 bytes, base64) for the stored ID card number |
| `STORAGE_DRIVER` | `local`, `s3` or `azure`. `local` writes to `.storage/` and is refused in production |
| `STORAGE_LOCAL_DIR` | Where the local driver writes. Default `.storage`. May be absolute, which is what a container mount will be |
| `STORAGE_LOCAL_SHARED_VOLUME` | Only needed in production. `true` asserts every instance mounts the same directory — see [DEPLOYMENT.md](./DEPLOYMENT.md) §2 |
| `APP_URL` | Absolute base URL, used when building signed file links |
| `MAX_UPLOAD_MB` | PDF size cap for Challenge 2. Default 20 |
| `SEED_SUPER_ADMIN_EMAIL` / `_PASSWORD` | Bootstrap admin. A password change is forced at first login. Omit both and the seed skips creating one |

> **Two of these are unrecoverable.** `CNIC_PEPPER` and `CNIC_ENCRYPTION_KEY` cannot
> be regenerated once accounts exist: changing the pepper orphans every participant's
> ID-card login, and losing the key makes stored ID cards permanently unreadable. For
> the real event, back both up somewhere other than the server.

`.env` is git-ignored and must stay that way.

---

## 5. Install dependencies

```bash
pnpm install
```

This also runs `prisma generate`, which writes the typed database client into
`src/generated/prisma`. That directory is generated, not source — never edit it.

> On the first install, pnpm may ask to approve build scripts for native packages
> (`@node-rs/argon2`, `sharp`). They are listed under `allowBuilds` in
> `pnpm-workspace.yaml` and are expected.

---

## 6. Create the schema and seed it

```bash
pnpm db:deploy    # applies every existing migration
pnpm db:seed      # app settings + the super admin from your .env
```

Expected output from the seed:

```
✓ app settings (6)
✓ super admin created (admin@10pearls.com) — password change forced at first login
```

Use `pnpm db:deploy` — not `pnpm db:migrate` — unless you are *changing* the schema.
`db:migrate` is the authoring command and will try to create a new migration.

### Optional: demo accounts to click around with

```bash
pnpm db:seed:demo
```

This creates a super admin, two judges (one awaiting approval) and four participants
across the three cities, and writes their credentials to `docs/DEMO_ACCOUNTS.md` —
which is git-ignored, because the passwords are in plain text. Re-running replaces
them. It refuses to run when `NODE_ENV=production`.

---

## 7. Run it

```bash
pnpm dev
```

Open <http://localhost:3000>.

### Confirm it actually works

```bash
curl http://localhost:3000/api/health
```

A healthy response looks like this:

```json
{
  "status": "ok",
  "database": "ok",
  "databaseLatencyMs": 41,
  "storageDriver": "local",
  "uptimeSeconds": 26,
  "checkedInMs": 41,
  "timestamp": "2026-09-24T08:19:18.003Z"
}
```

If `database` reads `unreachable`, the app is up but cannot see Postgres — check
`DATABASE_URL`. `status` is `degraded` and the endpoint returns 503 in that case.

Then log in at <http://localhost:3000/login> with the super admin from your `.env`.
You will be asked to change the password immediately; that is intended.

---

## 8. Run the checks

```bash
pnpm typecheck     # TypeScript, no database needed
pnpm lint          # ESLint, no database needed
pnpm test          # unit tests (Vitest), no database needed
pnpm build         # production build
```

All four should pass on a clean checkout. The end-to-end suite needs browsers
installed once:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

> The e2e suite is currently **out of date** — it still targets an older three-challenge
> shape and does not cover the judge or admin flows added since. See
> [PENDING.md](./PENDING.md). `pnpm test` is the suite to trust today.

---

## Command reference

| Command | What it does |
|---|---|
| `pnpm dev` | Development server with hot reload |
| `pnpm dev --port 3005` | …on a different port |
| `pnpm build` | Production build |
| `pnpm start:standalone` | Run the production build — **not** `pnpm start`, see below |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests |
| `pnpm test:watch` | Unit tests, watching |
| `pnpm test:e2e` | End-to-end tests (needs a database and a browser) |
| `pnpm test:e2e:ui` | …with the Playwright inspector |
| `pnpm db:deploy` | Apply existing migrations |
| `pnpm db:migrate` | Create **and** apply a new migration (schema authoring) |
| `pnpm db:seed` | Settings and the super admin |
| `pnpm db:seed:demo` | Demo accounts (development only) |
| `pnpm db:studio` | Browse the database in a GUI |
| `pnpm db:generate` | Regenerate the Prisma client |
| `pnpm gen:secrets` | Print a fresh set of the three secrets |

---

## Troubleshooting

### "Invalid environment configuration" on startup

The app validates every variable at import time, so a bad `.env` fails immediately and
names the problem. The usual causes:

- `CNIC_ENCRYPTION_KEY must be 32 bytes, base64-encoded` — you pasted a shortened or
  re-wrapped value. Re-run `pnpm gen:secrets` and copy the whole line.
- `SESSION_SECRET must be at least 32 characters` — still the placeholder.

### Schema changes do not take effect until you restart

After `pnpm db:migrate` or `pnpm db:generate`, **stop and restart `pnpm dev`.** The
Prisma client is cached on `globalThis` so that hot reload does not open a new
connection pool on every edit — which means a running dev server keeps the *old*
generated client in memory. `pnpm typecheck` reads the new one from disk and passes,
so the symptom is confusing: types are fine but queries fail at runtime with
`Unknown field …`. A restart is the fix.

### `pnpm start` misbehaves

The build produces a standalone server (`output: "standalone"` in `next.config.ts`),
which `next start` does not know how to run. Use `pnpm start:standalone`, which runs
`node .next/standalone/server.js`. The `Dockerfile` already does this.

### Port 3000 is already in use

Next refuses to start a second instance and prints the PID holding the port:

```bash
# Windows
taskkill /PID <pid> /F
# macOS / Linux
kill -9 <pid>
```

Or just use another port: `pnpm dev --port 3005`.

Note that on a machine where the **application under test** (ElectraStore) is also
running, it commonly occupies 3000. Check which one answers before assuming the portal
is broken: the portal's `/login` page is titled *"Log in — WTQ 2026"*.

### Uploads vanish after a restart

Expected with `STORAGE_DRIVER=local` if you delete `.storage/`. The directory is
git-ignored and holds every uploaded PDF and screenshot.

### A participant cannot log in with their ID card number

If you changed `CNIC_PEPPER` after accounts were created, their lookup hashes no
longer match. There is no migration for this — the accounts have to be recreated. Do
not change the pepper on a database that has real registrations.

---

## Project layout

```
prisma/schema.prisma       the data model
prisma/migrations/         applied migrations, in order
prisma/seed.ts             settings + super admin
prisma/seed-demo.ts        demo accounts (development only)
prisma.config.ts           Prisma CLI config — holds the direct connection

src/app/                   routes; (auth) is public, the rest require a role
src/app/actions/           server actions — every mutation goes through one
src/app/api/health/        liveness and readiness
src/components/            UI, grouped by surface
src/lib/                   domain logic; anything importing the database is server-only
src/lib/env.ts             validated environment; fails fast on a bad deploy
src/lib/db.ts              the single Prisma client and its connection pool
src/lib/crypto.ts          ID-card hashing and encryption
src/lib/scoring.ts         the judging rubric — the single source of truth
src/generated/prisma/      generated client. Never edit

e2e/                       Playwright specs
test/                      unit-test helpers
docs/                      these documents
```

---

## Verified

Every step above was followed on **24 September 2026** from a clean clone on Windows
with Node 24 and pnpm 12.4.2: install, `db:deploy`, `db:seed`, `typecheck`, `test`
(148 passing), `build`, and `pnpm dev` answering a healthy `/api/health`. If something
here does not work for you, it is a difference in your machine rather than a stale
instruction — start with the troubleshooting section above.

One thing that did bite during that run, on Windows: installing into a path containing
an 8.3 short name (`C:UsersSOMEON~1…`) fails with
`ERR_PNPM_EXECUTOR_SPAWN_LIFECYCLE … The directory name is invalid (os error 267)`.
Clone somewhere with a plain path.

---

## Where to read next

| Document | What it covers |
|---|---|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Getting this into production |
| [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md) | Moving from hosted Postgres to a self-hosted one |
| [ARCHITECTURE_AND_PHASES.md](./ARCHITECTURE_AND_PHASES.md) | The data model and the decisions behind it |
| [DELIVERY_PLAN.md](./DELIVERY_PLAN.md) | Schedule, risks, freeze dates |
| [PENDING.md](./PENDING.md) | What is still open, and what is known to be imperfect |
| [DESIGN_LANGUAGE.md](./DESIGN_LANGUAGE.md) | Colour, type, motion, accessibility |
