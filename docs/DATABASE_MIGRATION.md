# Moving off Neon to a self-hosted PostgreSQL

Written for whoever stands up the database server and performs the cutover.

**Short version: yes, and now is the cheapest moment it will ever be.** Nothing in the
application is Neon-specific, and the database currently holds no real data.

---

## 1. Why this is safe right now

Two facts, both checked on 24 September 2026 against the live development database.

**Nothing in the schema is tied to Neon or to a particular Postgres version.** The five
migrations use `UUID`, `TEXT`, `INTEGER`, `BOOLEAN`, `JSONB`, `TIMESTAMP(3)` and
`DECIMAL` — and nothing else. No extensions beyond `plpgsql`, which is built in. No
`CREATE EXTENSION`, no `gen_random_uuid()` (Prisma generates UUIDs in the application),
no version-gated syntax. The connection goes through `@prisma/adapter-pg`, which is
plain `node-postgres` speaking the standard wire protocol.

**There is no production data to lose.** Every account in the database is a test or
demo account:

| | |
|---|---|
| Users total | 37 |
| Users outside `@example.com` / `@10pearls.com` | **0** |
| Attempts | 26 (all from automated verification runs) |

Participant registration has not opened. So this is not a data migration at all — it is
pointing the application at a different empty database and running the migrations.

> If you do this **after** registration opens, it becomes a real migration with real
> consequences. §5 covers that case. Do it now instead.

---

## 2. What changes, and what it costs

Self-hosting is a net improvement for this event, for one specific reason, and it hands
you one job Neon was doing.

### The win: latency, which was the larger risk

The development database is in AWS `us-east-2` (Ohio). A single round trip from
Pakistan measures **205–280 ms**. A page render makes several queries, and every query
holds a pool connection for its entire duration — so latency does not just make pages
slow, it shrinks how much work each connection can do.

A database on the same LAN as the application answers in **1–3 ms**. That is roughly a
**hundredfold** increase in how many requests each pooled connection can serve per
second. This closes risk **R1b** in [DELIVERY_PLAN.md](./DELIVERY_PLAN.md) outright,
and substantially relieves **R1**.

### The bill: you now own the database

Neon provided, without anyone thinking about it: connection pooling, point-in-time
recovery, automatic failover, backups, patching, and monitoring. On a self-hosted
server those become yours. The ones that matter before 10 October are **backups you
have actually restored** (§6) and **someone who owns the server on the day**.

### Connection pooling — smaller than it looks

Neon's pooled endpoint existed because an application that opens connections without
limit will exhaust any Postgres server. **This application already caps itself**:
`src/lib/db.ts` sets `max: 10` per process in production, deliberately.

So the arithmetic is simply instances × 10:

| App instances | Connections used | Default `max_connections` (100) |
|---|---|---|
| 1 | 10 | fine |
| 4 | 40 | fine |
| 8 | 80 | tight — raise `max_connections` or add PgBouncer |

**Recommendation: start without PgBouncer.** Set `max_connections = 200` on the server,
run the load test in Day 12 against the real topology, and add PgBouncer only if the
numbers say so. Adding a pooler you have not tested is its own risk, and this
application was built not to need one.

With no pooler, `DATABASE_URL` and `DIRECT_DATABASE_URL` are simply the same value.
That is expected and correct — the split exists because a pooler cannot run schema
migrations, and without a pooler there is nothing to split.

---

## 3. Stand up PostgreSQL

Use **PostgreSQL 16 or newer**. Neon currently runs 18.6; nothing depends on that, and
16 or 17 from your distribution is a fine target.

### On the development machine (Windows)

1. Download the installer from <https://www.postgresql.org/download/windows/>.
2. Run it. Keep port `5432`. Set a password for the `postgres` superuser and write it
   down.
3. Tick **Command Line Tools** — that installs `psql` and `pg_dump`, which §5 needs.
4. Add the `bin` directory to `PATH`, e.g.
   `C:\Program Files\PostgreSQL\17\bin`.

Verify:

```bash
psql --version
```

### On a Linux server (production)

```bash
sudo apt update
sudo apt install -y postgresql-17
sudo systemctl enable --now postgresql
```

### Or with Docker, either environment

```bash
docker run --name wtq-postgres \
  -e POSTGRES_PASSWORD=<strong-password> \
  -e POSTGRES_DB=wtq2026 \
  -p 5432:5432 \
  -v wtq-pgdata:/var/lib/postgresql/data \
  -d postgres:17
```

The named volume matters — without it the data is gone when the container is replaced.

### Create the database and a role for the application

Do not let the application connect as `postgres`. Give it its own role owning its own
database:

```sql
CREATE ROLE wtq_app WITH LOGIN PASSWORD '<strong-password>';
CREATE DATABASE wtq2026 OWNER wtq_app;
```

Run it with `psql -U postgres -c "..."` or inside the container with
`docker exec -it wtq-postgres psql -U postgres`.

---

## 4. Cut over — the no-data case (do this now)

Five steps. Nothing is copied, because there is nothing worth copying.

**1. Point the environment at the new server.** In `.env`:

```
DATABASE_URL="postgresql://wtq_app:<password>@localhost:5432/wtq2026"
DIRECT_DATABASE_URL="postgresql://wtq_app:<password>@localhost:5432/wtq2026"
```

Both the same, as explained in §2. Drop `?sslmode=require` for a local server; keep it
if the database is reached over a network (§7).

