#!/usr/bin/env bash
# Copy this machine's checked-out tree to the event VM, then run
# scripts/deploy-remote.sh there to build the images, apply migrations and
# (re)start the app and nginx containers.
#
# Usage:
#   scripts/deploy.sh <vm_ip> <branch>
#
# Both are required — no default target, so you cannot fire this at the wrong VM by
# forgetting an argument. The branch must match the one actually checked out; the
# script refuses otherwise, so a mistyped name cannot deploy something else.
#
# If the connection drops after the code has copied, you do not need to re-run this.
# ssh in and finish on the VM:
#   ssh ubuntu@<vm_ip>
#   cd ~/wtq && ./scripts/deploy-remote.sh <branch>
#
# Override via environment variables:
#   REMOTE_USER, REMOTE_PATH (relative to the remote $HOME), APP_REPLICAS,
#   COMPOSE_ENV_FILE, SKIP_MIGRATIONS, ALLOW_DIRTY,
#   SEED_SUPER_ADMIN_EMAIL, SEED_SUPER_ADMIN_PASSWORD
#
# --- Two deliberate differences from the validation VM's deploy.sh ------------
#
# 1. tar over ssh, not rsync. This repository is deployed from Windows, and Git for
#    Windows ships no rsync — the rsync version of this script cannot run here at all.
#    tar and ssh are present everywhere.
#
#    The consequence is that nothing is ever deleted on the VM. For this stack that is
#    a feature rather than a compromise: `rsync --delete` pointed at a tree that does
#    not contain production.env or deploy/certs would take the TLS key and every
#    secret with it on the first run.
#
# 2. A clean working tree is required. The validation VM only warns, because deploying
#    a half-finished change to the application under test costs a redeploy. This VM
#    holds a thousand people's ID card numbers during a timed event, and "what exactly
#    is running?" has to have an answer. Override deliberately when you need a hotfix:
#
#      ALLOW_DIRTY=1 scripts/deploy.sh 10.0.5.99 main

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: scripts/deploy.sh <vm_ip> <branch>" >&2
  exit 1
fi

REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_HOST="$1"
REMOTE_PATH="${REMOTE_PATH:-wtq}"
APP_REPLICAS="${APP_REPLICAS:-2}"
COMPOSE_ENV_FILE="${COMPOSE_ENV_FILE:-production.env}"
SKIP_MIGRATIONS="${SKIP_MIGRATIONS:-0}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
BRANCH="$2"

if [[ "$BRANCH" != "$CURRENT_BRANCH" ]]; then
  echo "error: requested branch '$BRANCH' but '$CURRENT_BRANCH' is checked out — check it out first" >&2
  exit 1
fi

DIRTY=""
if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "${ALLOW_DIRTY:-0}" != "1" ]]; then
    echo "error: uncommitted changes in the working tree." >&2
    echo "       Commit them, or deploy anyway with: ALLOW_DIRTY=1 $0 $*" >&2
    git status --short >&2
    exit 1
  fi
  echo "warning: uncommitted changes WILL be deployed" >&2
  DIRTY="-dirty"
fi

# Docker tags are narrower than branch names: [A-Za-z0-9_][A-Za-z0-9._-]{0,127}, and
# notably no slashes. A release branch called `release-wtq-sp/v1.0.0` would otherwise
# produce `wtq-portal:release-wtq-sp/v1.0.0-900a4be`, which docker rejects as an
# invalid reference — after the tree has already been copied to the VM.
docker_tag() {
  printf '%s' "$1" \
    | sed 's/[^A-Za-z0-9._-]/-/g; s/^[^A-Za-z0-9_]*//' \
    | cut -c1-128
}

# The tag names the exact code running on the VM, so `docker ps` answers "what is
# deployed?" without anyone having to remember. It is also what a rollback selects.
SHORT_SHA="$(git rev-parse --short HEAD)"
RAW_TAG="${IMAGE_TAG:-${BRANCH}-${SHORT_SHA}${DIRTY}}"
IMAGE_TAG="$(docker_tag "$RAW_TAG")"

if [[ "$IMAGE_TAG" != "$RAW_TAG" ]]; then
  echo "note: '${RAW_TAG}' is not a valid docker tag; using '${IMAGE_TAG}'" >&2
fi

[[ -n "$IMAGE_TAG" ]] || { echo "error: could not derive a usable image tag from '$RAW_TAG'" >&2; exit 1; }

REMOTE_SSH="${REMOTE_USER}@${REMOTE_HOST}"

echo "==> Deploying ${BRANCH} (${SHORT_SHA}${DIRTY}) to ${REMOTE_SSH}:\$HOME/${REMOTE_PATH}"

ssh "$REMOTE_SSH" "mkdir -p \"\$HOME/${REMOTE_PATH}\""

# A list of every file being sent, so the VM can delete the ones that are not.
#
# tar only adds. That is deliberate for production.env and deploy/certs, which live
# only on the VM and must survive every deploy — but it also means a file deleted from
# the repository lingers there forever. It did: judge-select.tsx was removed in the
# release that replaced the Judge dropdown, stayed behind on the VM, and failed the
# build because `next build` type-checks every file it finds, including one nothing
# imports any more.
#
# So the payload now carries a manifest, and deploy-remote.sh prunes against it —
# inside an allowlist of code directories only, never anywhere a secret lives.
MANIFEST="${REPO_ROOT}/.deploy-manifest"
trap 'rm -f "$MANIFEST"' EXIT

git -C "$REPO_ROOT" ls-files --cached --others --exclude-standard > "$MANIFEST"
echo "==> Copying working tree ($(wc -l < "$MANIFEST" | tr -d ' ') files)"

# Everything excluded here either does not belong on the VM or already exists there
# and must survive. production.env and deploy/certs are the ones that matter: they are
# created once, by hand, and are not in the repository.
tar -czf - -C "$REPO_ROOT" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.storage' \
  --exclude='backups' \
  --exclude='*.log' \
  --exclude='production.env' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='deploy/certs' \
  --exclude='test-results' \
  --exclude='playwright-report' \
  --exclude='loadtest/accounts' \
  --exclude='loadtest/results' \
  . | ssh "$REMOTE_SSH" "tar -xzf - -C \"\$HOME/${REMOTE_PATH}\""

echo "==> Building and starting on ${REMOTE_SSH}"

# Config goes over as an env-var prefix rather than as positional arguments. ssh joins
# trailing arguments into one space-separated string for the remote shell to re-parse,
# so an empty argument vanishes and silently shifts every argument after it. Quoting
# each KEY=VALUE with printf %q before it reaches ssh sidesteps that entirely.
REMOTE_ENV=$(printf '%q ' \
  "IMAGE_TAG=$IMAGE_TAG" \
  "APP_REPLICAS=$APP_REPLICAS" \
  "COMPOSE_ENV_FILE=$COMPOSE_ENV_FILE" \
  "SKIP_MIGRATIONS=$SKIP_MIGRATIONS" \
  "SEED_SUPER_ADMIN_EMAIL=${SEED_SUPER_ADMIN_EMAIL:-}" \
  "SEED_SUPER_ADMIN_PASSWORD=${SEED_SUPER_ADMIN_PASSWORD:-}")
REMOTE_TAG_ARG=$(printf '%q' "$BRANCH")

ssh "$REMOTE_SSH" "cd \"\$HOME/${REMOTE_PATH}\" && ${REMOTE_ENV}bash scripts/deploy-remote.sh ${REMOTE_TAG_ARG}"

echo "==> Deploy of '${BRANCH}' (${IMAGE_TAG}) finished"
