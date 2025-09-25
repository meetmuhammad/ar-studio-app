import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase-client'

export async function GET() {
  try {
    console.log('Fetching dashboard stats...')
    
    // Get total customers count
    const { count: totalCustomers, error: customersError } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })

    console.log('Customers query result:', { totalCustomers, customersError })
    if (customersError) {
      console.error('Customers error:', customersError)
      throw customersError
    }

    // Get total orders count
    const { count: totalOrders, error: ordersError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })

    console.log('Orders query result:', { totalOrders, ordersError })
    if (ordersError) {
      console.error('Orders error:', ordersError)
      throw ordersError
    }

    // Get payment statistics
    const { data: paymentStats, error: paymentError } = await supabase
      .from('orders')
      .select('total_amount, advance_paid, balance')

    console.log('Payment stats query result:', { paymentStats, paymentError })
    if (paymentError) {
      console.error('Payment error:', paymentError)
      throw paymentError
    }

    // Calculate payment totals - include all orders, even with null amounts
    const totalRevenue = paymentStats?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0
    const totalAdvances = paymentStats?.reduce((sum, order) => sum + (order.advance_paid || 0), 0) || 0
    const totalBalance = paymentStats?.reduce((sum, order) => sum + (order.balance || 0), 0) || 0
    
    console.log('Calculated totals:', { totalRevenue, totalAdvances, totalBalance })

    // Get recent orders for trend data (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { data: recentOrders, error: recentOrdersError } = await supabase
      .from('orders')
      .select('created_at, total_amount')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true })

    if (recentOrdersError) throw recentOrdersError

    // Get monthly revenue trend (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    
    const { data: monthlyData, error: monthlyError } = await supabase
      .from('orders')
      .select('created_at, total_amount')
      .gte('created_at', sixMonthsAgo.toISOString())
      .order('created_at', { ascending: true })

    console.log('Monthly data query result:', { monthlyData, monthlyError })
    if (monthlyError) {
      console.error('Monthly error:', monthlyError)
      throw monthlyError
    }

    // Group by month for chart data - include all orders
    const monthlyRevenue = monthlyData?.reduce((acc: Record<string, number>, order) => {
      const date = new Date(order.created_at)
      const month = date.toLocaleString('default', { month: 'short', year: 'numeric' })
      acc[month] = (acc[month] || 0) + (order.total_amount || 0)
      return acc
    }, {}) || {}

    console.log('Monthly revenue breakdown:', monthlyRevenue)

    // Convert to chart format and ensure we have all months
    const chartData = Object.entries(monthlyRevenue).map(([month, revenue]) => ({
      month,
      revenue
    }))
    
    // If no data, create empty chart data for last 6 months
    if (chartData.length === 0) {
      const now = new Date()
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const month = date.toLocaleString('default', { month: 'short', year: 'numeric' })
        chartData.push({ month, revenue: 0 })
      }
    }
    
    console.log('Final chart data:', chartData)

    return NextResponse.json({
      totalCustomers: totalCustomers || 0,
      totalOrders: totalOrders || 0,
      totalRevenue,
      totalAdvances,
      totalBalance,
      recentOrdersCount: recentOrders.length,
      chartData
    })
  } catch (error) {
    console.error('GET /api/stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    )
  }
}