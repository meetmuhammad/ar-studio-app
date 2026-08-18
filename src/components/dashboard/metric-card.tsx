'use client'

import type { LucideIcon } from 'lucide-react'
import { SectionCard } from '@/components/dashboard/section-card'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  label: string
  /** Pre-formatted display value. */
  value: string
  /** One line saying what the figure means. */
  caption?: string
  icon?: LucideIcon
  /**
   * Tints the value only. Reserved for money direction on the ledger surfaces;
   * the caption always states the same thing in words, so the colour is never
   * the only carrier.
   */
  tone?: 'default' | 'positive' | 'negative' | 'warning'
  /**
   * Set for figures that can legitimately be zero. A zero has no direction, so
   * it drops back to the default ink rather than rendering "PKR 0" in alarm red.
   */
  isZero?: boolean
}

const TONE_CLASS: Record<NonNullable<MetricCardProps['tone']>, string> = {
  default: '',
  positive: 'text-success-text',
  negative: 'text-destructive-text',
  warning: 'text-warning-text',
}

/**
 * A figure with no destination.
 *
 * `StatCard` is the navigating variant and requires an `href`; these ledger
 * totals summarise the table directly beneath them, so there is nowhere for
 * them to lead. Same type scale and density, no link affordance.
 */
export function MetricCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = 'default',
  isZero = false,
}: MetricCardProps) {
  const appliedTone = isZero ? 'default' : tone
  return (
    <SectionCard className="gap-0 py-0">
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {Icon ? (
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : null}
        </div>

        <div
          className={cn(
            // Steps down at xl where the row goes 4-up and a 7-figure PKR value
            // would otherwise wrap mid-number.
            'font-mono text-2xl font-semibold tabular-nums sm:text-3xl xl:text-2xl',
            TONE_CLASS[appliedTone]
          )}
        >
          {value}
        </div>

        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      </div>
    </SectionCard>
  )
}
