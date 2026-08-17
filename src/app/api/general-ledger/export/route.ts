import { withAdmin } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { buildLedgerQuery, parseLedgerFilters } from '@/lib/ledger-query'
import { fetchAllRows, DEFAULT_PAGE_SIZE } from '@/lib/fetch-all-rows'
import { toCsv, type CsvValue } from '@/lib/csv'
import type { GeneralLedgerWithRelations } from '@/lib/supabase-client'

/**
 * GET /api/general-ledger/export -- the whole filtered ledger as CSV.
 *
 * `withAdmin` is load-bearing, not decoration. This route reaches the database
 * with the service-role key, so without the wrapper it would hand the entire
 * financial history of the business to any anonymous caller in one request.
 *
 * Three things this route gets right that the old client-side export did not:
 *
 * 1. It exports every matching row. The old export serialised whatever the
 *    React table happened to be holding, which was one page of 20.
 * 2. It paginates. PostgREST truncates at 1000 rows with a 200 and no error, so
 *    "select everything" is a lie above 1000 rows -- see fetch-all-rows.ts.
 * 3. It emits the stored `balance` column untouched. See the note on Balance
 *    below.
 */

const EXPORT_HEADERS = [
  'Date',
  'Particulars',
  'Type',
  'Debit',
  'Credit',
  'Balance',
  'Vendor',
  'Order Number',
  'Notes',
] as const

/**
 * `YYYY-MM-DD`, taken from the stored value rather than passed through `Date`.
 *
 * `entry_date` is a DATE column; parsing it into a JS Date and formatting it
 * back re-interprets it in the server's timezone, which shifts entries across
 * midnight and would put a row outside the very date range that selected it.
 */
function formatEntryDate(entryDate: string): string {
  return entryDate.slice(0, 10)
}

type LedgerExportRow = GeneralLedgerWithRelations

function toCsvRowValues(entry: LedgerExportRow): CsvValue[] {
  return [
    formatEntryDate(entry.entry_date),
    entry.particulars,
    entry.entry_type,
    entry.debit ?? 0,
    entry.credit ?? 0,
    // Balance is the whole-ledger running balance at this entry, straight from
    // the column the database triggers maintain. It is deliberately NOT
    // recomputed from the exported rows: an export filtered to March must still
    // show March's true position in the ledger, not a balance that restarts at
    // zero on 1 March.
    entry.balance,
    entry.vendors?.name ?? '',
    entry.orders?.order_number ?? '',
    entry.notes ?? '',
  ]
}

export const GET = withAdmin(async (request: Request) => {
  try {
    const supabase = createAdminSupabaseClient()
    const { searchParams } = new URL(request.url)
    const filters = parseLedgerFilters(searchParams)

    /**
     * Test seam. The staging ledger has 79 rows, so a single un-paginated
     * request looks correct there and the pagination loop is never exercised.
     * Forcing a small page size makes the multi-request path reachable in a
     * test against a small dataset. It cannot change the result -- the loop
     * reassembles the same rows in the same order regardless -- and it is
     * clamped to the server cap so it can never be used to ask for more.
     */
    const requestedPageSize = Number(searchParams.get('pageSize'))
    const pageSize =
      Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? Math.min(requestedPageSize, DEFAULT_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE

    // Oldest-first: a ledger is read forwards, and it is the order in which the
    // stored running balance increases monotonically down the file.
    const { rows, requests } = await fetchAllRows<LedgerExportRow>(
      (from, to) =>
        buildLedgerQuery(supabase, filters, { direction: 'asc' })
          .range(from, to)
          // The select string is a shared constant rather than a literal, so
          // supabase-js cannot infer the row shape from it.
          .returns<LedgerExportRow[]>(),
      { pageSize }
    )

    const csv = toCsv(EXPORT_HEADERS, rows.map(toCsvRowValues))
    const filename = `ledger_entries_${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // Admin-only financial data. Same shared-cache leak as
        // /api/general-ledger/stats -- a cacheable response lets the edge serve
        // the whole ledger to callers withAdmin never saw.
        'Cache-Control': 'no-store',
        // Lets the browser report an accurate count without parsing the file,
        // and makes a truncating regression visible in a test.
        'X-Total-Rows': String(rows.length),
        'X-Page-Requests': String(requests),
      },
    })
  } catch (error) {
    console.error('Error in GET /api/general-ledger/export:', error)
    return NextResponse.json(
      { error: 'Failed to export ledger entries' },
      { status: 500 }
    )
  }
})
