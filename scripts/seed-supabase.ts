/**
 * Staging / local seed — synthetic data only.
 *
 * Replaces the original seed, which covered only customers and orders and
 * called an `increment_counter` RPC that is broken in production (the function
 * exists but the `counters` table it updates does not).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  customers ──┬── measurements                                            │
 * │              └── orders ──┬── order_items                                │
 * │                           └── payments ──► general_ledger                │
 * │                                                 │  (BEFORE INSERT trigger│
 * │                                                 │   computes balance)    │
 * │  vendors ──┬── vendor_tags                      │                        │
 * │            └── general_ledger (vendor_payment) ─┴──► vendor_ledger       │
 * │                                        (AFTER INSERT trigger creates it) │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ledger rows are inserted one at a time and in date order on purpose. The
 * `trg_calculate_general_ledger_balance` trigger computes a RUNNING balance from
 * the preceding row, so a bulk insert would produce balances that do not match
 * what production's trigger would have produced. Seeding through the same
 * trigger path is the point: staging should reproduce the real mechanism, not a
 * plausible-looking table.
 *
 * Volumes approximate production's shape (144 customers / 146 orders /
 * 136 payments / 45 vendors / 1,527 ledger rows) at about a third of the size —
 * enough for pagination, sorting and balance arithmetic to behave realistically
 * without making a reset slow.
 *
 * SAFETY: requireNonProduction() runs before anything else and is default-deny.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

// Load env BEFORE the guard reads it. .env.local wins, matching Next.js.
config({ path: resolve(__dirname, '../.env.local') })
config({ path: resolve(__dirname, '../.env') })

import { createClient } from '@supabase/supabase-js'
import { faker } from '@faker-js/faker'
import { requireNonProduction } from './lib/env-guard'

const target = requireNonProduction('seed-supabase')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// Deterministic output: the same seed produces the same fake shop every run,
// so a failing test is reproducible instead of "worked on my machine".
faker.seed(20260815)

const COUNTS = {
  customers: 60,
  orders: 80,
  vendors: 25,
  miscLedgerEntries: 40,
} as const

const ORDER_TYPES = ['nikkah', 'mehndi', 'barat', 'wallima', 'other'] as const
const ORDER_STATUSES = ['In Process', 'Delivered', 'Cancelled'] as const
const PAYMENT_METHODS = ['cash', 'bank', 'other'] as const

const WIPE = process.argv.includes('--force')

function money(min: number, max: number): number {
  return Number(faker.number.float({ min, max, fractionDigits: 2 }).toFixed(2))
}

function die(step: string, error: { message: string } | null): void {
  if (error) {
    console.error(`\n  ✖ ${step}: ${error.message}\n`)
    process.exit(1)
  }
}

async function alreadySeeded(): Promise<boolean> {
  const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true })
  return (count ?? 0) > 0
}

/** Child-first so foreign keys never block the delete. */
async function wipe(): Promise<void> {
  console.log('  wiping existing rows (--force)')
  const ALL = '00000000-0000-0000-0000-000000000000'
  for (const table of [
    'vendor_ledger',
    'general_ledger',
    'payments',
    'order_items',
    'orders',
    'measurements',
    'vendor_tags',
    'vendors',
    'customers',
  ]) {
    const { error } = await supabase.from(table).delete().neq('id', ALL)
    if (error) console.warn(`    ${table}: ${error.message}`)
  }
}

