import { defineConfig } from '@playwright/test'

/**
 * OPT-IN browser tests against the dummy/staging Supabase project only.
 *
 *   E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… E2E_STAFF_EMAIL=… E2E_STAFF_PASSWORD=… \
 *   E2E_BASE_URL=http://localhost:3100 npm run test:e2e:staging
 *
 * e2e/staging/guard.ts (globalSetup) refuses to start unless
 * NEXT_PUBLIC_SUPABASE_URL's host is exactly ohgqgkraybpvnfdbgmvl.supabase.co,
 * nothing points at the production project, the app at E2E_BASE_URL is built
 * against the staging project, and the four credential variables are set.
 *
 * Every spec creates its own records (prefix "E2E-STG" + a unique suffix) and
 * deletes them through the UI as admin in afterAll. One worker, in order, so a
 * spec's cleanup never races another spec's data.
 */
export default defineConfig({
  testDir: './e2e/staging',
  globalSetup: './e2e/staging/guard.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'qa-artifacts/staging-report.json' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    // No traces: they record typed values, including passwords.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'staging-setup', testMatch: /auth\.setup\.ts/ },
    { name: 'staging', dependencies: ['staging-setup'], testMatch: /\.spec\.ts/ },
  ],
})
