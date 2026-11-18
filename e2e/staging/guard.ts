import fs from 'node:fs'
import path from 'node:path'

/**
 * Safety guard for the opt-in staging suite (playwright.staging.config.ts).
 *
 * The suite signs in with real accounts and creates and deletes records, so it
 * may only ever run against the dummy/staging Supabase project:
 *   - NEXT_PUBLIC_SUPABASE_URL (environment, else .env.local) must have the host
 *     STAGING_HOST exactly;
 *   - nothing may mention the production project ref;
 *   - the app under test must itself be built against the staging project (its
 *     client bundle is checked), so a server started with other settings is refused;
 *   - the four credential variables must be set (they are never stored in the repo).
 */
export const STAGING_HOST = 'ohgqgkraybpvnfdbgmvl.supabase.co'
export const PRODUCTION_REF = 'drdnqsjjxmqiklwfadmk'
export const CREDENTIAL_VARS = ['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD', 'E2E_STAFF_EMAIL', 'E2E_STAFF_PASSWORD'] as const

export const stagingBaseUrl = () => process.env.E2E_BASE_URL ?? 'http://localhost:3100'

function configuredSupabaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL.trim()
  try {
    const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    return /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
  } catch {
    return ''
  }
}

/** Synchronous checks; throws with the reason. */
export function assertStagingTarget(): string {
  const url = configuredSupabaseUrl()
  if (url.includes(PRODUCTION_REF) || stagingBaseUrl().includes(PRODUCTION_REF)) {
    throw new Error('Refusing to run: the target is the PRODUCTION Supabase project.')
  }
  let host = ''
  try {
    host = new URL(url).host
  } catch {
    // reported below
  }
  if (host !== STAGING_HOST) {
    throw new Error(`Refusing to run: NEXT_PUBLIC_SUPABASE_URL host must be exactly ${STAGING_HOST}, got "${host || '(unset)'}".`)
  }
  const missing = CREDENTIAL_VARS.filter((v) => !process.env[v])
  if (missing.length) throw new Error(`Refusing to run: set ${missing.join(', ')} in the environment.`)
  return url
}

/** The Supabase hosts the running app's client bundle talks to. */
async function bundleSupabaseHosts(base: string): Promise<Set<string>> {
  const hosts = new Set<string>()
  const html = await (await fetch(`${base}/sign-in`)).text()
  const scripts = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1])
  for (const src of scripts) {
    const js = await (await fetch(`${base}${src}`)).text()
    for (const m of js.matchAll(/https:\/\/([a-z0-9]+\.supabase\.co)/g)) hosts.add(m[1])
    if (js.includes(PRODUCTION_REF)) hosts.add(`${PRODUCTION_REF}.supabase.co`)
  }
  return hosts
}

/** Playwright globalSetup for the staging config. */
export default async function globalSetup() {
  assertStagingTarget()
  const base = stagingBaseUrl()
  let hosts: Set<string>
  try {
    hosts = await bundleSupabaseHosts(base)
  } catch (e) {
    throw new Error(`Refusing to run: could not reach the app at ${base} to check its Supabase project (${(e as Error).message}).`)
  }
  if (hosts.size === 0) throw new Error(`Refusing to run: no Supabase URL found in the app served at ${base}.`)
  const other = [...hosts].filter((h) => h !== STAGING_HOST)
  if (other.length) throw new Error(`Refusing to run: the app at ${base} is built against ${other.join(', ')}, not ${STAGING_HOST}.`)
}
