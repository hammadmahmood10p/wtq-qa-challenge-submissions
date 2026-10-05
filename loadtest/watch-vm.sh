#!/usr/bin/env bash
# Records what the VM is doing while a load test runs, and reports the peaks.
#
# Runs ON the VM, in its own SSH session, for the whole test:
#   ./loadtest/watch-vm.sh
#
# Ctrl-C when the test finishes and it prints a summary. Also writes every sample to
# ~/loadtest-vm.log so the shape over time survives the terminal.
#
# `watch` was the first suggestion and it is the wrong tool: it shows you the current
# value and throws away the previous one, so the only way to capture a peak is to be
# looking at the screen when it happens. Over a two-hour run, nobody is. The first
# attempt duly produced a reading taken ten minutes after the test had finished — the
# VM at rest, which answers a question nobody asked.
#
# These are the three numbers k6 cannot see, and the ones most likely to break first:
#   memory         — 7.8 GB total, two Node replicas plus PostgreSQL
#   db connections — the pool is capped at 10 per replica, so 20 is the ceiling
#   cpu            — 8 vCPU; saturation during a sign-in burst is expected, Argon2id
#                    is meant to be expensive

set -uo pipefail

INTERVAL="${INTERVAL:-5}"
LOG="${LOG:-$HOME/loadtest-vm.log}"
DB="${DB:-wtq2026}"

peak_used_mb=0
peak_conns=0
peak_app_mb=0
samples=0

summary() {
  echo
  echo "────────────────────────────────────────────"
  echo "  Peaks over ${samples} samples (${INTERVAL}s apart)"
  echo "────────────────────────────────────────────"
  echo "  system memory used      ${peak_used_mb} MB of $(free -m | awk '/^Mem:/ {print $2}') MB"
  echo "  app containers combined ${peak_app_mb} MB"
  if [[ "$peak_conns" -eq 0 ]]; then
    echo "  database connections    NOT MEASURED — sudo needs a password and no fallback worked"
  else
    echo "  database connections    ${peak_conns} (pool ceiling is 20)"
  fi
  echo
  echo "  Full sample log: ${LOG}"
  echo "────────────────────────────────────────────"
  exit 0
}

trap summary INT TERM

echo "Sampling every ${INTERVAL}s. Ctrl-C when the test finishes."
echo "timestamp,mem_used_mb,app_mem_mb,db_connections,load1" > "$LOG"

while true; do
  used_mb=$(free -m | awk '/^Mem:/ {print $3}')

  # Container memory in MiB, summed across the app replicas only — nginx is noise.
  app_mb=$(docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' 2>/dev/null \
    | awk '/wtq-app/ {gsub(/MiB/,"",$2); sum += $2} END {printf "%d", sum}')
  app_mb=${app_mb:-0}

  # Two routes, because `sudo -n` fails without passwordless sudo — and the first
  # version of this reported that failure as "0 connections", which reads as a
  # measurement rather than as the absence of one. A metric that cannot distinguish
  # "nothing connected" from "I could not look" is worse than no metric.
  conns=$(sudo -n -u postgres psql -tAc \
    "select count(*) from pg_stat_activity where datname='${DB}';" 2>/dev/null | tr -d ' ')

  if [[ -z "$conns" ]] && [[ -f production.env ]]; then
    # Fall back to the application's own credentials. A non-superuser still sees every
    # backend's row in pg_stat_activity, which is all a count needs.
    url=$(grep -E '^DIRECT_DATABASE_URL=' production.env | head -1 | cut -d= -f2- | tr -d '"')
    url=${url/host.docker.internal/127.0.0.1}
    conns=$(psql "$url" -tAc \
      "select count(*) from pg_stat_activity where datname='${DB}';" 2>/dev/null | tr -d ' ')
  fi

  conns=${conns:-unavailable}

  load1=$(awk '{print $1}' /proc/loadavg)

  [[ "$used_mb" -gt "$peak_used_mb" ]] && peak_used_mb=$used_mb
  [[ "$app_mb" -gt "$peak_app_mb" ]] && peak_app_mb=$app_mb
  if [[ "$conns" =~ ^[0-9]+$ ]] && [[ "$conns" -gt "$peak_conns" ]]; then peak_conns=$conns; fi
  samples=$((samples + 1))

  echo "$(date -Is),${used_mb},${app_mb},${conns},${load1}" >> "$LOG"

  # One line, overwritten, so a long run does not fill the scrollback.
  printf '\r  mem %5s MB (peak %5s)   app %4s MB (peak %4s)   db conns %2s (peak %2s)   load %s   ' \
    "$used_mb" "$peak_used_mb" "$app_mb" "$peak_app_mb" "$conns" "$peak_conns" "$load1"

  sleep "$INTERVAL"
done
