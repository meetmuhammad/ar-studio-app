/* eslint-disable @typescript-eslint/no-explicit-any */
// Run: npx tsx --env-file=.env.local scripts/qa/business-isolation.smoke.ts  (with `next dev -p 3100` running)
// ARAPP-CHANGE-4 HTTP smoke test. LOCAL ONLY: dev server on :3100, Supabase on :54321.
// Creates Techlink rows tagged "SMOKE-TL" and removes them at the end.
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/^http:\/\/127\.0\.0\.1:54321$/.test(SUPA)) throw new Error(`local only, got ${SUPA}`)
const BASE = 'http://localhost:3100'
const noSession = { persistSession: false, autoRefreshToken: false }
const service = createClient(SUPA, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: noSession })
let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`) }

async function token(email: string) {
  const c = createClient(SUPA, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: noSession })
  const { data, error } = await c.auth.signInWithPassword({ email, password: 'QaLocal-2026!' })
  if (error) throw error
  return data.session!.access_token
}
async function call(method: string, path: string, tok?: string, business?: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (tok) headers.Authorization = `Bearer ${tok}`
  if (business) headers['X-Business-Id'] = business
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json: any = null
  try { json = await r.json() } catch {}
  return { status: r.status, json }
}
async function atcLedgerMd5(atc: string) {
  const { data } = await service.from('general_ledger').select('id, balance, entry_date, created_at').eq('business_id', atc)
    .order('entry_date').order('created_at').order('id')
  return createHash('md5').update((data ?? []).map((r) => `${r.id}:${r.balance}`).join(',')).digest('hex')
}

async function main() {
  const { data: biz } = await service.from('businesses').select('id, slug')
  const ATC = biz!.find((b) => b.slug === 'atc')!.id
  const TL = biz!.find((b) => b.slug === 'techlink')!.id
  const before = await atcLedgerMd5(ATC)
  const admin = await token('qa-admin@arstudio.test')
  const staff = await token('qa-staff@arstudio.test')
  const { data: atcCustomer } = await service.from('customers').select('id, phone').eq('business_id', ATC).limit(1).single()
  const { data: atcVendor } = await service.from('vendors').select('id').eq('business_id', ATC).limit(1).single()
  const { data: atcOrder } = await service.from('orders').select('id, customer_id').eq('business_id', ATC).limit(1).single()
  const { count: atcCustomerCount } = await service.from('customers').select('*', { count: 'exact', head: true }).eq('business_id', ATC)

  try {
    // --- auth + memberships
    check('unauthenticated GET /api/customers -> 401', (await call('GET', '/api/customers')).status === 401)
    const sb = await call('GET', '/api/me/businesses', staff)
    check('staff /api/me/businesses lists ATC only, no combined view',
      sb.status === 200 && sb.json.businesses.length === 1 && sb.json.businesses[0].slug === 'atc' && sb.json.canViewAll === false,
      JSON.stringify(sb.json.businesses?.map((b: any) => b.slug)))
    const ab = await call('GET', '/api/me/businesses', admin)
    check('admin /api/me/businesses lists ATC + Techlink, combined view allowed',
      ab.status === 200 && ab.json.businesses.map((b: any) => b.slug).join(',') === 'atc,techlink' && ab.json.canViewAll === true && ab.json.defaultBusinessId === ATC)

    // --- staff cannot reach Techlink
    check('staff + X-Business-Id=Techlink -> 403', (await call('GET', '/api/customers', staff, TL)).status === 403)
    check('staff + X-Business-Id=all -> 403', (await call('GET', '/api/customers', staff, 'all')).status === 403)
    check('staff POST customer into Techlink -> 403', (await call('POST', '/api/customers', staff, TL, { name: 'SMOKE-TL x', phone: '03009990000' })).status === 403)
    const fb = await call('GET', '/api/customers?pageSize=100', staff)
    check('staff with NO header falls back to ATC (risky default)', fb.status === 200 && fb.json.pagination.total === atcCustomerCount, `total=${fb.json?.pagination?.total} atc=${atcCustomerCount}`)
    check('garbage X-Business-Id -> 403', (await call('GET', '/api/customers', admin, 'not-a-uuid')).status === 403)

    // --- Techlink starts empty
    const tlc = await call('GET', '/api/customers', admin, TL)
    check('Techlink customers start empty', tlc.status === 200 && tlc.json.pagination.total === 0)
    const tls = await call('GET', '/api/general-ledger/stats', admin, TL)
    check('Techlink ledger starts at 0', tls.status === 200 && tls.json.currentBalance === 0 && tls.json.entryCount === 0)
    const tlv = await call('GET', '/api/vendors', admin, TL)
    check('Techlink vendors start empty', tlv.status === 200 && Array.isArray(tlv.json) && tlv.json.length === 0)
    const cats = await call('GET', '/api/vendor-categories', admin, TL)
    check('Techlink sees the shared vendor categories (no setup)', cats.status === 200 && cats.json.length > 0, `${cats.json?.length} categories`)

    // --- Techlink writes, stamped from the header (body business_id ignored)
    const c1 = await call('POST', '/api/customers', admin, TL, { name: 'SMOKE-TL Customer', phone: atcCustomer!.phone, business_id: ATC })
    check('Techlink customer with an ATC phone is allowed (UNIQUE business_id, phone)', c1.status === 201, `status ${c1.status}`)
    check('body business_id is ignored; stamped Techlink', c1.json?.business_id === TL)
    const v1 = await call('POST', '/api/vendors', admin, TL, { name: 'SMOKE-TL Vendor', business_id: ATC })
    check('Techlink vendor created and stamped Techlink', v1.status === 201 && v1.json.business_id === TL)
    const o1 = await call('POST', '/api/orders', admin, TL, {
      customerId: c1.json.id, bookingDate: '2099-01-01', deliveryDate: '2099-01-10', totalAmount: 5000, advancePaid: 1000, paymentMethod: 'cash', orderItems: [],
    })
    check('Techlink order numbered TL-00001', o1.status === 201 && o1.json.order_number === 'TL-00001', `${o1.status} ${o1.json?.order_number ?? JSON.stringify(o1.json)}`)
    const p1 = await call('POST', '/api/payments', admin, TL, { order_id: o1.json.id, customer_id: c1.json.id, amount: 500, payment_method: 'cash', payment_date: '2099-01-02' })
    check('Techlink payment recorded', p1.status === 201 && p1.json.payment.business_id === TL)
    const g1 = await call('POST', '/api/general-ledger', admin, TL, { entry_date: '2099-01-03', particulars: 'SMOKE-TL vendor bill', credit: 300, entry_type: 'vendor_payment', vendor_id: v1.json.id })
    check('Techlink ledger entry with Techlink vendor', g1.status === 201 && g1.json.business_id === TL)
    const tll = await call('GET', '/api/general-ledger?page=1&pageSize=20', admin, TL)
    const bal = tll.json?.data?.map((e: any) => e.range_balance)
    check('Techlink ledger: 3 rows, own running balance (1000, 1500, 1200)', tll.status === 200 && tll.json.data.length === 3 && JSON.stringify(bal) === JSON.stringify([1200, 1500, 1000]), JSON.stringify(bal))
    const vl = await call('GET', `/api/vendor-ledger?vendor_id=${v1.json.id}`, admin, TL)
    check('Techlink vendor sub-ledger mirrors the bill', vl.status === 200 && vl.json.length === 1 && vl.json[0].business_id === TL)
    check('ATC stored balance series unchanged by Techlink writes', (await atcLedgerMd5(ATC)) === before)

    // --- cross-business ids -> 404
    check('GET ATC customer with Techlink header -> 404', (await call('GET', `/api/customers/${atcCustomer!.id}`, admin, TL)).status === 404)
    check('PATCH ATC customer with Techlink header -> 404', (await call('PATCH', `/api/customers/${atcCustomer!.id}`, admin, TL, { name: 'hijack' })).status === 404)
    check('GET ATC order with Techlink header -> 404', (await call('GET', `/api/orders/${atcOrder!.id}`, admin, TL)).status === 404)
    check('DELETE ATC order with Techlink header -> 404', (await call('DELETE', `/api/orders/${atcOrder!.id}`, admin, TL)).status === 404)
    check('GET ATC vendor with Techlink header -> 404', (await call('GET', `/api/vendors/${atcVendor!.id}`, admin, TL)).status === 404)
    const xo = await call('POST', '/api/orders', admin, TL, { customerId: atcOrder!.customer_id, bookingDate: '2099-01-01', deliveryDate: '2099-01-02', totalAmount: 100, advancePaid: 0, paymentMethod: 'cash', orderItems: [] })
    check('Techlink order for an ATC customer -> 404', xo.status === 404, `${xo.status} ${JSON.stringify(xo.json)}`)
    check('Techlink payment against an ATC order -> 404', (await call('POST', '/api/payments', admin, TL, { order_id: atcOrder!.id, customer_id: atcOrder!.customer_id, amount: 1 })).status === 404)
    check('Techlink ledger entry with an ATC vendor -> 404', (await call('POST', '/api/general-ledger', admin, TL, { entry_date: '2099-01-03', particulars: 'x', credit: 1, entry_type: 'vendor_payment', vendor_id: atcVendor!.id })).status === 404)
    check('GET Techlink customer with ATC header -> 404', (await call('GET', `/api/customers/${c1.json.id}`, admin, ATC)).status === 404)
    const atcList = await call('GET', '/api/customers?pageSize=100', admin, ATC)
    check('ATC customer list does not include the Techlink customer', atcList.status === 200 && !atcList.json.data.some((c: any) => c.id === c1.json.id))
    const atcOrders = await call('GET', '/api/orders?pageSize=100&sortBy=delivery_date&sortDir=asc', admin, ATC)
    check('ATC nearest-delivery orders exclude Techlink', atcOrders.status === 200 && !atcOrders.json.data.some((o: any) => o.id === o1.json.id))
    const atcAll = await call('GET', '/api/orders/all', admin, ATC)
    check('ATC /api/orders/all excludes Techlink', atcAll.status === 200 && !atcAll.json.data.some((o: any) => o.id === o1.json.id))

    // --- combined view: admin, read-only, no interleaved balance
    const all = await call('GET', '/api/general-ledger?page=1&pageSize=100', admin, 'all')
    check('combined ledger: rows from both businesses, balance & range_balance null, labelled',
      all.status === 200 && all.json.combined === true &&
      all.json.data.every((e: any) => e.balance === null && e.range_balance === null && e.business_name) &&
      new Set(all.json.data.map((e: any) => e.business_name)).size === 2)
    const allStats = await call('GET', '/api/general-ledger/stats', admin, 'all')
    check('combined stats: per-business breakdown', allStats.status === 200 && allStats.json.byBusiness?.length === 2, JSON.stringify(allStats.json?.byBusiness?.map((b: any) => [b.businessName, b.currentBalance])))
    check('combined dashboard-stats OK', (await call('GET', '/api/dashboard-stats', admin, 'all')).status === 200)
    const allPost = await call('POST', '/api/customers', admin, 'all', { name: 'SMOKE-TL no', phone: '03001112222' })
    check('combined view refuses writes (400 BUSINESS_REQUIRED)', allPost.status === 400 && allPost.json.code === 'BUSINESS_REQUIRED')
    check('vendor sub-ledger in combined view OK (single vendor book)', (await call('GET', `/api/vendor-ledger?vendor_id=${v1.json.id}`, admin, 'all')).status === 200)
    check('staff cannot use dashboard-stats (role still global)', (await call('GET', '/api/dashboard-stats', staff)).status === 403)
  } finally {
    // cleanup (service role, local only)
    const { data: gl } = await service.from('general_ledger').select('id').eq('business_id', TL)
    if (gl?.length) await service.from('general_ledger').delete().in('id', gl.map((r) => r.id))
    await service.from('payments').delete().eq('business_id', TL)
    await service.from('orders').delete().eq('business_id', TL)
    await service.from('vendors').delete().eq('business_id', TL)
    await service.from('customers').delete().eq('business_id', TL)
    const left = await Promise.all(['customers', 'vendors', 'orders', 'payments', 'general_ledger', 'vendor_ledger', 'measurements']
      .map(async (t) => (await service.from(t).select('*', { count: 'exact', head: true }).eq('business_id', TL)).count ?? 0))
    check('cleanup: Techlink empty again', left.every((n) => n === 0), JSON.stringify(left))
    check('ATC stored balance series unchanged at the end', (await atcLedgerMd5(ATC)) === before)
    console.log(`\n${pass} passed, ${fail} failed`)
    if (fail) process.exitCode = 1
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
