'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Convert Supabase user to our AuthUser format with role from database
  const createAuthUser = async (supabaseUser: User): Promise<AuthUser> => {
    // Fetch user role from database
    const { data: userData, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', supabaseUser.id)
      .single()

    return {
      id: supabaseUser.id,
      email: supabaseUser.email || '',
      role: (userData?.role as 'admin' | 'staff') || 'staff' // Default to staff if not found
    }
  }

  useEffect(() => {
    let mounted = true
    // Add timeout to prevent infinite loading
    const authTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.log('Auth timeout - setting loading to false')
        setUser(null)
        setLoading(false)
      }
    }, 5000) // 5 second timeout

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
          }
          setLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      clearTimeout(authTimeout)
      subscription.unsubscribe()
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
