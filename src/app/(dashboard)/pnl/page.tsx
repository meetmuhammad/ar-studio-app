'use client'

import { useMemo, useState } from 'react'
import { CanAccess } from '@refinedev/core'
import { Button, Col, Descriptions, Empty, Flex, Result, Row, Segmented, Skeleton, Table, Typography, theme } from 'antd'
import { BarChartOutlined, FileTextOutlined, InfoCircleOutlined, StopOutlined, TableOutlined } from '@ant-design/icons'
import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import dayjs from 'dayjs'
import { useBusinessLabel } from '@/contexts/business-context'
import { FormSection, Sections } from '@/components/refine/page-parts'
import { PeriodPicker, resolvePeriod, type Period } from '@/components/refine/period-picker'
import { usePnlInput, useReportScope } from '@/lib/refine/reporting'
import { BUSINESS_TIME_ZONE } from '@/lib/date-range'
import { formatCompactNumber, formatPKR } from '@/lib/format'
import { computePnl, type PnlMode, type PnlMonth, type PnlResult } from '@/lib/pnl'

const MODES: { value: PnlMode; label: string; hint: string }[] = [
  { value: 'cash', label: 'Cash basis', hint: 'Money received and paid out in the period' },
  { value: 'accrual', label: 'Accrual basis', hint: 'Orders delivered and bills recorded in the period' },
]

const money = (cents: number) => formatPKR(cents / 100)
const longDate = (d: string) => dayjs(d).format('D MMM YYYY')

/**
 * Profit & Loss: the same report as GET /api/pnl. The rows come from the
 * read-only pnl_input function (the API's queries, for both bases at once)
 * and the figures from computePnl in src/lib/pnl.ts, unchanged, so the
 * numbers match the API's for the same business, basis and dates.
 */
function PnlScreen() {
  const businessLabel = useBusinessLabel()
  const scope = useReportScope()
  const [mode, setMode] = useState<PnlMode>('cash')
  const [period, setPeriod] = useState<Period>({ preset: 'this_month', custom: {} })
  const range = resolvePeriod(period)
  const input = usePnlInput(range)

  const result: PnlResult | null = useMemo(
    () => (input.data && range ? computePnl(input.data, { mode, range, businessIds: scope.ids }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input.data, mode, range?.start, range?.end, scope.ids.join(',')]
  )

  const windowText = range ? `${longDate(range.start)} to ${longDate(range.end)} (${BUSINESS_TIME_ZONE})` : 'Choose a start and an end date'

  return (
    <Flex vertical gap={16}>
      <div>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Profit &amp; Loss
        </Typography.Title>
        <Typography.Text type="secondary">
          {businessLabel} · {windowText}
        </Typography.Text>
      </div>

      <FormSection title="Report">
        <Flex wrap gap={24} align="start" style={{ paddingBottom: 16 }}>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              Basis
            </Typography.Text>
            <Segmented
              aria-label="Basis"
              value={mode}
              onChange={(v) => setMode(v as PnlMode)}
              options={MODES.map((m) => ({ value: m.value, label: m.label }))}
            />
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
              {MODES.find((m) => m.value === mode)?.hint}
            </Typography.Text>
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
              Period
            </Typography.Text>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
        </Flex>
      </FormSection>

      {!range ? (
        <Empty description="Pick a start and an end date to see the report." />
      ) : input.isError ? (
        <Result
          status="warning"
          title="Couldn't load the profit and loss report"
          subTitle={input.error.message}
          extra={<Button onClick={() => input.refetch()}>Retry</Button>}
        />
      ) : input.isLoading || !result ? (
        <Row gutter={[16, 16]} aria-busy="true" aria-label="Loading report">
          <Col xs={24} lg={10}>
            <Skeleton active paragraph={{ rows: 9 }} />
          </Col>
          <Col xs={24} lg={14}>
            <Skeleton active paragraph={{ rows: 9 }} />
          </Col>
        </Row>
      ) : (
        <Report data={result} />
      )}
    </Flex>
  )
}

function Report({ data }: { data: PnlResult }) {
  return (
    <Sections>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Statement data={data} />
        </Col>
        <Col xs={24} lg={14}>
          <MonthlyChart data={data} />
        </Col>
      </Row>
      <MonthlyTable data={data} />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Excluded data={data} />
        </Col>
        <Col xs={24} lg={12}>
          <Notes data={data} />
        </Col>
      </Row>
    </Sections>
  )
}

function Statement({ data }: { data: PnlResult }) {
  const { token } = theme.useToken()
  const s = data.statement
  const d = data.revenueDetail
  const revenueNote =
    data.mode === 'cash'
      ? `Advances ${money(d.advancesCents)} · Later payments ${money(d.laterPaymentsCents)}`
      : `${d.deliveredOrders} delivered ${d.deliveredOrders === 1 ? 'order' : 'orders'} at full value`

  const rows: { label: string; cents: number; note?: string; total?: boolean; strong?: boolean }[] = [
    { label: 'Revenue', cents: s.revenueCents, note: revenueNote },
    { label: 'Cost of sales / production', cents: s.costOfSalesCents },
    { label: 'Gross profit', cents: s.grossProfitCents, total: true },
    { label: 'Staff', cents: s.staffCents },
    { label: 'Overheads', cents: s.overheadsCents },
    { label: 'Other expenses', cents: s.otherExpenseCents },
    { label: 'Other income', cents: s.otherIncomeCents },
    { label: 'Net profit', cents: s.netProfitCents, total: true, strong: true },
  ]

  return (
    <FormSection icon={<FileTextOutlined />} title="Statement" extra={<Typography.Text type="secondary">{data.mode === 'cash' ? 'Cash basis' : 'Accrual basis'}, in PKR</Typography.Text>}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }} aria-label="Profit and loss statement">
        <caption className="sr-only">
          Profit and loss statement, {data.mode === 'cash' ? 'cash basis' : 'accrual basis'}, {data.range.start} to {data.range.end}
        </caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={{ borderTop: r.total ? `1px solid ${token.colorBorderSecondary}` : undefined }}>
              <th scope="row" style={{ textAlign: 'left', padding: '8px 12px 8px 0', fontWeight: r.total ? 600 : 400, verticalAlign: 'top' }}>
                {r.label}
                {r.note && (
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 400 }}>
                    {r.note}
                  </Typography.Text>
                )}
              </th>
              <td
                style={{
                  textAlign: 'right',
                  padding: '8px 0',
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: r.total ? 600 : 400,
                  fontSize: r.strong ? 16 : undefined,
                  color: r.total && r.cents < 0 ? token.colorError : undefined,
                }}
              >
                {money(r.cents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </FormSection>
  )
}

