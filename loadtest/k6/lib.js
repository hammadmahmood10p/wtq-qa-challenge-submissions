import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

/**
 * Shared helpers for the load tests.
 *
 * The one piece of real machinery here is `login`. Everything this application writes
 * goes through a Next.js Server Action, which is not a REST endpoint you can post JSON
 * at — but the login form is rendered with Next's no-JavaScript fallback, which is an
 * ordinary `multipart/form-data` POST carrying four hidden fields that identify the
 * action.
 *
 * So the test fetches the page, reads those fields out of the HTML, and posts them
 * back. That matters for maintenance: the action id is a build hash and changes on
 * every deploy, and a script with one pasted into it would quietly stop exercising
 * login the first time the application was rebuilt — while still reporting green,
 * because a 200 comes back either way.
 */

export const BASE_URL = __ENV.BASE_URL || "https://validate-submission-portal.womentechquest.com";

/** Self-signed certificates on the interim deployment. */
export const INSECURE = (__ENV.INSECURE || "false") === "true";

export const loginDuration = new Trend("login_duration", true);
export const loginSuccess = new Counter("login_success");
export const loginFailed = new Counter("login_failed");

/**
 * Counted separately rather than as a failure.
 *
 * Being refused by the rate limiter is not the server struggling — it is the server
 * working exactly as designed. Folded into the error rate it would read as a capacity
 * problem; counted on its own it answers the question this test exists to ask, which
 * is whether 500 people behind one NAT address can all get in.
 */
export const rateLimitedIp = new Counter("rate_limited_ip");
export const rateLimitedAccount = new Counter("rate_limited_account");

const params = () => ({
  insecureSkipTLSVerify: INSECURE,
  redirects: 0,
});

/**
 * Encodes fields as multipart/form-data.
 *
 * k6 sends a plain object as `application/x-www-form-urlencoded`, and the login form
 * declares `encType="multipart/form-data"`. Next.js answers an urlencoded post to a
 * Server Action by re-rendering the page: HTTP 200, no error message, no session
 * cookie, nothing in the logs. The request looks like a success and authenticates
 * nobody — which is exactly what the first smoke test reported, and why it reported it
 * as "logins failed" rather than as anything diagnosable.
 *
 * Written out by hand rather than pulled from k6's jslib, which is fetched over the
 * network at run time: a load test that cannot start because a proxy blocked a helper
 * download is a bad evening.
 */
