'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { X } from 'lucide-react'

import { RoleGuard } from '@/components/auth/role-guard'
import { PageHeader } from '@/components/dashboard/page-header'
import { ErrorState } from '@/components/dashboard/error-state'
import {
  SectionCard,
  SectionCardContent,
  SectionCardDescription,
  SectionCardHeader,
  SectionCardTitle,
} from '@/components/dashboard/section-card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useBusinessLabel } from '@/contexts/business-context'
import { usePnl, type PnlResponse } from '@/hooks/use-api'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { BUSINESS_TIME_ZONE, fromDateString, toDateString, todayInBusinessZone } from '@/lib/date-range'
import { formatCompactNumber, formatPKR } from '@/lib/format'
import { PNL_PRESETS, isPnlPreset, resolvePnlRange, type PnlMode, type PnlPreset } from '@/lib/pnl'
import { cn } from '@/lib/utils'

const MODES: Array<{ value: PnlMode; label: string; hint: string }> = [
  { value: 'cash', label: 'Cash basis', hint: 'Money received and paid out in the period' },
  { value: 'accrual', label: 'Accrual basis', hint: 'Orders delivered and bills recorded in the period' },
]

/** Cents from the API -> rupees for display (formatPKR rounds to whole rupees). */
const rupees = (cents: number) => cents / 100
const money = (cents: number) => formatPKR(rupees(cents))
const longDate = (d: string) => format(fromDateString(d), 'd MMM yyyy')
const monthLabel = (key: string, withYear: boolean) =>
  format(fromDateString(`${key}-01`), withYear ? 'MMM yy' : 'MMM')

