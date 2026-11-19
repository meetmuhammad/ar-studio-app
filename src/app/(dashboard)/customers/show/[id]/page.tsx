'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Show } from '@refinedev/antd'
import { useCan, useList, useShow, type HttpError } from '@refinedev/core'
import {
  Button,
  Col,
  Descriptions,
  Empty,
  List as AntdList,
  Result,
  Row,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import {
  CalendarOutlined,
  ColumnHeightOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  PlusOutlined,
  ShoppingOutlined,
  StarFilled,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { CardWithTitle } from '@/components/refine/card-with-title'
import { PageSkeleton, transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { MEASUREMENTS, formatReading, type MeasurementRow } from '@/components/measurements/types'
import { deleteNotifications } from '@/components/customers/customer-form-fields'
import { CUSTOMERS, type CustomerRow } from '@/components/customers/types'
import { paymentSummary } from '@/components/orders/constants'
import { useCustomerOrderSummary } from '@/lib/refine/reporting'

interface CustomerOrder {
  id: string
  order_number: string
  booking_date: string
  delivery_date: string
  status?: string | null
  total_amount?: number | null
  advance_paid?: number | null
  payment_method?: string | null
  comments?: string | null
  payments?: { amount: number }[]
}

/** Orders listed on the page; the totals above cover every order. */
const ORDER_LIST_LIMIT = 100

const pkr = (value: number) => `PKR ${value.toLocaleString()}`
const day = (value: string) => dayjs(value).format('MMM D, YYYY')

export default function CustomerShowPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = theme.useToken()

  const { query } = useShow<CustomerRow, HttpError>({ resource: CUSTOMERS, id })
  const customer = query.data?.data

  // Both reads go through the business-scoped Supabase data provider.
  const { result: orders, query: ordersQuery } = useList<CustomerOrder, HttpError>({
    resource: 'orders',
    filters: [{ field: 'customer_id', operator: 'eq', value: id }],
    sorters: [{ field: 'booking_date', order: 'desc' }],
    pagination: { pageSize: ORDER_LIST_LIMIT },
    meta: {
      select:
        'id, order_number, booking_date, delivery_date, status, total_amount, advance_paid, payment_method, comments, payments(amount)',
    },
    queryOptions: { enabled: !!id },
  })
  const { result: measurements, query: measurementsQuery } = useList<MeasurementRow, HttpError>({
    resource: MEASUREMENTS,
    filters: [{ field: 'customer_id', operator: 'eq', value: id }],
    sorters: [{ field: 'created_at', order: 'desc' }],
    pagination: { pageSize: 50 },
    meta: { select: 'id, name, is_default, created_at, chest, waist, shoulder, sleeves' },
    queryOptions: { enabled: !!id },
  })
  // Totals over EVERY order of the customer, summed in SQL (the list below
  // shows at most ORDER_LIST_LIMIT orders).
  const summary = useCustomerOrderSummary(id)
  const totals = summary.data
  const totalsLoading = summary.isLoading
  const { data: canAddMeasurement } = useCan({ resource: MEASUREMENTS, action: 'create' })
  const newMeasurementHref = `/measurements/create?customer_id=${id}`
  const newMeasurement = canAddMeasurement?.can ? (
    <Link href={newMeasurementHref}>
      <Button icon={<PlusOutlined />}>New measurement</Button>
    </Link>
  ) : (
    <Tooltip title={canAddMeasurement?.reason}>
      <Button icon={<PlusOutlined />} disabled>
        New measurement
      </Button>
    </Tooltip>
  )

  const deleteProps = {
    confirmTitle: `Delete ${customer?.name ?? 'customer'}? This action cannot be undone.`,
    confirmOkText: 'Delete',
    ...deleteNotifications,
  }

  if (query.isError) {
    const notFound = query.error?.statusCode === 404
    return (
      <Show title="Customer" headerButtons={() => null}>
        <Result
          status={notFound ? '404' : 'warning'}
          title={notFound ? 'Customer not found in this business.' : "Couldn't load customer"}
          subTitle={notFound ? undefined : query.error?.message}
        />
      </Show>
    )
  }

  const list = orders.data ?? []
  const totalOf = (value: number | undefined) => (summary.isError ? '—' : Number(value ?? 0))

  return (
    <Show
      title={customer?.name ?? 'Customer'}
      headerProps={withSubtitle(customer?.phone)}
      recordItemId={id}
      deleteButtonProps={deleteProps}
      contentProps={transparentContent}
    >
      {query.isLoading ? (
        <PageSkeleton sections={3} />
      ) : (
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <CardWithTitle icon={<UserOutlined />} title="Customer Information">
          {customer && (
            <Descriptions column={{ xs: 1, md: 2 }} colon={false}>
              <Descriptions.Item label={<PhoneOutlined />}>
                <Typography.Text copyable style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
                  {customer.phone}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label={<CalendarOutlined />}>Joined {day(customer.created_at)}</Descriptions.Item>
              {customer.address && (
                <Descriptions.Item label={<EnvironmentOutlined />} span={2}>
                  {customer.address}
                </Descriptions.Item>
              )}
            </Descriptions>
          )}
        </CardWithTitle>

        <Row gutter={[16, 16]}>
          <Col xs={12} lg={6} xl={4}>
            <CardWithTitle icon={<ShoppingOutlined />} title="Orders">
              <Statistic value={totalOf(totals?.orders)} loading={totalsLoading} />
            </CardWithTitle>
          </Col>
          <Col xs={12} lg={6} xl={5}>
            <CardWithTitle icon={<DollarOutlined />} title="Revenue">
              <Statistic value={totalOf(totals?.revenue)} prefix="PKR" loading={totalsLoading} />
            </CardWithTitle>
          </Col>
          <Col xs={12} lg={6} xl={5}>
            <CardWithTitle icon={<DollarOutlined />} title="Received">
              <Statistic
                value={totalOf(totals?.received.total)}
                prefix="PKR"
                valueStyle={{ color: token.colorSuccess }}
                loading={totalsLoading}
              />
            </CardWithTitle>
          </Col>
          <Col xs={12} lg={6} xl={5}>
            <CardWithTitle icon={<DollarOutlined />} title="Outstanding">
              <Statistic
                value={totalOf(totals?.outstanding)}
                prefix="PKR"
                valueStyle={{ color: token.colorWarning }}
                loading={totalsLoading}
              />
            </CardWithTitle>
          </Col>
          <Col xs={24} lg={24} xl={5}>
            <CardWithTitle icon={<ColumnHeightOutlined />} title="Measurements">
              <Statistic
                value={measurementsQuery.isError ? '—' : measurements.total ?? 0}
                loading={measurementsQuery.isLoading}
              />
            </CardWithTitle>
          </Col>
        </Row>

        <CardWithTitle icon={<ColumnHeightOutlined />} title="Measurements" action={newMeasurement}>
          {measurementsQuery.isError ? (
            <Result status="warning" title="Couldn't load measurements" subTitle={measurementsQuery.error?.message} />
          ) : (
            <AntdList<MeasurementRow>
              loading={measurementsQuery.isLoading}
              dataSource={measurements.data ?? []}
              locale={{
                emptyText: (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No measurements yet.">
                    {canAddMeasurement?.can && (
                      <Link href={newMeasurementHref}>
                        <Button type="primary" icon={<PlusOutlined />}>
                          New measurement
                        </Button>
                      </Link>
                    )}
                  </Empty>
                ),
              }}
              renderItem={(m) => (
                <AntdList.Item
                  extra={<Typography.Text type="secondary">{day(m.created_at)}</Typography.Text>}
                >
                  <AntdList.Item.Meta
                    title={
                      <Space size={8} wrap>
                        <Link href={`/measurements/show/${m.id}`}>{m.name}</Link>
                        {m.is_default && (
                          <Tag icon={<StarFilled />} color="gold">
                            Default
                          </Tag>
                        )}
                      </Space>
                    }
                    description={(['chest', 'waist', 'shoulder', 'sleeves'] as const)
                      .map((key) => `${key.charAt(0).toUpperCase()}${key.slice(1)} ${formatReading(m, key)}`)
                      .join(' · ')}
                  />
                </AntdList.Item>
              )}
            />
          )}
        </CardWithTitle>

        <CardWithTitle icon={<ShoppingOutlined />} title="Orders History">
          {ordersQuery.isError ? (
            <Result status="warning" title="Couldn't load orders" subTitle={ordersQuery.error?.message} />
          ) : (
            <AntdList<CustomerOrder>
              loading={ordersQuery.isLoading}
              dataSource={list}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No orders found" /> }}
              footer={
                totals && totals.orders > list.length ? (
                  <Typography.Text type="secondary">
                    Showing the latest {list.length} of {Number(totals.orders).toLocaleString()} orders. The totals above include all of them.
                  </Typography.Text>
                ) : undefined
              }
              renderItem={(order) => {
                // Per order, as the order pages: paid = advance + payments.
                const money = paymentSummary(order, order.payments)
                const pending = order.status !== 'Cancelled' && money.balance > 0
                return (
                  <AntdList.Item
                    extra={
                      <Space direction="vertical" align="end" size={4}>
                        <Typography.Text strong>{pkr(money.total)}</Typography.Text>
                        {pending && <Tag color="orange">{pkr(money.balance)} pending</Tag>}
                      </Space>
                    }
                  >
                    <AntdList.Item.Meta
                      title={
                        <Space size={8} wrap>
                          <span>{order.order_number}</span>
                          {order.status && <Tag>{order.status}</Tag>}
                          {order.payment_method && <Tag color="blue">{order.payment_method}</Tag>}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={2}>
                          <span>
                            Booking: {day(order.booking_date)} • Delivery: {day(order.delivery_date)} • Paid:{' '}
                            {pkr(money.paid)}
                          </span>
                          {order.comments && <Typography.Text type="secondary">{order.comments}</Typography.Text>}
                        </Space>
                      }
                    />
                  </AntdList.Item>
                )
              }}
            />
          )}
        </CardWithTitle>
      </Space>
      )}
    </Show>
  )
}
