import { defineConfig, devices } from "@playwright/test";

// Playwright configuration â€” Story 1.1 (T2).
// Two projects: a standard `chromium` run, and an `a11y` project whose specs
// (matched by `*.a11y.spec.ts`) drive AxeBuilder from `@axe-core/playwright`.
const isCI = !!process.env.CI;

// Specs import src/lib/db directly and need POSTGRES_URL & co. Workers inherit
// the runner's process.env, so loading .env here covers both. CI provides env
// through the pipeline instead of a .env file.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on ambient environment (CI)
}

// The runner process seeds users through Better Auth directly (global-setup) —
// keep it from sending real verification emails through Resend.
process.env.RESEND_API_KEY = "";

// Each runner/server process has its own postgres-js pool. Keep it tiny for
// the local, shared E2E database; production continues to use its default.
const e2ePostgresPoolMax = process.env.POSTGRES_POOL_MAX ?? "1";
process.env.POSTGRES_POOL_MAX = e2ePostgresPoolMax;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Spec files seed shared users/tenants in beforeAll (delete + sign-up). With
  // fullyParallel, tests from one file spread across workers and beforeAll runs
  // once per worker, racing those seeds (duplicate sign-ups, mid-test deletes).
  // Keep parallelism at the file level only.
  fullyParallel: false,
  // Specs use shared database fixtures and the local PostgreSQL test service
  // has a limited connection budget; run them serially to avoid fixture races
  // and database connection exhaustion.
  workers: 1,
  // Webpack dev-server first-compiles of heavy pages routinely exceed the
  // 30s default locally; give tests and assertions more headroom.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: isCI,
  // One local retry absorbs webpack first-compile latency on cold routes.
  retries: isCI ? 2 : 1,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "a11y",
      testMatch: /.*\.a11y\.spec\.tsx?$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Turbopack currently cannot bundle flexsearch's dynamic require in the
    // quote wizard. E2E must use webpack, matching the production build path.
    command: "pnpm exec next dev --webpack",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 120_000,
    // .env.local (pulled by Vercel CLI) points POSTGRES_URL at the remote Neon
    // dev database. Next.js never overrides variables already present in
    // process.env, so passing the .env value here pins the E2E web server to
    // the same local database the specs and global setup write to.
    env: {
      ...(process.env.POSTGRES_URL ? { POSTGRES_URL: process.env.POSTGRES_URL } : {}),
      // The app opens transactions (FOR UPDATE) while pages fire parallel
      // RSC/API queries — a single-connection pool starves and PATCH routes
      // hang. Keep the runner pool at 1 but give the server a small pool.
      POSTGRES_POOL_MAX: "5",
      SUBDOMAIN_DEV_MODE: "1",
      // E2E seeds sign up real users constantly — never burn the Resend
      // quota on verification emails; dev mode logs them to the console.
      RESEND_API_KEY: "",
    },
  },
});
