import { test, expect, creds, pageAs } from './fixtures'
import { CUSTOMERS_URL, MENU, btn, closeWithEscape, isDark, menuLabels, settle, toggleTheme } from '../support/ui'

test.describe('sign-in', () => {
  test.use({ role: null })

  test('a wrong password shows an alert and stays on sign-in', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(creds('staff').email)
    await page.getByLabel('Password', { exact: true }).fill(`wrong-${Date.now()}`)
    await btn(page, 'Sign In').click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('signed-out visitors are sent to sign-in', async ({ page }) => {
    for (const path of ['/', '/customers', '/orders', '/ledger']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/sign-in/)
    }
  })
})

test.describe('admin shell', () => {
  test('menu, header actions and account menu', async ({ page }) => {
    await page.goto('/')
    await settle(page)
    expect(await menuLabels(page)).toEqual(MENU.admin)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

    await page.getByRole('button', { name: 'Account menu' }).click()
    await expect(page.locator('.ant-dropdown:visible').getByText(creds('admin').email)).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Sign out/ })).toBeVisible()
    await page.keyboard.press('Escape')

    await btn(page, 'Add New Payment').click()
    const modal = page.locator('.ant-modal:visible')
    await expect(modal.getByRole('combobox', { name: 'Order' })).toBeVisible()
    await closeWithEscape(page, modal)

    await btn(page, 'Create New Order').click()
    await expect(page).toHaveURL(/\/orders\/create/)
  })

  test('phone: the menu opens in a drawer', async ({ browser }) => {
    const { page, close } = await pageAs(browser, 'admin', { width: 390 })
    await page.goto('/customers')
    await settle(page)
    expect(await menuLabels(page)).toEqual(MENU.admin)
    await page.keyboard.press('Escape')
    await expect(page.locator('.ant-drawer-open')).toBeHidden()
    await btn(page, 'Create').click()
    await expect(page.getByRole('menuitem', { name: /New order/ })).toBeVisible()
    await close()
  })

  test('light / dark choice survives a reload', async ({ page }) => {
    await page.goto('/customers')
    await settle(page)
    const before = await isDark(page)
    await toggleTheme(page)
    await expect.poll(() => isDark(page)).toBe(!before)
    await page.reload()
    await settle(page)
    expect(await isDark(page)).toBe(!before)
    await expect(page.getByRole('button', { name: before ? 'Switch to dark mode' : 'Switch to light mode' })).toBeVisible()
    await toggleTheme(page)
    await expect.poll(() => isDark(page)).toBe(before)
  })
})

test.describe('staff shell', () => {
  test.use({ role: 'staff' })

  test('menu lists only their modules; payments are admin-only', async ({ page }) => {
    await page.goto('/customers')
    await settle(page)
    expect(await menuLabels(page)).toEqual(MENU.staff)
    await expect(btn(page, 'Create New Order')).toBeEnabled()
    await expect(btn(page, 'Add New Payment')).toBeDisabled()
    await page.getByRole('button', { name: 'Account menu' }).click()
    await expect(page.locator('.ant-dropdown:visible').getByText(creds('staff').email)).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('the dashboard sends staff to customers', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(CUSTOMERS_URL)
  })
})
