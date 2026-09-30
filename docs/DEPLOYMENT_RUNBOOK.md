# Deployment runbook — VM 10.0.5.99

The exact sequence for deploying this portal to the event VM, written to be followed
top to bottom by someone doing it for the first time. Every command is meant to be
copied as-is unless it is marked **decide** or **from IT**.

`docs/DEPLOYMENT.md` explains *why* the stack is shaped this way. This file is the
*what to type*.

**Target:** `10.0.5.99`, Ubuntu 24.04 LTS, user `ubuntu`
**Access:** hostname supplied by IT, real certificate, HTTPS
**Database:** PostgreSQL on the VM itself, not in a container

---

## How the pieces fit

Steps 0–7 prepare the machine and are done **once, by hand, on the VM**. From Step 8
onward every deploy is one command **from your laptop**, and `scripts/deploy.sh` does
the work — including the very first deploy.

| | Where | What |
|---|---|---|
| Steps 0–3 | on the VM | Secure the login, install Docker and PostgreSQL |
| Steps 4–7 | on the VM | Create the directory, secrets, certificate and `production.env` |
| Step 8 | **from your laptop** | `scripts/deploy.sh` — copies code, builds, migrates, seeds, starts, waits for health |
| Steps 9–10 | in the browser / on the VM | Configure the event, firewall, backups |

You do **not** need to clone the repository on the VM. `deploy.sh` copies your working
tree across every time it runs, and deliberately never overwrites `production.env` or
`deploy/certs` — which is why those are created by hand first and survive every
subsequent deploy.

---

## Before you start

Three things that are easier to do now than to fix later.

### 1. The SSH password is compromised

It was typed into a chat transcript. Change it in Step 1 and move to key-based login.
This is not paranoia: this machine will hold a thousand people's ID card numbers.

### 2. Two secrets can never be changed once registration opens

`CNIC_PEPPER` and `CNIC_ENCRYPTION_KEY` are generated in Step 5.

- Change the pepper later and **every participant's ID-card login stops matching**.
- Lose the encryption key and **every stored ID card becomes unreadable** — the admin
  console shows nothing, and there is no recovery.

They must be generated once, backed up off this VM, and held by at least two people
before anybody registers. Step 5 stops and makes you do this.

### 3. You need one thing from IT before Step 6

- A DNS name pointing at `10.0.5.99` — say `qa.10pearls.com`
- The certificate chain and private key for it

Ask now; it is the item most likely to be slow. Everything up to Step 5 can be done
while you wait.

---

## Step 0 — Connect and take stock

From PowerShell on your laptop:

```powershell
ssh ubuntu@10.0.5.99
```

Then, on the VM, run this whole block and keep the output:

```bash
echo "── OS ──"
. /etc/os-release && echo "$PRETTY_NAME"
uname -m

echo "── resources ──"
nproc
free -h | awk '/Mem:/ {print "RAM: " $2}'
df -h / | awk 'NR==2 {print "Disk: " $4 " free of " $2}'

echo "── already installed? ──"
command -v docker  >/dev/null && docker --version           || echo "docker: NOT installed"
command -v psql    >/dev/null && psql --version             || echo "postgres client: NOT installed"
systemctl is-active postgresql 2>/dev/null                  || echo "postgres service: not running"
command -v git     >/dev/null && git --version              || echo "git: NOT installed"

echo "── internet access? ──"
# No -f here. registry-1.docker.io/v2/ answers 401 to an unauthenticated request by
# design, and -f would report that correct answer as a failure — which it did, once.
# What matters is that an HTTP response came back at all: 401 or 200 both mean
# reachable, 000 means nothing answered.
for probe in "docker hub|https://registry-1.docker.io/v2/" "github|https://github.com"; do
  name="${probe%%|*}"; url="${probe#*|}"
  code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo 000)
  case "$code" in
    000) echo "$name: UNREACHABLE" ;;
    *)   echo "$name: reachable (HTTP $code)" ;;
  esac
done
env | grep -i proxy || echo "no proxy variables set"

echo "── sudo? ──"
sudo -n true 2>/dev/null && echo "sudo: passwordless" || echo "sudo: needs password"
```

**What the answers change:**

