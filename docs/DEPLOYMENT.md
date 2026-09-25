# Deployment

End-to-end instructions for putting the portal on a fresh VM, and the machine
specification to ask IT for.

Written for whoever runs the deployment. It assumes Linux familiarity but no knowledge
of this codebase. For running it on your own machine, read [SETUP.md](./SETUP.md).

> **Status: images built and the stack run end to end** on 25 September, against a
> throwaway PostgreSQL. Migrations, seeding, sign-in, uploads to the volume and
> downloads back out all verified — see §11 for exactly what was and was not covered.
> The parts still unproven are the ones that need the VM itself: nginx with real TLS,
> and reaching PostgreSQL on the host.

---

## 1. The VM to ask IT for

One virtual machine runs everything: nginx, the application, and PostgreSQL.

### Specification

| | Minimum | **Recommended** | Why |
|---|---|---|---|
| vCPU | 4 | **8** | Server-rendering is CPU-bound and single-threaded per process. The stack runs one app replica per 2 vCPU, so 8 vCPU means 4 replicas |
| RAM | 8 GB | **16 GB** | ~500 MB per app replica, 4 GB for PostgreSQL, plus nginx and the OS |
| Disk | 100 GB SSD | **200 GB SSD** | See the breakdown below. **SSD, not spinning disk** — the database is latency-sensitive |
| OS | Ubuntu 22.04 LTS | **Ubuntu 24.04 LTS** | Anything with Docker Engine works; these instructions are apt-based |
| Network | 100 Mbps | **1 Gbps** | Uploads cluster at the end of the three hours |

Sized for **1000 participants over a three-hour window**, with the sharpest load in the
first ten minutes when everybody signs in at once, and a second peak at the end when
reports are uploaded.

### Where the disk goes

| | |
|---|---|
| Uploads — PDFs and screenshots | ~30 GB (1000 × one report plus several screenshots) |
| PostgreSQL | < 5 GB — the database holds text, not files |
| Docker images and layers | ~5 GB |
| Local backups before they are copied off | ~10 GB |
| OS and headroom | ~20 GB |

100 GB works. 200 GB means nobody watches a disk gauge on event day, and a full disk
stops PostgreSQL writing — which is every save failing at once.

### Access and networking

- **Inbound:** 443 (HTTPS) and 80 (redirect to HTTPS) from the internet or the venue
  network. **Nothing else** — in particular not 5432, and not 3000.
- **Outbound:** HTTPS, to pull packages and Docker images during setup.
- **SSH** for whoever administers it.
- **A DNS name** pointing at the VM, plus a TLS certificate for it. A public name lets
  you use Let's Encrypt; an internal one needs a certificate from IT.

### Also ask for

- **A second, smaller VM** (2 vCPU / 4 GB) to rehearse on. Deploying to production for
  the first time on event week is the avoidable risk here.
- **Somewhere off this VM to put backups.** A backup on the same disk as the database
  is not a backup.
- **A named owner** who can restart services and read logs on 10 October.

---

## 2. What gets deployed

```
                   ┌─────────── the VM ───────────────────────┐
  Internet ──443──►│ nginx (TLS)                              │
                   │   └─► app ×4  (containers)               │
                   │         ├─► PostgreSQL 17  (on the host) │
                   │         └─► uploads  (Docker volume)     │
                   └──────────────────────────────────────────┘
```

Three deliberate choices:

**PostgreSQL runs on the host, not in a container.** A container is where people lose
databases — a missing or misconfigured volume looks fine until the container is
replaced. The one thing on this VM that cannot be recreated is the data.

**Uploads go to a Docker volume, not to object storage.** Every replica is on this one
machine and mounts the same volume, so local disk is correct and has no extra moving
parts. This is what `STORAGE_LOCAL_SHARED_VOLUME=true` asserts, and the application
refuses to start in production without it (§11).

> MinIO was the earlier recommendation for self-hosted object storage. **Its
> open-source server was archived in 2025 and no longer receives security updates**, so
> it is not something to introduce now. If the deployment ever outgrows one VM, use a
> maintained S3-compatible store or a cloud one — `STORAGE_DRIVER` already supports
> both, and it is an environment variable, not a code change.

**Migrations run as their own step**, from their own image, before the app starts.
Several replicas booting at once must not race each other applying one migration.

---

## 3. Prepare the VM

Everything from here runs on the VM over SSH.

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

PostgreSQL is deliberately absent from that list. It is reached over the Docker bridge,
not over the network.

### Docker Engine

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker          # or log out and back in
docker --version && docker compose version
```

---

## 4. PostgreSQL on the host

```bash
sudo apt -y install postgresql-17
sudo systemctl enable --now postgresql
```

### Create the database and its role

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE wtq_app WITH LOGIN PASSWORD 'CHOOSE_A_STRONG_PASSWORD';
CREATE DATABASE wtq2026 OWNER wtq_app;
SQL
```

### Let containers reach it

Containers arrive on the Docker bridge, so PostgreSQL has to listen on it and trust it.
Find the bridge subnet:

