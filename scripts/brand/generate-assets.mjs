/**
 * Brand assets for Ahsan Tariq Studio, from the owner's originals.
 *
 *   npm run brand:assets        (node scripts/brand/generate-assets.mjs)
 *
 * Inputs (committed in brand-src/, see brand-src/README.md):
 *   brand-src/lion.png       gold low-poly lion on black, roughly square
 *   brand-src/wordmark.png   thin gold "AHSAN TARIQ" on off-white (may carry
 *                            non-gold artefacts; only gold pixels are kept)
 *
 * Outputs (paths are read by src/lib/brand.ts):
 *   public/brand/lion.png              trimmed lion on black, max 1024
 *   public/brand/lion-mark.png         square lion mark on black, 256
 *   public/brand/wordmark.png          text only, deepened gold on transparent (light backgrounds)
 *   public/brand/wordmark-dark.png     text only, bright gold #D4AF37 on transparent (dark backgrounds)
 *   public/icons/icon-192.png, icon-512.png           PWA "any" icons (lion on black)
 *   public/icons/icon-maskable-512.png                PWA maskable (20% safe padding each side)
 *   public/icons/apple-touch-icon.png                 180, opaque RGB on black (iOS)
 *   public/icons/favicon-32.png, favicon-16.png
 *   src/app/favicon.ico                               16 / 32 / 48 (PNG-in-ICO)
 *
 * A missing original is replaced by a placeholder ("ATS" monogram / "AHSAN
 * TARIQ" text in gold) at the same paths, with a warning, so the app works
 * either way. Re-run after adding the originals.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'brand-src')
const BRAND_OUT = path.join(ROOT, 'public', 'brand')
const ICON_OUT = path.join(ROOT, 'public', 'icons')
const APP_DIR = path.join(ROOT, 'src', 'app')

const BLACK = { r: 0x0b, g: 0x0b, b: 0x0b }
const BLACK_HEX = '#0B0B0B'
const GOLD_HEX = '#D4AF37'
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

fs.mkdirSync(BRAND_OUT, { recursive: true })
fs.mkdirSync(ICON_OUT, { recursive: true })

const warnings = []
const wrote = (file) => console.log('wrote', path.relative(ROOT, file))

// ------------------------------------------------------------------ placeholders

const lionPlaceholderSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BLACK_HEX}"/>
  <circle cx="512" cy="512" r="400" fill="none" stroke="${GOLD_HEX}" stroke-width="10"/>
  <text x="512" y="600" text-anchor="middle" font-family="'Josefin Sans', 'Helvetica Neue', Arial, sans-serif"
        font-weight="300" font-size="250" letter-spacing="24" fill="${GOLD_HEX}">ATS</text>
</svg>`

const wordmarkPlaceholderSvg = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="160" viewBox="0 0 1400 160">
  <text x="700" y="118" text-anchor="middle" font-family="'Josefin Sans', 'Helvetica Neue', Arial, sans-serif"
        font-weight="300" font-size="120" letter-spacing="40" fill="${fill}">AHSAN TARIQ</text>
</svg>`

// ------------------------------------------------------------------ lion

/** The trimmed lion (PNG buffer, black ground) from the original or the placeholder. */
async function lionSource() {
  const file = path.join(SRC, 'lion.png')
  if (fs.existsSync(file)) {
    return sharp(file)
      .flatten({ background: BLACK })
      .trim({ background: '#000000', threshold: 24 })
      .png()
      .toBuffer()
  }
  warnings.push('brand-src/lion.png not found: the lion outputs are an "ATS" PLACEHOLDER.')
  return sharp(Buffer.from(lionPlaceholderSvg())).png().toBuffer()
}

/** `art` centred on a black square of `size`, scaled to `fraction` of it. Opaque RGB. */
async function onBlack(art, size, fraction) {
  const inner = Math.round(size * fraction)
  const scaled = await sharp(art)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 3, background: BLACK } })
    .composite([{ input: scaled, gravity: 'center' }])
    .removeAlpha()
    .png()
    .toBuffer()
}

