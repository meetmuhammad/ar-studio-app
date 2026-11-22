import { formatPKR } from '@/lib/format'

/** Refine resources whose writes go through the ledger functions (data provider RULES). */
export const GENERAL_LEDGER = 'general_ledger'
export const VENDOR_BILLS = 'vendor_ledger'

export const ENTRY_TYPES = [
  { value: 'opening_balance', label: 'Opening balance', color: 'blue' },
  { value: 'order_payment', label: 'Order payment', color: 'green' },
  { value: 'vendor_payment', label: 'Vendor payment', color: 'default' },
  { value: 'miscellaneous', label: 'Miscellaneous', color: 'red' },
] as const

/** Types a person may enter by hand (order payments come from orders and payments). */
export const MANUAL_ENTRY_TYPES = ENTRY_TYPES.filter((t) => t.value !== 'order_payment')

export type ManualEntryType = 'opening_balance' | 'vendor_payment' | 'miscellaneous'

export const entryTypeOf = (value: string | null | undefined) => ENTRY_TYPES.find((t) => t.value === value)

/** Rows written by an order or a payment: read-only outside the order page. */
export const isOrderOwned = (row: { entry_type?: string | null; order_id?: string | null }) =>
  row.entry_type === 'order_payment' || !!row.order_id

export const money = (v: number | string | null | undefined) => formatPKR(Number(v ?? 0))

/** A general-ledger entry as the entry form needs it (also built from a vendor mirror row). */
export interface LedgerEntryValues {
  id: string
  entry_date: string
  entry_type: string
  particulars: string
  debit: number | null
  credit: number | null
  notes: string | null
  vendor_id: string | null
  vendor_name?: string | null
}