```bash
docker network inspect bridge --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
# typically 172.17.0.0/16
```

Then, as root, edit the two configuration files:

```bash
# /etc/postgresql/17/main/postgresql.conf
listen_addresses = 'localhost,172.17.0.1'
max_connections = 200
shared_buffers = 4GB              # about 25% of RAM

# /etc/postgresql/17/main/pg_hba.conf  — add this line
host    wtq2026    wtq_app    172.17.0.0/16    scram-sha-256
```

`max_connections = 200` is generous on purpose. The application caps itself at 10
connections per replica, so four replicas use 40; the headroom covers migrations,
backups and a psql session without anyone doing arithmetic under pressure.

```bash
sudo systemctl restart postgresql
```

---

## 5. Get the code and configure it

```bash
sudo mkdir -p /opt/wtq && sudo chown "$USER" /opt/wtq
git clone https://github.com/hammadmahmood10p/wtq-qa-challenge-submissions.git /opt/wtq
cd /opt/wtq
git checkout main
```

### Generate the secrets

On any machine with Node, or on the VM after installing it:

```bash
node -e "const c=require('crypto');console.log('SESSION_SECRET='+c.randomBytes(48).toString('base64url'));console.log('CNIC_PEPPER='+c.randomBytes(32).toString('base64url'));console.log('CNIC_ENCRYPTION_KEY='+c.randomBytes(32).toString('base64'))"
```

### Write the configuration

```bash
cp deploy/production.env.example production.env
chmod 600 production.env
nano production.env
```

Fill in the database password, the three secrets, and `APP_URL` — the public https
origin. Everything else has a working default.

> **`CNIC_PEPPER` and `CNIC_ENCRYPTION_KEY` cannot be rotated** once participants have
> registered. Changing the pepper orphans every ID-card login; losing the key makes
> stored ID cards unreadable. Put both in a password manager, held by at least two
> people, **before registration opens**.

### TLS certificate

Put the certificate and its key where nginx expects them:

```bash
mkdir -p deploy/certs
# Public DNS name — Let's Encrypt:
sudo apt -y install certbot
sudo certbot certonly --standalone -d qa.example.com
sudo cp /etc/letsencrypt/live/qa.example.com/fullchain.pem deploy/certs/
sudo cp /etc/letsencrypt/live/qa.example.com/privkey.pem   deploy/certs/
sudo chown "$USER" deploy/certs/*.pem

# Certificate from IT — just copy both files in as fullchain.pem and privkey.pem.
```

Both files are git-ignored.

---

## 6. Build, migrate, start

```bash
cd /opt/wtq

# 1. Build both images.
docker compose --env-file production.env build

# 2. Apply the schema. Separate step, before anything starts.
docker compose --env-file production.env run --rm migrator

# 3. First deploy only — create the bootstrap super admin.
SEED_SUPER_ADMIN_EMAIL=admin@10pearls.com \
SEED_SUPER_ADMIN_PASSWORD='a-strong-one' \
docker compose --env-file production.env run --rm \
  -e SEED_SUPER_ADMIN_EMAIL -e SEED_SUPER_ADMIN_PASSWORD \
  migrator pnpm tsx prisma/seed.ts

# 4. Start, with four app replicas.
docker compose --env-file production.env up -d --scale app=4
```

A password change is forced at that admin's first login.

### Check it

```bash
docker compose ps                          # all healthy
curl -fsS https://qa.example.com/api/health
```

Expect `"status":"ok"` and `"database":"ok"`. Then open the site, sign in as the admin,
change the password, and set the application URL and Challenge 4 CSV from **Overview →
Event configuration**.

---

## 7. Deploying a new version

```bash
cd /opt/wtq
git pull

docker compose --env-file production.env build
docker compose --env-file production.env run --rm migrator     # before the new code
docker compose --env-file production.env up -d --scale app=4
```

Migrations go **before** the new containers, so the schema is ready when they start.

### Rolling back

The application and the database roll back differently, and the difference matters.

- **Application** — `git checkout <previous-tag>`, rebuild, restart. Fast and safe.
- **Database** — there are no down-migrations. The way back is a restore from backup,
  which loses everything written since.

So: keep migrations additive, deploy them ahead of the code that needs them, and never
ship a destructive migration on event day.

---

## 8. Backups

**Two things need backing up, and only one of them is the database.** The uploads
volume holds every participant's report and screenshots; those files are not in
PostgreSQL, which stores only their keys.

```bash
sudo mkdir -p /var/backups/wtq && sudo chown "$USER" /var/backups/wtq
```

Save this as `/opt/wtq/backup.sh` and `chmod +x` it:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M)
DEST=/var/backups/wtq

sudo -u postgres pg_dump -Fc wtq2026 > "$DEST/db-$STAMP.dump"

docker run --rm -v wtq_uploads:/data -v "$DEST":/backup alpine \
  tar czf "/backup/uploads-$STAMP.tar.gz" -C /data .

