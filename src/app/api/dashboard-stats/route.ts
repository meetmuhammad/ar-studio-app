import { NextResponse } from 'next/server'
import { requireBusinessRead } from '@/lib/business-context'
import { callerSupabaseClient, rpcErrorStatus } from '@/lib/api-auth'

/** The part of public.dashboard_summary this route reports (20261119000600). */
interface DashboardSummaryAllTime {
  all_time: {
    customers: number
    orders: number
    revenue: number
    received: { advances: number; payments: number; total: number }
    outstanding: number
    recent_orders_this_month: number
  }
  upcoming_orders: Array<{
    id: string
    order_number: string
    delivery_date: string
    status: string | null
    customers: { name: string; phone: string } | null
  }>
  monthly_receipts_6m: Array<{ month: string; label: string; total: number }>
}

/**
 * GET /api/dashboard-stats (mobile app). Admin only; one business, or (admin,
 * X-Business-Id: all) every business the admin belongs to, added together.
 *
 * Every figure comes from public.dashboard_summary, the same function as the
 * web dashboard, called AS the caller (so the database checks admin and
 * membership again). Nothing is summed here; this only renames keys.
 *
 *   totalCustomers / totalOrders  exact counts, all time
 *   totalRevenue                  sum of order totals, all time
 *   totalReceived                 money received from customers, all time:
 *                                 advances + payments
 *   outstandingBalance            still to collect: per order not Cancelled,
 *                                 max(total - advance - payments, 0), summed
 *   recentOrdersCount             orders created this month (Asia/Karachi)
 *   upcomingOrders                next 5 not Cancelled, delivery today or later
 *   chartData                     last 6 months (Asia/Karachi), receipts per month
 */
export async function GET(request: Request) {
  const scope = await requireBusinessRead(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  try {
    const { data, error } = await callerSupabaseClient(request).rpc('dashboard_summary', {
      p_business_ids: scope.businessIds,
      p_from: null,
      p_to: null,
    })
    if (error) {
      const status = rpcErrorStatus(error)
      if (status) return NextResponse.json({ error: error.message }, { status })
      throw new Error(`dashboard_summary: ${error.message}`)
    }

    const d = data as DashboardSummaryAllTime
    const a = d.all_time
    return NextResponse.json({
      totalCustomers: Number(a.customers),
      totalOrders: Number(a.orders),
      totalRevenue: Number(a.revenue),
      totalReceived: Number(a.received.total),
      outstandingBalance: Number(a.outstanding),
      recentOrdersCount: Number(a.recent_orders_this_month),
      upcomingOrders: d.upcoming_orders ?? [],
      chartData: (d.monthly_receipts_6m ?? []).map((m) => ({ month: m.label, revenue: Number(m.total) })),
    }, {
      headers: {
        // Per user and per business: never cacheable by a shared cache (a
        // `public` CDN entry is keyed by URL alone, so it would hand one
        // business's figures to another business's request).
        'Cache-Control': 'private, no-store',
      }
    })
  } catch (error) {
    console.error('GET /api/dashboard-stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
