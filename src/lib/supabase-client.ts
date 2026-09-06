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
  category_id?: string | null
  created_at: string
  updated_at: string
}

// Global, controlled accounting classification for vendors. Distinct from
// VendorTag: a tag is a free-text label a vendor may have many of; a category
// is one classification chosen from this globally managed list.
export interface VendorCategory {
  id: string
  name: string
  archived_at?: string | null
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

export interface VendorWithCategory extends Vendor {
  vendor_categories?: VendorCategory | null
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
  // Snapshot of the vendor's category at write time (see
  // supabase/migrations/20260827000000_vendor_categories.sql). Deliberately
  // NOT re-derived from vendors.category_id at read time -- that would
  // silently rewrite history whenever a vendor is reclassified.
  vendor_category_id?: string | null
  vendor_category_name?: string | null
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
