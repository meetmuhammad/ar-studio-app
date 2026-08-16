'use client'

import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

interface HeaderProps {
  onMenuClick?: () => void
}

/**
 * Global chrome: mobile navigation trigger and theme toggle.
 *
 * "Create New Order" / "Add New Payment" used to live here and therefore rendered
 * on every route regardless of relevance, occupying the primary slot ahead of any
 * page identity. They are now page-level actions rendered by PageHeader; the
 * dialogs themselves are still owned by the dashboard layout.
 */
export function Header({ onMenuClick }: HeaderProps) {
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

        {/* Spacer keeps the theme toggle right-aligned once the menu button is hidden */}
        <div className="flex-1" />

        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
