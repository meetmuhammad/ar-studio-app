import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getLedgerTotals } from '@/lib/ledger-service'
import { isValidDateString } from '@/lib/date-range'

// GET /api/general-ledger/stats - Get ledger statistics using lightweight queries
//
// Optional ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD (inclusive, either may be
// omitted) limits totalDebit, totalCredit and entryCount to that range, the same
// range the ledger table is filtered by. currentBalance is always the all-time
// balance: a balance is a point-in-time position, not a flow over the period.
export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const rawStart = searchParams.get('start_date')
    const rawEnd = searchParams.get('end_date')
    for (const [name, value] of [['start_date', rawStart], ['end_date', rawEnd]] as const) {
      if (value && !isValidDateString(value)) {
        return NextResponse.json({ error: `${name} must be a YYYY-MM-DD date` }, { status: 400 })
      }
    }
    const startDate = rawStart || null
    const endDate = rawEnd || null
    const ranged = Boolean(startDate || endDate)

    // The totals' definition (sum of debits, sum of credits, balance = debit -
    // credit, entry count) lives in the shared ledger service so the MCP server
    // reports exactly the same figures. It also pages through the table, where
    // this route used to read a single response and so stopped counting at
    // PostgREST's 1,000-row cap.
    const [totals, allTime] = await Promise.all([
      getLedgerTotals({ startDate, endDate }),
      ranged ? getLedgerTotals() : null,
    ])

    // `private, no-store`: this response is admin-only. It used to be
    // `public, s-maxage=30`, which lets a CDN cache it by URL and hand it to
    // someone with no token at all, defeating the guard above.
    return NextResponse.json({
      totalDebit: Number(totals.totalDebit),
      totalCredit: Number(totals.totalCredit),
      currentBalance: Number((allTime ?? totals).currentBalance),
      entryCount: totals.entryCount,
      startDate,
      endDate,
    }, {
      headers: {
        'Cache-Control': 'private, no-store',
      }
    })
  } catch (error) {
    console.error('Error in GET /api/general-ledger/stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ledger stats' },
      { status: 500 }
    )
  }
}
