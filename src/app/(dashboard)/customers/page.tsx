'use client'

import { useRouter } from 'next/navigation'
import { CreateButton, DeleteButton, EditButton, List, ShowButton, getDefaultSortOrder, useTable } from '@refinedev/antd'
import type { CrudFilter, HttpError } from '@refinedev/core'
import { Empty, Form, Grid, Input, Result, Space, Table, Tag, Typography } from 'antd'
import { SearchOutlined, TeamOutlined } from '@ant-design/icons'
import { useDebouncedCallback } from 'use-debounce'
import dayjs from 'dayjs'
import { CardWithTitle } from '@/components/refine/card-with-title'
import { deleteNotifications } from '@/components/customers/customer-form-fields'
import { CUSTOMERS, CUSTOMER_LIST_SELECT, orderCount, type CustomerRow } from '@/components/customers/types'

const PAGE_SIZE = 20

interface SearchValues {
  q?: string
}

/**
 * Name (case-insensitive) or phone contains the term, like GET /api/customers?q=.
 * Runs server-side as a Supabase or() filter; an empty term clears it.
 */
const searchFilters = ({ q }: SearchValues): CrudFilter[] => {
  const term = q?.trim() ?? ''
  return [
    {
      key: 'search',
      operator: 'or',
      value: term
        ? [
            { field: 'name', operator: 'contains', value: term },
            { field: 'phone', operator: 'containss', value: term },
          ]
        : [],
    },
  ]
}

export default function CustomersPage() {
  const router = useRouter()
  const { tableProps, searchFormProps, sorters, tableQuery, result } = useTable<CustomerRow, HttpError, SearchValues>({
    resource: CUSTOMERS,
    pagination: { pageSize: PAGE_SIZE },
    sorters: { initial: [{ field: 'created_at', order: 'desc' }] },
    meta: { select: CUSTOMER_LIST_SELECT },
    onSearch: searchFilters,
    syncWithLocation: false,
  })

  const submitSearch = useDebouncedCallback(() => searchFormProps.form?.submit(), 300)
  const total = result.total ?? 0
  // Phones: the search sits above the card at full width instead of in its header.
  const compact = !Grid.useBreakpoint().md

  const search = (
    <Form {...searchFormProps} layout="inline" style={{ margin: 0, marginBottom: compact ? 16 : 0 }}>
      <Form.Item name="q" noStyle>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search by name or phone"
          aria-label="Search customers"
          style={{ width: compact ? '100%' : 280 }}
          onChange={submitSearch}
        />
      </Form.Item>
    </Form>
  )

  return (
    <List
      title="Customers"
      headerButtons={<CreateButton>New Customer</CreateButton>}
      contentProps={{ style: { background: 'transparent', boxShadow: 'none', padding: 0 } }}
    >
      {compact && search}
      <CardWithTitle
        icon={<TeamOutlined />}
        title={`All Customers (${total})`}
        action={compact ? undefined : search}
        styles={{ body: { padding: 0 } }}
      >
        {tableQuery.isError && !tableQuery.data ? (
          <Result
            status="warning"
            title="Couldn't load customers"
            subTitle={tableQuery.error?.message}
            extra={<a onClick={() => tableQuery.refetch()}>Retry</a>}
          />
        ) : (
          <Table<CustomerRow>
            {...tableProps}
            rowKey="id"
            scroll={{ x: 760 }}
            pagination={{
              ...tableProps.pagination,
              showSizeChanger: false,
              showTotal: (count) => `${count} total`,
              style: { paddingInline: 16 },
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={searchFormProps.form?.getFieldValue('q') ? 'No customers match your search.' : 'No customers yet.'}
                />
              ),
            }}
            onRow={(record) => ({
              onClick: () => router.push(`/customers/show/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          >
            <Table.Column<CustomerRow>
              dataIndex="name"
              title="Name"
              sorter
              defaultSortOrder={getDefaultSortOrder('name', sorters)}
              render={(value: string) => <Typography.Text strong>{value}</Typography.Text>}
            />
            <Table.Column<CustomerRow>
              dataIndex="phone"
              title="Phone"
              onCell={() => ({ style: { whiteSpace: 'nowrap' } })}
              render={(value: string) => <Typography.Text style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>{value}</Typography.Text>}
            />
            <Table.Column<CustomerRow>
              dataIndex="address"
              title="Address"
              ellipsis
              render={(value: string | null) => <Typography.Text type="secondary">{value || 'No address'}</Typography.Text>}
            />
            <Table.Column<CustomerRow>
              key="orders"
              title="Orders"
              render={(_, record) => {
                const count = orderCount(record)
                return <Tag color={count > 0 ? 'blue' : 'default'}>{count} order{count !== 1 ? 's' : ''}</Tag>
              }}
            />
            <Table.Column<CustomerRow>
              dataIndex="created_at"
              title="Created"
              sorter
              defaultSortOrder={getDefaultSortOrder('created_at', sorters)}
              render={(value: string) => <Typography.Text type="secondary">{dayjs(value).format('MMM D, YYYY')}</Typography.Text>}
            />
            <Table.Column<CustomerRow>
              key="actions"
              title="Actions"
              fixed="right"
              render={(_, record) => (
                <Space onClick={(e) => e.stopPropagation()}>
                  <ShowButton hideText size="small" recordItemId={record.id} />
                  <EditButton hideText size="small" recordItemId={record.id} />
                  <DeleteButton
                    hideText
                    size="small"
                    recordItemId={record.id}
                    confirmTitle={`Delete ${record.name}? This action cannot be undone.`}
                    confirmOkText="Delete"
                    {...deleteNotifications}
                  />
                </Space>
              )}
            />
          </Table>
        )}
      </CardWithTitle>
    </List>
  )
}
