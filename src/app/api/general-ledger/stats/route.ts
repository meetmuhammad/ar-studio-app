import { NextResponse } from 'next/server'
import { requireBusinessRead } from '@/lib/business-context'
import { getLedgerTotals } from '@/lib/ledger-service'
import { isValidDateString } from '@/lib/date-range'

// GET /api/general-ledger/stats - Get ledger statistics using lightweight queries
//
// Optional ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD (inclusive, either may be
// omitted) limits every figure -- totalDebit, totalCredit, currentBalance and
// entryCount -- to that range, the same range the ledger table is filtered by.
// currentBalance is debit - credit over the selected dates (the net for the
// period), so with no range it is the all-time balance.
export async function GET(request: Request) {
  const scope = await requireBusinessRead(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

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

    // The totals' definition (sum of debits, sum of credits, balance = debit -
    // credit, entry count) lives in the shared ledger service so the MCP server
    // reports exactly the same figures. It also pages through the table, where
    // this route used to read a single response and so stopped counting at
    // PostgREST's 1,000-row cap.
    //
    // Totals are per business. In the admin combined view the response also
    // breaks them down by business; the combined currentBalance is the sum of
    // each book's net for the range (a report total, not a running balance).
    const perBusiness = await Promise.all(
      scope.businessIds.map(async (id) => ({
        id,
        totals: await getLedgerTotals({ businessIds: [id], startDate, endDate }),
      }))
    )
    const sum = (k: 'totalDebit' | 'totalCredit' | 'currentBalance') =>
      perBusiness.reduce((acc, b) => acc + Math.round(Number(b.totals[k]) * 100), 0) / 100
    const totals = {
      totalDebit: sum('totalDebit'),
      totalCredit: sum('totalCredit'),
      currentBalance: sum('currentBalance'),
      entryCount: perBusiness.reduce((acc, b) => acc + b.totals.entryCount, 0),
    }
    const names = new Map(scope.memberships.map((b) => [b.id, b.name]))

    // `private, no-store`: this response is admin-only. It used to be
    // `public, s-maxage=30`, which lets a CDN cache it by URL and hand it to
    // someone with no token at all, defeating the guard above.
    return NextResponse.json({
      totalDebit: Number(totals.totalDebit),
      totalCredit: Number(totals.totalCredit),
      currentBalance: Number(totals.currentBalance),
      entryCount: totals.entryCount,
      startDate,
      endDate,
      combined: !scope.business,
      ...(!scope.business && {
        byBusiness: perBusiness.map((b) => ({
          businessId: b.id,
          businessName: names.get(b.id) ?? null,
          totalDebit: Number(b.totals.totalDebit),
          totalCredit: Number(b.totals.totalCredit),
          currentBalance: Number(b.totals.currentBalance),
          entryCount: b.totals.entryCount,
        })),
      }),
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
