#!/usr/bin/env bash
# Runs ON the VM, from the deployed directory. scripts/deploy.sh calls this after
# copying the tree; you can also run it directly when a deploy is interrupted:
#
#   ssh ubuntu@10.0.5.99
#   cd ~/wtq && ./scripts/deploy-remote.sh main
#
# Order matters and is not negotiable:
#
#   preflight → build → migrate → seed → start → wait for health
#
# Migrations run as their own step, before anything starts, because several app
# replicas booting at the same moment must not race each other applying one migration.
# They also run against the OLD containers still serving traffic, which is why every
# migration in this project has to be backwards compatible with the release before it.
#
# Nothing here is destructive. It never touches production.env, the certificates, the
# uploads volume or the database contents — a failed run leaves the previous release
# serving, and prints the command to put it back.

set -euo pipefail

BRANCH="${1:-unknown}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
APP_REPLICAS="${APP_REPLICAS:-2}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-production.env}"
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

cd "$(dirname "$0")/.."

# IMAGE_TAG is exported rather than written into production.env: a shell variable wins
# over --env-file for interpolation, so the stack runs this tag without the file on
# disk being edited by a script. The file stays something a person owns.
export IMAGE_TAG

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" "$@"
}

say() { echo "==> $*"; }
fail() { echo "error: $*" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
# Everything that can be checked before anything changes, is. A deploy that stops here
# has changed nothing at all.

say "Preflight"

command -v docker >/dev/null || fail "docker is not installed — see docs/DEPLOYMENT_RUNBOOK.md step 2"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin is missing"
docker info >/dev/null 2>&1 || fail "cannot talk to the docker daemon (are you in the docker group? log out and back in)"

[[ -f "$COMPOSE_ENV_FILE" ]] || fail "$COMPOSE_ENV_FILE not found. Copy deploy/production.env.example and fill it in (runbook step 7)"

# Checked here as well as in deploy.sh, because IMAGE_TAG can also arrive from
# production.env or from someone running this script by hand. Docker's own complaint
# about an invalid reference does not mention the tag rules, and it surfaces after the
# build has already started.
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$ ]] \
  || fail "IMAGE_TAG '$IMAGE_TAG' is not a valid docker tag (no slashes; must start with a letter, digit or underscore)"

# A world-readable file holding the session secret and the encryption key is worth one
# line to prevent.
PERMS="$(stat -c '%a' "$COMPOSE_ENV_FILE")"
if [[ "$PERMS" != "600" ]]; then
  echo "warning: $COMPOSE_ENV_FILE is mode $PERMS; tightening to 600" >&2
  chmod 600 "$COMPOSE_ENV_FILE"
fi

for required in DATABASE_URL DIRECT_DATABASE_URL SESSION_SECRET CNIC_PEPPER CNIC_ENCRYPTION_KEY APP_URL; do
  grep -qE "^${required}=" "$COMPOSE_ENV_FILE" || fail "$COMPOSE_ENV_FILE is missing $required"
  grep -qE "^${required}=\"?CHANGE_ME" "$COMPOSE_ENV_FILE" && fail "$required is still CHANGE_ME in $COMPOSE_ENV_FILE"
done

