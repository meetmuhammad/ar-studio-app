import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { inScope, requireBusinessRead, type BusinessScope } from '@/lib/business-context'
import { BUSINESS_TIME_ZONE, todayInBusinessZone } from '@/lib/date-range'
import {
  computePnl,
  isPnlMode,
  isPnlPreset,
  resolvePnlRange,
  type PnlLedgerRow,
  type PnlOrderRow,
  type PnlPaymentRow,
  type PnlVendorLedgerRow,
  type PnlVendorRow,
} from '@/lib/pnl'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const PAGE = 1000

const bad = (error: string) => NextResponse.json({ error }, { status: 400, headers: NO_STORE })

/**
 * Read every page of a query. PostgREST caps one response (1,000 rows by
 * default), so a single read would silently stop counting. `build` must apply a
 * total order (here: by id) so pages neither skip nor repeat rows.
 */
async function readAll<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(`Failed to read ${label}: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/**
 * GET /api/pnl?mode=cash|accrual&preset=this_month|this_quarter|this_year|custom&start=&end=
 *
 * Profit and loss for the business in X-Business-Id, or (admin, `all`) every
 * business the admin belongs to, added together. Admin-only, read-only. The
 * rules live in src/lib/pnl.ts; this route only fetches the rows they need.
 * All money in the response is integer cents.
 */
export async function GET(request: Request) {
  const scope = await requireBusinessRead(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode')
  const preset = searchParams.get('preset')
  if (!isPnlMode(mode)) return bad('mode must be cash or accrual')
  if (!isPnlPreset(preset)) return bad('preset must be one of this_month, this_quarter, this_year, custom')

  const today = todayInBusinessZone()
  const resolved = resolvePnlRange(
    preset,
    { start: searchParams.get('start'), end: searchParams.get('end') },
    today
  )
  if ('error' in resolved) return bad(resolved.error)
  const { range } = resolved

  try {
    const rows = await fetchRows(scope, mode, range)
    const result = computePnl(rows, { mode, range, businessIds: scope.businessIds })
    return NextResponse.json(
      {
        ...result,
        preset,
        timeZone: BUSINESS_TIME_ZONE,
        today,
        currency: 'PKR',
        combined: !scope.business,
        businessCount: scope.businessIds.length,
      },
      { headers: NO_STORE }
    )
  } catch (error) {
    console.error('GET /api/pnl error:', error)
    return NextResponse.json({ error: 'Failed to build the profit and loss report' }, { status: 500, headers: NO_STORE })
  }
}

async function fetchRows(scope: BusinessScope, mode: 'cash' | 'accrual', range: { start: string; end: string }) {
  const supabase = createAdminSupabaseClient()
  const ORDER_COLS = 'business_id, booking_date, delivery_date, status, total_amount, advance_paid'

  const orders = readAll<PnlOrderRow>('orders', (from, to) => {
    const q = inScope(supabase.from('orders').select(ORDER_COLS), scope)
    return (mode === 'cash'
      ? q.gte('booking_date', range.start).lte('booking_date', range.end)
      : q.eq('status', 'Delivered').gte('delivery_date', range.start).lte('delivery_date', range.end)
    ).order('id').range(from, to)
  })

  const payments: Promise<PnlPaymentRow[]> = mode === 'cash'
    ? readAll<PnlPaymentRow>('payments', (from, to) =>
        inScope(supabase.from('payments').select('business_id, payment_date, amount'), scope)
          .gte('payment_date', range.start)
          .lte('payment_date', range.end)
          .order('id')
          .range(from, to))
    : Promise.resolve([])

  // order_payment rows are a mirror of advances + payments and are never read.
  const ledger = readAll<PnlLedgerRow>('general ledger', (from, to) =>
    inScope(
      supabase
        .from('general_ledger')
        .select('business_id, entry_date, entry_type, debit, credit, vendor_id, particulars, notes'),
      scope
    )
      .in('entry_type', ['vendor_payment', 'miscellaneous', 'opening_balance'])
      .gte('entry_date', range.start)
      .lte('entry_date', range.end)
      .order('id')
      .range(from, to))

  // Bills only: rows linked to a general-ledger payment are its mirror.
  const vendorLedger: Promise<PnlVendorLedgerRow[]> = mode === 'accrual'
    ? readAll<PnlVendorLedgerRow>('vendor ledger', (from, to) =>
        inScope(
          supabase.from('vendor_ledger').select('business_id, vendor_id, entry_date, debit, credit, general_ledger_id'),
          scope
        )
          .is('general_ledger_id', null)
          .gte('entry_date', range.start)
          .lte('entry_date', range.end)
          .order('id')
          .range(from, to))
    : Promise.resolve([])

  // The vendor's CURRENT category (not general_ledger.vendor_category_name).
  type VendorRead = { id: string; business_id: string; vendor_categories: { name: string } | null }
  const vendors = readAll<VendorRead>('vendors', (from, to) =>
    inScope(supabase.from('vendors').select('id, business_id, vendor_categories (name)'), scope)
      .order('id')
      .range(from, to)
  ).then((list): PnlVendorRow[] =>
    list.map((v) => ({ id: v.id, business_id: v.business_id, category_name: v.vendor_categories?.name ?? null }))
  )

  const [o, p, g, vl, v] = await Promise.all([orders, payments, ledger, vendorLedger, vendors])
  return { orders: o, payments: p, ledger: g, vendorLedger: vl, vendors: v }
}
