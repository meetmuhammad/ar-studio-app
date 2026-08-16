'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  /** One line explaining why the surface is empty. */
  message: string
  /** Optional call to action — a link or button. */
  action?: React.ReactNode
  className?: string
}

/**
 * Shown when a surface has loaded successfully but has nothing to display.
 * Distinct from the error state: an empty result is data, a failed fetch is not.
 */
export function EmptyState({ icon: Icon, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-10 text-center',
        className
      )}
    >
      <Icon className="size-10 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}
