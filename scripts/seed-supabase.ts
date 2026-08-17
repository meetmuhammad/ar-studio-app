/**
 * Seed a LOCAL Supabase database with synthetic data.
 *
 * Goal: `supabase db reset && npm run seed` gives a developer a working dataset
 * with no manual SQL.
 *
 * This script was broken. It spread twenty measurement fields directly onto the
 * `orders` insert, but measurements moved to their own table long ago and orders
 * now reference them by `measurement_id`. Every insert failed with
 * "Could not find the 'chest' column of 'orders'", and because the loop logged
 * and continued it still printed "Supabase seed completed" after creating zero
 * orders. Several field names were stale too -- `hips`, `pant_waist`,
 * `pant_length`, `turban_length`, `three_piece_waistcoat` -- against real
 * columns `hip`, `pent_waist`, `pent_length`, `turban_size`,
 * `three_piece_waistcoat_length`.
 *
 * It also trusted `increment_counter`, which returns NULL rather than raising
 * when the counters row is missing, so a from-zero database would have produced
 * orders with null order numbers.
 *
 * The generated data deliberately covers the cases the integrity verifiers
 * require -- orders with a zero advance, orders with no payments, and orders
 * with several payments -- so that a green verifier run after seeding means
 * something.
 *
 * LOCAL ONLY. Refuses to run against a non-loopback address.
 */

import { createClient } from '@supabase/supabase-js'
import { faker } from '@faker-js/faker'
import { resolveSupabase } from './lib/local-supabase.mjs'

const CUSTOMERS = 20
const ORDERS = 30
const VENDORS = 4

const { url, key, source } = resolveSupabase({ requireLocal: true })
console.log(`Target: ${url}  (credentials from ${source})`)

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Columns that actually exist on public.measurements. */
const MEASUREMENT_FIELDS = [
  'chest', 'waist', 'hip', 'neck', 'wrist', 'thigh', 'knee',
  'sleeves', 'biceps', 'shoulder', 'cross_back', 'open_coat_length',
  'coat_length', 'sherwani_length', 'kameez_length',
  'three_piece_waistcoat_length', 'waistcoat_length',
  'pent_waist', 'pent_length', 'bottom', 'shoe_size', 'turban_size',
] as const

const money = (min: number, max: number) =>
  Math.round(faker.number.float({ min, max }) / 500) * 500

const day = (d: Date) => d.toISOString().split('T')[0]

function fail(context: string, error: unknown): never {
  console.error(`\nFAILED: ${context}`)
  console.error(error)
  process.exit(1)
}

