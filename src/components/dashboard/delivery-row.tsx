'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface UpcomingOrder {
  id: string
  order_number: string
  delivery_date: string
  status: string
  customers: { name: string; phone: string }
}

/**
 * Whole days from today until `deliveryDate`, both normalised to local midnight
 * so a delivery later today reads as 0 rather than a fraction.
 */
export function daysUntil(deliveryDate: string): number {
  const target = new Date(deliveryDate)
  const today = new Date()
  target.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

interface DeliveryRowProps {
  order: UpcomingOrder
  href: string
}

/**
 * One upcoming delivery.
 *
 * Urgency is carried by three redundant signals — icon, badge text, and the
 * relative-day label — so the tinted surface never has to convey it alone.
 */
export function DeliveryRow({ order, href }: DeliveryRowProps) {
  const days = daysUntil(order.delivery_date)
  const isToday = days <= 0
  const isTomorrow = days === 1
  const isUrgent = days <= 2

  return (
    <Link href={href} className="block no-underline">
      <div
        className={cn(
          'flex min-h-11 items-start justify-between gap-2 rounded-md border p-3 transition-colors hover:bg-accent/50',
          isToday && 'border-destructive-border bg-destructive-surface',
          isTomorrow && 'border-warning-border bg-warning-surface',
          !isToday && !isTomorrow && isUrgent && 'border-warning-border'
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {isUrgent ? (
              <AlertCircle
                className={cn(
                  'size-3.5 shrink-0',
                  isToday ? 'text-destructive-text' : 'text-warning-text'
                )}
                aria-hidden="true"
              />
            ) : null}
            <span className="font-mono text-sm font-medium">{order.order_number}</span>
            {isToday ? (
              <Badge variant="destructive" className="text-xs">
                Today
              </Badge>
            ) : null}
            {isTomorrow ? (
              <Badge variant="warning" className="text-xs">
                Tomorrow
              </Badge>
            ) : null}
          </div>
          <div className="truncate text-sm font-medium">{order.customers.name}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {order.customers.phone}
          </div>
        </div>

        <div className="shrink-0 space-y-0.5 text-right">
          <div className="text-xs font-medium text-muted-foreground">
            {format(new Date(order.delivery_date), 'MMM d')}
          </div>
          <div
            className={cn(
              'text-xs',
              isToday && 'font-medium text-destructive-text',
              isTomorrow && 'font-medium text-warning-text',
              !isToday && !isTomorrow && 'text-muted-foreground'
            )}
          >
            {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : `${days}d`}
          </div>
        </div>
      </div>
    </Link>
  )
}