| Result | Effect |
|---|---|
| Docker missing | Do Step 2 |
| PostgreSQL missing | Do Step 3 in full |
| Either host says `UNREACHABLE` | Stop — you need the offline path, ask me |
| A proxy is set | Stop — Docker needs proxy config, ask me |
| Less than 4 GB RAM or 40 GB disk | Stop — see *VM sizing* at the end |
| `*** System restart required ***` at login | Do it now, before installing anything |

If the banner also offers a **new Ubuntu release** (`do-release-upgrade`), do **not**
take it before the event. Security updates on the current release are routine; a
distribution upgrade days before a one-shot event is not.

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo reboot
```

---

## Step 1 — Secure the account

```bash
# New password. Use something long; you will rarely type it after this.
passwd
```

Then set up key login. **On your laptop**, in PowerShell:

```powershell
# Only if you do not already have a key
ssh-keygen -t ed25519 -C "wtq-deploy"

# Copy it to the VM (it will ask for the NEW password once)
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh ubuntu@10.0.5.99 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Open a **second** PowerShell window and confirm `ssh ubuntu@10.0.5.99` now works without
a password *before* closing the first one. Locking yourself out of a VM you just got is
a bad afternoon.

---

## Step 2 — Install Docker

Skip if Step 0 reported a version.

### Before you paste anything with `sudo` in it

Run this on its own first and enter your password:

```bash
sudo -v
```

Pasting a multi-line block that contains `sudo` without doing this **silently breaks
the block**. The first `sudo` stops and prompts for a password; the terminal feeds it
the *next line of your paste* as the password, gets `Sorry, try again`, and eats the
line after that too. You end up with two or three commands consumed as failed password
attempts and no obvious sign which ones. `sudo -v` caches the credential for about
fifteen minutes so nothing prompts mid-paste.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo
sudo usermod -aG docker $USER
```

**Log out and back in** — group membership only applies to a new login session — then
confirm all four of these:

```bash
docker --version                  # the engine
docker compose version            # the v2 plugin, which is a SEPARATE package
id -nG | tr ' ' '\n' | grep -x docker && echo "in the docker group"
docker run --rm hello-world       # proves the daemon works without sudo
```

All four must pass before Step 8, because `deploy-remote.sh` checks the same things and
will stop if any is missing.

**If `docker compose version` says "is not a docker command"** you have the engine but
not the Compose v2 plugin — most likely because Docker came from Ubuntu's own
`docker.io` package rather than from Docker's repository above. Either is fine, but the
plugin has to be installed explicitly:

```bash
sudo apt-get install -y docker-compose-v2
docker compose version
```

**If `docker run hello-world` says "permission denied ... docker.sock"** the `usermod`
line did not take effect. Run it again and start a completely new SSH session:

```bash
sudo usermod -aG docker $USER
exit
```

---

## Step 3 — PostgreSQL on the VM

### 3a. Install

```bash
sudo apt-get install -y postgresql postgresql-contrib
systemctl status postgresql --no-pager
```

### 3b. Create the database and its user

Pick a strong database password and keep it to hand — it goes into `production.env`
in Step 7.

```bash
# decide: replace CHOOSE_A_DB_PASSWORD
sudo -u postgres psql <<'SQL'
CREATE USER wtq_app WITH PASSWORD 'CHOOSE_A_DB_PASSWORD';
CREATE DATABASE wtq2026 OWNER wtq_app;
GRANT ALL PRIVILEGES ON DATABASE wtq2026 TO wtq_app;
SQL
```

### 3c. Let the containers reach it

This is the step that most often goes wrong. The app runs in a container and reaches
the host database through Docker's gateway, so PostgreSQL has to listen on more than
localhost and has to trust Docker's subnet.

```bash
# Find your version (16 on 24.04, 14 on 22.04)
PGVER=$(ls /etc/postgresql | head -1)
echo "PostgreSQL $PGVER"

# Listen on all interfaces (the firewall in Step 11 is what keeps it private)
sudo sed -i "s/^#\?listen_addresses.*/listen_addresses = '*'/" /etc/postgresql/$PGVER/main/postgresql.conf
```

Allow Docker's private ranges, password-authenticated. Written as a heredoc rather than
as `echo … | sudo tee …/pg_hba.conf`, because that line is long enough to wrap in an
SSH session and it wraps *inside the file path* — producing `_hba.conf: command not
found` and a `pg_hba.conf` that was never touched. A heredoc has no long line to wrap.

```bash
sudo tee -a /etc/postgresql/$PGVER/main/pg_hba.conf > /dev/null <<'EOF'
host    wtq2026    wtq_app    172.16.0.0/12    scram-sha-256
EOF

