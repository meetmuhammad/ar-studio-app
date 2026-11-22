'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreateButton, List, getDefaultSortOrder, useTable } from '@refinedev/antd'
import { useCan, type CrudFilter, type CrudSort, type HttpError } from '@refinedev/core'
import { Button, Card, Flex, Form, Input, Select, Space, Tag, Tooltip, Typography } from 'antd'
import { CheckCircleFilled, CloseCircleOutlined, PlusOutlined, SearchOutlined, ShoppingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { DateRangeFilter, FilterBar, dateRangeItemProps } from '@/components/refine/filter-bar'
import { ResourceTable, type ResourceColumn } from '@/components/refine/resource-table'
import { RowActions } from '@/components/refine/row-actions'
import { transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { deleteNotificationsFor } from '@/lib/refine/notifications'
import {
  ORDERS,
  ORDER_LIST_SELECT,
  ORDER_STATUSES,
  PAYMENT_STATUS_COLOR,
  STATUS_COLOR,
  paymentSummary,
  pkr,
  type OrderRow,
} from '@/components/orders/constants'

const PAGE_SIZE = 20
const ALL = 'all'
const orderDeleteNotifications = deleteNotificationsFor('Order')
const DELETE_DETAIL = 'Its items, payments and their ledger entries are removed too. This cannot be undone.'

interface SearchValues {
  /** Order number, or customer name / phone (virtual filter "q"). */
  q?: string
  status?: string
  delivery_range?: [string, string]
  booking_range?: [string, string]
}

const toFilters = ({ q, status, delivery_range, booking_range }: SearchValues): CrudFilter[] => [
  { field: 'q', operator: 'contains', value: q?.trim() || undefined },
  { field: 'status', operator: 'eq', value: status && status !== ALL ? status : undefined },
  { field: 'delivery_range', operator: 'between', value: delivery_range },
  { field: 'booking_range', operator: 'between', value: booking_range },
]

const mono = { fontFamily: 'var(--font-geist-mono), monospace' }
const day = (value?: string | null) => (value ? dayjs(value).format('MMM D, YYYY') : '—')

function PaymentCell({ order }: { order: OrderRow }) {
  const s = paymentSummary(order, order.payments)
  return (
    <Tooltip title={`Paid ${pkr(s.paid)} · Balance ${pkr(s.balance)}`}>
      <Tag color={PAYMENT_STATUS_COLOR[s.status]}>{s.status}</Tag>
    </Tooltip>
  )
}

function orderColumns(sorters: CrudSort[]): ResourceColumn<OrderRow>[] {
  return [
    {
      key: 'order_number',
      dataIndex: 'order_number',
      title: 'Order #',
      width: 120,
      render: (value: string) => <Typography.Text strong style={mono}>{value}</Typography.Text>,
    },
    {
      key: 'customer',
      title: 'Customer',
      width: 200,
      render: (_, o) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{o.customers?.name}</Typography.Text>
          <Typography.Text type="secondary" style={mono}>
            {o.customers?.phone}
          </Typography.Text>
        </Space>
      ),
    },
    {
      key: 'booking_date',
      dataIndex: 'booking_date',
      title: 'Booking Date',
      sorter: true,
      defaultSortOrder: getDefaultSortOrder('booking_date', sorters),
      width: 140,
      defaultHidden: true,
      render: (value: string) => day(value),
    },
    {
      key: 'delivery_date',
      dataIndex: 'delivery_date',
      title: 'Delivery Date',
      sorter: true,
      defaultSortOrder: getDefaultSortOrder('delivery_date', sorters),
      width: 140,
      render: (value: string | null, o) => {
        const late = value && o.status === 'In Process' && dayjs(value).isBefore(dayjs(), 'day')
        return <Typography.Text type={late ? 'danger' : undefined}>{day(value)}</Typography.Text>
      },
    },
    {
      key: 'status',
      dataIndex: 'status',
      title: 'Status',
      width: 120,
      render: (value: string) => <Tag color={STATUS_COLOR[value]}>{value}</Tag>,
    },
    {
      key: 'total_amount',
      dataIndex: 'total_amount',
      title: 'Total Amount',
      align: 'right',
      width: 150,
      render: (value: number | null) => <Typography.Text strong>{pkr(value || 0)}</Typography.Text>,
    },
    { key: 'payment', title: 'Payment', width: 110, render: (_, o) => <PaymentCell order={o} /> },
    {
      key: 'measurements',
      title: 'Measurements',
      width: 130,
      defaultHidden: true,
      render: (_, o) =>
        o.measurement_id ? (
          <CheckCircleFilled style={{ color: 'var(--ant-color-success, #52c41a)' }} aria-label="Linked" />
        ) : (
          <CloseCircleOutlined aria-label="None" />
        ),
    },
    {
      key: 'comments',
      dataIndex: 'comments',
      title: 'Comments',
      ellipsis: true,
      width: 220,
      defaultHidden: true,
      render: (value: string | null) => <Typography.Text type="secondary">{value || 'No comments'}</Typography.Text>,
    },
    {
      key: 'created_at',
      dataIndex: 'created_at',
      title: 'Created',
      sorter: true,
      defaultSortOrder: getDefaultSortOrder('created_at', sorters),
      width: 130,
      defaultHidden: true,
      render: (value: string) => day(value),
    },
    {
      key: 'actions',
      title: 'Actions',
      fixed: 'right',
      fixedVisible: true,
      width: 130,
      render: (_, o) => (
        <RowActions
          resource={ORDERS}
          id={o.id}
          label={`order ${o.order_number}`}
          basePath="/orders"
          deleteDescription={DELETE_DETAIL}
          deleteNotifications={orderDeleteNotifications}
        />
      ),
    },
  ]
}

export default function OrdersPage() {
  const router = useRouter()
  const { data: canCreate } = useCan({ resource: ORDERS, action: 'create' })
  const { tableProps, searchFormProps, sorters, filters, tableQuery } = useTable<OrderRow, HttpError, SearchValues>({
    resource: ORDERS,
    pagination: { pageSize: PAGE_SIZE },
    // Previous default: nearest delivery first, In Process only.
    sorters: { initial: [{ field: 'delivery_date', order: 'asc' }] },
    filters: { initial: [{ field: 'status', operator: 'eq', value: 'In Process' }] },
    meta: { select: ORDER_LIST_SELECT },
    onSearch: toFilters,
    syncWithLocation: true,
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => orderColumns(sorters), [])
  const filtering = filters.some((f) => 'field' in f && f.field !== 'status' && f.value !== undefined && f.value !== '')

  return (
    <List
      title="Orders"
      headerProps={withSubtitle('Manage all orders, measurements and payments.')}
      headerButtons={
        <CreateButton type="primary" icon={<PlusOutlined />}>
          New Order
        </CreateButton>
      }
      contentProps={transparentContent}
    >
      <FilterBar
        formProps={{
          ...searchFormProps,
          // Searching looks across every status, as before.
          onValuesChange: (changed: Partial<SearchValues>) => {
            if (changed.q?.trim()) searchFormProps.form?.setFieldValue('status', ALL)
          },
        }}
        label="Order filters"
      >
        <Form.Item name="q" label="Order number or customer">
          <Input allowClear prefix={<SearchOutlined />} placeholder="e.g. AR-00042, Ayesha or 0300" />
        </Form.Item>
        <Form.Item name="status" label="Status" initialValue="In Process">
          <Select
            aria-label="Status"
            options={[{ value: ALL, label: 'All Orders' }, ...ORDER_STATUSES.map((s) => ({ value: s, label: s }))]}
          />
        </Form.Item>
        <Form.Item name="delivery_range" label="Delivery date" {...dateRangeItemProps}>
          <DateRangeFilter aria-label="Delivery between" />
        </Form.Item>
        <Form.Item name="booking_range" label="Booking date" {...dateRangeItemProps}>
          <DateRangeFilter aria-label="Booked between" />
        </Form.Item>
      </FilterBar>

      <ResourceTable<OrderRow>
        tableKey="orders"
        icon={<ShoppingOutlined />}
        title={`All Orders (${tableQuery.data?.total ?? 0})`}
        columns={columns}
        tableProps={tableProps}
        rowKey="id"
        onRefresh={() => tableQuery.refetch()}
        refreshing={tableQuery.isFetching}
        error={tableQuery.isError && !tableQuery.data ? tableQuery.error : null}
        empty={{
          description: filtering ? 'No orders match these filters.' : 'No orders found.',
          action:
            !filtering && canCreate?.can ? (
              <Link href="/orders/create">
                <Button type="primary" icon={<PlusOutlined />}>
                  New Order
                </Button>
              </Link>
            ) : undefined,
        }}
        onRow={(o) => ({ onClick: () => router.push(`/orders/show/${o.id}`), style: { cursor: 'pointer' } })}
        renderMobile={(o) => (
          <Card size="small" hoverable style={{ width: '100%' }} onClick={() => router.push(`/orders/show/${o.id}`)}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Flex justify="space-between" align="start" gap={8}>
                <Typography.Text strong style={mono}>
                  {o.order_number}
                </Typography.Text>
                <Tag color={STATUS_COLOR[o.status]} style={{ marginInlineEnd: 0 }}>
                  {o.status}
                </Tag>
              </Flex>
              <Typography.Text>{o.customers?.name}</Typography.Text>
              <Flex justify="space-between" gap={8}>
                <Typography.Text type="secondary">Delivery {day(o.delivery_date)}</Typography.Text>
                <Typography.Text strong>{pkr(o.total_amount || 0)}</Typography.Text>
              </Flex>
              <Flex justify="space-between" align="center">
                <PaymentCell order={o} />
                <RowActions
                  resource={ORDERS}
                  id={o.id}
                  label={`order ${o.order_number}`}
                  basePath="/orders"
                  deleteDescription={DELETE_DETAIL}
                  deleteNotifications={orderDeleteNotifications}
                />
              </Flex>
            </Space>
          </Card>
        )}
      />
    </List>
  )
}
