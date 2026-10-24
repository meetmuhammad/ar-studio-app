import { createAdminSupabaseClient } from '@/lib/supabase'
import { centsToDecimal, toCents } from '@/lib/ledger-mcp/normalize'

/**
 * The ledger reads that the REST routes and the MCP server both use, so there
 * is one definition of each. Server-side only: it uses the service-role client,
 * so callers MUST have authorized the request before calling anything here.
 */

export interface LedgerFilters {
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

  let query = supabase
    .from('general_ledger')
    .select(`
      *,
      ${vendorJoin} (id, name, category_id, vendor_categories (id, name)),
      orders (id, order_number),
      vendor_tags (id, tag_name)
    `, { count: 'exact' })
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })

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
 * limited to one entry_date.
 *
 * Pages through the table: PostgREST caps a single response (1,000 rows by
 * default), and the stats route used to read one response, so past 1,000 entries
 * its totals would have silently stopped counting. Sums are done in integer
 * cents rather than as floats.
 */
export async function getLedgerTotals(opts: { date?: string } = {}): Promise<LedgerTotals> {
  const supabase = createAdminSupabaseClient()
  const PAGE = 1000
  let debit = 0
  let credit = 0
  let count = 0

  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('general_ledger')
      .select('debit, credit')
      .order('id') // a stable order, so paging neither skips nor repeats rows
      .range(from, from + PAGE - 1)
    if (opts.date) q = q.eq('entry_date', opts.date)

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

/** Vendors by name, for picking the one a vendor payment is for. */
export async function findVendors(query: string, limit = 10) {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('vendors')
    .select('id, name, vendor_categories (name)')
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(limit)
  if (error) throw new Error(`Failed to look up vendors: ${error.message}`)
  return data ?? []
}
