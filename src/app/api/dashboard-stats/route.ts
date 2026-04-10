import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/dashboard-stats - Lightweight dashboard stats using SQL aggregates
export async function GET() {
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
      supabase
        .from('customers')
        .select('*', { count: 'exact', head: true }),

      // 2. Order count + total revenue
      supabase
        .from('orders')
        .select('id, total_amount'),

      // 3. Recent orders count (this month)
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', getFirstDayOfMonth()),

      // 4. Ledger totals (only debit/credit columns, no joins)
      supabase
        .from('general_ledger')
        .select('id, debit, credit'),

      // 5. Upcoming deliveries (LIMIT 5, minimal join)
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
        .gte('delivery_date', new Date().toISOString().split('T')[0])
        .neq('status', 'Cancelled')
        .order('delivery_date', { ascending: true })
        .limit(5),

      // 6. Chart data: ledger payments grouped by month (last 6 months, only order_payment)
      supabase
        .from('general_ledger')
        .select('id, entry_date, debit')
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
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
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
