import { createAdminSupabaseClient } from './supabase'
import type { Customer, Order, OrderWithCustomer, Counter } from './supabase'

// Order number generation using Supabase RPC
export async function nextOrderNumber(): Promise<string> {
  const supabase = createAdminSupabaseClient()

  // Use Supabase RPC to atomically increment counter
  const { data, error } = await supabase.rpc('increment_counter', {
    counter_id: 1
  })

  if (error) {
    console.error('Error incrementing counter:', error)
    throw new Error('Failed to generate order number')
  }

  const orderNumber = `AR-${data.toString().padStart(5, '0')}`
  return orderNumber
}

// Customer operations
export async function getCustomers({
  q,
  page = 1,
  pageSize = 10,
  sortBy = 'created_at',
  sortDir = 'desc'
}: {
  q?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}) {
  const supabase = createAdminSupabaseClient()
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('customers')
    .select('*, orders(count)', { count: 'exact' })

  // Add search filter
  if (q) {
    query = query.or(`name.ilike.%${q}%,phone.like.%${q}%`)
  }

  // Add sorting
  query = query.order(sortBy, { ascending: sortDir === 'asc' })

  // Add pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: customers, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch customers: ${error.message}`)
  }

  return {
    data: customers || [],
    total: count || 0,
    page,
    pageSize,
    pages: Math.ceil((count || 0) / pageSize)
  }
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const supabase = createAdminSupabaseClient()
  
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw new Error(`Failed to fetch customer: ${error.message}`)
  }

  return data
}

export async function createCustomer(customer: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Promise<Customer> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('customers')
    .insert([customer])
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Phone number already exists')
    }
    throw new Error(`Failed to create customer: ${error.message}`)
  }

  return data
}

export async function updateCustomer(id: string, updates: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>): Promise<Customer> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('customers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Phone number already exists')
    }
    throw new Error(`Failed to update customer: ${error.message}`)
  }

  return data
}

export async function deleteCustomer(id: string): Promise<void> {
  const supabase = createAdminSupabaseClient()

  // Check if customer has orders
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', id)

  if (count && count > 0) {
    throw new Error('Customer has orders; reassign or delete orders first')
  }

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete customer: ${error.message}`)
  }
}

// Order operations
export async function getOrders({
  q,
  customerId,
  from,
  to,
  page = 1,
  pageSize = 10,
  sortBy = 'created_at',
  sortDir = 'desc'
}: {
  q?: string
  customerId?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}) {
  const supabase = createAdminSupabaseClient()
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('orders')
    .select(`
      *,
      customers (
        id,
        name,
        phone,
        address
      )
    `, { count: 'exact' })

  // Add filters
  if (q) {
    query = query.or(`order_number.like.%${q}%,customers.name.ilike.%${q}%,customers.phone.like.%${q}%`)
  }

  if (customerId) {
    query = query.eq('customer_id', customerId)
  }

  if (from) {
    query = query.gte('booking_date', from.toISOString().split('T')[0])
  }

  if (to) {
    query = query.lte('booking_date', to.toISOString().split('T')[0])
  }

  // Add sorting
  query = query.order(sortBy, { ascending: sortDir === 'asc' })

  // Add pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: orders, error, count } = await query

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return {
    data: orders || [],
    total: count || 0,
    page,
    pageSize,
    pages: Math.ceil((count || 0) / pageSize)
  }
}

export async function getOrder(id: string): Promise<OrderWithCustomer | null> {
  const supabase = createAdminSupabaseClient()
  
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers (
        id,
        name,
        phone,
        address
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw new Error(`Failed to fetch order: ${error.message}`)
  }

  return data
}

export async function createOrder(order: Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at'>): Promise<Order> {
  const supabase = createAdminSupabaseClient()
  
  // Generate order number
  const orderNumber = await nextOrderNumber()

  const { data, error } = await supabase
    .from('orders')
    .insert([{ ...order, order_number: orderNumber }])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create order: ${error.message}`)
  }

  return data
}

export async function updateOrder(id: string, updates: Partial<Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at'>>): Promise<Order> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update order: ${error.message}`)
  }

  return data
}

export async function deleteOrder(id: string): Promise<void> {
  const supabase = createAdminSupabaseClient()

  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Failed to delete order: ${error.message}`)
  }
}