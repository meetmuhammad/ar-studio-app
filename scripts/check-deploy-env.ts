/**
 * `prebuild` gate — the last moment a wrong database is still catchable.
 *
 * Every other guard in this repo protects scripts that a human chooses to run.
 * This one protects the deploy itself, which nobody chooses to run: Vercel
 * builds on every push, and whatever `NEXT_PUBLIC_SUPABASE_URL` is set to in
 * that environment gets compiled into the bundle and shipped.
 *
 *   VERCEL_ENV=production  ──► must resolve to PRODUCTION, nothing else
 *   VERCEL_ENV=preview     ──► must resolve to STAGING, never production
 *   VERCEL_ENV unset       ──► local or CI; block PRODUCTION, allow the rest
 *
 * The failure this exists to catch is a Supabase variable scoped to "All
 * Environments" in Vercel. That single setting silently points every preview
 * deployment of every branch at the live client database, and it looks exactly
 * like a working configuration until someone edits a customer record from a
 * feature branch. There is no runtime symptom, so it has to fail the build.
 *
 * Preview is held to STAGING rather than merely not-production for the same
 * reason resolveTarget() is default-deny: "not the one project I remembered to
 * name" is not the same as "safe".
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { resolveTarget, PRODUCTION_REF, STAGING_REF, type Target } from './lib/env-guard'

// Vercel injects its variables into the environment directly; these files only
// exist locally. dotenv does not overwrite what is already set, so loading them
// is a no-op on Vercel and the source of truth locally.
config({ path: resolve(__dirname, '../.env.local') })
config({ path: resolve(__dirname, '../.env') })

/** production | preview | development, set by Vercel. Absent everywhere else. */
const vercelEnv = process.env.VERCEL_ENV?.trim() || null
const branch = process.env.VERCEL_GIT_COMMIT_REF?.trim() || null

const info = resolveTarget(process.env.NEXT_PUBLIC_SUPABASE_URL)

function fail(reason: string, remedy: string[]): never {
  console.error('')
  console.error('  ✖ REFUSING TO BUILD')
  console.error('  ─────────────────────────────────────────────')
  console.error(`  vercel env     ${vercelEnv ?? '(not a Vercel build)'}`)
  console.error(`  git branch     ${branch ?? '(unknown)'}`)
  console.error(`  resolved       ${info.label}`)
  console.error('')
  console.error(`  ${reason}`)
  console.error('')
  for (const line of remedy) console.error(`    ${line}`)
  console.error('')
  process.exit(1)
}

function pass(): never {
  console.log('')
  console.log(`  ✔ build env OK — ${vercelEnv ?? 'local/CI'} → ${info.label}`)
  console.log('')
  process.exit(0)
}

/** How to repoint a Vercel environment, printed at the moment it is needed. */
function vercelRemedy(envName: string, expected: Target, expectedRef: string): string[] {
  return [
    `Vercel > ar-studio-app > Settings > Environment Variables`,
    `Set NEXT_PUBLIC_SUPABASE_URL for the "${envName}" environment ONLY to:`,
    `    https://${expectedRef}.supabase.co`,
    `and set the matching ${expected === 'PRODUCTION' ? 'production' : 'staging'} anon + service-role keys.`,
    ``,
    `If the variable is currently scoped to "All Environments", that is the bug.`,
    `Delete it and recreate it once per environment.`,
  ]
}

if (vercelEnv === 'production') {
  if (info.target !== 'PRODUCTION') {
    fail(
      `A PRODUCTION deployment is pointed at ${info.label}, not production.`,
      vercelRemedy('Production', 'PRODUCTION', PRODUCTION_REF)
    )
  }
  pass()
}

if (vercelEnv === 'preview') {
  if (info.target === 'PRODUCTION') {
    fail(
      'A PREVIEW deployment is pointed at the PRODUCTION database.\n' +
        '  Every preview of every branch would read and write the live client records.',
      vercelRemedy('Preview', 'STAGING', STAGING_REF)
    )
  }
  if (info.target !== 'STAGING') {
    fail(
      `A PREVIEW deployment must point at staging (${STAGING_REF}); it resolved to ${info.target}.`,
      vercelRemedy('Preview', 'STAGING', STAGING_REF)
    )
  }
  pass()
}

// Not a Vercel build: local `npm run build`, or CI, which builds against the
// fixed local-stack values. Only production is off limits, and only because a
// local production build bakes live credentials into .next/ on a laptop.
// The escape hatch is deliberately an explicit, per-command opt-in rather than
// something anyone would leave set in a shell profile.
if (info.target === 'PRODUCTION' && process.env.ALLOW_PRODUCTION_BUILD !== '1') {
  fail('A local build is pointed at the PRODUCTION database.', [
    'Point .env.local at your local stack (`npx supabase start`) and rebuild.',
    '',
    'If you genuinely need a production-configured build, set',
    'ALLOW_PRODUCTION_BUILD=1 for that one command.',
  ])
}

pass()
