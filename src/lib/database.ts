import { createAdminSupabaseClient } from './supabase'
import type { Customer, Order, OrderWithCustomer, Counter, OrderItem } from './supabase-client'
import { todayInBusinessZone } from './date-range'
import type { Business } from './business-shared'

/**
 * Every function here takes the business it acts on (or, for reads, the list
 * of businesses in scope -- see src/lib/business-context.ts). Callers resolve
 * and authorize that scope first; these functions never decide it.
 */
type Scope = { businessIds: string[] }

const inBusinesses = <Q>(query: Q, scope: Scope): Q => {
  if (scope.businessIds.length === 0) throw new Error('Empty business scope')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any
  return (scope.businessIds.length === 1
    ? q.eq('business_id', scope.businessIds[0])
    : q.in('business_id', scope.businessIds)) as Q
}

const NOT_FOUND = 'PGRST116'

/**
 * Next order number WITHIN one business: `<code>-#####`, continuing that
 * business's own sequence. Default (not specified by the client): ATC keeps
 * AR-00001..., Techlink Co starts at TL-00001. Uniqueness is
 * (business_id, order_number), so the sequences never collide.
 */
export async function nextOrderNumber(business: Pick<Business, 'id' | 'code'>): Promise<string> {
  const supabase = createAdminSupabaseClient()
  const prefix = business.code || 'AR'

  // Get the latest order number to increment
  const { data: latestOrder, error } = await supabase
    .from('orders')
    .select('order_number')
    .eq('business_id', business.id)
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
    const match = latestOrder.order_number.match(/^[A-Z]+-(\d+)/)
    if (match) {
      nextNumber = parseInt(match[1]) + 1
    }
  }

  return `${prefix}-${nextNumber.toString().padStart(5, '0')}`
}

// Customer operations
export async function getCustomers({
  q,
  page = 1,
  pageSize = 10,
  sortBy = 'created_at',
  sortDir = 'desc',
  scope,
}: {
  scope: Scope
  q?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}) {
  const supabase = createAdminSupabaseClient()
  const offset = (page - 1) * pageSize

  let query = inBusinesses(supabase
    .from('customers')
    .select('*', { count: 'exact' }), scope)

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
      inBusinesses(supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', id), scope)
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

export async function getCustomer(id: string, scope: Scope): Promise<Customer | null> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await inBusinesses(supabase
    .from('customers')
    .select('*')
    .eq('id', id), scope)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw new Error(`Failed to fetch customer: ${error.message}`)
  }

  return data
}

export async function createCustomer(
  businessId: string,
  customer: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'business_id'>
): Promise<Customer> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('customers')
    .insert([{ ...customer, business_id: businessId }])
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

/** null when the customer is not in this business. */
export async function updateCustomer(
  id: string,
  businessId: string,
  updates: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'business_id'>>
): Promise<Customer | null> {
  const supabase = createAdminSupabaseClient()
  // business_id is never taken from the caller's update (and is immutable in the database).
  const safe: Record<string, unknown> = { ...updates }
  delete safe.business_id

  const { data, error } = await supabase
    .from('customers')
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId)
    .select()
    .single()

  if (error) {
    if (error.code === NOT_FOUND) return null
    if (error.code === '23505') {
      throw new Error('Phone number already exists')
    }
    throw new Error(`Failed to update customer: ${error.message}`)
  }

  return data
}

