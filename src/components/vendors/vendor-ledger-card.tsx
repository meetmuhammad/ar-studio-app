'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCan } from '@refinedev/core'
import { App, Button, Col, Empty, Input, Result, Row, Statistic, Table, Tag, Tooltip, Typography, theme } from 'antd'
import { BookOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { authFetch } from '@/lib/auth-fetch'
import type { VendorLedgerWithRelations } from '@/lib/supabase-client'
import { CardWithTitle } from '@/components/refine/card-with-title'
import { DateRangeFilter } from '@/components/refine/filter-bar'
import { VendorBillDialog } from '@/components/dialogs/vendor-bill-dialog'
import { VENDORS } from './constants'

const pkr = (amount: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(amount)

const ENTRY_TYPE: Record<string, { label: string; color?: string }> = {
  opening_balance: { label: 'opening balance', color: 'blue' },
  order_payment: { label: 'order payment', color: 'green' },
  vendor_payment: { label: 'vendor payment', color: 'default' },
  miscellaneous: { label: 'miscellaneous', color: 'red' },
}

/**
 * The vendor's sub-ledger and bills.
 *
 * vendor_ledger / general_ledger have no direct client access (by design:
 * 20261024000000_close_role_escalation_and_ledger_direct_access.sql), so this
 * section still reads GET /api/vendor-ledger and creates bills with the
 * existing dialog (POST /api/vendor-ledger). Without the API (e.g. no service
 * key locally) it shows a clear error instead of zeros.
 *
 * Totals and running balances are computed as on the previous page: debit =
 * paid to the vendor, credit = billed / returned, balance = debit - credit.
 */
export function VendorLedgerCard({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const [billOpen, setBillOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const { data: canBill } = useCan({ resource: VENDORS, action: 'edit', params: { id: vendorId } })

  const ledger = useQuery({
    queryKey: ['vendor-ledger', vendorId],
    queryFn: async () => {
      const response = await authFetch(`/api/vendor-ledger?vendor_id=${encodeURIComponent(vendorId)}`)
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `The ledger service answered ${response.status}`)
      }
      return (await response.json()) as VendorLedgerWithRelations[]
    },
    retry: false,
  })

  const entries = useMemo(() => ledger.data ?? [], [ledger.data])
  const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0)
  const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0)
  const balance = totalDebit - totalCredit

  // Entries arrive newest first; the balance after an entry is the sum of it
  // and everything older.
  const runningBalance = useMemo(() => {
    const out = new Map<string, number>()
    let acc = 0
    for (let i = entries.length - 1; i >= 0; i--) {
      acc += (entries[i].debit || 0) - (entries[i].credit || 0)
      out.set(entries[i].id, acc)
    }
    return out
  }, [entries])

  const filtered = entries.filter((e) => {
    const q = search.trim().toLowerCase()
    if (q && !(e.particulars.toLowerCase().includes(q) || (e.notes ?? '').toLowerCase().includes(q))) return false
    if (range) {
      const d = dayjs(e.entry_date)
      if (d.isBefore(range[0], 'day') || d.isAfter(range[1], 'day')) return false
    }
    return true
  })

  const createBill = (
    <Tooltip title={canBill?.can === false ? canBill.reason : undefined}>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => setBillOpen(true)}
        disabled={canBill?.can === false || ledger.isError}
      >
        Create Bill
      </Button>
    </Tooltip>
  )

  return (
    <CardWithTitle icon={<BookOutlined />} title="Vendor Ledger" action={createBill}>
      {ledger.isError ? (
        <Result
          status="warning"
          title="The vendor ledger is unavailable"
          subTitle={`${ledger.error.message}. The ledger is only reachable through the server, which needs its service configuration; vendor details and tags above still work.`}
          extra={<Button onClick={() => ledger.refetch()}>Retry</Button>}
        />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={8}>
              <Statistic
                title="Total Debit"
                value={pkr(totalDebit)}
                loading={ledger.isLoading}
                valueStyle={{ color: token.colorSuccess }}
              />
              <Typography.Text type="secondary">Money received (from us)</Typography.Text>
            </Col>
            <Col xs={24} md={8}>
              <Statistic
                title="Total Credit"
                value={pkr(totalCredit)}
                loading={ledger.isLoading}
                valueStyle={{ color: token.colorError }}
              />
              <Typography.Text type="secondary">Money returned</Typography.Text>
            </Col>
            <Col xs={24} md={8}>
              <Statistic
                title="Net Balance"
                value={pkr(Math.abs(balance))}
                loading={ledger.isLoading}
                valueStyle={{ color: balance >= 0 ? token.colorError : token.colorSuccess }}
              />
              <Typography.Text type="secondary">{balance >= 0 ? 'We owe vendor' : 'Vendor owes us'}</Typography.Text>
            </Col>
          </Row>

          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={12}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search by particulars or notes"
                aria-label="Search ledger entries"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Col>
            <Col xs={24} md={12}>
              <DateRangeFilter
                aria-label="Entry dates"
                value={range}
                onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
                allowEmpty={[false, false]}
              />
            </Col>
          </Row>

          <Table<VendorLedgerWithRelations>
            rowKey="id"
            size="middle"
            loading={ledger.isLoading}
            dataSource={filtered}
            scroll={{ x: 760 }}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={entries.length ? 'No entries match these filters.' : 'No transactions found for this vendor'}
                />
              ),
            }}
            columns={[
              {
                key: 'date',
                title: 'Date',
                width: 130,
                render: (_, e) => dayjs(e.entry_date).format('MMM D, YYYY'),
              },
              {
                key: 'particulars',
                title: 'Particulars',
                render: (_, e) => (
                  <>
                    <div>{e.particulars}</div>
                    {e.notes && <Typography.Text type="secondary">{e.notes}</Typography.Text>}
                  </>
                ),
              },
              {
                key: 'type',
                title: 'Type',
                width: 150,
                render: (_, e) => {
                  if (!e.general_ledger_id) return <Tag>Vendor Bill</Tag>
                  const type = ENTRY_TYPE[e.general_ledger?.entry_type ?? 'vendor_payment']
                  return <Tag color={type?.color}>{type?.label ?? e.general_ledger?.entry_type}</Tag>
                },
              },
              {
                key: 'debit',
                title: 'Debit',
                align: 'right',
                width: 140,
                render: (_, e) => (e.debit ? <Typography.Text type="success">{pkr(e.debit)}</Typography.Text> : '—'),
              },
              {
                key: 'credit',
                title: 'Credit',
                align: 'right',
                width: 140,
                render: (_, e) => (e.credit ? <Typography.Text type="danger">{pkr(e.credit)}</Typography.Text> : '—'),
              },
              {
                key: 'balance',
                title: 'Balance',
                align: 'right',
                width: 150,
                render: (_, e) => <Typography.Text strong>{pkr(runningBalance.get(e.id) ?? 0)}</Typography.Text>,
              },
            ]}
          />
        </>
      )}

      <VendorBillDialog
        open={billOpen}
        onOpenChange={setBillOpen}
        vendorId={vendorId}
        vendorName={vendorName}
        onSuccess={() => {
          message.success('Bill created successfully')
          ledger.refetch()
        }}
      />
    </CardWithTitle>
  )
}
