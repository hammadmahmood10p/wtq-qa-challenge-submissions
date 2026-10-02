/**
 * Turns the per-tier JSON files into one report.
 *
 *   node loadtest/report.mjs > loadtest/results/REPORT.md
 *
 * Written to be read by someone deciding whether to run an event on this, so it leads
 * with a verdict per tier rather than with a table of percentiles. The numbers are
 * underneath for anyone who wants them.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RESULTS = join(dirname(fileURLToPath(import.meta.url)), "results");

/** What the event actually needs, as opposed to what is merely nice. */
const BUDGET = {
  failedRate: 0.01, // under 1% of requests may fail
  p95: 2000, // a page read within two seconds at the 95th percentile
  loginP95: 4000, // Argon2id is deliberately slow; this is still generous
};

/** Judges above this are being stress-tested beyond the stated maximum of 20. */
const JUDGE_EXPECTED_MAX = 20;

let files;
try {
  files = readdirSync(RESULTS).filter((f) => f.endsWith(".json"));
} catch {
  console.error(`No results in ${RESULTS}. Run loadtest/run-tiers.sh first.`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`No results in ${RESULTS}. Run loadtest/run-tiers.sh first.`);
  process.exit(1);
}

const runs = files
  .map((f) => JSON.parse(readFileSync(join(RESULTS, f), "utf8")))
  .sort((a, b) => (a.kind === b.kind ? a.vus - b.vus : a.kind.localeCompare(b.kind)));

const pct = (n) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(2)}%`);
const ms = (n) => (n === null || n === undefined ? "—" : `${n} ms`);

/**
 * A tier's verdict.
 *
 * Rate limiting is called out separately from failure throughout. Being refused by the
 * limiter is the system doing its job; reporting it as an error would tell the reader
 * the server could not cope, when what actually happened is that it declined to let a
 * crowd behind one address in faster than its own rule allows. Which is a real
 * finding — but a configuration one, not a capacity one.
 */
function verdict(run) {
  const problems = [];

  if (run.failedRate > BUDGET.failedRate) {
    problems.push(`${pct(run.failedRate)} of requests failed`);
  }
  if (run.duration.p95 > BUDGET.p95) {
    problems.push(`p95 ${ms(run.duration.p95)}`);
  }
  if (run.login.p95 !== null && run.login.p95 > BUDGET.loginP95) {
    problems.push(`login p95 ${ms(run.login.p95)}`);
  }
  if (run.login.failed > 0) {
    problems.push(`${run.login.failed} sign-ins did not produce a session`);
  }

  const limited = run.login.rateLimitedIp + run.login.rateLimitedAccount;

  if (problems.length === 0 && limited === 0) return { mark: "PASS", note: "" };
  if (problems.length === 0) {
    return {
      mark: "RATE-LIMITED",
      note: `${limited} sign-ins refused by the limiter; everything that got through was healthy`,
    };
  }
  return { mark: "FAIL", note: problems.join("; ") };
}

const participants = runs.filter((r) => r.kind === "participants");
const judges = runs.filter((r) => r.kind === "judges");

const when = runs.map((r) => r.at).sort();
const target = runs[0]?.baseUrl ?? "unknown";

const out = [];
const w = (line = "") => out.push(line);

w("# Load test report — WTQ 2026 Submission Portal");
w();
w(`**Target:** ${target}  `);
w(`**Run:** ${when[0]?.slice(0, 16).replace("T", " ")} to ${when.at(-1)?.slice(0, 16).replace("T", " ")} UTC  `);
w(`**Generator:** one laptop, so every request arrives from a single source address — which is the realistic case, since each venue sits behind one NAT address.`);
w();
w("## What was measured against");
w();
w(`| Budget | Value |`);
w(`|---|---|`);
w(`| Failed requests | under ${pct(BUDGET.failedRate)} |`);
w(`| Page read, 95th percentile | under ${ms(BUDGET.p95)} |`);
w(`| Sign-in, 95th percentile | under ${ms(BUDGET.loginP95)} |`);
w();
w("Sign-in is given a far looser budget than a page read, deliberately. Passwords are");
w("hashed with Argon2id, which is expensive on purpose; a sign-in that returned");
w("instantly would mean the hashing had been weakened.");
w();

function section(title, rows, note) {
  w(`## ${title}`);
  w();
  if (note) {
    w(note);
    w();
  }
  if (rows.length === 0) {
    w("_No results._");
    w();
    return;
  }

  w("| Users | Verdict | Requests | Failed | p95 | p99 | Sign-ins OK | Rate-limited | Login p95 |");
  w("|---:|---|---:|---:|---:|---:|---:|---:|---:|");

  for (const run of rows) {
    const v = verdict(run);
    const limited = run.login.rateLimitedIp + run.login.rateLimitedAccount;
    w(
      `| ${run.vus} | **${v.mark}** | ${run.requests ?? "—"} | ${pct(run.failedRate)} | ` +
        `${ms(run.duration.p95)} | ${ms(run.duration.p99)} | ${run.login.success} | ${limited} | ${ms(run.login.p95)} |`,
    );
  }
  w();

  const notes = rows.map((r) => [r, verdict(r)]).filter(([, v]) => v.note);
  if (notes.length > 0) {
    w("**Notes**");
    w();
    for (const [run, v] of notes) w(`- **${run.vus} users** — ${v.note}`);
    w();
  }
}

