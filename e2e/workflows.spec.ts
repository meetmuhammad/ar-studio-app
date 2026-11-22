import { test, expect, type Browser, type Page } from '@playwright/test'
import { ctxFor, VIEWPORTS, watch, settle as settleLocal, type Role } from './helpers'
import { assertLocalTarget } from './global-guard'
import {
  btn,
  closeWithEscape,
  createCustomer,
  forbidden,
  pickOption,
  removeCategory,
  removeCustomerAndDependants,
  removeVendor,
  rows,
  search,
  settle,
  uniquePhone,
  uniqueSuffix,
} from './support/ui'

/**
 * Principal workflows through the real UI against the LOCAL database. Every
 * record is disposable (names start "QA-E2E" plus a unique suffix) and is
 * removed through the UI as admin in `finally`, whether the test passed or not.
 * Table layouts (>= 768px); phones get the card list and are covered by audit.
 */
const WORKFLOW_VIEWPORTS = ['desktop-1440', 'tablet-land-1024']
const vp = (n: string) => VIEWPORTS.find((v) => v.name === n)!

async function start(browser: Browser, role: Role, viewport: string, path: string) {
  assertLocalTarget()
  const ctx = await ctxFor(browser, role, vp(viewport))
  const page = await ctx.newPage()
  page.setDefaultTimeout(20_000)
  const w = watch(page)
  await page.goto(path)
  await settleLocal(page)
  return { ctx, page, w }
}

const content = (page: Page) => page.locator('.ant-layout-content')