async function main(): Promise<void> {
  console.log(`  seeding ${target.label}\n`)

  if (await alreadySeeded()) {
    if (!WIPE) {
      console.log('  Data already present. Re-run with --force to wipe and reseed.\n')
      process.exit(0)
    }
    await wipe()
  }

  // ── customers ──────────────────────────────────────────────────────────────
  const customerRows = Array.from({ length: COUNTS.customers }, () => ({
    name: faker.person.fullName(),
    // Unique: production has a unique index on phone, and colliding fake
    // numbers would fail the insert non-deterministically.
    phone: faker.phone.number({ style: 'international' }) + faker.string.numeric(2),
    address: faker.location.streetAddress({ useFullAddress: true }),
  }))
  const { data: customers, error: cErr } = await supabase
    .from('customers').insert(customerRows).select('id')
  die('customers', cErr)
  console.log(`  customers        ${customers!.length}`)

  // ── measurements ───────────────────────────────────────────────────────────
  const measurementRows = customers!.flatMap((c, i) =>
    // Roughly half of production's customers have a measurement record.
    i % 2 === 0
      ? [{
          customer_id: c.id,
          name: 'Default Measurements',
          is_default: true,
          chest: money(34, 48), waist: money(28, 44), hip: money(34, 50),
          neck: money(13, 19), shoulder: money(15, 21), sleeves: money(22, 27),
          biceps: money(10, 17), wrist: money(6, 9), thigh: money(18, 28),
          knee: money(13, 20), bottom: money(12, 18),
          coat_length: money(28, 34), kameez_length: money(38, 46),
          sherwani_length: money(40, 50), pent_length: money(38, 44),
          pent_waist: money(28, 44), shoe_size: money(6, 12),
        }]
      : [],
  )
  const { data: measurements, error: mErr } = await supabase
    .from('measurements').insert(measurementRows).select('id, customer_id')
  die('measurements', mErr)
  console.log(`  measurements     ${measurements!.length}`)

  // ── orders ─────────────────────────────────────────────────────────────────
  // Sequential order numbers, generated here rather than via the broken
  // increment_counter RPC. Mirrors production's AR-00001 format.
  const orderRows = Array.from({ length: COUNTS.orders }, (_, i) => {
    const customer = faker.helpers.arrayElement(customers!)
    const booking = faker.date.between({ from: '2026-01-01', to: '2026-08-01' })
    const delivery = new Date(booking)
    delivery.setDate(delivery.getDate() + faker.number.int({ min: 7, max: 60 }))

    const total = money(15000, 250000)
    const advance = money(0, total) // satisfies check_advance_not_exceed_total

    return {
      order_number: `AR-${String(i + 1).padStart(5, '0')}`,
      customer_id: customer.id,
      booking_date: booking.toISOString().slice(0, 10),
      delivery_date: delivery.toISOString().slice(0, 10),
      status: faker.helpers.arrayElement(ORDER_STATUSES),
      total_amount: total,
      advance_paid: advance,
      balance: Number((total - advance).toFixed(2)),
      payment_method: faker.helpers.arrayElement(PAYMENT_METHODS),
      measurement_id:
        measurements!.find((m) => m.customer_id === customer.id)?.id ?? null,
      comments: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.4 }) ?? null,
      fitting_preferences:
        faker.helpers.maybe(() => faker.lorem.words(5), { probability: 0.3 }) ?? null,
    }
  })
  const { data: orders, error: oErr } = await supabase
    .from('orders').insert(orderRows).select('id, order_number, customer_id, booking_date, total_amount, advance_paid')
  die('orders', oErr)
  console.log(`  orders           ${orders!.length}`)

  // ── order_items ────────────────────────────────────────────────────────────
  // UNIQUE (order_id, order_type) — an order holds at most one item of each
  // type, so pick DISTINCT types rather than sampling with replacement.
  // Discovered by this seed failing against the real schema, which is the point
  // of seeding through the actual constraints instead of fabricating tables.
  const itemRows = orders!.flatMap((o) =>
    faker.helpers
      .arrayElements(ORDER_TYPES, faker.number.int({ min: 1, max: 3 }))
      .map((order_type) => ({
        order_id: o.id,
        order_type,
        description: faker.commerce.productName(),
      })),
  )
  const { error: iErr } = await supabase.from('order_items').insert(itemRows)
  die('order_items', iErr)
  console.log(`  order_items      ${itemRows.length}`)

  // ── vendors + tags ─────────────────────────────────────────────────────────
  const vendorRows = Array.from({ length: COUNTS.vendors }, () => ({
    name: faker.company.name(),
    contact_person: faker.person.fullName(),
    phone: faker.phone.number({ style: 'international' }),
    email: faker.internet.email(),
    address: faker.location.streetAddress(),
    notes: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }) ?? null,
  }))
  const { data: vendors, error: vErr } = await supabase
    .from('vendors').insert(vendorRows).select('id')
  die('vendors', vErr)

  const tagRows = vendors!.flatMap((v) =>
    faker.helpers
      .arrayElements(['fabric', 'embroidery', 'stitching', 'beading', 'dyeing', 'transport'],
        faker.number.int({ min: 1, max: 3 }))
      .map((tag_name) => ({ vendor_id: v.id, tag_name })),
  )
  const { data: tags, error: tErr } = await supabase
    .from('vendor_tags').insert(tagRows).select('id, vendor_id')
  die('vendor_tags', tErr)
  console.log(`  vendors          ${vendors!.length}  (+${tags!.length} tags)`)

  // ── payments ───────────────────────────────────────────────────────────────
  // Only against orders that actually took an advance, so the numbers are
  // internally consistent rather than merely present.
  const paymentRows = orders!
    .filter((o) => Number(o.advance_paid) > 0)
    .map((o) => ({
      order_id: o.id,
      customer_id: o.customer_id,
      amount: Number(o.advance_paid),
      payment_method: faker.helpers.arrayElement(PAYMENT_METHODS),
      payment_date: o.booking_date,
      notes: faker.helpers.maybe(() => 'Advance payment', { probability: 0.5 }) ?? null,
    }))
  const { error: pErr } = await supabase.from('payments').insert(paymentRows)
  die('payments', pErr)
  console.log(`  payments         ${paymentRows.length}`)

  // ── general_ledger ─────────────────────────────────────────────────────────
  // ONE AT A TIME, in date order: trg_calculate_general_ledger_balance derives
  // each row's balance from the previous one. Batch-inserting would race the
  // trigger and produce a running balance that never existed.
  type LedgerRow = {
    entry_date: string
    particulars: string
    debit?: number | null
    credit?: number | null
    entry_type: string
    order_id?: string | null
    vendor_id?: string | null
    tag_id?: string | null
    notes?: string | null
  }

  const ledger: LedgerRow[] = [
    {
      entry_date: '2026-01-01',
      particulars: 'Opening balance',
      debit: money(50000, 150000),
      entry_type: 'opening_balance',
    },
  ]

  // Order payments mirror the payments table (debit = money in).
  for (const o of orders!.filter((x) => Number(x.advance_paid) > 0)) {
    ledger.push({
      entry_date: o.booking_date,
      particulars: `Payment for Order #${o.order_number}`,
      debit: Number(o.advance_paid),
      entry_type: 'order_payment',
      order_id: o.id,
    })
  }

  // Vendor payments (credit = money out). These fire the AFTER INSERT trigger
  // that creates the matching vendor_ledger row.
  for (const tag of faker.helpers.arrayElements(tags!, Math.min(60, tags!.length))) {
    ledger.push({
      entry_date: faker.date.between({ from: '2026-01-15', to: '2026-08-10' }).toISOString().slice(0, 10),
      particulars: `Vendor payment — ${faker.commerce.productMaterial()}`,
      credit: money(2000, 60000),
      entry_type: 'vendor_payment',
      vendor_id: tag.vendor_id,
      tag_id: tag.id,
    })
  }

  for (let i = 0; i < COUNTS.miscLedgerEntries; i++) {
    const isDebit = faker.datatype.boolean()
    ledger.push({
      entry_date: faker.date.between({ from: '2026-01-05', to: '2026-08-12' }).toISOString().slice(0, 10),
      particulars: faker.helpers.arrayElement([
        'Shop rent', 'Electricity bill', 'Staff salary', 'Packaging material',
        'Courier charges', 'Miscellaneous income',
      ]),
      // The CHECK constraint requires exactly one of debit/credit.
      ...(isDebit ? { debit: money(1000, 40000) } : { credit: money(1000, 40000) }),
      entry_type: 'miscellaneous',
    })
  }

  ledger.sort((a, b) => a.entry_date.localeCompare(b.entry_date))

  let inserted = 0
  for (const row of ledger) {
    const { error } = await supabase.from('general_ledger').insert(row)
    if (error) {
      console.error(`\n  ✖ general_ledger row ${inserted + 1}: ${error.message}`)
      process.exit(1)
    }
    inserted++
    if (inserted % 50 === 0) process.stdout.write(`\r  general_ledger   ${inserted}/${ledger.length}`)
  }
  process.stdout.write(`\r  general_ledger   ${inserted}                \n`)

  const { count: vlCount } = await supabase
    .from('vendor_ledger').select('*', { count: 'exact', head: true })
  console.log(`  vendor_ledger    ${vlCount ?? 0}  (created by trigger)`)

  console.log('\n  Done. Synthetic data only — no production rows were read or copied.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
