'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * `Card` preset at the dashboard's tempered density.
 *
 * shadcn's Card defaults to `gap-6 rounded-xl py-6 shadow-sm` — spacious and
 * elevated. The design direction is flat and dense, so the overrides live here
 * once instead of being repeated at every call site.
 */
export function SectionCard({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Card
      className={cn('gap-4 rounded-lg py-4 shadow-none', className)}
      {...props}
    />
  )
}

export function SectionCardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <CardHeader className={cn('gap-1 px-4', className)} {...props} />
}

export function SectionCardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <CardContent className={cn('px-4', className)} {...props} />
}

export { CardTitle as SectionCardTitle, CardDescription as SectionCardDescription, CardAction as SectionCardAction } from '@/components/ui/card'
