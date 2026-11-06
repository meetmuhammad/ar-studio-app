/**
 * Profit and loss, per business, on a cash or an accrual basis.
 *
 * Pure functions over plain rows: no Supabase, no React. GET /api/pnl fetches
 * the rows and calls computePnl(); src/lib/pnl.test.ts locks the double-count
 * rules. The owner-facing write-up is docs/pnl.md, and scripts/pnl/reconcile.sql
 * applies the same rules in SQL.
 *
 * What the books are (verified against the app code and the schema):
 *   - general_ledger.debit is money in, credit is money out (chk_debit_or_credit:
 *     a row has exactly one of the two).
 *   - entry_type is opening_balance | order_payment | vendor_payment | miscellaneous.
 *   - A customer's money is orders.advance_paid (dated booking_date) plus
 *     payments.amount (dated payment_date). general_ledger order_payment rows
 *     are a mirror of those two and are never counted here.
 *   - vendor_ledger rows with general_ledger_id set are the reversed mirror of a
 *     general-ledger vendor payment and are never counted. Rows with it null
 *     are bills that exist only in the vendor sub-ledger.
 *   - There is no refund, credit-note or returns table.
 *
 * Money is integer cents throughout (toCents never goes through a float).
 */

import { quarterOf, resolvePreset, isValidDateString, todayInBusinessZone, type DateRange } from './date-range'
import { toCents } from './ledger-mcp/normalize'
import { formatPKR } from './format'

// ---------------------------------------------------------------- input rows

type Amount = string | number | null | undefined

export interface PnlOrderRow {
  business_id: string
  booking_date: string | null
  delivery_date: string | null
  status: string | null
  total_amount: Amount
  advance_paid: Amount
}

export interface PnlPaymentRow {
  business_id: string
  payment_date: string
  amount: Amount
}

export interface PnlLedgerRow {
  business_id: string
  entry_date: string
  entry_type: string
  debit: Amount
  credit: Amount
  vendor_id: string | null
  /** Read only to detect transfers; never returned. */
  particulars: string | null
  notes: string | null
}

export interface PnlVendorLedgerRow {
  business_id: string
  vendor_id: string
  entry_date: string
  debit: Amount
  credit: Amount
  general_ledger_id: string | null
}

export interface PnlVendorRow {
  id: string
  business_id: string
  /** The vendor's CURRENT category name (vendors.category_id -> vendor_categories.name). */
  category_name: string | null
}

export interface PnlInput {
  orders: PnlOrderRow[]
  payments: PnlPaymentRow[]
  ledger: PnlLedgerRow[]
  vendorLedger: PnlVendorLedgerRow[]
  vendors: PnlVendorRow[]
}

// ---------------------------------------------------------------- modes, presets, dates

export const PNL_MODES = ['cash', 'accrual'] as const
export type PnlMode = (typeof PNL_MODES)[number]

export const PNL_PRESETS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
] as const
export type PnlPreset = (typeof PNL_PRESETS)[number]['value']

export const isPnlMode = (v: unknown): v is PnlMode => (PNL_MODES as readonly unknown[]).includes(v)
export const isPnlPreset = (v: unknown): v is PnlPreset => PNL_PRESETS.some((p) => p.value === v)

/**
 * A preset -> inclusive dates. Presets are the WHOLE period containing today in
 * Asia/Karachi (not period-to-date), matching this_month / this_year in
 * date-range.ts. Custom needs both bounds, real dates, start <= end.
 */
export function resolvePnlRange(
  preset: unknown,
  custom: { start?: string | null; end?: string | null } = {},
  today: string = todayInBusinessZone()
): { range: DateRange } | { error: string } {
  switch (preset) {
    case 'this_month':
    case 'this_year':
      return { range: resolvePreset(preset, today)! }
    case 'this_quarter':
      return { range: quarterOf(today) }
    case 'custom': {
      const { start, end } = custom
      if (!start || !end) return { error: 'A custom range needs both start and end (YYYY-MM-DD)' }
      if (!isValidDateString(start)) return { error: `start "${start}" is not a real YYYY-MM-DD date` }
      if (!isValidDateString(end)) return { error: `end "${end}" is not a real YYYY-MM-DD date` }
      if (start > end) return { error: 'start must be on or before end' }
      return { range: { start, end } }
    }
    default:
      return { error: 'preset must be one of this_month, this_quarter, this_year, custom' }
  }
}

