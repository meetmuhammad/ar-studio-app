'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { getCurrentUser, AuthUser } from '@/lib/auth'
import type { Session } from '@supabase/supabase-js'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session with proper timing
    const getInitialSession = async () => {
      try {
        // Wait a bit for Supabase to initialize properly
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // First, try to get the session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        console.log('Initial session check:', { hasSession: !!session, error, userId: session?.user?.id })
        
        if (error) {
          console.error('Error getting session:', error)
          setUser(null)
          setLoading(false)
          return
        }

        if (session) {
          // Session exists, get user profile
          console.log('Session found, getting user profile...')
          const currentUser = await getCurrentUser()
          console.log('Current user:', currentUser)
          setUser(currentUser)
        } else {
          // No session
          console.log('No session found')
          setUser(null)
        }
      } catch (error) {
        console.error('Error getting initial session:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session: Session | null) => {
        console.log('Auth state changed:', event, session?.user?.email)
        
        if (event === 'SIGNED_IN' && session) {
          try {
            const currentUser = await getCurrentUser()
            setUser(currentUser)
          } catch (error) {
            console.error('Error getting user after sign in:', error)
            setUser(null)
          }
        } else if (event === 'SIGNED_OUT' || !session) {
          setUser(null)
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Handle token refresh - maintain the user state
          try {
            const currentUser = await getCurrentUser()
            setUser(currentUser)
          } catch (error) {
            console.error('Error refreshing user:', error)
            setUser(null)
          }
        }
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}