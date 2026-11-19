#!/usr/bin/env node
/**
 * API role check against a running app (staging / dummy project only).
 * Verifies the role rules in docs/API-ROLES.md for staff and admin, and
 * removes everything it creates (names start with "E2E-STG").
 *
 *   BASE_URL=http://localhost:3210 \
 *   E2E_ADMIN_TOKEN=<admin access token> E2E_STAFF_TOKEN=<staff access token> \
 *   [COOKIE=<cookie header, e.g. for a protected preview>] \
 *   [E2E_BUSINESS_ID=<business uuid; default: the server's default business>] \
 *   node e2e/staging/api-roles.mjs
 *
 * Tokens are Supabase access tokens (sent as "Authorization: Bearer"). They are
 * never printed. Exit code 1 when any check fails or setup is incomplete.
 */

const PRODUCTION_REF = 'drdnqsjjxmqiklwfadmk'
const BASE = (process.env.BASE_URL || '').replace(/\/$/, '')
const ADMIN = process.env.E2E_ADMIN_TOKEN
const STAFF = process.env.E2E_STAFF_TOKEN
const COOKIE = process.env.COOKIE
const BUSINESS = process.env.E2E_BUSINESS_ID

if (!BASE || !ADMIN || !STAFF) {
  console.error('Set BASE_URL, E2E_ADMIN_TOKEN and E2E_STAFF_TOKEN.')
  process.exit(1)
}
if (BASE.includes(PRODUCTION_REF)) {
  console.error('Refusing to run against the production project.')
  process.exit(1)
}

const sfx = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const today = new Date().toISOString().slice(0, 10)
const results = []

/** One API call. Never logs headers. */
async function call(token, method, path, body) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  if (COOKIE) headers.Cookie = COOKIE
  if (BUSINESS) headers['X-Business-Id'] = BUSINESS
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  let json = null
  try {
    json = await res.json()
  } catch {
    // empty or non-JSON body
  }
  return { status: res.status, json }
}

const idOf = (j) => j?.id ?? j?.data?.id ?? j?.measurement?.id ?? j?.payment?.id ?? j?.order?.id ?? null

/** Records a check: `expect` is a status number or 'ok' (any 2xx). */
async function check(label, expect, run) {
  let status = 'error'
  try {
    status = (await run()).status
  } catch (e) {
    status = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 60)
  }
  const pass = expect === 'ok' ? typeof status === 'number' && status >= 200 && status < 300 : status === expect
  results.push({ check: label, expected: expect === 'ok' ? '2xx' : String(expect), got: String(status), result: pass ? 'PASS' : 'FAIL' })
  return pass
}

const created = { customers: [], measurements: [], orders: [], payments: [] }

