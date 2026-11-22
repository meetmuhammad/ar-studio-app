'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreateButton, List, getDefaultSortOrder, useTable } from '@refinedev/antd'
import { useCan, type CrudFilter, type CrudSort, type HttpError } from '@refinedev/core'
import { Button, Card, Form, Input, Space, Tag, Typography } from 'antd'
import { ColumnHeightOutlined, PlusOutlined, SearchOutlined, StarFilled, UserOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { DateRangeFilter, FilterBar, dateRangeItemProps } from '@/components/refine/filter-bar'
import { ResourceTable, type ResourceColumn } from '@/components/refine/resource-table'
import { RowActions } from '@/components/refine/row-actions'
import { transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { measurementDeleteNotifications } from '@/components/measurements/measurement-form-fields'
import { MEASUREMENTS, MEASUREMENT_SELECT, formatReading, type MeasurementRow } from '@/components/measurements/types'

const PAGE_SIZE = 20
const DELETE_DETAIL = 'This action cannot be undone and may affect related orders.'

interface SearchValues {
  /** Customer name or phone contains (virtual filter "customer"). */
  customer?: string
  /** Measurement set name contains (virtual filter "q"). */
  q?: string
  /** [startIso, endIso] (virtual filter "created_range"). */
  created_range?: [string, string]
}

const toFilters = ({ customer, q, created_range }: SearchValues): CrudFilter[] => [
  { field: 'customer', operator: 'contains', value: customer?.trim() || undefined },
  { field: 'q', operator: 'contains', value: q?.trim() || undefined },
  { field: 'created_range', operator: 'between', value: created_range },
]

const mono = { fontFamily: 'var(--font-geist-mono), monospace' }

/** Key readings, available from column settings (hidden by default). */
const READING_COLUMNS = (['chest', 'waist', 'shoulder', 'sleeves'] as const).map(
  (key): ResourceColumn<MeasurementRow> => ({
    key,
    title: key.charAt(0).toUpperCase() + key.slice(1),
    width: 100,
    defaultHidden: true,
    render: (_, record) => <Typography.Text style={mono}>{formatReading(record, key)}</Typography.Text>,
  })
)

function measurementColumns(sorters: CrudSort[]): ResourceColumn<MeasurementRow>[] {
  return [
    {
      key: 'customer',
      title: 'Customer',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.customer?.name ?? '—'}</Typography.Text>
          <Typography.Text type="secondary" style={mono}>
            {record.customer?.phone}
          </Typography.Text>
        </Space>
      ),
    },
    {
      key: 'name',
      dataIndex: 'name',
      title: 'Measurement Name',
      sorter: true,
      defaultSortOrder: getDefaultSortOrder('name', sorters),
      width: 260,
      render: (_, record) => (
        <Space size={6} wrap>
          <span>{record.name}</span>
          {record.is_default && (
            <Tag icon={<StarFilled />} color="gold">
              Default
            </Tag>
          )}
        </Space>
      ),
    },
    ...READING_COLUMNS,
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
          resource={MEASUREMENTS}
          id={record.id}
          label={record.name}
          basePath="/measurements"
          deleteDescription={DELETE_DETAIL}
          deleteNotifications={measurementDeleteNotifications}
        />
      ),
    },
  ]
}

export default function MeasurementsPage() {
  const router = useRouter()
  const { data: canCreate } = useCan({ resource: MEASUREMENTS, action: 'create' })
  const { tableProps, searchFormProps, sorters, filters, tableQuery } = useTable<MeasurementRow, HttpError, SearchValues>({
    resource: MEASUREMENTS,
    pagination: { pageSize: PAGE_SIZE },
    sorters: { initial: [{ field: 'created_at', order: 'desc' }] },
    meta: { select: MEASUREMENT_SELECT },
    onSearch: toFilters,
    syncWithLocation: true,
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => measurementColumns(sorters), [])
  const filtering = filters.some((f) => 'field' in f && f.value !== undefined && f.value !== '')

  return (
    <List
      title="Measurements"
      headerProps={withSubtitle('Manage customer body measurements for accurate tailoring.')}
      headerButtons={
        <CreateButton type="primary" icon={<PlusOutlined />}>
          New Measurement
        </CreateButton>
      }
      contentProps={transparentContent}
    >
      <FilterBar formProps={searchFormProps} label="Measurement filters">
        <Form.Item name="customer" label="Customer name or phone">
          <Input allowClear prefix={<UserOutlined />} placeholder="e.g. Ayesha or 0300" />
        </Form.Item>
        <Form.Item name="q" label="Measurement name">
          <Input allowClear prefix={<SearchOutlined />} placeholder="e.g. Formal" />
        </Form.Item>
        <Form.Item name="created_range" label="Created" {...dateRangeItemProps}>
          <DateRangeFilter aria-label="Created between" />
        </Form.Item>
      </FilterBar>

      <ResourceTable<MeasurementRow>
        tableKey="measurements"
        icon={<ColumnHeightOutlined />}
        title={`All Measurements (${tableQuery.data?.total ?? 0})`}
        columns={columns}
        tableProps={tableProps}
        rowKey="id"
        onRefresh={() => tableQuery.refetch()}
        refreshing={tableQuery.isFetching}
        error={tableQuery.isError && !tableQuery.data ? tableQuery.error : null}
        empty={{
          description: filtering ? 'No measurements match these filters.' : 'No measurements yet.',
          action:
            !filtering && canCreate?.can ? (
              <Link href="/measurements/create">
                <Button type="primary" icon={<PlusOutlined />}>
                  New Measurement
                </Button>
              </Link>
            ) : undefined,
        }}
        onRow={(record) => ({
          onClick: () => router.push(`/measurements/show/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        renderMobile={(record) => (
          <Card size="small" hoverable style={{ width: '100%' }} onClick={() => router.push(`/measurements/show/${record.id}`)}>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                <Typography.Text strong>{record.name}</Typography.Text>
                {record.is_default && (
                  <Tag icon={<StarFilled />} color="gold">
                    Default
                  </Tag>
                )}
              </Space>
              <Typography.Text>{record.customer?.name ?? '—'}</Typography.Text>
              <Typography.Text type="secondary" style={mono}>
                {record.customer?.phone}
              </Typography.Text>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginTop: 6 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(record.created_at).format('MMM D, YYYY')}
                </Typography.Text>
                <RowActions
                  resource={MEASUREMENTS}
                  id={record.id}
                  label={record.name}
                  basePath="/measurements"
                  deleteDescription={DELETE_DETAIL}
                  deleteNotifications={measurementDeleteNotifications}
                />
              </Space>
            </Space>
          </Card>
        )}
      />
    </List>
  )
}
