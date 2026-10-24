import { supabase } from './supabase-client'

/**
 * fetch() for this app's own `/api/*` routes, with the signed-in user's access
 * token attached as `Authorization: Bearer`.
 *
 * Why it exists: the browser keeps its Supabase session in localStorage, so the
 * server cannot see it unless the client sends it (src/lib/api-auth.ts).
 *
 * - The token goes only to same-origin `/api/` paths. Anything else throws, so
 *   it can never be attached to a third-party URL by a careless call site.
 * - No session -> a synthetic 401 response, not an exception, so callers'
 *   existing `if (!response.ok)` handling runs exactly as for a server 401.
 * - supabase-js refreshes an expired access token inside getSession(). If the
 *   server still answers 401 (token revoked or rotated mid-flight) the session
 *   is refreshed once and the request retried once.
 */
const NOT_SIGNED_IN = () =>
  new Response(JSON.stringify({ error: 'Unauthorized - Please sign in' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })

function assertApiUrl(input: string): void {
  const url = new URL(input, window.location.origin)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
    throw new Error(`authFetch only calls this app's own /api/ routes, got: ${url.origin}${url.pathname}`)
  }
}

function withToken(init: RequestInit, token: string): RequestInit {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return { ...init, headers }
}

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  assertApiUrl(input)

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NOT_SIGNED_IN()

  const response = await fetch(input, withToken(init, session.access_token))
  if (response.status !== 401) return response

  const { data: refreshed } = await supabase.auth.refreshSession()
  if (!refreshed.session) return response

  return fetch(input, withToken(init, refreshed.session.access_token))
}