const inRange = (date: string | null | undefined, r: DateRange) => !!date && date >= r.start && date <= r.end

/** Every calendar month the inclusive range touches, as YYYY-MM. */
export function monthsInRange(r: DateRange): string[] {
  const out: string[] = []
  let y = Number(r.start.slice(0, 4))
  let m = Number(r.start.slice(5, 7))
  const endKey = r.end.slice(0, 7)
  for (;;) {
    const key = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`
    out.push(key)
    if (key >= endKey) break
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return out
}

// ---------------------------------------------------------------- categories

export type PnlLine = 'cost_of_sales' | 'staff' | 'overheads' | 'other' | 'drawings'

/**
 * Vendor category name -> statement line. Matched on lower(btrim(name)), exactly.
 * EDIT THIS MAP to reclassify a category. Anything not listed (and a vendor with
 * no category) goes to Other, and unknown names are listed in the response.
 */
export const PNL_CATEGORY_MAP: Readonly<Record<string, PnlLine>> = {
  purchases: 'cost_of_sales',
  employees: 'staff',
  'fixed expense': 'overheads',
  charity: 'other',
  uncategorized: 'other',
  // Drawings, not profit: reported as an excluded total.
  'owner withdrawal': 'drawings',
}

export function classifyCategory(name: string | null | undefined): { line: PnlLine; unknown?: string } {
  if (name === null || name === undefined) return { line: 'other' }
  const key = name.trim().toLowerCase()
  const line = PNL_CATEGORY_MAP[key]
  if (line) return { line }
  return key ? { line: 'other', unknown: name.trim() } : { line: 'other' }
}

/** Whole word "transfer", any case, in particulars or notes. */
const TRANSFER = /\btransfer\b/i
export const isTransfer = (row: { particulars?: string | null; notes?: string | null }) =>
  TRANSFER.test(row.particulars ?? '') || TRANSFER.test(row.notes ?? '')

// ---------------------------------------------------------------- scope

/** Keep only rows of the given businesses. An empty list is a bug, not "everything". */
export function scopeInput(input: PnlInput, businessIds: readonly string[]): PnlInput {
  if (businessIds.length === 0) throw new Error('pnl: empty business scope')
  const ids = new Set(businessIds)
  const keep = <T extends { business_id: string }>(rows: T[]) => rows.filter((r) => ids.has(r.business_id))
  return {
    orders: keep(input.orders),
    payments: keep(input.payments),
    ledger: keep(input.ledger),
    vendorLedger: keep(input.vendorLedger),
    vendors: keep(input.vendors),
  }
}

// ---------------------------------------------------------------- result

export interface PnlStatement {
  revenueCents: number
  costOfSalesCents: number
  grossProfitCents: number
  staffCents: number
  overheadsCents: number
  otherExpenseCents: number
  otherIncomeCents: number
  netProfitCents: number
}

export interface PnlMonth extends PnlStatement {
  month: string // YYYY-MM
}

export interface PnlResult {
  mode: PnlMode
  range: DateRange
  statement: PnlStatement
  monthly: PnlMonth[]
  revenueDetail: {
    /** Cash: orders.advance_paid by booking_date. */
    advancesCents: number
    /** Cash: payments.amount by payment_date. */
    laterPaymentsCents: number
    /** Accrual: number of Delivered orders by delivery_date. */
    deliveredOrders: number
  }
  excluded: {
    /** Opening-balance rows in range, debit - credit. Not profit. */
    openingBalanceCents: number
    /** Owner Withdrawal category, net money out. Drawings, not profit. */
    ownerWithdrawalCents: number
    /** Ledger rows whose particulars/notes say "transfer". */
    transfers: { count: number; moneyInCents: number; moneyOutCents: number }
  }
  /** Accrual only: vendor_payment net dropped because that vendor has an in-range bill. */
  suppressedVendorPaymentsCents: number
  /** Accrual only: vendor costs dated on the payment because the vendor has no bill. */
  paymentDatedVendorCostsCents: number
  /** Category names not in PNL_CATEGORY_MAP that contributed to this result. */
  unknownCategories: string[]
  limitations: string[]
}

type Bucket = Omit<PnlStatement, 'grossProfitCents' | 'netProfitCents'>
const emptyBucket = (): Bucket => ({
  revenueCents: 0,
  costOfSalesCents: 0,
  staffCents: 0,
  overheadsCents: 0,
  otherExpenseCents: 0,
  otherIncomeCents: 0,
})

function finish(b: Bucket): PnlStatement {
  const grossProfitCents = b.revenueCents - b.costOfSalesCents
  return {
    revenueCents: b.revenueCents,
    costOfSalesCents: b.costOfSalesCents,
    grossProfitCents,
    staffCents: b.staffCents,
    overheadsCents: b.overheadsCents,
    otherExpenseCents: b.otherExpenseCents,
    otherIncomeCents: b.otherIncomeCents,
    netProfitCents: grossProfitCents - b.staffCents - b.overheadsCents - b.otherExpenseCents + b.otherIncomeCents,
  }
}

const LINE_FIELD: Record<Exclude<PnlLine, 'drawings'>, keyof Bucket> = {
  cost_of_sales: 'costOfSalesCents',
  staff: 'staffCents',
  overheads: 'overheadsCents',
  other: 'otherExpenseCents',
}

/** Always reported: the first sentence of the last limitation, in both bases. */
export const NO_REFUND_TABLE =
  'The books have no refund or credit-note table, so nothing is subtracted for refunds or returns.'
const CANCELLED_ADVANCES = 'An advance on an order that was later cancelled stays in cash revenue.'

// ---------------------------------------------------------------- the calculation

export function computePnl(
  rawInput: PnlInput,
  opts: { mode: PnlMode; range: DateRange; businessIds: readonly string[] }
): PnlResult {
  const { mode, range } = opts
  const input = scopeInput(rawInput, opts.businessIds)
  const months = monthsInRange(range)
  const byMonth = new Map(months.map((m) => [m, emptyBucket()]))
  const total = emptyBucket()

  const add = (field: keyof Bucket, date: string, cents: number) => {
    if (cents === 0) return
    total[field] += cents
    const b = byMonth.get(date.slice(0, 7))
    if (b) b[field] += cents
  }

  const vendorCategory = new Map(input.vendors.map((v) => [v.id, v.category_name]))
  const unknown = new Set<string>()
  const excluded = {
    openingBalanceCents: 0,
    ownerWithdrawalCents: 0,
    transfers: { count: 0, moneyInCents: 0, moneyOutCents: 0 },
  }
  const revenueDetail = { advancesCents: 0, laterPaymentsCents: 0, deliveredOrders: 0 }
  let suppressedVendorPaymentsCents = 0
  let paymentDatedVendorCostsCents = 0
  let paymentDatedVendors = 0
  let accrualMiscRows = 0

  /** A vendor-attributed cost (credit - debit) onto its category's line. */
  const addVendorCost = (vendorId: string | null, date: string, cents: number) => {
    const { line, unknown: name } = classifyCategory(vendorId ? vendorCategory.get(vendorId) ?? null : null)
    if (line === 'drawings') {
      excluded.ownerWithdrawalCents += cents
      return
    }
    if (name && cents !== 0) unknown.add(name)
    add(LINE_FIELD[line], date, cents)
  }

  // ---- revenue
  if (mode === 'cash') {
    // Advances: every status, cancelled included (the cash was received and
    // there is no refund row). Never orders.total_amount.
    for (const o of input.orders) {
      if (!inRange(o.booking_date, range)) continue
      const c = toCents(o.advance_paid)
      revenueDetail.advancesCents += c
      add('revenueCents', o.booking_date!, c)
    }
    for (const p of input.payments) {
      if (!inRange(p.payment_date, range)) continue
      const c = toCents(p.amount)
      revenueDetail.laterPaymentsCents += c
      add('revenueCents', p.payment_date, c)
    }
  } else {
    // Delivered orders at their full value on the delivery date. Never
    // advances or payments.
    for (const o of input.orders) {
      if (o.status !== 'Delivered' || !inRange(o.delivery_date, range)) continue
      revenueDetail.deliveredOrders += 1
      add('revenueCents', o.delivery_date!, toCents(o.total_amount))
    }
  }

  // ---- general ledger: opening balances, transfers, miscellaneous, vendor payments
  // order_payment rows are a mirror of advances + payments: never read.
  const vendorPayments: PnlLedgerRow[] = []
  for (const g of input.ledger) {
    if (!inRange(g.entry_date, range)) continue
    if (g.entry_type === 'order_payment') continue
    const debit = toCents(g.debit)
    const credit = toCents(g.credit)

    if (g.entry_type === 'opening_balance') {
      excluded.openingBalanceCents += debit - credit
      continue
    }
    if (g.entry_type !== 'vendor_payment' && g.entry_type !== 'miscellaneous') continue

    if (isTransfer(g)) {
      excluded.transfers.count += 1
      excluded.transfers.moneyInCents += debit
      excluded.transfers.moneyOutCents += credit
      continue
    }

    if (g.entry_type === 'miscellaneous') {
      if (mode === 'accrual') accrualMiscRows += 1
      if (!g.vendor_id) {
        add('otherIncomeCents', g.entry_date, debit)
        add('otherExpenseCents', g.entry_date, credit)
      } else {
        addVendorCost(g.vendor_id, g.entry_date, credit - debit)
      }
      continue
    }

    // vendor_payment
    if (mode === 'cash') addVendorCost(g.vendor_id, g.entry_date, credit - debit)
    else vendorPayments.push(g)
  }

  // ---- accrual vendor costs: bills where the vendor has them, else payments
  if (mode === 'accrual') {
    const bills = new Map<string, PnlVendorLedgerRow[]>()
    for (const v of input.vendorLedger) {
      // Linked rows mirror a general-ledger payment: ignored in both modes.
      if (v.general_ledger_id) continue
      if (!inRange(v.entry_date, range)) continue
      if (toCents(v.debit) === 0 && toCents(v.credit) === 0) continue
      const list = bills.get(v.vendor_id) ?? []
      list.push(v)
      bills.set(v.vendor_id, list)
    }

    for (const [vendorId, rows] of bills) {
      for (const b of rows) addVendorCost(vendorId, b.entry_date, toCents(b.credit) - toCents(b.debit))
    }

    const fallbackVendors = new Set<string>()
    for (const g of vendorPayments) {
      const net = toCents(g.credit) - toCents(g.debit)
      if (g.vendor_id && bills.has(g.vendor_id)) {
        suppressedVendorPaymentsCents += net
        continue
      }
      addVendorCost(g.vendor_id, g.entry_date, net)
      if (classifyCategory(g.vendor_id ? vendorCategory.get(g.vendor_id) ?? null : null).line !== 'drawings') {
        paymentDatedVendorCostsCents += net
        fallbackVendors.add(g.vendor_id ?? '')
      }
    }
    paymentDatedVendors = fallbackVendors.size
  }

  // ---- limitations that apply to THIS result
  const limitations: string[] = []
  if (mode === 'accrual') {
    if (paymentDatedVendors > 0) {
      limitations.push(
        `${formatPKR(paymentDatedVendorCostsCents / 100)} of vendor costs (${paymentDatedVendors} ` +
          `${paymentDatedVendors === 1 ? 'vendor' : 'vendors'}) is dated on the day it was paid, ` +
          'because the books have no bill for it in this period.'
      )
    }
    if (suppressedVendorPaymentsCents !== 0) {
      limitations.push(
        `${formatPKR(suppressedVendorPaymentsCents / 100)} of vendor payments in this period is left out, ` +
          'because the same vendors have bills in this period and the bills are counted instead.'
      )
    }
    if (accrualMiscRows > 0) {
      limitations.push(
        'Miscellaneous ledger entries are dated on their entry date; nothing else in the books records when they were incurred.'
      )
    }
  }
  limitations.push(mode === 'cash' ? `${NO_REFUND_TABLE} ${CANCELLED_ADVANCES}` : NO_REFUND_TABLE)

  return {
    mode,
    range,
    statement: finish(total),
    monthly: months.map((month) => ({ month, ...finish(byMonth.get(month)!) })),
    revenueDetail,
    excluded,
    suppressedVendorPaymentsCents,
    paymentDatedVendorCostsCents,
    unknownCategories: [...unknown].sort((a, b) => a.localeCompare(b)),
    limitations,
  }
}
