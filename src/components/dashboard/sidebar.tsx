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
  BarChart3,
  Settings,
  Code,
  LogOut
} from 'lucide-react'

const navigation = [
  {
    name: 'Dashboard',
    href: '/',
    icon: Home,
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: Users,
  },
  {
    name: 'Orders',
    href: '/orders',
    icon: ShoppingBag,
  },
  {
    name: 'API Test',
    href: '/api-test',
    icon: Code,
  },
  {
    name: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <div className="flex flex-col w-64 bg-card border-r border-border">
      <div className="flex items-center justify-center h-16 px-4 bg-primary text-primary-foreground">
        <h1 className="text-xl font-bold">AR Dashboard</h1>
      </div>
      
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
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
        })}
      </nav>

      <div className="flex-shrink-0 px-4 py-4 border-t border-border space-y-3">
        <div className="flex items-center">
          <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-medium">
              {user?.name?.[0] || user?.email[0].toUpperCase()}
            </span>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.name || 'User'}
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
