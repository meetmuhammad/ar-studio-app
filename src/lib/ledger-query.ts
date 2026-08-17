import type { SupabaseClient } from '@supabase/supabase-js'
import type { LedgerEntryType } from './supabase-client'

/**
 * One definition of "what the general ledger is filtered by".
 *
 * Three callers need the identical filter semantics: the paginated list route
 * (`GET /api/general-ledger`), the full CSV export (`GET /api/general-ledger/export`),
 * and the browser, which has to build the query string for both. When those
 * three drifted apart the export silently exported a different set of rows than
 * the table on screen, which is the failure mode this module exists to prevent.
 *
 * Adding a filter -- e.g. Wave 4's vendor category -- means touching
 * `LedgerFilters`, `parseLedgerFilters`, and `applyLedgerFilters` here, and
 * nothing in either route.
 */

export const LEDGER_ENTRY_TYPES = [
  'opening_balance',
  'order_payment',
  'vendor_payment',
  'miscellaneous',
] as const

export function isLedgerEntryType(value: string): value is LedgerEntryType {
  return (LEDGER_ENTRY_TYPES as readonly string[]).includes(value)
}

/** Query-string parameter names. Shared so the client cannot misspell one. */
export const LEDGER_FILTER_PARAMS = {
  startDate: 'start_date',
  endDate: 'end_date',
  entryType: 'entry_type',
  vendorId: 'vendor_id',
  search: 'search',
} as const

export interface LedgerFilters {
  /** Inclusive lower bound on entry_date, `YYYY-MM-DD`. */
  startDate: string | null
  /** Inclusive upper bound on entry_date, `YYYY-MM-DD`. */
  endDate: string | null
  entryType: LedgerEntryType | null
  vendorId: string | null
  /** Case-insensitive substring match on `particulars`. */
  search: string | null
  /**
   * Restrict to a *set* of vendors, ANDed with `vendorId` when both are given.
   *
   * Nothing populates this yet. It is the seam Wave 4's vendor-category filter
   * plugs into: a category is not a column on `general_ledger`, so it has to be
   * resolved to vendor ids first (`SELECT id FROM vendors WHERE category = ?`)
   * and then applied here as `.in('vendor_id', ids)`. Doing it that way keeps
   * the join out of the ledger select string, so the list route and the export
   * route stay byte-identical in what they match.
   *
   * An empty array means "no vendor can match" and is applied as such -- it is
   * NOT treated as "no filter", because an unmatched category must return zero
   * rows rather than the whole ledger.
   */
  vendorIds: string[] | null
}

export const EMPTY_LEDGER_FILTERS: LedgerFilters = {
  startDate: null,
  endDate: null,
  entryType: null,
  vendorId: null,
  search: null,
  vendorIds: null,
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function trimmedOrNull(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Read filters off a request's query string.
 *
 * Unparseable values are dropped rather than rejected: a malformed `entry_type`
 * used to be passed straight to `.eq()`, which returned an empty ledger with a
 * 200 and looked like "no data" instead of "bad filter". Dropping it shows the
 * unfiltered ledger, which is the honest answer to a filter that was not
 * expressible.
 */
export function parseLedgerFilters(searchParams: URLSearchParams): LedgerFilters {
  const startDate = trimmedOrNull(searchParams.get(LEDGER_FILTER_PARAMS.startDate))
  const endDate = trimmedOrNull(searchParams.get(LEDGER_FILTER_PARAMS.endDate))
  const entryType = trimmedOrNull(searchParams.get(LEDGER_FILTER_PARAMS.entryType))
  const vendorId = trimmedOrNull(searchParams.get(LEDGER_FILTER_PARAMS.vendorId))
  const search = trimmedOrNull(searchParams.get(LEDGER_FILTER_PARAMS.search))

  return {
    startDate: startDate && DATE_ONLY.test(startDate) ? startDate : null,
    endDate: endDate && DATE_ONLY.test(endDate) ? endDate : null,
    entryType: entryType && isLedgerEntryType(entryType) ? entryType : null,
    vendorId,
    search,
    vendorIds: null,
  }
}

/**
 * Build the query string the API expects. The browser uses this so that the
 * table and the export request cannot disagree about parameter names.
 */
export function ledgerFiltersToSearchParams(
  filters: Partial<Omit<LedgerFilters, 'vendorIds'>>
): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.startDate) params.set(LEDGER_FILTER_PARAMS.startDate, filters.startDate)
  if (filters.endDate) params.set(LEDGER_FILTER_PARAMS.endDate, filters.endDate)
  if (filters.entryType) params.set(LEDGER_FILTER_PARAMS.entryType, filters.entryType)
  if (filters.vendorId) params.set(LEDGER_FILTER_PARAMS.vendorId, filters.vendorId)
  if (filters.search?.trim()) params.set(LEDGER_FILTER_PARAMS.search, filters.search.trim())
  return params
}

