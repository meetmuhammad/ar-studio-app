'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreateButton, List, getDefaultSortOrder, useTable } from '@refinedev/antd'
import { useCan, type CrudFilter, type CrudSort, type HttpError } from '@refinedev/core'
import { Button, Card, Flex, Form, Input, Space, Tag, Tooltip, Typography } from 'antd'
import { PlusOutlined, SearchOutlined, ShopOutlined, TagsOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useBusiness } from '@/contexts/business-context'
import { FilterBar } from '@/components/refine/filter-bar'
import { ResourceTable, type ResourceColumn } from '@/components/refine/resource-table'
import { RowActions } from '@/components/refine/row-actions'
import { ResourceGuard } from '@/components/refine/resource-guard'
import { transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { deleteNotificationsFor } from '@/lib/refine/notifications'
import { CategorySelect } from '@/components/vendors/category-select'
import { ManageCategoriesDrawer } from '@/components/vendors/manage-categories-drawer'
import { VENDORS, VENDOR_CATEGORIES, VENDOR_SELECT, type VendorRow } from '@/components/vendors/constants'

const PAGE_SIZE = 20
const LIVE_FIELDS = ['q'] as const
const vendorDeleteNotifications = deleteNotificationsFor('Vendor')

interface SearchValues {
  /** Name, category, notes, contact or phone (virtual filter "q"). */
  q?: string
  category_id?: string
  /** Tag contains (virtual filter "tag"). */
  tag?: string
}

const toFilters = ({ q, category_id, tag }: SearchValues): CrudFilter[] => [
  { field: 'q', operator: 'contains', value: q?.trim() || undefined },
  { field: 'category_id', operator: 'eq', value: category_id || undefined },
  { field: 'tag', operator: 'contains', value: tag?.trim() || undefined },
]

function TagList({ tags }: { tags?: { id: string; tag_name: string }[] }) {
  if (!tags?.length) return <Typography.Text type="secondary">—</Typography.Text>
  return (
    <Flex wrap gap={4}>
      {tags.map((t) => (
        <Tag key={t.id} style={{ marginInlineEnd: 0 }}>
          {t.tag_name}
        </Tag>
      ))}
    </Flex>
  )
}

function vendorColumns(sorters: CrudSort[], businessName: (id?: string) => string | undefined, isAll: boolean): ResourceColumn<VendorRow>[] {
  return [
    {
      key: 'name',
      dataIndex: 'name',
      title: 'Name',
      sorter: true,
      defaultSortOrder: getDefaultSortOrder('name', sorters),
      width: 220,
      render: (_, v) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{v.name}</Typography.Text>
          {isAll && <Typography.Text type="secondary">{businessName(v.business_id)}</Typography.Text>}
        </Space>
      ),
    },
    {
      key: 'category',
      title: 'Category',
      width: 170,
      render: (_, v) =>
        v.vendor_categories ? <Tag color="blue">{v.vendor_categories.name}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    { key: 'tags', title: 'Tags', width: 220, render: (_, v) => <TagList tags={v.vendor_tags} /> },
    {
      key: 'notes',
      dataIndex: 'notes',
      title: 'Description',
      ellipsis: true,
      width: 260,
      render: (value: string | null) => <Typography.Text type={value ? undefined : 'secondary'}>{value || '—'}</Typography.Text>,
    },
    { key: 'contact_person', dataIndex: 'contact_person', title: 'Contact Person', width: 170, defaultHidden: true, render: (v) => v || '—' },
    { key: 'phone', dataIndex: 'phone', title: 'Phone', width: 160, defaultHidden: true, render: (v) => v || '—' },
    {
      key: 'created_at',
      dataIndex: 'created_at',
      title: 'Added',
      sorter: true,
      defaultSortOrder: getDefaultSortOrder('created_at', sorters),
      width: 130,
      defaultHidden: true,
      render: (value: string) => dayjs(value).format('MMM D, YYYY'),
    },
    {
      key: 'actions',
      title: 'Actions',
      fixed: 'right',
      fixedVisible: true,
      width: 130,
      render: (_, v) => (
        <RowActions resource={VENDORS} id={v.id} label={v.name} basePath="/vendors" deleteNotifications={vendorDeleteNotifications} />
      ),
    },
  ]
}

export default function VendorsPage() {
  return (
    <ResourceGuard resource={VENDORS}>
      <VendorsList />
    </ResourceGuard>
  )
}

function VendorsList() {
  const router = useRouter()
  const { isAll, businesses } = useBusiness()
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const { data: canCreate } = useCan({ resource: VENDORS, action: 'create' })
  const { data: canManageCategories } = useCan({ resource: VENDOR_CATEGORIES, action: 'edit' })
  const { tableProps, searchFormProps, sorters, filters, tableQuery } = useTable<VendorRow, HttpError, SearchValues>({
    resource: VENDORS,
    pagination: { pageSize: PAGE_SIZE },
    sorters: { initial: [{ field: 'name', order: 'asc' }] },
    meta: { select: VENDOR_SELECT },
    onSearch: toFilters,
    syncWithLocation: true,
  })

  const businessName = (id?: string) => businesses.find((b) => b.id === id)?.name
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = useMemo(() => vendorColumns(sorters, businessName, isAll), [isAll, businesses])
  const filtering = filters.some((f) => 'field' in f && f.value !== undefined && f.value !== '')

  return (
    <List
      title="Vendors"
      headerProps={withSubtitle('Manage your vendors and supplier relationships.')}
      headerButtons={
        <Space wrap>
          <Tooltip title={canManageCategories?.can === false ? canManageCategories.reason : undefined}>
            <Button icon={<TagsOutlined />} onClick={() => setCategoriesOpen(true)} disabled={canManageCategories?.can === false}>
              Manage Categories
            </Button>
          </Tooltip>
          <CreateButton type="primary" icon={<PlusOutlined />}>
            Add Vendor
          </CreateButton>
        </Space>
      }
      contentProps={transparentContent}
    >
      {/* The vendor search applies as you type, as the previous vendors list did. */}
      <FilterBar formProps={searchFormProps} label="Vendor filters" liveFields={LIVE_FIELDS}>
        <Form.Item name="q" label="Search vendors">
          <Input allowClear prefix={<SearchOutlined />} placeholder="Name, category, notes, contact or phone" />
        </Form.Item>
        <Form.Item name="category_id" label="Category">
          <CategorySelect allowClear placeholder="All categories" aria-label="Category" />
        </Form.Item>
        <Form.Item name="tag" label="Tag">
          <Input allowClear prefix={<TagsOutlined />} placeholder="e.g. fabric" />
        </Form.Item>
      </FilterBar>

      <ResourceTable<VendorRow>
        tableKey="vendors"
        icon={<ShopOutlined />}
        title={`All Vendors (${tableQuery.data?.total ?? 0})`}
        columns={columns}
        tableProps={tableProps}
        rowKey="id"
        onRefresh={() => tableQuery.refetch()}
        refreshing={tableQuery.isFetching}
        error={tableQuery.isError && !tableQuery.data ? tableQuery.error : null}
        empty={{
          description: filtering ? 'No vendors match these filters.' : 'No vendors found.',
          action:
            !filtering && canCreate?.can ? (
              <Link href="/vendors/create">
                <Button type="primary" icon={<PlusOutlined />}>
                  Add Vendor
                </Button>
              </Link>
            ) : undefined,
        }}
        onRow={(v) => ({ onClick: () => router.push(`/vendors/show/${v.id}`), style: { cursor: 'pointer' } })}
        renderMobile={(v) => (
          <Card size="small" hoverable style={{ width: '100%' }} onClick={() => router.push(`/vendors/show/${v.id}`)}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                <Typography.Text strong>{v.name}</Typography.Text>
                {v.vendor_categories && <Tag color="blue">{v.vendor_categories.name}</Tag>}
              </Space>
              {isAll && <Typography.Text type="secondary">{businessName(v.business_id)}</Typography.Text>}
              {v.notes && (
                <Typography.Text type="secondary" ellipsis>
                  {v.notes}
                </Typography.Text>
              )}
              {!!v.vendor_tags?.length && <TagList tags={v.vendor_tags} />}
              <Flex justify="flex-end">
                <RowActions resource={VENDORS} id={v.id} label={v.name} basePath="/vendors" deleteNotifications={vendorDeleteNotifications} />
              </Flex>
            </Space>
          </Card>
        )}
      />

      <ManageCategoriesDrawer open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </List>
  )
}
