import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { authedGet, login, summaryHandler, thresholds } from "./lib.js";

/**
 * The participant load profile.
 *
 * Shaped after the event rather than after a benchmark. A benchmark would hammer one
 * endpoint and report a throughput number nobody can act on; what actually happens on
 * 10 October is that everybody arrives within a few minutes, signs in, reads the
 * briefing, and then settles into three hours of mostly polling with occasional reads.
 *
 * So each virtual user does that once, in order, and the interesting number is not
 * requests per second — it is whether the login burst gets through at all, and what
 * the ninety-fifth percentile looks like while it does.
 *
 * Run with:
 *   k6 run -e VUS=200 -e BASE_URL=https://… loadtest/k6/participants.js
 */

const VUS = Number(__ENV.VUS || 50);

/** How long to keep polling after signing in, in seconds. */
const HOLD = Number(__ENV.HOLD || 60);

/**
 * How long the arrival burst is spread over.
 *
 * 120 seconds by design: the per-IP limiter allows 300 sign-ins per five minutes and
 * every participant in one city shares a single NAT address, so arriving faster than
 * the real crowd would manufacture a rate-limit result the event will not see. Raise
 * it to model a slower, more staggered arrival.
 */
const ARRIVAL = Number(__ENV.ARRIVAL || 120);

const accounts = new SharedArray("participants", () =>
  JSON.parse(open(__ENV.ACCOUNTS || "../accounts/participants.json")),
);

export const options = {
  scenarios: {
    arrival: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: `${ARRIVAL}s`, target: VUS },
        { duration: `${HOLD}s`, target: VUS },
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "15s",
    },
  },
  thresholds,
  // Stops a tier that is clearly failing rather than spending ten minutes proving it.
  teardownTimeout: "30s",
};

export default function () {
  // One account per VU. Two VUs sharing an account would trip the per-account limiter
  // (ten attempts per five minutes) and report it as a capacity problem.
  const account = accounts[(__VU - 1) % accounts.length];

  const jar = login(account.username, account.password);

  if (!jar) {
    // Already counted by lib.js as the specific reason. Waiting out the rest of the
    // iteration keeps the VU count honest instead of spinning on retries.
    sleep(HOLD);
    return;
  }

  const briefing = authedGet(jar, "/challenge", "GET /challenge");
  check(briefing, { "briefing loaded": (r) => r.status === 200 });

  sleep(1 + Math.random() * 2);

  // The steady state. The workspace polls its own status roughly once a minute, and
  // this is the request every participant makes for three hours whatever else they do.
  const until = Date.now() + HOLD * 1000;
  while (Date.now() < until) {
    const status = authedGet(jar, "/api/attempt/status", "GET /api/attempt/status");
    check(status, { "status poll ok": (r) => r.status === 200 });

    // Jittered so a hundred VUs do not synchronise into a thundering herd that the
    // real crowd would never produce.
    sleep(10 + Math.random() * 10);
  }
}

export const handleSummary = summaryHandler("participants", VUS);