const monthName = (key: string, withYear: boolean) => dayjs(`${key}-01`).format(withYear ? 'MMM YY' : 'MMM')

function MonthlyChart({ data }: { data: PnlResult }) {
  const { token } = theme.useToken()
  const spansYears = data.monthly.length > 0 && data.monthly[0].month.slice(0, 4) !== data.monthly[data.monthly.length - 1].month.slice(0, 4)
  const points = data.monthly.map((m) => ({
    month: monthName(m.month, spansYears || data.monthly.length > 12),
    Revenue: m.revenueCents / 100,
    'Net profit': m.netProfitCents / 100,
  }))
  const axis = { stroke: token.colorTextTertiary, fontSize: 12, tickLine: false, axisLine: false }
  return (
    <FormSection icon={<BarChartOutlined />} title="By month" extra={<Typography.Text type="secondary">Revenue and net profit, in PKR</Typography.Text>}>
      <div style={{ height: 300, paddingBottom: 16 }} role="img" aria-label="Revenue and net profit by month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={token.colorBorderSecondary} strokeDasharray="3 3" />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={(v: number) => formatCompactNumber(v)} />
            <ReferenceLine y={0} stroke={token.colorBorder} />
            <Tooltip
              cursor={{ fill: token.colorFillTertiary }}
              contentStyle={{ background: token.colorBgElevated, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6 }}
              labelStyle={{ color: token.colorText }}
              itemStyle={{ color: token.colorText }}
              formatter={(v, name) => [formatPKR(Number(v)), String(name)]}
            />
            <Legend wrapperStyle={{ color: token.colorText }} />
            <Bar dataKey="Revenue" fill={token.colorPrimary} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Net profit" fill={token.colorSuccess} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </FormSection>
  )
}

