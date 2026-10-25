/**
 * node e2e/before-after.mjs <viewport> <out.png> role/screen [role/screen ...]
 * Side-by-side before (left) and after (right), Chromium, for the given screens.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
const [vp, out, ...screens] = process.argv.slice(2)
const f = (phase, rs) => { const [role, screen] = rs.split('/'); return path.resolve('qa-artifacts/screenshots', phase, 'chromium', role, `${screen}__${vp}.png`) }
const W = Number(process.env.IMG_W ?? 300)
const cells = screens.map((rs) => `<div style="display:flex;gap:6px"><figure style="margin:0"><img src="file://${f('before', rs)}" style="width:${W}px;border:1px solid #888;display:block"><figcaption>BEFORE ${rs}</figcaption></figure><figure style="margin:0"><img src="file://${f('after', rs)}" style="width:${W}px;border:1px solid #6a6;display:block"><figcaption>AFTER ${rs}</figcaption></figure></div>`)
const html = `<body style="margin:0;background:#444;font:12px system-ui;color:#fff"><div style="display:flex;flex-wrap:wrap;gap:12px;padding:8px">${cells.join('')}</div>`
fs.writeFileSync('/tmp/ba.html', html)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Number(process.env.SHEET_W ?? 1300), height: 900 } })
await p.goto('file:///tmp/ba.html'); await p.waitForTimeout(500); await p.screenshot({ path: out, fullPage: true }); await b.close()
console.log('wrote', out)
