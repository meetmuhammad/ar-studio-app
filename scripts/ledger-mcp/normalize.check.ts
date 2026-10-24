/**
 * Money, dates and entry rules of the ledger MCP, with no database and no
 * server: the pure functions in src/lib/ledger-mcp/normalize.ts.
 *
 *   npx tsx scripts/ledger-mcp/normalize.check.ts
 */
import assert from 'node:assert/strict'
import {
  businessToday, centsToDecimal, formatMoney, isRealDate, normalizeEntry, parseAmount, previewEntry, toCents,
} from '../../src/lib/ledger-mcp/normalize'

let passed = 0
const check = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log(`PASS  ${name}`) }
  catch (e) { console.log(`FAIL  ${name}\n        ${(e as Error).message}`); process.exitCode = 1 }
}

const today = '2026-10-24'
const good = { direction: 'receipt', amount: '5000', entry_date: today, description: 'Advance received from Ali (cash)', entry_type: 'miscellaneous' }
const run = (over: Record<string, unknown> = {}, ctx: { vendorName?: string | null } = {}) =>
  normalizeEntry({ ...good, ...over }, { today, ...ctx })
const problems = (over: Record<string, unknown>, ctx = {}) => {
  const r = run(over, ctx)
  assert('problems' in r, `expected problems, got ${JSON.stringify(r)}`)
  return (r as { problems: string[] }).problems.join(' | ')
}

// ---- money is exact
check('amounts parse to exact cents', () => {
  assert.equal((parseAmount('5000') as { cents: number }).cents, 500000)
  assert.equal((parseAmount('5,000.5') as { cents: number }).cents, 500050)
  assert.equal((parseAmount('0.07') as { cents: number }).cents, 7)
  assert.equal((parseAmount('9999999999.99') as { cents: number }).cents, 999_999_999_999)
})
check('amounts that would need rounding or a float are refused', () => {
  for (const bad of ['5000.123', '1e3', '10000000000', '0', '0.00', '-5', 'abc', '', ' ']) {
    assert('problem' in parseAmount(bad), `${JSON.stringify(bad)} was accepted`)
  }
  assert('problem' in parseAmount(5000), 'a JS number was accepted')
  assert('problem' in parseAmount(undefined), 'a missing amount was accepted')
})
check('cents <-> decimal round-trip, and totals do not drift like floats', () => {
  for (const c of [0, 1, 7, 99, 100, 123456789, 999_999_999_999]) assert.equal(toCents(centsToDecimal(c)), c)
  assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3), '0.1 + 0.2 must equal 0.3 in cents')
  assert.equal(0.1 + 0.2 === 0.3, false, 'sanity: the float sum really is off')
  assert.equal(toCents(1436000) - toCents(532500), 90350000)
})
check('money is displayed as PKR with separators', () => {
  assert.equal(formatMoney('5000.00'), 'PKR 5,000.00')
  assert.equal(formatMoney('1234567.50'), 'PKR 1,234,567.50')
  assert.equal(formatMoney('0.05'), 'PKR 0.05')
})

// ---- dates and the business timezone
check('only real calendar dates are accepted', () => {
  assert(isRealDate('2026-10-24') && isRealDate('2024-02-29'))
  for (const bad of ['2026-02-30', '2026-13-01', '2025-02-29', '24-10-2026', '2026-1-1', 'today', '']) assert(!isRealDate(bad), bad)
})
check('"today" follows the configured timezone, not UTC', () => {
  const instant = new Date('2026-10-23T20:30:00Z') // 01:30 on the 24th in Karachi (UTC+5)
  assert.equal(businessToday('Asia/Karachi', instant), '2026-10-24')
  assert.equal(businessToday('UTC', instant), '2026-10-23')
})
check('no timezone configured -> refuses to guess; invalid timezone -> refuses', () => {
  assert.throws(() => businessToday(undefined), /BUSINESS_TIMEZONE is not set/)
  assert.throws(() => businessToday(''), /BUSINESS_TIMEZONE is not set/)
  assert.throws(() => businessToday('Mars/Base'), /not a valid IANA timezone/)
})

// ---- the entry
check('a receipt is a debit; an expense is a credit; the other side is null', () => {
  const r = run() as { entry: { debit: string | null; credit: string | null; entry_type: string } }
  assert.equal(r.entry.debit, '5000.00'); assert.equal(r.entry.credit, null); assert.equal(r.entry.entry_type, 'miscellaneous')
  const e = run({ direction: 'expense', amount: '12.5' }) as typeof r
  assert.equal(e.entry.credit, '12.50'); assert.equal(e.entry.debit, null)
})
check('every missing field is named, and nothing is guessed', () => {
  const p = (normalizeEntry({}, { today }) as { problems: string[] }).problems.join(' | ')
  for (const word of ['direction', 'amount', 'entry_date', 'entry_type', 'description']) assert(p.includes(word), `${word} not reported in: ${p}`)
})
check('order_payment is refused with the reason, opening_balance too', () => {
  assert.match(problems({ entry_type: 'order_payment' }), /derived|sync|Payments screen/)
  assert.match(problems({ entry_type: 'opening_balance' }), /one-time/)
  assert.match(problems({ entry_type: 'whatever' }), /entry_type is required/)
})
check('a vendor payment needs a vendor and must be an expense', () => {
  const vendor = '11111111-1111-4111-8111-111111111111'
  assert.match(problems({ entry_type: 'vendor_payment', direction: 'expense' }), /vendor_id is required/)
  assert.match(problems({ entry_type: 'vendor_payment', direction: 'receipt', vendor_id: vendor }), /must be "expense"/)
  assert.match(problems({ vendor_id: vendor }), /only used with entry_type "vendor_payment"/)
  assert.match(problems({ entry_type: 'vendor_payment', direction: 'expense', vendor_id: 'not-a-uuid' }), /id returned by find_vendors/)
  const ok = run({ entry_type: 'vendor_payment', direction: 'expense', vendor_id: vendor, description: '' }, { vendorName: 'Acme Cloth' }) as { entry: { particulars: string; credit: string } }
  assert.equal(ok.entry.particulars, 'Payment to Acme Cloth'); assert.equal(ok.entry.credit, '5000.00')
})
check('the date is required and must be real; a future date is a warning, not a guess', () => {
  assert.match(problems({ entry_date: undefined }), /entry_date is required/)
  assert.match(problems({ entry_date: '2026-02-30' }), /not a real calendar date/)
  const f = run({ entry_date: '2026-11-01' }) as { warnings: string[] }
  assert.match(f.warnings.join(' '), /in the future/)
  assert.deepEqual((run() as { warnings: string[] }).warnings, [])
})
check('a number-typed amount or an unknown direction is refused', () => {
  assert.match(problems({ amount: 5000 }), /not a number/)
  assert.match(problems({ direction: 'deposit' }), /direction is required/)
})
check('the preview states amount, currency, type, date, description and that nothing links or moves', () => {
  const r = run() as { entry: Parameters<typeof previewEntry>[0] }
  const p = previewEntry(r.entry, { code: 'abcd1234' })
  for (const needle of ['RECEIPT (money in)', 'PKR 5,000.00', '2026-10-24', 'miscellaneous', 'Advance received from Ali (cash)', 'NOT linked to any order or customer', 'No money moves', 'abcd1234']) {
    assert(p.includes(needle), `preview is missing "${needle}":\n${p}`)
  }
})

console.log(`\nnormalize: ${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`)