/**
 * PostgREST treats `%` and `_` inside an `ilike` pattern as wildcards, so a
 * user searching for "50% deposit" silently matched far more than they asked
 * for. Escape them (and the escape character itself) so the search box means
 * "contains this literal text".
 */
function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1')
}

/** The subset of PostgrestFilterBuilder this module needs. */
interface LedgerFilterable {
  gte(column: string, value: string): this
  lte(column: string, value: string): this
  eq(column: string, value: string): this
  in(column: string, values: string[]): this
  ilike(column: string, pattern: string): this
}

/** Apply every active filter. The only place filter semantics are defined. */
export function applyLedgerFilters<Q extends LedgerFilterable>(
  query: Q,
  filters: LedgerFilters
): Q {
  let q = query
  if (filters.startDate) q = q.gte('entry_date', filters.startDate)
  if (filters.endDate) q = q.lte('entry_date', filters.endDate)
  if (filters.entryType) q = q.eq('entry_type', filters.entryType)
  if (filters.vendorId) q = q.eq('vendor_id', filters.vendorId)
  if (filters.vendorIds) q = q.in('vendor_id', filters.vendorIds)
  if (filters.search) q = q.ilike('particulars', `%${escapeLikePattern(filters.search)}%`)
  return q
}

/** The columns and embedded relations every ledger read returns. */
export const LEDGER_SELECT = `
  *,
  vendors (id, name),
  orders (id, order_number),
  vendor_tags (id, tag_name)
`

/**
 * Sort order.
 *
 * `balance` is a stored column maintained by the database triggers
 * `trg_calculate_general_ledger_balance` / `recalculate_balances_after_date`,
 * which walk the ledger in `(entry_date, created_at)` ascending order. Any read
 * that shows `balance` must therefore order by the same two columns or the
 * running balance appears to jump around. `created_at` is the tiebreaker
 * because several entries commonly share one `entry_date`.
 */
export function applyLedgerOrder<Q extends { order(column: string, opts: { ascending: boolean }): Q }>(
  query: Q,
  direction: 'asc' | 'desc'
): Q {
  const ascending = direction === 'asc'
  return query
    .order('entry_date', { ascending })
    .order('created_at', { ascending })
}

/**
 * A filtered, ordered ledger query. `count: 'exact'` is always requested --
 * PostgREST aggregate functions are disabled on this project, so an exact
 * `content-range` count is the only server-side total available.
 */
export function buildLedgerQuery(
  supabase: SupabaseClient,
  filters: LedgerFilters,
  options: { select?: string; direction?: 'asc' | 'desc'; count?: 'exact' | null } = {}
) {
  const { select = LEDGER_SELECT, direction = 'desc', count = 'exact' } = options
  const base = supabase
    .from('general_ledger')
    .select(select, count ? { count } : undefined)
  return applyLedgerOrder(applyLedgerFilters(base, filters), direction)
}