/** ICO file holding PNG images (supported by every current browser and OS). */
function icoFromPngs(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + 16 * images.length
  for (const { size, data } of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1) // height
    e.writeUInt8(0, 2) // palette colours
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

async function lionOutputs() {
  const lion = await lionSource()

  const full = path.join(BRAND_OUT, 'lion.png')
  await sharp(lion).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toFile(full)
  wrote(full)

  // Tight square mark: the trimmed art, letterboxed in black.
  const markFile = path.join(BRAND_OUT, 'lion-mark.png')
  const mark = await onBlack(lion, 256, 0.92)
  await sharp(mark).toFile(markFile)
  wrote(markFile)

  const icons = [
    { file: 'icon-192.png', size: 192, fraction: 0.84 },
    { file: 'icon-512.png', size: 512, fraction: 0.84 },
    // Maskable: launchers crop to a circle or squircle; keep the lion in the
    // central 60% (20% padding each side).
    { file: 'icon-maskable-512.png', size: 512, fraction: 0.6 },
    // iOS rounds the corners itself; opaque, no alpha (as iOS expects).
    { file: 'apple-touch-icon.png', size: 180, fraction: 0.8 },
    { file: 'favicon-32.png', size: 32, fraction: 0.96 },
    { file: 'favicon-16.png', size: 16, fraction: 1 },
  ]
  for (const i of icons) {
    const out = path.join(ICON_OUT, i.file)
    await sharp(await onBlack(lion, i.size, i.fraction)).toFile(out)
    wrote(out)
  }

  const ico = icoFromPngs(
    await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await onBlack(lion, size, size <= 16 ? 1 : 0.96) })))
  )
  const icoFile = path.join(APP_DIR, 'favicon.ico')
  fs.writeFileSync(icoFile, ico)
  wrote(icoFile)
}

// ------------------------------------------------------------------ wordmark

const clamp = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v))

const chroma = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b)
/** Gold/yellow hue: red >= green > blue with real saturation. */
const isGold = (r, g, b) => chroma(r, g, b) >= 40 && r >= g - 6 && g > b

/**
 * Gold text on an off-white ground -> tightly cropped alpha mask of the text.
 *
 * The original has non-text artefacts (a noisy light strip along the top
 * edge, a small gray bar under the text), so the text is found by gold
 * hue/saturation rather than by darkness: gray and near-white pixels are
 * never "text". The crop is the bounding box of the gold pixels plus ~4%
 * padding. Alpha is the colour distance from the background, scaled so the
 * stroke core is opaque, and weighted by how gold the pixel is (anti-aliased
 * gold edges keep the stroke's chroma-to-distance ratio, gray does not).
 */
async function extractGoldText(file) {
  const { data, info } = await sharp(file)
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: C } = info
  const at = (x, y) => (y * W + x) * C

  // Text mask and its bounding box. Rows/columns need >= 2 gold pixels so a
  // stray speck cannot stretch the box.
  const rowCount = new Uint32Array(H)
  const colCount = new Uint32Array(W)
  let gr = 0, gg = 0, gb = 0, goldCount = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y)
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (isGold(r, g, b)) {
        rowCount[y]++; colCount[x]++
        gr += r; gg += g; gb += b; goldCount++
      }
    }
  }
  if (!goldCount) throw new Error('brand-src/wordmark.png: no gold text pixels found')
  const first = (arr) => arr.findIndex((v) => v >= 2)
  const last = (arr) => arr.length - 1 - [...arr].reverse().findIndex((v) => v >= 2)
  const x0 = first(colCount), x1 = last(colCount), y0 = first(rowCount), y1 = last(rowCount)

  const padX = Math.max(4, Math.round((x1 - x0 + 1) * 0.04))
  const padY = Math.max(4, Math.round((y1 - y0 + 1) * 0.04))
  const left = Math.max(0, x0 - padX), top = Math.max(0, y0 - padY)
  const right = Math.min(W - 1, x1 + padX), bottom = Math.min(H - 1, y1 + padY)
  const width = right - left + 1, height = bottom - top + 1

  // Background: median of the non-gold pixels in the crop.
  const bgSamples = [[], [], []]
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = at(x, y)
      if (chroma(data[i], data[i + 1], data[i + 2]) < 12) {
        bgSamples[0].push(data[i]); bgSamples[1].push(data[i + 1]); bgSamples[2].push(data[i + 2])
      }
    }
  }
  const median = (a) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 255)
  const bg = bgSamples.map(median)
  const dist = (r, g, b) => Math.hypot(r - bg[0], g - bg[1], b - bg[2])

  // Stroke strength: the 75th percentile of gold-pixel distance from the
  // background (the textured foil core), and its chroma/distance ratio.
  const goldDists = [], ratios = []
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = at(x, y)
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (isGold(r, g, b)) {
        const d = dist(r, g, b)
        goldDists.push(d)
        ratios.push(chroma(r, g, b) / Math.max(1, d))
      }
    }
  }
  goldDists.sort((p, q) => p - q)
  const strokeDist = Math.max(1, goldDists[Math.floor(goldDists.length * 0.75)])
  const goldRatio = median(ratios)

  const alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(left + x, top + y)
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const d = dist(r, g, b)
      if (d < 6) continue // background noise
      const warm = r >= g - 6 && g >= b ? 1 : 0
      const goldness = warm * clamp((chroma(r, g, b) / d) / (goldRatio * 0.6), 0, 1)
      alpha[y * width + x] = clamp(Math.round((d / strokeDist) * 255 * goldness))
    }
  }

  // Stroke colour: the average of the core gold pixels (not the faint edges).
  let cr = 0, cg = 0, cb = 0, coreCount = 0
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const i = at(x, y)
      const r = data[i], g = data[i + 1], b = data[i + 2]
      if (isGold(r, g, b) && dist(r, g, b) >= strokeDist) {
        cr += r; cg += g; cb += b; coreCount++
      }
    }
  }
  const gold = coreCount ? [cr / coreCount, cg / coreCount, cb / coreCount] : [gr / goldCount, gg / goldCount, gb / goldCount]
  return { alpha, width, height, gold }
}

