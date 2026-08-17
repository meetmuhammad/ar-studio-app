/**
 * Calendar-date arithmetic for the dashboard's date-range filter.
 *
 * WHY THIS IS NOT `new Date()` + date-fns
 *
 * `orders.booking_date` is a Postgres DATE. It has no time and no zone; it is a
 * calendar date in the studio's own reckoning, which is Asia/Karachi (UTC+05:00,
 * no DST). Two failure modes follow, and both were live in the old dashboard:
 *
 *   1. Boundaries computed in the wrong zone. Between 00:00 and 05:00 Karachi
 *      the UTC date is still yesterday, so `new Date().toISOString()` puts
 *      1 September 05:00 PKT into August. On the 1st of a month that shifts the
 *      whole "This Month" window by a month; the old route's
 *      `getFirstDayOfMonth()` (route.ts:124) used the *server's* local zone,
 *      which on Vercel is UTC, so it had the same bug from the other side.
 *
 *   2. Round-tripping a DATE through a Date object. `new Date('2026-08-01')`
 *      parses as UTC midnight; reading it back with `getMonth()` in a zone
 *      behind UTC yields July. The old `buildChartData()` (route.ts:147) did
 *      exactly this.
 *
 * So: the current calendar date is read once from Intl in Asia/Karachi, and
 * every subsequent operation is string/number arithmetic on `YYYY-MM-DD`.
 * No Date object ever carries a zone through this module, which means there is
 * nothing left to get wrong on a boundary.
 */

export const DASHBOARD_TIME_ZONE = 'Asia/Karachi'

export type DateRangePreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_30_days'
  | 'last_3_months'
  | 'this_year'
  | 'custom'

export interface DateRange {
  start: string // YYYY-MM-DD, inclusive
  end: string   // YYYY-MM-DD, inclusive
}

export const DEFAULT_DATE_RANGE_PRESET: DateRangePreset = 'this_month'

export const DATE_RANGE_PRESETS: ReadonlyArray<{
  value: DateRangePreset
  label: string
}> = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
]

/** Longest span the API will accept, so a hand-typed range cannot ask for a
 *  hundred-thousand-day chart. 10 years is far beyond any real use. */
export const MAX_RANGE_DAYS = 3660

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// 'en-CA' formats as YYYY-MM-DD, which is the shape the DATE column speaks.
const karachiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today's calendar date in Asia/Karachi, as YYYY-MM-DD. */
export function todayInTimeZone(now: Date = new Date()): string {
  return karachiDateFormatter.format(now)
}

/** True only for a well-formed AND real calendar date ('2026-02-30' is false). */
export function isValidDateString(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  const [y, m, d] = splitDate(value)
  if (m < 1 || m > 12) return false
  return d >= 1 && d <= daysInMonth(y, m)
}

function splitDate(value: string): [number, number, number] {
  return [
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)),
    Number(value.slice(8, 10)),
  ]
}

function joinDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one. Built in UTC so the
  // host zone cannot shift it.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Days between two calendar dates, inclusive of both ends. */
export function daysInRange(range: DateRange): number {
  const [ys, ms, ds] = splitDate(range.start)
  const [ye, me, de] = splitDate(range.end)
  const startMs = Date.UTC(ys, ms - 1, ds)
  const endMs = Date.UTC(ye, me - 1, de)
  return Math.floor((endMs - startMs) / 86_400_000) + 1
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date)
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return joinDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

/** Month arithmetic that clamps rather than overflowing: 31 Mar minus one
 *  month is 28 Feb, not 3 Mar. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = splitDate(date)
  const total = (y * 12) + (m - 1) + months
  const targetYear = Math.floor(total / 12)
  const targetMonth = (total % 12) + 1
  return joinDate(targetYear, targetMonth, Math.min(d, daysInMonth(targetYear, targetMonth)))
}

export function startOfMonth(date: string): string {
  const [y, m] = splitDate(date)
  return joinDate(y, m, 1)
}

export function endOfMonth(date: string): string {
  const [y, m] = splitDate(date)
  return joinDate(y, m, daysInMonth(y, m))
}

export function startOfYear(date: string): string {
  return joinDate(splitDate(date)[0], 1, 1)
}

export function endOfYear(date: string): string {
  return joinDate(splitDate(date)[0], 12, 31)
}

/** Monday-based, matching the Pakistani working week. */
export function startOfWeek(date: string): string {
  const [y, m, d] = splitDate(date)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  const backToMonday = (dow + 6) % 7
  return addDays(date, -backToMonday)
}

