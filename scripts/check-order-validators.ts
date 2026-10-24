/**
 * Create and partial-update behaviour of the order schemas (src/lib/validators.ts).
 *
 *   npx tsx scripts/check-order-validators.ts
 *
 * Background. UpdateOrderSchema used to be `CreateOrderSchema.partial()`, where
 * CreateOrderSchema carries three `.refine()` checks. zod >= 4.2 (which the MCP
 * SDK requires) throws on that, which crashed every orders route at import. zod
 * 4.1 had allowed it but silently DROPPED the checks on the partial schema. The
 * update schema is now built from the unrefined field object, which reproduces
 * the old behaviour exactly; this file pins that, so a dependency bump or a
 * well-meant "fix" cannot change it unnoticed.
 *
 * No database, no network.
 */
import assert from 'node:assert/strict'
import { CreateOrderSchema, UpdateOrderSchema } from '../src/lib/validators'

let failed = 0
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`PASS  ${name}`) } catch (e) { failed++; console.log(`FAIL  ${name}\n        ${(e as Error).message}`) }
}

const id = '11111111-1111-4111-8111-111111111111'
const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
const valid = { customerId: id, bookingDate: day('2026-10-01'), deliveryDate: day('2026-10-10'), totalAmount: 100, advancePaid: 50 }
const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  (r.error?.issues ?? []).map((i) => `${i.path.join('.')}: ${i.message}`)

// ---------------------------------------------------------------- the regression itself
check('both schemas load (zod >= 4.2 must not throw on UpdateOrderSchema)', () => {
  assert.ok(CreateOrderSchema && UpdateOrderSchema)
})

// ---------------------------------------------------------------- create: all three refinements preserved
check('CREATE accepts a valid order and fills the defaults', () => {
  const r = CreateOrderSchema.safeParse(valid)
  assert.ok(r.success, issues(r).join('; '))
  assert.equal(r.data.status, 'In Process')
  assert.deepEqual(r.data.orderItems, [])
})

check('CREATE refinement 1: delivery before booking is refused, on deliveryDate', () => {
  const r = CreateOrderSchema.safeParse({ ...valid, deliveryDate: day('2026-09-01') })
  assert.ok(!r.success)
  assert.deepEqual(issues(r), ['deliveryDate: Delivery date must be on or after booking date'])
})

check('CREATE refinement 1: delivery on the booking day is allowed', () => {
  assert.ok(CreateOrderSchema.safeParse({ ...valid, deliveryDate: valid.bookingDate }).success)
})

check('CREATE refinement 2: an advance larger than the total is refused, on advancePaid', () => {
  const r = CreateOrderSchema.safeParse({ ...valid, advancePaid: 500 })
  assert.ok(!r.success)
  assert.deepEqual(issues(r), ['advancePaid: Advance paid cannot exceed total amount'])
})

check('CREATE refinement 2: an advance equal to the total is allowed', () => {
  assert.ok(CreateOrderSchema.safeParse({ ...valid, advancePaid: 100 }).success)
})

check('CREATE refinement 3: two items of the same order type are refused, on orderItems', () => {
  const items = [{ order_type: 'nikkah', description: 'a' }, { order_type: 'nikkah', description: 'b' }]
  const r = CreateOrderSchema.safeParse({ ...valid, orderItems: items })
  assert.ok(!r.success)
  assert.deepEqual(issues(r), ['orderItems: Each order type can only be used once'])
})

check('CREATE field rules still hold (bad customer id, 5 items, negative total, long comments)', () => {
  assert.ok(!CreateOrderSchema.safeParse({ ...valid, customerId: 'nope' }).success)
  const five = Array.from({ length: 5 }, (_, i) => ({ order_type: 'other', description: String(i) }))
  assert.ok(!CreateOrderSchema.safeParse({ ...valid, orderItems: five }).success)
  assert.ok(!CreateOrderSchema.safeParse({ ...valid, totalAmount: -1 }).success)
  assert.ok(!CreateOrderSchema.safeParse({ ...valid, comments: 'x'.repeat(1001) }).success)
})

// ---------------------------------------------------------------- update: partial, no cross-field refinements
check('UPDATE accepts a partial body, including only comments', () => {
  const r = UpdateOrderSchema.safeParse({ comments: 'rush' })
  assert.ok(r.success, issues(r).join('; '))
  assert.equal(r.data.comments, 'rush')
})

check('UPDATE accepts an order number, which creation does not take', () => {
  assert.equal(UpdateOrderSchema.safeParse({ orderNumber: 'AR-00001' }).data?.orderNumber, 'AR-00001')
})

check('UPDATE keeps the per-field rules', () => {
  assert.ok(!UpdateOrderSchema.safeParse({ customerId: 'nope' }).success)
  assert.ok(!UpdateOrderSchema.safeParse({ status: 'Lost' }).success)
  assert.ok(!UpdateOrderSchema.safeParse({ comments: 'x'.repeat(1001) }).success)
  assert.ok(!UpdateOrderSchema.safeParse({ totalAmount: -1 }).success)
  assert.ok(UpdateOrderSchema.safeParse({ status: 'Delivered' }).success)
})

// ---------------------------------------------------------------- pinned existing behaviour
check('PINNED: UPDATE does not apply the three cross-field checks (as under zod 4.1)', () => {
  assert.ok(UpdateOrderSchema.safeParse({ bookingDate: day('2026-10-10'), deliveryDate: day('2026-10-01') }).success,
    'delivery-before-booking is accepted on update, as it always was')
  assert.ok(UpdateOrderSchema.safeParse({ totalAmount: 100, advancePaid: 500 }).success, 'advance > total accepted on update')
})

check('PINNED (known hazard): UPDATE fills the create defaults even for a partial body', () => {
  // `.partial()` leaves `.default()` in force, so {} parses to status "In Process" and
  // orderItems []. PATCH /api/orders/[id] then writes both. It does not bite while the
  // web form sends the whole order, but a status-only PATCH would reset items. Not
  // changed here (unrelated to the dependency repair); pinned so it is not changed by accident.
  const r = UpdateOrderSchema.safeParse({})
  assert.ok(r.success)
  assert.equal(r.data.status, 'In Process')
  assert.deepEqual(r.data.orderItems, [])
})

console.log(failed ? `\norder validators: ${failed} FAILED` : '\norder validators: all checks passed')
process.exit(failed ? 1 : 0)
