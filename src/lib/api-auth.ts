import { NextResponse } from 'next/server'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { createAdminSupabaseClient, createCallerSupabaseClient } from './supabase'

export type UserRole = 'admin' | 'staff'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

/**
 * The browser keeps its Supabase session in localStorage, not cookies, so a
 * cookie-based server check never sees it. Callers send the access token as
 * `Authorization: Bearer <jwt>` instead (see src/lib/auth-fetch.ts).
 */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match ? match[1] : null
}

/**
 * Resolve a Supabase access token to a user and role.
 *
 * The token is verified by Supabase Auth (`auth.getUser`), never decoded and
 * trusted locally, so a forged or expired JWT is rejected. The role is read
 * with the service-role client so the lookup does not depend on row-level
 * security for the caller. A user with no `users` row has no role and is
 * treated as unauthenticated rather than defaulted to anything.
 */
export async function authenticateToken(token: string): Promise<AuthUser | null> {
  try {
    const supabase = createAdminSupabaseClient()

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null

    const { data: row, error: roleError } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (roleError || !row) return null
    if (row.role !== 'admin' && row.role !== 'staff') return null

    return { id: data.user.id, email: data.user.email ?? '', role: row.role }
  } catch (error) {
    console.error('Error authenticating token:', error)
    return null
  }
}

/** The authenticated user for this request, or null. */
export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const token = bearerToken(request)
  return token ? authenticateToken(token) : null
}

/**
 * Guard an API route by role. Returns the user, or the response to send back:
 *
 *   const auth = await requireAdmin(request)
 *   if (auth instanceof NextResponse) return auth
 */
export async function requireRole(
  request: Request,
  allowedRoles: UserRole[]
): Promise<{ user: AuthUser } | NextResponse> {
  const user = await getAuthUser(request)

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized - Please sign in' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
    )
  }

  if (!allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { error: 'Forbidden - Insufficient permissions' },
      { status: 403 }
    )
  }

  return { user }
}

export function requireAdmin(request: Request) {
  return requireRole(request, ['admin'])
}

export function requireAuth(request: Request) {
  return requireRole(request, ['admin', 'staff'])
}

/**
 * A Supabase client acting as the request's caller (their bearer token), for
 * calling the admin/member-checked database functions (record_payment,
 * delete_order, ...) from an API route. Call it only after requireRole /
 * requireBusiness accepted the request, so the token is known to be valid.
 */
export function callerSupabaseClient(request: Request): SupabaseClient {
  const token = bearerToken(request)
  if (!token) throw new Error('callerSupabaseClient: request has no bearer token')
  return createCallerSupabaseClient(token)
}

/**
 * The HTTP status for an error raised by one of those functions (SQLSTATEs as
 * documented in 20261119000100_order_payment_functions.sql), or null when it
 * is unexpected and the route should answer with its own 500.
 *
 *   42501 not signed in / no role / not a member / admin only  -> 403
 *   P0002 not found                                             -> 404
 *   22023 / 23514 / 22P02 / 22007 / 22008 invalid input         -> 400
 *   PGRST301 / PGRST302 token refused by PostgREST              -> 401
 */
export function rpcErrorStatus(error: Pick<PostgrestError, 'code'>): 400 | 401 | 403 | 404 | null {
  switch (error.code) {
    case '42501':
      return 403
    case 'P0002':
      return 404
    case '22023':
    case '23514':
    case '22P02':
    case '22007':
    case '22008':
      return 400
    case 'PGRST301':
    case 'PGRST302':
      return 401
    default:
      return null
  }
}
