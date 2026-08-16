'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Home, 
  Users, 
  ShoppingBag, 
  Ruler,
  BookOpen,
  Building2,
  LogOut
} from 'lucide-react'

const navigation = [
  {
    name: 'Dashboard',
    href: '/',
    icon: Home,
    roles: ['admin'], // Only admin can access
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: Users,
    roles: ['admin', 'staff'], // Both admin and staff
  },
  {
    name: 'Orders',
    href: '/orders',
    icon: ShoppingBag,
    roles: ['admin', 'staff'], // Both admin and staff
  },
  {
    name: 'Measurements',
    href: '/measurements',
    icon: Ruler,
    roles: ['admin', 'staff'], // Both admin and staff
  },
  {
    name: 'Ledger',
    href: '/ledger',
    icon: BookOpen,
    roles: ['admin'], // Only admin can access
  },
  {
    name: 'Vendors',
    href: '/vendors',
    icon: Building2,
    roles: ['admin'], // Only admin can access
  },
]

interface SidebarProps {
  onLinkClick?: () => void
}

export function Sidebar({ onLinkClick }: SidebarProps) {
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

  const handleLinkClick = () => {
    onLinkClick?.()
  }

  // Get filtered navigation items
  const filteredNavigation = user?.role 
    ? navigation.filter((item) => item.roles.includes(user.role))
    : []

  return (
    <div className="flex flex-col h-full bg-card border-border">
      <div className="flex items-center justify-center h-16 px-4 bg-primary text-primary-foreground">
        {/* Wordmark, not a heading: the page's own h1 belongs to its content.
            Rendering this as an h1 put two (three with the mobile sheet) on every
            page and broke heading order for screen readers. */}
        <span className="text-xl font-bold">AR Dashboard</span>
      </div>
      
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-2 text-sm text-muted-foreground animate-pulse">
            Loading navigation...
          </div>
        ) : (
          filteredNavigation.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/' && pathname.startsWith(item.href))
            
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={handleLinkClick}
                className={cn(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors no-underline',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon
                  className={cn(
                    'mr-3 h-5 w-5 flex-shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-accent-foreground'
                  )}
                />
                {item.name}
              </Link>
            )
          })
        )}
      </nav>

      <div className="flex-shrink-0 px-4 py-4 border-t border-border space-y-3">
        <div className="flex items-center">
          <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-medium">
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.email?.split('@')[0] || 'User'}
            </p>
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
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
          className="w-full justify-start text-muted-foreground hover:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
