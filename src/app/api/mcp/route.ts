import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
  requireBearerAuth,
} from '@modelcontextprotocol/server'
import { ledgerMcpVerifier, userIdOf } from '@/lib/ledger-mcp/auth'
import { allowedHosts, ledgerMcpEnabled, mcpMetadataUrl, publicBase } from '@/lib/ledger-mcp/config'
import { buildLedgerMcpServer } from '@/lib/ledger-mcp/server'

/**
 * The ledger MCP endpoint (Streamable HTTP). Off unless LEDGER_MCP_ENABLED=true.
 *
 * Stateless: a fresh server is built for each request, already bound to the
 * verified user, so it runs the same on serverless as locally and nothing about
 * a conversation is held in process memory. Every request must carry a bearer
 * token; an unauthenticated one gets a 401 whose WWW-Authenticate header points
 * at the protected-resource metadata, which is how an MCP client discovers
 * where to sign in.
 *
 * Browsers are refused outright: there is no CORS, and a request carrying an
 * Origin that is not on the allow-list is rejected. MCP clients are servers or
 * desktop apps and do not send one.
 */
export const dynamic = 'force-dynamic'

const handler = createMcpHandler(({ authInfo }) => buildLedgerMcpServer(userIdOf(authInfo)))

async function serve(request: Request): Promise<Response> {
  if (!ledgerMcpEnabled()) return new Response('Not found', { status: 404 })

  const base = publicBase()
  if (!base) {
    return Response.json({ error: 'LEDGER_MCP_PUBLIC_URL is not configured' }, { status: 500 })
  }

  const hosts = allowedHosts(base)
  const rejected = hostHeaderValidationResponse(request, hosts) ?? originValidationResponse(request, hosts)
  if (rejected) return rejected

  const gate = requireBearerAuth({
    verifier: ledgerMcpVerifier,
    resourceMetadataUrl: mcpMetadataUrl(base).toString(),
  })
  const auth = await gate(request)
  if (auth instanceof Response) return auth

  return handler.fetch(request, { authInfo: auth })
}

export { serve as GET, serve as POST, serve as DELETE }