async function main() {
  // ---------------------------------------------------------------- fixtures (admin)
  const cust = await call(ADMIN, 'POST', '/api/customers', {
    name: `E2E-STG Roles ${sfx}`,
    phone: `3${String(Date.now()).slice(-9)}`,
  })
  const customerId = idOf(cust.json)
  if (!customerId) throw new Error(`setup: admin could not create a customer (status ${cust.status})`)
  created.customers.push(customerId)

  const meas = await call(ADMIN, 'POST', '/api/measurements', { customer_id: customerId, name: `E2E-STG Roles ${sfx}` })
  const measurementId = idOf(meas.json)
  if (!measurementId) throw new Error(`setup: admin could not create a measurement (status ${meas.status})`)
  created.measurements.push(measurementId)

  // No advance, so the order writes no ledger row.
  const ord = await call(ADMIN, 'POST', '/api/orders', {
    customerId,
    bookingDate: today,
    deliveryDate: today,
    status: 'In Process',
    totalAmount: 1000,
    advancePaid: 0,
    orderItems: [{ order_type: 'other', description: `E2E-STG Roles ${sfx}` }],
  })
  const orderId = idOf(ord.json)
  const orderNumber = ord.json?.order_number ?? null
  if (!orderId) throw new Error(`setup: admin could not create an order (status ${ord.status})`)
  created.orders.push({ id: orderId, number: orderNumber })

  // ---------------------------------------------------------------- staff: reads allowed
  await check('staff GET /api/customers', 200, () => call(STAFF, 'GET', '/api/customers'))
  await check('staff GET /api/orders', 200, () => call(STAFF, 'GET', '/api/orders'))
  await check('staff GET /api/measurements', 200, () => call(STAFF, 'GET', '/api/measurements'))
  await check('staff GET /api/payments', 200, () => call(STAFF, 'GET', `/api/payments?order_id=${orderId}`))
  await check('staff GET /api/vendor-categories', 200, () => call(STAFF, 'GET', '/api/vendor-categories'))

  // ---------------------------------------------------------------- staff: admin-only deletes
  await check('staff DELETE /api/customers/[id]', 403, () => call(STAFF, 'DELETE', `/api/customers/${customerId}`))
  await check('staff DELETE /api/measurements/[id]', 403, () => call(STAFF, 'DELETE', `/api/measurements/${measurementId}`))
  await check('staff DELETE /api/orders/[id]', 403, () => call(STAFF, 'DELETE', `/api/orders/${orderId}`))
  await check('  ...customer still there (admin GET)', 200, () => call(ADMIN, 'GET', `/api/customers/${customerId}`))
  await check('  ...order still there (admin GET)', 200, () => call(ADMIN, 'GET', `/api/orders/${orderId}`))

  // ---------------------------------------------------------------- payments: admin only writes
  const paymentBody = { order_id: orderId, customer_id: customerId, amount: 100, payment_method: 'cash', payment_date: today, notes: `E2E-STG ${sfx}` }
  await check('staff POST /api/payments', 403, () => call(STAFF, 'POST', '/api/payments', paymentBody))
  await check('admin POST /api/payments', 'ok', async () => {
    const r = await call(ADMIN, 'POST', '/api/payments', paymentBody)
    const id = idOf(r.json)
    if (id) created.payments.push(id)
    return r
  })
  const paymentId = created.payments[0]
  if (paymentId) {
    await check('staff PATCH /api/payments/[id]', 403, () => call(STAFF, 'PATCH', `/api/payments/${paymentId}`, { amount: 150 }))
    await check('staff DELETE /api/payments/[id]', 403, () => call(STAFF, 'DELETE', `/api/payments/${paymentId}`))
    await check('admin DELETE /api/payments/[id]', 'ok', async () => {
      const r = await call(ADMIN, 'DELETE', `/api/payments/${paymentId}`)
      if (r.status >= 200 && r.status < 300) created.payments = []
      return r
    })
  }

  // ---------------------------------------------------------------- staff: vendor and ledger areas
  await check('staff POST /api/vendors', 403, () => call(STAFF, 'POST', '/api/vendors', { name: `E2E-STG Roles ${sfx}` }))
  await check('staff POST /api/vendor-tags', 403, () =>
    call(STAFF, 'POST', '/api/vendor-tags', { vendor_id: '00000000-0000-0000-0000-000000000001', tag_name: 'e2e-stg' })
  )
  await check('staff POST /api/vendor-categories', 403, () => call(STAFF, 'POST', '/api/vendor-categories', { name: `E2E-STG ${sfx}` }))
  await check('staff PATCH /api/vendor-categories/[id]', 403, () =>
    call(STAFF, 'PATCH', '/api/vendor-categories/00000000-0000-0000-0000-000000000000', { name: 'x' })
  )
  await check('staff DELETE /api/vendor-categories/[id]', 403, () =>
    call(STAFF, 'DELETE', '/api/vendor-categories/00000000-0000-0000-0000-000000000000')
  )
  await check('staff GET /api/general-ledger', 403, () => call(STAFF, 'GET', '/api/general-ledger'))
  await check('staff GET /api/general-ledger/stats', 403, () => call(STAFF, 'GET', '/api/general-ledger/stats'))
  await check('staff GET /api/vendor-ledger', 403, () =>
    call(STAFF, 'GET', '/api/vendor-ledger?vendor_id=00000000-0000-0000-0000-000000000001')
  )

  // ---------------------------------------------------------------- staff: customer create + update allowed
  let staffCustomer = null
  await check('staff POST /api/customers', 'ok', async () => {
    const r = await call(STAFF, 'POST', '/api/customers', {
      name: `E2E-STG Roles Staff ${sfx}`,
      phone: `3${String(Date.now() + 7).slice(-9)}`,
    })
    staffCustomer = idOf(r.json)
    if (staffCustomer) created.customers.push(staffCustomer)
    return r
  })
  if (staffCustomer) {
    await check('staff PATCH /api/customers/[id]', 'ok', () =>
      call(STAFF, 'PATCH', `/api/customers/${staffCustomer}`, { name: `E2E-STG Roles Staff ${sfx} edited` })
    )
    await check('admin DELETE /api/customers/[id] (staff-made)', 'ok', async () => {
      const r = await call(ADMIN, 'DELETE', `/api/customers/${staffCustomer}`)
      if (r.status >= 200 && r.status < 300) created.customers = created.customers.filter((c) => c !== staffCustomer)
      return r
    })
  }
}

/** Removes whatever is left, as admin, in dependency order. */
async function cleanup() {
  const failures = []
  for (const id of created.payments) {
    const r = await call(ADMIN, 'DELETE', `/api/payments/${id}`)
    if (r.status >= 300 && r.status !== 404) failures.push(`payment ${r.status}`)
  }
  for (const o of created.orders) {
    // The API leaves a payment's ledger row behind; remove this order's rows.
    if (o.number) {
      const led = await call(ADMIN, 'GET', `/api/general-ledger?search=${encodeURIComponent(o.number)}&page=1&pageSize=100`)
      for (const e of led.json?.data ?? []) {
        if (e.order_id === o.id) {
          const r = await call(ADMIN, 'DELETE', `/api/general-ledger/${e.id}`)
          if (r.status >= 300) failures.push(`ledger row ${r.status}`)
        }
      }
    }
    const r = await call(ADMIN, 'DELETE', `/api/orders/${o.id}`)
    if (r.status >= 300 && r.status !== 404) failures.push(`order ${r.status}`)
  }
  for (const id of created.measurements) {
    const r = await call(ADMIN, 'DELETE', `/api/measurements/${id}`)
    if (r.status >= 300 && r.status !== 404) failures.push(`measurement ${r.status}`)
  }
  for (const id of created.customers) {
    const r = await call(ADMIN, 'DELETE', `/api/customers/${id}`)
    if (r.status >= 300 && r.status !== 404) failures.push(`customer ${r.status}`)
  }
  return failures
}

let setupError = null
try {
  await main()
} catch (e) {
  setupError = e instanceof Error ? e.message : String(e)
}
const cleanupFailures = await cleanup()

console.table(results)
if (setupError) console.error(`Setup failed: ${setupError}`)
if (cleanupFailures.length) console.error(`Cleanup incomplete (remove E2E-STG ${sfx} records by hand): ${cleanupFailures.join(', ')}`)
const failed = results.filter((r) => r.result === 'FAIL').length
console.log(`${results.length - failed} passed, ${failed} failed`)
process.exit(failed || setupError || cleanupFailures.length ? 1 : 0)
