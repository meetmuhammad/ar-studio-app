'use client'

import { Building2, Layers } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBusiness } from '@/contexts/business-context'
import { ALL_BUSINESSES } from '@/lib/business-shared'
import { cn } from '@/lib/utils'

/**
 * Business switcher for the dashboard header. Lists only the caller's
 * memberships; with a single business it is a plain label. Admins with more
 * than one business also get "All businesses" (read-only combined view).
 */
export function BusinessSwitcher({ className }: { className?: string }) {
  const { businesses, business, isAll, canViewAll, ready, switchBusiness } = useBusiness()

  if (!ready || businesses.length === 0) return null

  if (businesses.length === 1 && !canViewAll) {
    return (
      <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-sm font-medium', className)}>
        <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{businesses[0].name}</span>
      </span>
    )
  }

  return (
    <Select value={isAll ? ALL_BUSINESSES : business?.id} onValueChange={(v) => void switchBusiness(v)}>
      <SelectTrigger size="sm" aria-label="Business" className={cn('min-w-0 max-w-[11rem] sm:max-w-[16rem]', className)}>
        {isAll ? (
          <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <SelectValue placeholder="Business" />
      </SelectTrigger>
      <SelectContent align="start">
        {businesses.map((b) => (
          <SelectItem key={b.id} value={b.id} className="min-h-11 sm:min-h-0">
            {b.name}
          </SelectItem>
        ))}
        {canViewAll && (
          <>
            <SelectSeparator />
            <SelectItem value={ALL_BUSINESSES} className="min-h-11 sm:min-h-0">
              All businesses (read only)
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  )
}
