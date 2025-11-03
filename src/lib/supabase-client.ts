import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client (for browser usage)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
})

// Database types
export interface Customer {
  id: string
  name: string
  phone: string
  address?: string | null
  created_at: string
  updated_at: string
}

export type OrderType = 'nikkah' | 'mehndi' | 'barat' | 'wallima' | 'other'

export type OrderStatus = 'In Process' | 'Delivered' | 'Cancelled'

export interface OrderItem {
  id: string
  order_id: string
  order_type: OrderType
  description: string
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  order_number: string
  customer_id: string
  booking_date: string
  delivery_date: string // Now mandatory
  status: OrderStatus // Order status with default 'In Process'
  comments?: string | null
  // Payment fields
  total_amount?: number | null
  advance_paid?: number | null
  balance?: number | null
  payment_method?: 'cash' | 'bank' | 'other' | null
  // Reference to measurements table
  measurement_id?: string | null
  // Fitting preferences
  fitting_preferences?: string | null
  created_at: string
  updated_at: string
}

export interface OrderWithCustomer extends Order {
  customers: Customer
  order_items?: OrderItem[]
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