'use client'

import { useParams } from 'next/navigation'
import { Show } from '@refinedev/antd'
import { useList, useShow, type HttpError } from '@refinedev/core'
import { Col, Descriptions, Empty, List as AntdList, Result, Row, Space, Statistic, Tag, Typography, theme } from 'antd'
import {
  CalendarOutlined,
  ColumnHeightOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  ShoppingOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { CardWithTitle } from '@/components/refine/card-with-title'
import { deleteNotifications } from '@/components/customers/customer-form-fields'
import { CUSTOMERS, type CustomerRow } from '@/components/customers/types'

interface CustomerOrder {
  id: string
  order_number: string
  booking_date: string
  delivery_date: string
  status?: string | null
  total_amount?: number | null
  advance_paid?: number | null
  balance?: number | null
  payment_method?: string | null
  comments?: string | null
}

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
    pagination: { pageSize: 100 },
    meta: {
      select: 'id, order_number, booking_date, delivery_date, status, total_amount, advance_paid, balance, payment_method, comments',
    },
    queryOptions: { enabled: !!id },
  })
  const { result: measurements, query: measurementsQuery } = useList<{ id: string }, HttpError>({
    resource: 'measurements',
    filters: [{ field: 'customer_id', operator: 'eq', value: id }],
    pagination: { pageSize: 1 },
    meta: { select: 'id' },
    queryOptions: { enabled: !!id },
  })

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
  const totalRevenue = list.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const totalPaid = list.reduce((sum, o) => sum + (o.advance_paid || 0), 0)
  const totalBalance = list.reduce((sum, o) => sum + (o.balance || 0), 0)

  return (
    <Show
      title={customer?.name ?? 'Customer'}
      isLoading={query.isLoading}
      recordItemId={id}
      deleteButtonProps={deleteProps}
      contentProps={{ style: { background: 'transparent', boxShadow: 'none', padding: 0 } }}
    >
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
              <Statistic value={list.length} loading={ordersQuery.isLoading} />
            </CardWithTitle>
          </Col>
          <Col xs={12} lg={6} xl={5}>
            <CardWithTitle icon={<DollarOutlined />} title="Revenue">
              <Statistic value={totalRevenue} prefix="PKR" loading={ordersQuery.isLoading} />
            </CardWithTitle>
          </Col>
          <Col xs={12} lg={6} xl={5}>
            <CardWithTitle icon={<DollarOutlined />} title="Paid">
              <Statistic value={totalPaid} prefix="PKR" valueStyle={{ color: token.colorSuccess }} loading={ordersQuery.isLoading} />
            </CardWithTitle>
          </Col>
          <Col xs={12} lg={6} xl={5}>
            <CardWithTitle icon={<DollarOutlined />} title="Balance">
              <Statistic value={totalBalance} prefix="PKR" valueStyle={{ color: token.colorWarning }} loading={ordersQuery.isLoading} />
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

        <CardWithTitle icon={<ShoppingOutlined />} title="Orders History">
          {ordersQuery.isError ? (
            <Result status="warning" title="Couldn't load orders" subTitle={ordersQuery.error?.message} />
          ) : (
            <AntdList<CustomerOrder>
              loading={ordersQuery.isLoading}
              dataSource={list}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No orders found" /> }}
              renderItem={(order) => (
                <AntdList.Item
                  extra={
                    <Space direction="vertical" align="end" size={4}>
                      <Typography.Text strong>{pkr(order.total_amount || 0)}</Typography.Text>
                      {!!order.balance && order.balance > 0 && <Tag color="orange">{pkr(order.balance)} pending</Tag>}
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
                          {pkr(order.advance_paid || 0)}
                        </span>
                        {order.comments && <Typography.Text type="secondary">{order.comments}</Typography.Text>}
                      </Space>
                    }
                  />
                </AntdList.Item>
              )}
            />
          )}
        </CardWithTitle>
      </Space>
    </Show>
  )
}
