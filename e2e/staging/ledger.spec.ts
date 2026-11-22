import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { test, expect, pageAs, PREFIX } from './fixtures'
import {
  btn,
  confirmDelete,
  deleteAllRows,
  forbidden,
  removeVendor,
  rows,
  search,
  settle,
  switchBusiness,
  toggleTheme,
  uniqueSuffix,
} from '../support/ui'

/** The business with orders (and so order-owned ledger rows) on the dummy project. */
const BUSINESS = 'Ahsan Tariq Couture'

/**
 * Ledger entries and vendor bills/payments through the ledger functions
 * (20261119000300). Every record carries this run's suffix and is removed in
 * afterAll. With E2E_SHOTS_DIR set, full-page screenshots are saved there.
 */
const sfx = uniqueSuffix()
const entry = `${PREFIX} Ledger ${sfx}`
const vendor = `${PREFIX} Ledger Vendor ${sfx}`
const bill = `${PREFIX} Bill ${sfx}`
let vendorShowPath = ''

test.describe.configure({ mode: 'serial' })

// ------------------------------------------------------------------ helpers

async function shot(page: Page, name: string) {
  const dir = process.env.E2E_SHOTS_DIR
  if (!dir) return
  await settle(page)
  await page.screenshot({ path: path.join(dir, name), fullPage: true })
}

/** The numeric value of the Statistic in the section card titled `title`. */
async function statistic(scope: Locator | Page, title: string): Promise<number> {
  const card = scope
    .locator('.ant-card-head-title')
    .filter({ hasText: new RegExp(`^${title}$`) })
    .first()
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-card ")][1]')
  // While loading, antd renders a skeleton instead of the value.
  const value = card.locator('.ant-statistic-content').first()
  await expect(value).toBeVisible()
  const text = await value.innerText()
  return Number(text.replace(/[^0-9.-]/g, ''))
}

const drawer = (page: Page) => page.locator('.ant-drawer-open .ant-drawer-content')
const modal = (page: Page) => page.locator('.ant-modal-wrap:visible .ant-modal')

async function chooseOption(page: Page, scope: Locator, combobox: string, option: string) {
  // The selected value's span covers the search input, so open the select by its selector box.
  const select = scope
    .getByRole('combobox', { name: combobox })
    .locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
  await select.locator('.ant-select-selector').click()
  const item = page.locator(`.ant-select-dropdown:visible .ant-select-item-option[title="${option}"]`)
  await expect(item).toBeVisible()
  await item.click()
  await expect(select.locator('.ant-select-selection-item')).toHaveText(option)
}

// ------------------------------------------------------------------ cleanup

// Every admin test (and the cleanup) works in one known business, whatever was
// last selected. Staff belong to one business and have no switcher.
test.beforeEach(async ({ page, role }) => {
  if (role !== 'admin') return
  await page.goto('/customers')
  await switchBusiness(page, BUSINESS)
})

test.afterAll(async ({ browser }) => {
  const { page, close } = await pageAs(browser, 'admin')
  await page.goto('/customers')
  await switchBusiness(page, BUSINESS)
  if (vendorShowPath) {
    await page.goto(vendorShowPath)
    await settle(page)
    if ((await page.locator('.ant-table-tbody').count()) > 0) await deleteAllRows(page, /^Delete /)
  }
  await removeVendor(page, vendor)
  await page.goto('/ledger')
  await search(page, 'Search particulars', sfx)
  await deleteAllRows(page, /^Delete ledger entry /)
  await close()
})

// ------------------------------------------------------------------ 1. ledger page

test('ledger: add a miscellaneous debit, find, edit, totals follow, delete', async ({ page }) => {
  await page.goto('/ledger')
  await settle(page)
  await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible()
  const before = await statistic(page, 'Total Debit')

  await btn(page, 'Add Entry').first().click()
  const d = drawer(page)
  await expect(d).toBeVisible()
  await chooseOption(page, d, 'Entry type', 'Miscellaneous')
  await d.getByText('Debit (money in)').click()
  await d.getByLabel('Amount').fill('777')
  await d.getByLabel('Particulars').fill(entry)
  await shot(page, 'ledger-add-entry-drawer-light.png')
  await btn(d, 'Add Entry').click()
  await expect(d).toBeHidden()

  await expect.poll(() => statistic(page, 'Total Debit')).toBe(before + 777)
  await search(page, 'Search particulars', entry)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('777')
  await shot(page, 'ledger-list-light.png')

  await page.getByRole('button', { name: `Edit ledger entry ${entry}` }).click()
  await expect(drawer(page)).toBeVisible()
  await expect(drawer(page).getByLabel('Particulars')).toHaveValue(entry)
  await drawer(page).getByLabel('Amount').fill('1000')
  await btn(drawer(page), 'Update Entry').click()
  await expect(drawer(page)).toBeHidden()
  await expect(rows(page).first()).toContainText('1,000')
  await expect.poll(() => statistic(page, 'Total Debit')).toBe(before + 1000)

  await toggleTheme(page)
  await shot(page, 'ledger-list-dark.png')
  await toggleTheme(page)

  await page.getByRole('button', { name: `Delete ledger entry ${entry}` }).click()
  await confirmDelete(page)
  await expect(rows(page)).toHaveCount(0)
  await expect.poll(() => statistic(page, 'Total Debit')).toBe(before)
})

