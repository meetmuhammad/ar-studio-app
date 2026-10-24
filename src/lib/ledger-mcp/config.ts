/**
 * Deployment settings for the ledger MCP endpoint, read from the environment at
 * request time. Names only are documented here; values never live in the repo
 * (see .env.ledger-mcp.template).
 *
 *   LEDGER_MCP_ENABLED          "true" turns the endpoint on. Anything else, or unset, and both
 *                               routes answer 404, so merging this code exposes nothing.
 *   LEDGER_MCP_PUBLIC_URL       The public https origin clients reach this app at, e.g.
 *                               https://app.example.com . Used as the OAuth "resource" and
 *                               in the discovery challenge.
 *   LEDGER_MCP_ALLOWED_HOSTS    Comma-separated hostnames accepted in the Host and Origin
 *                               headers (DNS-rebinding protection). Defaults to the
 *                               hostname of LEDGER_MCP_PUBLIC_URL.
 *   LEDGER_MCP_AUTH_SERVER      The OAuth authorization server issuer. Defaults to the
 *                               Supabase project's Auth URL: NEXT_PUBLIC_SUPABASE_URL + /auth/v1
 *   LEDGER_MCP_REQUIRE_OAUTH_CLIENT   "true" refuses tokens that were not issued to a connected
 *                               OAuth client (rejects plain web-session tokens).
 *   LEDGER_PROPOSAL_TTL_SECONDS How long a prepared entry can be confirmed. Default 600.
 *   BUSINESS_TIMEZONE           IANA zone that defines "today", e.g. Asia/Karachi. No default.
 */

export const MCP_PATH = '/api/mcp'
export const MCP_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`

export const ledgerMcpEnabled = () => process.env.LEDGER_MCP_ENABLED === 'true'

/** The public origin, or null when it is not configured. */
export function publicBase(): URL | null {
  const raw = process.env.LEDGER_MCP_PUBLIC_URL
  if (!raw) return null
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

export const mcpResourceUrl = (base: URL) => new URL(MCP_PATH, base)
export const mcpMetadataUrl = (base: URL) => new URL(MCP_METADATA_PATH, base)

export const authorizationServer = () =>
  process.env.LEDGER_MCP_AUTH_SERVER ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/auth/v1`

export const allowedHosts = (base: URL) =>
  (process.env.LEDGER_MCP_ALLOWED_HOSTS ?? base.hostname).split(',').map((s) => s.trim()).filter(Boolean)
