"use client"

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
import { RoleGuard } from '@/components/auth/role-guard'
import { useDashboardStats } from '@/hooks/use-api'


export default function DashboardPage() {
  const { data: stats, isLoading: loading } = useDashboardStats()

  const formatCurrency = (amount: number) => {
    return `PKR ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)}`
  }

  if (loading) {
    return (
      <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-4 sm:space-y-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Welcome to AR Dashboard</h2>
          <p className="text-sm sm:text-base text-muted-foreground">Loading dashboard data...</p>
        </div>
        
        {/* Stats Cards Skeleton */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-7">
          <Card className="lg:col-span-4">
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="pl-2">
              <Skeleton className="h-[300px] w-full" />
            </CardContent>
          </Card>
          
          <Card className="lg:col-span-3">
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
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Welcome to AR Dashboard</h2>
        <p className="text-sm sm:text-base text-muted-foreground">
          Here&apos;s what&apos;s happening with your business today.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{stats?.totalCustomers || 0}</div>
            <p className="text-xs text-muted-foreground">
              <Link href="/customers" className="flex items-center gap-1 hover:text-foreground no-underline">
                View all customers <ArrowUpRight className="h-3 w-3" />
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{stats?.totalOrders || 0}</div>
            <p className="text-xs text-muted-foreground">
              <Link href="/orders" className="flex items-center gap-1 hover:text-foreground no-underline">
                View all orders <ArrowUpRight className="h-3 w-3" />
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-foreground">
              {formatCurrency(stats?.totalRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              +{stats?.recentOrdersCount || 0} orders this month
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Outstanding Balance</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold text-orange-600">
              {formatCurrency(stats?.outstandingBalance || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats?.totalReceived || 0)} received
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart Section */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-7">
        <Card className="lg:col-span-4">
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
              className="h-[250px] sm:h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats?.chartData || []}
                  margin={{
                    top: 10,
                    right: 10,
                    left: -20,
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
        <Card className="lg:col-span-3">
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
            {(!stats?.upcomingOrders || stats.upcomingOrders.length === 0) ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming deliveries</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.upcomingOrders.map((order) => {
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
    </RoleGuard>
  )
}
