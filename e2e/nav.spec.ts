import { test, expect, type Browser } from '@playwright/test'
import { ctxFor, VIEWPORTS, watch, settle, QA_PASSWORD, ACCOUNTS, SIGNOUT_ACCOUNT, type Role } from './helpers'
import { assertLocalTarget } from './global-guard'
import { CUSTOMERS_URL, MENU, btn, closeWithEscape, forbidden, isDark, menuLabels, signIn, toggleTheme } from './support/ui'

/**
 * The Refine + antd shell: sider menu (desktop) / drawer (below 992px), header
 * actions, account menu, theme toggle, access control and sessions.
 */
const vp = (name: string) => VIEWPORTS.find((v) => v.name === name)!
const home = (role: Role) => (role === 'admin' ? '/' : '/customers')

async function open(browser: Browser, role: Role | null, viewport: string, path: string) {
  assertLocalTarget()
  const ctx = await ctxFor(browser, role, vp(viewport))
  const page = await ctx.newPage()
  const w = watch(page)
  await page.goto(path)
  await settle(page)
  return { ctx, page, w }
}

for (const role of ['admin', 'staff'] as Role[]) {
  test.describe(`${role}: navigation`, () => {
    for (const v of ['desktop-1440', 'tablet-land-1024']) {
      test(`${v}: sider menu lists ${MENU[role].join(', ')}`, async ({ browser }) => {
        const { ctx, page, w } = await open(browser, role, v, home(role))
        expect(await menuLabels(page)).toEqual(MENU[role])
        await expect(page.getByRole('button', { name: /^bars$/ })).toHaveCount(0)
        expect(w.consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([])
        await ctx.close()
      })
    }

    for (const v of ['phone-390', 'tablet-820']) {
      test(`${v}: menu opens in a drawer and navigates`, async ({ browser }) => {
        const { ctx, page } = await open(browser, role, v, home(role))
        expect(await menuLabels(page)).toEqual(MENU[role])
        const drawer = page.locator('.ant-drawer-open')
        await drawer.getByRole('menuitem', { name: 'Orders' }).click()
        await expect(page).toHaveURL(/\/orders/)
        await ctx.close()
      })
    }

    test('header: order and payment actions, theme toggle, account menu', async ({ browser }) => {
      const { ctx, page } = await open(browser, role, 'desktop-1440', '/customers')
      await expect(btn(page, 'Create New Order')).toBeEnabled()
      if (role === 'admin') {
        await btn(page, 'Add New Payment').click()
        const modal = page.locator('.ant-modal:visible')
        await expect(modal.getByRole('combobox', { name: 'Order' })).toBeVisible()
        await closeWithEscape(page, modal)
      } else {
        await expect(btn(page, 'Add New Payment')).toBeDisabled()
      }

      await page.getByRole('button', { name: 'Account menu' }).click()
      await expect(page.locator('.ant-dropdown:visible').getByText(ACCOUNTS[role].email)).toBeVisible()
      await expect(page.getByRole('menuitem', { name: /Sign out/ })).toBeVisible()
      await page.keyboard.press('Escape')

      const before = await isDark(page)
      await toggleTheme(page)
      await expect.poll(() => isDark(page)).toBe(!before)
      await page.reload(); await settle(page)
      expect(await isDark(page), 'the choice survives a reload').toBe(!before)

      await btn(page, 'Create New Order').click()
      await expect(page).toHaveURL(/\/orders\/create/)
      await ctx.close()
    })

    test('phone header: one Create menu with order and payment', async ({ browser }) => {
      const { ctx, page } = await open(browser, role, 'phone-390', '/customers')
      await btn(page, 'Create').click()
      await expect(page.getByRole('menuitem', { name: /New order/ })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: /Add payment/ })).toBeVisible()
      await ctx.close()
    })
  })
}

test.describe('access control, deep links, sessions', () => {
  test('staff: the dashboard sends them to customers; admin-only pages show 403', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'staff', 'desktop-1440', '/')
    await expect(page).toHaveURL(CUSTOMERS_URL, { timeout: 15000 })
    for (const path of ['/ledger', '/pnl', '/vendors']) {
      await page.goto(path); await settle(page)
      await expect(forbidden(page)).toBeVisible()
    }
    await ctx.close()
  })

  test('signed-out visitors are sent to sign-in from every private route', async ({ browser }) => {
    for (const path of ['/', '/customers', '/orders', '/measurements', '/ledger', '/pnl', '/vendors']) {
      const { ctx, page } = await open(browser, null, 'phone-390', path)
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 15000 })
      await ctx.close()
    }
  })

  test('deep link, reload and browser back keep the session and the route', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', 'desktop-1440', '/ledger')
    await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible()
    await page.reload(); await settle(page)
    await expect(page).toHaveURL(/\/ledger/)
    await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible()
    await page.locator('.ant-layout-sider').getByRole('menuitem', { name: 'Orders' }).click()
    await expect(page).toHaveURL(/\/orders/)
    await page.goBack()
    await expect(page).toHaveURL(/\/ledger/)
    await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible()
    await ctx.close()
  })

  test('sign out from the account menu ends the session', async ({ browser }) => {
    const { ctx, page } = await open(browser, null, 'desktop-1440', '/sign-in')
    await signIn(page, SIGNOUT_ACCOUNT, QA_PASSWORD)
    await page.goto('/customers'); await settle(page)
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: /Sign out/ }).click()
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15000 })
    await page.goto('/orders'); await settle(page)
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 15000 })
    await ctx.close()
  })

  test('an expired/invalid session is sent to sign-in instead of showing data', async ({ browser }) => {
    const { ctx, page } = await open(browser, 'admin', 'desktop-1440', '/customers')
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) if (k.includes('auth-token')) {
        const s = JSON.parse(localStorage[k]); s.access_token = 'invalid'; s.refresh_token = 'invalid'; s.expires_at = 1
        localStorage[k] = JSON.stringify(s)
      }
      localStorage.removeItem('ar_user_role_cache')
    })
    await page.reload()
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 20000 })
    await ctx.close()
  })

  test('sign-in page: required fields, wrong password alert, then success lands on the dashboard', async ({ browser }) => {
    const { ctx, page } = await open(browser, null, 'phone-390', '/sign-in')
    await btn(page, 'Sign In').click()
    await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible()
    await expect(page).toHaveURL(/sign-in/)
    await page.getByLabel('Email').fill(ACCOUNTS.admin.email)
    await page.getByLabel('Password', { exact: true }).fill('wrong-password')
    await btn(page, 'Sign In').click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/sign-in/)
    await page.getByLabel('Password', { exact: true }).fill(QA_PASSWORD)
    await btn(page, 'Sign In').click()
    await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await ctx.close()
  })
})