for (const v of WORKFLOW_VIEWPORTS) {
  test.describe(`workflows @ ${v}`, () => {
    test('customers: validation, create, search, reload, edit, delete', async ({ browser }) => {
      const sfx = uniqueSuffix()
      let name = `QA-E2E Customer ${sfx}`
      const phone = uniquePhone()
      const { ctx, page, w } = await start(browser, 'admin', v, '/customers/create')
      try {
        await btn(page, 'Create Customer').click()
        await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible()
        await expect(page).toHaveURL(/\/customers\/create/)

        await createCustomer(page, name, phone)
        await page.goto('/customers')
        await search(page, 'Name or phone', phone)
        await expect(rows(page)).toHaveCount(1)
        await page.reload(); await settle(page)
        await expect(page.getByRole('link', { name: `View ${name}` })).toBeVisible()

        await page.getByRole('link', { name: `Edit ${name}` }).click()
        name = `${name} edited`
        await page.getByLabel('Name', { exact: true }).fill(name)
        await btn(page, 'Update Customer').click()
        await expect(page).toHaveURL(/\/customers\/show\//)
        await expect(content(page).getByText(name).first()).toBeVisible()

        await page.goto('/customers')
        await search(page, 'Name or phone', phone)
        await page.getByRole('button', { name: `Delete ${name}` }).click()
        await btn(page.locator('.ant-popover:visible'), 'Delete').click()
        await expect(rows(page)).toHaveCount(0)
        expect(w.consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([])
      } finally {
        await removeCustomerAndDependants(page, name, phone)
        await ctx.close()
      }
    })

    test('measurements: create from the customer deep link, edit, delete', async ({ browser }) => {
      const sfx = uniqueSuffix()
      const name = `QA-E2E Measure ${sfx}`
      const phone = uniquePhone()
      const setName = `QA-E2E Set ${sfx}`
      const { ctx, page } = await start(browser, 'admin', v, '/customers')
      try {
        await createCustomer(page, name, phone)
        await page.getByRole('link', { name: /New measurement/i }).or(page.getByRole('button', { name: /New measurement/i })).first().click()
        await expect(page).toHaveURL(/\/measurements\/create\?customer_id=/)
        await page.getByLabel('Measurement Set Name').fill(setName)
        await page.locator('input#chest').fill('40.5')
        await page.locator('input#waist').fill('34')
        await btn(page, 'Create Measurement').dblclick()
        await expect(page).toHaveURL(/\/measurements\/show\//)

        await page.goto('/measurements')
        await search(page, 'Customer name or phone', phone)
        await expect(rows(page), 'one set for one (double-clicked) submit').toHaveCount(1)
        await page.getByRole('link', { name: `Edit ${setName}` }).click()
        await expect(page.locator('input#chest')).toHaveValue('40.5')
        await page.locator('input#chest').fill('41')
        await btn(page, 'Update Measurement').click()
        await expect(page).toHaveURL(/\/measurements\/show\//)
        await expect(content(page).getByText('41').first()).toBeVisible()

        await page.goto('/measurements')
        await search(page, 'Customer name or phone', phone)
        await page.getByRole('button', { name: `Delete ${setName}` }).click()
        await btn(page.locator('.ant-popover:visible'), 'Delete').click()
        await expect(rows(page)).toHaveCount(0)
      } finally {
        await removeCustomerAndDependants(page, name, phone)
        await ctx.close()
      }
    })

    test('vendors: category drawer, create with a tag, show, delete', async ({ browser }) => {
      const sfx = uniqueSuffix()
      const vendor = `QA-E2E Vendor ${sfx}`
      const category = `QA-E2E Cat ${sfx}`
      const tag = `qa-${sfx}`
      const { ctx, page } = await start(browser, 'admin', v, '/vendors')
      try {
        await btn(page, 'Manage Categories').click()
        const drawer = page.locator('.ant-drawer-open')
        await drawer.getByLabel('New category name').fill(category)
        await btn(drawer, 'Add').click()
        await expect(drawer.getByText(category, { exact: true })).toBeVisible()
        await closeWithEscape(page, drawer)

        await btn(page, 'Add Vendor').click()
        await page.getByLabel('Vendor Name').fill(vendor)
        const tags = page.getByRole('combobox', { name: 'Tags' })
        await tags.click(); await tags.fill(tag); await page.keyboard.press('Enter')
        await expect(page).toHaveURL(/\/vendors\/create/)
        await btn(page, 'Create Vendor').click()
        await expect(page).not.toHaveURL(/\/vendors\/create/)

        await page.goto('/vendors')
        await search(page, 'Search vendors', vendor)
        await page.getByRole('link', { name: `View ${vendor}` }).click()
        await expect(page).toHaveURL(/\/vendors\/show\//)
        await expect(content(page).getByText(tag)).toBeVisible()

        await page.goto('/vendors')
        await search(page, 'Search vendors', vendor)
        await page.getByRole('button', { name: `Delete ${vendor}` }).click()
        await btn(page.locator('.ant-popover:visible'), 'Delete').click()
        await expect(rows(page)).toHaveCount(0)
      } finally {
        await removeVendor(page, vendor)
        await removeCategory(page, category)
        await ctx.close()
      }
    })

    test('orders + payments: Steps create (double submit = one order), record/edit/delete payment, delete order', async ({ browser }) => {
      const sfx = uniqueSuffix()
      const name = `QA-E2E Order ${sfx}`
      const phone = uniquePhone()
      const { ctx, page } = await start(browser, 'admin', v, '/customers')
      try {
        await createCustomer(page, name, phone)
        await page.goto('/orders/create'); await settle(page)
        await pickOption(page, 'Customer', name)
        await btn(page, 'Add Item').click()
        await page.getByLabel('Item 1 description').fill('QA-E2E tailored coat')
        await btn(page, 'Next').click()
        await btn(page, 'Next').click()
        await page.getByLabel('Total').fill('10000')
        await page.getByLabel('Advance').fill('2500')
        await expect(page.getByLabel('Balance (Calculated)')).toHaveValue(/7,?500/)
        await btn(page, 'Create Order').dblclick()
        await expect(page).toHaveURL(/\/orders\/show\//)
        const orderPath = new URL(page.url()).pathname
        const orderNumber = (await page.getByRole('heading', { name: /^Order / }).first().innerText()).replace(/^Order\s+/, '').trim()

        await page.goto('/orders')
        await search(page, 'Order number or customer', name)
        await expect(rows(page), 'one order for one (double-clicked) submit').toHaveCount(1)

        await page.goto(orderPath); await settle(page)
        await btn(page, 'Record Payment').click()
        const modal = page.locator('.ant-modal:visible')
        await modal.getByLabel('Amount').fill('1500')
        await btn(modal, 'Add Payment').dblclick()
        await expect(modal).toBeHidden()
        await expect(page.getByText('Payments (1)'), 'one payment for one (double-clicked) submit').toBeVisible()
        await expect(content(page).getByText(/4,000/).first()).toBeVisible()

        await page.getByRole('button', { name: /^Edit payment of / }).first().click()
        const edit = page.locator('.ant-modal:visible')
        await edit.getByLabel('Amount').fill('2000')
        await btn(edit, 'Update Payment').click()
        await expect(content(page).getByText(/4,500/).first()).toBeVisible()

        await page.getByRole('button', { name: /^Delete payment of / }).first().click()
        await btn(page.locator('.ant-popover:visible'), 'Delete').click()
        await expect(page.getByText('Payments (0)')).toBeVisible()

        await btn(page, 'Delete').first().click()
        await btn(page.locator('.ant-popover:visible'), 'Delete').click()
        await expect(page).toHaveURL(/\/orders(\?|$)/)
        await search(page, 'Order number or customer', orderNumber)
        await expect(rows(page)).toHaveCount(0)
      } finally {
        await removeCustomerAndDependants(page, name, phone)
        await ctx.close()
      }
    })

    test('ledger: add an entry through the dialog, find it, delete it', async ({ browser }) => {
      const tag = `QA-E2E Ledger ${uniqueSuffix()}`
      const { ctx, page } = await start(browser, 'admin', v, '/ledger')
      try {
        await btn(page, 'Add Entry').first().click()
        const dlg = page.getByRole('dialog')
        await dlg.getByLabel('Entry Type').click()
        await page.getByRole('option', { name: 'Miscellaneous' }).click()
        await dlg.getByLabel('Particulars').fill(tag)
        await dlg.getByLabel('Amount').fill('777')
        await dlg.getByLabel('Transaction Type').click()
        await page.getByRole('option', { name: /Debit/ }).click()
        await dlg.getByRole('button', { name: 'Add Entry' }).dblclick()
        await expect(dlg).toBeHidden({ timeout: 15000 })

        await search(page, 'Search particulars', tag)
        await expect(rows(page), 'one entry for one (double-clicked) submit').toHaveCount(1)
        await expect(rows(page).first()).toContainText('777')

        await page.getByRole('button', { name: `Delete ledger entry ${tag}` }).click()
        await btn(page.locator('.ant-popover:visible'), 'Delete').click()
        await expect(rows(page)).toHaveCount(0)
      } finally {
        await search(page, 'Search particulars', tag).catch(() => {})
        for (let i = 0; i < 3 && (await page.getByRole('button', { name: `Delete ledger entry ${tag}` }).count()) > 0; i++) {
          await page.getByRole('button', { name: `Delete ledger entry ${tag}` }).first().click()
          await btn(page.locator('.ant-popover:visible'), 'Delete').click()
          await settle(page, 800)
        }
        await ctx.close()
      }
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Staff role: allowed modules work end to end; admin-only pages and actions stay closed.
// ---------------------------------------------------------------------------------------------
test('staff: can create and find customers; delete and admin pages are closed', async ({ browser }) => {
  const sfx = uniqueSuffix()
  const name = `QA-E2E Staff ${sfx}`
  const phone = uniquePhone()
  const staff = await start(browser, 'staff', 'desktop-1440', '/customers')
  try {
    await createCustomer(staff.page, name, phone)
    await staff.page.goto('/customers')
    await search(staff.page, 'Name or phone', phone)
    await expect(staff.page.getByRole('link', { name: `View ${name}` })).toBeVisible()
    await expect(staff.page.getByRole('button', { name: `Delete ${name}` })).toBeDisabled()
    for (const path of ['/ledger', '/pnl', '/vendors']) {
      await staff.page.goto(path); await settle(staff.page)
      await expect(forbidden(staff.page)).toBeVisible()
    }
  } finally {
    await staff.ctx.close()
    const admin = await start(browser, 'admin', 'desktop-1440', '/customers')
    await removeCustomerAndDependants(admin.page, name, phone)
    await admin.ctx.close()
  }
})
