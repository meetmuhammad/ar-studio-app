import { withAdmin } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import {
  endOfMonth,
  formatMonthLabel,
  normalizeRange,
  startOfMonth,
  todayInTimeZone,
} from '@/lib/date-range'

/**
 * GET /api/dashboard-stats?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * WHAT CHANGED AND WHY
 *
 * The previous version fetched rows and summed them in JavaScript:
 *
 *     .from('orders').select('id, total_amount')          -> reduce()
 *     .from('general_ledger').select('id, debit, credit') -> reduce()
 *
 * Two independent defects.
 *
 * 1. WRONG PAST 1000 ROWS. PostgREST returns at most 1000 rows and says so only
 *    in a header nobody read, so the totals silently under-reported once the
 *    studio passed a thousand orders. Verified locally: 1500 orders of PKR 1000
 *    summed to 1,000,000 instead of 1,500,000 -- a third of the revenue simply
 *    absent, with a 200 response and no warning. This is a correctness bug that
 *    grows with the business.
 *
 * 2. WRONG DEFINITION. "Revenue" was read off `general_ledger` debits where
 *    entry_type = 'order_payment'. Those are *collections*. Booked revenue is
 *    SUM(orders.total_amount) over the booking month; the two diverge the moment
 *    an order is part-paid, which is every order. And `outstandingBalance` was
 *    whole-business revenue minus the whole-business ledger balance, which mixed
 *    vendor payments and miscellaneous entries into a customer-receivable
 *    figure.
 *
 * Both are now one `dashboard_stats(p_start, p_end)` call. PostgREST's own
 * aggregates are disabled on this project (PGRST123), so a database function is
 * the only way to aggregate server-side. See
 * supabase/migrations/20260817120000_dashboard_stats_fn.sql -- in particular the
 * privilege block: the function is service_role-only, because anything callable
 * with the anon key is callable by the entire internet.
 *
 * The remaining queries stay on PostgREST because neither can truncate: two are
 * `count: 'exact', head: true` (a count, not rows) and the third is LIMIT 5.
 */
export const GET = withAdmin(async (request) => {
  try {
    const supabase = createAdminSupabaseClient()

    const { searchParams } = new URL(request.url)
    // "Today" is the studio's today, not the server's. Vercel runs in UTC, so
    // for the first five hours of every Karachi day the two disagree.
    const today = todayInTimeZone()
    const range = normalizeRange(searchParams.get('start'), searchParams.get('end'), today)

    // Deliberately NOT range-scoped: this is the "+N this month" footnote under
    // the Orders card, and it stays anchored to the current calendar month so it
    // still means something when the user selects "This Year". It moved from
    // `created_at` to `booking_date` and gained the Cancelled exclusion so it
    // counts the same population as the KPI above it.
    const monthStart = startOfMonth(today)
    const monthEnd = endOfMonth(today)

    const [
      customerCountResult,
      rangeStatsResult,
      recentOrdersResult,
      upcomingDeliveriesResult,
    ] = await Promise.all([
      // Whole-book customer count. head:true transfers no rows, and `count`
      // is exact regardless of the 1000-row response cap.
      supabase.from('customers').select('*', { count: 'exact', head: true }),

      // Every money figure and the chart, aggregated in Postgres.
      supabase.rpc('dashboard_stats', { p_start: range.start, p_end: range.end }),

      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('booking_date', monthStart)
        .lte('booking_date', monthEnd)
        .neq('status', 'Cancelled'),

      // Next five deliveries, business-wide rather than range-scoped: the point
      // of the panel is what is due next, which has nothing to do with when the
      // orders were booked.
      supabase
        .from('orders')
        .select(`
          id,
          order_number,
          delivery_date,
          status,
          customers (
            name,
            phone
          )
        `)
        .gte('delivery_date', today)
        .neq('status', 'Cancelled')
        .order('delivery_date', { ascending: true })
        .limit(5),
    ])

    // A failed aggregate must not be papered over with zeros: a dashboard
    // confidently reading "PKR 0 outstanding" is worse than an error state.
    if (rangeStatsResult.error) {
      console.error('GET /api/dashboard-stats rpc error:', rangeStatsResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch dashboard stats' },
        { status: 500 }
      )
    }

    const agg = (rangeStatsResult.data ?? {}) as DashboardStatsRpc
    const chartPoints = agg.chart ?? []

    // Postgres NUMERIC arrives as a string once it exceeds JS-safe precision,
    // so coerce rather than trusting the wire type.
    const num = (value: number | string | null | undefined): number => Number(value ?? 0)

    const chartYears = new Set(chartPoints.map((point) => point.month_start.slice(0, 4)))
    const chartData = chartPoints.map((point) => ({
      month: formatMonthLabel(point.month_start, chartYears.size > 1),
      revenue: num(point.revenue),
    }))

    return NextResponse.json({
      totalCustomers: customerCountResult.count ?? 0,
      totalOrders: num(agg.total_orders),
      totalRevenue: num(agg.total_revenue),
      // Kept under its original name so nothing downstream breaks, but the
      // meaning is now exact: money collected against the orders booked in this
      // range (advance + subsequent payments), not a ledger-wide net balance.
      totalReceived: num(agg.collected),
      outstandingBalance: num(agg.outstanding),
      recentOrdersCount: recentOrdersResult.count ?? 0,
      upcomingOrders: upcomingDeliveriesResult.data ?? [],
      chartData,
      range,
    }, {
      headers: {
        // Was `public, s-maxage=60, stale-while-revalidate=120`, which handed
        // this response to Vercel's shared edge cache. `public` means any cache
        // may store it and replay it to anyone -- the CDN has no idea the body
        // was authorized for one specific role. Once an admin warmed the entry,
        // an unauthenticated request got 200 with x-vercel-cache: HIT and the
        // full revenue, receipts and outstanding-balance figures. withAdmin was
        // doing its job; the cache was answering before the route ran at all.
        //
        // no-store rather than `private, max-age=N`: this is a shared browser
        // in a studio, and a private entry survives sign-out, so the next
        // person to sign in could be served the previous admin's figures from
        // local cache. The saved round trip is not worth either exposure.
        'Cache-Control': 'no-store',
      }
    })
  } catch (error) {
    console.error('GET /api/dashboard-stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
})

/** Shape of the jsonb returned by public.dashboard_stats(date, date). */
interface DashboardStatsRpc {
  range_start: string
  range_end: string
  total_orders: number
  total_revenue: number | string
  collected: number | string
  outstanding: number | string
  chart: Array<{ month_start: string; revenue: number | string }>
}
