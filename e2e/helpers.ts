import fs from 'node:fs'
import path from 'node:path'
import type { Browser, BrowserContext, Page } from '@playwright/test'

export const QA_PASSWORD = 'QaLocal-2026!'
export const ACCOUNTS = {
  admin: { email: 'qa-admin@arstudio.test', state: 'e2e/.auth/admin.json' },
  staff: { email: 'qa-staff@arstudio.test', state: 'e2e/.auth/staff.json' },
} as const
export type Role = keyof typeof ACCOUNTS

export interface Viewport { name: string; width: number; height: number; touch: boolean }

/** Representative widths plus the boundaries around Tailwind's sm/md/lg/xl. */
export const VIEWPORTS: Viewport[] = [
  { name: 'phone-360', width: 360, height: 740, touch: true },
  { name: 'phone-390', width: 390, height: 844, touch: true },
  { name: 'phone-430', width: 430, height: 932, touch: true },
  { name: 'edge-639', width: 639, height: 900, touch: true },
  { name: 'edge-640', width: 640, height: 900, touch: true },
  { name: 'edge-767', width: 767, height: 1024, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, touch: true },
  { name: 'tablet-820', width: 820, height: 1180, touch: true },
  { name: 'edge-1023', width: 1023, height: 768, touch: true },
  { name: 'tablet-land-1024', width: 1024, height: 768, touch: true },
  { name: 'tablet-land-1180', width: 1180, height: 820, touch: true },
  { name: 'desktop-1440', width: 1440, height: 900, touch: false },
]

export const PRIMARY_VIEWPORTS = VIEWPORTS.filter((v) =>
  ['phone-360', 'phone-390', 'phone-430', 'tablet-768', 'tablet-820', 'tablet-land-1024', 'tablet-land-1180', 'desktop-1440'].includes(v.name),
)

export async function ctxFor(browser: Browser, role: Role | null, vp: Viewport): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.touch ? 2 : 1,
    hasTouch: vp.touch,
    // iPads report a coarse pointer too, so every touch viewport is emulated as a touch device
    isMobile: vp.touch && browser.browserType().name() !== 'firefox',
    storageState: role ? ACCOUNTS[role].state : undefined,
  })
}

export const ids = (): { vendorId?: string; customerId?: string; orderId?: string } => {
  try { return JSON.parse(fs.readFileSync('e2e/.auth/ids.json', 'utf8')) } catch { return {} }
}

export function shotPath(phase: string, browser: string, role: string, screen: string, vp: string) {
  const dir = path.join('qa-artifacts', 'screenshots', phase, browser, role)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${screen}__${vp}.png`)
}

export interface Audit {
  docOverflow: boolean
  scrollWidth: number
  clientWidth: number
  offenders: string[]
  smallTargets: { count: number; sample: string[] }
  unnamed: string[]
  brokenImages: number
  consoleErrors: string[]
  failedRequests: string[]
}

/** Measure a loaded page. Overflow inside a contained scroller is not an offender. */
export async function auditPage(page: Page, touch: boolean): Promise<Omit<Audit, 'consoleErrors' | 'failedRequests'>> {
  return page.evaluate((isTouch) => {
    const vw = document.documentElement.clientWidth
    const desc = (el: Element) => {
      const e = el as HTMLElement
      const t = (e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28)
      return `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.split(/\s+/).slice(0, 2).join('.') : ''}${t ? ` "${t}"` : ''}`
    }
    // An element is "contained" only inside a real scroller (overflow auto/scroll), or inside a
    // clipping box that is itself narrower than the page. A full-width box with overflow:hidden
    // (like <main>) merely hides the problem, so it does not count.
    const contained = (el: Element) => {
      let p = el.parentElement
      while (p && p !== document.body && p !== document.documentElement) {
        const cs = getComputedStyle(p)
        const r = p.getBoundingClientRect()
        if (/(auto|scroll)/.test(cs.overflowX) && r.right <= vw + 1) return true
        if (/(hidden|clip)/.test(cs.overflowX) && r.right <= vw + 1 && r.width < vw - 8) return true
        p = p.parentElement
      }
      return false
    }
    const offenders: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = (el as HTMLElement).getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed' && r.right <= vw + 1) continue
      if (r.right > vw + 1 || r.left < -1) {
        if (!contained(el)) offenders.push(desc(el))
      }
    }
    const targets = Array.from(document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=menuitem],[role=checkbox],[role=combobox]'))
    const small: string[] = []
    if (isTouch) {
      for (const el of targets) {
        const r = (el as HTMLElement).getBoundingClientRect()
        const cs = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue
        if ((el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio') {
          // checkbox/radio are judged on their label too; skip bare small boxes
          if (el.closest('label')) continue
        }
        if (r.height < 40 || r.width < 40) small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
    }
    // Interactive controls with no accessible name (no text, aria-label(ledby), title, label, or image alt).
    const unnamed: string[] = []
    for (const el of targets) {
      const e = el as HTMLElement
      const r = e.getBoundingClientRect()
      const cs = getComputedStyle(e)
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue
      const labelled = e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title')
      const own = (e.textContent || '').trim()
      const input = e as HTMLInputElement
      const viaLabel = input.labels && input.labels.length > 0
      const alt = e.querySelector('img[alt]:not([alt=""])')
      if (!labelled && !own && !viaLabel && !alt && !e.getAttribute('placeholder')) unnamed.push(desc(el))
    }
    const broken = Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.src).length
    return {
      docOverflow: document.documentElement.scrollWidth > vw + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      offenders: Array.from(new Set(offenders)).slice(0, 12),
      smallTargets: { count: small.length, sample: small.slice(0, 8) },
      unnamed: Array.from(new Set(unnamed)).slice(0, 6),
      brokenImages: broken,
    }
  }, touch)
}

/** Collect console errors and failed network requests while a page is used. */
export function watch(page: Page) {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('requestfailed', (r) => {
    if (!/_next\/static|hot-update|favicon|webpack-hmr/.test(r.url())) failedRequests.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} ${r.failure()?.errorText}`)
  })
  page.on('response', (r) => {
    const s = r.status()
    if (s >= 400 && !/hot-update|favicon/.test(r.url())) failedRequests.push(`${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 80)} -> ${s}`)
  })
  return { consoleErrors, failedRequests }
}

export async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  // The Next.js dev-mode badge is not part of the app; keep it out of screenshots and measurements.
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {})
  await page.waitForTimeout(400)
}
