import { test, expect } from './fixtures'
import { CUSTOMERS_URL, btn, chooseSegment, forbidden, settle } from '../support/ui'

/** Read-only: the admin reports render; staff cannot open them. Creates no data. */

test('dashboard: KPI cards, period presets and sales tabs', async ({ page }) => {
  await page.goto('/')
  await settle(page)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  for (const title of ['Revenue', 'Cash received', 'Orders', 'Outstanding balance']) {
    await expect(page.locator('.ant-card').getByText(title, { exact: true }).first()).toBeVisible()
  }
  await chooseSegment(page, 'This Year')
  await expect(page.getByText(/This Year ·/)).toBeVisible()
  const charts = page.getByRole('region', { name: 'Sales charts' })
  await charts.getByRole('tab', { name: 'Orders' }).click()
  await expect(charts.getByRole('tab', { name: 'Orders', selected: true })).toBeVisible()
  await expect(page.getByText('Upcoming deliveries (next 14 days)')).toBeVisible()
  await expect(page.getByRole('link', { name: /See all orders/ })).toBeVisible()
})

test('ledger: filters, totals and export', async ({ page }) => {
  await page.goto('/ledger')
  await settle(page)
  await expect(page.getByRole('heading', { name: 'General Ledger' })).toBeVisible()
  await expect(page.getByRole('search', { name: 'Ledger filters' })).toBeVisible()
  for (const title of ['Total Debit', 'Total Credit', 'Total Entries']) await expect(page.getByText(title, { exact: true })).toBeVisible()
  await btn(page, 'Expand').click()
  await page.getByRole('combobox', { name: 'Entry type' }).click()
  await page.getByTitle('Vendor payment').click()
  await btn(page.getByRole('search'), 'Search').click()
  await expect(page).toHaveURL(/type=vendor_payment/)
  const [download] = await Promise.all([page.waitForEvent('download'), btn(page, 'Export CSV').click()])
  expect(download.suggestedFilename()).toMatch(/\.csv$/)
})

test('P&L: basis and period switch the statement', async ({ page }) => {
  await page.goto('/pnl')
  await settle(page)
  const statement = page.getByRole('table', { name: 'Profit and loss statement' })
  await expect(statement).toBeVisible()
  await expect(statement.getByText('Net profit')).toBeVisible()
  await chooseSegment(page, 'Accrual basis')
  await expect(page.getByText('Accrual basis, in PKR')).toBeVisible()
  await chooseSegment(page, 'This Year')
  await expect(page.getByText('Monthly breakdown')).toBeVisible()
})

test.describe('staff', () => {
  test.use({ role: 'staff' })

  test('staff: dashboard redirects; ledger and P&L show 403', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(CUSTOMERS_URL)
    for (const path of ['/ledger', '/pnl']) {
      await page.goto(path)
      await expect(forbidden(page)).toBeVisible()
    }
  })
})
