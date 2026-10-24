/**
 * Turns what an assistant sends into the exact row the ledger stores, or says
 * precisely what is missing or wrong. Never guesses: a missing or ambiguous
 * field is returned as a problem for the user to answer, not filled in.
 *
 * What the application already defines, and this file follows rather than
 * invents:
 *   - amounts are numeric(12,2); a row has a debit XOR a credit
 *   - debit raises the running balance (money in), credit lowers it (money out)
 *   - entry types are opening_balance | order_payment | vendor_payment | miscellaneous
 *   - vendor payments are credits and need a vendor (ledger-entry-form.tsx)
 *   - currency is PKR in every place it is displayed; there is no currency column
 *
 * What this file deliberately refuses to create:
 *   - order_payment: those rows are derived. The Payments flow writes them, and
 *     POST /api/general-ledger/sync-payments deletes and rebuilds every one from
 *     orders and payments, so an assistant-made row would not update the order
 *     and would be deleted by the next sync.
 *   - opening_balance: a one-time set-up entry, not a daily one.
 *
 * Money is handled as integer cents. A cent count is exact in a JS number well
 * past the column's ceiling (999,999,999,999 cents < 2^53), so nothing here ever
 * touches a float.
 */

export const MCP_ENTRY_TYPES = ['miscellaneous', 'vendor_payment'] as const
export type McpEntryType = (typeof MCP_ENTRY_TYPES)[number]
export type Direction = 'receipt' | 'expense'

export const CURRENCY = 'PKR'

/** numeric(12,2): at most ten integer digits and two decimals. */
const AMOUNT_RE = /^(\d{1,10})(?:\.(\d{1,2}))?$/
const MAX_CENTS = 999_999_999_999

/** "5000" / "5,000" / "5000.5" -> cents, or the reason it is not an amount. */
export function parseAmount(raw: unknown): { cents: number } | { problem: string } {
  if (typeof raw === 'number') {
    return { problem: 'amount must be given as text such as "5000.00", not a number, so no rounding can happen' }
  }
  if (typeof raw !== 'string') return { problem: 'amount is required' }
  const m = AMOUNT_RE.exec(raw.trim().replace(/,/g, ''))
  if (!m) {
    return { problem: `amount "${raw}" is not a plain amount with at most 2 decimals (for example 5000 or 5000.50)` }
  }
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0')
  if (cents <= 0) return { problem: 'amount must be greater than zero' }
  if (cents > MAX_CENTS) return { problem: 'amount is larger than the ledger can store' }
  return { cents }
}

export const centsToDecimal = (cents: number): string => {
  const abs = Math.abs(cents)
  const s = String(abs).padStart(3, '0')
  return `${cents < 0 ? '-' : ''}${s.slice(0, -2)}.${s.slice(-2)}`
}

/** A numeric column value (string or number) -> cents. Used to total rows exactly. */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const [whole, frac = ''] = String(value).split('.')
  const cents = Number(whole.replace('-', '') || '0') * 100 + Number(frac.padEnd(2, '0').slice(0, 2) || '0')
  return whole.startsWith('-') ? -cents : cents
}

/** Display with thousands separators, e.g. "PKR 5,000.00". */
export function formatMoney(decimal: string): string {
  const [whole, frac] = decimal.split('.')
  return `${CURRENCY} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`
}

// ---------------------------------------------------------------- dates
/**
 * The business date "today" in the configured timezone. There is no default:
 * the app configures none today (the web form takes the UTC date, which is the
 * previous day for part of every night in Pakistan), and guessing a zone would
 * silently misdate entries.
 */