function multipart(fields) {
  const boundary = "----k6wtq" + Math.random().toString(16).slice(2);

  let payload = "";
  for (const [key, value] of Object.entries(fields)) {
    payload += `--${boundary}\r\n`;
    payload += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    payload += `${value}\r\n`;
  }
  payload += `--${boundary}--\r\n`;

  return { payload, contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Pulls one hidden input's value out of the server-rendered form. */
function hiddenField(html, name) {
  // The name contains `$` and `:`, both regex metacharacters, so it is escaped rather
  // than interpolated raw.
  const safe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`name="${safe}"\\s+value="([^"]*)"`).exec(html);
  if (!match) return null;

  // The HTML is entity-encoded; the action descriptor is JSON and contains quotes.
  return match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'");
}

/**
 * Signs one participant or judge in and returns their session cookie jar.
 *
 * Returns null when the sign-in did not produce a session, having already recorded
 * *why* — wrong credentials, or either rate limiter.
 */
export function login(username, password) {
  const jar = http.cookieJar();

  // Each iteration signs in fresh. Without this the VU carries its previous session
  // into the next login, which both skews the measurement and hides failures.
  jar.clear(`${BASE_URL}/`);

  const page = http.get(`${BASE_URL}/login`, {
    ...params(),
    tags: { name: "GET /login" },
  });

  if (page.status !== 200) {
    loginFailed.add(1);
    return null;
  }

  const body = {
    "$ACTION_REF_1": "",
    "$ACTION_1:0": hiddenField(page.body, "$ACTION_1:0"),
    "$ACTION_1:1": hiddenField(page.body, "$ACTION_1:1"),
    "$ACTION_KEY": hiddenField(page.body, "$ACTION_KEY"),
    username,
    password,
  };

  if (!body["$ACTION_1:0"]) {
    // The form changed shape. Failing loudly beats a run that reports a healthy login
    // rate while never actually authenticating anybody.
    throw new Error(
      "Could not find the login action fields in /login. " +
        "The form markup has changed — update hiddenField() in loadtest/k6/lib.js.",
    );
  }

  // Built once: calling the encoder twice would generate two different boundaries,
  // and the header would describe a payload that does not exist.
  const form = multipart(body);

  const started = Date.now();
  const response = http.post(`${BASE_URL}/login`, form.payload, {
    ...params(),
    headers: { "Content-Type": form.contentType },
    tags: { name: "POST /login" },
  });
  loginDuration.add(Date.now() - started);

  const text = response.body || "";

  if (text.includes("Too many login attempts")) {
    rateLimitedIp.add(1);
    return null;
  }
  if (text.includes("Too many attempts for this account")) {
    rateLimitedAccount.add(1);
    return null;
  }

  // The session cookie *on this response* is what proves it — not whatever is in the
  // jar. A VU's jar persists across its iterations, so a failed sign-in after a
  // successful one would still find a cookie sitting there and count itself a success.
  const authenticated = Boolean(response.cookies && response.cookies.wtq_session);

  check(response, {
    "login did not error": (r) => r.status < 500,
  });

  if (authenticated) {
    loginSuccess.add(1);
    return jar;
  }

  loginFailed.add(1);
  return null;
}

/** A GET as a signed-in user. */
export function authedGet(jar, path, name) {
  return http.get(`${BASE_URL}${path}`, {
    ...params(),
    jar,
    redirects: 1,
    tags: { name: name || `GET ${path}` },
  });
}

/**
 * Thresholds, shared so every tier is judged against the same bar.
 *
 * The login budget is separate and far looser on purpose: passwords are hashed with
 * Argon2id, which is deliberately expensive, so a sign-in is *meant* to take a
 * noticeable fraction of a second. Holding it to the same bar as a page read would
 * either fail every run or push someone to weaken the hashing.
 */
export const thresholds = {
  http_req_failed: ["rate<0.01"],
  "http_req_duration{name:GET /api/attempt/status}": ["p(95)<800"],
  login_duration: ["p(95)<4000"],
  checks: ["rate>0.98"],
};

/**
 * Writes one JSON file per tier, and a short digest to the terminal.
 *
 * Deliberately not using k6's `textSummary` from the jslib CDN: that is fetched at run
 * time, and a load test that cannot start because a corporate proxy blocked a helper
 * download is a bad morning. Everything here is local.
 */
export function summaryHandler(kind, vus) {
  return function handleSummary(data) {
    const metric = (name, stat) => {
      const m = data.metrics[name];
      if (!m || !m.values) return null;
      return m.values[stat] ?? null;
    };

    const round = (n) => (n === null ? null : Math.round(n));

    const digest = {
      kind,
      vus: Number(vus),
      at: new Date().toISOString(),
      baseUrl: BASE_URL,
      iterations: metric("iterations", "count"),
      requests: metric("http_reqs", "count"),
      failedRate: metric("http_req_failed", "rate"),
      duration: {
        avg: round(metric("http_req_duration", "avg")),
        p95: round(metric("http_req_duration", "p(95)")),
        p99: round(metric("http_req_duration", "p(99)")),
        max: round(metric("http_req_duration", "max")),
      },
      login: {
        success: metric("login_success", "count") ?? 0,
        failed: metric("login_failed", "count") ?? 0,
        rateLimitedIp: metric("rate_limited_ip", "count") ?? 0,
        rateLimitedAccount: metric("rate_limited_account", "count") ?? 0,
        p95: round(metric("login_duration", "p(95)")),
        max: round(metric("login_duration", "max")),
      },
      checksPassed: metric("checks", "passes") ?? 0,
      checksFailed: metric("checks", "fails") ?? 0,
      thresholdsFailed: Object.entries(data.metrics)
        .filter(([, m]) => m.thresholds && Object.values(m.thresholds).some((t) => t.ok === false))
        .map(([name]) => name),
    };

    const lines = [
      "",
      `  ${kind} @ ${vus} VUs`,
      `  requests ${digest.requests}   failed ${(digest.failedRate * 100).toFixed(2)}%`,
      `  duration p95 ${digest.duration.p95}ms   p99 ${digest.duration.p99}ms   max ${digest.duration.max}ms`,
      `  logins ok ${digest.login.success}   failed ${digest.login.failed}` +
        `   rate-limited ip ${digest.login.rateLimitedIp}   account ${digest.login.rateLimitedAccount}`,
      `  login p95 ${digest.login.p95}ms`,
      digest.thresholdsFailed.length
        ? `  THRESHOLDS FAILED: ${digest.thresholdsFailed.join(", ")}`
        : "  all thresholds passed",
      "",
    ];

    return {
      [`loadtest/results/${kind}-${vus}.json`]: JSON.stringify(digest, null, 2),
      stdout: lines.join("\n"),
    };
  };
}
