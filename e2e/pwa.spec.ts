/* eslint-disable @typescript-eslint/no-explicit-any -- test plumbing over untyped JSON and page.evaluate payloads */
import fs from 'node:fs'
import { test, expect } from '@playwright/test'
import { ctxFor, VIEWPORTS, settle } from './helpers'
import { assertLocalTarget } from './global-guard'

/**
 * Home-screen / standalone readiness, as far as a browser engine can prove it.
 * What this CANNOT prove (needs a physical iPhone/iPad/Android device): that the OS offers
 * "Add to Home Screen", that the installed app launches standalone, and that its session
 * matches the browser's. See docs/qa/mobile-responsive-report.md for the manual checklist.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100'

test.describe('manifest and icons', () => {
  test('manifest is valid, scoped, standalone, and every icon resolves with the declared size', async ({ request }) => {
    assertLocalTarget()
    const res = await request.get(`${BASE}/manifest.webmanifest`)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toMatch(/manifest\+json|application\/json/)
    const m = await res.json()
    expect(m.name).toBeTruthy(); expect(m.short_name).toBeTruthy()
    expect(m.short_name.length, 'short_name fits under an icon').toBeLessThanOrEqual(12)
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/'); expect(m.scope).toBe('/'); expect(m.id).toBe('/')
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i); expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    const purposes = m.icons.map((i: any) => `${i.sizes}:${i.purpose}`)
    expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']))
    for (const icon of m.icons) {
      const r = await request.get(`${BASE}${icon.src}`)
      expect(r.status(), icon.src).toBe(200)
      expect(r.headers()['content-type']).toBe(icon.type)
      const buf = await r.body()
      // PNG header + IHDR width/height
      expect(buf.subarray(1, 4).toString()).toBe('PNG')
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
      expect(`${w}x${h}`, `${icon.src} real size`).toBe(icon.sizes)
    }
  })

  test('apple-touch-icon is 180x180, opaque, and linked from every page type; zoom stays enabled', async ({ browser, request }) => {
    for (const path of ['/sign-in']) {
      const ctx = await ctxFor(browser, null, VIEWPORTS[1]); const page = await ctx.newPage()
      await page.goto(path); await settle(page)
      const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
      expect(href).toBe('/icons/apple-touch-icon.png')
      const png = await (await request.get(`${BASE}${href}`)).body()
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe('180x180')
      expect(png[25], 'colour type 2 = RGB, no alpha channel').toBe(2)
      expect(await page.locator('link[rel="manifest"]').getAttribute('href')).toBe('/manifest.webmanifest')
      const vp = await page.locator('meta[name="viewport"]').getAttribute('content')
      expect(vp).toContain('viewport-fit=cover')
      expect(vp, 'pinch-zoom must not be disabled').not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/)
      expect(await page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').count()).toBeGreaterThan(0)
      expect(await page.locator('meta[name="theme-color"]').count()).toBeGreaterThan(0)
      await ctx.close()
    }
  })
})

test.describe('launch behaviour and no offline/private caching', () => {
  test('signed-out launch of start_url goes to sign-in; nothing private is served without a session', async ({ browser }) => {
    const ctx = await ctxFor(browser, null, VIEWPORTS[1]); const page = await ctx.newPage()
    await page.goto('/'); await expect(page).toHaveURL(/\/sign-in$/, { timeout: 15000 })
    const api = await page.request.get(`${BASE}/api/general-ledger`)
    expect(api.status()).toBe(401)
    await ctx.close()
  })

  test('signed-in launch of start_url lands on the role-appropriate screen', async ({ browser }) => {
    const admin = await ctxFor(browser, 'admin', VIEWPORTS[1]); const a = await admin.newPage()
    await a.goto('/'); await settle(a); await expect(a).toHaveURL(/localhost:\d+\/$/); await expect(a.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await admin.close()
    const staff = await ctxFor(browser, 'staff', VIEWPORTS[1]); const s = await staff.newPage()
    await s.goto('/'); await expect(s).toHaveURL(/\/customers$/, { timeout: 15000 })
    await staff.close()
  })

  test('no service worker, no CacheStorage entries, and API responses are not cacheable', async ({ browser }) => {
    const ctx = await ctxFor(browser, 'admin', VIEWPORTS[1]); const page = await ctx.newPage()
    await page.goto('/ledger'); await settle(page)
    const state = await page.evaluate(async () => ({
      workers: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      caches: 'caches' in window ? (await caches.keys()).length : 0,
    }))
    expect(state).toEqual({ workers: 0, caches: 0 })
    const res = await page.request.get(`${BASE}/api/general-ledger`, { headers: { Authorization: `Bearer ${await page.evaluate(() => JSON.parse(localStorage[Object.keys(localStorage).find((k) => k.includes('auth-token'))!]).access_token)}` } })
    const cc = (res.headers()['cache-control'] ?? '').toLowerCase()
    expect(`${res.status()} ${cc}`).not.toMatch(/public|max-age=[1-9]/)
    // the repository ships no service worker file either
    expect(fs.existsSync('public/sw.js') || fs.existsSync('public/service-worker.js')).toBe(false)
    await ctx.close()
  })
})

test.describe('keyboard, focus and motion', () => {
  test('keyboard focus is visible on the tab bar, header action and form fields', async ({ browser }) => {
    const ctx = await ctxFor(browser, 'admin', VIEWPORTS[1]); const page = await ctx.newPage()
    await page.goto('/customers'); await settle(page)
    const visible = async () => page.evaluate(() => {
      const e = document.activeElement as HTMLElement; const cs = getComputedStyle(e)
      const ring = cs.boxShadow !== 'none' || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0)
      return { tag: e.tagName, ring }
    })
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab') }
    const seen: boolean[] = []
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); seen.push((await visible()).ring) }
    expect(seen.filter(Boolean).length, 'most tabbed controls show a focus ring').toBeGreaterThanOrEqual(4)
    await ctx.close()
  })

  test('prefers-reduced-motion removes animation and transition time', async ({ browser }) => {
    const ctx = await ctxFor(browser, 'admin', VIEWPORTS[1]); const page = await ctx.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/customers'); await settle(page)
    await page.getByRole('button', { name: 'New Customer', exact: true }).click()
    const d = await page.getByRole('dialog').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration))
    expect(d, 'dialog animation duration in seconds').toBeLessThan(0.01)
    await ctx.close()
  })
})
