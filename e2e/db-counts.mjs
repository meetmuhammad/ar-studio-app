/**
 * Row counts of the tables the tests touch, from the LOCAL database (read-only).
 *   node e2e/db-counts.mjs baseline   -> save qa-artifacts/db-baseline.json
 *   node e2e/db-counts.mjs check      -> compare with the baseline, exit 1 on any difference
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = fs.readFileSync('.env.local', 'utf8'); const get = (k) => new RegExp(`^${k}=(.*)$`, 'm').exec(env)[1].trim()
const url = get('NEXT_PUBLIC_SUPABASE_URL')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error(`local only, got ${url}`)
const sb = createClient(url, get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const tables = ['customers', 'orders', 'order_items', 'measurements', 'payments', 'general_ledger', 'vendors', 'vendor_ledger', 'vendor_categories', 'vendor_tags', 'users']
const now = {}
for (const t of tables) { const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true }); now[t] = error ? `err:${error.code}` : count }
const f = 'qa-artifacts/db-baseline.json'
if (process.argv[2] === 'baseline') { fs.mkdirSync('qa-artifacts', { recursive: true }); fs.writeFileSync(f, JSON.stringify(now, null, 1)); console.log('TARGET DATABASE: LOCAL', url, '\nbaseline saved', JSON.stringify(now)) }
else {
  const base = JSON.parse(fs.readFileSync(f, 'utf8')); const diff = tables.filter((t) => base[t] !== now[t])
  console.log('TARGET DATABASE: LOCAL', url); console.log(diff.length ? `DIFFERENCES: ${diff.map((t) => `${t} ${base[t]} -> ${now[t]}`).join(', ')}` : `all ${tables.length} tables equal the baseline`, JSON.stringify(now))
  process.exit(diff.length ? 1 : 0)
}
