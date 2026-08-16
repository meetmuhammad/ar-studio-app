'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionCard, SectionCardContent } from '@/components/dashboard/section-card'

interface ErrorStateProps {
  title?: string
  /** Underlying failure detail. Shown verbatim so the cause isn't hidden. */
  detail?: string
  onRetry?: () => void
}

/**
 * Shown when a fetch fails.
 *
 * Rendering zeroes on failure — the previous behaviour — is indistinguishable
 * from a genuinely empty studio, so a failed load must say so explicitly.
 */
export function ErrorState({
  title = "Couldn't load dashboard data",
  detail,
  onRetry,
}: ErrorStateProps) {
  return (
    <SectionCard role="alert">
      <SectionCardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <AlertCircle className="size-10 text-destructive-text" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </Button>
        ) : null}
      </SectionCardContent>
    </SectionCard>
  )
}