/**
 * Resolve a preset to concrete inclusive calendar dates.
 *
 * Calendar presets (Today / This Week / This Month / This Year) return the
 * whole period, not period-to-date: a KPI row that says "This Month" should
 * cover the month, and the tail of it is empty anyway because a booking cannot
 * be made for a date that has not happened. Rolling presets (Last 30 Days,
 * Last 3 Months) end today, which is what "last" means.
 *
 * `custom` has no intrinsic range; it falls back to the default so a caller
 * that has not chosen dates yet still gets something sensible.
 */
export function resolvePreset(
  preset: DateRangePreset,
  today: string = todayInTimeZone()
): DateRange {
  switch (preset) {
    case 'today':
      return { start: today, end: today }
    case 'this_week':
      return { start: startOfWeek(today), end: addDays(startOfWeek(today), 6) }
    case 'last_30_days':
      return { start: addDays(today, -29), end: today }
    case 'last_3_months':
      // Inclusive of both ends, so step one day past the anchor: 17 Aug back
      // three months is 18 May .. 17 Aug, not 17 May .. 17 Aug.
      return { start: addDays(addMonths(today, -3), 1), end: today }
    case 'this_year':
      return { start: startOfYear(today), end: endOfYear(today) }
    case 'this_month':
    case 'custom':
    default:
      return { start: startOfMonth(today), end: endOfMonth(today) }
  }
}

/**
 * Coerce whatever arrived over the wire into a range that is safe to hand to
 * the database. Anything malformed falls back to the default month rather than
 * erroring: a bad query string should not blank an admin's dashboard.
 */
export function normalizeRange(
  start: string | null | undefined,
  end: string | null | undefined,
  today: string = todayInTimeZone()
): DateRange {
  const fallback = resolvePreset(DEFAULT_DATE_RANGE_PRESET, today)
  if (!isValidDateString(start) || !isValidDateString(end)) return fallback

  const ordered: DateRange = start <= end ? { start, end } : { start: end, end: start }
  if (daysInRange(ordered) > MAX_RANGE_DAYS) {
    return { start: addDays(ordered.end, -(MAX_RANGE_DAYS - 1)), end: ordered.end }
  }
  return ordered
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Chart bucket label from a YYYY-MM-DD month start. String indexing, not
 * `toLocaleDateString`, for the reason at the top of this file. The year is
 * appended only when the chart spans more than one, so a twelve-month view is
 * not cluttered but a three-year one is not ambiguous.
 */
export function formatMonthLabel(monthStart: string, includeYear: boolean): string {
  const [y, m] = splitDate(monthStart)
  const label = MONTH_LABELS[m - 1] ?? monthStart
  return includeYear ? `${label} '${String(y).slice(2)}` : label
}

/** Short human description of a range, e.g. "1–31 Aug 2026". */
export function formatRangeLabel(range: DateRange): string {
  const [ys, ms, ds] = splitDate(range.start)
  const [ye, me, de] = splitDate(range.end)
  if (ys === ye && ms === me) return `${ds}–${de} ${MONTH_LABELS[ms - 1]} ${ys}`
  if (ys === ye) return `${ds} ${MONTH_LABELS[ms - 1]} – ${de} ${MONTH_LABELS[me - 1]} ${ys}`
  return `${ds} ${MONTH_LABELS[ms - 1]} ${ys} – ${de} ${MONTH_LABELS[me - 1]} ${ye}`
}