find "$DEST" -name '*.dump' -mtime +7 -delete
find "$DEST" -name '*.tar.gz' -mtime +7 -delete
```

Hourly during the event, nightly otherwise:

```bash
crontab -e
# 0 * * * * /opt/wtq/backup.sh >> /var/log/wtq-backup.log 2>&1
```

**Copy them off this VM.** A backup on the same disk as the thing it protects is not a
backup.

### Restore, and rehearse it

```bash
# Database, into a scratch copy first
sudo -u postgres createdb wtq_restore_test
sudo -u postgres pg_restore -d wtq_restore_test --no-owner /var/backups/wtq/db-XXXX.dump

# Uploads
docker run --rm -v wtq_uploads:/data -v /var/backups/wtq:/backup alpine \
  tar xzf /backup/uploads-XXXX.tar.gz -C /data
```

**Do this once before the event, for real.** A backup nobody has restored is a hope.

---

## 9. Running it on the day

```bash
docker compose ps                        # health of every container
docker compose logs -f --tail=100 app    # application logs
docker compose restart app               # restart replicas, no config change
docker compose --env-file production.env up -d --scale app=6   # more capacity
```

Worth watching:

- `/api/health` returning anything but 200.
- `databaseLatencyMs` above ~300 ms sustained — the pool saturating.
- `df -h` — a full disk stops PostgreSQL writing.
- `docker stats` — memory per replica.

The admin console has two controls for when something goes wrong: **Disable All**
closes participant logins without disturbing anyone already working, and **Sign
everyone out** is the emergency stop. Both are on Participants.

---

## 10. Environment variables

The image is identical in every environment. Only `production.env` differs.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://wtq_app:…@host.docker.internal:5432/wtq2026` |
| `DIRECT_DATABASE_URL` | Same value — there is no pooler to bypass |
| `SESSION_SECRET` | ≥32 chars. Rotating it signs everyone out |
| `CNIC_PEPPER` | ≥16 chars. **Not rotatable** once accounts exist |
| `CNIC_ENCRYPTION_KEY` | 32 bytes base64. **Not recoverable** if lost |
| `APP_URL` | Public https origin. Wrong value breaks download links |
| `MAX_UPLOAD_MB` | Default 20. Raising it also needs `client_max_body_size` in `deploy/nginx.conf` and `serverActions.bodySizeLimit` in `next.config.ts` |
| `IMAGE_TAG` | Pin to a built tag so rollback is a one-word change |

Storage is set in `docker-compose.yml` rather than here, because it describes the
topology rather than the environment.

The application validates all of this at startup and **refuses to boot** on anything
missing or malformed, naming the variable. A bad value should fail the deploy, not the
event.

---

## 11. What is proven, and what is not

Being exact about this, because the difference matters when something fails at 9am.

**Verified on 25 September**, by building both images and running the stack against a
throwaway PostgreSQL container:

- Both images build from a clean checkout. The runtime image is **320 MB**.
- `prisma migrate deploy` applies all five migrations from the migrator image.
- The bootstrap super admin seeds from that same image.
- The app starts, reports healthy, and the Docker health check passes.
- Sign-in works, including the forced password change on first login.
- **An upload writes to the mounted volume and downloads back out of it.**
- The app runs as a non-root user (`uid=1001 nextjs`, group `nodejs`).
- Fonts are served from the image — no call to Google at build or at run time.
- `docker compose config` parses.

Three real defects were found by doing this, each of which would have failed a
production deployment:

| What broke | Why |
|---|---|
| Build failed at `prisma generate` | `prisma.config.ts` resolves `DIRECT_DATABASE_URL` at module load; nothing set it at build time |
| Build failed fetching fonts | `next/font/google` fetches from Google **at build time**, and the corporate proxy blocks it inside containers. Fonts are now vendored into the repository |
| **Every upload failed with `EACCES`** | A named volume initialises root-owned, and the app runs as uid 1001. The image now creates `/data/uploads` owned by `nextjs`, which is the ownership Docker copies onto a fresh volume |

**Not yet verified** — these need the VM:

- **nginx in front of the app.** The container has never proxied to it; TLS, the 25 MB
  upload limit and the streaming settings are unexercised.
- **PostgreSQL on the host** over `host.docker.internal:host-gateway`. The test used a
  PostgreSQL *container*, because the development machine's Postgres runs on Windows
  and is not reachable from a WSL container without firewall work. On the VM this is
  Linux-to-Linux, which is the case that mapping exists for — but it is untested.
- **A bind mount instead of a named volume.** If you mount a host directory rather than
  the named volume, ownership comes from the host and the image's ownership is *not*
  copied. The host directory must be `chown 1001:1001`.
- Load at anything like 1000 users.

## 12. Still open

| # | What is needed |
|---|---|
| **P3** | The VM itself — §1 is the specification to request |
| — | A load test at 1000+ users against this topology (Day 12); the numbers do not transfer from any other setup |
| — | A security pass |
| — | A dress rehearsal with real testers |

---

## Quick reference

```bash
cd /opt/wtq
docker compose --env-file production.env build
docker compose --env-file production.env run --rm migrator
docker compose --env-file production.env up -d --scale app=4
curl -fsS https://qa.example.com/api/health
```
