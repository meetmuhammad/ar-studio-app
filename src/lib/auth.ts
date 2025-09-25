import { supabase } from './supabase-client'
import { User, UserRole } from './supabase-client'

export interface AuthUser {
  id: string
  email: string
  name?: string
  role: UserRole
}

// Sign in with email and password
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

// Sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    throw new Error(error.message)
  }
}

// Get current user session
export async function getCurrentUser(): Promise<AuthUser | null> {
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session) {
    return null
  }

  // Get user profile from our users table
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single()

  if (profileError || !userProfile) {
    return null
  }

  return {
    id: userProfile.id,
    email: userProfile.email,
    name: userProfile.name,
    role: userProfile.role,
  }
}

// Check if user has required role
export function hasRole(user: AuthUser | null, requiredRoles: UserRole[]): boolean {
  if (!user) return false
  return requiredRoles.includes(user.role)
}

// Check if user is admin
export function isAdmin(user: AuthUser | null): boolean {
  return hasRole(user, ['admin'])
}

// Check if user is staff or admin
export function isStaffOrAdmin(user: AuthUser | null): boolean {
  return hasRole(user, ['admin', 'staff'])
}