/**
 * Check for the orders "Nearest delivery" sort (getOrders, sortBy=delivery_date
 * asc): upcoming deliveries (>= today) soonest first, then past-due oldest
 * first, then no delivery date; and paging must walk that exact order.
 *
 * Run: npx tsx --env-file=.env.local scripts/check-nearest-delivery.ts [YYYY-MM-DD ...]
 * Each argument pins "today" (default: today in Asia/Karachi). Local database
 * only -- it reads real rows and must never point at production.
 */
import assert from 'node:assert'
import { getOrders } from '../src/lib/database'
import { createAdminSupabaseClient } from '../src/lib/supabase'
import { todayInBusinessZone } from '../src/lib/date-range'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(`refusing to run against a non-local database: ${url}`)
}

type Row = { id: string; order_number: string; delivery_date: string | null; created_at: string }

const bucket = (d: string | null, today: string) => (d === null ? 2 : d >= today ? 0 : 1)

async function check(today: string) {
  // Expected order, computed independently from every row.
  const { data, error } = await createAdminSupabaseClient()
    .from('orders')
    .select('id, order_number, delivery_date, created_at')
  if (error) throw error
  const expected = (data as Row[]).slice().sort((a, b) =>
    bucket(a.delivery_date, today) - bucket(b.delivery_date, today) ||
    (a.delivery_date ?? '').localeCompare(b.delivery_date ?? '') ||
    b.created_at.localeCompare(a.created_at) ||
    a.id.localeCompare(b.id)
  )

  // Walk the API's pages with an odd page size so pages straddle the segments.
  const pageSize = 7
  const got: Row[] = []
  let total = 0
  for (let page = 1; ; page++) {
    const r = await getOrders({ page, pageSize, sortBy: 'delivery_date', sortDir: 'asc', today })
    total = r.total
    got.push(...(r.data as unknown as Row[]))
    if (page >= r.pages) break
  }

  assert.equal(total, expected.length, 'total')
  assert.deepEqual(got.map((r) => r.id), expected.map((r) => r.id), 'paged order matches expected order')
  assert.equal(new Set(got.map((r) => r.id)).size, got.length, 'no row repeats across pages')

  const lines = got.map((r, i) => {
    const label = ['upcoming', 'past-due', 'no date'][bucket(r.delivery_date, today)]
    return `${String(i + 1).padStart(3)}  page ${Math.floor(i / pageSize) + 1}  ${r.delivery_date ?? 'null      '}  ${label.padEnd(8)}  ${r.order_number}`
  })
  const counts = [0, 1, 2].map((b) => got.filter((r) => bucket(r.delivery_date, today) === b).length)
  console.log(`today = ${today}  (upcoming ${counts[0]}, past-due ${counts[1]}, no date ${counts[2]}, total ${total}, pageSize ${pageSize})`)
  console.log(lines.join('\n'))
  console.log(`PASS: ${got.length} rows across ${Math.ceil(total / pageSize)} pages match upcoming asc -> past-due asc -> nulls\n`)
}

const main = async () => {
  const days = process.argv.slice(2)
  for (const d of days.length ? days : [todayInBusinessZone()]) await check(d)

  // Other sorts are untouched: newest booking date stays a plain desc order.
  const r = await getOrders({ pageSize: 100, sortBy: 'booking_date', sortDir: 'desc' })
  const dates = (r.data as unknown as { booking_date: string }[]).map((o) => o.booking_date)
  assert.deepEqual(dates, dates.slice().sort().reverse(), 'booking_date desc unchanged')
  console.log(`PASS: sortBy=booking_date desc still plain descending (${dates.length} rows)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
