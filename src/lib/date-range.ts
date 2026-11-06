/**
 * Calendar-date ranges for date-range filters (ledger today; reusable for
 * dashboards/PnL later).
 *
 * Ledger dates are Postgres DATEs: calendar days in the studio's own zone,
 * Asia/Karachi (UTC+05:00, no DST). `new Date().toISOString()` gives the UTC
 * date, which between 00:00 and 05:00 Karachi is still yesterday, and on the 1st
 * shifts a whole "This Month" window. So today's date is read once from Intl in
 * Asia/Karachi and everything after that is YYYY-MM-DD string arithmetic.
 *
 * Trimmed from the unmerged feat/dashboard-date-range-and-db-aggregates branch.
 */

export const BUSINESS_TIME_ZONE = 'Asia/Karachi'

export type DateRangePreset = 'all_time' | 'this_year' | 'last_3_months' | 'this_month' | 'custom'

export interface DateRange {
  start: string // YYYY-MM-DD, inclusive
  end: string   // YYYY-MM-DD, inclusive
}

export const DATE_RANGE_PRESETS: ReadonlyArray<{ value: DateRangePreset; label: string }> = [
  { value: 'all_time', label: 'All Time' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'this_month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// 'en-CA' formats as YYYY-MM-DD.
const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar date in Asia/Karachi, as YYYY-MM-DD. */
export function todayInBusinessZone(now: Date = new Date()): string {
  return businessDateFormatter.format(now)
}

function splitDate(value: string): [number, number, number] {
  return [Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10))]
}

function joinDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** True only for a well-formed AND real calendar date ('2026-02-30' is false). */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const [y, m, d] = splitDate(value)
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return joinDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** Clamps rather than overflowing: 31 Mar minus one month is 28/29 Feb. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = splitDate(date)
  const total = y * 12 + (m - 1) + months
  const ty = Math.floor(total / 12)
  const tm = (total % 12) + 1
  return joinDate(ty, tm, Math.min(d, daysInMonth(ty, tm)))
}

/**
 * Resolve a preset to inclusive calendar dates, or null for "no limit".
 * Calendar presets (This Month / This Year) cover the whole period; the rolling
 * "Last 3 Months" ends today (17 Aug -> 18 May .. 17 Aug).
 * `custom` has no intrinsic range and resolves to null here.
 */
export function resolvePreset(preset: DateRangePreset, today: string = todayInBusinessZone()): DateRange | null {
  const [y, m] = splitDate(today)
  switch (preset) {
    case 'this_month':
      return { start: joinDate(y, m, 1), end: joinDate(y, m, daysInMonth(y, m)) }
    case 'last_3_months':
      return { start: addDays(addMonths(today, -3), 1), end: today }
    case 'this_year':
      return { start: joinDate(y, 1, 1), end: joinDate(y, 12, 31) }
    default:
      return null
  }
}

/**
 * The whole calendar quarter containing `today` (Jan-Mar, Apr-Jun, Jul-Sep,
 * Oct-Dec), inclusive. Not one of the ledger presets above; the Profit & Loss
 * report uses it (src/lib/pnl.ts).
 */
export function quarterOf(today: string = todayInBusinessZone()): DateRange {
  const [y, m] = splitDate(today)
  const first = Math.floor((m - 1) / 3) * 3 + 1
  const last = first + 2
  return { start: joinDate(y, first, 1), end: joinDate(y, last, daysInMonth(y, last)) }
}

/** A Date picked in the browser -> its local calendar date (not the UTC one). */
export function toDateString(date: Date): string {
  return joinDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/** YYYY-MM-DD -> a Date at local midnight, for date pickers. */
export function fromDateString(value: string): Date {
  const [y, m, d] = splitDate(value)
  return new Date(y, m - 1, d)
}

/** A saved date-range filter. Custom keeps its dates; presets recompute on load. */
export interface DateRangeSelection {
  preset: DateRangePreset
  start?: string
  end?: string
}

export function isDateRangePreset(value: unknown): value is DateRangePreset {
  return DATE_RANGE_PRESETS.some((p) => p.value === value)
}

/** Coerce an untrusted saved value into a valid selection, or null. */
export function parseDateRangeSelection(value: unknown): DateRangeSelection | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (!isDateRangePreset(v.preset)) return null
  if (v.preset !== 'custom') return { preset: v.preset }
  return {
    preset: 'custom',
    start: isValidDateString(v.start) ? v.start : undefined,
    end: isValidDateString(v.end) ? v.end : undefined,
  }
}

/** The start/end a selection filters on right now (either side may be open). */
export function selectionToBounds(sel: DateRangeSelection, today?: string): { start?: string; end?: string } {
  if (sel.preset === 'custom') return { start: sel.start, end: sel.end }
  const r = resolvePreset(sel.preset, today)
  return r ? { start: r.start, end: r.end } : {}
}
