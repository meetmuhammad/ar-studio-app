import { defineConfig } from '@playwright/test'

/**
 * Browser tests run against a LOCAL server pointed at the LOCAL Supabase stack.
 * e2e/global-guard.ts refuses to run if the target database is not local.
 *
 *   E2E_BASE_URL=http://localhost:3100 npx playwright test
 *
 * Viewports are set per test (e2e/helpers.ts) so one spec can sweep every width.
 * Two engines: chromium and webkit. Neither is a physical iPhone; see docs/qa.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'qa-artifacts/report.json' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, retries: 2, use: { browserName: 'chromium' } },
    { name: 'chromium', dependencies: ['setup'], testIgnore: /auth\.setup\.ts/, use: { browserName: 'chromium' } },
    { name: 'webkit', dependencies: ['setup'], testIgnore: /auth\.setup\.ts/, use: { browserName: 'webkit' } },
  ],
})