function MonthlyTable({ data }: { data: PnlResult }) {
  const { token } = theme.useToken()
  const cell = (cents: number, strong = false) => (
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 600 : undefined, color: strong && cents < 0 ? token.colorError : undefined }}>
      {money(cents)}
    </span>
  )
  const columns = [
    { key: 'month', title: 'Month', fixed: 'left' as const, width: 110, render: (_: unknown, m: PnlMonth) => dayjs(`${m.month}-01`).format('MMM YYYY') },
    { key: 'revenue', title: 'Revenue', align: 'right' as const, render: (_: unknown, m: PnlMonth) => cell(m.revenueCents) },
    { key: 'cos', title: 'Cost of sales', align: 'right' as const, render: (_: unknown, m: PnlMonth) => cell(m.costOfSalesCents) },
    { key: 'gross', title: 'Gross profit', align: 'right' as const, render: (_: unknown, m: PnlMonth) => cell(m.grossProfitCents, true) },
    { key: 'staff', title: 'Staff', align: 'right' as const, render: (_: unknown, m: PnlMonth) => cell(m.staffCents) },
    { key: 'overheads', title: 'Overheads', align: 'right' as const, render: (_: unknown, m: PnlMonth) => cell(m.overheadsCents) },
    { key: 'other', title: 'Other expenses', align: 'right' as const, render: (_: unknown, m: PnlMonth) => cell(m.otherExpenseCents) },
    { key: 'income', title: 'Other income', align: 'right' as const, render: (_: unknown, m: PnlMonth) => cell(m.otherIncomeCents) },
    { key: 'net', title: 'Net profit', align: 'right' as const, render: (_: unknown, m: PnlMonth) => cell(m.netProfitCents, true) },
  ]
  return (
    <FormSection icon={<TableOutlined />} title="Monthly breakdown">
      <Table<PnlMonth>
        rowKey="month"
        size="middle"
        dataSource={data.monthly}
        columns={columns}
        pagination={false}
        scroll={{ x: 1000 }}
        style={{ marginBottom: 16 }}
        aria-label="Monthly breakdown"
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}>
              <Typography.Text strong>Period</Typography.Text>
            </Table.Summary.Cell>
            {[
              data.statement.revenueCents,
              data.statement.costOfSalesCents,
              data.statement.grossProfitCents,
              data.statement.staffCents,
              data.statement.overheadsCents,
              data.statement.otherExpenseCents,
              data.statement.otherIncomeCents,
              data.statement.netProfitCents,
            ].map((cents, i) => (
              <Table.Summary.Cell key={i} index={i + 1} align="right">
                {cell(cents, true)}
              </Table.Summary.Cell>
            ))}
          </Table.Summary.Row>
        )}
      />
    </FormSection>
  )
}

function Excluded({ data }: { data: PnlResult }) {
  const e = data.excluded
  return (
    <FormSection icon={<StopOutlined />} title="Not in profit" extra={<Typography.Text type="secondary">Recorded in this period but kept out</Typography.Text>}>
      <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Opening balances">{money(e.openingBalanceCents)} · set-up entries, not earnings</Descriptions.Item>
        <Descriptions.Item label="Owner withdrawals">{money(e.ownerWithdrawalCents)} · drawings, not a business cost</Descriptions.Item>
        <Descriptions.Item label="Transfers">
          {e.transfers.count === 0
            ? 'None'
            : `${e.transfers.count} · in ${money(e.transfers.moneyInCents)} · out ${money(e.transfers.moneyOutCents)}`}
        </Descriptions.Item>
        {data.mode === 'accrual' && (
          <Descriptions.Item label="Vendor payments replaced by bills">{money(data.suppressedVendorPaymentsCents)}</Descriptions.Item>
        )}
      </Descriptions>
    </FormSection>
  )
}

function Notes({ data }: { data: PnlResult }) {
  return (
    <FormSection icon={<InfoCircleOutlined />} title="Read this with the figures">
      <ul style={{ paddingLeft: 18, margin: '0 0 16px' }}>
        {data.limitations.map((l) => (
          <li key={l} style={{ marginBottom: 8 }}>
            <Typography.Text>{l}</Typography.Text>
          </li>
        ))}
        {data.unknownCategories.length > 0 && (
          <li style={{ marginBottom: 8 }}>
            <Typography.Text>
              Counted under Other because the report does not recognise the category: {data.unknownCategories.join(', ')}.
            </Typography.Text>
          </li>
        )}
        <li>
          <Typography.Text type="secondary">
            Costs use each vendor&apos;s current category, so moving a vendor to another category also moves its past costs.
          </Typography.Text>
        </li>
      </ul>
    </FormSection>
  )
}

export default function ProfitAndLossPage() {
  return (
    <CanAccess
      resource="pnl"
      action="list"
      fallback={<Result status="403" title="403" subTitle="Sorry, you are not authorized to access this page." />}
    >
      <PnlScreen />
    </CanAccess>
  )
}
