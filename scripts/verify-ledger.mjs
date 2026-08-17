// Independent verification of general_ledger.balance.
//
// Deliberately does NOT use a SQL window function: it pulls every row over
// PostgREST, sorts them in JS by (entry_date, created_at, id) -- the same
// order the API and the CSV export use -- and recomputes the running balance
// from debit and credit. If the database's own recalculation were wrong in the
// same way twice, a SQL-side check would agree with it; this will not.
//
// Env: none required against a running local stack -- credentials are read from
// `supabase status`. For a hosted project pass REF (or SUPABASE_URL) plus
// SERVICE_KEY. Prints aggregates only.
//
// Requiring a hosted service key used to mean only people holding
// production-adjacent secrets could verify the ledger at all. Local discovery
// makes `supabase db reset && npm run seed && node scripts/verify-ledger.mjs`
// work for anyone.

import { resolveSupabase } from './lib/local-supabase.mjs'

let URL_BASE, KEY
if (process.env.SERVICE_KEY && (process.env.REF || process.env.SUPABASE_URL)) {
  URL_BASE = process.env.SUPABASE_URL || `https://${process.env.REF}.supabase.co`
  KEY = process.env.SERVICE_KEY
} else {
  try {
    const c = resolveSupabase()
    URL_BASE = c.url
    KEY = c.key
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
const BASE = `${URL_BASE}/rest/v1/general_ledger`

const rows = []
const PAGE = 1000
for (let from = 0; ; from += PAGE) {
  const url = `${BASE}?select=id,entry_date,created_at,debit,credit,balance&order=id.asc`
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

const cmp = (a, b) =>
  a.entry_date < b.entry_date ? -1 :
  a.entry_date > b.entry_date ? 1 :
  a.created_at < b.created_at ? -1 :
  a.created_at > b.created_at ? 1 :
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

rows.sort(cmp)

// Money in fixed-point paisa to keep floating point out of the comparison.
const cents = (v) => Math.round(Number(v ?? 0) * 100)

let running = 0
let mismatches = 0
let brokenLinks = 0
let prevStored = null
const firstBad = []

for (const r of rows) {
  const delta = cents(r.debit) - cents(r.credit)
  running += delta
  const stored = cents(r.balance)
  if (stored !== running) {
    mismatches++
    if (firstBad.length < 5) {
      firstBad.push({ id: r.id, entry_date: r.entry_date, stored: stored / 100, expected: running / 100 })
    }
  }
  if (prevStored !== null && stored - prevStored !== delta) brokenLinks++
  prevStored = stored
}

const trueNet = rows.reduce((s, r) => s + cents(r.debit) - cents(r.credit), 0)

// A verifier that passes on an empty table is worse than no verifier: it
// reports success having checked nothing. Seed first.
if (rows.length === 0) {
  console.error('FAIL: no rows found — nothing was verified. Run `npm run seed` first.')
  process.exit(1)
}

console.log(JSON.stringify({
  source: 'independent JS recomputation over PostgREST',
  rows: rows.length,
  first_stored_balance: rows.length ? cents(rows[0].balance) / 100 : null,
  last_stored_balance: rows.length ? cents(rows[rows.length - 1].balance) / 100 : null,
  true_net: trueNet / 100,
  broken_links: brokenLinks,
  total_links: Math.max(0, rows.length - 1),
  mismatches,
  first_mismatches: firstBad,
}, null, 2))

// Every call except the deliberate BEFORE snapshot must be clean.
if (mismatches > 0 && process.env.ALLOW_MISMATCH !== '1') {
  console.error(`::error::${mismatches} stored balances disagree with the independent recomputation`)
  process.exit(1)
}
