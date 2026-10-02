import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { authedGet, login, summaryHandler, thresholds } from "./lib.js";

/**
 * The judge load profile.
 *
 * A different shape from the participants' and much smaller, but not trivially so: the
 * submissions table is the heaviest read in the application. Every row carries a
 * decrypted ID card number, a score, a claim, and — since the last release — a
 * Challenges Accepted count derived from the work itself. Twenty judges refreshing
 * that table is more database work than five hundred participants polling a timer.
 *
 * Judges also behave differently. They arrive after the participants have finished,
 * they press Refresh often while looking for unclaimed work, and they keep the page
 * open for hours. So this models a refresh loop rather than an arrival burst.
 *
 * Run with:
 *   k6 run -e VUS=20 -e BASE_URL=https://… loadtest/k6/judges.js
 */

const VUS = Number(__ENV.VUS || 5);
const HOLD = Number(__ENV.HOLD || 120);

const accounts = new SharedArray("judges", () =>
  JSON.parse(open(__ENV.ACCOUNTS || "../accounts/judges.json")),
);

export const options = {
  scenarios: {
    judging: {
      executor: "ramping-vus",
      startVUs: 0,
      // Judges trickle in rather than arriving together, so a short ramp is realistic.
      stages: [
        { duration: "20s", target: VUS },
        { duration: `${HOLD}s`, target: VUS },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    ...thresholds,
    // The submissions table is allowed to be slower than a status poll — it is doing
    // far more — but not so slow that Refresh feels broken.
    "http_req_duration{name:GET /judge}": ["p(95)<3000"],
  },
};

export default function () {
  const account = accounts[(__VU - 1) % accounts.length];

  const jar = login(account.username, account.password);
  if (!jar) {
    sleep(HOLD);
    return;
  }

  const until = Date.now() + HOLD * 1000;

  while (Date.now() < until) {
    // The table itself, which is what Refresh Data re-fetches.
    const table = authedGet(jar, "/judge", "GET /judge");
    check(table, { "submissions table loaded": (r) => r.status === 200 });

    sleep(2 + Math.random() * 3);

    // Filtering is a separate query shape and is worth exercising: it is the one a
    // judge uses to find unclaimed work, so it is the one they run most.
    const filtered = authedGet(
      jar,
      "/judge?review=NOT_REVIEWED",
      "GET /judge (filtered)",
    );
    check(filtered, { "filtered view loaded": (r) => r.status === 200 });

    sleep(5 + Math.random() * 10);
  }
}

export const handleSummary = summaryHandler("judges", VUS);
