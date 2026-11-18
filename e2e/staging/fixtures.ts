import { test as base, expect, type Browser, type Page } from '@playwright/test'
import { PRODUCTION_REF, STAGING_HOST } from './guard'

export type Role = 'admin' | 'staff'

export const STATE = { admin: 'e2e/.auth/staging-admin.json', staff: 'e2e/.auth/staging-staff.json' } as const

/** Credentials come only from the environment (checked by the guard). */
export const creds = (role: Role) => ({
  email: process.env[role === 'admin' ? 'E2E_ADMIN_EMAIL' : 'E2E_STAFF_EMAIL']!,
  password: process.env[role === 'admin' ? 'E2E_ADMIN_PASSWORD' : 'E2E_STAFF_PASSWORD']!,
})

/** Every name this suite creates starts with this, followed by a unique suffix. */
export const PREFIX = 'E2E-STG'

/**
 * Blocks any request to the production project and fails the test if the page
 * talks to a Supabase project other than staging.
 */
async function fence(page: Page) {
  const strays: string[] = []
  await page.route(new RegExp(PRODUCTION_REF), (route) => {
    strays.push(route.request().url())
    return route.abort()
  })
  page.on('request', (r) => {
    const host = new URL(r.url()).host
    if (host.endsWith('.supabase.co') && host !== STAGING_HOST) strays.push(host)
  })
  return strays
}

/** A page signed in as `role` (saved storage state), fenced to the staging project. */
export async function pageAs(browser: Browser, role: Role | null, options: { colorScheme?: 'light' | 'dark'; width?: number } = {}) {
  const width = options.width ?? 1440
  const context = await browser.newContext({
    storageState: role ? STATE[role] : undefined,
    viewport: { width, height: width < 768 ? 844 : 900 },
    colorScheme: options.colorScheme ?? 'light',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  const strays = await fence(page)
  return {
    page,
    close: async () => {
      expect(strays, 'requests outside the staging project').toEqual([])
      await context.close()
    },
  }
}

/** `page` fixture: admin by default, fenced to staging. Use test.use({ role: 'staff' | null }) to change. */
export const test = base.extend<{ role: Role | null }>({
  role: ['admin', { option: true }],
  // (the fixture callback is named `provide`, not `use`, so the React hooks lint rule leaves it alone)
  storageState: async ({ role }, provide) => provide(role ? STATE[role] : undefined),
  page: async ({ page }, provide) => {
    const strays = await fence(page)
    page.setDefaultTimeout(20_000)
    await provide(page)
    expect(strays, 'requests outside the staging project').toEqual([])
  },
})

export { expect }
