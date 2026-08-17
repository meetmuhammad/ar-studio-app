/**
 * Discover credentials for the LOCAL Supabase stack.
 *
 * The integrity verifiers need a service-role key, because RLS would otherwise
 * hide the very rows they exist to check. Until now that meant a developer could
 * not run them at all without a hosted-environment secret, so the only people
 * who could verify the ledger were the ones holding production-adjacent keys.
 *
 * The local stack already prints its own keys. `supabase status --output json`
 * returns them for the running project, so nothing needs to be stored, pasted or
 * committed. These keys are the well-known local development ones; they grant
 * access to a throwaway Docker database and nothing else.
 *
 * Resolution order:
 *   1. explicit env (SUPABASE_URL / SUPABASE_KEY / SUPABASE_APIKEY, or REF)
 *   2. `supabase status --output json` from the running local stack
 *   3. .env.local in the repo root
 *
 * REFUSES to hand back credentials for a hosted project. This module is for
 * local use only, and a hosted URL arriving here means something has been
 * misconfigured -- exactly the mistake that would point a destructive seed at
 * real data.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Production must never be reachable through this helper. */
const PRODUCTION_REF = 'drdnqsjjxmqiklwfadmk'

export function isLocalUrl(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i.test(url || '')
}

export function assertNotProduction(url, context = 'this operation') {
  if (!url) return
  if (url.includes(PRODUCTION_REF)) {
    throw new Error(
      `REFUSING ${context}: the target resolves to the production project (${PRODUCTION_REF}).`
    )
  }
}

function readEnvFile() {
  const file = resolve(ROOT, '.env.local')
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

/** Ask the running local stack for its own keys. Returns null if not running. */
function readLocalStack() {
  try {
    const raw = execFileSync('npx', ['--no-install', 'supabase', 'status', '--output', 'json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
    })
    const j = JSON.parse(raw)
    if (!j.API_URL) return null
    return {
      url: j.API_URL,
      anonKey: j.ANON_KEY,
      serviceKey: j.SERVICE_ROLE_KEY,
      source: 'supabase status (local stack)',
    }
  } catch {
    return null
  }
}

/**
 * @param {{ requireLocal?: boolean }} [opts]
 *   requireLocal: throw unless the resolved URL is a loopback address. Use this
 *   for anything that WRITES, so a stray env var cannot redirect a seed at a
 *   hosted database.
 */
export function resolveSupabase(opts = {}) {
  const { requireLocal = false } = opts

  const envUrl =
    process.env.SUPABASE_URL ||
    (process.env.REF ? `https://${process.env.REF}.supabase.co` : undefined) ||
    process.env.NEXT_PUBLIC_SUPABASE_URL
  const envKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const envApiKey = process.env.SUPABASE_APIKEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (envUrl && envKey) {
    assertNotProduction(envUrl, 'to use explicit environment credentials')
    if (requireLocal && !isLocalUrl(envUrl)) {
      throw new Error(
        `REFUSING: ${envUrl} is not a local address, and this operation writes data.\n` +
          '       Point it at the local stack, or run the equivalent against staging deliberately.'
      )
    }
    return { url: envUrl, key: envKey, apiKey: envApiKey || envKey, source: 'environment' }
  }

  const local = readLocalStack()
  if (local?.serviceKey) {
    assertNotProduction(local.url, 'to use local stack credentials')
    return {
      url: local.url,
      key: local.serviceKey,
      apiKey: local.anonKey || local.serviceKey,
      anonKey: local.anonKey,
      source: local.source,
    }
  }

  const file = readEnvFile()
  const fileUrl = file.NEXT_PUBLIC_SUPABASE_URL
  const fileKey = file.SUPABASE_SERVICE_ROLE_KEY || file.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (fileUrl && fileKey) {
    assertNotProduction(fileUrl, 'to use .env.local credentials')
    if (requireLocal && !isLocalUrl(fileUrl)) {
      throw new Error(`REFUSING: .env.local points at ${fileUrl}, which is not local.`)
    }
    return {
      url: fileUrl,
      key: fileKey,
      apiKey: file.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileKey,
      anonKey: file.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      source: '.env.local',
    }
  }

  throw new Error(
    'Could not resolve Supabase credentials.\n' +
      '  Start the local stack:  npx supabase start\n' +
      '  or set SUPABASE_URL and SUPABASE_KEY (or REF= for a hosted project).'
  )
}
