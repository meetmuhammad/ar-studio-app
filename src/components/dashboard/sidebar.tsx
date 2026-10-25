'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogOut } from 'lucide-react'
import { isActivePath, itemsFor } from './nav-items'

interface SidebarProps {
  onLinkClick?: () => void
  /**
   * Icon-only rail (iPad portrait and narrow tablet windows). The labels stay in
   * the DOM as accessible names and tooltips; only their visual size changes.
   * The layout switches to the full sidebar from the lg breakpoint.
   */
  responsiveRail?: boolean
}

export function Sidebar({ onLinkClick, responsiveRail = false }: SidebarProps) {
  const pathname = usePathname()
  const { user, loading, signOut } = useAuth()

  const handleSignOut = async () => {
    try {
      await signOut()
      window.location.href = '/sign-in'
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const filteredNavigation = itemsFor(user?.role)

  // Class helpers: in rail mode the label/detail text is visually hidden below lg.
  const hideInRail = responsiveRail ? 'sr-only lg:not-sr-only' : ''
  const railOnly = responsiveRail ? 'hidden lg:block' : ''

  return (
    <div className="flex h-full w-full flex-col bg-sidebar border-border">
      <div className="flex h-16 items-center justify-center border-b border-sidebar-border px-4">
        {/* Wordmark, not a heading: the page's own h1 belongs to its content. */}
        <span className="text-base font-semibold tracking-tight text-sidebar-foreground">
          {responsiveRail ? (
            <>
              <span className="lg:hidden" aria-hidden="true">AR</span>
              <span className="sr-only lg:not-sr-only">AR Dashboard</span>
            </>
          ) : (
            'AR Dashboard'
          )}
        </span>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {loading ? (
          <div className="animate-pulse px-3 py-2 text-sm text-muted-foreground">
            <span className={hideInRail}>Loading navigation...</span>
          </div>
        ) : (
          filteredNavigation.map((item) => {
            const isActive = isActivePath(pathname, item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onLinkClick}
                title={item.name}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors no-underline pointer-coarse:min-h-11',
                  responsiveRail && 'justify-center lg:justify-start',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon
                  aria-hidden="true"
                  className={cn(
                    'h-5 w-5 flex-shrink-0',
                    responsiveRail ? 'lg:mr-3' : 'mr-3',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-accent-foreground'
                  )}
                />
                <span className={hideInRail}>{item.name}</span>
              </Link>
            )
          })
        )}
      </nav>

      <div className="flex-shrink-0 space-y-3 border-t border-border px-2 py-4 lg:px-4">
        <div className={cn('flex items-center', responsiveRail && 'justify-center lg:justify-start')}>
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary"
            title={user?.email}
          >
            <span className="text-sm font-medium text-primary-foreground">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className={cn('ml-3 min-w-0 flex-1', railOnly)}>
            <p className="truncate text-sm font-medium text-foreground">
              {user?.email?.split('@')[0] || 'User'}
            </p>
            <div className="flex items-center gap-1">
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              <Badge variant={user?.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                {user?.role}
              </Badge>
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          title="Sign Out"
          className={cn(
            'w-full text-muted-foreground hover:text-foreground',
            responsiveRail ? 'justify-center lg:justify-start' : 'justify-start'
          )}
        >
          <LogOut className={cn('h-4 w-4', responsiveRail ? 'lg:mr-2' : 'mr-2')} aria-hidden="true" />
          <span className={hideInRail}>Sign Out</span>
        </Button>
      </div>
    </div>
  )
}
