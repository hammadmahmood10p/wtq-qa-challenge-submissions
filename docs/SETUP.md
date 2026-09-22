# Setup

Getting the portal running locally, and what each piece of configuration is for.

## Prerequisites

- **Node 22+** (Node 24 is installed on the dev machine — fine)
- **pnpm 12** (`corepack enable`)
- **A PostgreSQL 16 database.** There is no local Postgres and no Docker on the dev
  machine, so the fastest route is a free managed instance — see below.

## 1. Get a database

**Neon** (recommended for development — free tier, ~2 minutes, no card):

1. Sign up at <https://neon.tech> and create a project.
2. From the dashboard, copy **both** connection strings:
   - the **pooled** one (its host contains `-pooler`) → `DATABASE_URL`
   - the **direct** one → `DIRECT_DATABASE_URL`

The distinction is not cosmetic. See [DELIVERY_PLAN.md](./DELIVERY_PLAN.md) R1: the
application must use the pooled endpoint or 1000 concurrent participants will exhaust
the database's connection limit. Migrations must use the direct endpoint, because a
pooler cannot run them. Locally the two may be identical, which is exactly why this is
easy to get wrong — keep them distinct in every deployed environment.

Any Postgres 16 works (local install, Supabase, Azure Database for PostgreSQL, RDS).
Nothing in the code is Neon-specific.

## 2. Configure the environment

```bash
cp .env.example .env
```

Then fill it in. To generate the three secrets:

```bash
pnpm gen:secrets
```

<details><summary>Equivalent one-liner, if you need it outside the project</summary>

```bash
node -e "const c=require('crypto');console.log('SESSION_SECRET='+c.randomBytes(48).toString('base64url'));console.log('CNIC_PEPPER='+c.randomBytes(32).toString('base64url'));console.log('CNIC_ENCRYPTION_KEY='+c.randomBytes(32).toString('base64'));"
```

</details>

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Pooled connection, used by the running app |
| `DIRECT_DATABASE_URL` | Direct connection, used by `prisma migrate` and the seed |
| `SESSION_SECRET` | Signs session JWTs. Rotating it logs everyone out |
| `CNIC_PEPPER` | HMAC pepper for the CNIC lookup hash. **Changing it orphans every existing participant account** — they will no longer be able to log in with their CNIC |
| `CNIC_ENCRYPTION_KEY` | AES-256 key (32 bytes, base64) for the stored CNIC. **Losing it makes stored CNICs unreadable** |
| `STORAGE_DRIVER` | `local`, `s3` or `azure`. `local` is refused in production |
| `APP_URL` | Absolute base URL, used when building signed file links |
| `MAX_UPLOAD_MB` | Challenge 2 PDF size cap |
| `SEED_SUPER_ADMIN_*` | Bootstrap admin account; a password change is forced at first login |

> **Back up `CNIC_PEPPER` and `CNIC_ENCRYPTION_KEY` somewhere other than the server.**
> Both are unrecoverable, and losing either one after participants have registered is
> not something we could fix on event day.

## 3. Install, migrate, seed

```bash
pnpm install
pnpm db:migrate    # creates the schema
pnpm db:seed       # app settings + super admin
pnpm dev           # http://localhost:3000
```

Check `http://localhost:3000/api/health` — it should report `"database": "ok"`. If it
reports `unreachable`, the app is running but cannot see Postgres; check `DATABASE_URL`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and run |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Create and apply a migration (development) |
| `pnpm db:deploy` | Apply existing migrations (production) |
| `pnpm db:studio` | Browse the database |
| `pnpm db:seed` | Seed settings and the super admin |
| `pnpm gen:secrets` | Print a fresh set of `SESSION_SECRET`, `CNIC_PEPPER` and `CNIC_ENCRYPTION_KEY` |

## Deployment

The app builds to a standalone Node server (`output: "standalone"`), so it runs
unchanged on Vercel, Azure App Service, AWS, or a VM behind nginx. A `Dockerfile` is
included for container or on-prem hosting.

Whatever the target, it needs:

1. The environment variables above, with **`STORAGE_DRIVER` set to `s3` or `azure`**
   and the matching credentials. The `local` driver is refused in production: on a
   multi-instance deployment each instance has its own disk, so uploads written by one
   would be invisible to another and would not survive a redeploy.
2. `pnpm db:deploy` run **as a separate deploy step**, not on container start —
   several instances booting at once must not race applying the same migration.
3. A **pooled** `DATABASE_URL`.

## Project layout

```
prisma/schema.prisma    data model (see ARCHITECTURE_AND_PHASES.md §4)
prisma.config.ts        Prisma CLI config — holds the direct connection
src/lib/env.ts          validated environment; fails fast on a bad deploy
src/lib/db.ts           the single Prisma client and its connection pool
src/lib/crypto.ts       CNIC hashing and encryption
src/lib/normalize.ts    CNIC / phone / email normalisation (D5)
src/lib/storage/        storage adapter — local, S3, Azure
src/app/api/health      liveness and readiness
```
