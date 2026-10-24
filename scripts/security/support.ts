/**
 * Shared helpers for the security regression checks.
 *
 * These scripts create and delete users and, in api-auth.check.ts, ledger rows.
 * They therefore run against the local Docker database ONLY, and say so
 * before touching anything. Every record they create is synthetic
 * (`*@example.test`) and is removed in cleanup(), including after a failure.
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { importJWK, SignJWT } from 'jose'
import { assertWritableDb } from '../assert-writable-db'

assertWritableDb('security check')

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  throw new Error(`security checks create users and write rows: local database only, got ${url}`)
}

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const noSession = { persistSession: false, autoRefreshToken: false }

/** Service role: bypasses RLS and grants. Used only to arrange and to observe. */
export const service: SupabaseClient = createClient(url, serviceKey, { auth: noSession })

/** A client acting as a signed-in user, exactly as the browser would. */
export const asUser = (token: string): SupabaseClient =>
  createClient(url, anonKey, { auth: noSession, global: { headers: { Authorization: `Bearer ${token}` } } })

export interface TestUser {
  id: string
  email: string
  token: string
  refreshToken: string
}

const created: string[] = []
const PASSWORD = 'Synthetic-pass-123456'

/**
 * Make a synthetic auth user. `role: null` gives an auth user with NO row in
 * public.users, which is the state of a fresh signup.
 */
export async function makeUser(label: string, role: 'admin' | 'staff' | null): Promise<TestUser> {
  const email = `sec-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`

  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser(${label}): ${error?.message}`)
  created.push(data.user.id)

  if (role) {
    const { error: rowError } = await service.from('users').insert({ id: data.user.id, email, role })
    if (rowError) throw new Error(`users row (${label}): ${rowError.message}`)
  }

  const anon = createClient(url, anonKey, { auth: noSession })
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError || !session.session) throw new Error(`signIn(${label}): ${signInError?.message}`)

  return {
    id: data.user.id,
    email,
    token: session.session.access_token,
    refreshToken: session.session.refresh_token,
  }
}

/** The client id the ledger MCP checks register as allowed (the dev server is started with the same value). */
export const TEST_CLIENT_ID = (process.env.LEDGER_MCP_ALLOWED_CLIENT_IDS ?? 'local-test-client').split(',')[0].trim()

/**
 * An OAuth-style access token as the ledger MCP verifier requires it: signed by the
 * LOCAL Supabase auth service's own signing key, with iss, aud (the MCP endpoint),
 * client_id and the user as sub. The key is read from the local auth container (or
 * LEDGER_MCP_LOCAL_SIGNING_JWK) and never leaves this machine; the local-only guard
 * above already ran. Real OAuth tokens come from the OAuth flow instead (demo.ts).
 */
export async function mintOAuthToken(userId: string, o: { audience: string; clientId?: string; ttlSeconds?: number }): Promise<string> {
  const raw = process.env.LEDGER_MCP_LOCAL_SIGNING_JWK
    ?? JSON.parse(execFileSync('docker', ['exec', 'supabase_auth_ar-studio-app', 'printenv', 'GOTRUE_JWT_KEYS'], { encoding: 'utf8' }))[0]
  const { key_ops: _ops, ext: _ext, use: _use, ...jwk } = typeof raw === 'string' ? JSON.parse(raw) : raw
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ sub: userId, role: 'authenticated', client_id: o.clientId ?? TEST_CLIENT_ID })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' })
    .setIssuer(`${url}/auth/v1`).setAudience(o.audience).setIssuedAt(now).setExpirationTime(now + (o.ttlSeconds ?? 600))
    .sign(await importJWK(jwk, 'ES256'))
}

/**
 * A REAL access token from the local OAuth server: authorization-code flow with PKCE,
 * approving the consent on the user's behalf (what the consent page does in a browser).
 * Needs the OAuth server and the audience hook enabled on the local auth service.
 */
export async function realOAuthToken(userToken: string, clientId: string, redirectUri: string): Promise<string> {
  const b64 = (b: Buffer) => b.toString('base64url')
  const verifier = b64(randomBytes(32))
  const challenge = b64(createHash('sha256').update(verifier).digest())
  const hdr = { apikey: anonKey }
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state: 's' })
  const auth = await fetch(`${url}/auth/v1/oauth/authorize?${q}`, { headers: hdr, redirect: 'manual' })
  const authorizationId = new URL(auth.headers.get('location') ?? '', url).searchParams.get('authorization_id')
  if (!authorizationId) throw new Error(`oauth authorize: no authorization_id (HTTP ${auth.status})`)
  // Reading the details is what binds the authorization to this user (the consent page does it first).
  await fetch(`${url}/auth/v1/oauth/authorizations/${authorizationId}`, { headers: { ...hdr, Authorization: `Bearer ${userToken}` } })
  const consent = await fetch(`${url}/auth/v1/oauth/authorizations/${authorizationId}/consent`, {
    method: 'POST', headers: { ...hdr, Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
  })
  const code = new URL((await consent.json()).redirect_url ?? 'http://x').searchParams.get('code')
  if (!code) throw new Error(`oauth consent: no code (HTTP ${consent.status})`)
  const tok = await fetch(`${url}/auth/v1/oauth/token`, {
    method: 'POST', headers: { ...hdr, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier }),
  })
  const body = await tok.json()
  if (!body.access_token) throw new Error(`oauth token: ${body.error_description ?? body.error ?? tok.status}`)
  return body.access_token
}

export async function cleanup(): Promise<void> {
  for (const id of created.splice(0)) {
    await service.from('users').delete().eq('id', id)
    await service.auth.admin.deleteUser(id)
  }
}

export async function rowCount(table: string): Promise<number> {
  const { count, error } = await service.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`count(${table}): ${error.message}`)
  return count ?? 0
}

export async function roleOf(userId: string): Promise<string | null> {
  const { data } = await service.from('users').select('role').eq('id', userId).maybeSingle()
  return data?.role ?? null
}

/** Minimal runner: collects every failure instead of stopping at the first. */
const results: { name: string; ok: boolean; detail?: string }[] = []

export async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    results.push({ name, ok: true })
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message })
  }
}

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export async function finish(label: string): Promise<never> {
  await cleanup()
  const failed = results.filter((r) => !r.ok)
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`)
  console.log(`\n${label}: ${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
}
