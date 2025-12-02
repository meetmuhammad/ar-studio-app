import { createServerSupabaseClient } from './supabase'
import { NextRequest, NextResponse } from 'next/server'

export type UserRole = 'admin' | 'staff'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

/**
 * Get the authenticated user from the request
 * Returns null if not authenticated
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    const supabase = createServerSupabaseClient()
    
    // Get session from Supabase
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session?.user) {
      return null
    }
    
    // Fetch user role from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()
    
    if (userError || !userData) {
      return null
    }
    
    return {
      id: session.user.id,
      email: session.user.email || '',
      role: userData.role as UserRole
    }
  } catch (error) {
    console.error('Error getting auth user:', error)
    return null
  }
}

/**
 * Middleware to protect API routes based on user roles
 * Returns unauthorized response if user doesn't have required role
 */
export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole[]
): Promise<{ user: AuthUser } | NextResponse> {
  const user = await getAuthUser(request)
  
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized - Please sign in' },
      { status: 401 }
    )
  }
  
  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: 'Forbidden - Insufficient permissions' },
      { status: 403 }
    )
  }
  
  return { user }
}

/**
 * Middleware to require admin role
 */
export async function requireAdmin(request: NextRequest): Promise<{ user: AuthUser } | NextResponse> {
  return requireRole(request, ['admin'])
}

/**
 * Middleware to require authentication (any role)
 */
export async function requireAuth(request: NextRequest): Promise<{ user: AuthUser } | NextResponse> {
  return requireRole(request, ['admin', 'staff'])
}
