import { test, expect, type Page } from '@playwright/test'
import { ctxFor, VIEWPORTS, settle, shotPath, ids, type Viewport } from './helpers'
import { assertLocalTarget } from './global-guard'

/**
 * Every dialog, opened with real (seeded) data. For each: it fits the screen, has no horizontal
 * overflow inside, its primary action can be scrolled into view and is not covered by the tab bar,
 * and Escape closes it. Screenshots go to qa-artifacts/screenshots/after/<engine>/admin/dialog-*.
 */
const PHASE = process.env.AUDIT_PHASE ?? 'after'
const NAMES = ['phone-360', 'phone-390', 'tablet-820', 'tablet-land-1180', 'desktop-1440']
const vps = VIEWPORTS.filter((v) => NAMES.includes(v.name))

type Opener = { id: string; path: string; open: (p: Page, v: Viewport) => Promise<void>; primary: RegExp; name?: string | RegExp }
const OPENERS: Opener[] = [
  { id: 'customer-new', path: '/customers', open: async (p) => { await p.getByRole('button', { name: 'New Customer', exact: true }).click() }, primary: /Create Customer/ },
  { id: 'customer-detail', path: '/customers', open: async (p) => { await p.locator('tr', { hasText: 'Steven Bednar' }).first().click() }, primary: /Close/ },
  { id: 'order-new-step1', path: '/orders', open: async (p) => { await p.getByRole('button', { name: 'New Order', exact: true }).click() }, primary: /Next/ },
  { id: 'order-new-step3', path: '/orders', open: async (p) => {
      await p.getByRole('button', { name: 'New Order', exact: true }).click()
      const d = p.getByRole('dialog')
      await d.getByRole('combobox').first().click(); await p.getByRole('option').first().click()
      await d.getByRole('button', { name: /Add Item/ }).click(); await d.getByLabel('Description *').fill('Layout check')
      await d.getByRole('button', { name: 'Next' }).click(); await d.getByRole('button', { name: 'Next' }).click()
    }, primary: /Create Order/ },
  { id: 'order-edit', path: '/orders', open: async (p) => { await p.getByRole('button', { name: /^Edit order/ }).first().click() }, primary: /Next/ },
  { id: 'order-details', path: '/orders', open: async (p) => { await p.getByRole('button', { name: /^View order/ }).first().click() }, primary: /Close/ },
  { id: 'payment-add', path: '/orders', open: async (p, v) => {
      if (v.width < 768) { await p.getByRole('button', { name: 'Create' }).click(); await p.getByRole('menuitem', { name: 'Add payment' }).click() }
      else await p.getByRole('button', { name: /Add New Payment|Payment/ }).first().click()
      const d = p.getByRole('dialog'); await d.getByRole('combobox').first().click(); await p.getByRole('option').first().click(); await settle(p)
    }, primary: /Add Payment/ },
  { id: 'ledger-entry', path: '/ledger', open: async (p) => { await p.getByRole('button', { name: 'Add Entry', exact: true }).first().click() }, primary: /Add Entry/ },
  { id: 'vendor-new', path: '/vendors', open: async (p) => { await p.getByRole('button', { name: 'Add Vendor', exact: true }).click() }, primary: /Create Vendor/ },
  { id: 'vendor-categories', path: '/vendors', open: async (p) => { await p.getByRole('button', { name: 'Manage Categories' }).click() }, primary: /Close/ },
  { id: 'vendor-bill', path: '/vendors/__VENDOR__', open: async (p) => { await p.getByRole('button', { name: 'Create Bill' }).click() }, primary: /Create Bill|Save|Add/ },
  { id: 'measurement-new', path: '/measurements', open: async (p) => { await p.getByRole('button', { name: 'New Measurement', exact: true }).click() }, primary: /Create Measurement/ },
]

for (const o of OPENERS) {
  for (const v of vps) {
    test(`dialog ${o.id} @ ${v.name}`, async ({ browser }, info) => {
      assertLocalTarget()
      const vendorId = ids().vendorId ?? ''
      const ctx = await ctxFor(browser, 'admin', v); const page = await ctx.newPage(); page.setDefaultTimeout(20_000)
      await page.goto(o.path.replace('__VENDOR__', vendorId)); await settle(page)
      await o.open(page, v); await page.waitForTimeout(700)
      const dlg = page.getByRole('dialog').last()
      await expect(dlg).toBeVisible()
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
      await page.screenshot({ path: shotPath(PHASE, info.project.name, 'admin', `dialog-${o.id}`, v.name) })

      const m = await dlg.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, sw: el.scrollWidth, cw: el.clientWidth, vw: window.innerWidth, vh: window.innerHeight } })
      expect(m.l, 'dialog starts on screen').toBeGreaterThanOrEqual(-1)
      expect(m.r, 'dialog ends on screen').toBeLessThanOrEqual(m.vw + 1)
      expect(m.b, 'dialog bottom within the visible height').toBeLessThanOrEqual(m.vh + 1)
      expect(m.sw, `no horizontal overflow inside the dialog (${m.sw}>${m.cw})`).toBeLessThanOrEqual(m.cw + 1)

      if (o.id.startsWith('order-new-') || o.id === 'order-edit') {
        const fraction = v.width < 640 ? 1 : v.width < 768 ? 0.9 : v.width < 1024 ? 0.8 : 0.7
        expect(Math.abs(m.r - m.l - v.width * fraction), 'order form uses its responsive width without the shared dialog cap').toBeLessThanOrEqual(2)
      }

      // primary action reachable: scroll it into view; it must be on screen and not under the tab bar
      const primary = dlg.getByRole('button', { name: o.primary }).last()
      await primary.scrollIntoViewIfNeeded()
      const b = (await primary.boundingBox())!
      expect(b.y + b.height, 'primary action inside the visible height').toBeLessThanOrEqual(m.vh + 1)
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(m.vw + 1)
      if (v.width < 768) {
        // (a role query cannot see the tab bar while a modal is open: Radix marks the background aria-hidden)
        const nav = await page.locator('nav[aria-label="Primary"]').boundingBox()
        // the dialog is a sheet above the tab bar (z-order), so the action must be hit-testable
        const hit = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return !!e && !!e.closest('[role="dialog"]') }, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
        expect(hit, `primary action is not covered (tab bar top ${nav?.y})`).toBe(true)
      }
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
      const stillOpen = await page.getByRole('dialog').filter({ has: page.locator(':visible') }).count()
      // some dialogs intentionally ignore outside clicks, but Escape must always close them
      expect(await dlg.isVisible(), 'Escape closes the dialog').toBe(false)
      void stillOpen
      await ctx.close()
    })
  }
}
