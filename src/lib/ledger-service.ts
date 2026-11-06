import { createAdminSupabaseClient } from '@/lib/supabase'
import { centsToDecimal, toCents } from '@/lib/ledger-mcp/normalize'

/**
 * The ledger reads that the REST routes and the MCP server both use, so there
 * is one definition of each. Server-side only: it uses the service-role client,
 * so callers MUST have authorized the request before calling anything here.
 *
 * Every function is scoped to the business(es) the caller resolved (see
 * src/lib/business-context.ts). Each business is its own book: a running
 * balance is only ever computed within ONE business, never across two.
 */

const scoped = <Q>(query: Q, businessIds: string[]): Q => {
  if (businessIds.length === 0) throw new Error('ledger-service: empty business scope')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any
  return (businessIds.length === 1 ? q.eq('business_id', businessIds[0]) : q.in('business_id', businessIds)) as Q
}

export interface LedgerFilters {
  /** Businesses to read. More than one only in the admin combined view. */
  businessIds: string[]
  startDate?: string | null
  endDate?: string | null
  entryType?: string | null
  vendorId?: string | null
  /** Matches the vendor's CURRENT category (vendors.category_id). */
  vendorCategoryId?: string | null
  search?: string | null
  /** 1-based. 0 or undefined returns every row (the legacy REST behaviour). */
  page?: number
  pageSize?: number
}

/**
 * Ledger entries, newest first, with their vendor, order and tag.
 * This is the query GET /api/general-ledger has always run.
 */
export async function listLedgerEntries(f: LedgerFilters) {
  const supabase = createAdminSupabaseClient()
  const page = f.page ?? 0
  const pageSize = f.pageSize ?? 20

  // !inner only when filtering by category -- an inner join would otherwise
  // drop every entry that has no vendor (order payments, direct expenses).
  const vendorJoin = f.vendorCategoryId ? 'vendors!inner' : 'vendors'

  let query = scoped(supabase
    .from('general_ledger')
    .select(`
      *,
      ${vendorJoin} (id, name, category_id, vendor_categories (id, name)),
      orders (id, order_number),
      vendor_tags (id, tag_name)
    `, { count: 'exact' }), f.businessIds)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    // Imported rows share entry_date and created_at; id is the tie-break the
    // database uses for the running balance, so each row sits next to its balance.
    .order('id', { ascending: false })

  if (f.startDate) query = query.gte('entry_date', f.startDate)
  if (f.endDate) query = query.lte('entry_date', f.endDate)
  if (f.entryType) query = query.eq('entry_type', f.entryType)
  if (f.vendorId) query = query.eq('vendor_id', f.vendorId)
  if (f.vendorCategoryId) query = query.eq('vendors.category_id', f.vendorCategoryId)
  if (f.search) query = query.ilike('particulars', `%${f.search}%`)

  if (page > 0) {
    const offset = (page - 1) * pageSize
    query = query.range(offset, offset + pageSize - 1)
  }

  const { data, error, count } = await query
  if (error) throw new Error(`Failed to fetch ledger entries: ${error.message}`)
  return { entries: data ?? [], count: count ?? 0 }
}

/**
 * Running balance for each of `ids`, scoped to an inclusive entry_date range
 * (either side optional): it starts at 0 on the first entry of the range and
 * adds debit - credit for every entry in the range, in the order the database
 * uses for the stored all-time balance (entry_date, created_at, id). The value
 * for an entry is the total after that entry, so the chronologically last entry
 * of the range carries debit - credit over the whole range -- the figure the
 * stats route reports as currentBalance for the same range.
 *
 * Only the date range scopes the run. Other filters (search, category, type,
 * vendor) can hide rows from the table, but hidden in-range rows still count,
 * so the balances shown agree with the Current Balance card.
 *
 * Computed here, not from the stored general_ledger.balance column: that column
 * is all-time by design and stays that way. Reads the range in 1,000-row pages
 * (PostgREST's response cap) and stops once every requested id has been seen,
 * so a request for an older page reads less. Sums are in integer cents.
 */
