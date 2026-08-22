'use client'

import { DollarSign, Menu, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { useDashboardActions } from '@/contexts/dashboard-actions'

interface HeaderProps {
  onMenuClick?: () => void
}

/**
 * Global chrome: mobile navigation trigger, global Create Order / Add Payment
 * actions, and theme toggle.
 *
 * Restored globally by request: "Create New Order" / "Add New Payment" used to
 * render on every route from here. A 2026-08-16 redesign moved them to be
 * page-level actions on the Dashboard only; they're brought back here so they're
 * reachable from any page again. Header renders inside DashboardActionsProvider
 * (see the dashboard layout), so the openers are read straight from context
 * instead of being prop-drilled. The dialogs themselves are still owned by the
 * dashboard layout, unchanged.
 */
export function Header({ onMenuClick }: HeaderProps) {
  const actions = useDashboardActions()

  return (
    // Solid, not translucent-blurred: a frosted bar is the one glassmorphic
    // note left in the chrome, and it fights a flat, data-first surface.
    <header className="bg-background border-b border-border">
      <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>

        {actions ? (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={actions.openOrderDialog}>
              <Plus className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Create New Order</span>
              <span className="sm:hidden">Order</span>
            </Button>
            <Button size="sm" variant="outline" onClick={actions.openPaymentDialog}>
              <DollarSign className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Add New Payment</span>
              <span className="sm:hidden">Payment</span>
            </Button>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
