'use client'

import { DatePicker, Segmented, Space } from 'antd'
import dayjs from 'dayjs'
import { PNL_PRESETS, resolvePnlRange, type PnlPreset } from '@/lib/pnl'
import { todayInBusinessZone } from '@/lib/date-range'

export type PeriodPreset = PnlPreset
export interface Period {
  preset: PeriodPreset
  custom: { start?: string; end?: string }
}

/** The inclusive dates a period covers (presets: whole period containing today, Asia/Karachi). */
export function resolvePeriod(period: Period): { start: string; end: string } | null {
  const resolved = resolvePnlRange(period.preset, period.custom, todayInBusinessZone())
  return 'range' in resolved ? resolved.range : null
}

/**
 * The period before: the previous month / quarter / year for presets, the same
 * number of days just before for a custom range. Used for trends.
 */
export function previousPeriod(preset: PeriodPreset, range: { start: string; end: string }) {
  const start = dayjs(range.start)
  const end = dayjs(range.end)
  if (preset === 'this_month') {
    const s = start.subtract(1, 'month').startOf('month')
    return { start: s.format('YYYY-MM-DD'), end: s.endOf('month').format('YYYY-MM-DD') }
  }
  if (preset === 'this_quarter') {
    const s = start.subtract(3, 'month').startOf('month')
    return { start: s.format('YYYY-MM-DD'), end: s.add(2, 'month').endOf('month').format('YYYY-MM-DD') }
  }
  if (preset === 'this_year') {
    const s = start.subtract(1, 'year').startOf('year')
    return { start: s.format('YYYY-MM-DD'), end: s.endOf('year').format('YYYY-MM-DD') }
  }
  const days = end.diff(start, 'day') + 1
  return {
    start: start.subtract(days, 'day').format('YYYY-MM-DD'),
    end: start.subtract(1, 'day').format('YYYY-MM-DD'),
  }
}

export const PERIOD_LABEL: Record<PeriodPreset, string> = Object.fromEntries(
  PNL_PRESETS.map((p) => [p.value, p.label])
) as Record<PeriodPreset, string>

/**
 * Preset switch (This Month / This Quarter / This Year / Custom) with a date
 * range picker for Custom. Switching to Custom starts from the dates the
 * previous preset covered.
 *
 * Accessible names: "Period" (the switch), "Custom range" (the picker).
 */
export function PeriodPicker({ value, onChange }: { value: Period; onChange: (next: Period) => void }) {
  const current = resolvePeriod(value)
  return (
    <Space wrap size={8}>
      <Segmented
        aria-label="Period"
        value={value.preset}
        options={PNL_PRESETS.map((p) => ({ value: p.value, label: p.label }))}
        onChange={(preset) => {
          const next = preset as PeriodPreset
          if (next === 'custom' && current) onChange({ preset: next, custom: { start: current.start, end: current.end } })
          else onChange({ ...value, preset: next })
        }}
      />
      {value.preset === 'custom' && (
        <DatePicker.RangePicker
          aria-label="Custom range"
          allowClear={false}
          format="MMM D, YYYY"
          value={value.custom.start && value.custom.end ? [dayjs(value.custom.start), dayjs(value.custom.end)] : null}
          onChange={(dates) =>
            onChange({
              preset: 'custom',
              custom: {
                start: dates?.[0]?.format('YYYY-MM-DD'),
                end: dates?.[1]?.format('YYYY-MM-DD'),
              },
            })
          }
        />
      )}
    </Space>
  )
}
