import type { Customer } from '@/lib/supabase-client'

export const CUSTOMERS = 'customers'

/** Columns read for the list: the row plus its order count (RLS-scoped). */
export const CUSTOMER_LIST_SELECT = '*, orders(count)'

/** A customers row as returned with `orders(count)` embedded. */
export interface CustomerRow extends Customer {
  orders?: { count: number }[] | { count: number } | null
}

export function orderCount(customer: CustomerRow): number {
  const orders = customer.orders
  if (!orders) return 0
  return Array.isArray(orders) ? orders[0]?.count ?? 0 : orders.count ?? 0
}
