/**
 * Token policy of the ledger MCP verifier: wrong audience, wrong issuer, expired,
 * unsigned/foreign-signed, missing or unlisted client, non-admin, and the one
 * accepted shape. Tokens are signed with a throwaway in-memory key; no database,
 * no network, no secrets.
 *
 *   npx tsx scripts/ledger-mcp/auth.check.ts
 */
import { exportJWK, generateKeyPair, createLocalJWKSet, SignJWT } from 'jose'
import { createLedgerVerifier } from '../../src/lib/ledger-mcp/auth'

const ISS = 'https://project.example/auth/v1'
const AUD = 'https://app.example/api/mcp'
const ADMIN = '00000000-0000-4000-8000-000000000001'
const STAFF = '00000000-0000-4000-8000-000000000002'
let failed = 0

async function main() {
  const good = await generateKeyPair('ES256')
  const other = await generateKeyPair('ES256')
  const jwk = { ...(await exportJWK(good.publicKey)), alg: 'ES256', kid: 'k1' }
  const verifier = createLedgerVerifier({
    keys: createLocalJWKSet({ keys: [jwk] }), issuer: ISS, audience: AUD, allowedClientIds: ['claude-client'],
    roleOf: async (id) => (id === ADMIN ? 'admin' : id === STAFF ? 'staff' : null),
  })
  const now = Math.floor(Date.now() / 1000)
  const mint = (o: { iss?: string; aud?: string | string[]; exp?: number; sub?: string; client_id?: string | null; key?: CryptoKey } = {}) => {
    const claims: Record<string, unknown> = { sub: o.sub ?? ADMIN }
    if (o.client_id !== null) claims.client_id = o.client_id ?? 'claude-client'
    return new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(o.iss ?? ISS).setAudience(o.aud ?? AUD).setIssuedAt(now - 10).setExpirationTime(o.exp ?? now + 600)
      .sign(o.key ?? good.privateKey)
  }
  const expect = async (name: string, token: Promise<string> | string, code: string | 'ok') => {
    let got = 'ok'
    try { await verifier.verifyAccessToken(await token) } catch (e) { got = (e as { code?: string }).code ?? 'error' }
    const pass = got === code
    if (!pass) failed++
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `  (expected ${code}, got ${got})`}`)
  }

  const IT = 'invalid_token', IS = 'insufficient_scope'
  await expect('accepts: right issuer, audience, client, admin, unexpired', mint(), 'ok')
  await expect('accepts audience given as an array that contains the endpoint', mint({ aud: ['authenticated', AUD] }), 'ok')
  await expect('wrong audience (a normal "authenticated" session token)', mint({ aud: 'authenticated' }), IT)
  await expect('wrong audience (another resource)', mint({ aud: 'https://other.example/api/mcp' }), IT)
  await expect('wrong issuer', mint({ iss: 'https://evil.example/auth/v1' }), IT)
  await expect('expired token', mint({ exp: now - 60 }), IT)
  await expect('signed by a different key', mint({ key: other.privateKey }), IT)
  await expect('unsigned (alg none) token', `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: ADMIN, iss: ISS, aud: AUD, client_id: 'claude-client', exp: now + 600 })).toString('base64url')}.`, IT)
  await expect('no client_id claim (not issued by the OAuth server)', mint({ client_id: null }), IT)
  await expect('client_id not on the allow-list', mint({ client_id: 'someone-else' }), IT)
  await expect('non-admin user (staff)', mint({ sub: STAFF }), IS)
  await expect('user with no role row', mint({ sub: '00000000-0000-4000-8000-000000000099' }), IS)
  await expect('garbage token', 'not-a-jwt', IT)

  console.log(failed ? `\nledger-mcp auth: ${failed} FAILED` : '\nledger-mcp auth: all checks passed')
  process.exit(failed ? 1 : 0)
}
main()
