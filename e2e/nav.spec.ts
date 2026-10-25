/* eslint-disable @typescript-eslint/no-explicit-any -- test plumbing over untyped JSON and page.evaluate payloads */
import { test, expect, type Page } from '@playwright/test'
import { ctxFor, VIEWPORTS, watch, settle, type Role } from './helpers'
import { assertLocalTarget } from './global-guard'

const vp = (name: string) => VIEWPORTS.find((v) => v.name === name)!
const TABS: Record<Role, string[]> = {
  admin: ['Home', 'Orders', 'Customers', 'Ledger', 'More'],
  staff: ['Orders', 'Customers', 'Measurements', 'More'],
}
const SIDEBAR: Record<Role, string[]> = {
  admin: ['Dashboard', 'Customers', 'Orders', 'Measurements', 'Ledger', 'Vendors'],
  staff: ['Customers', 'Orders', 'Measurements'],
}

async function open(browser: any, role: Role | null, viewport: string, path: string) {
  assertLocalTarget()
  const ctx = await ctxFor(browser, role, vp(viewport))
  const page: Page = await ctx.newPage()
  const w = watch(page)
  await page.goto(path)
  await settle(page)
  return { ctx, page, w }
}

for (const role of ['admin', 'staff'] as Role[]) {
  test.describe(`${role}: navigation surfaces`, () => {
    for (const v of ['phone-360', 'phone-390', 'phone-430', 'edge-639']) {
      test(`phone ${v}: bottom tab bar shows ${TABS[role].join(', ')}`, async ({ browser }) => {
        const { ctx, page, w } = await open(browser, role, v, role === 'admin' ? '/' : '/customers')
        const nav = page.getByRole('navigation', { name: 'Primary' })
        await expect(nav).toBeVisible()
        const labels = await nav.locator('a, button').allInnerTexts()
        expect(labels.map((l) => l.trim())).toEqual(TABS[role])
        // the desktop sidebar must not render on a phone
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
        // no tab is clipped by the screen edge
        for (const el of await nav.locator('a, button').all()) {
          const b = (await el.boundingBox())!
          expect(b.x).toBeGreaterThanOrEqual(0)
          expect(b.x + b.width).toBeLessThanOrEqual(vp(v).width + 1)
          expect(b.height).toBeGreaterThanOrEqual(44)
        }
        // content is not hidden behind the bar: last element of <main> can scroll above it
        const main = page.locator('main')
        await main.evaluate((m) => (m.scrollTop = m.scrollHeight))
        const navTop = (await nav.boundingBox())!.y
        const mainLast = await main.evaluate((m) => {
          const kids = Array.from(m.querySelectorAll('*')).filter((e) => (e as HTMLElement).offsetHeight > 0)
          return Math.max(...kids.map((e) => e.getBoundingClientRect().bottom))
        })
        expect(mainLast).toBeLessThanOrEqual(navTop + 1)
        expect(w.consoleErrors).toEqual([])
        await ctx.close()
      })
    }

    test(`phone: More sheet content for ${role}, focus and dismissal`, async ({ browser }) => {
      const { ctx, page } = await open(browser, role, 'phone-390', role === 'admin' ? '/' : '/customers')
      await page.getByRole('button', { name: 'More' }).click()
      const sheet = page.getByRole('dialog')
      await expect(sheet).toBeVisible()
      const links = await sheet.getByRole('list', { name: 'More sections' }).getByRole('link').allInnerTexts().catch(() => [])
      expect(links.map((l) => l.trim())).toEqual(role === 'admin' ? ['Measurements', 'Vendors'] : [])
      await expect(sheet.getByRole('button', { name: 'Sign Out' })).toBeVisible()
      await expect(sheet.getByText(`qa-${role}@arstudio.test`)).toBeVisible()
      // Escape closes it and focus returns to the trigger
      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()
      await expect(page.getByRole('button', { name: 'More' })).toBeFocused()
      await ctx.close()
    })

    test(`tablet portrait 820: icon rail, no bottom bar, every link has a name`, async ({ browser }) => {
      const { ctx, page } = await open(browser, role, 'tablet-820', role === 'admin' ? '/' : '/customers')
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden()
      const side = page.getByRole('navigation', { name: 'Main' })
      await expect(side).toBeVisible()
      const box = (await page.locator('aside').boundingBox())!
      expect(box.width).toBeLessThan(100) // rail, not the 256px sidebar
      for (const name of SIDEBAR[role]) await expect(side.getByRole('link', { name })).toBeVisible()
      // the visible label is hidden, but the accessible name and tooltip remain
      expect(await side.getByRole('link', { name: SIDEBAR[role][1] }).getAttribute('title')).toBe(SIDEBAR[role][1])
      await ctx.close()
    })

    for (const v of ['tablet-land-1180', 'desktop-1440', 'tablet-land-1024']) {
      test(`${v}: full sidebar with labels`, async ({ browser }) => {
        const { ctx, page } = await open(browser, role, v, role === 'admin' ? '/' : '/customers')
        const side = page.getByRole('navigation', { name: 'Main' })
        await expect(side).toBeVisible()
        expect((await page.locator('aside').boundingBox())!.width).toBeGreaterThan(240)
        for (const name of SIDEBAR[role]) await expect(side.getByRole('link', { name })).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden()
        await ctx.close()
      })
    }
  })
}

