/* eslint-disable @typescript-eslint/no-explicit-any -- test plumbing over untyped JSON and page.evaluate payloads */
import fs from 'node:fs'
import { test } from '@playwright/test'
import { ctxFor, VIEWPORTS, PRIMARY_VIEWPORTS, ids, shotPath, auditPage, watch, settle, type Role } from './helpers'
import { assertLocalTarget } from './global-guard'

/**
 * Responsive sweep: every screen x role x viewport. Records layout facts
 * (document overflow, elements escaping the viewport outside a contained
 * scroller, undersized touch targets, console errors, failed requests, broken
 * images) and a screenshot. Run with AUDIT_PHASE=before|after.
 */
const PHASE = process.env.AUDIT_PHASE ?? 'after'

type Screen = { name: string; path: (i: ReturnType<typeof ids>) => string | null; roles: (Role | null)[] }
const SCREENS: Screen[] = [
  { name: 'sign-in', path: () => '/sign-in', roles: [null] },
  { name: 'dashboard', path: () => '/', roles: ['admin'] },
  { name: 'customers', path: () => '/customers', roles: ['admin', 'staff'] },
  { name: 'orders', path: () => '/orders', roles: ['admin', 'staff'] },
  { name: 'measurements', path: () => '/measurements', roles: ['admin', 'staff'] },
  { name: 'ledger', path: () => '/ledger', roles: ['admin'] },
  { name: 'vendors', path: () => '/vendors', roles: ['admin'] },
  { name: 'vendor-detail', path: (i) => (i.vendorId ? `/vendors/${i.vendorId}` : null), roles: ['admin'] },
]

for (const screen of SCREENS) {
  for (const role of screen.roles) {
    test(`sweep ${screen.name} as ${role ?? 'signed-out'}`, async ({ browser }, info) => {
      test.setTimeout(300_000)
      assertLocalTarget()
      const p = screen.path(ids())
      test.skip(!p, 'no record id available for this detail route')
      const engine = info.project.name
      const viewports = engine === 'webkit' ? PRIMARY_VIEWPORTS : VIEWPORTS
      const results: any[] = []
      for (const vp of viewports) {
        const ctx = await ctxFor(browser, role, vp)
        const page = await ctx.newPage()
        const w = watch(page)
        await page.goto(p!, { waitUntil: 'domcontentloaded' })
        await settle(page)
        const a = await auditPage(page, vp.touch)
        await page.screenshot({ path: shotPath(PHASE, engine, role ?? 'signed-out', screen.name, vp.name), fullPage: false })
        results.push({ screen: screen.name, role: role ?? 'signed-out', viewport: vp.name, w: vp.width, url: page.url().replace(/^https?:\/\/[^/]+/, ''), ...a, consoleErrors: w.consoleErrors.slice(0, 3), failedRequests: w.failedRequests.slice(0, 3) })
        await ctx.close()
      }
      const dir = `qa-artifacts/audit/${PHASE}/${engine}`
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(`${dir}/${screen.name}__${role ?? 'signed-out'}.json`, JSON.stringify(results, null, 1))
    })
  }
}
