import { createServerSupabaseClient } from './supabase'
import { NextRequest, NextResponse } from 'next/server'
import { cache } from 'react'

export type UserRole = 'admin' | 'staff'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

/**
 * Why this file exists in this shape.
 *
 * Every API route reaches the database through the service-role key, which
 * bypasses RLS completely. That makes these wrappers the ONLY authorization
 * boundary in the application -- there is no second line of defence behind
 * them, so they have to be exact rather than approximately right.
 *
 * Three deliberate decisions:
 *
 * 1. getUser(), never getSession(). getSession() decodes the cookie without
 *    revalidating the JWT against the auth server, so it cannot detect a
 *    revoked session or a signed-out user. getUser() round-trips and verifies.
 *    The extra hop is the point.
 *
 * 2. "Not signed in" and "auth service is down" are different answers.
 *    Collapsing both to 401 means a transient Supabase blip logs every member
 *    of staff out mid-shift, because the client RouteGuard reacts to 401 by
 *    redirecting to /sign-in. Infrastructure failures return 503 and the
 *    client leaves the session alone.
 *
 * 3. Wrappers, not a copy-pasted preamble. A route added later that forgets a
 *    three-line preamble produces no type error, no build failure, and -- with
 *    service-role -- no database backstop either. Wrapping changes the shape
 *    of the export, so omission is visible in review and greppable in CI.
 */

type AuthFailure =
  | { kind: 'unauthenticated' }
  | { kind: 'no-profile'; userId: string }
  | { kind: 'unavailable'; detail: string }

type AuthResult = { ok: true; user: AuthUser } | ({ ok: false } & AuthFailure)

/**
 * Resolve the caller once per request. React's cache() dedupes this within a
 * single request, so nesting wrappers or calling it again in a handler costs
 * nothing extra.
 */
export const resolveAuthUser = cache(async (): Promise<AuthResult> => {
  let supabase
  try {
    supabase = await createServerSupabaseClient()
  } catch (error) {
    return {
      ok: false,
      kind: 'unavailable',
      detail: error instanceof Error ? error.message : 'client init failed',
    }
  }

  const { data, error } = await supabase.auth.getUser()

  if (error) {
    // A missing/!invalid session is a normal anonymous request, not an outage.
    // Anything else -- network failure, 5xx from the auth service -- must not
    // be reported as "please sign in".
    const isMissingSession =
      error.name === 'AuthSessionMissingError' ||
      error.status === 401 ||
      error.status === 403
    return isMissingSession
      ? { ok: false, kind: 'unauthenticated' }
      : { ok: false, kind: 'unavailable', detail: error.message }
  }

  if (!data.user) return { ok: false, kind: 'unauthenticated' }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  // The lookup failing is an outage. It is NOT "you are not signed in" -- the
  // user demonstrably is, we just cannot read their role right now.
  if (profileError) {
    return { ok: false, kind: 'unavailable', detail: profileError.message }
  }

  // Authenticated but no profile row: a real account-setup problem. Telling
  // this person to sign in would be a lie and would loop them forever.
  if (!profile) return { ok: false, kind: 'no-profile', userId: data.user.id }

  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email || '',
      role: profile.role as UserRole,
    },
  }
})

function failureResponse(failure: AuthFailure): NextResponse {
  switch (failure.kind) {
    case 'unauthenticated':
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHENTICATED' },
        { status: 401 }
      )
    case 'no-profile':
      console.error(`[api-auth] no users row for authenticated id ${failure.userId}`)
      return NextResponse.json(
        {
          error: 'Your account has no role assigned. Contact an administrator.',
          code: 'NO_PROFILE',
        },
        { status: 403 }
      )
    case 'unavailable':
      console.error(`[api-auth] auth unavailable: ${failure.detail}`)
      return NextResponse.json(
        {
          error: 'Authentication service unavailable. Please retry.',
          code: 'AUTH_UNAVAILABLE',
        },
        { status: 503 }
      )
  }
}

type RouteContext = { params: Promise<Record<string, string>> }
type GuardedHandler<C> = (
  request: NextRequest,
  context: C & { user: AuthUser }
) => Promise<Response> | Response

/**
 * Wrap a route handler so it only runs for the listed roles.
 * The authenticated user is passed through on the context as `user`.
 */
export function withRoles<C = RouteContext>(
  roles: readonly UserRole[],
  handler: GuardedHandler<C>
) {
  return async (request: NextRequest, context: C): Promise<Response> => {
    const result = await resolveAuthUser()

    if (!result.ok) return failureResponse(result)

    if (!roles.includes(result.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'INSUFFICIENT_ROLE' },
        { status: 403 }
      )
    }

    return handler(request, { ...(context as C), user: result.user })
  }
}

/** Any signed-in user (admin or staff). */
export function withAuth<C = RouteContext>(handler: GuardedHandler<C>) {
  return withRoles<C>(['admin', 'staff'], handler)
}

/** Admin only. */
export function withAdmin<C = RouteContext>(handler: GuardedHandler<C>) {
  return withRoles<C>(['admin'], handler)
}
