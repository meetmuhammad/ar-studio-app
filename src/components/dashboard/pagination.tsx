'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PaginationProps {
  currentPage: number
  totalPages: number
  /** Total row count across all pages, for the summary line. */
  totalItems: number
  /** Rows rendered on the current page. */
  pageItemCount: number
  pageSize: number
  /** Plural noun for the summary line, e.g. "entries". */
  itemLabel: string
  onPageChange: (page: number) => void
  className?: string
}

/**
 * Table pager, shared by every paginated route.
 *
 * `pageWindow` keeps the control a fixed width: without it a 40-page result
 * rendered 40 buttons and the row scrolled sideways.
 */
export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageItemCount,
  pageSize,
  itemLabel,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalItems === 0) return null

  const firstShown = (currentPage - 1) * pageSize + 1
  const lastShown = (currentPage - 1) * pageSize + pageItemCount
  const pages = pageWindow(currentPage, totalPages)

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className={cn(
        'flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row',
        className
      )}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        <span className="font-mono tabular-nums">{firstShown}</span>–
        <span className="font-mono tabular-nums">{lastShown}</span> of{' '}
        <span className="font-mono tabular-nums">{totalItems}</span> {itemLabel}
      </p>

      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous page"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          {pages.map((page, index) =>
            page === null ? (
              <span
                key={`gap-${index}`}
                aria-hidden="true"
                className="px-1 text-xs text-muted-foreground"
              >
                &hellip;
              </span>
            ) : (
              <Button
                key={page}
                variant={page === currentPage ? 'default' : 'outline'}
                size="sm"
                aria-label={`Page ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
                onClick={() => onPageChange(page)}
                className="min-w-9 font-mono tabular-nums"
              >
                {page}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            aria-label="Next page"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </nav>
  )
}

/**
 * First page, last page, and the current page's neighbours; `null` marks an
 * elided run. Never returns two gaps in a row.
 */
function pageWindow(current: number, total: number): Array<number | null> {
  const shown = new Set<number>([1, total, current, current - 1, current + 1])
  const pages = [...shown].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b)

  return pages.flatMap((page, index) =>
    index > 0 && page - pages[index - 1] > 1 ? [null, page] : [page]
  )
}
