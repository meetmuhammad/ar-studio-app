/**
 * Remove every disposable QA-E2E record through the ordinary admin API (real session, no service role).
 *   node e2e/cleanup.mjs
 * Local only. Safe to run any time; a run that finds nothing prints zeros.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = fs.readFileSync('.env.local', 'utf8')
const get = (k) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)[1].trim()
const url = get('NEXT_PUBLIC_SUPABASE_URL')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error(`local only, got ${url}`)
const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
const sb = createClient(url, get('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
const { data } = await sb.auth.signInWithPassword({ email: 'qa-admin@arstudio.test', password: 'QaLocal-2026!' })
const H = { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }
const J = async (m, p) => { const r = await fetch(base + p, { method: m, headers: H }); return { s: r.status, j: await r.json().catch(() => null) } }
const rows = (j) => (Array.isArray(j) ? j : j?.data ?? j?.payments ?? j?.measurements ?? j?.entries ?? j?.vendors ?? j?.customers ?? j?.orders ?? [])
const done = { ledger: 0, payments: 0, orders: 0, measurements: 0, vendors: 0, customers: 0 }
const tagged = (x) => /QA-E2E/.test(JSON.stringify([x.name, x.particulars, x.notes, x.description, x.customers?.name, x.customer?.name]))
// ledger first (order/vendor deletion does not remove mirrored ledger rows)
for (let page = 1; page <= 20; page++) {
  const r = await J('GET', `/api/general-ledger?search=QA-E2E&page=${page}&pageSize=100`)
  const list = rows(r.j).filter(tagged); if (!rows(r.j).length) break
  for (const e of list) if ((await J('DELETE', `/api/general-ledger/${e.id}`)).s < 300) done.ledger++
}
const orders = rows((await J('GET', '/api/orders/all')).j).filter(tagged)
for (const o of orders) {
  for (const p of rows((await J('GET', `/api/payments?order_id=${o.id}`)).j)) if ((await J('DELETE', `/api/payments/${p.id}`)).s < 300) done.payments++
  if ((await J('DELETE', `/api/orders/${o.id}`)).s < 300) done.orders++
}
for (const m of rows((await J('GET', '/api/measurements')).j).filter(tagged)) if ((await J('DELETE', `/api/measurements/${m.id}`)).s < 300) done.measurements++
for (const v of rows((await J('GET', '/api/vendors')).j).filter(tagged)) if ((await J('DELETE', `/api/vendors/${v.id}`)).s < 300) done.vendors++
for (const c of rows((await J('GET', '/api/customers?search=QA-E2E&pageSize=100')).j).filter(tagged)) if ((await J('DELETE', `/api/customers/${c.id}`)).s < 300) done.customers++
console.log('removed', JSON.stringify(done))