test('ledger: an order-owned row is read only and links to its order', async ({ page }) => {
  await page.goto('/ledger?type=order_payment')
  await settle(page)
  test.skip((await rows(page).count()) === 0, 'no order payment rows in this business')
  const row = rows(page).filter({ has: page.getByRole('link', { name: /^Open order / }) }).first()
  await expect(row).toBeVisible()
  await expect(row.getByText('Read only')).toBeVisible()
  await expect(row.getByRole('button', { name: /^(Edit|Delete) ledger entry / })).toHaveCount(0)
  const href = await row.getByRole('link', { name: /^Open order / }).getAttribute('href')
  expect(href).toMatch(/^\/orders\/show\//)
})

// ------------------------------------------------------------------ 2. vendor ledger

test('vendor ledger: bill and payment, totals, edit the bill, delete both, delete the vendor', async ({ page }) => {
  await page.goto('/vendors/create')
  await page.getByLabel('Vendor Name').fill(vendor)
  await btn(page, 'Create Vendor').click()
  await expect(page).not.toHaveURL(/\/vendors\/create/)
  await page.goto('/vendors')
  await search(page, 'Search vendors', vendor)
  await page.getByRole('link', { name: `View ${vendor}` }).click()
  await expect(page).toHaveURL(/\/vendors\/show\//)
  vendorShowPath = new URL(page.url()).pathname
  await settle(page)

  const card = page.locator('.ant-card').filter({ has: page.getByRole('button', { name: /Record payment$/ }) }).first()
  await expect(card.getByText('No bills or payments for this vendor yet.')).toBeVisible()

  // Add bill: 5,000 billed
  await btn(card, 'Add bill').click()
  const m = modal(page)
  await expect(m).toBeVisible()
  await m.getByLabel('Particulars').fill(bill)
  await m.getByLabel('Amount').fill('5000')
  await shot(page, 'vendor-ledger-bill-modal-light.png')
  await btn(m, 'Add Bill').click()
  await expect(m).toBeHidden()

  // Record payment: 3,000 paid (particulars default to the vendor name)
  await btn(card, 'Record payment').click()
  const d = drawer(page)
  await expect(d).toBeVisible()
  await d.getByLabel('Amount').fill('3000')
  await btn(d, 'Add Entry').click()
  await expect(d).toBeHidden()

  await expect.poll(() => statistic(card, 'Billed')).toBe(5000)
  await expect.poll(() => statistic(card, 'Paid')).toBe(3000)
  await expect.poll(() => statistic(card, 'Balance owed')).toBe(2000)
  await expect(card.getByText('You owe the vendor')).toBeVisible()
  await expect(card.locator('.ant-table-row')).toHaveCount(2)
  await shot(page, 'vendor-ledger-card-light.png')
  await toggleTheme(page)
  await shot(page, 'vendor-ledger-card-dark.png')
  await toggleTheme(page)

  // Edit the bill: owed follows
  await card.getByRole('button', { name: `Edit ${bill}` }).click()
  await expect(modal(page)).toBeVisible()
  await modal(page).getByLabel('Amount').fill('4500')
  await btn(modal(page), 'Update Bill').click()
  await expect(modal(page)).toBeHidden()
  await expect.poll(() => statistic(card, 'Balance owed')).toBe(1500)

  // Delete the payment (removes its general ledger entry too), then the bill.
  await card.getByRole('button', { name: `Delete ${vendor}` }).click()
  await confirmDelete(page)
  await expect.poll(() => statistic(card, 'Paid')).toBe(0)
  await card.getByRole('button', { name: `Delete ${bill}` }).click()
  await confirmDelete(page)
  await expect.poll(() => statistic(card, 'Billed')).toBe(0)
  await expect(card.getByText('No bills or payments for this vendor yet.')).toBeVisible()

  await page.goto('/ledger')
  await search(page, 'Search particulars', sfx)
  await expect(rows(page)).toHaveCount(0)

  await removeVendor(page, vendor)
  await search(page, 'Search vendors', vendor)
  await expect(rows(page)).toHaveCount(0)
  vendorShowPath = ''
})

// ------------------------------------------------------------------ 3. staff

test.describe('staff', () => {
  test.use({ role: 'staff' })

  test('staff: the ledger shows 403', async ({ page }) => {
    await page.goto('/ledger')
    await expect(forbidden(page)).toBeVisible()
  })
})
