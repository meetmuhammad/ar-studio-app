import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// The one browser Supabase client. Do not add another.
//
// This MUST be createBrowserClient from @supabase/ssr, not createClient from
// @supabase/supabase-js. createClient stores the session in localStorage, which
// the server cannot read: createServerSupabaseClient() in ./supabase.ts reads
// the session from cookies via next/headers. With createClient, a user signs in
// successfully in the browser while every server-side check sees an anonymous
// request -- so any future route guard would reject legitimately signed-in
// users, and the client-side RouteGuard would keep the UI up, making it present
// as a data outage rather than an auth failure.
//
// createBrowserClient writes the session to cookies that the server reads, and
// already defaults to autoRefreshToken, persistSession, detectSessionInUrl and
// the PKCE flow -- the options block this replaces was restating those defaults.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

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

// Ledger types
export type LedgerEntryType = 'opening_balance' | 'order_payment' | 'vendor_payment' | 'miscellaneous'

export interface Vendor {
  id: string
  name: string
  contact_person?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface VendorTag {
  id: string
  vendor_id: string
  tag_name: string
  created_at: string
  updated_at: string
}

export interface GeneralLedger {
  id: string
  entry_date: string
  particulars: string
  debit?: number | null
  credit?: number | null
  balance: number
  entry_type: LedgerEntryType
  notes?: string | null
  order_id?: string | null
  vendor_id?: string | null
  tag_id?: string | null
  created_at: string
  updated_at: string
}

export interface GeneralLedgerWithRelations extends GeneralLedger {
  vendors?: Vendor | null
  orders?: Order | null
  vendor_tags?: VendorTag | null
  calculatedBalance?: number // Client-side calculated balance for correct display order
}

export interface VendorLedger {
  id: string
  vendor_id: string
  general_ledger_id: string
  entry_date: string
  particulars: string
  debit?: number | null
  credit?: number | null
  balance: number
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface VendorLedgerWithRelations extends VendorLedger {
  general_ledger?: GeneralLedger
}

export interface VendorWithLedger extends Vendor {
  vendor_tags?: VendorTag[]
  vendor_ledger?: VendorLedger[]
}
