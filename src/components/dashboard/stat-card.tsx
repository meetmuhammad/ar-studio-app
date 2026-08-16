'use client'

import Link from 'next/link'
import { ArrowUpRight, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionCard } from '@/components/dashboard/section-card'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: string
  /** Pre-formatted display value. */
  value: string
  icon: LucideIcon
  href: string
  /** Footer link text, e.g. "View all orders". */
  linkLabel: string
  /**
   * Month-over-month change. Omit entirely when the payload cannot support it —
   * never render a placeholder or an invented figure.
   */
  delta?: { percent: number; previousLabel: string }
  /** Static supporting line, e.g. "+12 orders this month". */
  footnote?: string
  /** Progress indicator, 0-100. Descriptive only — not a target attainment. */
  progress?: { percent: number; label: string }
  /** Optional trend visual rendered beneath the value. */
  sparkline?: React.ReactNode
  /** Emphasises the value, used for money owed. */
  emphasis?: 'default' | 'warning'
  isLoading?: boolean
}

export function StatCard({
  label,
  value,
  icon: Icon,
  href,
  linkLabel,
  delta,
  footnote,
  progress,
  sparkline,
  emphasis = 'default',
  isLoading = false,
}: StatCardProps) {
  if (isLoading) return <StatCardSkeleton />

  const isPositive = delta ? delta.percent >= 0 : false
  const DeltaIcon = isPositive ? TrendingUp : TrendingDown

  return (
    <SectionCard className="gap-0 py-0 transition-colors hover:bg-accent/50 focus-within:bg-accent/50">
      <Link
        href={href}
        className="flex h-full flex-col gap-2 rounded-lg p-4 no-underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>

        <div
          className={cn(
            // Steps back down at xl: that is where the row goes 4-up, leaving
            // each card narrow enough that a 7-figure value wraps mid-number.
            'font-mono text-2xl font-semibold tabular-nums sm:text-3xl xl:text-2xl',
            emphasis === 'warning' && 'text-warning-text'
          )}
        >
          {value}
        </div>

        {delta ? (
          <p
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              isPositive ? 'text-success-text' : 'text-warning-text'
            )}
          >
            <DeltaIcon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {isPositive ? '+' : ''}
              {delta.percent}% vs {delta.previousLabel}
            </span>
          </p>
        ) : null}

        {footnote ? <p className="text-xs text-muted-foreground">{footnote}</p> : null}

        {progress ? (
          <div className="space-y-1">
            <div
              className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={progress.label}
            >
              <div
                className="h-full bg-warning transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{progress.label}</p>
          </div>
        ) : null}

        {sparkline}

        <span className="mt-auto flex items-center gap-1 pt-1 text-xs text-muted-foreground">
          {linkLabel}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </span>
      </Link>
    </SectionCard>
  )
}

function StatCardSkeleton() {
  return (
    <SectionCard className="gap-0 py-0">
      <div className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="size-4" />
        </div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-auto h-4 w-24" />
      </div>
    </SectionCard>
  )
}
