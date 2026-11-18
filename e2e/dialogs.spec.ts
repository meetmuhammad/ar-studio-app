import { test, expect, type Locator, type Page } from '@playwright/test'
import { ctxFor, VIEWPORTS, settle, shotPath, type Viewport } from './helpers'
import { assertLocalTarget } from './global-guard'
import { btn, closeWithEscape } from './support/ui'

/**
 * Overlays of the Refine + antd UI (modals and drawers), opened as admin with
 * the seeded data. Each fits the screen, has no horizontal overflow inside, its
 * primary action can be scrolled into view and hit, and Escape closes it.
 * Nothing is submitted. Screenshots: qa-artifacts/screenshots/after/<engine>/admin/overlay-*.
 */
const PHASE = process.env.AUDIT_PHASE ?? 'after'
const NAMES = ['phone-360', 'phone-390', 'tablet-820', 'tablet-land-1180', 'desktop-1440']
const vps = VIEWPORTS.filter((v) => NAMES.includes(v.name))

type Opener = {
  id: string
  path: string
  /** Opens the overlay and returns it. */
  open: (p: Page, v: Viewport) => Promise<Locator>
  primary: RegExp
}

const modal = (p: Page) => p.locator('.ant-modal-wrap:visible .ant-modal').last()
const drawer = (p: Page) => p.locator('.ant-drawer-open .ant-drawer-content').last()

const OPENERS: Opener[] = [
  {
    id: 'payment-add',
    path: '/customers',
    open: async (p, v) => {
      if (v.width < 768) {
        await btn(p, 'Create').click()
        await p.getByRole('menuitem', { name: /Add payment/ }).click()
      } else {
        await p.getByRole('button', { name: /^(\S+ )?(Add New Payment|Payment)$/ }).click()
      }
      return modal(p)
    },
    primary: /Add Payment/,
  },
  {
    id: 'vendor-categories',
    path: '/vendors',
    open: async (p) => {
      await btn(p, 'Manage Categories').click()
      return drawer(p)
    },
    primary: /^(\S+ )?Add$/,
  },
  {
    id: 'ledger-entry',
    path: '/ledger',
    open: async (p) => {
      await btn(p, 'Add Entry').first().click()
      return p.getByRole('dialog').last()
    },
    primary: /^Add Entry$/,
  },
  {
    id: 'order-new-measurement',
    path: '/orders/create',
    open: async (p) => {
      const customer = p.getByRole('combobox', { name: 'Customer' })
      await customer.click()
      await p.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
      await btn(p, 'Add Item').click()
      await p.getByLabel('Item 1 description').fill('Layout check (not saved)')
      await btn(p, 'Next').click()
      await p.getByRole('button', { name: /New measurement/i }).first().click()
      return modal(p)
    },
    primary: /Save|Create/,
  },
]

for (const o of OPENERS) {
  for (const v of vps) {
    test(`overlay ${o.id} @ ${v.name}`, async ({ browser }, info) => {
      assertLocalTarget()
      const ctx = await ctxFor(browser, 'admin', v); const page = await ctx.newPage(); page.setDefaultTimeout(20_000)
      await page.goto(o.path); await settle(page)
      const overlay = await o.open(page, v)
      await expect(overlay).toBeVisible()
      await page.waitForTimeout(500)
      await page.screenshot({ path: shotPath(PHASE, info.project.name, 'admin', `overlay-${o.id}`, v.name) })

      const m = await overlay.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { l: r.left, r: r.right, sw: el.scrollWidth, cw: el.clientWidth, vw: window.innerWidth, vh: window.innerHeight }
      })
      expect(m.l, 'overlay starts on screen').toBeGreaterThanOrEqual(-1)
      expect(m.r, 'overlay ends on screen').toBeLessThanOrEqual(m.vw + 1)
      expect(m.sw, `no horizontal overflow inside (${m.sw}>${m.cw})`).toBeLessThanOrEqual(m.cw + 1)

      const primary = overlay.getByRole('button', { name: o.primary }).last()
      await primary.scrollIntoViewIfNeeded()
      const b = (await primary.boundingBox())!
      expect(b.y + b.height, 'primary action inside the visible height').toBeLessThanOrEqual(m.vh + 1)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(m.vw + 1)
      const hit = await page.evaluate(({ x, y }) => {
        const e = document.elementFromPoint(x, y)
        return !!e && !!e.closest('.ant-modal, .ant-drawer, [role="dialog"]')
      }, { x: b.x + b.width / 2, y: b.y + b.height / 2 })
      expect(hit, 'primary action is not covered').toBe(true)

      await closeWithEscape(page, overlay)
      await ctx.close()
    })
  }
}
