#!/usr/bin/env node
/**
 * Security assertions for a database built from migrations.
 *
 * Run after `supabase db reset && npm run seed`. Exits non-zero on any failure.
 *
 * These check the boundary as a client actually meets it -- over PostgREST with
 * a real key -- rather than reading pg_policies and trusting that the policy
 * says what it means. Both of the leaks found in this codebase looked correct at
 * the definition level: a CDN header that let an admin's response be replayed to
 * anonymous callers, and a view whose default `security_invoker = off` quietly
 * bypassed RLS on the tables underneath it. Only asking as the untrusted caller
 * finds those.
 *
 * Roles exercised:
 *   anon           the publishable key that ships inside the browser bundle
 *   authenticated  a signed-in user with no admin role
 *   service_role   the server-side key the API routes use
 */

import { resolveSupabase } from './lib/local-supabase.mjs'

let creds
try {
  creds = resolveSupabase()
} catch (err) {
  console.error(err.message)
  process.exit(1)
}

const { url: URL_, key: SERVICE_KEY, anonKey } = creds
const ANON_KEY = process.env.SUPABASE_ANON_KEY || anonKey
if (!ANON_KEY) {
  console.error('FATAL: no anon key available. Start the local stack, or set SUPABASE_ANON_KEY.')
  process.exit(1)
}

/**
 * Financial aggregate / mutation RPCs, each with arguments matching its REAL
 * signature.
 *
 * Arity matters. PostgREST resolves an overload by the argument names supplied,
 * so calling a 3-arg function with {} returns 404 PGRST202 -- "no such function"
 * -- which looks exactly like a refusal but proves nothing. A permission check
 * that cannot tell "denied" from "I called it wrong" is not a check. These args
 * are deliberately harmless values; the call must be refused before it runs.
 */
const FINANCIAL_RPCS = [
  ['rebuild_general_ledger_balances', {}],
  ['recalculate_ledger_balances_from', {
    p_entry_date: '2000-01-01',
    p_created_at: '2000-01-01T00:00:00Z',
    p_id: '00000000-0000-0000-0000-000000000000',
  }],
  ['rebuild_vendor_ledger_balances', {}],
  ['recalculate_vendor_ledger_balances_from', {
    p_vendor_id: '00000000-0000-0000-0000-000000000000',
    p_entry_date: '2000-01-01',
    p_created_at: '2000-01-01T00:00:00Z',
    p_id: '00000000-0000-0000-0000-000000000000',
  }],
  ['dashboard_stats', { p_start: '2000-01-01', p_end: '2000-01-02' }],
  // Legacy whole-ledger rewriters from the captured baseline. These were
  // executable by any signed-in user and rewrote every balance; dropped by
  // 20260817200000. Listed so a future baseline recapture that reintroduces
  // them fails this check instead of sailing through.
  ['recalculate_general_ledger_balances', {}],
  ['recalculate_all_balances', {}],
]

