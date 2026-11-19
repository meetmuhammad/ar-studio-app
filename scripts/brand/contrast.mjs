/**
 * WCAG contrast check for the brand accent (values read from src/lib/brand.ts).
 *
 *   node scripts/brand/contrast.mjs
 *
 * Requirements (WCAG 2.1):
 *   - text on a primary (accent) button                  >= 4.5:1
 *   - accent as link / text on the theme's backgrounds    >= 4.5:1 (small text)
 *     and at least 3:1 (large text, UI components)
 * Exits 1 when any check fails.
 */
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'brand.ts'), 'utf8')
const color = (key) => {
  const m = new RegExp(`${key}:\\s*'(#[0-9a-fA-F]{6})'`).exec(source)
  if (!m) throw new Error(`${key} not found in src/lib/brand.ts`)
  return m[1]
}

const channel = (v) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const LIGHT = { page: '#FFFFFF', layout: '#F5F7FA' }
const DARK = { page: '#141414', layout: '#000000' }

const checks = [
  ['light: button text on accent', color('onAccentLight'), color('accentLight'), 4.5],
  ['light: accent link on white', color('accentLight'), LIGHT.page, 4.5],
  ['light: accent link on page grey', color('accentLight'), LIGHT.layout, 4.5],
  ['dark: button text on accent', color('onAccentDark'), color('accentDark'), 4.5],
  ['dark: accent link on #141414', color('accentDark'), DARK.page, 4.5],
  ['dark: accent link on #000000', color('accentDark'), DARK.layout, 4.5],
  ['brand gold on brand black (artwork)', color('gold'), color('black'), 3],
]

let failed = 0
const rows = checks.map(([check, fg, bg, min]) => {
  const r = ratio(fg, bg)
  const pass = r >= min
  if (!pass) failed++
  return { check, foreground: fg, background: bg, ratio: `${r.toFixed(2)}:1`, required: `${min}:1`, result: pass ? 'PASS' : 'FAIL' }
})
console.table(rows)
console.log(failed ? `${failed} check(s) failed` : 'All contrast checks pass')
process.exit(failed ? 1 : 0)
