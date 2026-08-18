'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { SectionCard, SectionCardContent, SectionCardHeader } from '@/components/dashboard/section-card'

interface TableSkeletonProps {
  /** Match the real table's column count so the header row doesn't jump. */
  columns: number
  rows?: number
}

/**
 * Placeholder for a loading table.
 *
 * Replaces the "Loading…" line every route used to render. That line was a
 * single centred string, so the whole page reflowed the moment data landed;
 * this occupies the same footprint as the table it stands in for.
 */
export function TableSkeleton({ columns, rows = 8 }: TableSkeletonProps) {
  return (
    <SectionCard aria-busy="true" aria-live="polite" aria-label="Loading results">
      <SectionCardHeader>
        <Skeleton className="h-5 w-40" />
      </SectionCardHeader>
      <SectionCardContent className="space-y-3">
        <div className="flex gap-4 border-b pb-3">
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton key={column} className="h-3.5 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex gap-4 py-1">
            {Array.from({ length: columns }).map((_, column) => (
              <Skeleton key={column} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </SectionCardContent>
    </SectionCard>
  )
}

/** KPI row placeholder, sized to the StatCard grid it precedes. */
export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <SectionCard key={index} className="gap-0 py-0">
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        </SectionCard>
      ))}
    </div>
  )
}