sudo systemctl restart postgresql
```

Confirm the two edits actually landed, rather than assuming:

```bash
grep -E "^listen_addresses" /etc/postgresql/$PGVER/main/postgresql.conf
sudo tail -2 /etc/postgresql/$PGVER/main/pg_hba.conf
sudo ss -lntp | grep 5432
```

`pg_hba.conf` is mode 640 owned by root, so reading it needs `sudo` — without it you
get `Permission denied`, which looks like the file is missing rather than merely
unreadable.

You want to see `listen_addresses = '*'`, the `wtq2026` line, and something listening on
`0.0.0.0:5432`.

### Prove a container can actually reach it

The checks above show the configuration is right. This shows it *works*, which is not
the same thing, and it is the failure that otherwise surfaces much later as a migrator
that cannot connect:

```bash
read -rsp "DB password: " PGPASSWORD; echo
docker run --rm -e PGPASSWORD \
  --add-host host.docker.internal:host-gateway \
  postgres:16 psql -h host.docker.internal -U wtq_app -d wtq2026 \
  -c "select 'containers can reach postgres' as result"
unset PGPASSWORD
```

`read -rsp` keeps the password out of your shell history. If this prints the message,
Step 3 is genuinely finished.

---

## Step 4 — Make the deployment directory

The code arrives in Step 8, copied by `scripts/deploy.sh`. All this step does is create
the directory the next three steps put things into.

```bash
mkdir -p ~/wtq/deploy/certs
cd ~/wtq
```

Nothing else is needed here. If you would rather build on the VM from a git checkout
instead of copying from your laptop, clone into `~/wtq` — but the certificate and
`production.env` still go where Steps 6 and 7 put them, and `deploy.sh` will not touch
either.

---

## Step 5 — Generate the secrets ⚠️

```bash
cd ~/wtq
echo "SESSION_SECRET=$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=')"
echo "CNIC_PEPPER=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
echo "CNIC_ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

`CNIC_ENCRYPTION_KEY` must stay standard base64 — it decodes to exactly 32 bytes for
AES-256, and the app refuses to start if it does not.

### Do not continue until these are backed up

Copy all three into your organisation's password manager, in an entry at least two
people can reach. Not on this VM. Not in the repository. Not in chat.

Read *Before you start §2* again if you are tempted to skip this. Losing the
encryption key after registration opens means every stored ID card is gone, and the
only fix is making a thousand people register again.

---

## Step 6 — Install a certificate

Two paths. Pick **6B** if IT has not given you a DNS name yet; you can deploy today and
switch to the real certificate later without redoing anything else.

**What you cannot do is serve this over plain `http://`.** The session cookie is marked
`Secure` whenever `NODE_ENV=production` (`src/lib/session.ts`), and browsers refuse to
store a Secure cookie delivered over http. Login would appear to succeed and bounce
straight back to the login page, for everybody, with nothing in the logs to explain it.
Hence a self-signed certificate rather than no certificate: it keeps the topology, the
nginx config and the cookie behaviour identical to production, so the eventual switch
changes two files and one line.

### 6A — The real certificate from IT

```bash
mkdir -p ~/wtq/deploy/certs
```

Copy the two files IT gave you into `~/wtq/deploy/certs/`, named exactly:

- `fullchain.pem` — the certificate **and** any intermediates, in that order
- `privkey.pem` — the private key

From your laptop:

```powershell
scp fullchain.pem privkey.pem ubuntu@10.0.5.99:~/wtq/deploy/certs/
```

Lock the key down and check the pair actually matches:

```bash
chmod 600 ~/wtq/deploy/certs/privkey.pem

# These two hashes must be identical
openssl x509 -noout -modulus -in ~/wtq/deploy/certs/fullchain.pem | openssl md5
openssl rsa  -noout -modulus -in ~/wtq/deploy/certs/privkey.pem   | openssl md5

# And check the name and expiry
openssl x509 -noout -subject -dates -in ~/wtq/deploy/certs/fullchain.pem
```

If the hashes differ, the certificate and key are not a pair and nginx will not start.
Go back to IT.