export async function getRangeRunningBalances(
  /** ONE business: a running balance across two books is meaningless. */
  businessId: string,
  ids: string[],
  range: { startDate?: string | null; endDate?: string | null } = {}
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out

  const supabase = createAdminSupabaseClient()
  const wanted = new Set(ids)
  const PAGE = 1000
  let running = 0

  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('general_ledger')
      .select('id, debit, credit')
      .eq('business_id', businessId)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }) // total order: paging neither skips nor repeats rows
      .range(from, from + PAGE - 1)
    if (range.startDate) q = q.gte('entry_date', range.startDate)
    if (range.endDate) q = q.lte('entry_date', range.endDate)

    const { data, error } = await q
    if (error) throw new Error(`Failed to compute running balances: ${error.message}`)
    for (const row of data ?? []) {
      running += toCents(row.debit) - toCents(row.credit)
      if (wanted.has(row.id)) out.set(row.id, centsToDecimal(running))
    }
    if (out.size === wanted.size || (data?.length ?? 0) < PAGE) break
  }

  return out
}

export interface LedgerTotals {
  /** Decimal strings, exact to the cent. */
  totalDebit: string
  totalCredit: string
  /** totalDebit - totalCredit: what the app shows as the current balance. */
  currentBalance: string
  entryCount: number
}

/**
 * Totals as the app defines them (GET /api/general-ledger/stats): the sum of
 * every debit, the sum of every credit, and balance = debit - credit. Optionally
 * limited to one entry_date, or to an inclusive entry_date range.
 *
 * Pages through the table: PostgREST caps a single response (1,000 rows by
 * default), and the stats route used to read one response, so past 1,000 entries
 * its totals would have silently stopped counting. Sums are done in integer
 * cents rather than as floats.
 */
export async function getLedgerTotals(
  opts: { businessIds: string[]; date?: string; startDate?: string | null; endDate?: string | null }
): Promise<LedgerTotals> {
  const supabase = createAdminSupabaseClient()
  const PAGE = 1000
  let debit = 0
  let credit = 0
  let count = 0

  for (let from = 0; ; from += PAGE) {
    let q = scoped(supabase
      .from('general_ledger')
      .select('debit, credit'), opts.businessIds)
      .order('id') // a stable order, so paging neither skips nor repeats rows
      .range(from, from + PAGE - 1)
    if (opts.date) q = q.eq('entry_date', opts.date)
    if (opts.startDate) q = q.gte('entry_date', opts.startDate)
    if (opts.endDate) q = q.lte('entry_date', opts.endDate)

    const { data, error } = await q
    if (error) throw new Error(`Failed to fetch ledger totals: ${error.message}`)
    for (const row of data ?? []) {
      debit += toCents(row.debit)
      credit += toCents(row.credit)
    }
    count += data?.length ?? 0
    if ((data?.length ?? 0) < PAGE) break
  }

  return {
    totalDebit: centsToDecimal(debit),
    totalCredit: centsToDecimal(credit),
    currentBalance: centsToDecimal(debit - credit),
    entryCount: count,
  }
}

/** A vendor as findVendors returns it. vendor_categories is a to-one embed (an object, not an array). */
export interface VendorMatch {
  id: string
  name: string
  vendor_categories: { name: string } | null
}

/** Vendors by name, for picking the one a vendor payment is for. */
export async function findVendors(businessIds: string[], query: string, limit = 10): Promise<VendorMatch[]> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await scoped(supabase
    .from('vendors')
    .select('id, name, vendor_categories (name)'), businessIds)
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(limit)
  if (error) throw new Error(`Failed to look up vendors: ${error.message}`)
  // The client has no generated schema, so it types the embed as an array.
  return (data ?? []) as unknown as VendorMatch[]
}
