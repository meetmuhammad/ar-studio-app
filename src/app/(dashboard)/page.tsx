"use client"

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowUpRight,
  Calendar,
  CreditCard,
  DollarSign,
  PackageCheck,
  Plus,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { RoleGuard } from '@/components/auth/role-guard'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { StatSparkline } from '@/components/dashboard/stat-sparkline'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ErrorState } from '@/components/dashboard/error-state'
import { DeliveryRow, type UpcomingOrder } from '@/components/dashboard/delivery-row'
import { DateRangeFilter } from '@/components/dashboard/date-range-filter'
import {
  SectionCard,
  SectionCardAction,
  SectionCardContent,
  SectionCardDescription,
  SectionCardHeader,
  SectionCardTitle,
} from '@/components/dashboard/section-card'
import { useDashboardActions } from '@/contexts/dashboard-actions'
import { useDashboardStats } from '@/hooks/use-api'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  DEFAULT_DATE_RANGE_PRESET,
  formatRangeLabel,
  normalizeRange,
  resolvePreset,
  type DateRange,
  type DateRangePreset,
} from '@/lib/date-range'
import {
  formatCompactNumber,
  formatCompactPKR,
  formatPKR,
  monthOverMonth,
  percentOf,
} from '@/lib/format'

export default function DashboardPage() {
  const [preset, setPreset] = useState<DateRangePreset>(DEFAULT_DATE_RANGE_PRESET)
  // Seeded from the default preset so switching to "Custom Range" opens on the
  // window already on screen rather than on empty inputs.
  const [customRange, setCustomRange] = useState<DateRange>(() =>
    resolvePreset(DEFAULT_DATE_RANGE_PRESET)
  )

  // Presets are resolved in Asia/Karachi (see @/lib/date-range) so "This Month"
  // means the studio's month, not UTC's. normalizeRange mirrors the server's own
  // validation, so a half-typed custom date never reaches the API.
  const range = useMemo(
    () =>
      preset === 'custom'
        ? normalizeRange(customRange.start, customRange.end)
        : resolvePreset(preset),
    [preset, customRange]
  )

  const {
    data: stats,
    isPending,
    isError,
    error,
    refetch,
    dataUpdatedAt,
  } = useDashboardStats(range)

  const actions = useDashboardActions()

  const rangeLabel = formatRangeLabel(range)
  const chartData = stats?.chartData ?? []
  const upcomingOrders = (stats?.upcomingOrders ?? []) as UpcomingOrder[]

  const delta = monthOverMonth(chartData)
  const collectionRate = percentOf(stats?.totalReceived ?? 0, stats?.totalRevenue ?? 0)
  const windowTotal = chartData.reduce((sum, point) => sum + point.revenue, 0)
  const hasRevenue = chartData.some((point) => point.revenue > 0)

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeader
          title="Dashboard"
          description={
            isPending || !dataUpdatedAt
              ? undefined
              : `Last updated ${format(new Date(dataUpdatedAt), 'HH:mm')}`
          }
          actions={
            actions ? (
              <>
                <Button size="sm" onClick={actions.openOrderDialog}>
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">New Order</span>
                  <span className="sm:hidden">Order</span>
                </Button>
                <Button size="sm" variant="outline" onClick={actions.openPaymentDialog}>
                  <DollarSign className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Add Payment</span>
                  <span className="sm:hidden">Payment</span>
                </Button>
              </>
            ) : null
          }
        />

        <DateRangeFilter
          preset={preset}
          onPresetChange={setPreset}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          resolvedRange={range}
        />

        {isError ? (
          <ErrorState
            detail={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {/* KPI row — ordered by what drives action: money first, counts after */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Revenue"
                value={formatPKR(stats?.totalRevenue ?? 0)}
                icon={TrendingUp}
                href="/ledger"
                linkLabel="View ledger"
                delta={delta ?? undefined}
                sparkline={<StatSparkline data={chartData} />}
                isLoading={isPending}
              />

              <StatCard
                label="Outstanding"
                value={formatPKR(stats?.outstandingBalance ?? 0)}
                icon={CreditCard}
                href="/ledger"
                linkLabel="View ledger"
                emphasis="warning"
                progress={
                  collectionRate === null
                    ? undefined
                    : { percent: collectionRate, label: `${collectionRate}% collected` }
                }
                isLoading={isPending}
              />

              <StatCard
                label="Orders"
                value={String(stats?.totalOrders ?? 0)}
                icon={ShoppingCart}
                href="/orders"
                linkLabel="View all orders"
                footnote={`+${stats?.recentOrdersCount ?? 0} this month`}
                isLoading={isPending}
              />

              {/* No delta: the payload carries no historical customer series */}
              <StatCard
                label="Customers"
                value={String(stats?.totalCustomers ?? 0)}
                icon={Users}
                href="/customers"
                linkLabel="View all customers"
                isLoading={isPending}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <RevenueOverview
                data={chartData}
                total={windowTotal}
                hasRevenue={hasRevenue}
                isLoading={isPending}
                rangeLabel={rangeLabel}
              />
              <UpcomingDeliveries orders={upcomingOrders} isLoading={isPending} />
            </div>
          </>
        )}
      </div>
    </RoleGuard>
  )
}

function RevenueOverview({
  data,
  total,
  hasRevenue,
  isLoading,
  rangeLabel,
}: {
  data: Array<{ month: string; revenue: number }>
  total: number
  hasRevenue: boolean
  isLoading: boolean
  rangeLabel: string
}) {
  const reducedMotion = useReducedMotion()

  return (
    <SectionCard className="lg:col-span-8">
      <SectionCardHeader>
        <SectionCardTitle className="text-base">Revenue Overview</SectionCardTitle>
        {/* "Booked", not "received": this is SUM(orders.total_amount) by booking
            month. The previous chart plotted general_ledger debits, which are
            collections, under a label that said revenue. */}
        <SectionCardDescription className="text-xs">
          Monthly booked revenue, {rangeLabel}, in PKR
        </SectionCardDescription>
        {!isLoading && hasRevenue ? (
          <SectionCardAction className="font-mono text-xs tabular-nums text-muted-foreground">
            Total: {formatCompactPKR(total)}
          </SectionCardAction>
        ) : null}
      </SectionCardHeader>

      <SectionCardContent>
        {isLoading ? (
          <Skeleton className="h-[240px] w-full sm:h-[280px] lg:h-[300px]" />
        ) : !hasRevenue ? (
          <EmptyState
            icon={TrendingUp}
            message={`No revenue booked ${rangeLabel}`}
            action={
              <Link href="/ledger" className="text-xs no-underline">
                <Button variant="outline" size="sm">
                  View ledger
                </Button>
              </Link>
            }
          />
        ) : (
          <ChartContainer
            config={{
              // Bare token: --chart-1 is an oklch value, so wrapping it in hsl()
              // yields an invalid colour and the series silently loses its fill.
              revenue: { label: 'Revenue', color: 'var(--chart-1)' },
            }}
            className="h-[240px] w-full sm:h-[280px] lg:h-[300px]"
            role="img"
            aria-label={`Monthly booked revenue, ${rangeLabel}, in PKR: ${data
              .map((point) => `${point.month} ${formatCompactNumber(point.revenue)}`)
              .join(', ')}. Total ${formatCompactPKR(total)}.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="month"
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  width={44}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number) => formatCompactNumber(value)}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  strokeWidth={2}
                  stroke="var(--color-revenue)"
                  fill="var(--color-revenue)"
                  fillOpacity={0.2}
                  activeDot={{ r: 5 }}
                  isAnimationActive={!reducedMotion}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </SectionCardContent>
    </SectionCard>
  )
}

function UpcomingDeliveries({
  orders,
  isLoading,
}: {
  orders: UpcomingOrder[]
  isLoading: boolean
}) {
  return (
    <SectionCard className="lg:col-span-4">
      <SectionCardHeader>
        {/* "Next 5" not "Upcoming": the API hard-caps this list at five, so a
            broader title would imply a completeness the data cannot back. */}
        <SectionCardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="size-4" aria-hidden="true" />
          Next 5 Deliveries
        </SectionCardTitle>
        <SectionCardDescription className="text-xs">Soonest first</SectionCardDescription>
      </SectionCardHeader>

      <SectionCardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Calendar}
            message="No upcoming deliveries"
            action={
              <Link href="/orders" className="no-underline">
                <Button variant="outline" size="sm">
                  View all orders
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <DeliveryRow key={order.id} order={order} href="/orders" />
            ))}
            <Link
              href="/orders"
              className="flex items-center justify-center gap-1 pt-1 text-xs text-muted-foreground no-underline transition-colors hover:text-foreground"
            >
              View all orders
              <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
        )}
      </SectionCardContent>
    </SectionCard>
  )
}
