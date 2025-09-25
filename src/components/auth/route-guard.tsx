'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { isStaffOrAdmin } from '@/lib/auth'
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
        // User is not authenticated, redirect to sign in
        router.push('/sign-in')
        return
      }

      if (user && requiredRoles.length > 0) {
        // Check if user has required role
        const hasRequiredRole = requiredRoles.includes(user.role)
        if (!hasRequiredRole) {
          // User doesn't have required role, could redirect to unauthorized page
          // For now, redirect to sign in
          router.push('/sign-in')
          return
        }
      }
    }
  }, [user, loading, requireAuth, requiredRoles, router])

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // If auth is required but user is not authenticated, don't render children
  if (requireAuth && !user) {
    return null
  }

  // If roles are required but user doesn't have them, don't render children
  if (user && requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.includes(user.role)
    if (!hasRequiredRole) {
      return null
    }
  }

  return <>{children}</>
}