import { createAdminSupabaseClient } from './supabase'
import type { Customer, Order, OrderWithCustomer, Counter, OrderItem } from './supabase-client'

// Order number generation using a simpler approach
export async function nextOrderNumber(): Promise<string> {
  const supabase = createAdminSupabaseClient()

  // Get the latest order number to increment
  const { data: latestOrder, error } = await supabase
    .from('orders')
    .select('order_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error fetching latest order:', error)
    throw new Error('Failed to generate order number')
  }

  let nextNumber = 1
  if (latestOrder?.order_number) {
    // Extract number from order_number (e.g., "AR-00001" -> 1)
    const match = latestOrder.order_number.match(/AR-(\d+)/)
    if (match) {
      nextNumber = parseInt(match[1]) + 1
    }
  }

  const orderNumber = `AR-${nextNumber.toString().padStart(5, '0')}`
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
    .select('*', { count: 'exact' })

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

  // Get order counts using head-only count queries (no data transferred)
  if (customers && customers.length > 0) {
    const customerIds = customers.map(c => c.id)
    
    // Batch count queries — one per customer on the page (max ~10-20)
    const countPromises = customerIds.map(id =>
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', id)
    )
    const countResults = await Promise.all(countPromises)
    
    // Add order counts to customers
    const customersWithOrderCounts = customers.map((customer, i) => ({
      ...customer,
      orders: { count: countResults[i].count || 0 }
    }))
    
    return {
      data: customersWithOrderCounts,
      total: count || 0,
      page,
      pageSize,
      pages: Math.ceil((count || 0) / pageSize)
    }
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
// PostgREST splits an or() on commas and closes it on a paren, so an
// unquoted search term containing either produces a filter that is either
// malformed or quietly wrong. Quoting makes the value literal; inside quotes
// only the quote and the backslash still need escaping.
const pgLiteral = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`

export async function getOrders({
  q,
  customerId,
  from,
  to,
  status,
  page = 1,
  pageSize = 10,
  sortBy = 'delivery_date',
  sortDir = 'asc'
}: {
  q?: string
  customerId?: string
  from?: Date
  to?: Date
  status?: string
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
      id,
      order_number,
      customer_id,
      booking_date,
      delivery_date,
      status,
      comments,
      total_amount,
      advance_paid,
      balance,
      payment_method,
      measurement_id,
      fitting_preferences,
      created_at,
      updated_at,
      customers (
        id,
        name,
        phone,
        address
      ),
      order_items (
        id,
        order_type,
        description,
        created_at,
        updated_at
      )
    `, { count: 'exact' })

  // Add filters
  if (q?.trim()) {
    const term = q.trim()

    // Customer name and phone live on an embedded table, and PostgREST cannot
    // reference an embedded column from a top-level or() -- it fails to parse
    // the logic tree and the whole request 400s, which is why searching used
    // to return nothing at all rather than just missing those matches.
    // Resolving the customers first keeps the orders filter to columns orders
    // actually has.
    const { data: matches } = await supabase
      .from('customers')
      .select('id')
      .or(`name.ilike.${pgLiteral(`%${term}%`)},phone.ilike.${pgLiteral(`%${term}%`)}`)
      // ponytail: 1000 customers is far past this studio's book; raise it or
      // move the search into a Postgres function if that stops being true.
      .limit(1000)

    const clauses = [`order_number.ilike.${pgLiteral(`%${term}%`)}`]
    if (matches?.length) {
      clauses.push(`customer_id.in.(${matches.map((c) => c.id).join(',')})`)
    }
    query = query.or(clauses.join(','))
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

  if (status) {
    query = query.eq('status', status)
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

export async function getAllOrdersSimple(): Promise<any[]> {
  const supabase = createAdminSupabaseClient()
  
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      order_number,
      customer_id,
      booking_date,
      total_amount,
      advance_paid,
      created_at,
      customers (
        id,
        name,
        phone
      )
    `)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return data || []
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
      ),
      order_items (
        id,
        order_type,
        description,
        created_at,
        updated_at
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

// Order item operations
export async function createOrderItems(orderId: string, orderItems: { order_type: string; description: string }[]): Promise<OrderItem[]> {
  if (orderItems.length === 0) return []
  
  const supabase = createAdminSupabaseClient()
  
  const itemsToInsert = orderItems.map(item => ({
    order_id: orderId,
    order_type: item.order_type,
    description: item.description
  }))

  try {
    const { data, error } = await supabase
      .from('order_items')
      .insert(itemsToInsert)
      .select()

    if (error) {
      // If table doesn't exist yet, just log and return empty array
      console.warn('Order items table not available yet:', error.message)
      return []
    }

    return data || []
  } catch (err) {
    console.warn('Order items functionality not available yet:', err)
    return []
  }
}

export async function updateOrderItems(orderId: string, orderItems: { order_type: string; description: string }[]): Promise<void> {
  const supabase = createAdminSupabaseClient()
  
  try {
    // Delete existing order items
    await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId)
    
    // Create new order items if any
    if (orderItems.length > 0) {
      await createOrderItems(orderId, orderItems)
    }
  } catch (err) {
    console.warn('Order items functionality not available yet:', err)
  }
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