import { test, expect } from '@playwright/test'
import { ctxFor, VIEWPORTS, watch, settle, auditPage } from './helpers'
import { assertLocalTarget } from './global-guard'
import { createCustomer, removeCustomerAndDependants, search, uniquePhone, uniqueSuffix } from './support/ui'

const vp = (n: string) => VIEWPORTS.find((v) => v.name === n)!

for (const v of ['phone-360', 'phone-430', 'tablet-820']) {
  test.describe(`edge data, empty and error states @ ${v}`, () => {
    test('a very long customer name does not break the list or the customer page', async ({ browser }) => {
      assertLocalTarget()
      const ctx = await ctxFor(browser, 'admin', vp(v)); const page = await ctx.newPage(); page.setDefaultTimeout(20000)
      const name = `QA-E2E ${'Wolfeschlegelsteinhausenbergerdorff'.repeat(2)} ${uniqueSuffix()}`
      const phone = uniquePhone()
      try {
        await createCustomer(page, name, phone)
        let a = await auditPage(page, true)
        expect(a.docOverflow, `customer page overflow ${a.scrollWidth}>${a.clientWidth}`).toBe(false)
        expect(a.offenders).toEqual([])

        await page.goto('/customers'); await settle(page)
        await search(page, 'Name or phone', phone)
        await expect(page.getByText(name.slice(0, 30)).first()).toBeVisible()
        a = await auditPage(page, true)
        expect(a.docOverflow, `customers overflow ${a.scrollWidth}>${a.clientWidth}`).toBe(false)
        expect(a.offenders).toEqual([])
      } finally {
        await removeCustomerAndDependants(page, name, phone)
        await ctx.close()
      }
    })

    test('empty results show an empty state; a failing load shows an error with Retry that recovers', async ({ browser }) => {
      assertLocalTarget()
      const ctx = await ctxFor(browser, 'admin', vp(v)); const page = await ctx.newPage(); page.setDefaultTimeout(20000)
      const w = watch(page)
      await page.goto('/orders'); await settle(page)
      await search(page, 'Order number or customer', 'zzzz-no-such-order')
      await expect(page.locator('.ant-empty').first()).toBeVisible()
      expect((await auditPage(page, true)).docOverflow).toBe(false)

      await page.goto('/ledger'); await settle(page)
      await search(page, 'Search particulars', 'zzzz-no-such-entry')
      await expect(page.locator('.ant-empty').first()).toBeVisible()
      expect((await auditPage(page, true)).docOverflow).toBe(false)

      // a failed read: the page says so and stays usable; Retry recovers
      let fail = true
      await page.route('**/rest/v1/customers**', (r) =>
        fail && r.request().method() === 'GET'
          ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' })
          : r.continue(),
      )
      await page.goto('/customers')
      const error = page.getByText("Couldn't load the list")
      await expect(error, 'a failed load is announced, not silent').toBeVisible({ timeout: 60_000 })
      await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
      expect((await auditPage(page, true)).docOverflow).toBe(false)
      fail = false
      await page.getByRole('button', { name: /^(\S+ )?Retry$/ }).first().click()
      await expect(error).toBeHidden({ timeout: 30_000 })
      expect(w.consoleErrors.filter((e) => /unhandled|TypeError|ReferenceError|Cannot read/i.test(e))).toEqual([])
      await ctx.close()
    })
  })
}