/** false when the customer is not in this business. */
export async function deleteCustomer(id: string, businessId: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient()

  const existing = await getCustomer(id, { businessIds: [businessId] })
  if (!existing) return false

  // Check if customer has orders
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', id)
    .eq('business_id', businessId)

  if (count && count > 0) {
    throw new Error('Customer has orders; reassign or delete orders first')
  }

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)

  if (error) {
    throw new Error(`Failed to delete customer: ${error.message}`)
  }
  return true
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
  sortDir = 'asc',
  today = todayInBusinessZone(),
  scope,
}: {
  scope: Scope
  q?: string
  customerId?: string
  from?: Date
  to?: Date
  status?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  /** YYYY-MM-DD splitting upcoming from past-due deliveries; tests pin it. */
  today?: string
}) {
  const supabase = createAdminSupabaseClient()
  const offset = (page - 1) * pageSize

  // Resolve the search's customer matches once, up front, so every query below
  // (the nearest-delivery sort runs several) filters the same set of orders.
  let searchClauses: string | null = null
  if (q?.trim()) {
    const term = q.trim()

    // Customer name and phone live on an embedded table, and PostgREST cannot
    // reference an embedded column from a top-level or() -- it fails to parse
    // the logic tree and the whole request 400s, which is why searching used
    // to return nothing at all rather than just missing those matches.
    // Resolving the customers first keeps the orders filter to columns orders
    // actually has.
    const { data: matches } = await inBusinesses(supabase
      .from('customers')
      .select('id'), scope)
      .or(`name.ilike.${pgLiteral(`%${term}%`)},phone.ilike.${pgLiteral(`%${term}%`)}`)
      // ponytail: 1000 customers is far past this studio's book; raise it or
      // move the search into a Postgres function if that stops being true.
      .limit(1000)

    const clauses = [`order_number.ilike.${pgLiteral(`%${term}%`)}`]
    if (matches?.length) {
      clauses.push(`customer_id.in.(${matches.map((c) => c.id).join(',')})`)
    }
    searchClauses = clauses.join(',')
  }

  // One filtered query; `head` builds a count-only one.
  const filtered = (head = false) => {
    // Every segment of the nearest-delivery sort goes through here, so each
    // one is scoped to the business.
    let query = inBusinesses(supabase
      .from('orders')
      .select(ORDER_LIST_SELECT, { count: 'exact', head }), scope)
    if (searchClauses) query = query.or(searchClauses)
    if (customerId) query = query.eq('customer_id', customerId)
    if (from) query = query.gte('booking_date', from.toISOString().split('T')[0])
    if (to) query = query.lte('booking_date', to.toISOString().split('T')[0])
    if (status) query = query.eq('status', status)
    return query
  }

  // Many orders share a booking/delivery date, so break ties on newest-created
  // then id: without a total order, rows can repeat or vanish between pages.
  const tieBreak = <T extends ReturnType<typeof filtered>>(query: T, column: string) => {
    let ordered = query
    if (column !== 'created_at') ordered = ordered.order('created_at', { ascending: false }) as T
    return ordered.order('id', { ascending: true }) as T
  }

  if (sortBy === 'delivery_date' && sortDir === 'asc') {
    type OrderListRow = NonNullable<Awaited<ReturnType<typeof filtered>>['data']>[number]
    const result = await getOrdersByNearestDelivery({ filtered, tieBreak, today, offset, page, pageSize })
    return { ...result, data: result.data as OrderListRow[] }
  }

  let query = filtered().order(sortBy, { ascending: sortDir === 'asc' })
  query = tieBreak(query, sortBy)
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

/**
 * "Nearest delivery": orders still to deliver (delivery_date >= today in the
 * studio's zone) soonest first, then the past-due ones oldest first, then
 * orders with no delivery date. A plain `delivery_date asc` puts every past-due
 * order ahead of the upcoming ones.
 *
 * PostgREST cannot order by an expression, so the list is treated as three
 * segments, each a filtered query in delivery_date order. Their counts place
 * each segment in the overall list, and the requested page is read from
 * whichever segments it overlaps, so paging stays a single total order.
 */
async function getOrdersByNearestDelivery({
  filtered,
  tieBreak,
  today,
  offset,
  page,
  pageSize,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtered: (head?: boolean) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tieBreak: (query: any, column: string) => any
  today: string
  offset: number
  page: number
  pageSize: number
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segments: Array<(query: any) => any> = [
    (query) => query.gte('delivery_date', today),
    (query) => query.lt('delivery_date', today),
    (query) => query.is('delivery_date', null),
  ]

  const counts = await Promise.all(
    segments.map(async (seg) => {
      const { count, error } = await seg(filtered(true))
      if (error) throw new Error(`Failed to fetch orders: ${error.message}`)
      return count || 0
    })
  )
  const total = counts.reduce((a, b) => a + b, 0)

  const end = offset + pageSize // exclusive
  const reads: Promise<unknown[]>[] = []
  let segStart = 0
  segments.forEach((seg, i) => {
    const segEnd = segStart + counts[i]
    const lo = Math.max(offset, segStart)
    const hi = Math.min(end, segEnd)
    if (lo < hi) {
      const query = tieBreak(seg(filtered()).order('delivery_date', { ascending: true }), 'delivery_date')
        .range(lo - segStart, hi - segStart - 1)
      reads.push(
        query.then(({ data, error }: { data: unknown[] | null; error: { message: string } | null }) => {
          if (error) throw new Error(`Failed to fetch orders: ${error.message}`)
          return data || []
        })
      )
    }
    segStart = segEnd
  })

  const data = (await Promise.all(reads)).flat()
  return {
    data,
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  }
}

const ORDER_LIST_SELECT = `
      id,
      business_id,
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
    `

export async function getAllOrdersSimple(scope: Scope): Promise<any[]> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await inBusinesses(supabase
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
    `), scope)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`)
  }

  return data || []
}

