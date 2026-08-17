// Independent verification of vendor_ledger.balance.
//
// Deliberately does NOT use a SQL window function: it pulls every row over
// PostgREST, groups them by vendor_id, sorts each vendor's rows in JS by
// (entry_date, created_at, id) -- the same total order the database now uses --
// and recomputes that vendor's running balance from debit and credit in
// integer paisa. Each vendor's chain starts at zero and is completely
// independent of every other vendor's.
//
// If the database's own recalculation were wrong in the same way twice, a
// SQL-side check would agree with it; this will not.
//
// Env: SERVICE_KEY, plus either REF (a Supabase project ref) or SUPABASE_URL
// (any base URL, e.g. http://127.0.0.1:54321 for the local stack).
// Optional: ALLOW_MISMATCH=1 to report without failing.
// Prints aggregates only, never a secret.

import { resolveSupabase } from './lib/local-supabase.mjs'

const REF = process.env.REF
let URL_BASE = process.env.SUPABASE_URL || (REF ? `https://${REF}.supabase.co` : null)
let KEY = process.env.SERVICE_KEY
// Fall back to the running local stack so this needs no hosted secret locally.
if (!URL_BASE || !KEY) {
  try {
    const c = resolveSupabase()
    URL_BASE = URL_BASE || c.url
    KEY = KEY || c.key
  } catch { /* fall through to the error below */ }
}
if (!URL_BASE || !KEY) {
  console.error('SERVICE_KEY and one of REF / SUPABASE_URL are required (or start the local stack)')
  process.exit(1)
}
const BASE = `${URL_BASE}/rest/v1/vendor_ledger`

const rows = []
const PAGE = 1000
for (let from = 0; ; from += PAGE) {
  const url = `${BASE}?select=id,vendor_id,entry_date,created_at,debit,credit,balance&order=id.asc`
  const res = await fetch(url, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Range: `${from}-${from + PAGE - 1}`,
      'Range-Unit': 'items',
    },
  })
  if (!res.ok) {
    console.error('fetch failed', res.status, (await res.text()).slice(0, 300))
    process.exit(1)
  }
  const page = await res.json()
  rows.push(...page)
  if (page.length < PAGE) break
}

// Total order WITHIN a vendor.
const cmp = (a, b) =>
  a.entry_date < b.entry_date ? -1 :
  a.entry_date > b.entry_date ? 1 :
  a.created_at < b.created_at ? -1 :
  a.created_at > b.created_at ? 1 :
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

// Money in fixed-point paisa to keep floating point out of the comparison.
const paisa = (v) => Math.round(Number(v ?? 0) * 100)

const byVendor = new Map()
for (const r of rows) {
  if (!byVendor.has(r.vendor_id)) byVendor.set(r.vendor_id, [])
  byVendor.get(r.vendor_id).push(r)
}

let mismatches = 0
let brokenLinks = 0
const firstBad = []
const vendors = []

for (const [vendorId, vrows] of [...byVendor.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  vrows.sort(cmp)
  let running = 0
  let prevStored = null
  for (const r of vrows) {
    const delta = paisa(r.debit) - paisa(r.credit)
    running += delta
    const stored = paisa(r.balance)
    if (stored !== running) {
      mismatches++
      if (firstBad.length < 5) {
        firstBad.push({
          vendor_id: vendorId,
          id: r.id,
          entry_date: r.entry_date,
          stored: stored / 100,
          expected: running / 100,
        })
      }
    }
    if (prevStored !== null && stored - prevStored !== delta) brokenLinks++
    prevStored = stored
  }
  vendors.push({
    vendor_id: vendorId,
    rows: vrows.length,
    first_stored_balance: paisa(vrows[0].balance) / 100,
    final_stored_balance: paisa(vrows[vrows.length - 1].balance) / 100,
    independently_computed_final_balance: running / 100,
    net_movement: vrows.reduce((s, r) => s + paisa(r.debit) - paisa(r.credit), 0) / 100,
  })
}

// A verifier that passes on an empty table is worse than no verifier: it
// reports success having checked nothing. Seed first.
if (rows.length === 0) {
  console.error('FAIL: no rows found — nothing was verified. Run `npm run seed` first.')
  process.exit(1)
}

console.log(JSON.stringify({
  source: 'independent JS recomputation over PostgREST, per vendor, integer paisa',
  rows: rows.length,
  vendors: vendors.length,
  broken_links: brokenLinks,
  total_links: Math.max(0, rows.length - vendors.length),
  mismatches,
  first_mismatches: firstBad,
  per_vendor: vendors,
  // Aggregated across vendors so a single headline number exists: the sum of
  // every vendor's final balance, and the sum of every vendor's first balance.
  sum_of_first_stored_balances: vendors.reduce((s, v) => s + v.first_stored_balance, 0),
  sum_of_final_stored_balances: vendors.reduce((s, v) => s + v.final_stored_balance, 0),
  sum_of_independently_computed_final_balances:
    vendors.reduce((s, v) => s + v.independently_computed_final_balance, 0),
}, null, 2))

// Every call except the deliberate BEFORE snapshot must be clean.
if (mismatches > 0 && process.env.ALLOW_MISMATCH !== '1') {
  console.error(`::error::${mismatches} stored vendor_ledger balances disagree with the independent recomputation`)
  process.exit(1)
}
