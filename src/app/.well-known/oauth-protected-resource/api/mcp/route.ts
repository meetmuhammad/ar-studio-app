import { authorizationServer, ledgerMcpEnabled, mcpResourceUrl, publicBase } from '@/lib/ledger-mcp/config'

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the ledger MCP endpoint.
 * An MCP client reads this after its first request is refused, to learn which
 * authorization server issues tokens for this resource. Public by design: it
 * names the server and carries no secret. Off with the endpoint itself.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const base = publicBase()
  if (!ledgerMcpEnabled() || !base) return new Response('Not found', { status: 404 })

  return Response.json(
    {
      resource: mcpResourceUrl(base).toString(),
      authorization_servers: [authorizationServer()],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid', 'email', 'profile'],
      resource_name: 'AR Studio ledger',
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
