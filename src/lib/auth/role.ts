import { supabase } from '@/lib/supabase-client'

/**
 * The signed-in user's role (public.users.role), resolved the same way for the
 * legacy AuthContext and for Refine's authProvider/accessControlProvider, so
 * both always agree:
 *
 * - A cached role (localStorage, 24h, keyed by user id) is used immediately.
 * - Otherwise the role is read from public.users (10s timeout).
 * - Any failure falls back to 'staff', the least-privileged role.
 *
 * The browser role only decides what the UI shows. Every API route re-checks
 * the role server-side (src/lib/api-auth.ts) and RLS scopes every row.
 */

export type Role = 'admin' | 'staff'

export const ROLE_CACHE_KEY = 'ar_user_role_cache'
export const AUTH_CHANNEL = 'ar_auth_channel'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10000

export const getCachedRole = (userId: string): Role | null => {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(ROLE_CACHE_KEY)
    if (!cached) return null
    const { id, role, timestamp } = JSON.parse(cached)
    if (id === userId && Date.now() - timestamp < CACHE_TTL_MS) {
      return role
    }
  } catch (error) {
    console.error('Error reading cached role:', error)
  }
  return null
}

export const setCachedRole = (userId: string, role: Role) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ id: userId, role, timestamp: Date.now() }))
  } catch (error) {
    console.error('Error caching role:', error)
  }
}

export const clearCachedRole = () => {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(ROLE_CACHE_KEY)
  } catch (error) {
    console.error('Error clearing cached role:', error)
  }
}

/** Reads public.users.role. Throws on error or timeout. */
export async function fetchRole(userId: string): Promise<Role> {
  const { data, error } = await Promise.race([
    supabase.from('users').select('role').eq('id', userId).single(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Role fetch timeout')), FETCH_TIMEOUT_MS)),
  ])
  if (error) throw error
  return (data?.role as Role) || 'staff'
}

/** Cached role, else the database role (cached on success), else 'staff'. */
export async function resolveRole(userId: string): Promise<Role> {
  const cached = getCachedRole(userId)
  if (cached) return cached
  try {
    const role = await fetchRole(userId)
    setCachedRole(userId, role)
    return role
  } catch (error) {
    console.error('Failed to fetch user role:', error)
    return 'staff'
  }
}
