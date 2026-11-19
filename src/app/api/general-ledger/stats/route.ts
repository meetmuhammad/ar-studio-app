import { NextResponse } from 'next/server'
import { requireBusinessRead } from '@/lib/business-context'
import type { PostgrestError } from '@supabase/supabase-js'
import { callerSupabaseClient, rpcErrorStatus } from '@/lib/api-auth'
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

    // Totals come from public.ledger_entries (20261119000200), the function
    // the web Ledger page reads, called AS the caller (the database checks admin
    // and membership again): debit, credit, net = debit - credit and the entry
    // count over the dates, summed in SQL over every row. p_limit 0: no rows,
    // only the totals. Nothing is summed here.
    //
    // Totals are per business (one call each). In the admin combined view the
    // response also breaks them down by business; the combined figures come
    // from one call over every id (the same sums, a report total, not a
    // running balance).
    const supabase = callerSupabaseClient(request)
    const totalsFor = async (ids: string[]) => {
      const { data, error } = await supabase.rpc('ledger_entries', {
        p_business_ids: ids,
        p_from: startDate,
        p_to: endDate,
        p_search: null,
        p_entry_type: null,
        p_vendor_id: null,
        p_limit: 0,
        p_offset: 0,
        p_vendor_category_id: null,
      })
      if (error) throw error
      const t = (data as { totals: { debit: number; credit: number; net: number; entry_count: number } }).totals
      return {
        totalDebit: Number(t.debit),
        totalCredit: Number(t.credit),
        currentBalance: Number(t.net),
        entryCount: Number(t.entry_count),
      }
    }

    let totals: Awaited<ReturnType<typeof totalsFor>>
    let perBusiness: Array<{ id: string; totals: typeof totals }> = []
    try {
      ;[totals, perBusiness] = await Promise.all([
        totalsFor(scope.businessIds),
        scope.business
          ? Promise.resolve([])
          : Promise.all(scope.businessIds.map(async (id) => ({ id, totals: await totalsFor([id]) }))),
      ])
    } catch (error) {
      const status = rpcErrorStatus(error as PostgrestError)
      if (status) return NextResponse.json({ error: (error as PostgrestError).message }, { status })
      throw error
    }
    const names = new Map(scope.memberships.map((b) => [b.id, b.name]))

    // `private, no-store`: this response is admin-only. It used to be
    // `public, s-maxage=30`, which lets a CDN cache it by URL and hand it to
    // someone with no token at all, defeating the guard above.
    return NextResponse.json({
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      currentBalance: totals.currentBalance,
      entryCount: totals.entryCount,
      startDate,
      endDate,
      combined: !scope.business,
      ...(!scope.business && {
        byBusiness: perBusiness.map((b) => ({
          businessId: b.id,
          businessName: names.get(b.id) ?? null,
          ...b.totals,
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
