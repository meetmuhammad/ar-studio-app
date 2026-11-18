import type { AuthProvider } from '@refinedev/core'
import { supabase } from '@/lib/supabase-client'
import { AUTH_CHANNEL, clearCachedRole, resolveRole, type Role } from '@/lib/auth/role'

/**
 * Refine authProvider over the same browser Supabase client the rest of the
 * app uses (src/lib/supabase-client.ts). The session therefore lives in one
 * place, and authFetch keeps sending the same access token to /api/*.
 *
 * - login: Supabase email + password, exactly as before.
 * - check: a Supabase session exists; otherwise redirect to /sign-in.
 * - getPermissions: the role from public.users ('admin' | 'staff'), resolved
 *   by src/lib/auth/role.ts, which the legacy AuthContext uses too.
 * - logout: signs out, clears the cached role and tells other tabs.
 * - onError: a 401 from the data layer signs the user out.
 */

export const SIGN_IN_PATH = '/sign-in'

export interface Identity {
  id: string
  email: string
  name: string
  role: Role
}

export interface LoginParams {
  email: string
  password: string
  /** Where to go after sign-in. The caller validates it. */
  redirectTo?: string
}

const broadcastSignOut = () => {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return
  const channel = new BroadcastChannel(AUTH_CHANNEL)
  channel.postMessage({ type: 'signout' })
  channel.close()
}

async function currentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}

export const authProvider: AuthProvider = {
  login: async ({ email, password, redirectTo }: LoginParams) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      return {
        success: false,
        error: { name: 'Sign in failed', message: error?.message ?? 'Failed to sign in' },
      }
    }
    // Warm the role cache so the shell renders the right navigation at once.
    await resolveRole(data.user.id)
    return { success: true, redirectTo: redirectTo ?? '/' }
  },

  logout: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Sign out error:', error)
    clearCachedRole()
    broadcastSignOut()
    return { success: true, redirectTo: SIGN_IN_PATH }
  },

  check: async () => {
    try {
      const user = await currentUser()
      if (user) return { authenticated: true }
    } catch (error) {
      console.error('Error getting auth session:', error)
    }
    return { authenticated: false, redirectTo: SIGN_IN_PATH }
  },

  getPermissions: async () => {
    const user = await currentUser()
    return user ? resolveRole(user.id) : null
  },

  getIdentity: async (): Promise<Identity | null> => {
    const user = await currentUser()
    if (!user) return null
    const email = user.email ?? ''
    return { id: user.id, email, name: email.split('@')[0] || 'User', role: await resolveRole(user.id) }
  },

  onError: async (error) => {
    const status = error?.statusCode ?? error?.status
    if (status === 401) return { logout: true, redirectTo: SIGN_IN_PATH, error }
    return { error }
  },
}
