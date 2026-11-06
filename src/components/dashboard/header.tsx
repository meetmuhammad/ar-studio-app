'use client'

import { DollarSign, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import { useDashboardActions } from '@/contexts/dashboard-actions'
import { useBusiness } from '@/contexts/business-context'
import { BusinessSwitcher } from '@/components/dashboard/business-switcher'

/**
 * Global chrome: global Create Order / Add Payment actions and the theme toggle.
 *
 * Phones (below md) get a compact bar: the wordmark and one "Create" menu that
 * holds both actions; navigation lives in the bottom tab bar and the theme
 * toggle in its More sheet. From md up the two labelled buttons and the theme
 * toggle return, and navigation is the sidebar.
 *
 * "Create New Order" / "Add New Payment" were restored globally by request
 * (reachable from any page); nothing was removed here, only regrouped. Header
 * renders inside DashboardActionsProvider, so the openers come from context.
 * The dialogs themselves are still owned by the dashboard layout.
 *
 * The business switcher sits at the left on every breakpoint. In the admin
 * "All businesses" view the create actions are disabled: that view is
 * read-only and writes always target one business.
 */
export function Header() {
  const actions = useDashboardActions()
  const { isAll, businesses } = useBusiness()
  const readOnly = isAll

  return (
    <header className="border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <div className="flex h-12 items-center justify-between gap-2 px-3 md:h-auto md:px-6 md:py-3">
        <div className="flex min-w-0 items-center gap-2">
          {businesses.length <= 1 && (
            <span className="text-base font-semibold tracking-tight md:hidden">AR Studio</span>
          )}
          <BusinessSwitcher className={businesses.length <= 1 ? 'hidden md:inline-flex' : undefined} />
        </div>

        {actions ? (
          <>
            {/* Phones: one menu, same two actions. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="md:hidden" disabled={readOnly} title={readOnly ? 'Read-only: pick one business' : undefined}>
                  <Plus className="size-4" aria-hidden="true" />
                  Create
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem className="min-h-11" onSelect={actions.openOrderDialog}>
                  <Plus className="size-4" aria-hidden="true" />
                  New order
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11" onSelect={actions.openPaymentDialog}>
                  <DollarSign className="size-4" aria-hidden="true" />
                  Add payment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Tablet and desktop: the original labelled buttons. */}
            <div className="hidden items-center gap-2 md:flex">
              <Button size="sm" onClick={actions.openOrderDialog} disabled={readOnly} title={readOnly ? 'Read-only: pick one business' : undefined}>
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden lg:inline">Create New Order</span>
                <span className="lg:hidden">Order</span>
              </Button>
              <Button size="sm" variant="outline" onClick={actions.openPaymentDialog} disabled={readOnly} title={readOnly ? 'Read-only: pick one business' : undefined}>
                <DollarSign className="size-4" aria-hidden="true" />
                <span className="hidden lg:inline">Add New Payment</span>
                <span className="lg:hidden">Payment</span>
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1" />
        )}

        <div className="hidden items-center md:flex">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