/** RGBA buffer: one flat colour with the given alpha mask. */
function tint(alpha, rgb) {
  const out = Buffer.alloc(alpha.length * 4)
  for (let i = 0; i < alpha.length; i++) {
    out[i * 4] = rgb[0]
    out[i * 4 + 1] = rgb[1]
    out[i * 4 + 2] = rgb[2]
    out[i * 4 + 3] = alpha[i]
  }
  return out
}

/** Scales a colour towards black (amount 0..1), keeping its hue. */
const deepen = (rgb, amount) => rgb.map((c) => Math.round(c * (1 - amount)))

async function wordmarkOutputs() {
  const lightFile = path.join(BRAND_OUT, 'wordmark.png')
  const darkFile = path.join(BRAND_OUT, 'wordmark-dark.png')
  const file = path.join(SRC, 'wordmark.png')

  if (!fs.existsSync(file)) {
    warnings.push('brand-src/wordmark.png not found: the wordmark outputs are a "AHSAN TARIQ" text PLACEHOLDER.')
    await sharp(Buffer.from(wordmarkPlaceholderSvg('#8A6A12'))).trim().png().toFile(lightFile)
    wrote(lightFile)
    await sharp(Buffer.from(wordmarkPlaceholderSvg('#E2C46A'))).trim().png().toFile(darkFile)
    wrote(darkFile)
    return
  }

  const { alpha, width, height, gold } = await extractGoldText(file)
  const raw = { raw: { width, height, channels: 4 } }

  // Light backgrounds: the original gold, slightly deepened for contrast on white.
  const lightGold = deepen(gold, 0.15)
  await sharp(tint(alpha, lightGold), raw).png().toFile(lightFile)
  wrote(lightFile)

  // Dark backgrounds: the brand's brighter gold.
  const darkGold = [0xd4, 0xaf, 0x37]
  await sharp(tint(alpha, darkGold), raw).png().toFile(darkFile)
  wrote(darkFile)

  const hex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()
  console.log(`  wordmark ${width}x${height}, source gold ${hex(gold)}, light ${hex(lightGold)}, dark ${hex(darkGold)}`)
}

// ------------------------------------------------------------------ run

await lionOutputs()
await wordmarkOutputs()

if (warnings.length) {
  console.warn('\nWARNING: placeholders were used.')
  for (const w of warnings) console.warn(`  - ${w}`)
  console.warn('  Put the originals in brand-src/ (see brand-src/README.md) and run `npm run brand:assets` again.\n')
} else {
  console.log('\nAll brand assets generated from the originals in brand-src/.')
}