export default function ProfitAndLossPage() {
  const businessLabel = useBusinessLabel()
  const [mode, setMode] = useState<PnlMode>('cash')
  const [preset, setPreset] = useState<PnlPreset>('this_month')
  const [custom, setCustom] = useState<{ start?: string; end?: string }>({})

  // Presets resolve in Asia/Karachi on the client too, so the window shown
  // before the response arrives is the one the server will use.
  const resolved = resolvePnlRange(preset, custom, todayInBusinessZone())
  const range = 'range' in resolved ? resolved.range : null

  const { data, isPending, isError, error, refetch } = usePnl(
    { mode, preset, start: range?.start ?? '', end: range?.end ?? '' },
    { enabled: !!range }
  )

  const changePreset = (value: string) => {
    if (!isPnlPreset(value)) return
    // Switching to Custom starts from the dates the previous preset covered.
    if (value === 'custom' && range) setCustom({ start: range.start, end: range.end })
    setPreset(value)
  }

  const windowText = range
    ? `${longDate(range.start)} to ${longDate(range.end)} (${BUSINESS_TIME_ZONE})`
    : 'Choose a start and an end date'

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeader title="Profit & Loss" description={`${businessLabel} · ${windowText}`} />

        <SectionCard>
          <SectionCardContent className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start lg:gap-8">
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-2 text-sm text-muted-foreground">Basis</legend>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as PnlMode)}
                aria-label="Basis"
                className="grid gap-2 sm:grid-cols-2"
              >
                {MODES.map((m) => (
                  <Label
                    key={m.value}
                    htmlFor={`pnl-mode-${m.value}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 font-normal',
                      mode === m.value ? 'border-primary bg-accent' : 'border-border'
                    )}
                  >
                    <RadioGroupItem id={`pnl-mode-${m.value}`} value={m.value} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{m.label}</span>
                      <span className="text-xs text-muted-foreground">{m.hint}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pnl-period" className="text-sm text-muted-foreground">Period</Label>
                <Select value={preset} onValueChange={changePreset}>
                  <SelectTrigger id="pnl-period" className="w-full sm:w-[160px]" aria-label="Period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PNL_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {preset === 'custom' && (
                <>
                  <BoundPicker
                    label="From"
                    value={custom.start}
                    max={custom.end}
                    onChange={(start) => setCustom((c) => ({ ...c, start }))}
                  />
                  <BoundPicker
                    label="To"
                    value={custom.end}
                    min={custom.start}
                    onChange={(end) => setCustom((c) => ({ ...c, end }))}
                  />
                </>
              )}
            </div>
          </SectionCardContent>
        </SectionCard>

        {!range ? (
          <SectionCard>
            <SectionCardContent className="py-6 text-center text-sm text-muted-foreground">
              {!custom.start || !custom.end ? 'Pick a start and an end date to see the report.' : 'error' in resolved ? resolved.error : null}
            </SectionCardContent>
          </SectionCard>
        ) : isError ? (
          <ErrorState
            title="Couldn't load the profit and loss report"
            detail={error instanceof Error ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : isPending || !data ? (
          <LoadingState />
        ) : (
          <Report data={data} />
        )}
      </div>
    </RoleGuard>
  )
}

function BoundPicker({ label, value, min, max, onChange }: {
  label: string
  value?: string
  min?: string
  max?: string
  onChange: (value: string | undefined) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        <DatePicker
          date={value ? fromDateString(value) : undefined}
          onDateChange={(d) => onChange(d ? toDateString(d) : undefined)}
          placeholder={`${label} date`}
          className="w-full sm:w-[200px]"
          minDate={min ? fromDateString(min) : undefined}
          maxDate={max ? fromDateString(max) : undefined}
        />
        {value && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(undefined)}
            aria-label={`Clear ${label.toLowerCase()} date`}
            className="h-10 w-10 flex-shrink-0 pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" aria-busy="true" aria-label="Loading report">
      <Skeleton className="h-[360px] w-full lg:col-span-5" />
      <Skeleton className="h-[360px] w-full lg:col-span-7" />
      <Skeleton className="h-[160px] w-full lg:col-span-12" />
    </div>
  )
}

function Report({ data }: { data: PnlResponse }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Statement data={data} />
        <MonthlyTrend data={data} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Excluded data={data} />
        <Limitations data={data} />
      </div>
    </>
  )
}

function Statement({ data }: { data: PnlResponse }) {
  const s = data.statement
  const d = data.revenueDetail
  const revenueNote = data.mode === 'cash'
    ? `Advances ${money(d.advancesCents)} · Later payments ${money(d.laterPaymentsCents)}`
    : `${d.deliveredOrders} delivered ${d.deliveredOrders === 1 ? 'order' : 'orders'} at full value`

  const rows: Array<{ label: string; cents: number; note?: string; total?: boolean; strong?: boolean }> = [
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
    <SectionCard className="lg:col-span-5">
      <SectionCardHeader>
        <SectionCardTitle className="text-base">Statement</SectionCardTitle>
        <SectionCardDescription className="text-xs">
          {data.mode === 'cash' ? 'Cash basis' : 'Accrual basis'}, in PKR
        </SectionCardDescription>
      </SectionCardHeader>
      <SectionCardContent>
        <table className="w-full text-sm">
          <caption className="sr-only">
            Profit and loss statement, {data.mode === 'cash' ? 'cash basis' : 'accrual basis'}, {data.range.start} to {data.range.end}
          </caption>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={cn(r.total && 'border-t border-border')}>
                <th scope="row" className={cn('py-2 pr-3 text-left align-top', r.total ? 'font-semibold' : 'font-normal')}>
                  {r.label}
                  {r.note ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{r.note}</span> : null}
                </th>
                <td
                  className={cn(
                    'py-2 text-right align-top font-mono tabular-nums whitespace-nowrap',
                    r.total && 'font-semibold',
                    r.strong && 'text-base',
                    r.total && r.cents < 0 && 'text-destructive-text'
                  )}
                >
                  {money(r.cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCardContent>
    </SectionCard>
  )
}

function MonthlyTrend({ data }: { data: PnlResponse }) {
  const reducedMotion = useReducedMotion()
  const spansYears = data.monthly.length > 0 && data.monthly[0].month.slice(0, 4) !== data.monthly[data.monthly.length - 1].month.slice(0, 4)
  const points = data.monthly.map((m) => ({
    month: monthLabel(m.month, spansYears || data.monthly.length > 12),
    revenue: rupees(m.revenueCents),
    netProfit: rupees(m.netProfitCents),
  }))

  return (
    <SectionCard className="lg:col-span-7">
      <SectionCardHeader>
        <SectionCardTitle className="text-base">By month</SectionCardTitle>
        <SectionCardDescription className="text-xs">Revenue and net profit per calendar month, in PKR</SectionCardDescription>
      </SectionCardHeader>
      <SectionCardContent>
        <ChartContainer
          config={{
            revenue: { label: 'Revenue', color: 'var(--chart-1)' },
            netProfit: { label: 'Net profit', color: 'var(--chart-4)' },
          }}
          className="h-[240px] w-full sm:h-[280px]"
          role="img"
          aria-label={`Revenue and net profit by month, in PKR: ${points
            .map((p) => `${p.month} revenue ${formatCompactNumber(p.revenue)}, net ${formatCompactNumber(p.netProfit)}`)
            .join('; ')}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={12}
                width={44}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: number) => formatCompactNumber(value)}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">{name === 'netProfit' ? 'Net profit' : 'Revenue'}</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">{formatPKR(Number(value))}</span>
                      </div>
                    )}
                  />
                }
              />
              <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} />
              <Bar dataKey="netProfit" fill="var(--color-netProfit)" radius={[3, 3, 0, 0]} isAnimationActive={!reducedMotion} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-chart-1" aria-hidden="true" />Revenue</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-chart-4" aria-hidden="true" />Net profit</span>
        </div>
      </SectionCardContent>
    </SectionCard>
  )
}

