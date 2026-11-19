'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase-client'
import { useBusiness } from '@/contexts/business-context'
import type { PnlInput } from '@/lib/pnl'

/**
 * Admin reports read through the read-only Postgres functions of
 * supabase/migrations/20261119000200_reporting_functions.sql (the ledgers have
 * no client grants). Each hook passes the selected business, or every
 * membership in the "All businesses" view, and is cached in the shared React
 * Query client, which a business switch clears.
 */

export class ReportError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

async function callReport<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    // PGRST202: the function is not in the database yet (migration not applied).
    const message =
      error.code === 'PGRST202'
        ? `The database function ${fn} is not installed. Apply the pending migrations in supabase/migrations.`
        : error.message
    throw new ReportError(message, error.code)
  }
  return data as T
}

/** Business ids the reports read: the selected one, or all (combined view). */
export function useReportScope() {
  const { business, businesses, isAll, ready } = useBusiness()
  const ids = isAll ? businesses.map((b) => b.id) : business ? [business.id] : []
  return { ids, isAll, ready: ready && ids.length > 0 }
}

// ---------------------------------------------------------------- dashboard

export interface DashboardMonth {
  month: string // YYYY-MM
  orders: number
  order_value: number
  cash_advances: number
  cash_payments: number
}

export interface DashboardSummary {
  range: { from: string | null; to: string | null; today: string }
  customers: { total: number; new_in_range: number }
  orders: { total: number; in_range: number; by_status: Record<string, number> }
  revenue_in_range: number
  revenue_all_time: number
  cash_received: { advances: number; payments: number; total: number }
  outstanding: number
  ledger_net: number
  outstanding_api: number
  monthly: DashboardMonth[]
  top_customers: { id: string; name: string; phone: string; orders: number; order_value: number }[]
  upcoming_deliveries: {
    id: string
    order_number: string
    delivery_date: string
    status: string
    customer_name: string
    customer_phone: string
    balance: number
  }[]
  overdue_deliveries: number
}

export function useDashboardSummary(range: { start: string; end: string } | null) {
  const scope = useReportScope()
  return useQuery({
    queryKey: ['report', 'dashboard_summary', scope.ids, range],
    queryFn: () =>
      callReport<DashboardSummary>('dashboard_summary', {
        p_business_ids: scope.ids,
        p_from: range?.start ?? null,
        p_to: range?.end ?? null,
      }),
    enabled: scope.ready && !!range,
    retry: false,
  })
}

// ---------------------------------------------------------------- ledger

export interface LedgerRow {
  id: string
  business_id: string
  business_name: string | null
  entry_date: string
  particulars: string
  entry_type: 'opening_balance' | 'order_payment' | 'vendor_payment' | 'miscellaneous' | string
  debit: number | null
  credit: number | null
  balance: number | null
  range_balance: number | null
  notes: string | null
  order_id: string | null
  vendor_id: string | null
  tag_id: string | null
  created_at: string
  updated_at: string
  vendors: { id: string; name: string; category_id: string | null; vendor_categories: { id: string; name: string } | null } | null
  orders: { id: string; order_number: string } | null
  vendor_tags: { id: string; tag_name: string } | null
}

export interface LedgerPage {
  rows: LedgerRow[]
  total: number
  combined: boolean
  opening_balance: number
  totals: { debit: number; credit: number; net: number; entry_count: number }
}

export interface LedgerQuery {
  from?: string | null
  to?: string | null
  search?: string | null
  entryType?: string | null
  vendorId?: string | null
  vendorCategoryId?: string | null
  /** null = every row (CSV export). */
  limit: number | null
  offset: number
}

export const ledgerArgs = (ids: string[], q: LedgerQuery) => ({
  p_business_ids: ids,
  p_from: q.from || null,
  p_to: q.to || null,
  p_search: q.search?.trim() || null,
  p_entry_type: q.entryType || null,
  p_vendor_id: q.vendorId || null,
  p_limit: q.limit,
  p_offset: q.offset,
  p_vendor_category_id: q.vendorCategoryId || null,
})

export function useLedgerPage(q: LedgerQuery) {
  const scope = useReportScope()
  return useQuery({
    queryKey: ['report', 'ledger_entries', scope.ids, q],
    queryFn: () => callReport<LedgerPage>('ledger_entries', ledgerArgs(scope.ids, q)),
    enabled: scope.ready,
    placeholderData: (previous) => previous,
    retry: false,
  })
}

/** Every row of the current filter, for the CSV export. */
export const fetchLedgerForExport = (ids: string[], q: LedgerQuery) =>
  callReport<LedgerPage>('ledger_entries', ledgerArgs(ids, { ...q, limit: null, offset: 0 }))

// ---------------------------------------------------------------- vendor sub-ledger

/**
 * One row of a vendor's sub-ledger (vendor_ledger_entries, newest first).
 * debit = paid to the vendor, credit = billed by the vendor; owed_after =
 * billed - paid up to and including this row. kind: 'bill' (bill-only row),
 * 'ledger' (mirror of a manual general-ledger entry, e.g. a vendor payment),
 * 'order' (mirror of an order-owned entry, read-only).
 */
export interface VendorLedgerRow {
  id: string
  entry_date: string
  particulars: string
  debit: number | null
  credit: number | null
  notes: string | null
  created_at: string
  general_ledger_id: string | null
  entry_type: string | null
  order_id: string | null
  order_number: string | null
  kind: 'bill' | 'ledger' | 'order'
  owed_after: number
}

export interface VendorLedger {
  vendor: { id: string; name: string; business_id: string }
  rows: VendorLedgerRow[]
  totals: { billed: number; paid: number; owed: number; entries: number }
}

export function useVendorLedger(vendorId: string | undefined) {
  return useQuery({
    queryKey: ['report', 'vendor_ledger_entries', vendorId],
    queryFn: () => callReport<VendorLedger>('vendor_ledger_entries', { p_vendor_id: vendorId }),
    enabled: !!vendorId,
    retry: false,
  })
}

// ---------------------------------------------------------------- P&L

export function usePnlInput(range: { start: string; end: string } | null) {
  const scope = useReportScope()
  return useQuery({
    queryKey: ['report', 'pnl_input', scope.ids, range],
    queryFn: () =>
      callReport<PnlInput>('pnl_input', { p_business_ids: scope.ids, p_from: range!.start, p_to: range!.end }),
    enabled: scope.ready && !!range,
    retry: false,
  })
}
