'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Loader2 } from 'lucide-react'

interface RouteGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
  requiredRoles?: ('admin' | 'staff')[]
}

export function RouteGuard({ 
  children, 
  requireAuth = true, 
  requiredRoles = ['admin', 'staff']
}: RouteGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (requireAuth && !user) {
        router.replace('/sign-in')
        return
      }

      if (user && requiredRoles.length > 0) {
        const hasRequiredRole = requiredRoles.includes(user.role)
        if (!hasRequiredRole) {
          router.replace('/sign-in')
          return
        }
      }
    }
  }, [user, loading, requireAuth, requiredRoles, router])

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // If auth is required but user is not authenticated, show loading
  // (redirect is handled in useEffect)
  if (requireAuth && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  // If roles are required but user doesn't have them, show loading
  if (user && requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.includes(user.role)
    if (!hasRequiredRole) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Redirecting...</p>
          </div>
        </div>
      )
    }
  }

  return <>{children}</>
}
