"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { 
  Users, 
  ShoppingCart, 
  CreditCard, 
  ArrowUpRight,
  DollarSign,
  Calendar,
  PackageCheck
} from 'lucide-react'
import { format } from 'date-fns'
import type { Customer, OrderWithCustomer } from '@/lib/supabase-client'

interface DashboardStats {
  totalCustomers: number
  totalOrders: number
  totalRevenue: number
  totalAdvances: number
  totalBalance: number
  recentOrdersCount: number
  chartData: Array<{ month: string; revenue: number }>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [upcomingOrders, setUpcomingOrders] = useState<OrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch customers and orders in parallel
        const [customersResponse, ordersResponse] = await Promise.all([
          fetch('/api/customers?pageSize=1000'),
          fetch('/api/orders?pageSize=1000')
        ])

        if (!customersResponse.ok || !ordersResponse.ok) {
          throw new Error('Failed to fetch data')
        }

        const customersData = await customersResponse.json()
        const ordersData = await ordersResponse.json()
        
        const customers: Customer[] = customersData.data || []
        const orders: OrderWithCustomer[] = ordersData.data || []

        // Get upcoming deliveries (next 5 orders from today onwards)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        const upcoming = orders
          .filter(order => {
            const deliveryDate = new Date(order.delivery_date)
            deliveryDate.setHours(0, 0, 0, 0)
            return deliveryDate >= today && order.status !== 'Cancelled'
          })
          .sort((a, b) => {
            const dateA = new Date(a.delivery_date)
            const dateB = new Date(b.delivery_date)
            return dateA.getTime() - dateB.getTime()
          })
          .slice(0, 5)
        
        setUpcomingOrders(upcoming)

        // Calculate stats
        const totalCustomers = customers.length
        const totalOrders = orders.length
        
        // Calculate total revenue (sum of all total_amount)
        const totalRevenue = orders.reduce((sum, order) => {
          return sum + (order.total_amount || 0)
        }, 0)
        
        // Calculate total advances and balance
        const totalAdvances = orders.reduce((sum, order) => {
          return sum + (order.advance_paid || 0)
        }, 0)
        
        const totalBalance = orders.reduce((sum, order) => {
          return sum + (order.balance || 0)
        }, 0)
        
        // Count recent orders (this month)
        const now = new Date()
        const thisMonth = now.getMonth()
        const thisYear = now.getFullYear()
        
        const recentOrdersCount = orders.filter(order => {
          const orderDate = new Date(order.created_at)
          return orderDate.getMonth() === thisMonth && orderDate.getFullYear() === thisYear
        }).length
        
        // Generate chart data for last 6 months
        const chartData = generateChartData(orders)
        
        setStats({
          totalCustomers,
          totalOrders,
          totalRevenue,
          totalAdvances,
          totalBalance,
          recentOrdersCount,
          chartData
        })
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error)
        
        // Fallback data
        setStats({
          totalCustomers: 0,
          totalOrders: 0,
          totalRevenue: 0,
          totalAdvances: 0,
          totalBalance: 0,
          recentOrdersCount: 0,
          chartData: []
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])
  
  // Generate chart data for revenue over last 6 months
  const generateChartData = (orders: OrderWithCustomer[]) => {
    const now = new Date()
    const chartData: Array<{ month: string; revenue: number }> = []
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthName = date.toLocaleDateString('en-US', { month: 'short' })
      
      const monthRevenue = orders
        .filter(order => {
          const orderDate = new Date(order.created_at)
          return orderDate.getMonth() === date.getMonth() && 
                 orderDate.getFullYear() === date.getFullYear()
        })
        .reduce((sum, order) => sum + (order.total_amount || 0), 0)
      
      chartData.push({
        month: monthName,
        revenue: monthRevenue
      })
    }
    
    return chartData
  }

  const formatCurrency = (amount: number) => {
    return `PKR ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)}`
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome to AR Dashboard</h2>
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
        
        {/* Stats Cards Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Chart and Quick Actions Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="pl-2">
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          
          <Card className="col-span-3">
            <CardHeader>
              <Skeleton className="h-6 w-24 mb-2" />
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center p-3 rounded-lg border">
                  <Skeleton className="h-5 w-5 mr-3" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-4 w-4" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome to AR Dashboard</h2>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening with your business today.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCustomers || 0}</div>
            <p className="text-xs text-muted-foreground">
              <Link href="/customers" className="flex items-center gap-1 hover:text-foreground no-underline">
                View all customers <ArrowUpRight className="h-3 w-3" />
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
            <p className="text-xs text-muted-foreground">
              <Link href="/orders" className="flex items-center gap-1 hover:text-foreground no-underline">
                View all orders <ArrowUpRight className="h-3 w-3" />
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(stats?.totalRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              +{stats?.recentOrdersCount || 0} orders this month
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(stats?.totalBalance || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats?.totalAdvances || 0)} received in advance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <p className="text-sm text-muted-foreground">
              Monthly revenue for the last 6 months
            </p>
          </CardHeader>
          <CardContent className="pl-2">
            <ChartContainer
              config={{
                revenue: {
                  label: "Revenue",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats?.chartData || []}
                  margin={{
                    top: 10,
                    right: 30,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <XAxis
                    dataKey="month"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `PKR ${value}`}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    strokeWidth={2}
                    activeDot={{
                      r: 6,
                      style: { fill: "var(--color-revenue)", opacity: 0.25 },
                    }}
                    style={{
                      fill: "var(--color-revenue)",
                      fillOpacity: 0.2,
                      stroke: "var(--color-revenue)",
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Upcoming Deliveries */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5" />
              Upcoming Deliveries
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Next 5 orders to be delivered
            </p>
          </CardHeader>
          <CardContent>
            {upcomingOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming deliveries</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingOrders.map((order) => {
                  const deliveryDate = new Date(order.delivery_date)
                  const today = new Date()
                  today.setHours(0, 0, 0, 0)
                  deliveryDate.setHours(0, 0, 0, 0)
                  
                  const daysUntil = Math.ceil((deliveryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                  const isToday = daysUntil === 0
                  const isTomorrow = daysUntil === 1
                  const isUrgent = daysUntil <= 2
                  
                  return (
                    <Link 
                      key={order.id} 
                      href="/orders" 
                      className="block no-underline"
                    >
                      <div className={`p-3 rounded-lg border hover:bg-accent transition-colors ${
                        isUrgent ? 'border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/20' : ''
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm font-mono">{order.order_number}</span>
                              {isToday && (
                                <Badge variant="destructive" className="text-xs">Today</Badge>
                              )}
                              {isTomorrow && (
                                <Badge variant="default" className="text-xs bg-orange-500">Tomorrow</Badge>
                              )}
                            </div>
                            <div className="text-sm font-medium truncate">
                              {order.customers.name}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              {order.customers.phone}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-medium text-muted-foreground mb-1">
                              {format(new Date(order.delivery_date), 'MMM d')}
                            </div>
                            <div className={`text-xs ${
                              isUrgent ? 'text-orange-600 font-medium' : 'text-muted-foreground'
                            }`}>
                              {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : `${daysUntil}d`}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
                <Link href="/orders" className="block no-underline">
                  <div className="text-center pt-2">
                    <span className="text-sm text-primary hover:underline flex items-center justify-center gap-1">
                      View all orders <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