### 6B — A self-signed certificate for the IP, while you wait for DNS

Run this **on the VM**. The `subjectAltName` is the part that matters: browsers have
ignored the common name for years, and a certificate without an `IP:` SAN is rejected
outright rather than merely warned about.

```bash
mkdir -p ~/wtq/deploy/certs
cd ~/wtq

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout deploy/certs/privkey.pem \
  -out deploy/certs/fullchain.pem \
  -subj "/CN=10.0.5.99" \
  -addext "subjectAltName=IP:10.0.5.99"

chmod 600 deploy/certs/privkey.pem
openssl x509 -noout -subject -dates -ext subjectAltName -in deploy/certs/fullchain.pem
```

Everyone who opens the site will get a full-page browser warning and have to choose
**Advanced → Proceed**. That is correct behaviour, not a fault: the certificate really
is unverifiable. It is fine while the only people looking are you and your team.

**Do not run the event on this.** A thousand participants being told to click through a
security warning is both a support problem and a bad habit to teach a room full of QA
engineers. Chase IT for the real name and certificate before the 10th.

---

## Step 7 — Write production.env

```bash
cd ~/wtq
cp deploy/production.env.example production.env
chmod 600 production.env
nano production.env
```

Fill in, using the database password from Step 3b and the secrets from Step 5:

```ini
DATABASE_URL="postgresql://wtq_app:YOUR_DB_PASSWORD@host.docker.internal:5432/wtq2026"
DIRECT_DATABASE_URL="postgresql://wtq_app:YOUR_DB_PASSWORD@host.docker.internal:5432/wtq2026"

SESSION_SECRET="…from Step 5…"
CNIC_PEPPER="…from Step 5…"
CNIC_ENCRYPTION_KEY="…from Step 5…"

# Must match the certificate's name exactly, and start with https://
#   with DNS (6A):        https://qa.10pearls.com
#   IP only (6B):         https://10.0.5.99
APP_URL="https://10.0.5.99"

MAX_UPLOAD_MB="20"
IMAGE_TAG="wtq-1"
```

A mismatch between `APP_URL` and the real hostname produces download links pointing at
the wrong host, which a judge only discovers when a PDF will not open.

Confirm it is not tracked by git — this file holds every secret you have:

```bash
git check-ignore -v production.env   # must print a .gitignore line
```

---

## Step 8 — Deploy

**This one runs on your laptop, not on the VM.** Everything up to here was preparation;
this is the deploy, and it is the same command every time afterwards.

From the project folder, on the branch you want to release:

```bash
git checkout release-wtq-sp/v1.0.0

SEED_SUPER_ADMIN_EMAIL="hammad.mahmood@10pearls.com" \
SEED_SUPER_ADMIN_PASSWORD="CHOOSE_A_STRONG_PASSWORD" \
scripts/deploy.sh 10.0.5.99 release-wtq-sp/v1.0.0
```

The two `SEED_` values are only needed the **first** time — they create the one account
that exists to begin with. Every later deploy is just:

```bash
scripts/deploy.sh 10.0.5.99 release-wtq-sp/v1.0.0
```

The script copies the working tree, then on the VM runs a preflight, builds, applies
migrations, ensures the settings and bootstrap admin, starts two app replicas and nginx,
and waits until health passes through TLS before reporting success. Ten to fifteen
minutes the first time, mostly the image build; a couple of minutes after that.

It refuses early rather than half-deploying. If preflight fails, nothing has changed —
read what it said, fix it, run it again.

Two guards to know about:

- The branch argument must match the branch you have checked out.
- A dirty working tree is refused. For a hotfix:
  `ALLOW_DIRTY=1 scripts/deploy.sh 10.0.5.99 <branch>`

Afterwards, change that admin password from inside the console, and clear it from your
shell history.

### If you need to do it by hand

The script is only a wrapper. On the VM, these are the same four operations, in the
order that matters — migrations before the new containers start, never on container
boot, because replicas booting together must not race each other applying one
migration:

```bash
cd ~/wtq
docker compose --env-file production.env build
docker compose --env-file production.env run --rm migrator
docker compose --env-file production.env run --rm \
  -e SEED_SUPER_ADMIN_EMAIL="…" -e SEED_SUPER_ADMIN_PASSWORD="…" \
  migrator pnpm tsx prisma/seed.ts
docker compose --env-file production.env up -d --scale app=2
```

