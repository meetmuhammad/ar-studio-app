'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSelect } from '@refinedev/antd'
import { CanAccess, useCan, useDelete, type HttpError } from '@refinedev/core'
import { useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Col,
  Flex,
  Form,
  Input,
  Popconfirm,
  Result,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import {
  BookOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useBusinessLabel } from '@/contexts/business-context'
import { DateRangeFilter, FilterBar, dateRangeItemProps } from '@/components/refine/filter-bar'
import { ResourceTable, type ResourceColumn } from '@/components/refine/resource-table'
import { FormSection } from '@/components/refine/page-parts'
import { CategorySelect } from '@/components/vendors/category-select'
import { LedgerEntryDrawer } from '@/components/ledger/ledger-entry-drawer'
import {
  ENTRY_TYPES,
  GENERAL_LEDGER,
  entryTypeOf as typeOf,
  isOrderOwned,
  money,
  type LedgerEntryValues,
} from '@/components/ledger/constants'
import { deleteNotificationsFor } from '@/lib/refine/notifications'
import {
  fetchLedgerForExport,
  useLedgerPage,
  useReportScope,
  type LedgerQuery,
  type LedgerRow,
} from '@/lib/refine/reporting'

const day = (v: string) => dayjs(v).format('MMM D, YYYY')

const entryValues = (e: LedgerRow): LedgerEntryValues => ({
  id: e.id,
  entry_date: e.entry_date,
  entry_type: e.entry_type,
  particulars: e.particulars,
  debit: e.debit,
  credit: e.credit,
  notes: e.notes,
  vendor_id: e.vendor_id,
  vendor_name: e.vendors?.name ?? null,
})

interface FilterValues {
  dates?: [string, string]
  q?: string
  type?: string
  vendor?: string
  category?: string
}

/** Filters live in the URL, so a filtered ledger can be shared or reloaded. */
function useLedgerFilters() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const get = (k: string) => params.get(k) || undefined
  const query: LedgerQuery = {
    from: get('from') ?? null,
    to: get('to') ?? null,
    search: get('q') ?? null,
    entryType: get('type') ?? null,
    vendorId: get('vendor') ?? null,
    vendorCategoryId: get('category') ?? null,
    limit: Number(get('size') ?? 20),
    offset: (Number(get('page') ?? 1) - 1) * Number(get('size') ?? 20),
  }
  const set = (next: Record<string, string | number | undefined | null>) => {
    const sp = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === null || v === '') sp.delete(k)
      else sp.set(k, String(v))
    }
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }
  const formValues: FilterValues = {
    dates: query.from && query.to ? [dayjs(query.from).startOf('day').toISOString(), dayjs(query.to).endOf('day').toISOString()] : undefined,
    q: query.search ?? undefined,
    type: query.entryType ?? undefined,
    vendor: query.vendorId ?? undefined,
    category: query.vendorCategoryId ?? undefined,
  }
  return { query, set, formValues, page: Number(get('page') ?? 1), size: Number(get('size') ?? 20) }
}

