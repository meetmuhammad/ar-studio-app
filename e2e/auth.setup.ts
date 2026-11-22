import fs from 'node:fs'
import { test as setup, expect } from '@playwright/test'
import { ACCOUNTS, QA_PASSWORD, type Role } from './helpers'
import { assertLocalTarget } from './global-guard'
import { signIn } from './support/ui'

/**
 * Real UI sign-in per role; the Supabase session is saved as Playwright storage state.
 * A saved session younger than 25 minutes is reused (local auth rate-limits repeated sign-ins;
 * access tokens last an hour). nav.spec.ts still does a genuine UI sign-in on every run, and
 * E2E_FORCE_LOGIN=1 forces a fresh one here.
 */
const fresh = (file: string) => {
  try { return Date.now() - fs.statSync(file).mtimeMs < 25 * 60 * 1000 } catch { return false }
}
for (const role of Object.keys(ACCOUNTS) as Role[]) {
  setup(`sign in as ${role} through the UI`, async ({ page }) => {
    assertLocalTarget()
    setup.skip(!process.env.E2E_FORCE_LOGIN && fresh(ACCOUNTS[role].state), 'saved session is fresh')
    await signIn(page, ACCOUNTS[role].email, QA_PASSWORD)
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.context().storageState({ path: ACCOUNTS[role].state })
  })
}
