import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { OAuthError, OAuthErrorCode, type AuthInfo, type OAuthTokenVerifier } from '@modelcontextprotocol/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { authorizationServer, mcpResourceUrl, publicBase } from './config'

/**
 * Who is calling the ledger MCP server.
 *
 * The bearer token must be an OAuth access token that Supabase's OAuth 2.1
 * server issued to an allow-listed client for THIS endpoint. Checked here, every
 * request, with no fallback:
 *
 *   signature  against the issuer's published JWKS (asymmetric keys; no shared secret)
 *   iss        exactly the configured authorization server
 *   aud        contains this endpoint's URL (RFC 8707 audience binding). A normal web
 *              session token has aud "authenticated" and is refused, so an ordinary
 *              admin token cannot be replayed here.
 *   exp        in the future (jose enforces it)
 *   client_id  present and in LEDGER_MCP_ALLOWED_CLIENT_IDS
 *   role       the subject is an admin in public.users, read fresh from the database
 *
 * Supabase does not implement RFC 8707, so `aud` only carries the endpoint URL if
 * a Custom Access Token Hook sets it per client_id (docs/LEDGER-MCP.md). Without
 * that hook no real token passes: fail closed, by design.
 */

export interface VerifierPolicy {
  keys: JWTVerifyGetKey
  issuer: string
  audience: string
  allowedClientIds: string[]
  /** role of a user id, or null. Injected so the policy is testable. */
  roleOf: (userId: string) => Promise<string | null>
}

const invalid = (why: string) => new OAuthError(OAuthErrorCode.InvalidToken, why)

export function createLedgerVerifier(p: VerifierPolicy): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let claims
      try {
        // jose checks signature, exp, nbf, iss and aud (audience may be a string or array).
        ;({ payload: claims } = await jwtVerify(token, p.keys, { issuer: p.issuer, audience: p.audience, algorithms: ['ES256', 'RS256', 'EdDSA'] }))
      } catch {
        throw invalid('Invalid, expired, or wrong-audience access token')
      }

      const clientId = typeof claims.client_id === 'string' ? claims.client_id : ''
      if (!clientId || !p.allowedClientIds.includes(clientId)) throw invalid('Token was not issued to an allowed client')
      if (!claims.sub || claims.exp === undefined) throw invalid('Token is missing required claims')

      const role = await p.roleOf(claims.sub)
      if (role !== 'admin') throw new OAuthError(OAuthErrorCode.InsufficientScope, 'The ledger is available to admin users only')

      return { token, clientId, scopes: ['ledger'], expiresAt: claims.exp, resource: new URL(p.audience), extra: { userId: claims.sub, role } }
    },
  }
}

async function roleFromDatabase(userId: string): Promise<string | null> {
  const { data } = await createAdminSupabaseClient().from('users').select('role').eq('id', userId).single()
  return data?.role ?? null
}

/**
 * Production policy from the environment. Built per request because env is read at
 * request time. Keys always come from the issuer's remote JWKS; tests inject their
 * own through createLedgerVerifier.
 */
let remote: { url: string; keys: JWTVerifyGetKey } | undefined
function keySet(issuer: string): JWTVerifyGetKey {
  const url = `${issuer}/.well-known/jwks.json`
  if (remote?.url !== url) remote = { url, keys: createRemoteJWKSet(new URL(url)) }
  return remote.keys
}

export const ledgerMcpVerifier: OAuthTokenVerifier = {
  verifyAccessToken(token) {
    const base = publicBase()
    if (!base) throw invalid('Server is not configured')
    const issuer = authorizationServer()
    const allowedClientIds = (process.env.LEDGER_MCP_ALLOWED_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    return createLedgerVerifier({ keys: keySet(issuer), issuer, audience: mcpResourceUrl(base).href, allowedClientIds, roleOf: roleFromDatabase }).verifyAccessToken(token)
  },
}

/** The user an authenticated request belongs to, from the verified AuthInfo. */
export function userIdOf(authInfo: AuthInfo | undefined): string {
  const id = authInfo?.extra?.userId
  if (typeof id !== 'string' || !id) throw new Error('No authenticated user on this request')
  return id
}
