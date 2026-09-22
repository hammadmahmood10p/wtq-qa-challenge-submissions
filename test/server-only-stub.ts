/**
 * Stands in for the `server-only` package under Vitest.
 *
 * That package throws on import unless the bundler selects React's "react-server"
 * condition. The marker is doing real work — it is what stops a server module being
 * pulled into the browser bundle, a mistake it caught on Day 6 — but a unit test
 * runner is neither a server nor a browser, so it needs a no-op.
 */
export {};
