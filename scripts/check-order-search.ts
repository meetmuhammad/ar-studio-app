/**
 * Regression check for the orders search (src/lib/database.ts getOrders).
 *
 * The search once built a PostgREST `.or()` that referenced embedded columns
 * (`customers.name`, `customers.phone`). PostgREST cannot parse those in a
 * top-level logic tree, so every search returned PGRST100 and the orders page
 * showed nothing at all. Two quieter bugs rode along: `order_number` used
 * case-sensitive `like`, and the term was interpolated raw, so a comma split
 * the filter into nonsense.
 *
 * Run: npx tsx scripts/check-order-search.ts
 * Local database only -- it reads real rows and must never point at production.
 */
import 'dotenv/config'
import assert from 'node:assert'
import { getOrders } from '../src/lib/database'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(`refusing to run against a non-local database: ${url}`)
}

const main = async () => {
  // A term every seeded order number contains, in the wrong case on purpose:
  // the old code used `like`, so lowercase found nothing.
  const lower = await getOrders({ q: 'ar-0', pageSize: 100 })
  assert(lower.total > 0, 'lowercase order-number search must match (ilike, not like)')

  // Exact order number.
  const exact = await getOrders({ q: 'AR-00001', pageSize: 100 })
  assert(exact.total >= 1, 'exact order number must match')
  assert(
    exact.data.some((o: { order_number: string }) => o.order_number === 'AR-00001'),
    'exact search must return the order it names',
  )

  // Customer name -- the embedded column that used to break the whole query.
  const first = (exact.data[0] as { customers?: { name?: string } })?.customers
  const name = first?.name
  assert(name, 'fixture problem: seeded order has no customer name')
  const byName = await getOrders({ q: name.split(' ')[0], pageSize: 100 })
  assert(byName.total > 0, `customer-name search must match (tried "${name.split(' ')[0]}")`)

  // A term containing the delimiter PostgREST uses. Must return cleanly, not throw.
  const comma = await getOrders({ q: 'a,b', pageSize: 100 })
  assert(typeof comma.total === 'number', 'a term containing a comma must not break the filter')

  // Parens and quotes are the other characters that terminate a logic tree.
  for (const nasty of ['a)b', 'a("b', '%', '*']) {
    const r = await getOrders({ q: nasty, pageSize: 100 })
    assert(typeof r.total === 'number', `term ${JSON.stringify(nasty)} must not break the filter`)
  }

  // A term that matches nothing is an empty result, not an error.
  const none = await getOrders({ q: 'zzz-no-such-order-zzz', pageSize: 100 })
  assert(none.total === 0, 'a non-matching search must return zero rows, not everything')

  console.log('order search OK:',
    `lowercase=${lower.total}`,
    `exact=${exact.total}`,
    `byName=${byName.total}`,
    `none=${none.total}`)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