Confirm the schema landed:

```bash
sudo -u postgres psql -d wtq2026 -c '\dt' | head -20
```

If the migrator cannot connect, Step 3c is the cause nine times out of ten.

### If the connection drops mid-deploy

The code is already on the VM. Finish there rather than starting over:

```bash
ssh ubuntu@10.0.5.99
cd ~/wtq && ./scripts/deploy-remote.sh release-wtq-sp/v1.0.0
```

---

## Step 9 — Verify

On the VM:

```bash
curl -sk https://localhost/api/health | head -c 400; echo
```

Expect `"status":"ok"` and `"database":"ok"`.

From your laptop's browser, against the real hostname:

1. `https://qa.10pearls.com` loads with a valid padlock, no warning
2. `http://qa.10pearls.com` redirects to https
3. Log in as the super admin from Step 10 — **if login bounces back to the login
   page, TLS is not reaching the app**; see Troubleshooting
4. The admin Overview loads

Watch the logs while you click:

```bash
docker compose --env-file production.env logs -f app
```

---

## Step 10 — Configure the event ⚠️ easy to forget

The seed sets every maximum score to `0`, which means *not yet configured*, and the
judging screens refuse to accept scores until real values are set. Judges cannot work
until you do this.

In the admin console:

1. **Overview → Event configuration** — set the application URL participants will test,
   and upload the Challenge 4 CSV
2. **Scoring** — set the real maximum for each challenge
3. Create the judges, or bulk-create them from CSV
4. Bulk-create the participants from CSV
5. Leave the **master password switched off** until somebody actually needs it

---

## Step 11 — Firewall and backups

### Firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status numbered
```

Port 5432 must **not** appear. PostgreSQL listens on all interfaces for Docker's
benefit; the firewall is what stops the rest of the network reaching it.

### Backups

Two things need backing up, and they need backing up differently. The database is small
and changes constantly. The uploads are large and only ever grow.

**Do not take hourly tarballs of the uploads.** A thousand participants can put tens of
gigabytes into that volume, and seven days of hourly snapshots of it would fill this
98 GB disk during the event — taking PostgreSQL and the application down with it,
which is the exact disaster the backups were for.

So: the database is snapshotted hourly and kept, and the uploads are **mirrored**, one
copy, updated in place.

```bash
sudo apt-get install -y rsync
mkdir -p ~/backups/db ~/backups/uploads

cat > ~/backup-wtq.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# Refuse to run when the disk is nearly full. A backup that fills the last of the
# disk turns a recoverable situation into an outage.
AVAIL_MB=$(df -Pm "$HOME" | awk 'NR==2 {print $4}')
if [[ "$AVAIL_MB" -lt 5000 ]]; then
  echo "$(date -Is) SKIPPED — only ${AVAIL_MB}MB free" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M)

# Small, compressed, point-in-time. Keep a week of these.
sudo -u postgres pg_dump -Fc wtq2026 > "$HOME/backups/db/db-$STAMP.dump"
find "$HOME/backups/db" -name 'db-*.dump' -mtime +7 -delete

# One mirror, not a history. Only new and changed files move, so this stays fast
# however large the volume grows.
UPLOADS=$(docker volume inspect wtq_uploads -f '{{ .Mountpoint }}')
sudo rsync -a --delete "$UPLOADS/" "$HOME/backups/uploads/"

echo "$(date -Is) ok — db-$STAMP, uploads mirrored, ${AVAIL_MB}MB free"
EOF

chmod +x ~/backup-wtq.sh
~/backup-wtq.sh
```

Hourly on event day:

```bash
(crontab -l 2>/dev/null; echo "0 * * * * $HOME/backup-wtq.sh >> $HOME/backups/backup.log 2>&1") | crontab -
```

### Get a copy off the VM

Everything above is on the same disk as the thing it protects, which is no help if the
disk or the VM goes. Before the event, and again straight after judging, pull a copy to
somewhere else — from your laptop:

```powershell
scp -r ubuntu@10.0.5.99:~/backups ./wtq-backup-(Get-Date -Format yyyyMMdd)
```

### Rehearse the restore

A backup nobody has restored is a hypothesis. Once, before the event:

```bash
sudo -u postgres createdb wtq_restore_test
sudo -u postgres pg_restore -d wtq_restore_test ~/backups/db/db-*.dump
sudo -u postgres psql -d wtq_restore_test -c 'SELECT count(*) FROM users;'
sudo -u postgres dropdb wtq_restore_test
```

---

## Switching from the IP to the real DNS name

When IT delivers the name and certificate, this is the whole change. Nothing is
rebuilt, no migration runs, and the database and uploads are untouched.

```bash
ssh ubuntu@10.0.5.99
cd ~/wtq

