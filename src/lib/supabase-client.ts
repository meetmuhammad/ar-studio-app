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

export interface Order {
  id: string
  order_number: string
  customer_id: string
  booking_date: string
  delivery_date?: string | null
  comments?: string | null
  // Measurement fields
  chest?: number | null
  waist?: number | null
  hips?: number | null
  sleeves?: number | null
  neck?: number | null
  shoulder?: number | null
  cross_back?: number | null
  biceps?: number | null
  wrist?: number | null
  coat_length?: number | null
  three_piece_waistcoat?: number | null
  waistcoat_length?: number | null
  sherwani_length?: number | null
  pant_waist?: number | null
  pant_length?: number | null
  thigh?: number | null
  knee?: number | null
  bottom?: number | null
  shoe_size?: number | null
  turban_length?: number | null
  fitting_preferences?: string | null
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