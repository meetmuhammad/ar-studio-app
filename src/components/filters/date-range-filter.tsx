'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DATE_RANGE_PRESETS,
  fromDateString,
  isDateRangePreset,
  selectionToBounds,
  toDateString,
  type DateRangeSelection,
} from '@/lib/date-range'

interface DateRangeFilterProps {
  value: DateRangeSelection
  onChange: (value: DateRangeSelection) => void
}

/**
 * Preset dropdown (All Time / This Year / Last 3 Months / This Month / Custom)
 * with From/To pickers shown for Custom. Switching to Custom starts from the
 * dates the previous preset covered, so the table does not jump.
 */
export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const isCustom = value.preset === 'custom'

  const changePreset = (preset: string) => {
    if (!isDateRangePreset(preset)) return
    if (preset === 'custom') onChange({ preset, ...selectionToBounds(value) })
    else onChange({ preset })
  }

  const setBound = (side: 'start' | 'end', date: Date | undefined) =>
    onChange({ ...value, preset: 'custom', [side]: date ? toDateString(date) : undefined })

  const start = value.start ? fromDateString(value.start) : undefined
  const end = value.end ? fromDateString(value.end) : undefined

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <Label className="text-sm text-muted-foreground whitespace-nowrap">Date range</Label>
        <Select value={value.preset} onValueChange={changePreset}>
          <SelectTrigger className="w-full sm:w-[160px]" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isCustom && (
        <>
          <BoundPicker label="From" date={start} maxDate={end} onChange={(d) => setBound('start', d)} />
          <BoundPicker label="To" date={end} minDate={start} onChange={(d) => setBound('end', d)} />
        </>
      )}
    </div>
  )
}

function BoundPicker({ label, date, minDate, maxDate, onChange }: {
  label: string
  date?: Date
  minDate?: Date
  maxDate?: Date
  onChange: (date: Date | undefined) => void
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <Label className="text-sm text-muted-foreground whitespace-nowrap">{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        <DatePicker
          date={date}
          onDateChange={onChange}
          placeholder={`${label} date`}
          className="w-full sm:w-[160px]"
          minDate={minDate}
          maxDate={maxDate}
        />
        {date && (
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
