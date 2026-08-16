/**
 * Shared number/currency formatting.
 *
 * Currency was previously formatted by a local helper inside the dashboard page.
 * Centralised here so every surface renders PKR identically.
 */

const PKR = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** `PKR 1,642,000` — full precision, for KPI values and detail rows. */
export function formatPKR(amount: number): string {
  return `PKR ${PKR.format(amount)}`
}

/**
 * `PKR 1.6M` / `PKR 240k` — abbreviated, for chart axis ticks and other
 * width-constrained slots where the full value would overflow at 375px.
 */
export function formatCompactPKR(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''

  if (abs >= 1_000_000) {
    return `${sign}PKR ${trimZero(abs / 1_000_000)}M`
  }
  if (abs >= 1_000) {
    return `${sign}PKR ${trimZero(abs / 1_000)}k`
  }
  return `${sign}PKR ${Math.round(abs)}`
}

/**
 * `1.6M` / `240k` / `0` — abbreviated with no currency prefix.
 *
 * Used for chart axis ticks. Recharts word-wraps tick text once the axis has a
 * width, so a "PKR 360k" tick breaks onto two lines and collides with the plot;
 * the unit belongs in the card title and tooltip, not repeated on every tick.
 */
export function formatCompactNumber(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''

  if (abs >= 1_000_000) return `${sign}${trimZero(abs / 1_000_000)}M`
  if (abs >= 1_000) return `${sign}${trimZero(abs / 1_000)}k`
  return `${sign}${Math.round(abs)}`
}

/** 1.60 -> "1.6", 12.0 -> "12" — keeps ticks narrow without losing precision. */
function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/**
 * Percentage of `part` within `total`, rounded, clamped to 0-100.
 * Returns null when there is no meaningful denominator so callers can omit the
 * indicator entirely rather than render a misleading 0%.
 */
export function percentOf(part: number, total: number): number | null {
  if (!total || total <= 0) return null
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)))
}

/**
 * Month-over-month change between the last two points of a series.
 * Returns null when there are fewer than two points, or when the previous month
 * was zero (percentage change from zero is undefined, not infinite).
 */
export function monthOverMonth(
  series: Array<{ month: string; revenue: number }>
): { percent: number; previousLabel: string } | null {
  if (series.length < 2) return null

  const current = series[series.length - 1]
  const previous = series[series.length - 2]

  if (!previous || previous.revenue <= 0) return null

  return {
    percent: Math.round(((current.revenue - previous.revenue) / previous.revenue) * 100),
    previousLabel: previous.month,
  }
}
