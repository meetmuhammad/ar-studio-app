import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Client-side Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side Supabase client with cookie handling (anon role)
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch (error) {
          console.warn('Could not set cookies:', error)
        }
      },
    },
  })
}

// Browser client for client-side usage (auth context)
export function createBrowserSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}

// Admin (service role) Supabase client for server-side-only usage (API routes)
export function createAdminSupabaseClient() {
  if (!supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Database types
export interface Customer {
  id: string
  name: string
  phone: string
  address?: string | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  order_number: string
  customer_id: string
  booking_date: string
  delivery_date: string // Now mandatory
  comments?: string | null
  // Payment fields
  total_amount?: number | null
  advance_paid?: number | null
  balance?: number | null
  payment_method?: 'cash' | 'bank' | 'other' | null
  // Reference to measurements table
  measurement_id?: string | null
  created_at: string
  updated_at: string
}

export interface OrderWithCustomer extends Order {
  customers: Customer
}

export interface Counter {
  id: number
  value: number
}

export type UserRole = 'admin' | 'staff'

export interface User {
  id: string
  email: string
  name?: string | null
  role: UserRole
  created_at: string
  updated_at: string
}