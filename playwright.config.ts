import { defineConfig, devices } from "@playwright/test";

// Playwright does not read .env. The fixtures need the database URL and the CNIC
// pepper to seed accounts the app will recognise.
try {
  process.loadEnvFile();
} catch {
  // already injected, e.g. in CI
}

/**
 * End-to-end suite.
 *
 * These run against a real browser and the real development database, because the
 * things most likely to fail on event day — session cookies, redirects, role
 * boundaries — only exist once all three are involved. Unit tests (vitest) cover the
 * pure logic; this covers the wiring.
 *
 * Deliberately serial with one worker: the tests share seeded accounts, and parallel
 * runs against one database produce flakes that cost more time than they save.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 45_000,

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
