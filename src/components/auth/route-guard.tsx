'use client'

import { useEffect, useState } from 'react'
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
  const [minLoadingComplete, setMinLoadingComplete] = useState(false)

  // Ensure minimum loading time to prevent flash redirects
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinLoadingComplete(true)
    }, 500) // Wait at least 500ms

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Only redirect after both loading is complete AND minimum time has passed
    if (!loading && minLoadingComplete) {
      console.log('RouteGuard check:', { user: !!user, loading, minLoadingComplete, requireAuth })
      
      if (requireAuth && !user) {
        console.log('Redirecting to sign-in: no user after loading complete')
        router.push('/sign-in')
        return
      }

      if (user && requiredRoles.length > 0) {
        // Check if user has required role
        const hasRequiredRole = requiredRoles.includes(user.role)
        if (!hasRequiredRole) {
          console.log('Redirecting to sign-in: insufficient role')
          router.push('/sign-in')
          return
        }
      }
    }
  }, [user, loading, minLoadingComplete, requireAuth, requiredRoles, router])

  // Show loading while checking authentication or waiting for minimum time
  if (loading || !minLoadingComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // If still loading, don't render children yet
  if (!minLoadingComplete || loading) {
    return null
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