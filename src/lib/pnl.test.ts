/**
 * Locks the profit-and-loss double-count rules (src/lib/pnl.ts).
 * Run: node --import tsx --test src/lib/pnl.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyCategory,
  computePnl,
  monthsInRange,
  NO_REFUND_TABLE,
  resolvePnlRange,
  scopeInput,
  type PnlInput,
  type PnlLedgerRow,
  type PnlMode,
} from './pnl'
import { todayInBusinessZone } from './date-range'

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'
const MAY = { start: '2026-05-01', end: '2026-05-31' }

// Amounts are written as the API sees numeric columns: decimal strings or numbers in rupees.
const rs = (cents: number) => (cents / 100).toFixed(2)

function input(partial: Partial<PnlInput>): PnlInput {
  return { orders: [], payments: [], ledger: [], vendorLedger: [], vendors: [], ...partial }
}

function gl(p: Partial<PnlLedgerRow> & Pick<PnlLedgerRow, 'entry_type'>): PnlLedgerRow {
  return {
    business_id: A,
    entry_date: '2026-05-10',
    debit: null,
    credit: null,
    vendor_id: null,
    particulars: 'entry',
    notes: null,
    ...p,
  }
}

const run = (i: PnlInput, mode: PnlMode, range = MAY, businessIds = [A]) =>
  computePnl(i, { mode, range, businessIds })

const vendors = [
  { id: 'v-purch', business_id: A, category_name: 'Purchases' },
  { id: 'v-staff', business_id: A, category_name: 'Employees' },
  { id: 'v-fixed', business_id: A, category_name: 'Fixed Expense' },
  { id: 'v-charity', business_id: A, category_name: 'Charity' },
  { id: 'v-owner', business_id: A, category_name: 'Owner Withdrawal' },
  { id: 'v-odd', business_id: A, category_name: '  Packaging  ' },
  { id: 'v-none', business_id: A, category_name: null },
]

// 1 ---------------------------------------------------------------------------
test('1. delivered order: cash counts advance + payment, accrual counts the total, never both', () => {
  const i = input({
    orders: [{ business_id: A, booking_date: '2026-05-02', delivery_date: '2026-05-20', status: 'Delivered', total_amount: rs(100000), advance_paid: rs(20000) }],
    payments: [{ business_id: A, payment_date: '2026-05-15', amount: rs(30000) }],
  })
  const cash = run(i, 'cash')
  const accrual = run(i, 'accrual')
  assert.equal(cash.statement.revenueCents, 50000)
  assert.equal(cash.revenueDetail.advancesCents, 20000)
  assert.equal(cash.revenueDetail.laterPaymentsCents, 30000)
  assert.equal(accrual.statement.revenueCents, 100000)
  assert.notEqual(cash.statement.revenueCents, 150000)
  assert.notEqual(accrual.statement.revenueCents, 150000)
})

test('1b. accrual ignores In Process and Cancelled; cash keeps a cancelled advance', () => {
  const i = input({
    orders: [
      { business_id: A, booking_date: '2026-05-02', delivery_date: '2026-05-20', status: 'Cancelled', total_amount: 900, advance_paid: 100 },
      { business_id: A, booking_date: '2026-05-03', delivery_date: '2026-05-21', status: 'In Process', total_amount: 800, advance_paid: 200 },
    ],
  })
  assert.equal(run(i, 'accrual').statement.revenueCents, 0)
  assert.equal(run(i, 'cash').statement.revenueCents, 30000)
})

// 2 ---------------------------------------------------------------------------
test('2. a general-ledger order_payment debit never changes revenue', () => {
  const base = input({
    orders: [{ business_id: A, booking_date: '2026-05-02', delivery_date: '2026-05-20', status: 'Delivered', total_amount: rs(100000), advance_paid: rs(20000) }],
  })
  const withMirror = { ...base, ledger: [gl({ entry_type: 'order_payment', debit: rs(50000) })] }
  for (const mode of ['cash', 'accrual'] as const) {
    assert.equal(run(withMirror, mode).statement.revenueCents, run(base, mode).statement.revenueCents)
    assert.equal(run(withMirror, mode).statement.netProfitCents, run(base, mode).statement.netProfitCents)
  }
})

// 3 ---------------------------------------------------------------------------
test('3. a vendor payment and its linked vendor-ledger mirror count once', () => {
  const i = input({
    vendors,
    ledger: [gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', credit: rs(40000) })],
    vendorLedger: [{ business_id: A, vendor_id: 'v-purch', entry_date: '2026-05-10', debit: rs(40000), credit: null, general_ledger_id: 'gl-1' }],
  })
  for (const mode of ['cash', 'accrual'] as const) {
    assert.equal(run(i, mode).statement.costOfSalesCents, 40000, mode)
  }
})

// 4 ---------------------------------------------------------------------------
test('4. payment credit above the bill credit stays in accrual, payment-dated; only the covered part is suppressed', () => {
  const i = input({
    vendors,
    ledger: [gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', credit: rs(40000) })],
    vendorLedger: [{ business_id: A, vendor_id: 'v-purch', entry_date: '2026-05-05', debit: null, credit: rs(25000), general_ledger_id: null }],
  })
  const cash = run(i, 'cash')
  const accrual = run(i, 'accrual')
  assert.equal(cash.statement.costOfSalesCents, 40000)
  // bill 25,000 + (40,000 - 25,000 covered) = 40,000; the 15,000 above the bill is not dropped
  assert.equal(accrual.statement.costOfSalesCents, 40000)
  assert.equal(accrual.suppressedVendorPaymentsCents, 25000)
  assert.equal(accrual.paymentDatedVendorCostsCents, 15000)
  assert.equal(accrual.statement.netProfitCents, -40000) // suppressed is not added back
  assert.equal(cash.suppressedVendorPaymentsCents, 0)
  assert.notEqual(cash.statement.costOfSalesCents, 65000)
  assert.notEqual(accrual.statement.costOfSalesCents, 65000)
  assert.notEqual(accrual.statement.costOfSalesCents, 25000) // the old "bill replaces every payment" answer
  assert.ok(accrual.limitations.some((l) => /left out/.test(l)))
  assert.ok(accrual.limitations.some((l) => /dated on the day it was paid/.test(l)))
})

test('4a. partial settlement: bill 10,000, payment 4,000, same month -> cash 4,000, accrual 10,000, suppressed 4,000', () => {
  const i = input({
    vendors,
    ledger: [gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', entry_date: '2026-05-20', credit: rs(4000) })],
    vendorLedger: [{ business_id: A, vendor_id: 'v-purch', entry_date: '2026-05-05', debit: null, credit: rs(10000), general_ledger_id: null }],
  })
  const cash = run(i, 'cash')
  const accrual = run(i, 'accrual')
  assert.equal(cash.statement.costOfSalesCents, 4000)
  assert.equal(accrual.statement.costOfSalesCents, 10000)
  assert.notEqual(accrual.statement.costOfSalesCents, 14000)
  assert.equal(accrual.suppressedVendorPaymentsCents, 4000)
  assert.equal(accrual.paymentDatedVendorCostsCents, 0)
  assert.equal(accrual.monthly[0].costOfSalesCents, 10000)
})

test('4c. staging shape, sign arithmetic only (not why the debit exists): equal bill and payment credit plus a later debit -> staff -3,000,000 in both bases, net above revenue', () => {
  const YEAR = { start: '2026-01-01', end: '2026-12-31' }
  const i = input({
    vendors,
    payments: [{ business_id: A, payment_date: '2026-08-26', amount: rs(52200000) }],
    ledger: [
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-staff', entry_date: '2026-08-17', credit: rs(2000000) }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-staff', entry_date: '2026-08-18', debit: rs(5000000) }),
    ],
    vendorLedger: [{ business_id: A, vendor_id: 'v-staff', entry_date: '2026-08-17', debit: null, credit: rs(2000000), general_ledger_id: null }],
  })
  const cash = run(i, 'cash', YEAR)
  const accrual = run(i, 'accrual', YEAR)
  assert.equal(cash.statement.staffCents, -3000000)
  assert.equal(accrual.statement.staffCents, -3000000) // the 5,000,000 debit is not dropped
  assert.equal(accrual.suppressedVendorPaymentsCents, 2000000)
  assert.equal(accrual.paymentDatedVendorCostsCents, -5000000)
  assert.equal(cash.suppressedVendorPaymentsCents, 0)
  assert.equal(cash.statement.revenueCents, 52200000)
  // revenue - (negative staff) = net above revenue
  assert.equal(cash.statement.netProfitCents, 55200000)
  const aug = accrual.monthly.find((m) => m.month === '2026-08')!
  assert.equal(aug.staffCents, -3000000)
  assert.ok(accrual.limitations.some((l) => /never covered by a bill/.test(l)))
})

test('4d. date boundary: a March bill and an April payment count once in the year and separately in each month', () => {
  const i = input({
    vendors,
    ledger: [gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', entry_date: '2026-04-01', credit: rs(10000) })],
    vendorLedger: [{ business_id: A, vendor_id: 'v-purch', entry_date: '2026-03-01', debit: null, credit: rs(10000), general_ledger_id: null }],
  })
  const YEAR = { start: '2026-01-01', end: '2026-12-31' }
  const MARCH = { start: '2026-03-01', end: '2026-03-31' }
  const APRIL = { start: '2026-04-01', end: '2026-04-30' }

  const yearAccrual = run(i, 'accrual', YEAR)
  assert.equal(yearAccrual.statement.costOfSalesCents, 10000)
  assert.notEqual(yearAccrual.statement.costOfSalesCents, 20000)
  assert.equal(yearAccrual.suppressedVendorPaymentsCents, 10000)
  assert.equal(run(i, 'cash', YEAR).statement.costOfSalesCents, 10000)
  // inside the year, each month column is settled on its own: the March bill does not suppress the April payment
  const col = (m: string) => yearAccrual.monthly.find((x) => x.month === m)!.costOfSalesCents
  assert.equal(col('2026-03'), 10000)
  assert.equal(col('2026-04'), 10000)
  assert.ok(yearAccrual.limitations.some((l) => /do not add up/.test(l)))

  const march = run(i, 'accrual', MARCH)
  assert.equal(march.statement.costOfSalesCents, 10000)
  assert.equal(run(i, 'cash', MARCH).statement.costOfSalesCents, 0)

  const april = run(i, 'accrual', APRIL)
  assert.equal(april.statement.costOfSalesCents, 10000)
  assert.equal(april.suppressedVendorPaymentsCents, 0)
  assert.equal(april.paymentDatedVendorCostsCents, 10000)
  assert.equal(run(i, 'cash', APRIL).statement.costOfSalesCents, 10000)
})

test('4e. a bill for vendor A does not cover vendor B; a row for business A does not change business B', () => {
  const two = input({
    vendors,
    ledger: [
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', credit: rs(4000) }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-fixed', credit: rs(6000) }),
    ],
    vendorLedger: [{ business_id: A, vendor_id: 'v-purch', entry_date: '2026-05-05', debit: null, credit: rs(10000), general_ledger_id: null }],
  })
  const r = run(two, 'accrual')
  assert.equal(r.statement.costOfSalesCents, 10000)
  assert.equal(r.statement.overheadsCents, 6000) // v-fixed has no bill: unchanged
  assert.equal(r.suppressedVendorPaymentsCents, 4000)
  assert.equal(r.paymentDatedVendorCostsCents, 6000)

  // Business B carries a bill for the same vendor id as business A's payment.
  const BV = { id: 'v-b-purch', business_id: B, category_name: 'Purchases' }
  const books = input({
    vendors: [...vendors, BV],
    ledger: [gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', credit: rs(4000) })],
    vendorLedger: [
      { business_id: B, vendor_id: 'v-purch', entry_date: '2026-05-05', debit: null, credit: rs(9000), general_ledger_id: null },
      { business_id: B, vendor_id: 'v-b-purch', entry_date: '2026-05-06', debit: null, credit: rs(1000), general_ledger_id: null },
    ],
  })
  const a = run(books, 'accrual', MAY, [A])
  const b = run(books, 'accrual', MAY, [B])
  const both = run(books, 'accrual', MAY, [A, B])
  assert.equal(a.statement.costOfSalesCents, 4000)
  assert.equal(a.suppressedVendorPaymentsCents, 0)
  assert.equal(b.statement.otherExpenseCents + b.statement.costOfSalesCents, 10000)
  assert.equal(b.suppressedVendorPaymentsCents, 0)
  // combined: A's payment is not covered by B's bill
  assert.equal(both.suppressedVendorPaymentsCents, 0)
  assert.equal(both.statement.costOfSalesCents, 4000 + 9000 + 1000)
  assert.equal(both.paymentDatedVendorCostsCents, 4000)
})

test('4b. a zero-amount or out-of-range bill does not suppress the payment', () => {
  const i = input({
    vendors,
    ledger: [gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', credit: rs(40000) })],
    vendorLedger: [
      { business_id: A, vendor_id: 'v-purch', entry_date: '2026-05-05', debit: '0', credit: null, general_ledger_id: null },
      { business_id: A, vendor_id: 'v-purch', entry_date: '2026-06-01', debit: null, credit: rs(25000), general_ledger_id: null },
    ],
  })
  const accrual = run(i, 'accrual')
  assert.equal(accrual.statement.costOfSalesCents, 40000)
  assert.equal(accrual.suppressedVendorPaymentsCents, 0)
})

// 5 ---------------------------------------------------------------------------
test('5. a vendor payment with no bill counts in both modes and accrual says it is payment-dated', () => {
  const i = input({
    vendors,
    ledger: [gl({ entry_type: 'vendor_payment', vendor_id: 'v-fixed', credit: rs(12000) })],
  })
  const cash = run(i, 'cash')
  const accrual = run(i, 'accrual')
  assert.equal(cash.statement.overheadsCents, 12000)
  assert.equal(accrual.statement.overheadsCents, 12000)
  assert.equal(accrual.paymentDatedVendorCostsCents, 12000)
  assert.ok(accrual.limitations.some((l) => /dated on the day it was paid/.test(l)))
  assert.ok(!cash.limitations.some((l) => /dated on the day it was paid/.test(l)))
})

test('5b. a vendor_payment debit (money back) reduces that cost', () => {
  const i = input({
    vendors,
    ledger: [
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', credit: rs(40000) }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', debit: rs(5000) }),
    ],
  })
  assert.equal(run(i, 'cash').statement.costOfSalesCents, 35000)
  assert.equal(run(i, 'accrual').statement.costOfSalesCents, 35000)
})

// 6 ---------------------------------------------------------------------------
test('6. opening balance and Owner Withdrawal stay out of revenue, costs and net profit', () => {
  const i = input({
    vendors,
    ledger: [
      gl({ entry_type: 'opening_balance', debit: rs(991000) }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-owner', credit: rs(70000) }),
      gl({ entry_type: 'miscellaneous', vendor_id: 'v-owner', credit: rs(5000) }),
    ],
  })
  for (const mode of ['cash', 'accrual'] as const) {
    const r = run(i, mode)
    assert.deepEqual(
      { ...r.statement },
      { revenueCents: 0, costOfSalesCents: 0, grossProfitCents: 0, staffCents: 0, overheadsCents: 0, otherExpenseCents: 0, otherIncomeCents: 0, netProfitCents: 0 },
      mode
    )
    assert.equal(r.excluded.openingBalanceCents, 991000)
    assert.equal(r.excluded.ownerWithdrawalCents, 75000)
    assert.equal(r.paymentDatedVendorCostsCents, 0)
  }
})

// 7 ---------------------------------------------------------------------------
test('7. business scope: one id drops the other, combined keeps both, empty throws', () => {
  const i = input({
    orders: [
      { business_id: A, booking_date: '2026-05-02', delivery_date: '2026-05-20', status: 'Delivered', total_amount: 1000, advance_paid: 100 },
      { business_id: B, booking_date: '2026-05-02', delivery_date: '2026-05-20', status: 'Delivered', total_amount: 2000, advance_paid: 300 },
    ],
    payments: [{ business_id: B, payment_date: '2026-05-03', amount: 50 }],
    ledger: [gl({ business_id: B, entry_type: 'miscellaneous', credit: 10 })],
  })
  assert.equal(scopeInput(i, [A]).orders.length, 1)
  assert.equal(scopeInput(i, [A]).payments.length, 0)
  assert.equal(run(i, 'cash', MAY, [A]).statement.revenueCents, 10000)
  assert.equal(run(i, 'cash', MAY, [A]).statement.otherExpenseCents, 0)
  assert.equal(run(i, 'cash', MAY, [B]).statement.revenueCents, 35000)
  assert.equal(run(i, 'cash', MAY, [A, B]).statement.revenueCents, 45000)
  assert.equal(run(i, 'accrual', MAY, [A, B]).statement.revenueCents, 300000)
  assert.throws(() => run(i, 'cash', MAY, []), /empty business scope/)
  assert.throws(() => scopeInput(i, []), /empty business scope/)
})

// 8 ---------------------------------------------------------------------------
test('8. date edges: last day of the month in, next day out', () => {
  const i = input({
    payments: [
      { business_id: A, payment_date: '2026-05-31', amount: 100 },
      { business_id: A, payment_date: '2026-06-01', amount: 200 },
      { business_id: A, payment_date: '2026-04-30', amount: 400 },
    ],
  })
  const r = run(i, 'cash')
  assert.equal(r.statement.revenueCents, 10000)
  assert.deepEqual(r.monthly.map((m) => m.month), ['2026-05'])
})

test('8b. presets use the Karachi calendar date and cover the whole period', () => {
  const q = todayInBusinessZone(new Date('2026-03-31T19:30:00.000Z'))
  assert.equal(q, '2026-04-01')
  assert.deepEqual(resolvePnlRange('this_quarter', {}, q), { range: { start: '2026-04-01', end: '2026-06-30' } })

  const m = todayInBusinessZone(new Date('2026-11-06T19:30:00.000Z'))
  assert.equal(m, '2026-11-07')
  assert.deepEqual(resolvePnlRange('this_month', {}, m), { range: { start: '2026-11-01', end: '2026-11-30' } })
  assert.deepEqual(resolvePnlRange('this_year', {}, m), { range: { start: '2026-01-01', end: '2026-12-31' } })
  assert.deepEqual(resolvePnlRange('this_quarter', {}, m), { range: { start: '2026-10-01', end: '2026-12-31' } })
  assert.deepEqual(resolvePnlRange('this_quarter', {}, '2026-02-14'), { range: { start: '2026-01-01', end: '2026-03-31' } })
  assert.deepEqual(resolvePnlRange('this_quarter', {}, '2026-08-31'), { range: { start: '2026-07-01', end: '2026-09-30' } })
})

test('8c. custom range validation', () => {
  assert.ok('error' in resolvePnlRange('custom', { start: '2026-01-01' }))
  assert.ok('error' in resolvePnlRange('custom', { start: '2026-03-01', end: '2026-02-01' }))
  assert.ok('error' in resolvePnlRange('custom', { start: '2026-02-01', end: '2026-02-30' }))
  assert.ok('error' in resolvePnlRange('custom', { start: '2026-02-30', end: '2026-03-01' }))
  assert.ok('error' in resolvePnlRange('last_3_months'))
  assert.ok('error' in resolvePnlRange(undefined))
  assert.deepEqual(resolvePnlRange('custom', { start: '2026-02-01', end: '2026-02-01' }), { range: { start: '2026-02-01', end: '2026-02-01' } })
})

test('8d. monthly trend covers every month touched, with zeroes', () => {
  assert.deepEqual(monthsInRange({ start: '2025-11-20', end: '2026-02-03' }), ['2025-11', '2025-12', '2026-01', '2026-02'])
  const r = run(input({ payments: [{ business_id: A, payment_date: '2026-01-15', amount: 100 }] }), 'cash', { start: '2025-11-20', end: '2026-02-03' })
  assert.deepEqual(r.monthly.map((m) => [m.month, m.revenueCents, m.netProfitCents]), [
    ['2025-11', 0, 0], ['2025-12', 0, 0], ['2026-01', 10000, 10000], ['2026-02', 0, 0],
  ])
})

// 9 ---------------------------------------------------------------------------
test('9. a transfer miscellaneous credit is excluded and only counted', () => {
  const i = input({
    ledger: [
      gl({ entry_type: 'miscellaneous', credit: rs(80000), particulars: 'Bank Transfer to savings' }),
      gl({ entry_type: 'miscellaneous', credit: rs(1000), particulars: 'Tea', notes: 'TRANSFER' }),
      gl({ entry_type: 'miscellaneous', credit: rs(500), particulars: 'Transferred stock' }), // not the whole word
    ],
  })
  for (const mode of ['cash', 'accrual'] as const) {
    const r = run(i, mode)
    assert.equal(r.statement.otherExpenseCents, 500)
    assert.deepEqual(r.excluded.transfers, { count: 2, moneyInCents: 0, moneyOutCents: 81000 })
    assert.ok(!JSON.stringify(r).includes('savings'))
  }
})

// 10 --------------------------------------------------------------------------
test('10. category map: Charity, Purchases, Employees, Fixed Expense, unknown and none', () => {
  assert.equal(classifyCategory('Charity').line, 'other')
  assert.equal(classifyCategory('Purchases').line, 'cost_of_sales')
  assert.equal(classifyCategory('  employees ').line, 'staff')
  assert.equal(classifyCategory('Fixed Expense').line, 'overheads')
  assert.equal(classifyCategory('Uncategorized').line, 'other')
  assert.equal(classifyCategory('Owner Withdrawal').line, 'drawings')
  assert.deepEqual(classifyCategory('Packaging'), { line: 'other', unknown: 'Packaging' })
  assert.deepEqual(classifyCategory(null), { line: 'other' })

  const i = input({
    vendors,
    ledger: [
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-charity', credit: 1 }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-purch', credit: 2 }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-staff', credit: 4 }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-fixed', credit: 8 }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-odd', credit: 16 }),
      gl({ entry_type: 'vendor_payment', vendor_id: 'v-none', credit: 32 }),
    ],
  })
  const r = run(i, 'cash')
  assert.equal(r.statement.otherExpenseCents, 4900)
  assert.equal(r.statement.costOfSalesCents, 200)
  assert.equal(r.statement.staffCents, 400)
  assert.equal(r.statement.overheadsCents, 800)
  assert.deepEqual(r.unknownCategories, ['Packaging'])
  assert.equal(r.statement.grossProfitCents, -200)
  assert.equal(r.statement.netProfitCents, -6300)
})

// misc and shape ---------------------------------------------------------------
test('miscellaneous: no vendor debit is other income, credit other expense; with a vendor it follows the category', () => {
  const i = input({
    vendors,
    ledger: [
      gl({ entry_type: 'miscellaneous', debit: rs(3000) }),
      gl({ entry_type: 'miscellaneous', credit: rs(1000) }),
      gl({ entry_type: 'miscellaneous', vendor_id: 'v-staff', credit: rs(2000) }),
      gl({ entry_type: 'miscellaneous', vendor_id: 'v-staff', debit: rs(500) }),
    ],
  })
  for (const mode of ['cash', 'accrual'] as const) {
    const r = run(i, mode)
    assert.equal(r.statement.otherIncomeCents, 3000)
    assert.equal(r.statement.otherExpenseCents, 1000)
    assert.equal(r.statement.staffCents, 1500)
    assert.equal(r.statement.netProfitCents, 500)
  }
  assert.ok(run(i, 'accrual').limitations.some((l) => /Miscellaneous/.test(l)))
  assert.ok(!run(i, 'cash').limitations.some((l) => /Miscellaneous/.test(l)))
})

test('empty activity is a real zero statement with the no-refund limitation', () => {
  for (const mode of ['cash', 'accrual'] as const) {
    const r = run(input({}), mode)
    assert.equal(r.statement.netProfitCents, 0)
    assert.equal(r.monthly.length, 1)
    assert.equal(r.limitations.length, 1)
    assert.ok(r.limitations[0].startsWith(NO_REFUND_TABLE))
  }
})

test('amounts are summed exactly in cents', () => {
  const i = input({
    payments: Array.from({ length: 10 }, () => ({ business_id: A, payment_date: '2026-05-01', amount: '0.10' })),
  })
  assert.equal(run(i, 'cash').statement.revenueCents, 100)
})