test.describe('access control, deep links, sessions', () => {
  test('staff are redirected away from admin-only pages', async ({ browser }) => {
    for (const path of ['/', '/ledger', '/vendors']) {
      const { ctx, page } = await open(browser, 'staff', 'phone-390', path)
      await expect(page).toHaveURL(/\/customers$/, { timeout: 15000 })
      await ctx.close()
    }
  })

  test('signed-out visitors are sent to sign-in from every private route', async ({ browser }) => {
    for (const path of ['/', '/customers', '/orders', '/measurements', '/ledger', '/vendors']) {
      const { ctx, page } = await open(browser, null, 'phone-390', path)
      await expect(page).toHaveURL(/\/sign-in$/, { timeout: 15000 })
      await ctx.close()
    }
  })

  test('deep link, reload and browser back keep the session and the route', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', 'phone-390', '/ledger')
    await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible()
    await page.reload(); await settle(page)
    await expect(page).toHaveURL(/\/ledger$/)
    await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible()
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Orders' }).click()
    await expect(page).toHaveURL(/\/orders$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/ledger$/)
    await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible()
    await ctx.close()
  })

  test('sign out from the More sheet ends the session; private pages are no longer reachable', async ({ browser }) => {
    // Own account: Supabase sign-out is global (it revokes every session of the user), so it must not be
    // the shared staff account the other tests are using in parallel.
    const { ctx, page } = await open(browser, null, 'phone-390', '/sign-in')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('qa-signout@arstudio.test')
    await page.getByLabel('Password', { exact: true }).fill('QaLocal-2026!')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 30000 })
    await page.goto('/customers'); await settle(page)
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Sign Out' }).click()
    await expect(page).toHaveURL(/\/sign-in$/, { timeout: 15000 })
    await page.goto('/orders'); await settle(page)
    await expect(page).toHaveURL(/\/sign-in$/, { timeout: 15000 })
    await ctx.close()
  })

  test('an expired/invalid session is sent to sign-in instead of showing data', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', 'phone-390', '/customers')
    // corrupt the stored Supabase session the way an expired, revoked one looks
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.includes('auth-token')) {
        const s = JSON.parse(localStorage[k]); s.access_token = 'invalid'; s.refresh_token = 'invalid'; s.expires_at = 1
        localStorage[k] = JSON.stringify(s)
      }
      localStorage.removeItem('ar_user_role_cache')
    })
    await page.reload()
    await expect(page).toHaveURL(/\/sign-in$/, { timeout: 20000 })
    await ctx.close()
  })

  test('sign-in page: validation, wrong password, then success lands on the dashboard', async ({ browser }) => {
    const { ctx, page } = await open(browser, null, 'phone-390', '/sign-in')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL(/sign-in/) // required fields block submit
    await page.getByLabel('Email').fill('qa-admin@arstudio.test')
    await page.getByLabel('Password', { exact: true }).fill('wrong-password')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/sign-in/)
    await page.getByLabel('Password', { exact: true }).fill('QaLocal-2026!')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 30000 })
    await ctx.close()
  })
})
