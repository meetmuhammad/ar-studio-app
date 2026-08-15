/**
 * Environment guard — the thing that stands between a seed script and production.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  resolveTarget(url)                                                  │
 * │                                                                      │
 * │  host is 127.0.0.1 / localhost ──────────────────────────► LOCAL     │
 * │  ref === PRODUCTION_REF ─────────────────────────────────► PRODUCTION│
 * │  ref === STAGING_REF ────────────────────────────────────► STAGING   │
 * │  ref === $STAGING_PROJECT_REF ───────────────────────────► STAGING   │
 * │  anything else ──────────────────────────────────────────► UNKNOWN   │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * requireNonProduction() is DEFAULT-DENY. It permits LOCAL and STAGING only.
 * PRODUCTION and UNKNOWN both exit(1). An unrecognised project is treated as
 * dangerous rather than safe, because the failure we are guarding against is
 * "I thought .env pointed somewhere else."
 *
 * Why both refs are hardcoded: the guard has to work when the environment is
 * already wrong. Reading either ref from the environment would mean trusting
 * the same file we are trying to protect against. Neither ref is a secret —
 * NEXT_PUBLIC_SUPABASE_URL ships inside the browser bundle, so the production
 * ref is already public. Secrecy was never what protects the database; the anon
 * key's RLS policies and the service key's absence from the client are.
 *
 * $STAGING_PROJECT_REF survives as an override for ephemeral Supabase branch
 * projects, which get a fresh ref per branch and so cannot be hardcoded. It can
 * never bless production: the PRODUCTION_REF check runs before it.
 */

/** The production project. Never seeded, never reset, never written by a script. */
export const PRODUCTION_REF = 'drdnqsjjxmqiklwfadmk'

/** The staging project ("AR studio dummy database"). Synthetic data only. */
export const STAGING_REF = 'ohgqgkraybpvnfdbgmvl'

export type Target = 'LOCAL' | 'STAGING' | 'PRODUCTION' | 'UNKNOWN'

export interface TargetInfo {
  target: Target
  /** Supabase project ref, or null for a local instance. */
  ref: string | null
  url: string
  /** One-line human description, safe to print. */
  label: string
}

/**
 * Extract the project ref from a Supabase URL.
 * https://abcdefghijklmnop.supabase.co -> abcdefghijklmnop
 */
export function projectRefFromUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url)
    if (hostname === 'localhost' || hostname === '127.0.0.1') return null
    const [ref] = hostname.split('.')
    return ref || null
  } catch {
    return null
  }
}

export function resolveTarget(rawUrl: string | undefined): TargetInfo {
  const url = (rawUrl ?? '').trim()

  if (!url) {
    return { target: 'UNKNOWN', ref: null, url: '', label: 'NEXT_PUBLIC_SUPABASE_URL is not set' }
  }

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return { target: 'UNKNOWN', ref: null, url, label: `not a valid URL: ${url}` }
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { target: 'LOCAL', ref: null, url, label: `local Supabase (${url})` }
  }

  const ref = projectRefFromUrl(url)

  if (ref === PRODUCTION_REF) {
    return { target: 'PRODUCTION', ref, url, label: `PRODUCTION (${ref})` }
  }

  if (ref === STAGING_REF) {
    return { target: 'STAGING', ref, url, label: `staging (${ref})` }
  }

  const stagingRef = process.env.STAGING_PROJECT_REF?.trim()
  if (stagingRef && ref === stagingRef) {
    return { target: 'STAGING', ref, url, label: `staging branch project (${ref})` }
  }

  return {
    target: 'UNKNOWN',
    ref,
    url,
    label: ref
      ? `unrecognised project "${ref}" — not local, not production, not staging, and not $STAGING_PROJECT_REF`
      : `unrecognised host ${hostname}`,
  }
}

/**
 * Call at the top of any script that writes to a database.
 * Prints the resolved target, then exits(1) unless it is LOCAL or STAGING.
 */
export function requireNonProduction(scriptName: string): TargetInfo {
  const info = resolveTarget(process.env.NEXT_PUBLIC_SUPABASE_URL)

  console.log(`\n  ${scriptName}`)
  console.log(`  target: ${info.label}\n`)

  if (info.target === 'LOCAL' || info.target === 'STAGING') {
    return info
  }

  if (info.target === 'PRODUCTION') {
    console.error('  ✖ REFUSING TO RUN.')
    console.error('')
    console.error(`    NEXT_PUBLIC_SUPABASE_URL points at PRODUCTION (${PRODUCTION_REF}).`)
    console.error('    This script writes data. Production is not seeded, reset, or')
    console.error('    written to by scripts — ever.')
    console.error('')
    console.error('    Point .env.local at your local stack (`npx supabase start`) or at')
    console.error('    the staging project, then run this again.')
    console.error('')
    process.exit(1)
  }

  console.error('  ✖ REFUSING TO RUN.')
  console.error('')
  console.error(`    ${info.label}`)
  console.error('')
  console.error('    This guard is default-deny: an unrecognised target is treated as')
  console.error('    dangerous, not safe. If this really is your staging project, set')
  console.error('    STAGING_PROJECT_REF to its ref and run again.')
  console.error('')
  process.exit(1)
}
