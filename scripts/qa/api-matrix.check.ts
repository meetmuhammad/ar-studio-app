/* eslint-disable @typescript-eslint/no-explicit-any -- test plumbing over untyped JSON API responses */
/**
 * Endpoint matrix: REAL HTTP integration checks of every API route against a running
 * dev server, authenticated as real local users (qa-admin / qa-staff / qa-norole).
 *
 *   npx tsx --env-file=.env.local scripts/qa/api-matrix.check.ts
 *   QA_BASE=http://localhost:3100 (default)
 *
 * What this is NOT: it does not call route handlers in-process (that is what
 * scripts/security/api-auth.check.ts does) and it never uses the service role to
 * stand in for a user. The service role is used only to take a baseline, to
 * observe, and to clean up.
 *
 * SAFETY
 *  - Local database only (assertWritableDb + URL check). Refuses anything else.
 *  - Every record created is tagged "QA-API " and dated in 2099 so it sorts after
 *    all real ledger history and can never change an existing running balance.
 *  - A fingerprint (hash of the identifying/financial columns) of every existing
 *    row in the touched tables is taken first and compared at the end, in addition
 *    to row counts. Cleanup runs in a finally block, also after a failure.
 *  - POST /api/general-ledger/sync-payments is NEVER run as an authorized user: it
 *    deletes and rebuilds every order_payment row. Only its 401/403 rejections are tested.
 *
 * Output: PASS/FAIL per check, FINDING lines for behaviour that works but is
 * wrong or risky, a final count, docs/qa/api-matrix-table.md and docs/qa/api-matrix-results.json.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { assertWritableDb } from '../assert-writable-db'

assertWritableDb('api matrix check')
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(SUPA)) throw new Error(`local database only, got ${SUPA}`)
const BASE = process.env.QA_BASE ?? 'http://localhost:3100'
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error(`QA_BASE must be local, got ${BASE}`)

const PASSWORD = 'QaLocal-2026!'
const noSession = { persistSession: false, autoRefreshToken: false }
const service = createClient(SUPA, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: noSession })

// ------------------------------------------------------------------ catalogue
type Auth = 'none' | 'admin' | 'admin|staff' | 'oauth-bearer'
interface Ep { key: string; module: string; auth: Auth; note?: string }
const EP: Ep[] = [
  { key: 'GET /.well-known/oauth-protected-resource/api/mcp', module: 'MCP', auth: 'none', note: 'public discovery document; 404 unless LEDGER_MCP_ENABLED=true' },
  { key: 'GET /api/mcp', module: 'MCP', auth: 'oauth-bearer' },
  { key: 'POST /api/mcp', module: 'MCP', auth: 'oauth-bearer' },
  { key: 'DELETE /api/mcp', module: 'MCP', auth: 'oauth-bearer' },
  { key: 'GET /api/customers', module: 'Customers', auth: 'none' },
  { key: 'POST /api/customers', module: 'Customers', auth: 'none' },
  { key: 'GET /api/customers/[id]', module: 'Customers', auth: 'none' },
  { key: 'PATCH /api/customers/[id]', module: 'Customers', auth: 'none' },
  { key: 'DELETE /api/customers/[id]', module: 'Customers', auth: 'none' },
  { key: 'GET /api/customers/[id]/measurements', module: 'Customers', auth: 'none' },
  { key: 'GET /api/dashboard-stats', module: 'Dashboard', auth: 'none' },
  { key: 'GET /api/measurements', module: 'Measurements', auth: 'none' },
  { key: 'POST /api/measurements', module: 'Measurements', auth: 'none' },
  { key: 'GET /api/measurements/[id]', module: 'Measurements', auth: 'none' },
  { key: 'PUT /api/measurements/[id]', module: 'Measurements', auth: 'none' },
  { key: 'DELETE /api/measurements/[id]', module: 'Measurements', auth: 'none' },
  { key: 'GET /api/orders', module: 'Orders', auth: 'admin|staff' },
  { key: 'POST /api/orders', module: 'Orders', auth: 'admin|staff' },
  { key: 'GET /api/orders/all', module: 'Orders', auth: 'admin|staff' },
  { key: 'GET /api/orders/[id]', module: 'Orders', auth: 'admin|staff' },
  { key: 'PATCH /api/orders/[id]', module: 'Orders', auth: 'admin|staff' },
  { key: 'DELETE /api/orders/[id]', module: 'Orders', auth: 'admin|staff' },
  { key: 'GET /api/payments', module: 'Payments', auth: 'admin|staff' },
  { key: 'POST /api/payments', module: 'Payments', auth: 'admin|staff' },
  { key: 'PATCH /api/payments/[id]', module: 'Payments', auth: 'admin|staff' },
  { key: 'DELETE /api/payments/[id]', module: 'Payments', auth: 'admin|staff' },
  { key: 'GET /api/general-ledger', module: 'Ledger', auth: 'admin' },
  { key: 'POST /api/general-ledger', module: 'Ledger', auth: 'admin' },
  { key: 'GET /api/general-ledger/[id]', module: 'Ledger', auth: 'admin' },
  { key: 'PUT /api/general-ledger/[id]', module: 'Ledger', auth: 'admin' },
  { key: 'DELETE /api/general-ledger/[id]', module: 'Ledger', auth: 'admin' },
  { key: 'GET /api/general-ledger/stats', module: 'Ledger', auth: 'admin' },
  { key: 'POST /api/general-ledger/sync-payments', module: 'Ledger', auth: 'admin', note: 'destructive: deletes and rebuilds all order_payment rows; admin success path deliberately NOT run' },
  { key: 'GET /api/vendor-ledger', module: 'Vendor ledger', auth: 'admin' },
  { key: 'POST /api/vendor-ledger', module: 'Vendor ledger', auth: 'admin' },
  { key: 'GET /api/vendors', module: 'Vendors', auth: 'none' },
  { key: 'POST /api/vendors', module: 'Vendors', auth: 'none' },
  { key: 'GET /api/vendors/[id]', module: 'Vendors', auth: 'none' },
  { key: 'PUT /api/vendors/[id]', module: 'Vendors', auth: 'none' },
  { key: 'DELETE /api/vendors/[id]', module: 'Vendors', auth: 'none' },
  { key: 'GET /api/vendor-categories', module: 'Vendors', auth: 'none' },
  { key: 'POST /api/vendor-categories', module: 'Vendors', auth: 'none' },
  { key: 'PATCH /api/vendor-categories/[id]', module: 'Vendors', auth: 'none' },
  { key: 'DELETE /api/vendor-categories/[id]', module: 'Vendors', auth: 'none' },
  { key: 'GET /api/vendor-tags', module: 'Vendors', auth: 'none' },
  { key: 'POST /api/vendor-tags', module: 'Vendors', auth: 'none' },
  { key: 'DELETE /api/vendor-tags/[id]', module: 'Vendors', auth: 'none' },
]

// ------------------------------------------------------------------ recorder
type Cat = 'unauth' | 'staff' | 'admin' | 'norole' | 'invalid' | 'missing' | 'persist'
interface Rec { ep: string; cat: Cat; name: string; ok: boolean; detail?: string; tokenless?: boolean }
const callStats = { total: 0, noToken: 0 }
const recs: Rec[] = []
const findings: { ep: string; text: string }[] = []
const finding = (ep: string, text: string) => { if (!findings.some((f) => f.ep === ep && f.text === text)) findings.push({ ep, text }) }

async function check(ep: string, cat: Cat, name: string, fn: () => Promise<void>) {
  callStats.total = 0; callStats.noToken = 0
  let ok = true, detail: string | undefined
  try { await fn() } catch (e) { ok = false; detail = (e as Error).message }
  // tokenless = every HTTP call this check made carried no Authorization header (evidence an open route accepts anonymous use)
  recs.push({ ep, cat, name, ok, detail, tokenless: callStats.total > 0 && callStats.noToken === callStats.total })
}
function ensure(c: unknown, m: string): asserts c { if (!c) throw new Error(m) }

// ------------------------------------------------------------------ http
interface Res { status: number; json: any; headers: Headers; text: string }
async function api(method: string, path: string, o: { token?: string | null; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...(o.headers ?? {}) }
  callStats.total++
  if (o.token) headers.Authorization = `Bearer ${o.token}`; else callStats.noToken++
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  const r = await fetch(`${BASE}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: AbortSignal.timeout(30000) })
  const text = await r.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: r.status, json, headers: r.headers, text }
}
async function login(email: string): Promise<string> {
  const c = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: noSession })
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) throw new Error(`login ${email}: ${error?.message} (run scripts/qa/provision-qa-users.ts)`)
  return data.session.access_token
}

// ------------------------------------------------------------------ baseline / fingerprints
const COUNT_TABLES = ['customers', 'orders', 'order_items', 'measurements', 'general_ledger', 'vendors', 'vendor_tags', 'vendor_categories', 'payments', 'vendor_ledger']
async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of COUNT_TABLES) {
    const { count, error } = await service.from(t).select('*', { count: 'exact', head: true })
    if (error) throw new Error(`count ${t}: ${error.message}`)
    out[t] = count ?? 0
  }
  return out
}
const FP_COLS: Record<string, string> = {
  customers: 'id,name,phone,updated_at',
  orders: 'id,order_number,status,total_amount,advance_paid,balance,updated_at',
  measurements: 'id,customer_id,is_default,updated_at',
  general_ledger: 'id,entry_date,debit,credit,balance,entry_type,particulars',
  vendors: 'id,name,updated_at',
  payments: 'id,order_id,amount,updated_at',
  vendor_ledger: 'id,vendor_id,debit,credit,balance',
  vendor_categories: 'id,name,archived_at',
}
async function fingerprints(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const [t, cols] of Object.entries(FP_COLS)) {
    const rows: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service.from(t).select(cols).order('id').range(from, from + 999)
      if (error) throw new Error(`fingerprint ${t}: ${error.message}`)
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    out[t] = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16) + `:${rows.length}`
  }
  return out
}

// ------------------------------------------------------------------ cleanup tracking
const made = { customers: new Set<string>(), orders: new Set<string>(), measurements: new Set<string>(), ledger: new Set<string>(),
  vendors: new Set<string>(), tags: new Set<string>(), categories: new Set<string>(), payments: new Set<string>(), vendorLedger: new Set<string>() }
async function assertNoExisting2099() {
  // Everything this script writes is dated 2099. If real rows already live there, the sweep below
  // could not tell them apart, so refuse to run.
  for (const [t, col] of [['general_ledger', 'entry_date'], ['orders', 'booking_date'], ['payments', 'payment_date'], ['vendor_ledger', 'entry_date']] as const) {
    const { count, error } = await service.from(t).select('*', { count: 'exact', head: true }).gte(col, '2099-01-01')
    if (error) throw new Error(`precondition ${t}: ${error.message}`)
    if (count) throw new Error(`refusing to run: ${count} existing ${t} row(s) dated >= 2099-01-01 (leftover from a previous run? remove only if synthetic)`)
  }
}
async function sweep() {
  const orderIds = [...made.orders]
  // order-linked ledger rows survive an order delete (FK is SET NULL), so remove them first
  if (orderIds.length) await service.from('general_ledger').delete().in('order_id', orderIds)
  await service.from('general_ledger').delete().like('particulars', 'QA-API %')
  if (made.ledger.size) await service.from('general_ledger').delete().in('id', [...made.ledger])
  if (made.vendorLedger.size) await service.from('vendor_ledger').delete().in('id', [...made.vendorLedger])
  if (made.vendors.size) await service.from('vendor_ledger').delete().in('vendor_id', [...made.vendors])
  if (made.payments.size) await service.from('payments').delete().in('id', [...made.payments])
  if (orderIds.length) await service.from('orders').delete().in('id', orderIds)
  // Ledger rows written by the app itself when an order/payment is saved are not tagged, and survive
  // their order (order_id is set null). They are the only 2099-dated rows, so the date window finds them.
  await service.from('general_ledger').delete().gte('entry_date', '2099-01-01')
  const { data: leftoverCust } = await service.from('customers').select('id').like('name', 'QA-API %')
  const custIds = [...new Set([...made.customers, ...(leftoverCust ?? []).map((c) => c.id)])]
  if (custIds.length) {
    const { data: o } = await service.from('orders').select('id').in('customer_id', custIds)
    const oi = (o ?? []).map((x) => x.id)
    if (oi.length) { await service.from('general_ledger').delete().in('order_id', oi); await service.from('orders').delete().in('id', oi) }
    await service.from('measurements').delete().in('customer_id', custIds)
    await service.from('customers').delete().in('id', custIds)
  }
  if (made.tags.size) await service.from('vendor_tags').delete().in('id', [...made.tags])
  const { data: leftoverVend } = await service.from('vendors').select('id').like('name', 'QA-API %')
  const vIds = [...new Set([...made.vendors, ...(leftoverVend ?? []).map((v) => v.id)])]
  if (vIds.length) await service.from('vendors').delete().in('id', vIds)
  const { data: leftoverCat } = await service.from('vendor_categories').select('id').like('name', 'QA-API %')
  const catIds = [...new Set([...made.categories, ...(leftoverCat ?? []).map((c) => c.id)])]
  if (catIds.length) await service.from('vendor_categories').delete().in('id', catIds)
}

// ------------------------------------------------------------------ helpers
const RUN = randomBytes(3).toString('hex')
const tag = (s: string) => `QA-API ${s} ${RUN}`
const phone = () => `+9230${Math.floor(10000000 + Math.random() * 89999999)}`
const UUID0 = '00000000-0000-4000-8000-000000000000'
const isRejected = (s: number) => s >= 400
const num = (v: unknown) => Number(v)
const D1 = '2099-03-01', D2 = '2099-03-02'
const orderBody = (customerId: string, over: Record<string, unknown> = {}) => ({
  customerId, bookingDate: '2099-03-01', deliveryDate: '2099-03-10', comments: tag('order'),
  orderItems: [{ order_type: 'nikkah', description: tag('item a') }, { order_type: 'mehndi', description: tag('item b') }],
  totalAmount: 10000, advancePaid: 2500, balance: 7500, paymentMethod: 'cash', ...over,
})

async function main() {
  console.log(`TARGET DATABASE: LOCAL — ${SUPA}  |  API: ${BASE}`)

  const reach = await fetch(`${BASE}/sign-in`).then((r) => r.status).catch(() => 0)
  if (reach !== 200) throw new Error(`dev server not reachable at ${BASE} (got ${reach})`)

  const admin = await login('qa-admin@arstudio.test')
  const staff = await login('qa-staff@arstudio.test')
  const norole = await login('qa-norole@arstudio.test')
  const garbage = 'not.a.token'

  // ================================================================ auth guards (admin / admin|staff routes)
  const guarded: { ep: string; method: string; path: string; body?: unknown }[] = [
    { ep: 'GET /api/general-ledger', method: 'GET', path: '/api/general-ledger' },
    { ep: 'POST /api/general-ledger', method: 'POST', path: '/api/general-ledger', body: {} },
    { ep: 'GET /api/general-ledger/[id]', method: 'GET', path: `/api/general-ledger/${UUID0}` },
    { ep: 'PUT /api/general-ledger/[id]', method: 'PUT', path: `/api/general-ledger/${UUID0}`, body: {} },
    { ep: 'DELETE /api/general-ledger/[id]', method: 'DELETE', path: `/api/general-ledger/${UUID0}` },
    { ep: 'GET /api/general-ledger/stats', method: 'GET', path: '/api/general-ledger/stats' },
    { ep: 'POST /api/general-ledger/sync-payments', method: 'POST', path: '/api/general-ledger/sync-payments', body: {} },
    { ep: 'GET /api/vendor-ledger', method: 'GET', path: `/api/vendor-ledger?vendor_id=${UUID0}` },
    { ep: 'POST /api/vendor-ledger', method: 'POST', path: '/api/vendor-ledger', body: {} },
  ]
  const shared: typeof guarded = [
    { ep: 'GET /api/orders', method: 'GET', path: '/api/orders' },
    { ep: 'POST /api/orders', method: 'POST', path: '/api/orders', body: {} },
    { ep: 'GET /api/orders/all', method: 'GET', path: '/api/orders/all' },
    { ep: 'GET /api/orders/[id]', method: 'GET', path: `/api/orders/${UUID0}` },
    { ep: 'PATCH /api/orders/[id]', method: 'PATCH', path: `/api/orders/${UUID0}`, body: {} },
    { ep: 'DELETE /api/orders/[id]', method: 'DELETE', path: `/api/orders/${UUID0}` },
    { ep: 'GET /api/payments', method: 'GET', path: '/api/payments' },
    { ep: 'POST /api/payments', method: 'POST', path: '/api/payments', body: {} },
    { ep: 'PATCH /api/payments/[id]', method: 'PATCH', path: `/api/payments/${UUID0}`, body: {} },
    { ep: 'DELETE /api/payments/[id]', method: 'DELETE', path: `/api/payments/${UUID0}` },
  ]
  for (const g of [...guarded, ...shared]) {
    // Requests use nonexistent ids and empty bodies: even a broken guard cannot change a real row.
    await check(g.ep, 'unauth', 'no token -> 401', async () => { const r = await api(g.method, g.path, { body: g.body }); ensure(r.status === 401, `got ${r.status}`) })
    await check(g.ep, 'unauth', 'garbage token -> 401', async () => { const r = await api(g.method, g.path, { token: garbage, body: g.body }); ensure(r.status === 401, `got ${r.status}`) })
    await check(g.ep, 'norole', 'signed in, no users row -> 401', async () => { const r = await api(g.method, g.path, { token: norole, body: g.body }); ensure(r.status === 401, `got ${r.status}`) })
  }
  for (const g of guarded) {
    await check(g.ep, 'staff', 'staff -> 403 (admin only)', async () => { const r = await api(g.method, g.path, { token: staff, body: g.body }); ensure(r.status === 403, `got ${r.status}`) })
  }
  for (const g of shared) {
    // staff must be allowed: judged by "not 401/403", on a request that touches nothing real
    await check(g.ep, 'staff', 'staff allowed (not 401/403)', async () => { const r = await api(g.method, g.path, { token: staff, body: g.body }); ensure(r.status !== 401 && r.status !== 403, `got ${r.status}`) })
  }

  // ================================================================ open routes: unauthenticated access is accepted
  // Recorded as a FINDING per route (known, docs/LEDGER-MCP.md blocker 8), exercised below with real calls.

  // ================================================================ MCP smoke (read-only)
  const mcpBody = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
  const mcpHeaders = { Accept: 'application/json, text/event-stream' }
  await check('GET /.well-known/oauth-protected-resource/api/mcp', 'unauth', 'public metadata names the resource, a Supabase auth server and scopes', async () => {
    const r = await api('GET', '/.well-known/oauth-protected-resource/api/mcp')
    ensure(r.status === 200, `status ${r.status}`)
    ensure(r.json.resource === `${BASE}/api/mcp`, `resource ${r.json.resource}`)
    ensure(Array.isArray(r.json.authorization_servers) && r.json.authorization_servers[0].startsWith(SUPA), 'authorization server')
    ensure(JSON.stringify(r.json.scopes_supported) === JSON.stringify(['openid', 'email', 'profile']), `scopes ${JSON.stringify(r.json.scopes_supported)}`)
  })
  for (const m of ['GET', 'POST', 'DELETE']) {
    const ep = `${m} /api/mcp`
    await check(ep, 'unauth', 'no token -> 401 with resource_metadata challenge', async () => {
      const r = await api(m, '/api/mcp', { body: m === 'POST' ? mcpBody : undefined, headers: mcpHeaders })
      ensure(r.status === 401, `got ${r.status}`)
      ensure((r.headers.get('www-authenticate') ?? '').includes('resource_metadata='), 'no resource_metadata in WWW-Authenticate')
    })
  }
  await check('POST /api/mcp', 'unauth', 'garbage bearer -> 401', async () => { const r = await api('POST', '/api/mcp', { token: garbage, body: mcpBody, headers: mcpHeaders }); ensure(r.status === 401, `got ${r.status}`) })
  await check('POST /api/mcp', 'admin', 'ordinary admin web-session token (aud=authenticated) is refused -> 401', async () => { const r = await api('POST', '/api/mcp', { token: admin, body: mcpBody, headers: mcpHeaders }); ensure(r.status === 401, `got ${r.status}`) })
  await check('POST /api/mcp', 'staff', 'staff web-session token is refused -> 401', async () => { const r = await api('POST', '/api/mcp', { token: staff, body: mcpBody, headers: mcpHeaders }); ensure(r.status === 401, `got ${r.status}`) })

  // ================================================================ customers (open routes)
  let cust: any
  await check('POST /api/customers', 'admin', 'create returns 201 with the record', async () => {
    const r = await api('POST', '/api/customers', { token: admin, body: { name: tag('Customer'), phone: phone(), address: tag('addr') } })
    ensure(r.status === 201 && r.json?.id, `status ${r.status} ${r.text.slice(0, 120)}`)
    cust = r.json; made.customers.add(cust.id)
    ensure(cust.name === tag('Customer'), 'name round-trip')
  })
  if (!cust) throw new Error('cannot continue: customer fixture failed')
  await check('POST /api/customers', 'unauth', 'unauthenticated create is accepted (OPEN)', async () => {
    const r = await api('POST', '/api/customers', { body: { name: tag('Open'), phone: phone() } })
    ensure(r.status === 201, `status ${r.status}`)
    made.customers.add(r.json.id)
    finding('POST /api/customers', 'accepts an unauthenticated create (no auth guard; known open route)')
  })
  await check('POST /api/customers', 'persist', 'persisted: GET by id returns the same data', async () => {
    const r = await api('GET', `/api/customers/${cust.id}`); ensure(r.status === 200 && r.json.phone === cust.phone, `status ${r.status}`)
  })
  await check('POST /api/customers', 'invalid', 'duplicate phone -> 400 and no second row', async () => {
    const r = await api('POST', '/api/customers', { body: { name: tag('Dup'), phone: cust.phone } })
    ensure(r.status === 400, `status ${r.status}`)
    const list = await api('GET', `/api/customers?q=${encodeURIComponent(cust.phone)}`)
    ensure(list.json.data.length === 1, `rows with that phone: ${list.json.data.length}`)
  })
  await check('POST /api/customers', 'invalid', 'invalid body (short name, bad phone) is rejected and writes nothing', async () => {
    const r = await api('POST', '/api/customers', { body: { name: 'x', phone: 'abc' } })
    ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status >= 500) finding('POST /api/customers', `validation failure returns ${r.status} "${r.json?.error}" instead of 400 (zod error is not handled)`)
    const list = await api('GET', `/api/customers?q=abc`); ensure(!list.json.data.some((c: any) => c.phone === 'abc'), 'invalid row persisted')
  })
  await check('GET /api/customers', 'admin', 'list shape + pagination + search', async () => {
    const r = await api('GET', `/api/customers?q=${encodeURIComponent(RUN)}&pageSize=1&page=1`, { token: admin })
    ensure(r.status === 200 && Array.isArray(r.json.data) && r.json.pagination, 'shape')
    ensure(r.json.data.length === 1 && r.json.pagination.pageSize === 1 && r.json.pagination.total >= 2 && r.json.pagination.pages >= 2, JSON.stringify(r.json.pagination))
    const p2 = await api('GET', `/api/customers?q=${encodeURIComponent(RUN)}&pageSize=1&page=2`)
    ensure(p2.json.data[0].id !== r.json.data[0].id, 'page 2 repeats page 1')
  })
  await check('GET /api/customers', 'unauth', 'unauthenticated list is accepted (OPEN, returns customer PII)', async () => {
    const r = await api('GET', '/api/customers?pageSize=1'); ensure(r.status === 200, `status ${r.status}`)
    finding('GET /api/customers', 'returns customer names/phones without authentication (known open route)')
  })
  await check('GET /api/customers', 'invalid', 'bad paging params are tolerated or rejected without a crash', async () => {
    const r = await api('GET', '/api/customers?page=0&pageSize=9999&sortDir=sideways'); ensure(r.status < 600, 'no response')
    if (r.status >= 500) finding('GET /api/customers', `sortDir=sideways returns ${r.status} instead of 400`)
  })
  await check('GET /api/customers/[id]', 'missing', 'unknown uuid -> 404', async () => { const r = await api('GET', `/api/customers/${UUID0}`); ensure(r.status === 404, `status ${r.status}`) })
  await check('GET /api/customers/[id]', 'invalid', 'non-uuid id is rejected', async () => {
    const r = await api('GET', '/api/customers/not-a-uuid'); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status >= 500) finding('GET /api/customers/[id]', `non-uuid id returns ${r.status} instead of 400/404`)
  })
  await check('GET /api/customers/[id]', 'unauth', 'unauthenticated read is accepted (OPEN)', async () => {
    const r = await api('GET', `/api/customers/${cust.id}`); ensure(r.status === 200, `status ${r.status}`)
    finding('GET /api/customers/[id]', 'readable without authentication (known open route)')
  })
  await check('PATCH /api/customers/[id]', 'persist', 'update persists (re-read)', async () => {
    const r = await api('PATCH', `/api/customers/${cust.id}`, { body: { name: tag('Customer edited') } }); ensure(r.status === 200, `status ${r.status}`)
    const g = await api('GET', `/api/customers/${cust.id}`); ensure(g.json.name === tag('Customer edited'), 'not persisted')
  })
  await check('PATCH /api/customers/[id]', 'invalid', 'invalid update rejected, record unchanged', async () => {
    const r = await api('PATCH', `/api/customers/${cust.id}`, { body: { name: 'x' } }); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status >= 500) finding('PATCH /api/customers/[id]', `validation failure returns ${r.status} instead of 400`)
    const g = await api('GET', `/api/customers/${cust.id}`); ensure(g.json.name === tag('Customer edited'), 'record changed')
  })
  await check('PATCH /api/customers/[id]', 'missing', 'unknown id is rejected', async () => {
    const r = await api('PATCH', `/api/customers/${UUID0}`, { body: { name: tag('ghost') } }); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status !== 404) finding('PATCH /api/customers/[id]', `unknown id returns ${r.status} instead of 404`)
  })

  // ================================================================ vendors, categories, tags (open routes)
  let cat: any, vendor: any, tagRow: any
  await check('POST /api/vendor-categories', 'admin', 'create 201', async () => {
    const r = await api('POST', '/api/vendor-categories', { body: { name: tag('Cat') } }); ensure(r.status === 201, `status ${r.status}`); cat = r.json; made.categories.add(cat.id)
  })
  await check('POST /api/vendor-categories', 'invalid', 'duplicate -> 409; empty -> 400; >120 chars -> 400', async () => {
    ensure((await api('POST', '/api/vendor-categories', { body: { name: tag('Cat') } })).status === 409, 'duplicate not 409')
    ensure((await api('POST', '/api/vendor-categories', { body: { name: '   ' } })).status === 400, 'empty not 400')
    ensure((await api('POST', '/api/vendor-categories', { body: { name: 'x'.repeat(121) } })).status === 400, 'long not 400')
  })
  await check('GET /api/vendor-categories', 'persist', 'created category is listed; archived is hidden unless include_archived=1', async () => {
    ensure((await api('GET', '/api/vendor-categories')).json.some((c: any) => c.id === cat.id), 'not listed')
    ensure((await api('PATCH', `/api/vendor-categories/${cat.id}`, { body: { archived: true } })).status === 200, 'archive failed')
    ensure(!(await api('GET', '/api/vendor-categories')).json.some((c: any) => c.id === cat.id), 'archived still listed')
    ensure((await api('GET', '/api/vendor-categories?include_archived=1')).json.some((c: any) => c.id === cat.id), 'include_archived missing it')
    await api('PATCH', `/api/vendor-categories/${cat.id}`, { body: { archived: false } })
  })
  await check('GET /api/vendor-categories', 'unauth', 'unauthenticated read accepted (OPEN)', async () => { ensure((await api('GET', '/api/vendor-categories')).status === 200, 'not 200'); finding('GET /api/vendor-categories', 'readable without authentication (known open route)') })
  await check('PATCH /api/vendor-categories/[id]', 'persist', 'rename persists', async () => {
    ensure((await api('PATCH', `/api/vendor-categories/${cat.id}`, { body: { name: tag('Cat renamed') } })).status === 200, 'rename failed')
    ensure((await api('GET', '/api/vendor-categories')).json.find((c: any) => c.id === cat.id)?.name === tag('Cat renamed'), 'not persisted')
  })
  await check('PATCH /api/vendor-categories/[id]', 'invalid', 'empty body 400, empty name 400', async () => {
    ensure((await api('PATCH', `/api/vendor-categories/${cat.id}`, { body: {} })).status === 400, 'nothing-to-update not 400')
    ensure((await api('PATCH', `/api/vendor-categories/${cat.id}`, { body: { name: '' } })).status === 400, 'empty name not 400')
  })
  await check('PATCH /api/vendor-categories/[id]', 'missing', 'unknown id -> 404', async () => { const r = await api('PATCH', `/api/vendor-categories/${UUID0}`, { body: { name: tag('ghost') } }); ensure(r.status === 404, `status ${r.status}`) })

  await check('POST /api/vendors', 'admin', 'create 201 with category', async () => {
    const r = await api('POST', '/api/vendors', { body: { name: tag('Vendor'), phone: '0300', category_id: cat.id, notes: tag('n') } }); ensure(r.status === 201, `status ${r.status}`); vendor = r.json; made.vendors.add(vendor.id)
    ensure(vendor.category_id === cat.id, 'category not saved')
  })
  await check('POST /api/vendors', 'invalid', 'missing/blank name -> 400, nothing written', async () => {
    ensure((await api('POST', '/api/vendors', { body: { name: '  ' } })).status === 400, 'blank not 400')
    ensure((await api('POST', '/api/vendors', { body: {} })).status >= 400, 'empty accepted')
  })
  await check('POST /api/vendors', 'unauth', 'unauthenticated create accepted (OPEN)', async () => { const r = await api('POST', '/api/vendors', { body: { name: tag('Open vendor') } }); ensure(r.status === 201, `status ${r.status}`); made.vendors.add(r.json.id); finding('POST /api/vendors', 'accepts an unauthenticated create (known open route)') })
  await check('GET /api/vendors', 'persist', 'list includes vendor with its category object', async () => {
    const r = await api('GET', '/api/vendors'); ensure(r.status === 200, `status ${r.status}`)
    const v = r.json.find((x: any) => x.id === vendor.id); ensure(v && v.vendor_categories?.id === cat.id, 'vendor/category join missing')
    finding('GET /api/vendors', 'readable without authentication (known open route)')
  })
  await check('GET /api/vendors/[id]', 'persist', 'detail embeds tags and ledger arrays', async () => {
    const r = await api('GET', `/api/vendors/${vendor.id}`); ensure(r.status === 200 && Array.isArray(r.json.vendor_tags) && Array.isArray(r.json.vendor_ledger), 'shape')
  })
  await check('GET /api/vendors/[id]', 'missing', 'unknown id -> 404', async () => { ensure((await api('GET', `/api/vendors/${UUID0}`)).status === 404, 'not 404') })
  await check('GET /api/vendors/[id]', 'invalid', 'non-uuid id is rejected', async () => {
    const r = await api('GET', '/api/vendors/not-a-uuid'); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status >= 500) finding('GET /api/vendors/[id]', `non-uuid id returns ${r.status} instead of 400/404`)
  })
  await check('PUT /api/vendors/[id]', 'persist', 'update persists; blank name -> 400; unknown id -> 404', async () => {
    ensure((await api('PUT', `/api/vendors/${vendor.id}`, { body: { name: tag('Vendor edited'), category_id: cat.id } })).status === 200, 'update failed')
    ensure((await api('GET', `/api/vendors/${vendor.id}`)).json.name === tag('Vendor edited'), 'not persisted')
    ensure((await api('PUT', `/api/vendors/${vendor.id}`, { body: { name: '' } })).status === 400, 'blank not 400')
    ensure((await api('PUT', `/api/vendors/${UUID0}`, { body: { name: tag('ghost') } })).status === 404, 'unknown not 404')
  })
  await check('POST /api/vendor-tags', 'admin', 'create 201; duplicate 409; missing fields 400', async () => {
    const r = await api('POST', '/api/vendor-tags', { body: { vendor_id: vendor.id, tag_name: tag('tag') } }); ensure(r.status === 201, `status ${r.status}`); tagRow = r.json; made.tags.add(tagRow.id)
    ensure((await api('POST', '/api/vendor-tags', { body: { vendor_id: vendor.id, tag_name: tag('tag') } })).status === 409, 'duplicate not 409')
    ensure((await api('POST', '/api/vendor-tags', { body: { vendor_id: vendor.id } })).status === 400, 'missing tag_name not 400')
  })
  await check('GET /api/vendor-tags', 'persist', 'lists tags for a vendor; vendor_id required', async () => {
    ensure((await api('GET', `/api/vendor-tags?vendor_id=${vendor.id}`)).json.some((t: any) => t.id === tagRow.id), 'tag not listed')
    ensure((await api('GET', '/api/vendor-tags')).status === 400, 'no vendor_id not 400')
  })
  await check('DELETE /api/vendor-tags/[id]', 'persist', 'delete removes it', async () => {
    ensure((await api('DELETE', `/api/vendor-tags/${tagRow.id}`)).status === 200, 'delete failed')
    ensure(!(await api('GET', `/api/vendor-tags?vendor_id=${vendor.id}`)).json.some((t: any) => t.id === tagRow.id), 'still listed')
  })
  await check('DELETE /api/vendor-tags/[id]', 'missing', 'unknown id', async () => {
    const r = await api('DELETE', `/api/vendor-tags/${UUID0}`); ensure(r.status < 600, 'no response')
    if (r.status === 200) finding('DELETE /api/vendor-tags/[id]', 'deleting a nonexistent tag returns 200 success instead of 404')
  })
  await check('DELETE /api/vendor-categories/[id]', 'invalid', 'category in use by a vendor -> 409 CATEGORY_IN_USE and it survives', async () => {
    const r = await api('DELETE', `/api/vendor-categories/${cat.id}`); ensure(r.status === 409 && r.json.code === 'CATEGORY_IN_USE', `status ${r.status}`)
    ensure((await api('GET', '/api/vendor-categories')).json.some((c: any) => c.id === cat.id), 'category vanished')
  })

  // ================================================================ general ledger (admin)
  const stats0 = (await api('GET', '/api/general-ledger/stats', { token: admin })).json
  await check('GET /api/general-ledger/stats', 'admin', 'shape: numeric totals, count, private no-store', async () => {
    const r = await api('GET', '/api/general-ledger/stats', { token: admin })
    ensure(r.status === 200, `status ${r.status}`)
    for (const k of ['totalDebit', 'totalCredit', 'currentBalance', 'entryCount']) ensure(typeof r.json[k] === 'number', `${k} not numeric`)
    ensure(Math.abs(r.json.currentBalance - (r.json.totalDebit - r.json.totalCredit)) < 0.005, 'balance != debit - credit')
    ensure((r.headers.get('cache-control') ?? '').includes('no-store'), 'financial totals are cacheable')
  })
  let gl1: any, gl2: any
  await check('POST /api/general-ledger', 'admin', 'debit entry: 201, stored XOR, balance = previous + debit', async () => {
    const r = await api('POST', '/api/general-ledger', { token: admin, body: { entry_date: D1, particulars: tag('receipt'), debit: 1234.5, entry_type: 'miscellaneous', notes: tag('n') } })
    ensure(r.status === 201, `status ${r.status} ${r.text.slice(0, 100)}`); gl1 = r.json; made.ledger.add(gl1.id)
    ensure(num(gl1.debit) === 1234.5 && gl1.credit === null, 'debit/credit not XOR')
    ensure(Math.abs(num(gl1.balance) - (stats0.currentBalance + 1234.5)) < 0.005, `balance ${gl1.balance} vs ${stats0.currentBalance + 1234.5}`)
  })
  await check('POST /api/general-ledger', 'admin', 'credit entry: balance = previous - credit', async () => {
    const r = await api('POST', '/api/general-ledger', { token: admin, body: { entry_date: D2, particulars: tag('expense'), credit: 234.25, entry_type: 'miscellaneous' } })
    ensure(r.status === 201, `status ${r.status}`); gl2 = r.json; made.ledger.add(gl2.id)
    ensure(num(gl2.credit) === 234.25 && gl2.debit === null, 'XOR')
    ensure(Math.abs(num(gl2.balance) - (num(gl1.balance) - 234.25)) < 0.005, `balance ${gl2.balance}`)
  })
  await check('GET /api/general-ledger/stats', 'persist', 'totals moved by exactly the two entries', async () => {
    const s = (await api('GET', '/api/general-ledger/stats', { token: admin })).json
    ensure(Math.abs(s.totalDebit - stats0.totalDebit - 1234.5) < 0.005, 'debit delta')
    ensure(Math.abs(s.totalCredit - stats0.totalCredit - 234.25) < 0.005, 'credit delta')
    ensure(s.entryCount === stats0.entryCount + 2, 'count delta')
    ensure(Math.abs(s.currentBalance - (stats0.currentBalance + 1000.25)) < 0.005, 'balance delta')
  })
  await check('POST /api/general-ledger', 'invalid', 'both debit and credit -> 400', async () => { ensure((await api('POST', '/api/general-ledger', { token: admin, body: { entry_date: D1, particulars: tag('x'), debit: 1, credit: 1, entry_type: 'miscellaneous' } })).status === 400, 'not 400') })
  await check('POST /api/general-ledger', 'invalid', 'neither debit nor credit -> 400', async () => { ensure((await api('POST', '/api/general-ledger', { token: admin, body: { entry_date: D1, particulars: tag('x'), entry_type: 'miscellaneous' } })).status === 400, 'not 400') })
  await check('POST /api/general-ledger', 'invalid', 'missing required fields -> 400', async () => { ensure((await api('POST', '/api/general-ledger', { token: admin, body: { debit: 5 } })).status === 400, 'not 400') })
  await check('POST /api/general-ledger', 'invalid', 'bad entry_type is rejected and writes nothing', async () => {
    const r = await api('POST', '/api/general-ledger', { token: admin, body: { entry_date: D1, particulars: tag('badtype'), debit: 5, entry_type: 'bogus' } }); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status >= 500) finding('POST /api/general-ledger', `unknown entry_type returns ${r.status} instead of 400 (database check constraint surfaces as a server error)`)
  })
  await check('POST /api/general-ledger', 'invalid', 'negative and non-numeric amounts', async () => {
    const neg = await api('POST', '/api/general-ledger', { token: admin, body: { entry_date: '2099-06-01', particulars: tag('negative'), debit: -50, entry_type: 'miscellaneous' } })
    if (neg.status === 201) { made.ledger.add(neg.json.id); finding('POST /api/general-ledger', 'a NEGATIVE debit is accepted (201): the route and the database only enforce debit-XOR-credit, not amount > 0, so a negative debit lowers the balance like a credit') }
    const bad = await api('POST', '/api/general-ledger', { token: admin, body: { entry_date: D1, particulars: tag('nan'), debit: 'abc', entry_type: 'miscellaneous' } })
    ensure(isRejected(bad.status), `non-numeric accepted (${bad.status})`)
    if (bad.status >= 500) finding('POST /api/general-ledger', `non-numeric amount returns ${bad.status} instead of 400`)
  })
  await check('GET /api/general-ledger/[id]', 'persist', 'reads back exactly what was written', async () => {
    const r = await api('GET', `/api/general-ledger/${gl1.id}`, { token: admin }); ensure(r.status === 200 && num(r.json.debit) === 1234.5 && r.json.particulars === tag('receipt'), `status ${r.status}`)
  })
  await check('GET /api/general-ledger/[id]', 'missing', 'unknown id -> 404', async () => { ensure((await api('GET', `/api/general-ledger/${UUID0}`, { token: admin })).status === 404, 'not 404') })
  await check('GET /api/general-ledger/[id]', 'invalid', 'non-uuid id rejected', async () => {
    const r = await api('GET', '/api/general-ledger/nope', { token: admin }); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status >= 500) finding('GET /api/general-ledger/[id]', `non-uuid id returns ${r.status} instead of 400/404`)
  })
  await check('GET /api/general-ledger', 'admin', 'list: filters (type, date range, search) and pagination shape', async () => {
    const f = await api('GET', `/api/general-ledger?start_date=${D1}&end_date=${D2}&entry_type=miscellaneous&search=${encodeURIComponent('QA-API')}`, { token: admin })
    ensure(f.status === 200 && Array.isArray(f.json), `status ${f.status}`)
    const ids = f.json.map((e: any) => e.id); ensure(ids.includes(gl1.id) && ids.includes(gl2.id), 'filtered list misses the new entries')
    ensure(f.json.every((e: any) => e.entry_date >= D1 && e.entry_date <= D2), 'date filter leaks')
    const p = await api('GET', `/api/general-ledger?page=1&pageSize=2&start_date=${D1}`, { token: admin })
    ensure(p.json.pagination && p.json.data.length <= 2 && p.json.pagination.pageSize === 2, 'pagination shape')
    const none = await api('GET', `/api/general-ledger?search=${encodeURIComponent('zzz-no-such-entry-' + RUN)}`, { token: admin }); ensure(none.status === 200 && none.json.length === 0, 'empty result not empty list')
  })
  await check('GET /api/general-ledger', 'persist', 'running balance is consistent across my entries (ordered by date, created_at)', async () => {
    const r = await api('GET', `/api/general-ledger?start_date=${D1}&end_date=${D2}&search=${encodeURIComponent(RUN)}`, { token: admin })
    const mine = r.json.filter((e: any) => made.ledger.has(e.id)).sort((a: any, b: any) => (a.entry_date + a.created_at).localeCompare(b.entry_date + b.created_at))
    ensure(mine.length >= 2, 'entries missing')
    for (let i = 1; i < mine.length; i++) ensure(Math.abs(num(mine[i].balance) - (num(mine[i - 1].balance) + num(mine[i].debit ?? 0) - num(mine[i].credit ?? 0))) < 0.005, `balance break at ${i}`)
  })
  await check('PUT /api/general-ledger/[id]', 'persist', 'flip debit to credit: persisted, balances recomputed', async () => {
    const r = await api('PUT', `/api/general-ledger/${gl1.id}`, { token: admin, body: { entry_date: D1, particulars: tag('receipt edited'), credit: 100, entry_type: 'miscellaneous' } })
    ensure(r.status === 200, `status ${r.status}`)
    const g = (await api('GET', `/api/general-ledger/${gl1.id}`, { token: admin })).json
    ensure(g.debit === null && num(g.credit) === 100 && g.particulars === tag('receipt edited'), 'not persisted')
    ensure(Math.abs(num(g.balance) - (stats0.currentBalance - 100)) < 0.005, `balance ${g.balance}`)
    const g2 = (await api('GET', `/api/general-ledger/${gl2.id}`, { token: admin })).json
    ensure(Math.abs(num(g2.balance) - (num(g.balance) - 234.25)) < 0.005, 'later entry balance not recomputed')
  })
  await check('PUT /api/general-ledger/[id]', 'invalid', 'both/neither -> 400 and entry unchanged', async () => {
    ensure((await api('PUT', `/api/general-ledger/${gl1.id}`, { token: admin, body: { entry_date: D1, particulars: tag('z'), debit: 1, credit: 1, entry_type: 'miscellaneous' } })).status === 400, 'both not 400')
    ensure((await api('GET', `/api/general-ledger/${gl1.id}`, { token: admin })).json.particulars === tag('receipt edited'), 'entry changed')
  })
  await check('PUT /api/general-ledger/[id]', 'missing', 'unknown id -> 404', async () => { ensure((await api('PUT', `/api/general-ledger/${UUID0}`, { token: admin, body: { entry_date: D1, particulars: tag('g'), debit: 1, entry_type: 'miscellaneous' } })).status === 404, 'not 404') })
  // vendor mirror (database trigger) + vendor ledger
  let vglId: string | undefined
  await check('POST /api/general-ledger', 'persist', 'vendor_payment credit mirrors into the vendor ledger (reverse sign)', async () => {
    const r = await api('POST', '/api/general-ledger', { token: admin, body: { entry_date: '2099-04-01', particulars: tag('vendor pay'), credit: 700, entry_type: 'vendor_payment', vendor_id: vendor.id } })
    ensure(r.status === 201, `status ${r.status} ${r.text.slice(0, 100)}`); vglId = r.json.id; made.ledger.add(vglId!)
    const vl = await api('GET', `/api/vendor-ledger?vendor_id=${vendor.id}`, { token: admin }); ensure(vl.status === 200 && Array.isArray(vl.json), 'vendor ledger')
    const row = vl.json.find((e: any) => e.general_ledger_id === vglId); ensure(row, 'no mirrored vendor ledger row')
    ensure(num(row.debit) === 700 && row.credit === null, 'mirror sign wrong (main credit must be vendor debit)')
    ensure(num(row.balance) === 700, `vendor balance ${row.balance}`)
  })
  await check('POST /api/vendor-ledger', 'admin', 'manual entry: 201, balance chains from the previous entry', async () => {
    const r = await api('POST', '/api/vendor-ledger', { token: admin, body: { vendor_id: vendor.id, entry_date: '2099-04-02', particulars: tag('bill'), credit: 200 } })
    ensure(r.status === 201, `status ${r.status} ${r.text.slice(0, 100)}`); made.vendorLedger.add(r.json.id)
    const vl = (await api('GET', `/api/vendor-ledger?vendor_id=${vendor.id}`, { token: admin })).json
    const row = vl.find((e: any) => e.id === r.json.id); ensure(row && num(row.balance) === 500, `balance ${row?.balance} expected 500 (700 debit - 200 credit)`)
  })
  await check('POST /api/vendor-ledger', 'invalid', 'both/neither/missing -> 400', async () => {
    for (const b of [{ vendor_id: vendor.id, entry_date: D1, particulars: tag('x'), debit: 1, credit: 1 }, { vendor_id: vendor.id, entry_date: D1, particulars: tag('x') }, { entry_date: D1 }])
      ensure((await api('POST', '/api/vendor-ledger', { token: admin, body: b })).status === 400, `body ${JSON.stringify(b).slice(0, 50)} not 400`)
  })
  await check('GET /api/vendor-ledger', 'invalid', 'vendor_id required -> 400', async () => { ensure((await api('GET', '/api/vendor-ledger', { token: admin })).status === 400, 'not 400') })
  await check('GET /api/vendor-ledger', 'missing', 'vendor with no entries -> 200 empty list', async () => { const r = await api('GET', `/api/vendor-ledger?vendor_id=${UUID0}`, { token: admin }); ensure(r.status === 200 && r.json.length === 0, `status ${r.status}`) })
  await check('DELETE /api/general-ledger/[id]', 'persist', 'delete removes the entry and its vendor mirror; later balances recomputed', async () => {
    ensure((await api('DELETE', `/api/general-ledger/${vglId}`, { token: admin })).status === 200, 'delete failed')
    ensure((await api('GET', `/api/general-ledger/${vglId}`, { token: admin })).status === 404, 'still readable')
    ensure(!(await api('GET', `/api/vendor-ledger?vendor_id=${vendor.id}`, { token: admin })).json.some((e: any) => e.general_ledger_id === vglId), 'mirror survived')
    ensure((await api('DELETE', `/api/general-ledger/${gl2.id}`, { token: admin })).status === 200, 'delete gl2')
    ensure((await api('DELETE', `/api/general-ledger/${gl1.id}`, { token: admin })).status === 200, 'delete gl1')
    // everything this run added is now removed except the tagged negative-amount entry (swept at the end)
    const rest = (await api('GET', `/api/general-ledger?start_date=2099-03-01&end_date=2099-04-30&search=${encodeURIComponent(RUN)}`, { token: admin })).json
    ensure(rest.length === 0, `${rest.length} entries remain in the test window`)
  })
  await check('DELETE /api/general-ledger/[id]', 'missing', 'unknown id', async () => {
    const r = await api('DELETE', `/api/general-ledger/${UUID0}`, { token: admin }); ensure(r.status < 600, 'no response')
    if (r.status === 200) finding('DELETE /api/general-ledger/[id]', 'deleting a nonexistent entry returns 200 success instead of 404')
  })

  // ================================================================ orders & payments (admin|staff)
  let order: any, order2: any
  const ledgerBeforeOrder = (await api('GET', '/api/general-ledger/stats', { token: admin })).json
  await check('POST /api/orders', 'staff', 'staff creates an order: 201, items saved', async () => {
    const r = await api('POST', '/api/orders', { token: staff, body: orderBody(cust.id) })
    ensure(r.status === 201 && r.json.id, `status ${r.status} ${r.text.slice(0, 160)}`); order = r.json; made.orders.add(order.id)
    ensure(/^AR-\d+$/.test(order.order_number), `order_number ${order.order_number}`)
  })
  if (!order) throw new Error('cannot continue: order fixture failed')
  await check('POST /api/orders', 'admin', 'admin creates an order too', async () => {
    const r = await api('POST', '/api/orders', { token: admin, body: orderBody(cust.id, { advancePaid: 0, balance: 10000 }) })
    ensure(r.status === 201, `status ${r.status}`); order2 = r.json; made.orders.add(order2.id)
  })
  await check('GET /api/orders/[id]', 'persist', 'order reads back with amounts, dates, items and customer', async () => {
    const r = await api('GET', `/api/orders/${order.id}`, { token: staff }); ensure(r.status === 200, `status ${r.status}`)
    ensure(num(r.json.total_amount) === 10000 && num(r.json.advance_paid) === 2500, 'amounts')
    ensure(r.json.booking_date === '2099-03-01' && r.json.delivery_date === '2099-03-10', 'dates')
    ensure(r.json.status === 'In Process', 'default status')
    ensure((r.json.order_items?.length ?? 0) === 2, `items ${r.json.order_items?.length}`)
  })
  await check('POST /api/orders', 'persist', 'advance creates exactly one order_payment ledger entry for that amount (system invariant)', async () => {
    const s = (await api('GET', '/api/general-ledger/stats', { token: admin })).json
    ensure(Math.abs(s.totalDebit - ledgerBeforeOrder.totalDebit - 2500) < 0.005, `debit moved by ${s.totalDebit - ledgerBeforeOrder.totalDebit}, expected 2500`)
    const l = await api('GET', `/api/general-ledger?start_date=2099-03-01&end_date=2099-03-01&entry_type=order_payment`, { token: admin })
    const mine = l.json.filter((e: any) => e.order_id === order.id); ensure(mine.length === 1 && num(mine[0].debit) === 2500, `entries for the order: ${mine.length}`)
  })
  await check('POST /api/orders', 'invalid', 'validation: missing customer, advance>total, delivery<booking, >4 items, duplicate types, bad status', async () => {
    const cases: [string, any][] = [
      ['no customerId', { ...orderBody(cust.id), customerId: undefined }],
      ['advance > total', orderBody(cust.id, { advancePaid: 20000 })],
      ['delivery before booking', orderBody(cust.id, { deliveryDate: '2099-02-01' })],
      ['5 items', orderBody(cust.id, { orderItems: ['nikkah', 'mehndi', 'barat', 'wallima', 'other'].map((t) => ({ order_type: t, description: 'd' })) })],
      ['duplicate item type', orderBody(cust.id, { orderItems: [{ order_type: 'nikkah', description: 'a' }, { order_type: 'nikkah', description: 'b' }] })],
      ['bad status', orderBody(cust.id, { status: 'Lost' })],
    ]
    const ordersBefore = (await service.from('orders').select('*', { count: 'exact', head: true })).count
    for (const [name, body] of cases) { const r = await api('POST', '/api/orders', { token: admin, body }); ensure(r.status === 400, `${name}: got ${r.status}`) }
    ensure((await service.from('orders').select('*', { count: 'exact', head: true })).count === ordersBefore, 'a rejected order was persisted')
  })
  await check('POST /api/orders', 'invalid', 'unknown customer uuid is rejected and writes no order', async () => {
    const n0 = (await service.from('orders').select('*', { count: 'exact', head: true })).count
    const r = await api('POST', '/api/orders', { token: admin, body: orderBody(UUID0) }); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status >= 500) finding('POST /api/orders', `order for a nonexistent customer returns ${r.status} (foreign-key error text) instead of 400/404`)
    ensure((await service.from('orders').select('*', { count: 'exact', head: true })).count === n0, 'order persisted')
  })
  await check('GET /api/orders', 'admin', 'list: shape, search by order number, status filter, pagination', async () => {
    const r = await api('GET', `/api/orders?q=${encodeURIComponent(order.order_number)}&pageSize=5`, { token: admin })
    ensure(r.status === 200 && Array.isArray(r.json.data) && r.json.pagination, 'shape')
    ensure(r.json.data.some((o: any) => o.id === order.id), 'search misses the new order')
    const f = await api('GET', `/api/orders?customerId=${cust.id}&status=In%20Process&pageSize=100`, { token: staff })
    ensure(f.status === 200 && f.json.data.every((o: any) => o.status === 'In Process' && o.customer_id === cust.id), 'filter leaks')
    const bad = await api('GET', '/api/orders?status=Lost', { token: admin }); ensure(isRejected(bad.status), 'bad status filter accepted')
    if (bad.status >= 500) finding('GET /api/orders', `invalid status filter returns ${bad.status} instead of 400`)
  })
  await check('GET /api/orders/all', 'admin', 'simple list shape {data: []} includes the new order', async () => {
    const r = await api('GET', '/api/orders/all', { token: admin }); ensure(r.status === 200 && Array.isArray(r.json.data) && r.json.data.some((o: any) => o.id === order.id), 'shape/content')
  })
  await check('GET /api/orders/[id]', 'missing', 'unknown id -> 404', async () => { ensure((await api('GET', `/api/orders/${UUID0}`, { token: admin })).status === 404, 'not 404') })
  await check('PATCH /api/orders/[id]', 'persist', 'status change persists', async () => {
    const r = await api('PATCH', `/api/orders/${order.id}`, { token: staff, body: { status: 'Delivered' } }); ensure(r.status === 200, `status ${r.status}`)
    ensure((await api('GET', `/api/orders/${order.id}`, { token: admin })).json.status === 'Delivered', 'not persisted')
  })
  await check('PATCH /api/orders/[id]', 'invalid', 'bad status rejected and order unchanged', async () => {
    const r = await api('PATCH', `/api/orders/${order.id}`, { token: admin, body: { status: 'Lost' } }); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status >= 500) finding('PATCH /api/orders/[id]', `validation failure returns ${r.status} "Failed to update order" instead of 400`)
    ensure((await api('GET', `/api/orders/${order.id}`, { token: admin })).json.status === 'Delivered', 'order changed')
  })
  await check('PATCH /api/orders/[id]', 'missing', 'unknown id is rejected', async () => {
    const r = await api('PATCH', `/api/orders/${UUID0}`, { token: admin, body: { status: 'Delivered' } }); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status !== 404) finding('PATCH /api/orders/[id]', `unknown id returns ${r.status} instead of 404`)
  })
  await check('PATCH /api/orders/[id]', 'persist', 'partial update nulls money fields it was not given (data-loss check)', async () => {
    const before = (await api('GET', `/api/orders/${order2.id}`, { token: admin })).json
    await api('PATCH', `/api/orders/${order2.id}`, { token: admin, body: { comments: tag('only comments') } })
    const after = (await api('GET', `/api/orders/${order2.id}`, { token: admin })).json
    if (num(after.total_amount) !== num(before.total_amount)) finding('PATCH /api/orders/[id]', `a PATCH that sends only "comments" changed total_amount ${before.total_amount} -> ${after.total_amount} (route writes total_amount: value || null for omitted fields)`)
    ensure(after.comments === tag('only comments'), 'comments not saved')
  })

  let pay: any
  await check('POST /api/payments', 'staff', 'staff records a payment: 201, order joined', async () => {
    const r = await api('POST', '/api/payments', { token: staff, body: { order_id: order2.id, customer_id: cust.id, amount: 1500, payment_method: 'cash', payment_date: '2099-03-05', notes: tag('pay') } })
    ensure(r.status === 201 && r.json.payment?.id, `status ${r.status} ${r.text.slice(0, 160)}`); pay = r.json.payment; made.payments.add(pay.id)
    ensure(num(pay.amount) === 1500 && pay.order?.id === order2.id, 'shape')
  })
  if (!pay) throw new Error('cannot continue: payment fixture failed')
  await check('POST /api/payments', 'persist', 'payment writes one order_payment ledger entry; GET lists it for the order', async () => {
    const l = await api('GET', '/api/general-ledger?start_date=2099-03-05&end_date=2099-03-05&entry_type=order_payment', { token: admin })
    const mine = l.json.filter((e: any) => e.order_id === order2.id); ensure(mine.length === 1 && num(mine[0].debit) === 1500, `ledger rows ${mine.length}`)
    const g = await api('GET', `/api/payments?order_id=${order2.id}`, { token: admin }); ensure(g.json.payments.some((p: any) => p.id === pay.id), 'not listed')
  })
  await check('POST /api/payments', 'invalid', 'missing fields 400; zero 400; negative/NaN rejected; order of another customer 404 — none persist', async () => {
    const n0 = (await service.from('payments').select('*', { count: 'exact', head: true })).count
    ensure((await api('POST', '/api/payments', { token: admin, body: { order_id: order2.id } })).status === 400, 'missing not 400')
    ensure((await api('POST', '/api/payments', { token: admin, body: { order_id: order2.id, customer_id: cust.id, amount: 0 } })).status === 400, 'zero not 400')
    const neg = await api('POST', '/api/payments', { token: admin, body: { order_id: order2.id, customer_id: cust.id, amount: -5 } }); ensure(isRejected(neg.status), `negative accepted ${neg.status}`)
    if (neg.status >= 500) finding('POST /api/payments', `negative amount returns ${neg.status} instead of 400 (only the database check rejects it)`)
    const nan = await api('POST', '/api/payments', { token: admin, body: { order_id: order2.id, customer_id: cust.id, amount: 'abc' } }); ensure(isRejected(nan.status), `NaN accepted ${nan.status}`)
    ensure((await api('POST', '/api/payments', { token: admin, body: { order_id: order2.id, customer_id: UUID0, amount: 5 } })).status === 404, 'wrong customer not 404')
    ensure((await service.from('payments').select('*', { count: 'exact', head: true })).count === n0, 'a rejected payment was persisted')
  })
  await check('PATCH /api/payments/[id]', 'persist', 'amount edit persists', async () => {
    const r = await api('PATCH', `/api/payments/${pay.id}`, { token: staff, body: { amount: 1600, notes: tag('pay edited') } }); ensure(r.status === 200, `status ${r.status}`)
    const g = (await api('GET', `/api/payments?order_id=${order2.id}`, { token: admin })).json.payments.find((p: any) => p.id === pay.id); ensure(num(g.amount) === 1600, 'not persisted')
    const l = (await api('GET', '/api/general-ledger?start_date=2099-03-05&end_date=2099-03-05&entry_type=order_payment', { token: admin })).json.filter((e: any) => e.order_id === order2.id)
    if (l.length === 1 && num(l[0].debit) !== 1600) finding('PATCH /api/payments/[id]', `editing a payment's amount (1500 -> 1600) does NOT update its ledger entry (still ${l[0].debit}); the ledger only catches up when sync-payments is run`)
  })
  await check('PATCH /api/payments/[id]', 'missing', 'unknown id -> 404', async () => { ensure((await api('PATCH', `/api/payments/${UUID0}`, { token: admin, body: { amount: 1 } })).status === 404, 'not 404') })
  await check('PATCH /api/payments/[id]', 'invalid', 'negative amount rejected, payment unchanged', async () => {
    const r = await api('PATCH', `/api/payments/${pay.id}`, { token: admin, body: { amount: -1 } }); ensure(isRejected(r.status), `status ${r.status}`)
    const g = (await api('GET', `/api/payments?order_id=${order2.id}`, { token: admin })).json.payments.find((p: any) => p.id === pay.id); ensure(num(g.amount) === 1600, 'payment changed')
  })
  await check('POST /api/payments', 'persist', 'DOUBLE SUBMIT: two identical concurrent POSTs create two payments and two ledger rows (no idempotency)', async () => {
    const body = { order_id: order2.id, customer_id: cust.id, amount: 111, payment_method: 'cash', payment_date: '2099-03-06', notes: tag('dbl') }
    const [a, b] = await Promise.all([api('POST', '/api/payments', { token: admin, body }), api('POST', '/api/payments', { token: admin, body })])
    for (const x of [a, b]) if (x.json?.payment?.id) made.payments.add(x.json.payment.id)
    const created = [a, b].filter((x) => x.status === 201).length
    if (created === 2) finding('POST /api/payments', 'two identical concurrent submits both succeed (2 payments + 2 ledger rows): there is no server-side idempotency, so the UI must prevent double submits')
    ensure(created >= 1, 'neither submit succeeded')
  })
  await check('DELETE /api/payments/[id]', 'persist', 'delete removes it; unknown id -> 404', async () => {
    ensure((await api('DELETE', `/api/payments/${pay.id}`, { token: staff })).status === 200, 'delete failed')
    ensure(!(await api('GET', `/api/payments?order_id=${order2.id}`, { token: admin })).json.payments.some((p: any) => p.id === pay.id), 'still listed')
    ensure((await api('DELETE', `/api/payments/${pay.id}`, { token: admin })).status === 404, 'second delete not 404')
    const l = (await api('GET', '/api/general-ledger?start_date=2099-03-05&end_date=2099-03-05&entry_type=order_payment', { token: admin })).json.filter((e: any) => e.order_id === order2.id)
    if (l.length > 0) finding('DELETE /api/payments/[id]', 'deleting a payment leaves its order_payment ledger entry behind until sync-payments is run (books keep counting money that was deleted)')
  })
  await check('GET /api/payments', 'admin', 'list filters by customer; shape', async () => {
    const r = await api('GET', `/api/payments?customer_id=${cust.id}`, { token: admin }); ensure(r.status === 200 && Array.isArray(r.json.payments), 'shape')
    ensure(r.json.payments.every((p: any) => p.customer_id === cust.id), 'customer filter leaks')
  })
  await check('POST /api/orders', 'persist', 'DOUBLE SUBMIT: two identical concurrent POSTs', async () => {
    const body = orderBody(cust.id, { advancePaid: 0, balance: 10000, comments: tag('dbl order') })
    const [a, b] = await Promise.all([api('POST', '/api/orders', { token: admin, body }), api('POST', '/api/orders', { token: admin, body })])
    for (const x of [a, b]) if (x.json?.id) made.orders.add(x.json.id)
    const ok = [a, b].filter((x) => x.status === 201).length
    if (ok === 2) finding('POST /api/orders', 'two identical concurrent submits create two orders: no server-side idempotency (the UI must prevent double submits)')
    if (ok === 2 && a.json.order_number === b.json.order_number) finding('POST /api/orders', `concurrent creates were given the SAME order number ${a.json.order_number} (order numbers are generated read-then-increment)`)
    if (ok < 2) finding('POST /api/orders', `concurrent creates: one failed (${[a.status, b.status].join('/')}), consistent with a read-then-increment order number race`)
    ensure(ok >= 1, 'neither submit succeeded')
  })

  // ================================================================ measurements (open)
  let m1: any, m2: any
  const mBody = (over: Record<string, unknown> = {}) => ({ customer_id: cust.id, name: tag('Measure'), chest: 40, waist: 34, is_default: true, notes: tag('m'), ...over })
  await check('POST /api/measurements', 'admin', 'create 201, numeric fields stored', async () => {
    const r = await api('POST', '/api/measurements', { token: admin, body: mBody() }); ensure(r.status === 201, `status ${r.status} ${r.text.slice(0, 120)}`); m1 = r.json.measurement; made.measurements.add(m1.id)
    ensure(num(m1.chest) === 40 && m1.is_default === true, 'fields')
  })
  await check('POST /api/measurements', 'persist', 'a second default for the same customer demotes the first (exactly one default)', async () => {
    const r = await api('POST', '/api/measurements', { body: mBody({ name: tag('Measure 2') }) }); ensure(r.status === 201, `status ${r.status}`); m2 = r.json.measurement; made.measurements.add(m2.id)
    finding('POST /api/measurements', 'accepts an unauthenticated create (known open route)')
    const list = (await api('GET', `/api/measurements?customer_id=${cust.id}`)).json.measurements
    ensure(list.filter((m: any) => m.is_default).length === 1 && list.find((m: any) => m.id === m2.id).is_default, 'default flag not exclusive')
  })
  await check('POST /api/measurements', 'invalid', 'invalid body 400 and nothing written (bad uuid, negative, too large)', async () => {
    const n0 = (await service.from('measurements').select('*', { count: 'exact', head: true })).count
    for (const b of [mBody({ customer_id: 'x' }), mBody({ chest: -3 }), mBody({ chest: 999 }), mBody({ name: '' })]) {
      const r = await api('POST', '/api/measurements', { body: b }); ensure(r.status === 400, `got ${r.status} for ${JSON.stringify(b).slice(0, 60)}`)
    }
    ensure((await service.from('measurements').select('*', { count: 'exact', head: true })).count === n0, 'invalid row persisted')
  })
  await check('GET /api/measurements', 'admin', 'list shape, search, pagination totals', async () => {
    const r = await api('GET', `/api/measurements?customer_id=${cust.id}&limit=1&page=2`); ensure(r.status === 200 && r.json.total >= 2 && r.json.totalPages >= 2 && r.json.measurements.length === 1, JSON.stringify({ t: r.json.total, p: r.json.totalPages }))
  })
  await check('GET /api/measurements', 'invalid', 'search term returns results (not a server error)', async () => {
    const s = await api('GET', `/api/measurements?customer_id=${cust.id}&search=${encodeURIComponent('Measure')}`)
    if (s.status >= 500) finding('GET /api/measurements', 'ANY ?search= returns 500 (PostgREST PGRST100 "failed to parse logic tree": the route puts `customer.name.ilike` inside a flat .or()); same class of defect as the orders search fixed in f9f6eab. Measurement search in the UI cannot work.')
    ensure(s.status === 200, `search status ${s.status}`)
  })
  await check('GET /api/measurements', 'unauth', 'unauthenticated read accepted (OPEN)', async () => { ensure((await api('GET', '/api/measurements?limit=1')).status === 200, 'not 200'); finding('GET /api/measurements', 'readable without authentication (known open route)') })
  await check('GET /api/measurements/[id]', 'persist', 'reads back; unknown id -> 404', async () => {
    const r = await api('GET', `/api/measurements/${m1.id}`); ensure(r.status === 200 && r.json.measurement.id === m1.id, 'read')
    ensure((await api('GET', `/api/measurements/${UUID0}`)).status === 404, 'not 404')
  })
  await check('GET /api/customers/[id]/measurements', 'persist', 'lists the customer\'s measurements with a total', async () => {
    const r = await api('GET', `/api/customers/${cust.id}/measurements`); ensure(r.status === 200 && r.json.total === 2 && r.json.measurements.length === 2, `total ${r.json?.total}`)
    finding('GET /api/customers/[id]/measurements', 'readable without authentication (known open route)')
  })
  await check('GET /api/customers/[id]/measurements', 'missing', 'customer with none -> 200 empty', async () => { const r = await api('GET', `/api/customers/${UUID0}/measurements`); ensure(r.status === 200 && r.json.total === 0, `status ${r.status}`) })
  await check('PUT /api/measurements/[id]', 'persist', 'update persists; invalid -> 400 unchanged', async () => {
    ensure((await api('PUT', `/api/measurements/${m1.id}`, { body: mBody({ chest: 42, is_default: false }) })).status === 200, 'update failed')
    ensure(num((await api('GET', `/api/measurements/${m1.id}`)).json.measurement.chest) === 42, 'not persisted')
    ensure((await api('PUT', `/api/measurements/${m1.id}`, { body: mBody({ chest: -1 }) })).status === 400, 'invalid not 400')
    ensure(num((await api('GET', `/api/measurements/${m1.id}`)).json.measurement.chest) === 42, 'changed by invalid update')
  })
  await check('PUT /api/measurements/[id]', 'missing', 'unknown id is rejected', async () => {
    const r = await api('PUT', `/api/measurements/${UUID0}`, { body: mBody() }); ensure(isRejected(r.status), `status ${r.status}`)
    if (r.status !== 404) finding('PUT /api/measurements/[id]', `unknown id returns ${r.status} instead of 404`)
  })
  await check('DELETE /api/measurements/[id]', 'persist', 'delete removes it', async () => {
    ensure((await api('DELETE', `/api/measurements/${m2.id}`)).status === 200, 'delete failed'); ensure((await api('GET', `/api/measurements/${m2.id}`)).status === 404, 'still readable')
    ensure((await api('DELETE', `/api/measurements/${m1.id}`)).status === 200, 'delete m1')
  })
  await check('DELETE /api/measurements/[id]', 'missing', 'unknown id', async () => {
    const r = await api('DELETE', `/api/measurements/${UUID0}`); ensure(r.status < 600, 'no response')
    if (r.status === 200) finding('DELETE /api/measurements/[id]', 'deleting a nonexistent measurement returns 200 success instead of 404')
  })

  // ================================================================ dashboard stats (open) + customers delete rules
  await check('GET /api/dashboard-stats', 'admin', 'shape and customer count equals the database', async () => {
    const r = await api('GET', '/api/dashboard-stats', { token: admin }); ensure(r.status === 200 && typeof r.json === 'object', `status ${r.status}`)
    const dbCount = (await service.from('customers').select('*', { count: 'exact', head: true })).count
    const flat = JSON.stringify(r.json); ensure(flat.includes(String(dbCount)), `customer count ${dbCount} not found in the response`)
  })
  await check('GET /api/dashboard-stats', 'unauth', 'unauthenticated read accepted (OPEN, returns revenue and ledger totals)', async () => {
    const r = await api('GET', '/api/dashboard-stats'); ensure(r.status === 200, `status ${r.status}`)
    finding('GET /api/dashboard-stats', 'returns revenue, ledger and order figures without authentication (known open route; the page itself is admin-only in the UI)')
  })
  await check('DELETE /api/customers/[id]', 'invalid', 'customer with orders cannot be deleted -> 400 and it survives', async () => {
    const r = await api('DELETE', `/api/customers/${cust.id}`); ensure(r.status === 400, `status ${r.status}`)
    ensure((await api('GET', `/api/customers/${cust.id}`)).status === 200, 'customer vanished')
  })
  await check('DELETE /api/orders/[id]', 'persist', 'staff deletes an order: gone, items gone; unknown id handled', async () => {
    ensure((await api('DELETE', `/api/orders/${order.id}`, { token: staff })).status === 200, 'delete failed')
    ensure((await api('GET', `/api/orders/${order.id}`, { token: admin })).status === 404, 'still readable')
    const { count } = await service.from('order_items').select('*', { count: 'exact', head: true }).eq('order_id', order.id); ensure(count === 0, 'order_items orphaned')
    const l = (await api('GET', '/api/general-ledger?start_date=2099-03-01&end_date=2099-03-01&entry_type=order_payment', { token: admin })).json.filter((e: any) => e.order_id === order.id || e.particulars?.includes(order.order_number))
    if (l.length > 0) finding('DELETE /api/orders/[id]', 'deleting an order leaves its advance-payment ledger entry in the books (order_id becomes null; only sync-payments removes it)')
    const r = await api('DELETE', `/api/orders/${UUID0}`, { token: admin }); ensure(r.status < 600, 'no response')
    if (r.status === 200) finding('DELETE /api/orders/[id]', 'deleting a nonexistent order returns 200 success instead of 404')
  })
  await check('DELETE /api/customers/[id]', 'persist', 'customer with no orders deletes cleanly and its measurements go with it', async () => {
    const r = await api('POST', '/api/customers', { body: { name: tag('Disposable'), phone: phone() } }); const id = r.json.id; made.customers.add(id)
    ensure((await api('DELETE', `/api/customers/${id}`)).status === 200, 'delete failed'); ensure((await api('GET', `/api/customers/${id}`)).status === 404, 'still readable')
    const gone = await api('DELETE', `/api/customers/${UUID0}`); ensure(gone.status < 600, 'no response')
    if (gone.status === 200) finding('DELETE /api/customers/[id]', 'deleting a nonexistent customer returns 200 success instead of 404')
  })
  await check('DELETE /api/vendors/[id]', 'persist', 'vendor delete removes it and its vendor ledger; its categories survive', async () => {
    ensure((await api('DELETE', `/api/vendors/${vendor.id}`)).status === 200, 'delete failed'); ensure((await api('GET', `/api/vendors/${vendor.id}`)).status === 404, 'still readable')
    ensure((await service.from('vendor_ledger').select('*', { count: 'exact', head: true }).eq('vendor_id', vendor.id)).count === 0, 'vendor ledger orphaned')
    const r = await api('DELETE', `/api/vendors/${UUID0}`); ensure(r.status < 600, 'no response')
    if (r.status === 200) finding('DELETE /api/vendors/[id]', 'deleting a nonexistent vendor returns 200 success instead of 404')
  })
  await check('DELETE /api/vendor-categories/[id]', 'persist', 'unused category deletes (200) and is gone', async () => {
    ensure((await api('DELETE', `/api/vendor-categories/${cat.id}`)).status === 200, 'delete failed')
    ensure(!(await api('GET', '/api/vendor-categories?include_archived=1')).json.some((c: any) => c.id === cat.id), 'still listed')
  })
}

// ------------------------------------------------------------------ run + report
function cellFor(ep: string, cat: Cat, auth: Auth): string {
  if (auth === 'none' && cat === 'unauth') {
    const t = recs.filter((r) => r.ep === ep && r.tokenless)
    if (t.some((r) => !r.ok)) return 'FAIL'
    return t.length ? 'OPEN' : '–'
  }
  const rs = recs.filter((r) => r.ep === ep && r.cat === cat)
  if (!rs.length) {
    if ((cat === 'unauth' || cat === 'staff' || cat === 'norole') && auth === 'none') return 'N/A (open)'
    if (cat === 'staff' && auth === 'oauth-bearer') return '–'
    return '–'
  }
  if (rs.some((r) => !r.ok)) return 'FAIL'
  if (auth === 'none' && cat === 'unauth') return 'OPEN'
  return 'PASS'
}
function statusFor(e: Ep): string {
  const rs = recs.filter((r) => r.ep === e.key)
  if (e.key === 'POST /api/general-ledger/sync-payments') return rs.length && !rs.some((r) => !r.ok) ? 'PASS (rejections) / BLOCKED (admin path)' : 'FAIL'
  if (!rs.length) return 'NOT TESTED'
  if (rs.some((r) => !r.ok)) return 'FAIL'
  return 'PASS'
}
function writeReports() {
  mkdirSync('docs/qa', { recursive: true })
  const header = '| Endpoint | Module | Auth enforced by code | unauth | staff | admin | no-role row | invalid input | missing record | persistence / invariants | Status | Note |\n|---|---|---|---|---|---|---|---|---|---|---|---|'
  const authLabel: Record<Auth, string> = { none: 'NONE (open)', admin: 'admin only', 'admin|staff': 'admin or staff', 'oauth-bearer': 'OAuth bearer (ledger MCP)' }
  const rows = EP.map((e) => {
    const fnd = findings.filter((f) => f.ep === e.key).length
    const note = [e.note, fnd ? `${fnd} finding(s)` : ''].filter(Boolean).join('; ')
    return `| \`${e.key}\` | ${e.module} | ${authLabel[e.auth]} | ${cellFor(e.key, 'unauth', e.auth)} | ${cellFor(e.key, 'staff', e.auth)} | ${cellFor(e.key, 'admin', e.auth)} | ${cellFor(e.key, 'norole', e.auth)} | ${cellFor(e.key, 'invalid', e.auth)} | ${cellFor(e.key, 'missing', e.auth)} | ${cellFor(e.key, 'persist', e.auth)} | ${statusFor(e)} | ${note} |`
  })
  writeFileSync('docs/qa/api-matrix-table.md', `${header}\n${rows.join('\n')}\n`)
  writeFileSync('docs/qa/api-matrix-results.json', JSON.stringify({ base: BASE, checks: recs, findings }, null, 2))
}

async function run() {
  let before: Record<string, number> | undefined
  let fpBefore: Record<string, string> | undefined
  let mainError: Error | undefined
  try {
    await assertNoExisting2099()
    before = await counts(); fpBefore = await fingerprints()
    await main()
  } catch (e) { mainError = e as Error }
  finally {
    try { await sweep() } catch (e) { console.error('cleanup error:', (e as Error).message) }
  }
  let cleanOk = true
  if (before && fpBefore) {
    const after = await counts(); const fpAfter = await fingerprints()
    const diffCounts = COUNT_TABLES.filter((t) => before![t] !== after[t])
    const diffFp = Object.keys(fpBefore).filter((t) => fpBefore![t] !== fpAfter[t])
    cleanOk = !diffCounts.length && !diffFp.length
    recs.push({ ep: '(cleanup)', cat: 'persist', name: `row counts equal the baseline for ${COUNT_TABLES.length} tables`, ok: !diffCounts.length, detail: diffCounts.map((t) => `${t} ${before![t]}->${after[t]}`).join(', ') })
    recs.push({ ep: '(cleanup)', cat: 'persist', name: 'fingerprint of every pre-existing row is unchanged (no existing record modified)', ok: !diffFp.length, detail: diffFp.join(', ') })
    console.log('baseline counts :', JSON.stringify(before)); console.log('final counts    :', JSON.stringify(after))
  }
  if (mainError) recs.push({ ep: '(run)', cat: 'persist', name: 'script ran to completion', ok: false, detail: mainError.message })
  writeReports()
  for (const r of recs) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.ep}] ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`)
  console.log('')
  for (const f of findings) console.log(`FINDING  [${f.ep}] ${f.text}`)
  const failed = recs.filter((r) => !r.ok)
  console.log(`\napi matrix: ${recs.length - failed.length}/${recs.length} checks passed, ${findings.length} findings, cleanup ${cleanOk ? 'verified (baseline == final)' : 'MISMATCH'}`)
  process.exit(failed.length ? 1 : 0)
}
run()
