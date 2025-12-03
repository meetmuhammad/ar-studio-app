'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'staff'
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const ROLE_CACHE_KEY = 'ar_user_role_cache'

// Helper functions for role caching
const getCachedRole = (userId: string): 'admin' | 'staff' | null => {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(ROLE_CACHE_KEY)
    if (!cached) return null
    const { id, role, timestamp } = JSON.parse(cached)
    // Cache is valid for 24 hours
    if (id === userId && Date.now() - timestamp < 24 * 60 * 60 * 1000) {
      return role
    }
  } catch (error) {
    console.error('Error reading cached role:', error)
  }
  return null
}

const setCachedRole = (userId: string, role: 'admin' | 'staff') => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({
      id: userId,
      role,
      timestamp: Date.now()
    }))
  } catch (error) {
    console.error('Error caching role:', error)
  }
}

const clearCachedRole = () => {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(ROLE_CACHE_KEY)
  } catch (error) {
    console.error('Error clearing cached role:', error)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null)

  // Convert Supabase user to our AuthUser format with role from database
  const createAuthUser = async (supabaseUser: User): Promise<AuthUser> => {
    const userId = supabaseUser.id
    
    // First, try to get cached role for instant load
    const cachedRole = getCachedRole(userId)
    
    try {
      // Fetch user role from database with longer timeout
      const { data: userData, error } = await Promise.race([
        supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .single(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Role fetch timeout')), 10000)
        )
      ])

      if (error) {
        console.error('Error fetching user role:', error)
        // If we have cached role, use it
        if (cachedRole) {
          console.log('Using cached role due to fetch error:', cachedRole)
          return {
            id: userId,
            email: supabaseUser.email || '',
            role: cachedRole
          }
        }
        // Otherwise default to staff
        return {
          id: userId,
          email: supabaseUser.email || '',
          role: 'staff'
        }
      }

      const role = (userData?.role as 'admin' | 'staff') || 'staff'
      
      // Cache the role for future use
      setCachedRole(userId, role)
      
      // Broadcast role update to other tabs
      broadcastChannelRef.current?.postMessage({ type: 'role-update', userId, role })

      return {
        id: userId,
        email: supabaseUser.email || '',
        role
      }
    } catch (error) {
      console.error('Failed to fetch user role:', error)
      
      // If we have cached role, use it
      if (cachedRole) {
        console.log('Using cached role due to exception:', cachedRole)
        return {
          id: userId,
          email: supabaseUser.email || '',
          role: cachedRole
        }
      }
      
      // Fallback to staff role
      return {
        id: userId,
        email: supabaseUser.email || '',
        role: 'staff'
      }
    }
  }

  useEffect(() => {
    let mounted = true
    
    // Setup BroadcastChannel for cross-tab communication
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      broadcastChannelRef.current = new BroadcastChannel('ar_auth_channel')
      
      broadcastChannelRef.current.onmessage = (event) => {
        if (!mounted) return
        
        const { type, userId, role } = event.data
        
        if (type === 'role-update' && user?.id === userId) {
          // Update user role from another tab
          setUser(prev => prev ? { ...prev, role } : null)
          setCachedRole(userId, role)
        } else if (type === 'signout') {
          // Sign out triggered from another tab
          setUser(null)
          clearCachedRole()
        }
      }
    }
    
    // Add timeout to prevent infinite loading
    const authTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.log('Auth timeout - setting loading to false')
        setUser(null)
        setLoading(false)
      }
    }, 10000) // 10 second timeout

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (mounted) {
          clearTimeout(authTimeout)
          if (session?.user) {
            const authUser = await createAuthUser(session.user)
            setUser(authUser)
          } else {
            setUser(null)
            clearCachedRole()
          }
          setLoading(false)
        }
      } catch (error) {
        console.error('Error getting auth session:', error)
        if (mounted) {
          clearTimeout(authTimeout)
          setUser(null)
          setLoading(false)
        }
      }
    }

    getInitialSession()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (mounted) {
          if (session?.user) {
            const authUser = await createAuthUser(session.user)
            setUser(authUser)
          } else {
            setUser(null)
            clearCachedRole()
          }
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      clearTimeout(authTimeout)
      subscription.unsubscribe()
      broadcastChannelRef.current?.close()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        throw new Error(error.message)
      }

      if (data.user) {
        const authUser = await createAuthUser(data.user)
        setUser(authUser)
      }
    } catch (error) {
      setLoading(false)
      throw error
    }
  }

  const signOut = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Sign out error:', error)
      }
      setUser(null)
      clearCachedRole()
      
      // Broadcast signout to other tabs
      broadcastChannelRef.current?.postMessage({ type: 'signout' })
    } catch (error) {
      console.error('Sign out error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
