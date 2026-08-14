/**
 * `npm run env:check` — answer "which database am I about to touch?"
 *
 * Read-only. Makes no network calls, writes nothing. Run it before anything
 * that migrates, seeds, or resets.
 *
 * Exit code is 0 for LOCAL and STAGING, 1 for PRODUCTION and UNKNOWN, so it can
 * be chained in front of a destructive command:
 *
 *   npm run env:check && npx supabase db reset
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { resolveTarget, PRODUCTION_REF } from './lib/env-guard'

config({ path: resolve(__dirname, '../.env.local') })
config({ path: resolve(__dirname, '../.env') })

const info = resolveTarget(process.env.NEXT_PUBLIC_SUPABASE_URL)

const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)

const banner: Record<string, string> = {
  LOCAL: '  ✔ LOCAL',
  STAGING: '  ✔ STAGING',
  PRODUCTION: '  ⛔ PRODUCTION',
  UNKNOWN: '  ✖ UNKNOWN',
}

console.log('')
console.log('  ─────────────────────────────────────────────')
console.log(banner[info.target])
console.log('  ─────────────────────────────────────────────')
console.log(`  url            ${info.url || '(not set)'}`)
console.log(`  project ref    ${info.ref ?? '(local)'}`)
console.log(`  anon key       ${hasAnon ? 'set' : 'MISSING'}`)
console.log(`  service key    ${hasService ? 'set' : 'MISSING'}`)
console.log('')

if (info.target === 'PRODUCTION') {
  console.log(`  This is the live client database (${PRODUCTION_REF}).`)
  console.log('  Seed and reset commands will refuse to run.')
  console.log('')
  process.exit(1)
}

if (info.target === 'UNKNOWN') {
  console.log(`  ${info.label}`)
  console.log('  Set STAGING_PROJECT_REF if this is your staging project.')
  console.log('')
  process.exit(1)
}

console.log('  Safe to seed and reset.')
console.log('')
