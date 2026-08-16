'use client'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  /** Rendered as the page's single h1. */
  title: string
  /** Optional supporting line, e.g. a freshness timestamp. */
  description?: string
  /** Right-aligned page-level actions. */
  actions?: React.ReactNode
  className?: string
}

/**
 * Standard page heading: h1 + optional sub-line + page-level actions.
 *
 * Supplies the h1 that dashboard routes previously lacked entirely — the highest
 * heading rendered was an h2, which broke heading order for screen readers.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4',
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
