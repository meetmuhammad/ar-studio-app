import { withAdmin } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetch-all-rows'

type LedgerAmounts = { debit: number | null; credit: number | null }

// GET /api/general-ledger/stats - Get ledger statistics using lightweight queries
//
// PostgREST aggregate functions are disabled on this project (`select=debit.sum()`
// returns PGRST123), so the totals have to be summed in the application. That
// means reading every row's debit/credit -- and reading every row means
// paginating, because PostgREST truncates at 1000 with a 200 and no error. The
// unpaginated version of this query reported the totals of the oldest 1000
// entries as the totals of the whole ledger.
export const GET = withAdmin(async () => {
  try {
    const supabase = createAdminSupabaseClient()

    // Run count and sum queries in parallel — only fetch the columns we need
    const [countResult, amounts] = await Promise.all([
      // Head-only count (no data transferred)
      supabase
        .from('general_ledger')
        .select('*', { count: 'exact', head: true }),
      // Only select debit/credit columns (no joins, no extra columns)
      // Ordered by the primary key, which is unique, so the sort is total.
      // These totals are assembled from independent .range() requests, and a
      // non-total sort lets PostgreSQL resolve a tie differently per request --
      // which would double-count or drop a row and quietly skew the totals.
      // Display order is irrelevant here; only stability across pages matters.
      fetchAllRows<LedgerAmounts>((from, to) =>
        supabase
          .from('general_ledger')
          .select('debit, credit')
          .order('id', { ascending: true })
          .range(from, to)
          .returns<LedgerAmounts[]>()
      ),
    ])

    if (countResult.error) {
      console.error('Error fetching ledger stats:', countResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch ledger stats' },
        { status: 500 }
      )
    }

    const entries = amounts.rows
    const totalDebit = entries.reduce((sum, entry) => sum + (entry.debit || 0), 0)
    const totalCredit = entries.reduce((sum, entry) => sum + (entry.credit || 0), 0)
    const currentBalance = totalDebit - totalCredit

    return NextResponse.json({
      totalDebit,
      totalCredit,
      currentBalance,
      entryCount: countResult.count || 0,
    }, {
      headers: {
        // Same shared-cache leak as /api/dashboard-stats -- see the note there.
        // `public` let Vercel's edge serve these ledger totals to callers the
        // withAdmin guard had never seen.
        'Cache-Control': 'no-store',
      }
    })
  } catch (error) {
    console.error('Error in GET /api/general-ledger/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
