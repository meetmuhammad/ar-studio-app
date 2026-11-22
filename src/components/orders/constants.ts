import type { Customer, Order, OrderItem } from '@/lib/supabase-client'

export const ORDERS = 'orders'
export const PAYMENTS = 'payments'

export const ORDER_STATUSES = ['In Process', 'Delivered', 'Cancelled'] as const
export type OrderStatusValue = (typeof ORDER_STATUSES)[number]

/** Item types and labels, as the previous items repeater. */
export const ORDER_TYPES = [
  { value: 'nikkah', label: 'Nikkah' },
  { value: 'mehndi', label: 'Mehndi' },
  { value: 'barat', label: 'Barat' },
  { value: 'wallima', label: 'Wallima' },
  { value: 'other', label: 'Other' },
] as const

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
] as const

export const MAX_ORDER_ITEMS = 4

/** List rows: the order, its customer, and its payments' amounts (for the payment status). */
export const ORDER_LIST_SELECT =
  '*, customers(id, name, phone, address), payments(amount)'

/** Detail: everything the show page, receipt and edit form need. */
export const ORDER_SHOW_SELECT =
  '*, customers(id, name, phone, address), order_items(id, order_type, description, created_at, updated_at)'

export interface PaymentRow {
  id: string
  business_id?: string
  order_id: string
  customer_id: string
  amount: number
  payment_method: string
  payment_date: string
  notes?: string | null
  created_at: string
}

export type OrderRow = Order & {
  customers: Customer
  order_items?: OrderItem[]
  payments?: Pick<PaymentRow, 'amount'>[]
}

export const pkr = (amount: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(amount)

/**
 * Paid / balance as the previous order and payment dialogs and the receipt
 * compute them: paid = advance + every payment, balance = total - paid.
 */
export function paymentSummary(order: Pick<Order, 'total_amount' | 'advance_paid'>, payments: Pick<PaymentRow, 'amount'>[] = []) {
  const total = order.total_amount || 0
  const advance = order.advance_paid || 0
  const payments_total = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const paid = advance + payments_total
  const balance = total - paid
  const status: 'Paid' | 'Partial' | 'Unpaid' | 'No total' =
    total <= 0 ? 'No total' : paid >= total ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid'
  return { total, advance, payments: payments_total, paid, balance, status }
}

export const PAYMENT_STATUS_COLOR: Record<ReturnType<typeof paymentSummary>['status'], string> = {
  Paid: 'green',
  Partial: 'gold',
  Unpaid: 'red',
  'No total': 'default',
}

export const STATUS_COLOR: Record<string, string> = {
  'In Process': 'processing',
  Delivered: 'success',
  Cancelled: 'error',
}

export const orderTypeLabel = (value: string) => ORDER_TYPES.find((t) => t.value === value)?.label ?? value
export const paymentMethodLabel = (value?: string | null) =>
  PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value ?? '—'