# 1. Replace the two certificate files (scp them up first from your laptop)
chmod 600 deploy/certs/privkey.pem
openssl x509 -noout -modulus -in deploy/certs/fullchain.pem | openssl md5
openssl rsa  -noout -modulus -in deploy/certs/privkey.pem   | openssl md5   # must match

# 2. Point APP_URL at the new name
nano production.env        # APP_URL="https://qa.10pearls.com"

# 3. Restart only what needs it
docker compose --env-file production.env up -d --force-recreate app nginx
```

`app` is recreated as well as `nginx` because `APP_URL` is read at startup and is what
signed file links are built from — leaving the old value would produce download links
pointing at the IP from a site served under the name.

Then confirm, from a browser:

- `https://qa.10pearls.com` loads with a **valid padlock and no warning**
- Log in, and open a participant's uploaded PDF from the judge view — that exercises
  the signed-link path `APP_URL` feeds

One thing to know about the switch: nginx sends `Strict-Transport-Security` with a
one-year max-age. Browsers ignore HSTS on a bare IP, so nothing sticks while you are on
`10.0.5.99` — but from the first load of the real hostname, that browser will refuse
plain http for that name for a year. That is what you want; it just means the hostname
must keep working over TLS from then on.

---

## Rollback

`scripts/deploy.sh` tags each image `<branch>-<short sha>` and records what it started
in `~/wtq/.deployed-tag`, so the previous release is always nameable:

```bash
ssh ubuntu@10.0.5.99
cd ~/wtq
docker images | grep wtq-portal          # the tags you have to choose from

IMAGE_TAG=main-97fd772 docker compose --env-file production.env up -d --scale app=2
```

If a deploy fails partway, `deploy-remote.sh` prints this exact command with the
previous tag already filled in. A failed deploy leaves the old release serving.

Rolling back **code** is safe. Rolling back the **database** is not — restore a dump
only if you accept losing everything saved since it was taken.

---

## Troubleshooting

**Login bounces back to the login page.**
The session cookie is `Secure`, so it is only stored over HTTPS. Either you reached the
app over plain http, or nginx is not passing `X-Forwarded-Proto`. Check you used
`https://`, and that `deploy/nginx.conf` is mounted:
`docker compose --env-file production.env exec nginx cat /etc/nginx/conf.d/default.conf | grep Forwarded-Proto`

**`Can't reach database server at host.docker.internal:5432`.**
Step 3c. Check `listen_addresses = '*'` took effect, the `pg_hba.conf` line is present,
and PostgreSQL was restarted after both.

**nginx exits immediately.**
Usually missing or mismatched certificates. `docker compose --env-file production.env logs nginx`
and re-check Step 6.

**`EACCES: permission denied, mkdir '/data/uploads/challenge4'`.**
The uploads volume is owned by root while the app runs as uid 1001:
`docker run --rm -v wtq_uploads:/data alpine chown -R 1001:1001 /data`

**413 Request Entity Too Large on a PDF upload.**
Raising `MAX_UPLOAD_MB` needs `client_max_body_size` in `deploy/nginx.conf` and
`serverActions.bodySizeLimit` in `next.config.ts` raised to match.

**Containers restart in a loop.**
`docker compose --env-file production.env logs app | head -50`. A malformed value in
`production.env` fails validation at startup on purpose — the error names the variable.

---

## VM sizing

For 1000+ participants working simultaneously, with two app replicas and PostgreSQL on
the same machine:

| | Minimum | Recommended |
|---|---|---|
| vCPU | 4 | 8 |
| RAM | 8 GB | 16 GB |
| Disk | 60 GB SSD | 120 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

Disk is the one people underestimate: 1000 participants × a 20 MB report × two
challenges is 40 GB of uploads before the database, the images or the backups.

Ports inbound: 22 (restricted to the admin network), 80 and 443. Nothing else.
