'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreateButton, List, getDefaultSortOrder, useTable } from '@refinedev/antd'
import { useCan, type CrudFilter, type CrudSort, type HttpError } from '@refinedev/core'
import { Button, Card, Form, Input, Space, Tag, Typography } from 'antd'
import { PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { FilterBar, DateRangeFilter, dateRangeItemProps } from '@/components/refine/filter-bar'
import { ResourceTable, type ResourceColumn } from '@/components/refine/resource-table'
import { RowActions } from '@/components/refine/row-actions'
import { transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { deleteNotifications } from '@/components/customers/customer-form-fields'
import { CUSTOMERS, CUSTOMER_LIST_SELECT, orderCount, type CustomerRow } from '@/components/customers/types'

const PAGE_SIZE = 20

interface SearchValues {
  /** Name or phone contains (virtual filter "q"). */
  q?: string
  /** [startIso, endIso] (virtual filter "created_range"). */
  created_range?: [string, string]
}

/**
 * Filter-form values -> filters. The field names are the data provider's
 * virtual filters, so Refine's URL sync restores the form as typed.
 */
const toFilters = ({ q, created_range }: SearchValues): CrudFilter[] => [
  { field: 'q', operator: 'contains', value: q?.trim() || undefined },
  { field: 'created_range', operator: 'between', value: created_range },
]

const mono = { fontFamily: 'var(--font-geist-mono), monospace' }

function customerColumns(sorters: CrudSort[]): ResourceColumn<CustomerRow>[] {
  return [
    {
      key: 'name',
      dataIndex: 'name',
      title: 'Name',
      sorter: true,
      defaultSortOrder: getDefaultSortOrder('name', sorters),
      width: 200,
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    {
      key: 'phone',
      dataIndex: 'phone',
      title: 'Phone',
      width: 170,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (value: string) => <Typography.Text style={mono}>{value}</Typography.Text>,
    },
    {
      key: 'address',
      dataIndex: 'address',
      title: 'Address',
      ellipsis: true,
      width: 240,
      render: (value: string | null) => <Typography.Text type="secondary">{value || 'No address'}</Typography.Text>,
    },
    {
      key: 'orders',
      title: 'Orders',
      width: 110,
      render: (_, record) => {
        const count = orderCount(record)
        return <Tag color={count > 0 ? 'blue' : 'default'}>{count} order{count !== 1 ? 's' : ''}</Tag>
      },
    },
    {
      key: 'created_at',
      dataIndex: 'created_at',
      title: 'Created',
      sorter: true,
      defaultSortOrder: getDefaultSortOrder('created_at', sorters),
      width: 140,
      render: (value: string) => <Typography.Text type="secondary">{dayjs(value).format('MMM D, YYYY')}</Typography.Text>,
    },
    {
      key: 'actions',
      title: 'Actions',
      fixed: 'right',
      fixedVisible: true,
      width: 130,
      render: (_, record) => (
        <RowActions
          resource={CUSTOMERS}
          id={record.id}
          label={record.name}
          basePath="/customers"
          deleteNotifications={deleteNotifications}
        />
      ),
    },
  ]
}

export default function CustomersPage() {
  const router = useRouter()
  const { data: canCreate } = useCan({ resource: CUSTOMERS, action: 'create' })
  const { tableProps, searchFormProps, sorters, filters, tableQuery } = useTable<CustomerRow, HttpError, SearchValues>({
    resource: CUSTOMERS,
    pagination: { pageSize: PAGE_SIZE },
    sorters: { initial: [{ field: 'created_at', order: 'desc' }] },
    meta: { select: CUSTOMER_LIST_SELECT },
    onSearch: toFilters,
    syncWithLocation: true,
  })

  // Columns depend only on the initial sort; antd keeps the live sort state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => customerColumns(sorters), [])
  const filtering = filters.some((f) => 'field' in f && f.value !== undefined && f.value !== '')

  return (
    <List
      title="Customers"
      headerProps={withSubtitle('Manage all customers and their information.')}
      headerButtons={
        <CreateButton type="primary" icon={<PlusOutlined />}>
          New Customer
        </CreateButton>
      }
      contentProps={transparentContent}
    >
      <FilterBar formProps={searchFormProps} label="Customer filters">
        <Form.Item name="q" label="Name or phone">
          <Input allowClear prefix={<SearchOutlined />} placeholder="e.g. Ayesha or 0300" />
        </Form.Item>
        <Form.Item name="created_range" label="Created" {...dateRangeItemProps}>
          <DateRangeFilter aria-label="Created between" />
        </Form.Item>
      </FilterBar>

      <ResourceTable<CustomerRow>
        tableKey="customers"
        icon={<TeamOutlined />}
        title={`All Customers (${tableQuery.data?.total ?? 0})`}
        columns={columns}
        tableProps={tableProps}
        rowKey="id"
        onRefresh={() => tableQuery.refetch()}
        refreshing={tableQuery.isFetching}
        error={tableQuery.isError && !tableQuery.data ? tableQuery.error : null}
        empty={{
          description: filtering ? 'No customers match these filters.' : 'No customers yet.',
          action:
            !filtering && canCreate?.can ? (
              <Link href="/customers/create">
                <Button type="primary" icon={<PlusOutlined />}>
                  New Customer
                </Button>
              </Link>
            ) : undefined,
        }}
        onRow={(record) => ({
          onClick: () => router.push(`/customers/show/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        renderMobile={(record) => (
          <Card
            size="small"
            style={{ width: '100%' }}
            hoverable
            onClick={() => router.push(`/customers/show/${record.id}`)}
          >
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                <Typography.Text strong>{record.name}</Typography.Text>
                <Tag color={orderCount(record) > 0 ? 'blue' : 'default'}>
                  {orderCount(record)} order{orderCount(record) !== 1 ? 's' : ''}
                </Tag>
              </Space>
              <Typography.Text style={mono}>{record.phone}</Typography.Text>
              <Typography.Text type="secondary" ellipsis>
                {record.address || 'No address'}
              </Typography.Text>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginTop: 6 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(record.created_at).format('MMM D, YYYY')}
                </Typography.Text>
                <RowActions
                  resource={CUSTOMERS}
                  id={record.id}
                  label={record.name}
                  basePath="/customers"
                  deleteNotifications={deleteNotifications}
                />
              </Space>
            </Space>
          </Card>
        )}
      />
    </List>
  )
}
