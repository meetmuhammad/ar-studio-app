'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme-toggle'
import { isActivePath, moreItemsFor, tabItemsFor } from './nav-items'

/**
 * Phone navigation (below md): a bottom tab bar with the primary destinations
 * and a "More" sheet for everything else plus account actions. Tablets and
 * desktop use the sidebar instead, so this renders nothing there.
 *
 * Respects the home-indicator safe area. The dashboard layout reserves the
 * same height at the bottom of <main>, so no content is ever hidden behind it.
 */
export function BottomNav() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  const tabs = tabItemsFor(user?.role)
  const more = moreItemsFor(user?.role)
  const moreActive = more.some((i) => isActivePath(pathname, i.href))

  const handleSignOut = async () => {
    try {
      await signOut()
      window.location.href = '/sign-in'
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  if (!user) return null

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-xl items-stretch justify-around">
          {tabs.map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'no-underline flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium leading-tight transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <item.icon className="size-5" aria-hidden="true" />
                  <span>{item.tabLabel ?? item.name}</span>
                </Link>
              </li>
            )
          })}
          <li className="flex-1">
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium leading-tight transition-colors',
                moreActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
          // The sheet is opened by a plain button (not a Radix Trigger), so hand focus back to it explicitly.
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            moreButtonRef.current?.focus()
          }}
        >
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">Other sections and account actions</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto overscroll-contain px-2 pb-2">
            {more.length > 0 && (
              <ul aria-label="More sections" className="mb-2 space-y-1">
                {more.map((item) => {
                  const active = isActivePath(pathname, item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'no-underline flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium',
                          active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'
                        )}
                      >
                        <item.icon className="size-5" aria-hidden="true" />
                        {item.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="flex items-center justify-between gap-3 border-t px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.email?.split('@')[0] || 'User'}</p>
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                    {user.role}
                  </Badge>
                </div>
              </div>
              <ThemeToggle />
            </div>
            <Button variant="ghost" onClick={handleSignOut} className="mt-1 w-full justify-start text-muted-foreground">
              <LogOut className="mr-2 size-4" aria-hidden="true" />
              Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
