import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { inScope, requireBusinessRead } from '@/lib/business-context'

// GET /api/dashboard-stats - Lightweight dashboard stats using SQL aggregates
export async function GET(request: Request) {
  // One business, or (admin, X-Business-Id: all) the combined read-only view:
  // every figure here is a count or a sum, so adding books together is a
  // meaningful report. No running balance is involved.
  const scope = await requireBusinessRead(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  try {
    const supabase = createAdminSupabaseClient()

    // Run all lightweight queries in parallel
    const [
      customerCountResult,
      orderStatsResult,
      recentOrdersResult,
      ledgerStatsResult,
      upcomingDeliveriesResult,
      chartDataResult,
    ] = await Promise.all([
      // 1. Customer count (head-only, no data transferred)
      inScope(supabase
        .from('customers')
        .select('*', { count: 'exact', head: true }), scope),

      // 2. Order count + total revenue
      inScope(supabase
        .from('orders')
        .select('id, total_amount'), scope),

      // 3. Recent orders count (this month)
      inScope(supabase
        .from('orders')
        .select('*', { count: 'exact', head: true }), scope)
        .gte('created_at', getFirstDayOfMonth()),

      // 4. Ledger totals (only debit/credit columns, no joins)
      inScope(supabase
        .from('general_ledger')
        .select('id, debit, credit'), scope),

      // 5. Upcoming deliveries (LIMIT 5, minimal join)
      inScope(supabase
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
        `), scope)
        .gte('delivery_date', new Date().toISOString().split('T')[0])
        .neq('status', 'Cancelled')
        .order('delivery_date', { ascending: true })
        .limit(5),

      // 6. Chart data: ledger payments grouped by month (last 6 months, only order_payment)
      inScope(supabase
        .from('general_ledger')
        .select('id, entry_date, debit'), scope)
        .eq('entry_type', 'order_payment')
        .gte('entry_date', getSixMonthsAgo()),
    ])

    // Process results (all lightweight - just counting/summing small result sets)
    const totalCustomers = customerCountResult.count || 0

    const orders = (orderStatsResult.data || []) as Array<{ id: string; total_amount: number | null }>
    const totalOrders = orders.length
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

    const recentOrdersCount = recentOrdersResult.count || 0

    // Ledger stats from minimal columns
    const ledgerEntries = (ledgerStatsResult.data || []) as Array<{ id: string; debit: number | null; credit: number | null }>
    const totalReceived = ledgerEntries.reduce((sum, e) => sum + (e.debit || 0), 0)
    const totalCredit = ledgerEntries.reduce((sum, e) => sum + (e.credit || 0), 0)
    const currentBalance = totalReceived - totalCredit
    const outstandingBalance = totalRevenue - currentBalance

    // Upcoming deliveries
    const upcomingOrders = upcomingDeliveriesResult.data || []

    // Chart data: group by month
    const chartData = buildChartData((chartDataResult.data || []) as Array<{ id: string; entry_date: string; debit: number | null }>)

    return NextResponse.json({
      totalCustomers,
      totalOrders,
      totalRevenue,
      totalReceived: currentBalance,
      outstandingBalance,
      recentOrdersCount,
      upcomingOrders,
      chartData,
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

// Helpers
function getFirstDayOfMonth(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

function getSixMonthsAgo(): string {
  const date = new Date()
  date.setMonth(date.getMonth() - 6)
  date.setDate(1)
  return date.toISOString().split('T')[0]
}

function buildChartData(entries: Array<{ entry_date: string; debit: number | null }>) {
  const now = new Date()
  const chartData: Array<{ month: string; revenue: number }> = []

  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthName = date.toLocaleDateString('en-US', { month: 'short' })
    const targetMonth = date.getMonth()
    const targetYear = date.getFullYear()

    const monthRevenue = entries
      .filter(entry => {
        const entryDate = new Date(entry.entry_date)
        return entryDate.getMonth() === targetMonth &&
               entryDate.getFullYear() === targetYear
      })
      .reduce((sum, entry) => sum + (entry.debit || 0), 0)

    chartData.push({ month: monthName, revenue: monthRevenue })
  }

  return chartData
}
