import { createServerSupabaseClient } from './supabase'
import { NextRequest, NextResponse } from 'next/server'

/**
 * API route authorization.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  request                                                                │
 * │     │                                                                   │
 * │     ▼                                                                   │
 * │  middleware.ts ──── no session ────────────────────────────► 401        │
 * │     │  (defense in depth — NOT the only check; Next.js documents        │
 * │     │   that middleware alone is insufficient for authorization,        │
 * │     │   and CVE-2025-29927 demonstrated a header-based bypass)          │
 * │     ▼                                                                   │
 * │  withAuth(handler) / withAdmin(handler)                                 │
 * │     │                                                                   │
 * │     ├── getUser()  ── invalid/expired JWT ─────────────────► 401        │
 * │     │      (getUser verifies against the auth server;                   │
 * │     │       getSession only reads the cookie — see note below)          │
 * │     ├── role lookup ── no row / error ─────────────────────► 401        │
 * │     ├── role not permitted ────────────────────────────────► 403        │
 * │     └── permitted ──► handler(request, { ...ctx, user })                │
 * │                          │                                              │
 * │                          └── uses createAdminSupabaseClient()           │
 * │                              (service role — RLS is bypassed here       │
 * │                               by design; see the note on 1A below)      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ## Why the wrapper instead of a per-route preamble
 *
 * The previous design called for three lines pasted at the top of all 16 route
 * handlers. Omission would have been silent: a route added later that forgot
 * them produces no type error, no failing build, and no warning — and because
 * handlers use the service-role client, there is no database backstop either.
 *
 * With the wrapper, forgetting the check changes the SHAPE of the export, so CI
 * can catch it mechanically. A grep for "requireAuth" could not: a check placed
 * after the data fetch, or inside a branch, passes a grep and protects nothing.
 *
 * ## Why routes still use the service-role client (decision 1A)
 *
 * Authorization here is role-based (admin/staff), not row-based. Every staff
 * member can see every order by design; there are no per-row ownership rules to
 * express. RLS policies on the API path would read "authenticated users see
 * everything", which protects nothing. RLS remains enabled on all 10 tables and
 * protects direct PostgREST access with the public anon key.
 *
 * The trade this accepts: the wrapper is the only authorization on the API path.
 * That is why it is a wrapper and why CI enforces it.
 */

export type UserRole = 'admin' | 'staff'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

/**
 * Resolve the caller from the request cookies.
 * Returns null when the caller is not authenticated OR cannot be resolved.
 *
 * ── KNOWN LIMITATION (tracked in TODOS.md → "Distinguish transient failures
 *    from unauthorized") ──────────────────────────────────────────────────────
 * This collapses "not logged in" and "the role lookup failed" into the same
 * null. A transient database error therefore reads as 401 across every route,
 * and route-guard.tsx bounces the user to /sign-in — so a brief Supabase blip
 * looks to staff like being logged out mid-shift.
 *
 * That was accepted deliberately to keep this phase scoped. The fix is local to
 * this function: return a discriminated result ({ ok } | { reason: 'unauthenticated' }
 * | { reason: 'unavailable' }) and let withAuth map 'unavailable' to 503. The
 * call sites below already funnel through one place, so it stays a small change.
 * ───────────────────────────────────────────────────────────────────────────────
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const supabase = await createServerSupabaseClient()

    // getUser() validates the JWT against the Supabase auth server.
    // Do NOT switch this back to getSession(): on the server that only decodes
    // the cookie without verifying it, so a forged cookie would authenticate.
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return null
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    // Permitted by the existing RLS policy "Users can read own data"
    // (public.users FOR SELECT USING (auth.uid() = id)).
    if (profileError || !profile) {
      return null
    }

    return {
      id: user.id,
      email: user.email || '',
      role: profile.role as UserRole,
    }
  } catch (error) {
    console.error('getAuthUser failed:', error)
    return null
  }
}

/**
 * Route context typing.
 *
 * Next.js validates the exported handler's SIGNATURE, not just its return type.
 * A static route's export may take one argument or a `{ params }` second
 * argument — nothing else. Exporting `(req, ctx: Record<string, never>)` fails
 * the build with:
 *
 *   Type "Record<string, never>" is not a valid type for the function's
 *   second argument.
 *
 * So `C` defaults to `void`, and the two types below collapse to a
 * single-argument function in that case. Dynamic routes pass their params type
 * explicitly: `withAuth<{ params: Promise<{ id: string }> }>(handler)`.
 *
 * `[C] extends [void]` (rather than `C extends void`) prevents the conditional
 * from distributing over a union.
 */
type WithUser<C> = [C] extends [void] ? { user: AuthUser } : C & { user: AuthUser }

/** A handler that has been guaranteed an authenticated, authorized caller. */
type AuthedHandler<C> = (
  request: NextRequest,
  context: WithUser<C>,
) => Promise<NextResponse> | NextResponse

/** The shape Next.js expects back. */
type RouteHandler<C> = [C] extends [void]
  ? (request: NextRequest) => Promise<NextResponse>
  : (request: NextRequest, context: C) => Promise<NextResponse>

function guard<C = void>(
  allowedRoles: readonly UserRole[],
  handler: AuthedHandler<C>,
): RouteHandler<C> {
  const wrapped = async (request: NextRequest, context?: C): Promise<NextResponse> => {
    const user = await getAuthUser(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 },
      )
    }

    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - Insufficient permissions' },
        { status: 403 },
      )
    }

    // The one cast in this file. The conditional RouteHandler type cannot be
    // satisfied structurally by a single implementation, so the arity bridge
    // happens here rather than at 39 call sites.
    return handler(request, { ...(context ?? {}), user } as WithUser<C>)
  }

  return wrapped as RouteHandler<C>
}

/**
 * Any signed-in user (admin or staff).
 *
 *   export const GET = withAuth(async (request, { user }) => { ... })
 *   export const GET = withAuth(async (request, { params, user }) => { ... })
 */
export function withAuth<C = void>(
  handler: AuthedHandler<C>,
): RouteHandler<C> {
  return guard(['admin', 'staff'], handler)
}

/**
 * Admin only.
 *
 *   export const DELETE = withAdmin(async (request, { params, user }) => { ... })
 */
export function withAdmin<C = void>(
  handler: AuthedHandler<C>,
): RouteHandler<C> {
  return guard(['admin'], handler)
}

/** Explicit role list, when neither withAuth nor withAdmin fits. */
export function withRoles<C = void>(
  allowedRoles: readonly UserRole[],
  handler: AuthedHandler<C>,
): RouteHandler<C> {
  return guard(allowedRoles, handler)
}
