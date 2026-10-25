/**
 * node e2e/contact-sheet.mjs <phase> <browser> <viewport> <out.png> [role/screen ...]
 * Lays the saved screenshots for one viewport side by side so many screens can be reviewed at once.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
const [phase, browserName, vp, out, ...only] = process.argv.slice(2)
const root = path.join('qa-artifacts/screenshots', phase, browserName)
const items = []
for (const role of fs.readdirSync(root)) {
  for (const f of fs.readdirSync(path.join(root, role)).sort()) {
    if (!f.endsWith(`__${vp}.png`)) continue
    const screen = f.split('__')[0]
    if (only.length && !only.includes(`${role}/${screen}`)) continue
    items.push({ label: `${role}/${screen}`, file: path.resolve(root, role, f) })
  }
}
const imgW = Number(process.env.IMG_W ?? 300)
const html = `<body style="margin:0;background:#444;font:12px system-ui;color:#fff"><div style="display:flex;flex-wrap:wrap;gap:8px;padding:8px">${items
  .map((i) => `<figure style="margin:0;width:${imgW}px"><img src="file://${i.file}" style="width:${imgW}px;display:block;border:1px solid #888"><figcaption>${i.label}</figcaption></figure>`)
  .join('')}</div>`
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: Number(process.env.SHEET_W ?? 1300), height: 900 } })
fs.writeFileSync('/tmp/contact.html', html)
await p.goto('file:///tmp/contact.html')
await p.waitForTimeout(500)
await p.screenshot({ path: out, fullPage: true })
await b.close()
console.log('wrote', out, items.length, 'tiles')