const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const get = async (path, key, bearer = key) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${bearer}` },
  })
  let body = null
  try { body = await res.json() } catch {}
  return { status: res.status, body }
}

const rpc = async (fn, key, bearer = key, args = {}) => {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  let body = null
  try { body = await res.json() } catch {}
  return { status: res.status, body }
}

const rows = (r) => (Array.isArray(r.body) ? r.body.length : null)

const skipped = []
/**
 * An absent function is NOT a passed boundary. Reporting it as PASS lets a
 * migration set that never created the function look identically as safe as one
 * that created it and locked it down -- and it hid a real hole here once.
 */
const reportRpc = (role, fn, r) => {
  const absent = r.status === 404 || r.body?.code === 'PGRST202'
  const denied = r.body?.code === '42501' || r.status === 401 || r.status === 403
  if (absent) {
    skipped.push(`${role}: ${fn}() — not present in this migration set`)
    console.log(`  SKIP  ${role} cannot execute ${fn}()  — function not present`)
    return
  }
  check(`${role} cannot execute ${fn}()`, denied, `status ${r.status} ${r.body?.code ?? ''}`)
}

/** Refused = no data came back, whether by 4xx or by an RLS-filtered empty set. */
const refused = (r) => r.status >= 400 || rows(r) === 0

async function makeAuthedUser() {
  const email = `baseline-check-${Date.now()}@example.test`
  const password = 'baseline-check-passphrase-1'
  const create = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!create.ok) return null
  const signIn = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!signIn.ok) return null
  const j = await signIn.json()
  return { token: j.access_token, id: j.user?.id }
}

async function main() {
  console.log(`Target: ${URL_}  (credentials from ${creds.source})\n`)

  // Prove there is data to hide. A pass against an empty database means nothing.
  const seeded = await get('measurements?select=id', SERVICE_KEY)
  const seededOrders = await get('orders?select=id', SERVICE_KEY)
  if (!rows(seeded) || !rows(seededOrders)) {
    console.error('FATAL: database looks empty. Run `npm run seed` first, or these checks are vacuous.')
    process.exit(1)
  }
  console.log(`Preconditions: ${rows(seeded)} measurements, ${rows(seededOrders)} orders visible to service_role.\n`)

  // ---------------- anon ----------------
  console.log('anon (the key inside the browser bundle)')
  const aMeas = await get('measurements?select=id,chest', ANON_KEY)
  check('cannot read measurements', refused(aMeas), `status ${aMeas.status}, ${rows(aMeas)} rows`)

  const aView = await get('orders_with_payment_status?select=id,total_paid,current_balance', ANON_KEY)
  check('cannot bypass RLS via orders_with_payment_status', refused(aView), `status ${aView.status}, ${rows(aView)} rows`)

  const aOrders = await get('orders?select=id,total_amount', ANON_KEY)
  check('cannot read orders', refused(aOrders), `status ${aOrders.status}, ${rows(aOrders)} rows`)

  const aLedger = await get('general_ledger?select=id,balance', ANON_KEY)
  check('cannot read general_ledger', refused(aLedger), `status ${aLedger.status}, ${rows(aLedger)} rows`)

  for (const [fn, args] of FINANCIAL_RPCS) {
    const r = await rpc(fn, ANON_KEY, ANON_KEY, args)
    // 404/PGRST202 means the function is absent from this migration set, which
    // is not a security failure. 42501 is the refusal we want. A 200 is a leak.
    reportRpc('anon', fn, r)
  }

  // ---------------- authenticated, non-admin ----------------
  console.log('\nauthenticated, no admin role')
  const user = await makeAuthedUser()
  if (!user?.token) {
    check('could create a signed-in test user', false, 'auth admin API unavailable')
  } else {
    const uView = await get('orders_with_payment_status?select=id,total_paid', ANON_KEY, user.token)
    // RLS on this schema gates most tables on auth.role() = 'authenticated', so a
    // signed-in user legitimately sees rows. What must NOT happen is reaching the
    // admin-only financial aggregates.
    console.log(`        (context: view returns ${rows(uView)} rows to a signed-in user by table RLS)`)

    for (const [fn, args] of FINANCIAL_RPCS) {
      const r = await rpc(fn, ANON_KEY, user.token, args)
      reportRpc('authenticated', fn, r)
    }
  }

  // ---------------- service_role ----------------
  console.log('\nservice_role (what the API routes use)')
  for (const rel of ['orders', 'payments', 'measurements', 'general_ledger', 'vendor_ledger', 'orders_with_payment_status']) {
    const r = await get(`${rel}?select=id&limit=1`, SERVICE_KEY)
    check(`can read ${rel}`, r.status === 200, `status ${r.status}`)
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed, ${skipped.length} skipped`)
  for (const s of skipped) console.log(`  skipped — ${s}`)
  if (failed.length) {
    console.error('\nFAILURES:')
    for (const f of failed) console.error(`  - ${f.name} (${f.detail})`)
    process.exit(1)
  }
  console.log('\nOK: role boundaries hold against a database built from migrations.')
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(2)
})