> Keep the old Neon strings in a scratch file until §4.5 passes. They are the rollback.

**2. Create the schema.**

```bash
pnpm db:deploy
```

Expect five migrations applied. This is the step that proves portability — if the
schema were tied to Neon, it would fail here.

**3. Seed it.**

```bash
pnpm db:seed
```

Expect `✓ app settings (6)` and a created super admin.

**4. Optionally, demo accounts to click around with.**

```bash
pnpm db:seed:demo
```

**5. Verify.**

```bash
pnpm dev
curl http://localhost:3000/api/health
```

`"database": "ok"` and — the interesting part — `databaseLatencyMs` should now be in
single digits rather than in the hundreds. Then log in as the super admin.

Run the full check suite too, since the unit tests do not touch the database but the
build does validate configuration:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

---

## 5. Cut over — the with-data case

Only needed if registration has already opened on Neon. Avoid being here.

### A gotcha that will stop you

**`pg_dump` refuses to dump from a server newer than itself.** Neon runs **18.6**, so
you need **PostgreSQL 18 client tools** to take the dump — even if the target server is
16 or 17. Installing Postgres 17 and running its `pg_dump` against Neon fails with
`server version mismatch`. Install the 18 client tools, or run the dump from a
container:

```bash
docker run --rm -v "$PWD:/out" postgres:18 \
  pg_dump --format=custom --no-owner --no-privileges \
  "postgresql://…neon…?sslmode=require" -f /out/wtq.dump
```

### The procedure

**1. Stop the application.** Not optional — a dump taken while participants are writing
is a dump of a moving target. Put up a maintenance page or scale to zero instances.

**2. Dump.**

```bash
pg_dump --format=custom --no-owner --no-privileges \
  "postgresql://<neon-direct-url>?sslmode=require" \
  -f wtq-$(date +%Y%m%d-%H%M).dump
```

`--no-owner` and `--no-privileges` matter: the Neon role does not exist on your server,
and without these the restore fails on every `ALTER ... OWNER TO`.

**3. Create the target database** as in §3, empty. Do **not** run `pnpm db:deploy`
first — the restore brings the schema with it, including the `_prisma_migrations`
table that records which migrations have run.

**4. Restore.**

```bash
pg_restore --no-owner --no-privileges --exit-on-error \
  --dbname="postgresql://wtq_app:<password>@localhost:5432/wtq2026" \
  wtq-20261001-1430.dump
```

`--exit-on-error` is deliberate. The default is to continue past failures and report a
count at the end, which is how a half-restored database gets declared successful.

**5. Verify row counts match**, table by table, before you believe it:

```bash
psql "<target-url>" -c "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"
```

Compare against the same query on Neon. Pay particular attention to `users`,
`participant_profiles`, `attempts`, `challenge1_entries` and `challenge_submissions`.

**6. Confirm Prisma agrees the schema is current:**

```bash
pnpm prisma migrate status
```

It must say the database is up to date. If it wants to apply migrations, the restore
did not bring `_prisma_migrations` — stop and investigate rather than applying them.

**7. Point `.env` at the new server, restart, and verify** as in §4.5.

### Uploaded files are not in the dump

The PDFs and screenshots live in object storage, not in Postgres — the database holds
only their keys. Changing database does not move them and does not need to. Just do
not change `STORAGE_DRIVER` at the same time, or the keys will point at a store that
does not have the files.

---

## 6. Before this is production-ready

Neon was doing these silently. Now they are tasks with owners.

- [ ] **Backups.** At minimum a nightly `pg_dump` to storage that is not the database
      server. Better: WAL archiving for point-in-time recovery.
- [ ] **Restore one.** A backup nobody has restored is a hope. Restore into a scratch
      database and log in against it. This is already a Day 13 task.
- [ ] **`max_connections = 200`** in `postgresql.conf`, with `shared_buffers` at about
      25% of RAM. Restart required.
- [ ] **Disk headroom and an alert on it.** A full disk stops Postgres writing, which
      on the day means every save failing at once.
- [ ] **An owner on 10 October** who can restart the service and read its logs.
- [ ] **Load test against this topology** (Day 12). The numbers from a Neon run do not
      transfer — that is the point of the change.

---

## 7. Network and TLS

| Layout | `sslmode` |
|---|---|
| Database on the same host as the app | omit, or `disable` |
| Database on another host, private network | `require` |
| Database reachable from anywhere | `verify-full` with a CA certificate, and fix the firewall |

Do not expose 5432 to the internet. `listen_addresses` in `postgresql.conf` and the
rules in `pg_hba.conf` decide who may connect; default both to the application host
only.

---

## 8. Rolling back

Until registration opens, rollback is putting the Neon strings back into `.env` and
restarting. The Neon project is untouched by any of this — nothing above writes to it
except the read-only dump in §5.

Keep the Neon project alive until the cutover has survived the Day 13 dress rehearsal.
It costs nothing on the free tier and it is the only rollback that exists.

---

## 9. Consequences for the rest of the documentation

| Document | What changes |
|---|---|
| [SETUP.md](./SETUP.md) | Local Postgres becomes the default route rather than Neon |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | The pooled/direct URL split collapses to one value; backups become ours |
| [DELIVERY_PLAN.md](./DELIVERY_PLAN.md) | R1b is closed by the move; R1 is reduced but still needs the Day 12 load test |
