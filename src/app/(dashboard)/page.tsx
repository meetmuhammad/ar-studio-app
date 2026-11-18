'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CanAccess, useList, type BaseRecord, type CrudFilter, type HttpError } from '@refinedev/core'
import { Button, Col, Empty, Flex, List as AntdList, Row, Spin, Typography, theme } from 'antd'
import { ArrowRightOutlined, DollarOutlined, ShoppingOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { KpiCard, type SparkPoint } from '@/components/refine/kpi-card'
import { CardWithTitle } from '@/components/refine/card-with-title'
import { useBusinessLabel } from '@/contexts/business-context'
import type { CustomerRow } from '@/components/customers/types'

/**
 * Admin dashboard (Refine + antd). Every number is read straight from the
 * Supabase tables through the business-scoped data provider, so it follows
 * the selected business (or all of them in the combined view).
 *
 * Sparklines cover the last 6 calendar months. Their rows are fetched without
 * pagination, so a month series is capped by the PostgREST row limit
 * (1000 by default); the headline counts use exact counts and are not.
 */

const MONTHS = 6

function monthStarts(): Dayjs[] {
  const first = dayjs().startOf('month').subtract(MONTHS - 1, 'month')
  return Array.from({ length: MONTHS }, (_, i) => first.add(i, 'month'))
}

/** Exact row count for a scoped table (head-only count via Content-Range). */
function useCount(resource: string) {
  const { result, query } = useList<BaseRecord, HttpError>({
    resource,
    pagination: { currentPage: 1, pageSize: 1 },
    meta: { select: 'id' },
  })
  return { total: result.total ?? 0, isLoading: query.isLoading, isError: query.isError }
}

/** Per-month series of a date column: row count, or the sum of `sumField`. */
function useMonthly(resource: string, dateField: string, sumField?: string) {
  const months = monthStarts()
  const filters: CrudFilter[] = [{ field: dateField, operator: 'gte', value: months[0].format('YYYY-MM-DD') }]
  const { result, query } = useList<Record<string, unknown>, HttpError>({
    resource,
    filters,
    pagination: { mode: 'off' },
    meta: { select: sumField ? `${dateField}, ${sumField}` : dateField },
  })
  const rows = result.data ?? []
  const series: SparkPoint[] = months.map((month) => {
    const inMonth = rows.filter((row) => dayjs(row[dateField] as string).isSame(month, 'month'))
    return {
      label: month.format('MMM YYYY'),
      value: sumField ? inMonth.reduce((sum, row) => sum + Number(row[sumField] ?? 0), 0) : inMonth.length,
    }
  })
  return { series, sum: series.reduce((s, p) => s + p.value, 0), isLoading: query.isLoading }
}

const pkr = (value: number) => `PKR ${Math.round(value).toLocaleString()}`

function RedirectTo({ href }: { href: string }) {
  const router = useRouter()
  useEffect(() => router.replace(href), [href, router])
  return (
    <Flex justify="center" style={{ padding: 64 }}>
      <Spin />
    </Flex>
  )
}

function DashboardContent() {
  const { token } = theme.useToken()
  const businessLabel = useBusinessLabel()

  const customers = useCount('customers')
  const orders = useCount('orders')
  const customerSeries = useMonthly('customers', 'created_at')
  const orderSeries = useMonthly('orders', 'created_at')
  const payments = useMonthly('payments', 'payment_date', 'amount')

  const { result: latest, query: latestQuery } = useList<CustomerRow, HttpError>({
    resource: 'customers',
    sorters: [{ field: 'created_at', order: 'desc' }],
    pagination: { currentPage: 1, pageSize: 5 },
    meta: { select: 'id, name, phone, created_at' },
  })

  return (
    <Flex vertical gap={24}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Typography.Title>
        <Typography.Text type="secondary">{businessLabel}</Typography.Text>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} md={8}>
          <KpiCard
            icon={<TeamOutlined />}
            title="Customers"
            value={customers.isError ? '—' : customers.total.toLocaleString()}
            color={token.colorPrimary}
            loading={customers.isLoading}
            data={customerSeries.series}
            formatValue={(v) => `${v} new`}
          />
        </Col>
        <Col xs={24} md={8}>
          <KpiCard
            icon={<ShoppingOutlined />}
            title="Orders"
            value={orders.isError ? '—' : orders.total.toLocaleString()}
            color={token.colorSuccess}
            loading={orders.isLoading}
            data={orderSeries.series}
            formatValue={(v) => `${v} orders`}
          />
        </Col>
        <Col xs={24} md={8}>
          <KpiCard
            icon={<DollarOutlined />}
            title={`Payments received (${MONTHS} months)`}
            value={pkr(payments.sum)}
            color={token.colorWarning}
            loading={payments.isLoading}
            data={payments.series}
            formatValue={pkr}
          />
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={14}>
          <CardWithTitle
            icon={<TeamOutlined />}
            title="Latest customers"
            action={
              <Link href="/customers">
                <Button icon={<ArrowRightOutlined />}>See all customers</Button>
              </Link>
            }
          >
            <AntdList<CustomerRow>
              loading={latestQuery.isLoading}
              dataSource={latest.data}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No customers yet." /> }}
              renderItem={(c) => (
                <AntdList.Item extra={<Typography.Text type="secondary">{dayjs(c.created_at).format('MMM D, YYYY')}</Typography.Text>}>
                  <AntdList.Item.Meta
                    title={<Link href={`/customers/show/${c.id}`}>{c.name}</Link>}
                    description={c.phone}
                  />
                </AntdList.Item>
              )}
            />
          </CardWithTitle>
        </Col>
        <Col xs={24} lg={10}>
          <CardWithTitle icon={<DollarOutlined />} title="Classic overview">
            <Typography.Paragraph type="secondary">
              Revenue trend, collection rate and upcoming deliveries from the previous dashboard.
            </Typography.Paragraph>
            <Link href="/overview">
              <Button type="primary" ghost icon={<ArrowRightOutlined />}>
                Open classic overview
              </Button>
            </Link>
          </CardWithTitle>
        </Col>
      </Row>
    </Flex>
  )
}

/** Admin-only, like before: other roles are sent to /customers. */
export default function DashboardPage() {
  return (
    <CanAccess resource="dashboard" action="list" fallback={<RedirectTo href="/customers" />}>
      <DashboardContent />
    </CanAccess>
  )
}