function Excluded({ data }: { data: PnlResponse }) {
  const e = data.excluded
  const rows: Array<{ label: string; value: string; note: string }> = [
    { label: 'Opening balances', value: money(e.openingBalanceCents), note: 'Set-up entries, not earnings' },
    { label: 'Owner withdrawals', value: money(e.ownerWithdrawalCents), note: 'Drawings, not a business cost' },
    {
      label: 'Transfers',
      value: e.transfers.count === 0 ? 'None' : `${e.transfers.count} · in ${money(e.transfers.moneyInCents)} · out ${money(e.transfers.moneyOutCents)}`,
      note: 'Ledger entries whose description or notes say "transfer"',
    },
  ]
  if (data.mode === 'accrual') {
    rows.push({
      label: 'Vendor payments replaced by bills',
      value: money(data.suppressedVendorPaymentsCents),
      note: 'Paid in this period to vendors whose bills are counted instead',
    })
  }

  return (
    <SectionCard>
      <SectionCardHeader>
        <SectionCardTitle className="text-base">Not in profit</SectionCardTitle>
        <SectionCardDescription className="text-xs">Recorded in this period but kept out of the statement</SectionCardDescription>
      </SectionCardHeader>
      <SectionCardContent>
        <dl className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <dt>
                {r.label}
                <span className="block text-xs text-muted-foreground">{r.note}</span>
              </dt>
              <dd className="font-mono tabular-nums sm:text-right">{r.value}</dd>
            </div>
          ))}
        </dl>
      </SectionCardContent>
    </SectionCard>
  )
}

function Limitations({ data }: { data: PnlResponse }) {
  return (
    <SectionCard>
      <SectionCardHeader>
        <SectionCardTitle className="text-base">Read this with the figures</SectionCardTitle>
        <SectionCardDescription className="text-xs">What the books cannot show for this result</SectionCardDescription>
      </SectionCardHeader>
      <SectionCardContent>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {data.limitations.map((l) => <li key={l}>{l}</li>)}
          {data.unknownCategories.length > 0 ? (
            <li>
              Counted under Other because the report does not recognise the category:{' '}
              {data.unknownCategories.join(', ')}.
            </li>
          ) : null}
          <li className="text-muted-foreground">
            Costs use each vendor&apos;s current category, so moving a vendor to another category also moves its past costs.
          </li>
        </ul>
      </SectionCardContent>
    </SectionCard>
  )
}