APP_URL_VALUE="$(grep -E '^APP_URL=' "$COMPOSE_ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
# The session cookie is Secure whenever NODE_ENV is production, and a browser will not
# store a Secure cookie delivered over http. An http APP_URL therefore produces a
# deployment where login silently fails for everyone, which is not something to
# discover on the morning of the event.
[[ "$APP_URL_VALUE" == https://* ]] || fail "APP_URL must start with https:// (it is '$APP_URL_VALUE') — logins cannot work over plain http"

[[ -f deploy/certs/fullchain.pem ]] || fail "deploy/certs/fullchain.pem missing — nginx will not start (runbook step 6)"
[[ -f deploy/certs/privkey.pem ]] || fail "deploy/certs/privkey.pem missing — nginx will not start (runbook step 6)"

# A certificate and key that are not a pair is the single most common reason nginx
# exits on boot, and the error it prints does not say so.
CERT_MOD="$(openssl x509 -noout -modulus -in deploy/certs/fullchain.pem 2>/dev/null | openssl md5)"
KEY_MOD="$(openssl rsa -noout -modulus -in deploy/certs/privkey.pem 2>/dev/null | openssl md5)"
[[ "$CERT_MOD" == "$KEY_MOD" ]] || fail "deploy/certs: certificate and private key are not a pair"

CERT_EXPIRY="$(openssl x509 -noout -enddate -in deploy/certs/fullchain.pem | cut -d= -f2)"
if ! openssl x509 -checkend 604800 -noout -in deploy/certs/fullchain.pem >/dev/null; then
  echo "warning: TLS certificate expires within 7 days ($CERT_EXPIRY)" >&2
fi

say "Preflight passed — APP_URL=$APP_URL_VALUE, certificate valid until $CERT_EXPIRY"

# What is running now, so a failure can name the way back.
PREVIOUS_TAG="$(cat .deployed-tag 2>/dev/null || echo "")"

rollback_hint() {
  if [[ -n "$PREVIOUS_TAG" ]]; then
    echo "" >&2
    echo "The previous release is still recorded as '$PREVIOUS_TAG'. To go back:" >&2
    echo "  cd $(pwd) && IMAGE_TAG=$PREVIOUS_TAG docker compose --env-file $COMPOSE_ENV_FILE up -d --scale app=$APP_REPLICAS" >&2
  fi
}

# --- build -------------------------------------------------------------------

say "Building images (tag: $IMAGE_TAG)"
compose build

# --- migrate -----------------------------------------------------------------

if [[ "$SKIP_MIGRATIONS" == "1" ]]; then
  say "Skipping migrations (SKIP_MIGRATIONS=1)"
else
  say "Applying migrations"
  compose run --rm migrator || { rollback_hint; fail "migrations failed — nothing was restarted, the previous release is still serving"; }
fi

# --- seed --------------------------------------------------------------------
# Idempotent, so it runs every deploy. Existing settings are left alone and an
# existing super admin is skipped; without SEED_SUPER_ADMIN_* it only ensures the
# default application settings exist.

say "Ensuring default settings and bootstrap admin"
compose run --rm \
  -e SEED_SUPER_ADMIN_EMAIL="${SEED_SUPER_ADMIN_EMAIL:-}" \
  -e SEED_SUPER_ADMIN_PASSWORD="${SEED_SUPER_ADMIN_PASSWORD:-}" \
  migrator pnpm tsx prisma/seed.ts

# --- start -------------------------------------------------------------------

say "Starting app (${APP_REPLICAS} replicas) and nginx"
compose up -d --scale "app=${APP_REPLICAS}" --remove-orphans

# --- wait for health ---------------------------------------------------------
# Compose returns as soon as the containers are created, which is well before Next.js
# is answering. Reporting success then would mean the script is green while the site
# is still returning 502.

say "Waiting for health (up to ${HEALTH_TIMEOUT}s)"

deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while true; do
  ids="$(compose ps -q app)"
  total="$(echo "$ids" | grep -c . || true)"
  healthy=0

  for id in $ids; do
    state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo unknown)"
    [[ "$state" == "healthy" || "$state" == "running" ]] && healthy=$((healthy + 1))
  done

  if [[ "$total" -gt 0 && "$healthy" -eq "$total" ]]; then
    say "All ${total} app replicas healthy"
    break
  fi

  if [[ $(date +%s) -ge $deadline ]]; then
    echo "" >&2
    echo "--- app logs (last 50 lines) ---" >&2
    compose logs --tail=50 app >&2 || true
    rollback_hint
    fail "app did not become healthy within ${HEALTH_TIMEOUT}s"
  fi

  sleep 5
done

# --- verify through the front door -------------------------------------------
# Through nginx and TLS rather than straight at the app, because that path is what
# participants use and it is where a certificate or proxy mistake shows up.

say "Checking https://localhost/api/health"
HEALTH="$(curl -sk --max-time 15 https://localhost/api/health || echo '')"

if ! echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "health response: ${HEALTH:-<empty>}" >&2
  echo "--- nginx logs (last 30 lines) ---" >&2
  compose logs --tail=30 nginx >&2 || true
  rollback_hint
  fail "the stack is up but /api/health is not ok"
fi

if ! echo "$HEALTH" | grep -q '"database":"ok"'; then
  echo "health response: $HEALTH" >&2
  fail "the app is running but cannot reach PostgreSQL — see runbook step 3c"
fi

# --- record and tidy ---------------------------------------------------------

echo "$IMAGE_TAG" > .deployed-tag

# Keeps a few releases' worth of images for rollback without filling the disk. Only
# dangling layers go; tagged images are left alone.
docker image prune -f >/dev/null 2>&1 || true

say "Deployed '${BRANCH}' as ${IMAGE_TAG}"
say "Health: $(echo "$HEALTH" | head -c 200)"
compose ps
