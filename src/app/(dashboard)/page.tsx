"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { 
  Users, 
  ShoppingCart, 
  CreditCard, 
  ArrowUpRight,
  DollarSign
} from 'lucide-react'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        console.log('Fetching dashboard stats...')
        const response = await fetch('/api/stats')
        console.log('Stats response:', response.status, response.statusText)
        
        if (response.ok) {
          const data = await response.json()
          console.log('Stats data received:', data)
          setStats(data)
        } else {
          console.error('Stats API failed:', response.status, response.statusText)
          const errorText = await response.text()
          console.error('Error response:', errorText)
          
          // Fallback data for demo
          setStats({
            totalCustomers: 0,
            totalOrders: 0,
            totalRevenue: 0,
            totalAdvances: 0,
            totalBalance: 0,
            recentOrdersCount: 0,
            chartData: []
          })
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error)
        
        // Fallback data for demo
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Loading...</CardTitle>
                <div className="h-4 w-4 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-7 bg-muted rounded mb-1" />
                <div className="h-4 bg-muted rounded w-2/3" />
              </CardContent>
            </Card>
          ))}
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

        {/* Quick Actions */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Common tasks and shortcuts
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Link href="/customers" className="block no-underline">
              <div className="flex items-center p-3 rounded-lg border hover:bg-accent transition-colors">
                <Users className="h-5 w-5 mr-3 text-blue-500" />
                <div className="flex-1">
                  <div className="font-medium">Manage Customers</div>
                  <div className="text-sm text-muted-foreground">Add or edit customer information</div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>

            <Link href="/orders" className="block no-underline">
              <div className="flex items-center p-3 rounded-lg border hover:bg-accent transition-colors">
                <ShoppingCart className="h-5 w-5 mr-3 text-green-500" />
                <div className="flex-1">
                  <div className="font-medium">Manage Orders</div>
                  <div className="text-sm text-muted-foreground">Create and track orders</div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>

            <div className="flex items-center p-3 rounded-lg border bg-muted/50">
              <CreditCard className="h-5 w-5 mr-3 text-orange-500" />
              <div className="flex-1">
                <div className="font-medium">Payment Tracking</div>
                <div className="text-sm text-muted-foreground">Coming soon...</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
