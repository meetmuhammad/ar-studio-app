import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getLedgerTotals } from '@/lib/ledger-service'

// GET /api/general-ledger/stats - Get ledger statistics using lightweight queries
export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    // The totals' definition (sum of debits, sum of credits, balance = debit -
    // credit, entry count) lives in the shared ledger service so the MCP server
    // reports exactly the same figures. It also pages through the table, where
    // this route used to read a single response and so stopped counting at
    // PostgREST's 1,000-row cap.
    const totals = await getLedgerTotals()

    // `private, no-store`: this response is admin-only. It used to be
    // `public, s-maxage=30`, which lets a CDN cache it by URL and hand it to
    // someone with no token at all, defeating the guard above.
    return NextResponse.json({
      totalDebit: Number(totals.totalDebit),
      totalCredit: Number(totals.totalCredit),
      currentBalance: Number(totals.currentBalance),
      entryCount: totals.entryCount,
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
