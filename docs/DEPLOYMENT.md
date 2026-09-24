# Deployment

How to put the portal into production, and what has to be true before you do.

Written for whoever runs the deployment — the 10Pearls IT team or whoever holds the
hosting account. It assumes no familiarity with the codebase. For running it on your
own machine, read [SETUP.md](./SETUP.md) instead.

---

## 1. What you are deploying

One Node process and one PostgreSQL 16 database.

`next.config.ts` sets `output: "standalone"`, so `pnpm build` produces a
self-contained server at `.next/standalone/server.js` that bundles only the
dependencies it actually uses. It runs unchanged on a VM, a container host, Azure App
Service, AWS, or a managed Node platform.

There is no separate API service, no Redis and no message broker. Rate limiting and
sessions are in Postgres; scheduled work is resolved on read rather than by a cron.

**Three things must be provisioned:**

1. A PostgreSQL 16+ database, as close to the application as possible — ideally on the
   same private network. Self-hosting is the chosen route; see
   [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md).
2. Object storage — S3-compatible or Azure Blob.
3. A host that can run Node 20.9+ and hold environment variables secretly.

---

## 2. Before you deploy anything

- [ ] **The database sits next to the application.** Measured from Pakistan against a
      US-hosted database, every query costs 200–280 ms, and the portal makes several
      per page — latency between the app and the database is paid once per query, not
      once per page. A database on the same private network answers in 1–3 ms. A
      self-hosted server alongside the app satisfies this by construction; a managed
      one must be in the same region. See R1b in
      [DELIVERY_PLAN.md](./DELIVERY_PLAN.md).
- [ ] **Connection capacity is sized against the instance count.** The application caps
      itself at **10 connections per process** (`src/lib/db.ts`), so the database sees
      instances × 10. On a managed provider, use the **pooled** endpoint. On a
      self-hosted server, set `max_connections = 200` and check the arithmetic — see §2
      of [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md).
- [ ] **`STORAGE_DRIVER` is `s3` or `azure`.** The `local` driver is refused in
      production, and rightly: on a multi-instance deployment each instance has its
      own disk, so an upload written by one is invisible to the others and does not
      survive a redeploy.
- [ ] **`CNIC_PEPPER` and `CNIC_ENCRYPTION_KEY` are backed up off the server.**
      Neither can be regenerated once accounts exist. See §4.
- [ ] **Production secrets are different from the development ones.**
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass on the commit
      you are deploying.

---

## 3. Environment variables

Set these on the host. Never commit them.

### Required

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres connection string used by the app. The **pooled** endpoint if there is a pooler; otherwise the same as below |
| `DIRECT_DATABASE_URL` | Connection string for the migration step. Must **not** go through a pooler. Identical to the above when there is none |
| `SESSION_SECRET` | ≥32 chars. `pnpm gen:secrets` |
| `CNIC_PEPPER` | ≥16 chars. `pnpm gen:secrets` |
| `CNIC_ENCRYPTION_KEY` | Exactly 32 bytes, base64. `pnpm gen:secrets` |
| `APP_URL` | The public HTTPS origin, e.g. `https://qa.womentechquest.pk` |
| `NODE_ENV` | `production` |

### Storage — pick one set

**S3 or any S3-compatible store (MinIO, R2, Spaces):**

| Variable | Value |
|---|---|
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | Bucket name |
| `S3_REGION` | Bucket region |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credentials scoped to that bucket only |
| `S3_ENDPOINT` | Only for non-AWS S3-compatible stores |

**Azure Blob Storage:**

| Variable | Value |
|---|---|
| `STORAGE_DRIVER` | `azure` |
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string |
| `AZURE_STORAGE_CONTAINER` | Container name |

The bucket or container must be **private**. Files are served through an authorised
route that checks the caller's role; nothing is fetched by a public URL.

### Optional

| Variable | Default | Notes |
|---|---|---|
| `MAX_UPLOAD_MB` | `20` | Challenge 2 PDF cap. Raising it also needs `serverActions.bodySizeLimit` in `next.config.ts` raised to match |
| `SEED_SUPER_ADMIN_EMAIL` / `_PASSWORD` | — | Only needed for the very first deploy, to create the bootstrap admin. Remove them afterwards |

> The application validates all of this at startup and **refuses to boot** on anything
> missing or malformed, naming the variable. That is deliberate: a bad value should
> fail the deploy, not the event.

---

## 4. The two secrets you cannot lose

`CNIC_PEPPER` and `CNIC_ENCRYPTION_KEY` are not rotatable once participants have
registered.

- The **pepper** is mixed into a one-way hash of each ID card number. That hash is how
  login-by-ID-card and duplicate detection work. Change it and every existing
  participant's ID card stops matching — they cannot log in that way, and the system
  no longer recognises them as already registered.
- The **encryption key** decrypts the stored ID card for the admin console. Lose it
  and those values are unreadable for good.

Store both in a password manager or a key vault, held by at least two people, before
registration opens. `SESSION_SECRET` is different — rotating it only signs everyone
out, which is recoverable.

---

## 5. Deploying

### Route A — Docker (recommended for on-prem or any container host)

The included `Dockerfile` is multi-stage and produces a small runtime image that runs
as a non-root user and carries a health check.

```bash
docker build -t wtq-portal:latest .
```

Migrations run from a **separate image**, built from the same Dockerfile. The runtime
image has no Prisma CLI in it — `output: "standalone"` traces only what the server
imports, and the CLI is not one of those things, so `migrate deploy` cannot be run
from the app image. Build the migrator once:

```bash
docker build --target migrator -t wtq-migrator:latest .
```

Then run it **before** starting or updating the app:

