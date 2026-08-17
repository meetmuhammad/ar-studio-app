#!/usr/bin/env node
/**
 * Independent verification of `public.orders_with_payment_status`.
 *
 * Sibling of scripts/verify-ledger.mjs and scripts/verify-vendor-ledger.mjs, and
 * deliberately the same shape: pull rows over PostgREST, recompute every derived
 * column here in JS, and exit non-zero on any disagreement.
 *
 * The point is independence. The view computes total_paid with a LEFT JOIN and a
 * GROUP BY; this script computes it by grouping payment rows in a Map. Neither
 * can quietly confirm the other's mistake, which is what a check that re-runs the
 * view's own SQL would do. The defects this repo has already shipped were all of
 * that kind -- a stored balance blessed by the same window function that wrote it,
 * an export whose row-count header counted rows returned rather than rows that
 * exist.
 *
 * Money is compared in integer paisa. `numeric` arrives from PostgREST as a
 * string, and 0.1 + 0.2 is not 0.3 in float.
 *
 * Usage:
 *   node scripts/verify-order-payment-view.mjs                # local, from .env.local
 *   SUPABASE_URL=... SUPABASE_KEY=... node scripts/verify-order-payment-view.mjs
 *
 *   # against a hosted project as a signed-in user rather than service_role:
 *   SUPABASE_URL=... SUPABASE_APIKEY=<anon key> SUPABASE_KEY=<user JWT> node ...
 *
 * PostgREST wants the project's publishable key in `apikey` and the caller's
 * token in `Authorization`. Those are the same string for service_role, which
 * is why the single-key form works locally -- but a user JWT in `apikey` is
 * rejected as an invalid API key. SUPABASE_APIKEY separates the two so this can
 * run against staging or a read-only production connection without a service
 * key ever leaving the server it belongs to.
 *
 * Read-only. Never writes. Safe to point at a production connection.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VIEW = 'orders_with_payment_status'

/** .env.local is the local-development fallback; explicit env always wins. */
function loadEnvFallback() {
  const file = resolve(ROOT, '.env.local')
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const fallback = loadEnvFallback()
const URL_ = process.env.SUPABASE_URL || fallback.NEXT_PUBLIC_SUPABASE_URL
const KEY =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  fallback.SUPABASE_SERVICE_ROLE_KEY ||
  fallback.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL_ || !KEY) {
  console.error('FATAL: set SUPABASE_URL and SUPABASE_KEY, or provide .env.local')
  process.exit(2)
}

/** apikey must be the project's publishable key; KEY may be a user JWT. */
const APIKEY =
  process.env.SUPABASE_APIKEY || fallback.NEXT_PUBLIC_SUPABASE_ANON_KEY || KEY

const headers = { apikey: APIKEY, Authorization: `Bearer ${KEY}` }

/** PostgREST caps a response at 1000 rows; page explicitly or silently truncate. */
async function fetchAll(path, select) {
  const rows = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const res = await fetch(`${URL_}/rest/v1/${path}?select=${select}`, {
      headers: { ...headers, Range: `${from}-${from + page - 1}`, Prefer: 'count=none' },
    })
    if (!res.ok) {
      const body = await res.text()
      const err = new Error(`${res.status} on ${path}: ${body.slice(0, 300)}`)
      err.status = res.status
      err.body = body
      throw err
    }
    const batch = await res.json()
    rows.push(...batch)
    if (batch.length === 0 || batch.length < page) break
  }
  return rows
}

/** numeric -> integer paisa. null/undefined are 0. */
const paisa = (v) => Math.round(Number(v ?? 0) * 100)

const failures = []
const fail = (msg) => failures.push(msg)

