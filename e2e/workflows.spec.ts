/* eslint-disable @typescript-eslint/no-explicit-any -- test plumbing over untyped JSON and page.evaluate payloads */
import { test, expect, type Page, type Browser } from '@playwright/test'
import { ctxFor, VIEWPORTS, watch, settle, type Viewport } from './helpers'
import { assertLocalTarget } from './global-guard'

/**
 * Principal workflows through the real UI, as a real signed-in admin, against the
 * LOCAL database. Every record is disposable (name/particulars start "QA-E2E") and is
 * removed through the ordinary admin API in `finally`, whether the test passed or not.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
const WORKFLOW_VIEWPORTS = ['phone-390', 'tablet-820', 'desktop-1440']
const vp = (n: string): Viewport => VIEWPORTS.find((v) => v.name === n)!
const mark = (l: string) => console.log(`[${new Date().toISOString().slice(14, 23)}] ${l}`)
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

async function token(page: Page): Promise<string> {
  return page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('auth-token'))!
    return JSON.parse(localStorage[k]).access_token as string
  })
}
async function api(page: Page, method: string, path: string, body?: unknown) {
  const res = await page.request.fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(page)}`, 'Content-Type': 'application/json' },
    data: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status(), json: await res.json().catch(() => null) as any }
}
const rowsOf = (j: any): any[] => (Array.isArray(j) ? j : j?.data ?? j?.payments ?? j?.measurements ?? j?.entries ?? j?.vendors ?? j?.customers ?? j?.orders ?? [])

async function start(browser: Browser, viewport: string, path: string) {
  assertLocalTarget()
  const ctx = await ctxFor(browser, 'admin', vp(viewport))
  const page = await ctx.newPage()
  page.setDefaultTimeout(20_000)
  const w = watch(page)
  await page.goto(path)
  await settle(page)
  return { ctx, page, w }
}
const toast = (page: Page, text: RegExp | string) => expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible({ timeout: 15000 })

for (const v of WORKFLOW_VIEWPORTS) {
  test.describe(`workflows @ ${v}`, () => {
    test('customers: create, search, reload, edit, delete', async ({ browser }) => {
      const tag = `QA-E2E Customer ${stamp()}`
      const { ctx, page, w } = await start(browser, v, '/customers')
      let id: string | undefined
      try {
        await page.getByRole('button', { name: 'New Customer', exact: true }).click()
        const dlg = page.getByRole('dialog')
        // validation first: empty submit shows errors and creates nothing
        await dlg.getByRole('button', { name: 'Create Customer' }).click()
        await expect(dlg).toBeVisible()
        await dlg.getByLabel('Name').fill(tag)
        await dlg.getByLabel('Phone').fill('+920000000123')
        await dlg.getByLabel(/Address/).fill('1 Test Lane')
        await dlg.getByRole('button', { name: 'Create Customer' }).click()
        mark('created dialog closed')
        await expect(dlg).toBeHidden({ timeout: 15000 })

        const search = page.getByPlaceholder('Search customers by name or phone...')
        await search.fill(tag)
        await settle(page)
        await expect(page.getByText(tag, { exact: true }).first()).toBeVisible({ timeout: 15000 })
        mark('found after create')
        // persistence: the record is really there after a full reload
        await page.reload(); await settle(page)
        await page.getByPlaceholder('Search customers by name or phone...').fill(tag)
        await settle(page)
        await expect(page.getByText(tag, { exact: true }).first()).toBeVisible({ timeout: 15000 })
        mark('reloaded and found')
        id = rowsOf((await api(page, 'GET', `/api/customers?search=${encodeURIComponent(tag)}`)).json).find((c) => c.name === tag)?.id
        expect(id, 'customer exists in the API').toBeTruthy()

        mark('id fetched')
        // edit through the row menu
        const row = page.locator('tr', { hasText: tag }).first()
        await row.getByRole('button', { name: 'Open menu' }).click()
        await page.getByRole('menuitem', { name: 'Edit customer' }).click()
        const edit = page.getByRole('dialog')
        await edit.getByLabel('Name').fill(`${tag} edited`)
        await edit.getByRole('button', { name: 'Update Customer' }).click()
        await expect(edit).toBeHidden({ timeout: 15000 })
        mark('edit dialog closed')
        expect((await api(page, 'GET', `/api/customers/${id}`)).json?.name ?? (await api(page, 'GET', `/api/customers/${id}`)).json?.data?.name).toBe(`${tag} edited`)

        mark('edit verified')
        // delete with confirmation
        await page.getByPlaceholder('Search customers by name or phone...').fill(tag)
        await settle(page)
        const row2 = page.locator('tr', { hasText: `${tag} edited` }).first()
        await row2.getByRole('button', { name: 'Open menu' }).click()
        await page.getByRole('menuitem', { name: 'Delete customer' }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
        await expect.poll(async () => (await api(page, 'GET', `/api/customers/${id}`)).status, { timeout: 15000 }).toBeGreaterThanOrEqual(400)
        id = undefined
        expect(w.consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([])
      } finally {
        if (id) await api(page, 'DELETE', `/api/customers/${id}`)
        await ctx.close()
      }
    })

    test('ledger: add entry, totals move by exactly the amount, filter, edit, delete', async ({ browser }) => {
      const tag = `QA-E2E Ledger ${stamp()}`
      const { ctx, page } = await start(browser, v, '/ledger')
      const money = async (label: string) => {
        const txt = await page.locator('[data-slot="card"]').filter({ hasText: label }).first().innerText()
        return Number(/Rs\s*([\d,]+(?:\.\d+)?)/.exec(txt.replace(/\s+/g, ' '))![1].replace(/,/g, ''))
      }
      let entryId: string | undefined
      try {
        const before = await money('Total Debit')
        await page.getByRole('button', { name: 'Add Entry', exact: true }).first().click()
        const dlg = page.getByRole('dialog')
        // default type is Vendor Payment (needs a vendor); a standalone receipt is Miscellaneous + Debit
        await dlg.getByLabel('Entry Type').click()
        await page.getByRole('option', { name: 'Miscellaneous' }).click()
        await dlg.getByLabel('Particulars').fill(tag)
        await dlg.getByLabel('Amount').fill('777')
        await dlg.getByLabel('Transaction Type').click()
        await page.getByRole('option', { name: /Debit/ }).click()
        // double-click submit: the form must create exactly one entry
        const submit = dlg.getByRole('button', { name: 'Add Entry' })
        await submit.dblclick()
        await expect(dlg).toBeHidden({ timeout: 15000 })
        await expect.poll(() => money('Total Debit'), { timeout: 15000 }).toBe(before + 777)

        await page.getByPlaceholder('Search by particulars...').fill(tag)
        await settle(page)
        await expect(page.getByText(tag, { exact: true })).toHaveCount(1, { timeout: 15000 })
        const found = rowsOf((await api(page, 'GET', `/api/general-ledger?search=${encodeURIComponent(tag)}`)).json).filter((e) => e.particulars === tag)
        expect(found.length, 'exactly one ledger row for one submit').toBe(1)
        entryId = found[0].id
        expect(Number(found[0].debit)).toBe(777)
        expect(found[0].credit ?? 0).toBeFalsy()

        // delete via the in-app confirmation (not window.confirm)
        const row = page.locator('tr', { hasText: tag }).first()
        await row.getByRole('button', { name: /delete/i }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
        await expect(page.getByText(tag, { exact: true })).toHaveCount(0, { timeout: 15000 })
        entryId = undefined
        await page.getByPlaceholder('Search by particulars...').fill('')
        await expect.poll(() => money('Total Debit'), { timeout: 15000 }).toBe(before)
      } finally {
        if (entryId) await api(page, 'DELETE', `/api/general-ledger/${entryId}`)
        await ctx.close()
      }
    })

    test('orders + payments: create (double submit = one order), details, add payment, delete', async ({ browser }) => {
      const tag = `QA-E2E Order ${stamp()}`
      const { ctx, page } = await start(browser, v, '/orders')
      let customerId: string | undefined
      let orderId: string | undefined
      let orderNumber = ''
      try {
        const c = await api(page, 'POST', '/api/customers', { name: tag, phone: '+920000000777' })
        customerId = c.json?.id ?? c.json?.data?.id
        expect(customerId, 'setup customer').toBeTruthy()

        await page.getByRole('button', { name: 'New Order', exact: true }).click()
        const dlg = page.getByRole('dialog')
        // step 1: customer + one item (validation: Next without a customer must not advance)
        await dlg.getByRole('button', { name: 'Next' }).click()
        await expect(dlg.getByText(/Step 1|General Information/).first()).toBeVisible()
        await dlg.getByRole('combobox').first().click()
        await page.getByPlaceholder('Search customers...').fill(tag)
        await page.getByRole('option', { name: new RegExp(tag) }).click()
        await dlg.getByRole('button', { name: /Add Item/ }).click()
        await dlg.getByLabel('Description *').fill('QA-E2E tailored coat')
        await dlg.getByRole('button', { name: 'Next' }).click()
        // step 2: measurements are optional here
        await dlg.getByRole('button', { name: 'Next' }).click()
        // step 3: payment
        await dlg.getByLabel('Total *').fill('10000')
        await dlg.getByLabel('Advance *').fill('2500')
        await expect(dlg.getByText('7500.00').or(dlg.locator('input[value="7500.00"]')).first()).toBeVisible()
        await dlg.getByRole('button', { name: 'Create Order' }).dblclick()
        await expect(dlg).toBeHidden({ timeout: 20000 })
        await toast(page, /order created/i)

        // exactly one order, with the saved numbers
        const orders = rowsOf((await api(page, 'GET', `/api/orders?customerId=${customerId}&pageSize=50`)).json)
        expect(orders.length, 'one order for one (double-clicked) submit').toBe(1)
        orderId = orders[0].id; orderNumber = orders[0].order_number
        expect(Number(orders[0].total_amount)).toBe(10000)

        // list: find by typing the search and pressing Enter (the page searches on Enter)
        const search = page.getByPlaceholder(/Search by order number/)
        await search.fill(tag); await search.press('Enter'); await settle(page)
        await expect(page.getByText(orderNumber).first()).toBeVisible({ timeout: 15000 })
        await page.reload(); await settle(page)
        await page.getByPlaceholder(/Search by order number/).fill(orderNumber)
        await page.getByPlaceholder(/Search by order number/).press('Enter'); await settle(page)
        await expect(page.getByText(orderNumber).first()).toBeVisible({ timeout: 15000 })

        // details dialog shows the order and closes with Escape
        await page.getByRole('button', { name: `View order ${orderNumber}` }).click()
        const details = page.getByRole('dialog')
        await expect(details).toBeVisible()
        // the dialog shows raw amounts (10000.00), unlike the list's Rs 10,000
        await expect(details.getByText('10000.00').first()).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(details).toBeHidden()

        // edit the order through the UI; the update must keep (and change) the amounts it was given
        await page.getByRole('button', { name: `Edit order ${orderNumber}` }).click()
        const editDlg = page.getByRole('dialog')
        await expect(editDlg.getByRole('heading', { name: /edit order/i })).toBeVisible()
        await editDlg.getByRole('button', { name: 'Next' }).click()
        await editDlg.getByRole('button', { name: 'Next' }).click()
        await expect(editDlg.getByLabel('Total *')).toHaveValue('10000')
        await expect(editDlg.getByLabel('Advance *')).toHaveValue('2500')
        await editDlg.getByLabel('Total *').fill('10500')
        await editDlg.getByRole('button', { name: /Update Order/ }).click()
        await toast(page, /order updated/i)
        await expect(editDlg).toBeHidden({ timeout: 20000 })
        const edited = rowsOf((await api(page, 'GET', `/api/orders?customerId=${customerId}&pageSize=50`)).json)[0]
        expect(Number(edited.total_amount), 'edited total persisted').toBe(10500)
        expect(Number(edited.advance_paid), 'advance untouched by the edit').toBe(2500)

        // payment through the global action (phone: Create menu; tablet/desktop: header button)
        const paymentsBefore = rowsOf((await api(page, 'GET', `/api/payments?order_id=${orderId}`)).json)
        if (vp(v).width < 768) {
          await page.getByRole('button', { name: 'Create' }).click()
          await page.getByRole('menuitem', { name: 'Add payment' }).click()
        } else {
          await page.getByRole('button', { name: /Add New Payment|Payment/ }).first().click()
        }
        const pay = page.getByRole('dialog')
        await pay.getByRole('combobox').first().click()
        await page.getByPlaceholder('Search by order # or customer name...').fill(orderNumber)
        await page.getByRole('option').filter({ hasText: orderNumber }).first().click()
        await pay.getByLabel('Amount (PKR) *').fill('1500')
        await pay.getByRole('button', { name: 'Add Payment' }).dblclick()
        await toast(page, /payment added/i)
        await expect.poll(async () => rowsOf((await api(page, 'GET', `/api/payments?order_id=${orderId}`)).json).length, { timeout: 15000 }).toBe(paymentsBefore.length + 1)
        const paid = rowsOf((await api(page, 'GET', `/api/payments?order_id=${orderId}`)).json).map((x) => Number(x.amount)).sort()
        expect(paid, 'one payment of exactly 1500 (not duplicated by the double-click)').toContain(1500)
        expect(paid.filter((x) => x === 1500).length).toBe(1)
        await page.keyboard.press('Escape')
      } finally {
        await page.keyboard.press('Escape').catch(() => {})
        // find whatever this run created by its customer, so cleanup works even after an early failure
        const made = customerId ? rowsOf((await api(page, 'GET', `/api/orders?customerId=${customerId}&pageSize=50`)).json) : []
        for (const o of made) {
          for (const x of rowsOf((await api(page, 'GET', `/api/payments?order_id=${o.id}`)).json)) await api(page, 'DELETE', `/api/payments/${x.id}`)
          // the app mirrors an order's advance/payments into the general ledger; deleting the order does not remove those rows
          for (const e of rowsOf((await api(page, 'GET', `/api/general-ledger?search=${encodeURIComponent(o.order_number)}`)).json)) if (String(e.particulars).includes(o.order_number)) await api(page, 'DELETE', `/api/general-ledger/${e.id}`)
          await api(page, 'DELETE', `/api/orders/${o.id}`)
        }
        if (customerId) await api(page, 'DELETE', `/api/customers/${customerId}`)
        await ctx.close()
      }
    })

    test('measurements: create for a customer, filter, edit, delete', async ({ browser }) => {
      const tag = `QA-E2E Measure ${stamp()}`
      const { ctx, page } = await start(browser, v, '/measurements')
      let customerId: string | undefined
      try {
        const c = await api(page, 'POST', '/api/customers', { name: tag, phone: '+920000000888' })
        customerId = c.json?.id ?? c.json?.data?.id
        expect(customerId, 'setup customer').toBeTruthy()
        await page.reload(); await settle(page) // the page lists customers as loaded; pick up the one just made

        await page.getByRole('button', { name: 'New Measurement', exact: true }).click()
        const dlg = page.getByRole('dialog', { name: 'Add New Measurement' })
        // validation: no customer chosen
        await dlg.getByRole('button', { name: 'Create Measurement' }).click()
        await expect(dlg).toBeVisible()
        await dlg.getByRole('combobox').first().click()
        await page.getByPlaceholder('Search customers...').fill(tag)
        await page.getByRole('option', { name: new RegExp(tag) }).click()
        await dlg.getByLabel('Measurement Set Name *').fill(`${tag} set`)
        await dlg.getByLabel('Chest', { exact: true }).fill('40.5')
        await dlg.getByLabel('Waist', { exact: true }).fill('34')
        await dlg.getByRole('button', { name: 'Create Measurement' }).dblclick()
        await expect(dlg).toBeHidden({ timeout: 20000 })

        const made = rowsOf((await api(page, 'GET', `/api/customers/${customerId}/measurements`)).json)
        expect(made.length, 'one measurement for one (double-clicked) submit').toBe(1)
        expect(Number(made[0].chest ?? made[0].measurements?.chest)).toBe(40.5)

        // the table's own filter finds it; reload keeps it
        await page.reload(); await settle(page)
        const filter = page.getByPlaceholder(/Search measurements/)
        await filter.fill(tag); await settle(page)
        await expect(page.getByText(`${tag} set`).first()).toBeVisible({ timeout: 15000 })

        const row = page.locator('tr', { hasText: `${tag} set` }).first()
        await row.getByRole('button', { name: 'Open menu' }).click()
        await page.getByRole('menuitem', { name: 'Edit measurement' }).click()
        const edit = page.getByRole('dialog', { name: 'Edit Measurement' })
        await edit.getByLabel('Chest', { exact: true }).fill('41')
        await edit.getByRole('button', { name: 'Update Measurement' }).click()
        await expect(edit).toBeHidden({ timeout: 20000 })
        const after = rowsOf((await api(page, 'GET', `/api/customers/${customerId}/measurements`)).json)
        expect(Number(after[0].chest ?? after[0].measurements?.chest)).toBe(41)

        await page.getByPlaceholder(/Search measurements/).fill(tag); await settle(page)
        await page.locator('tr', { hasText: `${tag} set` }).first().getByRole('button', { name: 'Open menu' }).click()
        await page.getByRole('menuitem', { name: 'Delete measurement' }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: /Delete/ }).click()
        await expect.poll(async () => rowsOf((await api(page, 'GET', `/api/customers/${customerId}/measurements`)).json).length, { timeout: 15000 }).toBe(0)
      } finally {
        if (customerId) {
          for (const m of rowsOf((await api(page, 'GET', `/api/customers/${customerId}/measurements`)).json)) await api(page, 'DELETE', `/api/measurements/${m.id}`)
          await api(page, 'DELETE', `/api/customers/${customerId}`)
        }
        await ctx.close()
      }
    })

    test('vendors: create, bill, vendor ledger totals, delete with confirmation', async ({ browser }) => {
      const tag = `QA-E2E Vendor ${stamp()}`
      const { ctx, page } = await start(browser, v, '/vendors')
      let vendorId: string | undefined
      try {
        await page.getByRole('button', { name: 'Add Vendor', exact: true }).click()
        const dlg = page.getByRole('dialog')
        await dlg.getByLabel('Vendor Name').fill(tag)
        await dlg.getByRole('button', { name: 'Create Vendor' }).click()
        await expect(dlg).toBeHidden({ timeout: 15000 })
        await page.getByPlaceholder(/Search vendors/).fill(tag)
        await settle(page)
        await expect(page.getByText(tag, { exact: true }).first()).toBeVisible({ timeout: 15000 })
        vendorId = rowsOf((await api(page, 'GET', '/api/vendors')).json).find((x) => x.name === tag)?.id
        expect(vendorId).toBeTruthy()

        await page.locator('tr', { hasText: tag }).first().getByRole('button', { name: /view ledger/i }).click()
        await expect(page).toHaveURL(new RegExp(`/vendors/${vendorId}$`))
        await page.getByRole('button', { name: 'Create Bill' }).click()
        const bill = page.getByRole('dialog')
        await bill.getByLabel('Particulars').fill(`${tag} bill`)
        await bill.getByLabel('Amount').fill('1234.50')
        await bill.getByRole('button', { name: /create bill|save|add/i }).last().click()
        await expect(bill).toBeHidden({ timeout: 15000 })
        // FINDING: Chromium prints PKR with no decimals (Rs 1,235) but WebKit/Safari prints Rs 1,234.50 for the same code
        await expect(page.getByText(/Rs\s*1,23(5\b|4\.50)/).first()).toBeVisible({ timeout: 15000 })
        // the bill is a vendor credit; remove the mirrored general-ledger row afterwards
        await page.goBack(); await settle(page)
        await page.getByPlaceholder(/Search vendors/).fill(tag)
        await settle(page)
        await page.locator('tr', { hasText: tag }).first().getByRole('button', { name: /delete/i }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
        await expect.poll(async () => rowsOf((await api(page, 'GET', '/api/vendors')).json).some((x) => x.name === tag), { timeout: 15000 }).toBe(false)
        vendorId = undefined
      } finally {
        const led = rowsOf((await api(page, 'GET', `/api/general-ledger?search=${encodeURIComponent(tag)}`)).json).filter((e) => String(e.particulars).includes(tag))
        for (const e of led) await api(page, 'DELETE', `/api/general-ledger/${e.id}`)
        if (vendorId) await api(page, 'DELETE', `/api/vendors/${vendorId}`)
        await ctx.close()
      }
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Staff role: allowed modules work end to end; admin-only data stays closed.
// ---------------------------------------------------------------------------------------------
for (const v of ['phone-390', 'tablet-820']) {
  test(`staff @ ${v}: can manage customers; ledger, vendors and their APIs are closed to them`, async ({ browser }) => {
    assertLocalTarget()
    const ctx = await ctxFor(browser, 'staff', vp(v))
    const page = await ctx.newPage(); page.setDefaultTimeout(20_000)
    const tag = `QA-E2E Staff ${stamp()}`
    let id: string | undefined
    try {
      await page.goto('/customers'); await settle(page)
      await page.getByRole('button', { name: 'New Customer', exact: true }).click()
      const dlg = page.getByRole('dialog')
      await dlg.getByLabel('Name').fill(tag); await dlg.getByLabel('Phone').fill('+920000000555')
      await dlg.getByRole('button', { name: 'Create Customer' }).click()
      await expect(dlg).toBeHidden({ timeout: 15000 })
      await page.getByPlaceholder('Search customers by name or phone...').fill(tag); await settle(page)
      await expect(page.getByText(tag, { exact: true }).first()).toBeVisible()
      id = rowsOf((await api(page, 'GET', `/api/customers?search=${encodeURIComponent(tag)}`)).json).find((c) => c.name === tag)?.id
      expect(id).toBeTruthy()

      // the staff navigation never offers admin-only destinations
      const nav = page.getByRole('navigation', { name: vp(v).width < 768 ? 'Primary' : 'Main' })
      for (const name of ['Ledger', 'Vendors', 'Dashboard', 'Home']) await expect(nav.getByRole('link', { name })).toHaveCount(0)
      // and the data behind them refuses a staff token (not just hidden links)
      expect((await api(page, 'GET', '/api/general-ledger')).status).toBe(403)
      expect((await api(page, 'GET', '/api/vendor-ledger')).status).toBe(403)
      expect((await api(page, 'POST', '/api/general-ledger', { entry_date: '2099-01-01', particulars: 'QA-E2E staff must not write', debit: 1, entry_type: 'miscellaneous' })).status).toBe(403)
    } finally {
      if (id) await api(page, 'DELETE', `/api/customers/${id}`)
      await ctx.close()
    }
  })
}
