/**
 * Renders the home-screen icons from one SVG using the Chromium that Playwright
 * already installs. Run: node scripts/pwa/generate-icons.mjs
 *
 * PLACEHOLDER ARTWORK. The mobile app's docs name a gold panther on black as the
 * brand mark, but that artwork is not in either repository (the mobile app still
 * ships Expo's template icon). These icons use the documented ground (#000) and
 * gold with a plain "AR" monogram so installs look intentional. Replace the
 * `mark` below, or drop final PNGs over the files in public/icons, when the real
 * artwork exists; no other code changes.
 *
 * Output (all square, opaque, not pre-rounded: iOS and Android apply their own mask):
 *   icon-192.png, icon-512.png            purpose "any"
 *   icon-maskable-512.png                 mark inside the central safe zone
 *   apple-touch-icon.png (180)            iOS "Add to Home Screen"
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const GOLD = '#C8A04A'
const BLACK = '#000000'
const out = path.join(process.cwd(), 'public', 'icons')
fs.mkdirSync(out, { recursive: true })

/** `scale` is the mark's size as a fraction of the canvas (smaller for maskable). */
const svg = (scale) => {
  const s = 512 * scale
  const o = (512 - s) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BLACK}"/>
  <g transform="translate(${o} ${o}) scale(${s / 512})">
    <text x="256" y="344" text-anchor="middle" font-family="Manrope, 'Helvetica Neue', Arial, sans-serif"
          font-weight="700" font-size="300" letter-spacing="-10" fill="${GOLD}">AR</text>
  </g>
</svg>`
}

const jobs = [
  { file: 'icon-192.png', size: 192, scale: 0.78 },
  { file: 'icon-512.png', size: 512, scale: 0.78 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.56 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.78 },
]

const browser = await chromium.launch()
for (const j of jobs) {
  const page = await browser.newPage({ viewport: { width: j.size, height: j.size }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;background:${BLACK}}svg{display:block;width:${j.size}px;height:${j.size}px}</style>${svg(j.scale)}`)
  await page.screenshot({ path: path.join(out, j.file), omitBackground: false })
  await page.close()
  console.log('wrote', j.file, `${j.size}x${j.size}`)
}
fs.writeFileSync(path.join(out, 'placeholder-mark.svg'), svg(0.78))
await browser.close()