section(
  "Participants",
  participants,
  "Each virtual user signs in, loads the briefing, then polls attempt status the way the workspace does for three hours. Arrival is spread over the ramp rather than fired at once, because the real crowd arrives over several minutes.",
);

section(
  "Judges",
  judges,
  `Each virtual user signs in and refreshes the submissions table, which is the heaviest read in the application — every row decrypts an ID card number and derives a challenge count. **${JUDGE_EXPECTED_MAX} is the stated maximum** for the event; tiers above it are stress beyond requirement, included to show headroom.`,
);

const limitedTiers = runs.filter((r) => r.login.rateLimitedIp > 0);
const failedTiers = runs.filter((r) => verdict(r).mark === "FAIL");

w("## Conclusions");
w();

if (failedTiers.length === 0) {
  w("- No tier exceeded the failure or latency budgets.");
} else {
  w(`- **${failedTiers.length} tier(s) missed a budget:** ${failedTiers.map((r) => `${r.kind} @ ${r.vus}`).join(", ")}.`);
}

if (limitedTiers.length > 0) {
  const first = limitedTiers[0];
  w();
  w(`- **The per-IP sign-in limiter was reached at ${first.vus} ${first.kind}.** The limit is 300 sign-ins per five minutes from one address, and every participant at a venue shares one NAT address. On the day this would present as participants being told to wait and try again, during the exact ten minutes when everyone is arriving. **Recommendation:** raise \`loginPerIp\` in \`src/lib/rate-limit.ts\` to comfortably exceed the largest venue's headcount before 10 October, and re-run the affected tier.`);
} else {
  w();
  w("- The per-IP sign-in limiter was not reached at any tier. Worth noting the test ran from one address, which is the same shape as a venue behind NAT, so this is a meaningful result rather than an artefact.");
}

const peak = participants.at(-1);
if (peak) {
  w();
  w(`- At the top participant tier (${peak.vus} users), the 95th percentile page read was ${ms(peak.duration.p95)} and ${pct(peak.failedRate)} of requests failed.`);
}

w();
w("## What this test does not cover");
w();
w("- **The submission spike.** Every participant uploading a PDF in the final ten minutes is the heaviest moment of the event and is not exercised here; it needs its own run against a disposable database.");
w("- **Three hours of accumulated state.** The runs are minutes long. Autosave growth, session table growth and connection churn over a full attempt are not represented.");
w("- **Real network conditions.** The generator sits on one corporate connection; participants will be on venue wifi.");
w();
w("---");
w();
w("_Generated by `loadtest/report.mjs`._");

console.log(out.join("\n"));