```bash
docker run --rm \
  -e DIRECT_DATABASE_URL="postgresql://…" \
  wtq-migrator:latest
```

Then start the app:

```bash
docker run -d --name wtq-portal -p 3000:3000 \
  --env-file ./production.env \
  wtq-portal:latest
```

The image's `CMD` is `node server.js` — the standalone server. Do not override it with
`next start`, which cannot run a standalone build.

> **Not yet exercised.** There is no Docker on the development machine, so this route
> is correct by construction but has never been built end to end. Build both images
> and run them against a scratch database before relying on them — that belongs with
> the Day 13 deployment rehearsal in [DELIVERY_PLAN.md](./DELIVERY_PLAN.md).

### Route B — a Node host (VM, App Service, or similar)

```bash
git clone <repo> && cd wtq-qa-challenge-submissions
git checkout main

pnpm install --frozen-lockfile
pnpm prisma generate
pnpm build
```

Deploy these to the server:

```
.next/standalone/     the server and its dependencies
.next/static/     →   copy to .next/standalone/.next/static
public/           →   copy to .next/standalone/public
prisma/               needed only by the migration step
```

Start it with:

```bash
NODE_ENV=production node .next/standalone/server.js
```

Put it behind nginx, IIS or the platform's own TLS terminator. The app expects to be
reached over HTTPS: session cookies are `Secure` and `SameSite=Strict`.

### Route C — a managed platform (Vercel, Netlify and similar)

Connect the repository, set the environment variables from §3, and let the platform
build. Add `pnpm prisma migrate deploy` as a pre-deploy or release command. Nothing
else is needed — `output: "standalone"` is compatible with, and ignored by, platforms
that handle the server themselves.

---

## 6. Migrations

**Always a separate step, never on container start.** Several instances booting at
once must not race each other applying the same migration.

```bash
pnpm prisma migrate deploy
```

This applies only migrations that have not run yet, and is safe to repeat. It uses
`DIRECT_DATABASE_URL`, because a connection pooler cannot run DDL.

Never run `prisma migrate dev` or `prisma db push` against production. The first tries
to author a new migration and can prompt to reset the database; the second bypasses
migration history entirely.

### First deploy only

After the first `migrate deploy`, seed the settings and the bootstrap admin:

```bash
SEED_SUPER_ADMIN_EMAIL=… SEED_SUPER_ADMIN_PASSWORD=… pnpm tsx prisma/seed.ts
```

A password change is forced at that account's first login. Remove the two seed
variables from the environment afterwards.

Do **not** run `pnpm db:seed:demo` against production. It refuses when
`NODE_ENV=production`, but do not rely on that as the only control — its passwords are
written down in plain text.

---

## 7. Health checks and monitoring

`GET /api/health` returns 200 when healthy and **503** when the database is
unreachable, so it works directly as a load-balancer probe.

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

It deliberately touches the database — a process that is up but cannot reach Postgres
is not healthy, and that is exactly the failure mode expected under load.

Worth alerting on, for event day:

- `status` other than `ok` for more than one probe interval.
- `databaseLatencyMs` climbing above ~300 ms sustained — the signal that the
  connection pool is saturating.
- 5xx rate on `/challenge/*`, which is where participants are.

---

## 8. Backups

> On a **self-hosted** database none of this is automatic. Points 1 and 2 below
> describe what a managed provider does for you; on your own server they are jobs with
> an owner. See §6 of [DATABASE_MIGRATION.md](./DATABASE_MIGRATION.md).

Before the event:

1. Turn on **point-in-time recovery** — at the provider, or via WAL archiving on a
   self-hosted server — with a retention window covering the whole event weekend. At
   minimum, a nightly `pg_dump` written somewhere that is not the database server.
2. Take a manual snapshot immediately before registration opens, and another
   immediately before the challenge starts.
3. **Restore one of them into a scratch database and check it.** A backup nobody has
   restored is a hope, not a backup. This is a scheduled Day 13 task and it is the
   only way to find out that the backup is fine.

Object storage holds the uploaded PDFs and screenshots. Enable versioning or soft
delete on the bucket — a deleted object is a participant's submission.

---

## 9. Rolling back

The application and the database roll back differently, and the difference matters.

- **The application** is a redeploy of the previous image or commit. Safe and fast.
- **The database** is not. Prisma migrations have no down-migrations here. If a
  migration is wrong, the route back is a restore from point-in-time recovery, which
  loses everything written since.

So: deploy the migration ahead of the release that needs it, keep migrations additive
where possible, and never ship a destructive migration on event day.

---

## 10. Still open

These are decisions or values the organisers and IT owe the project. They are tracked
in [PENDING.md](./PENDING.md); they are repeated here because they block a production
deployment specifically.

| # | What is needed | Why it blocks |
|---|---|---|
| **P3** | The deployment target | Everything in §5 depends on it |
| **P4** | Database region, once P3 is known | Recreating it later means migrating live data. *Largely answered: the decision is a self-hosted PostgreSQL alongside the application, which closes R1b* |
| **P1** | The public URL of the application under test | Participants cannot start Challenge 1 without it |
| **P2** | The Challenge 4 CSV | Same, for Challenge 4 |

Remaining engineering work before this is production-ready is listed in
[DELIVERY_PLAN.md](./DELIVERY_PLAN.md) — a load test at 1200 users, a security pass,
and a dress rehearsal, none of which have been done yet.

---

## Quick reference

```bash
# Build
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm build

# Migrate (separate step, before release)
pnpm prisma migrate deploy

# Run
NODE_ENV=production node .next/standalone/server.js

# Verify
curl -f https://<host>/api/health
```
