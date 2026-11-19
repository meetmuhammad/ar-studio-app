import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Selectors and small flows for the Refine + antd UI, shared by the local
 * suite (e2e/*.spec.ts) and the staging suite (e2e/staging/*.spec.ts).
 * Everything goes through what a user sees: roles, labels, button text.
 *
 * antd icon buttons carry the icon's name in their accessible name
 * ("search Search", "right Next", "plus Create Customer"), so buttons are
 * matched with an optional leading (and trailing) word.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A button whose visible text is `text`, with or without an icon name around it. */
export const btn = (scope: Page | Locator, text: string) =>
  scope.getByRole('button', { name: new RegExp(`^(\\S+ )?${escape(text)}( \\S+)?$`, 'i') })

/** A unique, human-readable suffix for data a test creates. */
export const uniqueSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** A phone number accepted by the customer schema, unique enough per run. */
export const uniquePhone = () => `3${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`

export async function settle(page: Page, ms = 300) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(ms)
}

// ------------------------------------------------------------------ shell

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await btn(page, 'Sign In').click()
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 30_000 })
}

/** The sider menu (desktop) or the drawer menu (below lg, opened first). */
export async function navMenu(page: Page): Promise<Locator> {
  const width = page.viewportSize()?.width ?? 1440
  if (width < 992) {
    await page.getByRole('button', { name: /^bars$/i }).click()
    const drawer = page.locator('.ant-drawer-open')
    await expect(drawer).toBeVisible()
    return drawer.getByRole('menu')
  }
  return page.locator('.ant-layout-sider').getByRole('menu')
}

export async function menuLabels(page: Page): Promise<string[]> {
  const menu = await navMenu(page)
  await expect(menu.getByRole('menuitem').first()).toBeVisible()
  return (await menu.getByRole('menuitem').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
}

export const MENU = {
  admin: ['Dashboard', 'Customers', 'Orders', 'Measurements', 'Vendors', 'Ledger', 'P&L'],
  staff: ['Customers', 'Orders', 'Measurements'],
} as const

/** 403 result shown by the admin-only pages (Vendors, Ledger, P&L). */
export const forbidden = (page: Page) => page.getByText('Sorry, you are not authorized to access this page.')

/**
 * Press Escape on an open modal/drawer and expect it to close. Waits until focus
 * has moved inside the overlay first: antd handles Escape on the overlay, so a
 * key pressed while focus is still on the page behind it does nothing.
 */
export async function closeWithEscape(page: Page, overlay: Locator) {
  await expect(overlay).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => !!document.activeElement?.closest('.ant-modal-wrap, .ant-drawer, [role="dialog"]')))
    .toBe(true)
  await page.keyboard.press('Escape')
  await expect(overlay).toBeHidden()
}

/**
 * Choose an option of an antd Segmented control. Its radio inputs are visually
 * hidden, so click the visible option (the radio's label) and check the state.
 */
export async function chooseSegment(page: Page, option: string) {
  const radio = page.getByRole('radio', { name: option, exact: true })
  await radio.locator('xpath=..').click()
  await expect(radio).toBeChecked()
}

/** The customers list, with or without the list state Refine keeps in the URL. */
export const CUSTOMERS_URL = /\/customers(\?.*)?$/

/**
 * Selects `name` in the header business switcher (combobox "Business") and
 * waits for the shell to show it. No-op when it is already selected. The
 * switcher's selected value covers its input, so the select is opened by its
 * selector box.
 */
export async function switchBusiness(page: Page, name: string) {
  const select = page
    .getByRole('combobox', { name: 'Business' })
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
  await expect(select).toBeVisible({ timeout: 20_000 })
  const current = select.locator('.ant-select-selection-item')
  if ((await current.getAttribute('title').catch(() => null)) === name || (await current.innerText().catch(() => '')) === name) return
  await select.locator('.ant-select-selector').click()
  const option = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: new RegExp(`^${escape(name)}$`) })
  await expect(option).toBeVisible()
  await option.click()
  await expect(current).toHaveText(name)
  await settle(page)
}

export async function toggleTheme(page: Page) {
  await page.getByRole('button', { name: /^Switch to (dark|light) mode$/ }).click()
}

export const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'))

// ------------------------------------------------------------------ lists

/** Fill a FilterBar field by its label and press Search. */
export async function search(page: Page, label: string, text: string) {
  await page.getByLabel(label, { exact: true }).fill(text)
  await btn(page.getByRole('search').first(), 'Search').click()
  await settle(page)
}

export const rows = (page: Page) => page.locator('.ant-table-row')

/** The open popconfirm: visible and not on its way out. */
const openPopover = (page: Page) => page.locator('.ant-popover:not(.ant-popover-hidden):visible').last()

