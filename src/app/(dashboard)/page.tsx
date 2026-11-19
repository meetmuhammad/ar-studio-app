'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CanAccess } from '@refinedev/core'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Grid,
  List as AntdList,
  Result,
  Row,
  Skeleton,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd'
import { ArrowRightOutlined, CalendarOutlined, WarningOutlined } from '@ant-design/icons'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import dayjs from 'dayjs'
import { useBusinessLabel } from '@/contexts/business-context'
import { useColorMode } from '@/components/providers/color-mode-provider'
import { cardShadow } from '@/lib/refine/theme'
import { formatCompactNumber, formatPKR } from '@/lib/format'
import { useDashboardSummary, type DashboardMonth } from '@/lib/refine/reporting'
import { ChartCard, Trend } from '@/components/refine/chart-card'
import { PeriodPicker, previousPeriod, resolvePeriod, PERIOD_LABEL, type Period } from '@/components/refine/period-picker'

const monthLabel = (key: string) => dayjs(`${key}-01`).format('MMM YY')

function RedirectTo({ href }: { href: string }) {
  const router = useRouter()
  useEffect(() => router.replace(href), [href, router])
  return (
    <Flex justify="center" style={{ padding: 64 }}>
      <Spin />
    </Flex>
  )
}

/**
 * Admin dashboard in the Ant Design Pro "analysis" layout: four KPI cards with
 * a trend against the previous period, a 12-month chart with a ranking, and
 * the deliveries due soon. Every figure comes from dashboard_summary (exact
 * SQL sums, no row cap), for the selected business or all of them.
 */
