/**
 * Brand assets for Ahsan Tariq Studio, from the owner's originals.
 *
 *   npm run brand:assets        (node scripts/brand/generate-assets.mjs)
 *
 * Inputs (committed in brand-src/, see brand-src/README.md):
 *   brand-src/lion.png       gold low-poly lion on black, roughly square
 *   brand-src/wordmark.png   thin gold "AHSAN TARIQ" on white
 *
 * Outputs (paths are read by src/lib/brand.ts):
 *   public/brand/lion.png              trimmed lion on black, max 1024
 *   public/brand/lion-mark.png         square lion mark on black, 256
 *   public/brand/wordmark.png          wordmark, gold on transparent (light backgrounds)
 *   public/brand/wordmark-dark.png     wordmark, lighter gold on transparent (dark backgrounds)
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
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/**
 * Gold-on-white -> gold-on-transparent. Alpha comes from how far each pixel is
 * from white (by luminance), scaled so the stroke core is fully opaque, and
 * every pixel takes the stroke's gold. Thin strokes keep their smooth edges.
 */
async function keyOutWhite(file) {
  const { data, info } = await sharp(file)
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 12 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const n = width * height

  // Stroke luminance: the 2nd percentile (robust against stray dark pixels).
  const lumas = new Float64Array(n)
  for (let i = 0; i < n; i++) lumas[i] = luma(data[i * channels], data[i * channels + 1], data[i * channels + 2])
  const sorted = Float64Array.from(lumas).sort()
  const stroke = sorted[Math.floor(n * 0.02)]
  const span = Math.max(1, 255 - stroke)

  // Stroke colour: the average of the pixels near the stroke luminance.
  let r = 0, g = 0, b = 0, count = 0
  for (let i = 0; i < n; i++) {
    if (lumas[i] <= stroke + 12) {
      r += data[i * channels]; g += data[i * channels + 1]; b += data[i * channels + 2]; count++
    }
  }
  const gold = count ? [r / count, g / count, b / count] : [0xd4, 0xaf, 0x37]

  const out = Buffer.alloc(n * 4)
  for (let i = 0; i < n; i++) {
    out[i * 4] = gold[0]
    out[i * 4 + 1] = gold[1]
    out[i * 4 + 2] = gold[2]
    out[i * 4 + 3] = clamp(Math.round(((255 - lumas[i]) / span) * 255))
  }
  return { out, width, height, gold }
}

/** Mixes the gold towards white for dark backgrounds. */
const lighten = (rgb, amount) => rgb.map((c) => Math.round(c + (255 - c) * amount))

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

  const { out, width, height, gold } = await keyOutWhite(file)
  await sharp(out, { raw: { width, height, channels: 4 } }).png().toFile(lightFile)
  wrote(lightFile)

  const light = lighten(gold, 0.3)
  const dark = Buffer.from(out)
  for (let i = 0; i < width * height; i++) {
    dark[i * 4] = light[0]
    dark[i * 4 + 1] = light[1]
    dark[i * 4 + 2] = light[2]
  }
  await sharp(dark, { raw: { width, height, channels: 4 } }).png().toFile(darkFile)
  wrote(darkFile)
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
