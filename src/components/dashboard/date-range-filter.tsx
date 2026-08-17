"use client"

import { CalendarRange } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DATE_RANGE_PRESETS,
  formatRangeLabel,
  type DateRange,
  type DateRangePreset,
} from '@/lib/date-range'

interface DateRangeFilterProps {
  preset: DateRangePreset
  onPresetChange: (preset: DateRangePreset) => void
  /** The dates behind "Custom Range". Ignored while a preset is selected. */
  customRange: DateRange
  onCustomRangeChange: (range: DateRange) => void
  /** The window actually in force, shown so the numbers are never ambiguous. */
  resolvedRange: DateRange
}

/**
 * Booking-date window selector for the dashboard.
 *
 * The custom inputs are native `<input type="date">` rather than the repo's
 * DatePicker. DatePicker speaks in `Date` objects, and converting a `Date` to
 * the calendar date a Postgres DATE column means requires knowing which zone
 * the user meant -- the exact ambiguity that made the old dashboard's month
 * boundaries wrong. A native date input hands back `YYYY-MM-DD` directly, with
 * no zone in the loop at all, and brings its own locale-aware calendar popup.
 */
export function DateRangeFilter({
  preset,
  onPresetChange,
  customRange,
  onCustomRangeChange,
  resolvedRange,
}: DateRangeFilterProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="dashboard-range-preset" className="text-xs text-muted-foreground">
          Booking date
        </Label>
        <Select
          value={preset}
          onValueChange={(value) => onPresetChange(value as DateRangePreset)}
        >
          <SelectTrigger id="dashboard-range-preset" className="w-[180px]">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_RANGE_PRESETS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {preset === 'custom' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dashboard-range-start" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="dashboard-range-start"
              type="date"
              className="w-[160px]"
              value={customRange.start}
              max={customRange.end}
              onChange={(event) =>
                onCustomRangeChange({ ...customRange, start: event.target.value })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dashboard-range-end" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="dashboard-range-end"
              type="date"
              className="w-[160px]"
              value={customRange.end}
              min={customRange.start}
              onChange={(event) =>
                onCustomRangeChange({ ...customRange, end: event.target.value })
              }
            />
          </div>
        </>
      ) : null}

      <p
        className="text-xs text-muted-foreground sm:pb-2"
        aria-live="polite"
      >
        Showing orders booked {formatRangeLabel(resolvedRange)}
      </p>
    </div>
  )
}