async function main() {
  // ---- does the view exist at all? ----
  let viewRows
  try {
    viewRows = await fetchAll(
      VIEW,
      'id,order_number,total_amount,advance_paid,initial_advance,additional_payments,total_paid,current_balance,payment_count'
    )
  } catch (err) {
    if (err.status === 404 || /PGRST205|does not exist|Could not find the table/i.test(err.body || '')) {
      console.error(`FAIL: relation public.${VIEW} does not exist.`)
      console.error('      The application reads this view; without it /api/orders cannot work.')
      console.error('      It must be created by a migration, not by hand.')
      process.exit(1)
    }
    throw err
  }

  const payments = await fetchAll('payments', 'order_id,amount')
  const orders = await fetchAll('orders', 'id,total_amount,advance_paid')

  // Independent recomputation: group payments in a Map, never with SQL.
  const paidByOrder = new Map()
  const countByOrder = new Map()
  for (const p of payments) {
    paidByOrder.set(p.order_id, (paidByOrder.get(p.order_id) ?? 0) + paisa(p.amount))
    countByOrder.set(p.order_id, (countByOrder.get(p.order_id) ?? 0) + 1)
  }

  const orderById = new Map(orders.map((o) => [o.id, o]))

  // ---- every order in `orders` must appear exactly once in the view ----
  if (viewRows.length !== orders.length) {
    fail(`view returns ${viewRows.length} rows for ${orders.length} orders — the join or grouping drops or duplicates rows`)
  }
  const seen = new Set()
  for (const r of viewRows) {
    if (seen.has(r.id)) fail(`order ${r.id} appears more than once in the view`)
    seen.add(r.id)
    if (!orderById.has(r.id)) fail(`view row ${r.id} has no matching order`)
  }

  // ---- per-order arithmetic ----
  let checked = 0
  const stats = { zeroAdvance: 0, noPayments: 0, multiPayments: 0 }

  for (const r of viewRows) {
    const base = orderById.get(r.id)
    if (!base) continue
    checked++

    const label = r.order_number || r.id

    const expectedAdvance = paisa(base.advance_paid)
    const expectedAdditional = paidByOrder.get(r.id) ?? 0
    const expectedTotalPaid = expectedAdvance + expectedAdditional
    const expectedCount = countByOrder.get(r.id) ?? 0
    // total_amount is NOT coalesced by the view, so a null total yields a null
    // balance. Mirror that exactly rather than "improving" it.
    const expectedBalance =
      base.total_amount === null || base.total_amount === undefined
        ? null
        : paisa(base.total_amount) - expectedTotalPaid

    if (paisa(r.initial_advance) !== expectedAdvance)
      fail(`${label}: initial_advance ${r.initial_advance} != advance_paid ${base.advance_paid ?? 0}`)

    if (paisa(r.additional_payments) !== expectedAdditional)
      fail(`${label}: additional_payments ${r.additional_payments} != SUM(payments) ${expectedAdditional / 100}`)

    if (paisa(r.total_paid) !== expectedTotalPaid)
      fail(`${label}: total_paid ${r.total_paid} != advance + payments ${expectedTotalPaid / 100}`)

    if (expectedBalance === null) {
      if (r.current_balance !== null)
        fail(`${label}: current_balance should be null when total_amount is null, got ${r.current_balance}`)
    } else if (paisa(r.current_balance) !== expectedBalance) {
      fail(`${label}: current_balance ${r.current_balance} != total_amount - total_paid ${expectedBalance / 100}`)
    }

    if (Number(r.payment_count) !== expectedCount)
      fail(`${label}: payment_count ${r.payment_count} != COUNT(payments) ${expectedCount}`)

    // The identity the whole retirement rests on.
    if (expectedBalance !== null && paisa(r.total_paid) + paisa(r.current_balance) !== paisa(r.total_amount))
      fail(`${label}: total_paid + current_balance != total_amount`)

    if (expectedAdvance === 0) stats.zeroAdvance++
    if (expectedCount === 0) stats.noPayments++
    if (expectedCount > 1) stats.multiPayments++
  }

  // ---- the edge cases the retired column got wrong ----
  const coverage = []
  if (stats.zeroAdvance === 0) coverage.push('zero advance')
  if (stats.noPayments === 0) coverage.push('no payments')
  if (stats.multiPayments === 0) coverage.push('multiple payments')

  console.log(`view rows          : ${viewRows.length}`)
  console.log(`orders             : ${orders.length}`)
  console.log(`payment rows       : ${payments.length}`)
  console.log(`orders checked     : ${checked}`)
  console.log(`  zero advance     : ${stats.zeroAdvance}`)
  console.log(`  no payments      : ${stats.noPayments}`)
  console.log(`  multiple payments: ${stats.multiPayments}`)
  console.log(`mismatches         : ${failures.length}`)

  if (coverage.length && process.env.REQUIRE_COVERAGE === '1') {
    console.error(`\nFAIL: dataset does not exercise: ${coverage.join(', ')}`)
    console.error('      Seed those cases before treating this run as proof.')
    process.exit(1)
  }
  if (coverage.length) {
    console.warn(`\nNOTE: dataset does not exercise: ${coverage.join(', ')} (set REQUIRE_COVERAGE=1 to make this fatal)`)
  }

  if (failures.length) {
    console.error('\nFAILURES:')
    for (const f of failures.slice(0, 40)) console.error(`  - ${f}`)
    if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`)
    process.exit(1)
  }

  console.log('\nOK: orders_with_payment_status matches an independent recomputation on every row.')
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(2)
})
