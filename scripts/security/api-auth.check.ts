/**
 * Server-side authorization of the ledger, payments and orders API routes,
 * exercised in-process: the real route handlers are called with real Request
 * objects and real local-GoTrue tokens.
 *
 *   npx tsx --env-file=.env.local scripts/security/api-auth.check.ts
 *
 * Intended access (from the web app's own role guards and callers):
 *   admin only      general-ledger (all), vendor-ledger        -> ledger pages are RoleGuard admin
 *   staff + admin   payments, orders                           -> staff record payments and create orders,
 *                                                                 and both write the ledger server-side
 *
 * SAFETY. Verify authorization before any side effect, and never let a missing
 * guard touch existing data:
 *   1. Before a handler is invoked at all, its own source is checked: a guard
 *      call must appear before its first database access. A handler that fails
 *      this is reported and NOT called, so an unguarded sync-payments can never
 *      delete and rebuild the local ledger.
 *   2. Requests use bodies and ids that reach nothing even when authorized
 *      (empty bodies, nonexistent ids), so a broken guard shows up as a
 *      missing 401 rather than as a changed row.
 *   3. The one real write flow (staff records a payment) uses a disposable
 *      customer, order and payment created and removed here.
 * sync-payments is never run as an authorized user.
 *
 * Local database only. Synthetic users and rows, removed afterward.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { service, makeUser, rowCount, step, ensure, finish, cleanup } from './support'
import * as ledger from '../../src/app/api/general-ledger/route'
import * as ledgerById from '../../src/app/api/general-ledger/[id]/route'
import * as ledgerStats from '../../src/app/api/general-ledger/stats/route'
import * as ledgerSync from '../../src/app/api/general-ledger/sync-payments/route'
import * as vendorLedger from '../../src/app/api/vendor-ledger/route'
import * as payments from '../../src/app/api/payments/route'
import * as paymentsById from '../../src/app/api/payments/[id]/route'
import * as orders from '../../src/app/api/orders/route'
import * as ordersById from '../../src/app/api/orders/[id]/route'
import * as ordersAll from '../../src/app/api/orders/all/route'

type Handler = (request: Request, ctx?: unknown) => Promise<Response>
const call = (h: unknown, request: Request, ctx?: unknown) => (h as Handler)(request, ctx)

const base = 'http://localhost/api'
const req = (path: string, method: string, token: string | null, body?: unknown) =>
  new Request(`${base}${path}`, {
    method,
    headers: {
      ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

/** A syntactically valid JWT signed with the wrong secret, claiming to be `sub`. */
function forgedJwt(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
  const sig = createHmac('sha256', 'not-the-real-secret').update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

/**
 * Does this handler call a guard before it touches the database? Read from the
 * handler's own source, so it holds per handler even in a multi-handler file.
 */
const SIDE_EFFECT =
  /createAdminSupabaseClient\(|\b(getOrders|getOrder|createOrder|createOrderItems|updateOrder|updateOrderItems|deleteOrder|getAllOrdersSimple)\(/
function guardPrecedesSideEffects(file: string, method: string): { ok: boolean; why: string } {
  const src = readFileSync(resolve(process.cwd(), file), 'utf8')
  const start = src.search(new RegExp(`export\\s+async\\s+function\\s+${method}\\b`))
  if (start === -1) return { ok: false, why: `${method} not found in ${file}` }
  const rest = src.slice(start + 1)
  const next = rest.search(/export\s+async\s+function\s/)
  const body = next === -1 ? rest : rest.slice(0, next)

  const guard = body.search(/require(Admin|Auth|Role)\(/)
  const effect = body.search(SIDE_EFFECT)
  if (guard === -1) return { ok: false, why: `${method} ${file}: no guard call` }
  if (effect !== -1 && effect < guard) return { ok: false, why: `${method} ${file}: database access before the guard` }
  return { ok: true, why: '' }
}

async function main() {
  const admin = await makeUser('admin', 'admin')
  const staff = await makeUser('staff', 'staff')

  const today = new Date().toISOString().slice(0, 10)
  const missing = randomUUID() // an id that matches nothing, for side-effect-free requests
  const { data: vendor } = await service.from('vendors').select('id').limit(1).single()
  ensure(vendor, 'fixture problem: no vendor in the local database')

  // ---- disposable fixtures
  const { data: fixture, error: fErr } = await service.from('general_ledger')
    .insert({ entry_date: today, particulars: 'SEC-CHECK fixture', debit: 7, entry_type: 'miscellaneous' })
    .select('id').single()
  ensure(fixture, `fixture insert failed: ${fErr?.message}`)
  const { data: syncBait, error: sErr } = await service.from('general_ledger')
    .insert({ entry_date: today, particulars: 'SEC-CHECK order_payment bait', debit: 3, entry_type: 'order_payment' })
    .select('id').single()
  ensure(syncBait, `bait insert failed: ${sErr?.message}`)
  const tag = Math.random().toString(36).slice(2, 8)
  const { data: customer, error: cErr } = await service.from('customers')
    .insert({ name: `SEC-CHECK ${tag}`, phone: `+000${Date.now()}`.slice(0, 20) }).select('id').single()
  ensure(customer, `customer fixture failed: ${cErr?.message}`)
  const { data: order, error: oErr } = await service.from('orders')
    .insert({ order_number: `SEC-${tag}`, customer_id: customer.id, booking_date: today, delivery_date: today, total_amount: 100, advance_paid: 0, balance: 100 })
    .select('id,order_number').single()
  ensure(order, `order fixture failed: ${oErr?.message}`)

  const id = fixture.id
  const ledgerCtx = { params: Promise.resolve({ id }) }
  const noOne = { params: Promise.resolve({ id: missing }) }
  const entry = { entry_date: today, particulars: 'SEC-CHECK rejected', debit: 1, entry_type: 'miscellaneous' }

  type Case = { name: string; file: string; method: string; run: (t: string | null) => Promise<Response> }
  const L = 'src/app/api/general-ledger'

  // ---- admin only
  const adminOnly: Case[] = [
    { name: 'GET    /general-ledger', file: `${L}/route.ts`, method: 'GET', run: (t) => call(ledger.GET, req('/general-ledger?page=1', 'GET', t)) },
    { name: 'POST   /general-ledger', file: `${L}/route.ts`, method: 'POST', run: (t) => call(ledger.POST, req('/general-ledger', 'POST', t, entry)) },
    { name: 'GET    /general-ledger/[id]', file: `${L}/[id]/route.ts`, method: 'GET', run: (t) => call(ledgerById.GET, req(`/general-ledger/${id}`, 'GET', t), ledgerCtx) },
    { name: 'PUT    /general-ledger/[id]', file: `${L}/[id]/route.ts`, method: 'PUT', run: (t) => call(ledgerById.PUT, req(`/general-ledger/${id}`, 'PUT', t, { ...entry, particulars: 'SEC-CHECK hijacked', debit: 99 }), ledgerCtx) },
    { name: 'DELETE /general-ledger/[id]', file: `${L}/[id]/route.ts`, method: 'DELETE', run: (t) => call(ledgerById.DELETE, req(`/general-ledger/${id}`, 'DELETE', t), ledgerCtx) },
    { name: 'GET    /general-ledger/stats', file: `${L}/stats/route.ts`, method: 'GET', run: (t) => call(ledgerStats.GET, req('/general-ledger/stats', 'GET', t)) },
    { name: 'POST   /general-ledger/sync-payments', file: `${L}/sync-payments/route.ts`, method: 'POST', run: (t) => call(ledgerSync.POST, req('/general-ledger/sync-payments', 'POST', t)) },
    { name: 'GET    /vendor-ledger', file: 'src/app/api/vendor-ledger/route.ts', method: 'GET', run: (t) => call(vendorLedger.GET, req(`/vendor-ledger?vendor_id=${vendor.id}`, 'GET', t)) },
    { name: 'POST   /vendor-ledger', file: 'src/app/api/vendor-ledger/route.ts', method: 'POST', run: (t) => call(vendorLedger.POST, req('/vendor-ledger', 'POST', t, { vendor_id: vendor.id, entry_date: today, particulars: 'SEC-CHECK rejected', credit: 1 })) },
  ]

  // ---- any signed-in user (staff or admin). Bodies and ids reach nothing even when allowed.
  const A = 'src/app/api'
  const signedIn: Case[] = [
    { name: 'GET    /orders', file: `${A}/orders/route.ts`, method: 'GET', run: (t) => call(orders.GET, req('/orders?page=1&pageSize=1', 'GET', t)) },
    { name: 'POST   /orders ({} body)', file: `${A}/orders/route.ts`, method: 'POST', run: (t) => call(orders.POST, req('/orders', 'POST', t, {})) },
    { name: 'GET    /orders/all', file: `${A}/orders/all/route.ts`, method: 'GET', run: (t) => call(ordersAll.GET, req('/orders/all', 'GET', t)) },
    { name: 'GET    /orders/[missing]', file: `${A}/orders/[id]/route.ts`, method: 'GET', run: (t) => call(ordersById.GET, req(`/orders/${missing}`, 'GET', t), noOne) },
    { name: 'PATCH  /orders/[missing]', file: `${A}/orders/[id]/route.ts`, method: 'PATCH', run: (t) => call(ordersById.PATCH, req(`/orders/${missing}`, 'PATCH', t, {}), noOne) },
    { name: 'DELETE /orders/[missing]', file: `${A}/orders/[id]/route.ts`, method: 'DELETE', run: (t) => call(ordersById.DELETE, req(`/orders/${missing}`, 'DELETE', t), noOne) },
    { name: 'GET    /payments', file: `${A}/payments/route.ts`, method: 'GET', run: (t) => call(payments.GET, req(`/payments?order_id=${missing}`, 'GET', t)) },
    { name: 'POST   /payments ({} body)', file: `${A}/payments/route.ts`, method: 'POST', run: (t) => call(payments.POST, req('/payments', 'POST', t, {})) },
    { name: 'PATCH  /payments/[missing]', file: `${A}/payments/[id]/route.ts`, method: 'PATCH', run: (t) => call(paymentsById.PATCH, req(`/payments/${missing}`, 'PATCH', t, { amount: 1 }), noOne) },
    { name: 'DELETE /payments/[missing]', file: `${A}/payments/[id]/route.ts`, method: 'DELETE', run: (t) => call(paymentsById.DELETE, req(`/payments/${missing}`, 'DELETE', t), noOne) },
  ]

  const snapshot = async () => ({
    ledger: await rowCount('general_ledger'),
    vendorLedger: await rowCount('vendor_ledger'),
    orders: await rowCount('orders'),
    payments: await rowCount('payments'),
    fixture: (await service.from('general_ledger').select('particulars,debit').eq('id', id).single()).data,
    bait: (await service.from('general_ledger').select('id').eq('id', syncBait.id)).data?.length ?? 0,
  })
  const before = await snapshot()

  const unauthenticated: [string, string | null][] = [
    ['anonymous', null],
    ['garbage token', 'not-a-jwt'],
    ['forged JWT (admin id, wrong secret)', forgedJwt(admin.id)],
  ]

  const run = async (c: Case, who: string, token: string | null, expect: (s: number) => boolean, label: string) => {
    await step(`${c.name} as ${who} -> ${label}`, async () => {
      const gate = guardPrecedesSideEffects(c.file, c.method)
      ensure(gate.ok, `NOT INVOKED to protect local data: ${gate.why}`)
      const res = await c.run(token)
      ensure(expect(res.status), `got ${res.status}`)
    })
  }

  for (const c of adminOnly) {
    for (const [who, token] of unauthenticated) await run(c, who, token, (s) => s === 401, '401')
    await run(c, 'staff', staff.token, (s) => s === 403, '403')
  }
  for (const c of signedIn) {
    for (const [who, token] of unauthenticated) await run(c, who, token, (s) => s === 401, '401')
    await run(c, 'staff', staff.token, (s) => s !== 401 && s !== 403, 'allowed (reaches the handler)')
    await run(c, 'admin', admin.token, (s) => s !== 401 && s !== 403, 'allowed (reaches the handler)')
  }

  await step('rejected requests changed nothing (counts, fixture entry, order_payment bait)', async () => {
    const after = await snapshot()
    for (const k of ['ledger', 'vendorLedger', 'orders', 'payments'] as const) {
      ensure(after[k] === before[k], `${k} row count ${before[k]} -> ${after[k]}`)
    }
    ensure(JSON.stringify(after.fixture) === JSON.stringify(before.fixture), `fixture changed: ${JSON.stringify(after.fixture)}`)
    ensure(after.bait === 1, 'sync-payments ran for an unauthorized caller and deleted the order_payment row')
  })

  // ---- authorized behavior must keep working
  await step('admin lists the ledger with pagination', async () => {
    const res = await call(ledger.GET, req('/general-ledger?page=1&pageSize=5', 'GET', admin.token))
    ensure(res.status === 200, `got ${res.status}`)
    const json = await res.json()
    ensure(Array.isArray(json.data) && json.pagination?.total > 0, 'no paginated data')
  })

  await step('admin reads stats (debit, credit, balance, count)', async () => {
    const res = await call(ledgerStats.GET, req('/general-ledger/stats', 'GET', admin.token))
    ensure(res.status === 200, `got ${res.status}`)
    const s = await res.json()
    ensure(['totalDebit', 'totalCredit', 'currentBalance', 'entryCount'].every((k) => k in s), 'stats shape changed')
    ensure(Math.abs(s.currentBalance - (s.totalDebit - s.totalCredit)) < 0.005, 'balance != debit - credit')
  })

  let created: string | undefined
  await step('admin creates a ledger entry (201) and it appears in the list', async () => {
    const res = await call(ledger.POST, req('/general-ledger', 'POST', admin.token, { ...entry, particulars: 'SEC-CHECK admin created' }))
    ensure(res.status === 201, `got ${res.status}`)
    created = (await res.json()).id
    const list = await call(ledger.GET, req('/general-ledger?page=1&pageSize=50&search=SEC-CHECK%20admin', 'GET', admin.token))
    ensure((await list.json()).data.some((e: { id: string }) => e.id === created), 'created entry not in list')
  })

  await step('admin reads, updates and deletes ledger entries', async () => {
    ensure((await call(ledgerById.GET, req(`/general-ledger/${id}`, 'GET', admin.token), ledgerCtx)).status === 200, 'GET by id failed')
    const put = await call(ledgerById.PUT, req(`/general-ledger/${id}`, 'PUT', admin.token, { ...entry, particulars: 'SEC-CHECK fixture edited', debit: 8 }), ledgerCtx)
    ensure(put.status === 200, `PUT got ${put.status}`)
    const del = await call(ledgerById.DELETE, req(`/general-ledger/${created}`, 'DELETE', admin.token), { params: Promise.resolve({ id: created }) })
    ensure(del.status === 200, `DELETE got ${del.status}`)
  })

  await step('admin reads a vendor ledger', async () => {
    const res = await call(vendorLedger.GET, req(`/vendor-ledger?vendor_id=${vendor.id}`, 'GET', admin.token))
    ensure(res.status === 200, `got ${res.status}`)
  })

  let paymentId: string | undefined
  await step('STAFF records a payment (201) and the server writes the ledger row', async () => {
    const res = await call(payments.POST, req('/payments', 'POST', staff.token, {
      order_id: order.id, customer_id: customer.id, amount: 5, payment_method: 'cash', payment_date: today,
    }))
    const text = await res.text() // read once: an eager message would consume the body
    ensure(res.status === 201, `got ${res.status}: ${text}`)
    paymentId = JSON.parse(text).payment.id
    const { data } = await service.from('general_ledger').select('debit,entry_type').eq('order_id', order.id)
    ensure(data?.length === 1 && Number(data[0].debit) === 5 && data[0].entry_type === 'order_payment', `ledger rows: ${JSON.stringify(data)}`)
  })

  await step('STAFF lists orders and payments, and edits then deletes their payment', async () => {
    ensure((await call(orders.GET, req('/orders?page=1&pageSize=1', 'GET', staff.token))).status === 200, 'staff GET /orders failed')
    ensure((await call(payments.GET, req(`/payments?order_id=${order.id}`, 'GET', staff.token))).status === 200, 'staff GET /payments failed')
    const patch = await call(paymentsById.PATCH, req(`/payments/${paymentId}`, 'PATCH', staff.token, { amount: 6 }), { params: Promise.resolve({ id: paymentId }) })
    ensure(patch.status === 200, `staff PATCH got ${patch.status}`)
    const del = await call(paymentsById.DELETE, req(`/payments/${paymentId}`, 'DELETE', staff.token), { params: Promise.resolve({ id: paymentId }) })
    ensure(del.status === 200, `staff DELETE got ${del.status}`)
  })

  await step('balances still equal debit - credit after all of the above', async () => {
    const { data } = await service.from('general_ledger').select('debit,credit,balance,entry_date,created_at,id')
      .order('entry_date').order('created_at').order('id')
    let running = 0
    for (const r of data ?? []) {
      running += Number(r.debit ?? 0) - Number(r.credit ?? 0)
      ensure(Math.abs(running - Number(r.balance)) < 0.005, `balance drift at ${r.id}`)
    }
  })

  // ---- remove every disposable row (ledger first: its order_id FK is ON DELETE SET NULL)
  await service.from('general_ledger').delete().eq('order_id', order.id)
  await service.from('general_ledger').delete().like('particulars', 'SEC-CHECK%')
  await service.from('payments').delete().eq('order_id', order.id)
  await service.from('orders').delete().eq('id', order.id)
  await service.from('customers').delete().eq('id', customer.id)
  await finish('api-auth')
}

main().catch(async (e) => {
  console.error('FAILED:', e.message)
  await service.from('general_ledger').delete().like('particulars', 'SEC-CHECK%')
  await service.from('customers').delete().like('name', 'SEC-CHECK%')
  await cleanup()
  process.exit(1)
})
