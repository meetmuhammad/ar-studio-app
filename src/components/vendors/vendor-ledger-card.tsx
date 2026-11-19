'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useCan, useDelete, type HttpError } from '@refinedev/core'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Col, Empty, Flex, Input, Popconfirm, Result, Row, Space, Statistic, Table, Tag, Tooltip, Typography, theme } from 'antd'
import { BookOutlined, DeleteOutlined, DollarOutlined, EditOutlined, FileAddOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { CardWithTitle } from '@/components/refine/card-with-title'
import { DateRangeFilter } from '@/components/refine/filter-bar'
import { FormSection } from '@/components/refine/page-parts'
import { LedgerEntryDrawer } from '@/components/ledger/ledger-entry-drawer'
import { GENERAL_LEDGER, VENDOR_BILLS, entryTypeOf, money, type LedgerEntryValues } from '@/components/ledger/constants'
import { deleteNotificationsFor } from '@/lib/refine/notifications'
import { useVendorLedger, type VendorLedgerRow } from '@/lib/refine/reporting'
import { VendorBillModal } from './vendor-bill-modal'

const day = (v: string) => dayjs(v).format('MMM D, YYYY')

/** The general-ledger entry behind a vendor mirror row (debit and credit swap back). */
const entryFromMirror = (row: VendorLedgerRow, vendor: { id: string; name: string }): LedgerEntryValues => ({
  id: row.general_ledger_id!,
  entry_date: row.entry_date,
  entry_type: row.entry_type ?? 'vendor_payment',
  particulars: row.particulars,
  debit: row.credit,
  credit: row.debit,
  notes: row.notes,
  vendor_id: vendor.id,
  vendor_name: vendor.name,
})

/**
 * The vendor's ledger: bills (billed by the vendor) and payments (paid to the
 * vendor, from the general ledger), with what is owed after each line.
 * Totals: billed = credits, paid = debits, balance owed = billed - paid.
 * "Add bill" and "Record payment" (admin only) use the ledger functions
 * (record_vendor_bill / create_ledger_entry), as do edit and delete. Lines
 * that come from an order are read-only and link to it.
 *
 * Accessible names: buttons "Add bill", "Record payment", "Edit <particulars>",
 * "Delete <particulars>"; inputs "Search vendor ledger", "Vendor ledger dates".
 */
export function VendorLedgerCard({ vendorId, vendorName }: { vendorId: string; vendorName: string }) {
  const { token } = theme.useToken()
  const queryClient = useQueryClient()
  const vendor = { id: vendorId, name: vendorName }
  const ledger = useVendorLedger(vendorId)
  const { data: canWrite } = useCan({ resource: 'ledger', action: 'create' })
  const writesAllowed = canWrite?.can !== false
  const { mutate: remove } = useDelete<VendorLedgerRow, HttpError>()

  const [search, setSearch] = useState('')
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [billModal, setBillModal] = useState<{ open: boolean; bill: VendorLedgerRow | null }>({ open: false, bill: null })
  const [entryDrawer, setEntryDrawer] = useState<{ open: boolean; entry: LedgerEntryValues | null }>({ open: false, entry: null })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['report'] })

  const rows = ledger.data?.rows ?? []
  const totals = ledger.data?.totals
  const filtered = rows.filter((e) => {
    const q = search.trim().toLowerCase()
    if (q && !(e.particulars.toLowerCase().includes(q) || (e.notes ?? '').toLowerCase().includes(q))) return false
    if (range) {
      const d = dayjs(e.entry_date)
      if (d.isBefore(range[0], 'day') || d.isAfter(range[1], 'day')) return false
    }
    return true
  })

  const deleteRow = (row: VendorLedgerRow) =>
    remove(
      row.kind === 'bill'
        ? { resource: VENDOR_BILLS, id: row.id, ...deleteNotificationsFor('Bill') }
        : { resource: GENERAL_LEDGER, id: row.general_ledger_id!, ...deleteNotificationsFor('Ledger entry') },
      { onSuccess: () => void refresh() }
    )

  const actions = writesAllowed ? (
    <Space wrap>
      <Button icon={<FileAddOutlined />} onClick={() => setBillModal({ open: true, bill: null })} disabled={ledger.isError}>
        Add bill
      </Button>
      <Button type="primary" icon={<DollarOutlined />} onClick={() => setEntryDrawer({ open: true, entry: null })} disabled={ledger.isError}>
        Record payment
      </Button>
    </Space>
  ) : (
    <Tooltip title={canWrite?.reason}>
      <Typography.Text type="secondary">Read only</Typography.Text>
    </Tooltip>
  )

  const owed = Number(totals?.owed ?? 0)

  return (
    <CardWithTitle icon={<BookOutlined />} title="Ledger" action={actions}>
      {ledger.isError ? (
        <Result
          status="warning"
          title="The vendor ledger could not be loaded"
          subTitle={ledger.error.message}
          extra={<Button onClick={() => ledger.refetch()}>Retry</Button>}
        />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {[
              { title: 'Billed', value: money(totals?.billed), note: 'Bills from the vendor', color: token.colorText },
              { title: 'Paid', value: money(totals?.paid), note: 'Payments to the vendor', color: token.colorSuccess },
              {
                title: 'Balance owed',
                value: money(Math.abs(owed)),
                note: owed > 0 ? 'You owe the vendor' : owed < 0 ? 'Paid in advance (vendor owes you)' : 'Settled',
                color: owed > 0 ? token.colorError : token.colorSuccess,
              },
            ].map((s) => (
              <Col key={s.title} xs={24} sm={8}>
                <FormSection title={s.title}>
                  <Statistic value={s.value} loading={ledger.isLoading} valueStyle={{ color: s.color, fontSize: 22 }} />
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', paddingBottom: 12 }}>
                    {s.note}
                  </Typography.Text>
                </FormSection>
              </Col>
            ))}
          </Row>

          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={24} md={12}>
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search by particulars or notes"
                aria-label="Search vendor ledger"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Col>
            <Col xs={24} md={12}>
              <DateRangeFilter
                aria-label="Vendor ledger dates"
                value={range}
                onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
                allowEmpty={[false, false]}
              />
            </Col>
          </Row>

          <Table<VendorLedgerRow>
            rowKey="id"
            size="middle"
            loading={ledger.isLoading}
            dataSource={filtered}
            scroll={{ x: 860 }}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={rows.length ? 'No entries match these filters.' : 'No bills or payments for this vendor yet.'}
                />
              ),
            }}
            columns={[
              { key: 'date', title: 'Date', width: 120, render: (_, e) => day(e.entry_date) },
              {
                key: 'particulars',
                title: 'Particulars',
                render: (_, e) => (
                  <Flex vertical>
                    <Typography.Text>{e.particulars}</Typography.Text>
                    {e.order_id && <Link href={`/orders/show/${e.order_id}`}>Order {e.order_number}</Link>}
                    {e.notes && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {e.notes}
                      </Typography.Text>
                    )}
                  </Flex>
                ),
              },
              {
                key: 'type',
                title: 'Type',
                width: 140,
                render: (_, e) =>
                  e.kind === 'bill' ? (
                    <Tag color="orange">Bill</Tag>
                  ) : (
                    <Tag color={entryTypeOf(e.entry_type)?.color}>{entryTypeOf(e.entry_type)?.label ?? e.entry_type}</Tag>
                  ),
              },
              {
                key: 'billed',
                title: 'Billed',
                align: 'right',
                width: 130,
                render: (_, e) => (e.credit ? money(e.credit) : '—'),
              },
              {
                key: 'paid',
                title: 'Paid',
                align: 'right',
                width: 130,
                render: (_, e) => (e.debit ? <Typography.Text type="success">{money(e.debit)}</Typography.Text> : '—'),
              },
              {
                key: 'owed',
                title: 'Owed after',
                align: 'right',
                width: 140,
                render: (_, e) => <Typography.Text strong>{money(e.owed_after)}</Typography.Text>,
              },
              {
                key: 'actions',
                title: 'Actions',
                width: 100,
                fixed: 'right',
                render: (_, e) => {
                  if (e.kind === 'order') {
                    return (
                      <Tooltip title="Written by the order; change it on the order">
                        <Typography.Text type="secondary">Read only</Typography.Text>
                      </Tooltip>
                    )
                  }
                  if (!writesAllowed) return <Typography.Text type="secondary">—</Typography.Text>
                  return (
                    <Space size={4}>
                      <Tooltip title={e.kind === 'bill' ? 'Edit bill' : 'Edit ledger entry'}>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          aria-label={`Edit ${e.particulars}`}
                          onClick={() =>
                            e.kind === 'bill'
                              ? setBillModal({ open: true, bill: e })
                              : setEntryDrawer({ open: true, entry: entryFromMirror(e, vendor) })
                          }
                        />
                      </Tooltip>
                      <Popconfirm
                        title={e.kind === 'bill' ? 'Delete this bill?' : 'Delete this ledger entry?'}
                        description={e.kind === 'bill' ? undefined : 'It is removed from the general ledger too.'}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteRow(e)}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${e.particulars}`} />
                      </Popconfirm>
                    </Space>
                  )
                },
              },
            ]}
          />
        </>
      )}

      <VendorBillModal
        open={billModal.open}
        onClose={() => setBillModal({ open: false, bill: null })}
        vendor={vendor}
        bill={billModal.bill}
        onSaved={() => void refresh()}
      />
      <LedgerEntryDrawer
        open={entryDrawer.open}
        onClose={() => setEntryDrawer({ open: false, entry: null })}
        entry={entryDrawer.entry}
        vendor={entryDrawer.entry ? null : vendor}
        onSaved={() => void refresh()}
      />
    </CardWithTitle>
  )
}