function LedgerScreen() {
  const { token } = theme.useToken()
  const { message, notification } = App.useApp()
  const businessLabel = useBusinessLabel()
  const scope = useReportScope()
  const queryClient = useQueryClient()
  const { query, set, formValues, page, size } = useLedgerFilters()
  const [form] = Form.useForm<FilterValues>()
  const [drawer, setDrawer] = useState<{ open: boolean; entry: LedgerEntryValues | null }>({ open: false, entry: null })
  const [exporting, setExporting] = useState(false)
  const { mutate: remove } = useDelete<LedgerRow, HttpError>()

  const { data, isLoading, isFetching, isError, error, refetch } = useLedgerPage(query)
  const { data: canWrite } = useCan({ resource: 'ledger', action: 'create' })
  const writesAllowed = canWrite?.can !== false
  const combined = data?.combined ?? scope.isAll

  const { selectProps: vendorSelect } = useSelect({
    resource: 'vendors',
    optionLabel: 'name',
    optionValue: 'id',
    onSearch: (term) => [{ field: 'q', operator: 'contains', value: term }],
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { pageSize: 50 },
    defaultValue: query.vendorId ?? undefined,
    meta: { select: 'id, name' },
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['report'] })

  const exportCsv = async () => {
    setExporting(true)
    try {
      const all = await fetchLedgerForExport(scope.ids, query)
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const headers = ['Date', 'Particulars', 'Type', 'Debit', 'Credit', combined ? 'Business' : 'Balance', 'Vendor', 'Vendor Category', 'Order Number', 'Notes']
      const rows = all.rows.map((e) => [
        day(e.entry_date),
        esc(e.particulars),
        typeOf(e.entry_type)?.label ?? e.entry_type,
        e.debit ?? 0,
        e.credit ?? 0,
        combined ? esc(e.business_name) : e.range_balance ?? e.balance ?? '',
        e.vendors ? esc(e.vendors.name) : '',
        e.vendor_id ? esc(e.vendors?.vendor_categories?.name ?? 'Uncategorized') : '',
        e.orders ? esc(e.orders.order_number) : '',
        e.notes ? esc(e.notes) : '',
      ])
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `ledger_entries_${dayjs().format('YYYY-MM-DD')}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      message.success(`Exported ${all.rows.length} ledger entries to CSV`)
    } catch (e) {
      notification.error({ message: 'Failed to export CSV', description: e instanceof Error ? e.message : undefined })
    } finally {
      setExporting(false)
    }
  }

  const columns = useMemo((): ResourceColumn<LedgerRow>[] => {
    const cols: ResourceColumn<LedgerRow>[] = [
      { key: 'date', title: 'Date', width: 130, render: (_, e) => day(e.entry_date) },
      {
        key: 'particulars',
        title: 'Particulars',
        width: 280,
        render: (_, e) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{e.particulars}</Typography.Text>
            {e.orders && (
              <Link href={`/orders/show/${e.orders.id}`} onClick={(ev) => ev.stopPropagation()}>
                Order {e.orders.order_number}
              </Link>
            )}
          </Space>
        ),
      },
      {
        key: 'type',
        title: 'Type',
        width: 150,
        render: (_, e) => <Tag color={typeOf(e.entry_type)?.color}>{typeOf(e.entry_type)?.label ?? e.entry_type}</Tag>,
      },
      {
        key: 'vendor',
        title: 'Vendor / Category',
        width: 200,
        render: (_, e) =>
          e.vendors ? (
            <Space direction="vertical" size={0}>
              <Link href={`/vendors/show/${e.vendors.id}`}>{e.vendors.name}</Link>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {e.vendors.vendor_categories?.name ?? 'Uncategorized'}
              </Typography.Text>
            </Space>
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
      },
      {
        key: 'debit',
        title: 'Debit',
        align: 'right',
        width: 140,
        render: (_, e) => (e.debit ? <Typography.Text type="success">{money(e.debit)}</Typography.Text> : '—'),
      },
      {
        key: 'credit',
        title: 'Credit',
        align: 'right',
        width: 140,
        render: (_, e) => (e.credit ? <Typography.Text type="danger">{money(e.credit)}</Typography.Text> : '—'),
      },
      combined
        ? { key: 'business', title: 'Business', width: 170, render: (_, e) => e.business_name ?? '—' }
        : {
            key: 'balance',
            title: 'Balance',
            align: 'right',
            width: 150,
            render: (_, e) => <Typography.Text strong>{money(e.range_balance ?? e.balance)}</Typography.Text>,
          },
      {
        key: 'notes',
        title: 'Notes',
        width: 220,
        ellipsis: true,
        defaultHidden: true,
        render: (_, e) => e.notes || '—',
      },
      {
        key: 'actions',
        title: 'Actions',
        fixed: 'right',
        fixedVisible: true,
        width: 110,
        render: (_, e) => {
          if (isOrderOwned(e)) {
            return (
              <Tooltip title="Written by an order or a payment; change it on the order">
                {e.orders ? (
                  <Link href={`/orders/show/${e.orders.id}`} aria-label={`Open order ${e.orders.order_number}`}>
                    Read only
                  </Link>
                ) : (
                  <Typography.Text type="secondary">Read only</Typography.Text>
                )}
              </Tooltip>
            )
          }
          return (
            <Space size={4} onClick={(ev) => ev.stopPropagation()}>
              <Tooltip title={writesAllowed ? 'Edit entry' : canWrite?.reason}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  aria-label={`Edit ledger entry ${e.particulars}`}
                  disabled={!writesAllowed}
                  onClick={() => setDrawer({ open: true, entry: entryValues(e) })}
                />
              </Tooltip>
              <Tooltip title={writesAllowed ? 'Delete entry' : canWrite?.reason}>
                <span>
                  <Popconfirm
                    title="Delete this ledger entry?"
                    description="Its vendor ledger entry, if any, is deleted too."
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    disabled={!writesAllowed}
                    onConfirm={() =>
                      remove(
                        { resource: GENERAL_LEDGER, id: e.id, ...deleteNotificationsFor('Ledger entry') },
                        { onSuccess: () => void refresh() }
                      )
                    }
                  >
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Delete ledger entry ${e.particulars}`}
                      disabled={!writesAllowed}
                    />
                  </Popconfirm>
                </span>
              </Tooltip>
            </Space>
          )
        },
      },
    ]
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combined, writesAllowed])

  const totals = data?.totals
  const opening = Number(data?.opening_balance ?? 0)
  const rangeActive = !!(query.from || query.to)

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            General Ledger
          </Typography.Title>
          <Typography.Text type="secondary">{businessLabel} · Track all financial transactions and balances</Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={() => void exportCsv()} loading={exporting} disabled={!data?.total}>
            Export CSV
          </Button>
          <Tooltip title={writesAllowed ? undefined : canWrite?.reason}>
            <Button type="primary" icon={<PlusOutlined />} disabled={!writesAllowed} onClick={() => setDrawer({ open: true, entry: null })}>
              Add Entry
            </Button>
          </Tooltip>
        </Space>
      </Flex>

      <FilterBar
        formProps={{
          form,
          initialValues: formValues,
          onFinish: (v: FilterValues) =>
            set({
              from: v.dates?.[0] ? dayjs(v.dates[0]).format('YYYY-MM-DD') : undefined,
              to: v.dates?.[1] ? dayjs(v.dates[1]).format('YYYY-MM-DD') : undefined,
              q: v.q?.trim(),
              type: v.type,
              vendor: v.vendor,
              category: v.category,
              page: undefined,
            }),
        }}
        label="Ledger filters"
        collapsedCount={2}
      >
        <Form.Item name="dates" label="Dates" {...dateRangeItemProps}>
          <DateRangeFilter aria-label="Entry dates" />
        </Form.Item>
        <Form.Item name="q" label="Search particulars">
          <Input allowClear prefix={<SearchOutlined />} placeholder="e.g. rent, AR-00042" />
        </Form.Item>
        <Form.Item name="type" label="Entry type">
          <Select allowClear placeholder="All types" aria-label="Entry type" options={ENTRY_TYPES.map(({ value, label }) => ({ value, label }))} />
        </Form.Item>
        <Form.Item name="vendor" label="Vendor">
          <Select
            allowClear
            showSearch
            filterOption={false}
            placeholder="All vendors"
            aria-label="Vendor"
            options={vendorSelect.options as { label: string; value: string }[] | undefined}
            onSearch={vendorSelect.onSearch}
            loading={vendorSelect.loading}
          />
        </Form.Item>
        <Form.Item name="category" label="Category">
          <CategorySelect allowClear placeholder="All categories" aria-label="Category" />
        </Form.Item>
      </FilterBar>

      <Row gutter={[16, 16]}>
        {[
          {
            title: 'Total Debit',
            value: money(totals?.debit),
            note: rangeActive ? 'Money in · selected dates' : 'Money in',
            color: token.colorSuccess,
          },
          {
            title: 'Total Credit',
            value: money(totals?.credit),
            note: rangeActive ? 'Money out · selected dates' : 'Money out',
            color: token.colorError,
          },
          {
            title: combined ? 'Net, all businesses' : 'Current Balance',
            value: money(totals?.net),
            note: rangeActive ? 'Debit − credit · selected dates' : 'Debit − credit · all time',
          },
          { title: 'Total Entries', value: Number(totals?.entry_count ?? 0).toLocaleString(), note: rangeActive ? 'In selected dates' : 'All transactions' },
        ].map((s) => (
          <Col key={s.title} xs={12} lg={6}>
            <FormSection title={s.title}>
              <Statistic value={s.value} loading={isLoading} valueStyle={{ color: s.color, fontSize: 22 }} />
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', paddingBottom: 12 }}>
                {s.note}
              </Typography.Text>
            </FormSection>
          </Col>
        ))}
      </Row>

      <ResourceTable<LedgerRow>
        tableKey="ledger"
        icon={<BookOutlined />}
        title={`Ledger Entries (${data?.total ?? 0})`}
        columns={columns}
        rowKey="id"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        error={isError && !data ? error : null}
        empty={{ description: query.search || query.entryType || query.vendorId ? 'No entries match these filters.' : 'No ledger entries found.' }}
        tableProps={{
          dataSource: data?.rows ?? [],
          loading: isLoading,
          pagination: { current: page, pageSize: size, total: data?.total ?? 0 },
          onChange: (pagination) => set({ page: pagination.current, size: pagination.pageSize }),
          summary: () =>
            data && data.rows.length > 0 ? (
              <Table.Summary fixed="bottom">
                {!!query.from && (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Typography.Text type="secondary">Opening balance before {day(query.from)}</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} colSpan={3} align="right">
                      <Typography.Text strong>{money(opening)}</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} colSpan={2} />
                  </Table.Summary.Row>
                )}
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <Typography.Text strong>{rangeActive ? 'Totals for the selected dates' : 'Totals'}</Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Typography.Text type="success" strong>
                      {money(totals?.debit)}
                    </Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <Typography.Text type="danger" strong>
                      {money(totals?.credit)}
                    </Typography.Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <Tooltip title={query.from ? 'Opening balance + debit − credit' : 'Debit − credit'}>
                      <Typography.Text strong>{money(opening + Number(totals?.net ?? 0))}</Typography.Text>
                    </Tooltip>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} colSpan={2} />
                </Table.Summary.Row>
              </Table.Summary>
            ) : null,
        }}
        renderMobile={(e) => (
          <div style={{ width: '100%', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, padding: 12 }}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text strong>{e.particulars}</Typography.Text>
              <Tag color={typeOf(e.entry_type)?.color} style={{ marginInlineEnd: 0 }}>
                {typeOf(e.entry_type)?.label ?? e.entry_type}
              </Tag>
            </Flex>
            <Flex justify="space-between" style={{ marginTop: 6 }}>
              <Typography.Text type="secondary">{day(e.entry_date)}</Typography.Text>
              {e.debit ? (
                <Typography.Text type="success">+{money(e.debit)}</Typography.Text>
              ) : (
                <Typography.Text type="danger">−{money(e.credit)}</Typography.Text>
              )}
            </Flex>
            {!combined && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Balance {money(e.range_balance ?? e.balance)}
              </Typography.Text>
            )}
          </div>
        )}
      />

      {combined && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          All businesses: each business keeps its own book, so there is no running balance; rows show their business.
        </Typography.Text>
      )}

      <LedgerEntryDrawer
        open={drawer.open}
        onClose={() => setDrawer({ open: false, entry: null })}
        entry={drawer.entry}
        onSaved={() => void refresh()}
      />
    </Flex>
  )
}

export default function LedgerPage() {
  return (
    <CanAccess
      resource="ledger"
      action="list"
      fallback={<Result status="403" title="403" subTitle="Sorry, you are not authorized to access this page." />}
    >
      <LedgerScreen />
    </CanAccess>
  )
}