/**
 * Confirm the open popconfirm with its Delete button. Waits until the popover
 * is visible and its open animation has finished (a moving button is "not
 * stable"). If the popover goes away before or during the click (the list
 * refreshed and the row was already removed), that counts as done.
 * Returns true when the click landed.
 */
export async function confirmDelete(page: Page): Promise<boolean> {
  const popover = openPopover(page)
  try {
    await expect(popover).toBeVisible({ timeout: 5_000 })
    await expect
      .poll(
        () =>
          popover.evaluate((el) =>
            el.getAnimations({ subtree: true }).every((a) => a.playState !== 'running') &&
            !/-(enter|appear)(-active)?\b/.test(el.className),
          ),
        { timeout: 5_000 },
      )
      .toBe(true)
    await btn(popover, 'Delete').click({ timeout: 5_000 })
    return true
  } catch (e) {
    // gone because the row it belonged to is gone: nothing left to confirm
    if ((await openPopover(page).count()) === 0) return false
    throw e
  }
}

/**
 * Delete rows one at a time while a button named `name` exists, re-querying
 * after every refresh. A delete button or popover that disappears mid-way
 * (row already removed) is treated as success; the loop simply looks again.
 */
export async function deleteAllRows(page: Page, name: RegExp, max = 10) {
  const body = page.locator('.ant-table-tbody')
  for (let i = 0; i < max; i++) {
    await settle(page)
    const target = body.getByRole('button', { name }).first()
    if ((await target.count()) === 0) return
    try {
      await target.click({ timeout: 5_000 })
    } catch {
      continue // detached by a refresh: look again
    }
    if (await confirmDelete(page)) {
      // wait for the popover to close and the list to refresh before looking again
      await expect(openPopover(page)).toHaveCount(0, { timeout: 10_000 }).catch(() => {})
      await settle(page, 800)
    }
  }
  await settle(page)
  expect(await body.getByRole('button', { name }).count(), `rows matching ${name} remain after cleanup`).toBe(0)
}

/** Click a row's delete button (aria-label "Delete <label>") and confirm the popconfirm. */
export async function deleteRow(page: Page, label: string | RegExp) {
  const name = typeof label === 'string' ? new RegExp(`^Delete ${escape(label)}$`) : label
  await page.getByRole('button', { name }).first().click()
  await confirmDelete(page)
  await settle(page)
}

/** Pick the first option of an antd Select (combobox) after typing `text`. */
export async function pickOption(page: Page, comboboxName: string, text: string) {
  const cb = page.getByRole('combobox', { name: comboboxName }).first()
  await cb.click()
  await cb.fill(text)
  const option = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).first()
  await expect(option).toBeVisible({ timeout: 15_000 })
  await option.click()
}

// ------------------------------------------------------------------ records

export async function createCustomer(page: Page, name: string, phone: string) {
  await page.goto('/customers/create')
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.getByLabel('Phone', { exact: true }).fill(phone)
  await btn(page, 'Create Customer').click()
  await expect(page).toHaveURL(/\/customers\/show\//, { timeout: 20_000 })
  return page.url().split('/').pop()!
}

/** Delete every customer matching `phone` (and, first, their orders and measurements). No-op when none. */
export async function removeCustomerAndDependants(page: Page, name: string, phone: string) {
  await removeOrdersFor(page, name)
  await page.goto('/measurements')
  await search(page, 'Customer name or phone', phone)
  await deleteAllRows(page, /^Delete /)
  await page.goto('/customers')
  await search(page, 'Name or phone', phone)
  await deleteAllRows(page, /^Delete /, 5)
}

/** Delete every order whose customer is `customerName` (orders list search covers all statuses). */
export async function removeOrdersFor(page: Page, customerName: string) {
  await page.goto('/orders')
  await search(page, 'Order number or customer', customerName)
  await deleteAllRows(page, /^Delete order /)
}

export async function removeVendor(page: Page, name: string) {
  await page.goto('/vendors')
  await search(page, 'Search vendors', name)
  await deleteAllRows(page, new RegExp(`^Delete ${escape(name)}$`), 5)
}

export async function removeCategory(page: Page, name: string) {
  await page.goto('/vendors')
  await settle(page)
  await btn(page, 'Manage Categories').click()
  const drawer = page.locator('.ant-drawer-open')
  await expect(drawer).toBeVisible()
  const del = drawer.getByRole('button', { name: new RegExp(`^Delete ${escape(name)}$`) })
  if (await del.count()) {
    await del.first().click()
    await confirmDelete(page)
    await settle(page)
  }
  await page.keyboard.press('Escape')
}
