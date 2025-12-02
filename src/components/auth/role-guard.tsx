'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Loader2 } from 'lucide-react'

interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles: ('admin' | 'staff')[]
  redirectTo?: string
}

export function RoleGuard({ 
  children, 
  allowedRoles,
  redirectTo = '/customers' // Default redirect for staff users
}: RoleGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      const hasAccess = allowedRoles.includes(user.role)
      if (!hasAccess) {
        router.replace(redirectTo)
      }
    }
  }, [user, loading, allowedRoles, redirectTo, router])

  // Show loading while checking role
  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // If user doesn't have access, show loading while redirecting
  if (user && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