function Dashboard() {
  const { token } = theme.useToken()
  const { mode } = useColorMode()
  const screens = Grid.useBreakpoint()
  const businessLabel = useBusinessLabel()
  const [period, setPeriod] = useState<Period>({ preset: 'this_month', custom: {} })
  const range = resolvePeriod(period)
  const prevRange = useMemo(() => (range ? previousPeriod(period.preset, range) : null), [period.preset, range])

  const current = useDashboardSummary(range)
  const previous = useDashboardSummary(prevRange)
  const d = current.data
  const p = previous.data
  const loading = current.isLoading

  const months = d?.monthly ?? []
  const mini = (pick: (m: DashboardMonth) => number) => months.map((m) => ({ label: monthLabel(m.month), value: pick(m) }))
  const chartData = months.map((m) => ({
    month: monthLabel(m.month),
    'Order value': Number(m.order_value),
    'Cash received': Number(m.cash_advances) + Number(m.cash_payments),
    Orders: Number(m.orders),
  }))
  const byStatus = d?.orders.by_status ?? {}
  const periodText = range ? `${dayjs(range.start).format('MMM D, YYYY')} – ${dayjs(range.end).format('MMM D, YYYY')}` : 'Choose dates'

  const axis = { stroke: token.colorTextTertiary, fontSize: 12, tickLine: false, axisLine: false }
  const tooltipStyle = {
    contentStyle: { background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6 },
    labelStyle: { color: token.colorText },
    itemStyle: { color: token.colorText },
  }

  if (current.isError) {
    return (
      <Result
        status="warning"
        title="Couldn't load the dashboard"
        subTitle={current.error.message}
        extra={<Button onClick={() => current.refetch()}>Retry</Button>}
      />
    )
  }

  return (
    <Flex vertical gap={24}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            Dashboard
          </Typography.Title>
          <Typography.Text type="secondary">
            {businessLabel} · {PERIOD_LABEL[period.preset]} · {periodText}
          </Typography.Text>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </Flex>

      <Row gutter={[24, 24]}>
        <Col xs={24} sm={12} xl={6}>
          <ChartCard
            title="Revenue"
            tooltip="Total value of orders booked in the period."
            loading={loading}
            value={formatPKR(Number(d?.revenue_in_range ?? 0))}
            trend={<Trend current={Number(d?.revenue_in_range ?? 0)} previous={p ? Number(p.revenue_in_range) : undefined} />}
            chart={{ kind: 'area', data: mini((m) => Number(m.order_value)), color: token.colorPrimary, format: formatPKR }}
            footer={`All time ${formatPKR(Number(d?.revenue_all_time ?? 0))}`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <ChartCard
            title="Cash received"
            tooltip="Advances on orders booked in the period plus payments dated in the period."
            loading={loading}
            value={formatPKR(Number(d?.cash_received.total ?? 0))}
            trend={<Trend current={Number(d?.cash_received.total ?? 0)} previous={p ? Number(p.cash_received.total) : undefined} />}
            chart={{
              kind: 'bar',
              data: mini((m) => Number(m.cash_advances) + Number(m.cash_payments)),
              color: token.colorSuccess,
              format: formatPKR,
            }}
            footer={`Advances ${formatPKR(Number(d?.cash_received.advances ?? 0))} · Payments ${formatPKR(Number(d?.cash_received.payments ?? 0))}`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <ChartCard
            title="Orders"
            tooltip="Orders booked in the period."
            loading={loading}
            value={Number(d?.orders.in_range ?? 0).toLocaleString()}
            trend={<Trend current={Number(d?.orders.in_range ?? 0)} previous={p ? Number(p.orders.in_range) : undefined} />}
            chart={{ kind: 'bar', data: mini((m) => Number(m.orders)), color: token.colorPrimary }}
            footer={`In process ${byStatus['In Process'] ?? 0} · Delivered ${byStatus.Delivered ?? 0} · Cancelled ${byStatus.Cancelled ?? 0}`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <ChartCard
            title="Outstanding balance"
            tooltip="Still to collect on orders that are not cancelled: total minus advance minus payments, today."
            loading={loading}
            value={formatPKR(Number(d?.outstanding ?? 0))}
            trend={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {Number(d?.customers.total ?? 0).toLocaleString()} customers · {Number(d?.customers.new_in_range ?? 0)} new in period
              </Typography.Text>
            }
            footer={
              <span style={{ color: d?.overdue_deliveries ? token.colorError : undefined }}>
                {d?.overdue_deliveries ?? 0} overdue {d?.overdue_deliveries === 1 ? 'delivery' : 'deliveries'}
              </span>
            }
          />
        </Col>
      </Row>

      <Card
        role="region"
        aria-label="Sales charts"
        style={{ boxShadow: cardShadow(mode) }}
        styles={{ body: { padding: '0 24px 24px' } }}
      >
        <Tabs
          size="large"
          items={[
            { key: 'revenue', label: 'Revenue' },
            { key: 'orders', label: 'Orders' },
          ].map((tab) => ({
            ...tab,
            children: loading ? (
              <Skeleton active paragraph={{ rows: 8 }} />
            ) : (
              <Row gutter={[32, 24]}>
                <Col xs={24} lg={16}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    {tab.key === 'revenue' ? 'Order value and cash received, last 12 months' : 'Orders booked, last 12 months'}
                  </Typography.Title>
                  <div style={{ height: 300 }} role="img" aria-label={`${tab.label} by month, last 12 months`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={token.colorBorderSecondary} strokeDasharray="3 3" />
                        <XAxis dataKey="month" {...axis} />
                        <YAxis
                          {...axis}
                          width={52}
                          tickFormatter={(v: number) => (tab.key === 'revenue' ? formatCompactNumber(v) : String(v))}
                        />
                        <Tooltip
                          {...tooltipStyle}
                          cursor={{ fill: token.colorFillTertiary }}
                          formatter={(v, name) => [tab.key === 'revenue' ? formatPKR(Number(v)) : String(v), String(name)]}
                        />
                        {/* No fragments here: recharts 2 finds its series with its own
                            react-is 18, which does not recognise React 19 fragments, so
                            series wrapped in <>...</> are silently dropped. */}
                        {tab.key === 'revenue' && <Legend wrapperStyle={{ color: token.colorText }} />}
                        {tab.key === 'revenue' && (
                          <Bar dataKey="Order value" fill={token.colorPrimary} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        )}
                        {tab.key === 'revenue' && (
                          <Bar dataKey="Cash received" fill={token.colorSuccess} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        )}
                        {tab.key === 'orders' && (
                          <Bar dataKey="Orders" fill={token.colorPrimary} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Col>
                <Col xs={24} lg={8}>
                  <Typography.Title level={5} style={{ marginTop: 0 }}>
                    Top customers by order value
                  </Typography.Title>
                  {(d?.top_customers.length ?? 0) === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No orders in this period." />
                  ) : (
                    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Top customers by order value">
                      {d!.top_customers.map((c, i) => (
                        <li key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 600,
                              background: i < 3 ? token.colorText : token.colorFillSecondary,
                              color: i < 3 ? token.colorBgContainer : token.colorText,
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </span>
                          <Link href={`/customers/show/${c.id}`} style={{ flex: 1, minWidth: 0 }}>
                            <Typography.Text ellipsis>{c.name}</Typography.Text>
                          </Link>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {c.orders} {Number(c.orders) === 1 ? 'order' : 'orders'}
                          </Typography.Text>
                          <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
                            {screens.sm ? formatPKR(Number(c.order_value)) : formatCompactNumber(Number(c.order_value))}
                          </Typography.Text>
                        </li>
                      ))}
                    </ol>
                  )}
                </Col>
              </Row>
            ),
          }))}
        />
      </Card>

      <Card
        title={
          <Space>
            <CalendarOutlined />
            Upcoming deliveries (next 14 days)
          </Space>
        }
        extra={
          <Link href="/orders">
            <Button type="link" icon={<ArrowRightOutlined />} iconPosition="end">
              See all orders
            </Button>
          </Link>
        }
        style={{ boxShadow: cardShadow(mode) }}
      >
        {!!d?.overdue_deliveries && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            style={{ marginBottom: 12 }}
            message={`${d.overdue_deliveries} In Process ${d.overdue_deliveries === 1 ? 'order is' : 'orders are'} past the delivery date.`}
          />
        )}
        <AntdList
          loading={loading}
          dataSource={d?.upcoming_deliveries ?? []}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No deliveries due in the next 14 days." /> }}
          renderItem={(o) => {
            const days = dayjs(o.delivery_date).diff(dayjs(d?.range.today), 'day')
            return (
              <AntdList.Item
                extra={
                  <Space direction="vertical" align="end" size={2}>
                    <Typography.Text strong>{formatPKR(Number(o.balance))}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      balance due
                    </Typography.Text>
                  </Space>
                }
              >
                <AntdList.Item.Meta
                  avatar={<Badge status={days <= 1 ? 'error' : days <= 3 ? 'warning' : 'processing'} />}
                  title={
                    <Space wrap size={8}>
                      <Link href={`/orders/show/${o.id}`} style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
                        {o.order_number}
                      </Link>
                      <span>{o.customer_name}</span>
                    </Space>
                  }
                  description={
                    <Space size={8} wrap>
                      <span>{dayjs(o.delivery_date).format('ddd, MMM D')}</span>
                      <Tag color={days === 0 ? 'red' : days <= 3 ? 'orange' : 'blue'}>
                        {days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                      </Tag>
                    </Space>
                  }
                />
              </AntdList.Item>
            )
          }}
        />
      </Card>
    </Flex>
  )
}

/** Admin-only, like before: other roles are sent to /customers. */
export default function DashboardPage() {
  return (
    <CanAccess resource="dashboard" action="list" fallback={<RedirectTo href="/customers" />}>
      <Dashboard />
    </CanAccess>
  )
}