export async function getOrder(id: string, scope: Scope): Promise<OrderWithCustomer | null> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await inBusinesses(supabase
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
    .eq('id', id), scope)
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

/**
 * The customer (and measurement, if any) must already be in `business`; the
 * route checks that so it can answer 404, and the database guard
 * (enforce_business_scope) refuses a mismatch regardless.
 */
export async function createOrder(
  business: Pick<Business, 'id' | 'code'>,
  order: Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at' | 'business_id'>
): Promise<Order> {
  const supabase = createAdminSupabaseClient()

  // The number is read-then-insert, so two concurrent creates can pick the
  // same one; the (business_id, order_number) unique turns that into 23505,
  // and the next attempt reads the winner's number.
  for (let attempt = 0; ; attempt++) {
    const orderNumber = await nextOrderNumber(business)
    const { data, error } = await supabase
      .from('orders')
      .insert([{ ...order, business_id: business.id, order_number: orderNumber }])
      .select()
      .single()

    if (!error) return data
    if (error.code === '23505' && attempt < 2) continue
    throw new Error(`Failed to create order: ${error.message}`)
  }
}

/** null when the order is not in this business. */
export async function updateOrder(
  id: string,
  businessId: string,
  updates: Partial<Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at' | 'business_id'>>
): Promise<Order | null> {
  const supabase = createAdminSupabaseClient()
  // business_id is never taken from the caller's update (and is immutable in the database).
  const safe: Record<string, unknown> = { ...updates }
  delete safe.business_id

  const { data, error } = await supabase
    .from('orders')
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', businessId)
    .select()
    .single()

  if (error) {
    if (error.code === NOT_FOUND) return null
    throw new Error(`Failed to update order: ${error.message}`)
  }

  return data
}

/** false when the order is not in this business. */
export async function deleteOrder(id: string, businessId: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient()

  const { data, error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)
    .select('id')

  if (error) {
    throw new Error(`Failed to delete order: ${error.message}`)
  }
  return (data?.length ?? 0) > 0
}

/** True when every id given belongs to the business (nulls are ignored). */
export async function belongsToBusiness(
  table: 'customers' | 'measurements' | 'orders' | 'vendors',
  ids: Array<string | null | undefined>,
  businessId: string
): Promise<boolean> {
  const wanted = [...new Set(ids.filter((v): v is string => !!v))]
  if (wanted.length === 0) return true
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .in('id', wanted)
    .eq('business_id', businessId)
  if (error) throw new Error(`Failed to check ${table}: ${error.message}`)
  return (data?.length ?? 0) === wanted.length
}