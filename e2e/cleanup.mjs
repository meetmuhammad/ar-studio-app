/**
 * Removes every disposable test record left behind by an interrupted run.
 *
 *   node e2e/cleanup.mjs                 local suite: names "QA-E2E…", LOCAL Supabase only
 *   node e2e/cleanup.mjs --staging       staging suite: names "E2E-STG…", dummy project only
 *   add --dry-run to list what would be removed without removing it
 *
 * It signs in as an admin with the ordinary (anon key + password) session, so
 * RLS and the admin-only database functions apply, exactly as for the app. No
 * service role and no /api routes are used. Only rows whose name (or ledger
 * particulars / notes) contain the prefix are touched; everything an order owns
 * goes through delete_order, and ledger rows through delete_ledger_entry /
 * delete_vendor_bill, so running balances stay correct.
 *
 * Staging mode reads E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD from the environment
 * and refuses to run unless NEXT_PUBLIC_SUPABASE_URL's host is exactly the dummy
 * project. Neither mode prints keys, tokens or passwords.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const STAGING_HOST = 'ohgqgkraybpvnfdbgmvl.supabase.co'
const PRODUCTION_REF = 'drdnqsjjxmqiklwfadmk'
const staging = process.argv.includes('--staging')
const dryRun = process.argv.includes('--dry-run')

const fileEnv = (() => {
  try {
    return fs.readFileSync('.env.local', 'utf8')
  } catch {
    return ''
  }
})()
const env = (k) =>
  process.env[k]?.trim() || new RegExp(`^${k}=(.*)$`, 'm').exec(fileEnv)?.[1]?.trim().replace(/^["']|["']$/g, '') || ''

const url = env('NEXT_PUBLIC_SUPABASE_URL')
const anon = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
if (!url || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
if (url.includes(PRODUCTION_REF)) throw new Error('Refusing to run: this is the PRODUCTION project')

let prefix, email, password
if (staging) {
  if (new URL(url).host !== STAGING_HOST) throw new Error(`Refusing to run: staging mode needs ${STAGING_HOST}, got ${new URL(url).host}`)
  prefix = 'E2E-STG'
  email = process.env.E2E_ADMIN_EMAIL
  password = process.env.E2E_ADMIN_PASSWORD
  if (!email || !password) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD')
} else {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error(`Refusing to run: local mode needs the local stack, got ${new URL(url).host}`)
  prefix = 'QA-E2E'
  email = 'qa-admin@arstudio.test' // local-only QA account (e2e/helpers.ts)
  password = 'QaLocal-2026!'
}

const sb = createClient(url, anon, { auth: { persistSession: false } })
const { error: signInError } = await sb.auth.signInWithPassword({ email, password })
if (signInError) throw new Error(`admin sign-in failed: ${signInError.message}`)

const like = `%${prefix}%`
const done = { ledger: 0, bills: 0, orders: 0, measurements: 0, vendors: 0, customers: 0, categories: 0 }
const failures = []
const run = async (kind, label, fn) => {
  if (dryRun) {
    console.log(`would remove ${kind}: ${label}`)
    done[kind]++
    return
  }
  const { error } = await fn()
  if (error) failures.push(`${kind} ${label}: ${error.message}`)
  else done[kind]++
}
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
  return data
}

const businessIds = must(await sb.from('user_businesses').select('business_id'), 'memberships').map((r) => r.business_id)

// 1. Orders of test customers (delete_order removes items, payments and their ledger rows).
const orders = must(
  await sb.from('orders').select('id, order_number, customers!inner(name)').in('business_id', businessIds).ilike('customers.name', like),
  'orders'
)
for (const o of orders) await run('orders', o.order_number, () => sb.rpc('delete_order', { p_order_id: o.id }))

// 2. Vendors: their bills and ledger lines first, then the vendor (its tags go with it).
const vendors = must(await sb.from('vendors').select('id, name').in('business_id', businessIds).ilike('name', like), 'vendors')
for (const v of vendors) {
  const ledger = must(await sb.rpc('vendor_ledger_entries', { p_vendor_id: v.id }), `vendor ledger of ${v.name}`)
  for (const r of ledger.rows) {
    if (r.kind === 'bill') await run('bills', r.particulars, () => sb.rpc('delete_vendor_bill', { p_bill_id: r.id }))
    else if (r.kind === 'ledger') await run('ledger', r.particulars, () => sb.rpc('delete_ledger_entry', { p_entry_id: r.general_ledger_id }))
  }
  if (!dryRun) await sb.from('vendor_tags').delete().eq('vendor_id', v.id)
  await run('vendors', v.name, () => sb.from('vendors').delete().eq('id', v.id))
}

// 3. Manual ledger entries whose particulars or notes carry the prefix.
for (const id of businessIds) {
  const page = must(
    await sb.rpc('ledger_entries', {
      p_business_ids: [id], p_from: null, p_to: null, p_search: prefix, p_entry_type: null,
      p_vendor_id: null, p_limit: null, p_offset: 0, p_vendor_category_id: null,
    }),
    'ledger entries'
  )
  for (const e of page.rows) {
    if (e.entry_type === 'order_payment' || e.order_id) continue // order-owned: removed with its order
    if (!`${e.particulars} ${e.notes ?? ''}`.includes(prefix)) continue
    await run('ledger', e.particulars, () => sb.rpc('delete_ledger_entry', { p_entry_id: e.id }))
  }
}

// 4. Measurements (by set name, or of a test customer), then the customers.
const customers = must(await sb.from('customers').select('id, name').in('business_id', businessIds).ilike('name', like), 'customers')
const customerIds = customers.map((c) => c.id)
const measurements = must(
  await sb
    .from('measurements')
    .select('id, name')
    .in('business_id', businessIds)
    .or(`name.ilike.${like}${customerIds.length ? `,customer_id.in.(${customerIds.join(',')})` : ''}`),
  'measurements'
)
for (const m of measurements) await run('measurements', m.name, () => sb.from('measurements').delete().eq('id', m.id))
for (const c of customers) await run('customers', c.name, () => sb.from('customers').delete().eq('id', c.id))

// 5. Vendor categories created by tests (shared list; only prefixed names).
const categories = must(await sb.from('vendor_categories').select('id, name').ilike('name', like), 'categories')
for (const c of categories) await run('categories', c.name, () => sb.from('vendor_categories').delete().eq('id', c.id))

await sb.auth.signOut({ scope: 'local' })
console.log(`${dryRun ? 'would remove' : 'removed'} (${staging ? 'staging' : 'local'}, prefix ${prefix})`, JSON.stringify(done))
if (failures.length) {
  console.error(`${failures.length} could not be removed:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