async function main() {
  console.log('Seeding local database...\n')

  // ---- customers ----
  const customerRows = Array.from({ length: CUSTOMERS }, () => ({
    name: faker.person.fullName(),
    phone: faker.phone.number({ style: 'international' }),
    address: faker.location.streetAddress({ useFullAddress: true }),
  }))
  const { data: customers, error: custErr } = await supabase
    .from('customers').insert(customerRows).select()
  if (custErr || !customers?.length) fail('creating customers', custErr)
  console.log(`  customers   ${customers.length}`)

  // ---- vendors ----
  const { data: vendors, error: vendErr } = await supabase
    .from('vendors')
    .insert(Array.from({ length: VENDORS }, () => ({
      name: faker.company.name(),
      contact_person: faker.person.fullName(),
      phone: faker.phone.number({ style: 'international' }),
    })))
    .select()
  if (vendErr) fail('creating vendors', vendErr)
  console.log(`  vendors     ${vendors?.length ?? 0}`)

  // ---- orders, each with its own measurements row ----
  let created = 0
  let zeroAdvance = 0
  let noPayments = 0
  let multiPayments = 0

  for (let i = 0; i < ORDERS; i++) {
    const customer = faker.helpers.arrayElement(customers)

    // increment_counter returns NULL (it does not raise) when the counters row
    // is missing, so the value must be checked, not just the error.
    const { data: seq, error: rpcErr } = await supabase.rpc('increment_counter', { counter_id: 1 })
    if (rpcErr) fail('allocating an order number', rpcErr)
    if (seq === null || seq === undefined) {
      fail(
        'allocating an order number',
        'increment_counter returned NULL. public.counters has no row with id = 1 — ' +
          'the baseline migration seeds it, so this database was not built from migrations.'
      )
    }

    const picked = faker.helpers.arrayElements(
      MEASUREMENT_FIELDS, faker.number.int({ min: 4, max: 12 })
    )
    const { data: measurement, error: mErr } = await supabase
      .from('measurements')
      .insert({
        customer_id: customer.id,
        name: `${customer.name} — set ${i + 1}`,
        is_default: true,
        ...Object.fromEntries(
          picked.map((f) => [f, faker.number.float({ min: 30, max: 150, fractionDigits: 1 })])
        ),
      })
      .select().single()
    if (mErr) fail('creating a measurements row', mErr)

    const bookingDate = faker.date.recent({ days: 90 })
    const totalAmount = money(50_000, 1_500_000)

    // Spread across the cases the verifiers must exercise.
    const shape = i % 3 // 0 = zero advance, 1 = advance only, 2 = advance + payments
    const advancePaid = shape === 0 ? 0 : money(10_000, Math.max(20_000, totalAmount / 2))

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .insert({
        order_number: `AR-${String(seq).padStart(5, '0')}`,
        customer_id: customer.id,
        booking_date: day(bookingDate),
        delivery_date: day(faker.date.soon({ days: 30, refDate: bookingDate })),
        comments: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.5 }) ?? null,
        fitting_preferences: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }) ?? null,
        total_amount: totalAmount,
        advance_paid: advancePaid,
        payment_method: faker.helpers.arrayElement(['cash', 'bank', 'other']),
        measurement_id: measurement.id,
        status: faker.helpers.arrayElement(['In Process', 'Delivered']),
      })
      .select().single()
    if (oErr) fail(`creating order ${i + 1}`, oErr)

    if (advancePaid === 0) zeroAdvance++

    if (shape === 2) {
      const n = faker.number.int({ min: 2, max: 3 })
      const rows = Array.from({ length: n }, () => ({
        order_id: order.id,
        customer_id: customer.id,
        amount: money(5_000, Math.max(10_000, (totalAmount - advancePaid) / 3)),
        payment_method: faker.helpers.arrayElement(['cash', 'bank', 'other']),
        payment_date: day(faker.date.between({ from: bookingDate, to: new Date() })),
      }))
      const { error: pErr } = await supabase.from('payments').insert(rows)
      if (pErr) fail('creating payments', pErr)
      multiPayments++
    } else {
      noPayments++
    }

    created++
  }

  console.log(`  orders      ${created}`)
  console.log(`  measurements ${created}`)

  // ---- general ledger ----
  // Without these the ledger integrity verifiers run against an empty table and
  // pass vacuously, which is worse than not running them: a green result that
  // checked nothing. Entries carrying a vendor_id also cause the sub-ledger
  // trigger to populate vendor_ledger, so both chains get exercised.
  //
  // Dates are deliberately shuffled rather than ascending. A back-dated insert
  // is exactly what used to break the running balance, so a seed that only ever
  // appends in order would hide the bug this fix exists to prevent.
  const ledgerRows: Record<string, unknown>[] = [
    {
      entry_date: day(faker.date.past({ years: 1 })),
      particulars: 'Opening balance',
      debit: money(500_000, 1_000_000),
      credit: null,
      entry_type: 'opening_balance',
    },
  ]
  for (let i = 0; i < 24; i++) {
    const vendor = i % 2 === 0 ? faker.helpers.arrayElement(vendors ?? []) : null
    const isVendorPayment = Boolean(vendor)
    ledgerRows.push({
      entry_date: day(faker.date.recent({ days: 120 })),
      particulars: isVendorPayment
        ? `Payment to ${vendor!.name}`
        : faker.helpers.arrayElement(['Studio expenses', 'Fabric purchase', 'Misc adjustment']),
      debit: isVendorPayment ? null : money(5_000, 60_000),
      credit: isVendorPayment ? money(5_000, 60_000) : null,
      entry_type: isVendorPayment ? 'vendor_payment' : 'miscellaneous',
      vendor_id: vendor?.id ?? null,
    })
  }

  // One statement at a time: the balance triggers are statement-level, and
  // inserting row by row is what a real user does through the entry form.
  for (const row of ledgerRows) {
    const { error } = await supabase.from('general_ledger').insert(row)
    if (error) fail('creating a general_ledger entry', error)
  }

  const { count: glCount } = await supabase
    .from('general_ledger').select('*', { count: 'exact', head: true })
  const { count: vlCount } = await supabase
    .from('vendor_ledger').select('*', { count: 'exact', head: true })
  console.log(`  general_ledger ${glCount ?? 0}`)
  console.log(`  vendor_ledger  ${vlCount ?? 0}  (created by trigger)`)
  console.log(`\nVerifier coverage produced:`)
  console.log(`  zero advance      ${zeroAdvance}`)
  console.log(`  no payments       ${noPayments}`)
  console.log(`  multiple payments ${multiPayments}`)

  if (!zeroAdvance || !noPayments || !multiPayments) {
    fail('coverage', 'seed did not produce every case the verifiers require')
  }

  console.log('\nSeed complete.')
}

main().catch((error) => fail('seeding', error))
