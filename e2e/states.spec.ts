/* eslint-disable @typescript-eslint/no-explicit-any -- test plumbing over untyped JSON and page.evaluate payloads */
import { test, expect, type Page } from '@playwright/test'
import { ctxFor, VIEWPORTS, watch, settle, auditPage } from './helpers'
import { assertLocalTarget } from './global-guard'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
const vp = (n: string) => VIEWPORTS.find((v) => v.name === n)!
const token = (page: Page) => page.evaluate(() => JSON.parse(localStorage[Object.keys(localStorage).find((k) => k.includes('auth-token'))!]).access_token as string)
const call = async (page: Page, method: string, path: string, body?: unknown) => {
  const r = await page.request.fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${await token(page)}`, 'Content-Type': 'application/json' }, data: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status(), json: await r.json().catch(() => null) as any }
}

for (const v of ['phone-360', 'phone-430', 'tablet-820']) {
  test.describe(`edge data, empty and error states @ ${v}`, () => {
    test('very long names and very large amounts do not break the layout', async ({ browser }) => {
      assertLocalTarget()
      const ctx = await ctxFor(browser, 'admin', vp(v)); const page = await ctx.newPage(); page.setDefaultTimeout(20000)
      const longName = `QA-E2E ${'Wolfeschlegelsteinhausenbergerdorff'.repeat(2)} ${Date.now().toString(36)}`
      const particulars = `QA-E2E ${'very long particulars text '.repeat(6)}${Date.now().toString(36)}`
      let customerId: string | undefined, entryId: string | undefined
      try {
        await page.goto('/customers'); await settle(page)
        const c = await call(page, 'POST', '/api/customers', { name: longName, phone: '+920000000999', address: 'A very long address line '.repeat(8) })
        customerId = c.json?.id ?? c.json?.data?.id; expect(customerId).toBeTruthy()
        const e = await call(page, 'POST', '/api/general-ledger', { entry_date: new Date().toISOString().slice(0, 10), particulars, debit: 999999999.99, entry_type: 'miscellaneous' })
        entryId = e.json?.id ?? e.json?.data?.id ?? e.json?.entry?.id
        expect(e.status, JSON.stringify(e.json)).toBeLessThan(300)

        await page.goto('/customers'); await settle(page)
        await page.getByPlaceholder('Search customers by name or phone...').fill('QA-E2E'); await settle(page)
        await expect(page.getByText(longName.slice(0, 40)).first()).toBeVisible()
        let a = await auditPage(page, true)
        expect(a.docOverflow, `customers overflow ${a.scrollWidth}>${a.clientWidth}`).toBe(false); expect(a.offenders).toEqual([])

        await page.goto('/ledger'); await settle(page)
        await page.getByPlaceholder('Search by particulars...').fill('QA-E2E'); await settle(page)
        // the full amount is rendered, never truncated or wrapped mid-number
        await expect(page.getByText(/(1,000,000,000|999,999,999)/).first()).toBeVisible()
        a = await auditPage(page, true)
        expect(a.docOverflow, `ledger overflow ${a.scrollWidth}>${a.clientWidth}`).toBe(false); expect(a.offenders).toEqual([])
        // measure real text line boxes (an element's own height includes padding and min-height)
        const amountBox = await page.getByText(/(1,000,000,000|999,999,999)/).first().evaluate((el) => {
          const range = document.createRange(); range.selectNodeContents(el)
          const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0)
          return { l: Math.min(...rects.map((r) => r.left)), r: Math.max(...rects.map((r) => r.right)), lines: new Set(rects.map((r) => Math.round(r.top))).size }
        })
        expect(amountBox.l).toBeGreaterThanOrEqual(0); expect(amountBox.r).toBeLessThanOrEqual(vp(v).width + 1); expect(amountBox.lines, 'amount stays on one line').toBe(1)
      } finally {
        if (entryId) await call(page, 'DELETE', `/api/general-ledger/${entryId}`)
        if (customerId) await call(page, 'DELETE', `/api/customers/${customerId}`)
        await ctx.close()
      }
    })

    test('empty results show a message (no overflow); a failing API shows an error, not a blank or crashed page', async ({ browser }) => {
      assertLocalTarget()
      const ctx = await ctxFor(browser, 'admin', vp(v)); const page = await ctx.newPage(); page.setDefaultTimeout(20000)
      const w = watch(page)
      await page.goto('/orders'); await settle(page)
      const search = page.getByPlaceholder(/Search by order number/)
      await search.fill('zzzz-no-such-order'); await search.press('Enter'); await settle(page)
      await expect(page.getByText('No orders found')).toBeVisible()
      expect((await auditPage(page, true)).docOverflow).toBe(false)

      await page.goto('/ledger'); await settle(page)
      await page.getByPlaceholder('Search by particulars...').fill('zzzz-no-such-entry'); await settle(page)
      expect((await auditPage(page, true)).docOverflow).toBe(false)

      // API failure: the page stays usable, says so, and recovers when the user retries
      test.setTimeout(120_000)
      let fail = true
      await page.route('**/api/customers**', (r) => (fail && r.request().method() === 'GET' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }) : r.continue()))
      await page.goto('/customers')
      const alert = page.getByRole('alert').filter({ hasText: /couldn't load customers/i })
      await expect(alert, 'a failed load is announced, not silent').toBeVisible({ timeout: 60_000 })
      await expect(page.getByRole('navigation', { name: v.startsWith('phone') ? 'Primary' : 'Main' })).toBeVisible()
      expect((await auditPage(page, true)).docOverflow).toBe(false)
      fail = false
      await alert.getByRole('button', { name: 'Retry' }).click()
      await expect(alert).toBeHidden({ timeout: 30_000 })
      await expect(page.getByText(/All Customers/).first()).toBeVisible()
      expect(w.consoleErrors.filter((e) => /unhandled|TypeError|ReferenceError|Cannot read/i.test(e))).toEqual([])
      await ctx.close()
    })
  })
}
