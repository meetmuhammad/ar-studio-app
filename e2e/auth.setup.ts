/* eslint-disable @typescript-eslint/no-explicit-any -- test plumbing over untyped JSON and page.evaluate payloads */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { test as setup, expect } from '@playwright/test'
import { ACCOUNTS, QA_PASSWORD, type Role } from './helpers'
import { assertLocalTarget } from './global-guard'

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
    await page.goto('/sign-in')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill(ACCOUNTS[role].email)
    await page.getByLabel('Password', { exact: true }).fill(QA_PASSWORD)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 30000 })
    await page.context().storageState({ path: ACCOUNTS[role].state })
  })
}

/** Remember one real record id of each kind so detail routes can be audited. */
setup('collect ids for detail routes', async () => {
  const url = assertLocalTarget()
  const env = fs.readFileSync('.env.local', 'utf8')
  const anon = /^NEXT_PUBLIC_ANON/.test('') ? '' : /^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/m.exec(env)![1].trim()
  const sb = createClient(url, anon, { auth: { persistSession: false } })
  const { data } = await sb.auth.signInWithPassword({ email: ACCOUNTS.admin.email, password: QA_PASSWORD })
  const headers = { Authorization: `Bearer ${data.session!.access_token}` }
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
  const get = async (p: string) => (await fetch(`${base}${p}`, { headers })).json().catch(() => null)
  const vendors = await get('/api/vendors')
  const out: Record<string, string> = {}
  const first = (j: any) => (Array.isArray(j) ? j[0] : j?.data?.[0] ?? j?.vendors?.[0])
  if (first(vendors)?.id) out.vendorId = first(vendors).id
  fs.writeFileSync('e2e/.auth/ids.json', JSON.stringify(out))
})
