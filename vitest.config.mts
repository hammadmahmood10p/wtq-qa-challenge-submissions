import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // e2e/ is Playwright's; vitest must not try to run those specs.
    exclude: ["e2e/**", "node_modules/**"],
    // Keeps unit tests independent of a database or a .env file. Anything needing
    // either belongs in the Playwright suite, not here.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
      CNIC_PEPPER: "test-cnic-pepper-value",
      CNIC_ENCRYPTION_KEY: "d3RxLXRlc3Qta2V5LWZpeGVkLWZvci11bml0LXRlc3Q=",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // See test/server-only-stub.ts for why this is stubbed.
      "server-only": path.resolve(import.meta.dirname, "./test/server-only-stub.ts"),
    },
  },
});
