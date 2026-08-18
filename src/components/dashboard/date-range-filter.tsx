'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface DateRangeFilterProps {
  from: Date | undefined
  to: Date | undefined
  onFromChange: (date: Date | undefined) => void
  onToChange: (date: Date | undefined) => void
  className?: string
}

/**
 * From/to date range, used by both ledger surfaces.
 *
 * Each picker clamps the other's bounds, so an inverted range can't be entered
 * in the first place rather than being reported after the fact.
 */
export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  className,
}: DateRangeFilterProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>
      <DateField
        id="date-from"
        label="From"
        date={from}
        onDateChange={onFromChange}
        maxDate={to}
        clearLabel="Clear start date"
      />
      <DateField
        id="date-to"
        label="To"
        date={to}
        onDateChange={onToChange}
        minDate={from}
        clearLabel="Clear end date"
      />
    </div>
  )
}

function DateField({
  id,
  label,
  date,
  onDateChange,
  minDate,
  maxDate,
  clearLabel,
}: {
  id: string
  label: string
  date: Date | undefined
  onDateChange: (date: Date | undefined) => void
  minDate?: Date
  maxDate?: Date
  clearLabel: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Label
        htmlFor={id}
        className="w-8 shrink-0 text-xs font-normal text-muted-foreground"
      >
        {label}
      </Label>
      <DatePicker
        id={id}
        date={date}
        onDateChange={onDateChange}
        placeholder="Any date"
        // Fills its column instead of a fixed 160px: at 375px the old fixed
        // width pushed the clear button off the edge of the viewport.
        className="min-w-0 flex-1"
        minDate={minDate}
        maxDate={maxDate}
      />
      {/* Holds its column whether or not a date is set, so picking one doesn't
          reflow the row it sits in. */}
      <div className="size-9 shrink-0">
        {date ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={clearLabel}
            onClick={() => onDateChange(undefined)}
            className="size-9 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
