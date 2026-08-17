import { withAdmin } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/general-ledger/stats - Get ledger statistics using lightweight queries
export const GET = withAdmin(async () => {
  try {
    const supabase = createAdminSupabaseClient()

    // Run count and sum queries in parallel — only fetch the columns we need
    const [countResult, sumResult] = await Promise.all([
      // Head-only count (no data transferred)
      supabase
        .from('general_ledger')
        .select('*', { count: 'exact', head: true }),
      // Only select debit/credit columns (no joins, no extra columns)
      supabase
        .from('general_ledger')
        .select('debit, credit'),
    ])

    if (countResult.error || sumResult.error) {
      console.error('Error fetching ledger stats:', countResult.error || sumResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch ledger stats' },
        { status: 500 }
      )
    }

    const entries = sumResult.data || []
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