export function businessToday(timeZone: string | undefined, now = new Date()): string {
  if (!timeZone) {
    throw new Error('BUSINESS_TIMEZONE is not set; refusing to guess which day "today" is')
  }
  try {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    throw new Error(`BUSINESS_TIMEZONE "${timeZone}" is not a valid IANA timezone`)
  }
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

// ---------------------------------------------------------------- the entry
export interface EntryInput {
  direction?: unknown
  amount?: unknown
  entry_date?: unknown
  description?: unknown
  entry_type?: unknown
  vendor_id?: unknown
  notes?: unknown
}

/** Exactly the columns the commit function inserts. */
export interface NormalizedEntry {
  entry_date: string
  particulars: string
  debit: string | null
  credit: string | null
  entry_type: McpEntryType
  notes: string | null
  vendor_id: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeEntry(
  input: EntryInput,
  ctx: { today: string; vendorName?: string | null },
): { entry: NormalizedEntry; warnings: string[] } | { problems: string[] } {
  const problems: string[] = []
  const warnings: string[] = []

  const direction = input.direction
  if (direction !== 'receipt' && direction !== 'expense') {
    problems.push('direction is required: "receipt" (money received) or "expense" (money paid out)')
  }

  const amount = parseAmount(input.amount)
  if ('problem' in amount) problems.push(amount.problem)

  const date = typeof input.entry_date === 'string' ? input.entry_date.trim() : ''
  if (!date) problems.push('entry_date is required as YYYY-MM-DD; ask the user which day this belongs to')
  else if (!isRealDate(date)) problems.push(`entry_date "${date}" is not a real calendar date in YYYY-MM-DD form`)
  else if (date > ctx.today) warnings.push(`The date ${date} is in the future (the business date today is ${ctx.today}).`)

  const type = input.entry_type
  if (type === 'order_payment') {
    problems.push(
      'order_payment entries cannot be created here: they are derived from the order and payments records, ' +
        'and the ledger sync would delete one made by hand. Record the payment against the order in the Payments screen.',
    )
  } else if (type === 'opening_balance') {
    problems.push('opening_balance is a one-time set-up entry and is not supported here')
  } else if (!(MCP_ENTRY_TYPES as readonly string[]).includes(type as string)) {
    problems.push(`entry_type is required: one of ${MCP_ENTRY_TYPES.join(', ')}`)
  }

  const vendorId = typeof input.vendor_id === 'string' && input.vendor_id.trim() ? input.vendor_id.trim() : null
  if (vendorId && !UUID_RE.test(vendorId)) problems.push('vendor_id must be an id returned by find_vendors')
  if (type === 'vendor_payment') {
    if (!vendorId) problems.push('vendor_id is required for a vendor_payment; use find_vendors and let the user pick one')
    if (direction === 'receipt') problems.push('a vendor_payment is money paid out, so its direction must be "expense"')
  } else if (vendorId) {
    problems.push('vendor_id is only used with entry_type "vendor_payment"')
  }

  let particulars = typeof input.description === 'string' ? input.description.trim() : ''
  if (!particulars && type === 'vendor_payment' && ctx.vendorName) particulars = `Payment to ${ctx.vendorName}`
  if (!particulars) problems.push('description is required: what this entry is for, in the user\'s words')
  if (particulars.length > 500) problems.push('description is longer than 500 characters')

  const notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null
  if (notes && notes.length > 1000) problems.push('notes is longer than 1000 characters')

  if (problems.length || 'problem' in amount) return { problems }

  const dec = centsToDecimal(amount.cents)
  return {
    entry: {
      entry_date: date,
      particulars,
      debit: direction === 'receipt' ? dec : null,
      credit: direction === 'expense' ? dec : null,
      entry_type: type as McpEntryType,
      notes,
      vendor_id: vendorId,
    },
    warnings,
  }
}

/** The human-readable preview the user is shown before anything is saved. */
export function previewEntry(e: NormalizedEntry, extra: { vendorName?: string | null; code: string }): string {
  const isReceipt = e.debit !== null
  const amount = formatMoney((e.debit ?? e.credit) as string)
  const lines = [
    `${isReceipt ? 'RECEIPT (money in)' : 'EXPENSE (money out)'}  ${amount}`,
    `Date:         ${e.entry_date}`,
    `Type:         ${e.entry_type}`,
    `Description:  ${e.particulars}`,
  ]
  if (e.vendor_id) lines.push(`Vendor:       ${extra.vendorName ?? e.vendor_id}`)
  if (e.notes) lines.push(`Notes:        ${e.notes}`)
  lines.push(
    `Currency:     ${CURRENCY} (the ledger stores no currency column)`,
    `Ledger side:  ${isReceipt ? 'debit (raises the balance)' : 'credit (lowers the balance)'}`,
    e.entry_type === 'miscellaneous'
      ? 'This is a standalone ledger entry. It is NOT linked to any order or customer and does not change any order\'s paid balance. No money moves.'
      : 'This records a payment already made to the vendor and also appears in that vendor\'s ledger. No money moves.',
    `Reference:    ${extra.code}`,
  )
  return lines.join('\n')
}
