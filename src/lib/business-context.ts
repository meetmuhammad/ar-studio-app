import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from './supabase'
import { requireRole, type AuthUser, type UserRole } from './api-auth'
import {
  ALL_BUSINESSES,
  BUSINESS_HEADER,
  DEFAULT_BUSINESS_SLUG,
  type Business,
} from './business-shared'

/**
 * Which business (shop) an API request acts on, and proof the caller may.
 *
 * Every route that touches a scoped table (customers, measurements, vendors,
 * orders, payments, general_ledger, vendor_ledger) resolves one of these AFTER
 * authenticating, and then:
 *   - filters every read with inScope(query, scope)
 *   - stamps every insert with scope.businessId
 *   - filters every update/delete by business_id, so an id from another
 *     business matches nothing and the route answers 404.
 *
 * The business comes from the `X-Business-Id` header and is checked against
 * user_businesses. A business_id in a request body is never trusted: writes
 * are stamped from the verified context only.
 *
 * Membership (user_businesses) decides WHICH shops; the global users.role
 * (admin | staff) still decides WHAT the user may do, via requireRole.
 */

export interface BusinessScope {
  user: AuthUser
  memberships: Business[]
  /** Businesses this request reads. One entry unless the combined view is on. */
  businessIds: string[]
  /** The single business, or null in the admin combined (read-only) view. */
  business: Business | null
}

/** A scope that names exactly one business: what every write requires. */
export interface SingleBusinessScope extends BusinessScope {
  business: Business
  businessId: string
}

interface Options {
  /** Roles allowed (default: admin and staff). */
  roles?: UserRole[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getMemberships(userId: string): Promise<Business[]> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase
    .from('user_businesses')
    .select('businesses (id, name, slug, code, is_active)')
    .eq('user_id', userId)
  if (error) throw new Error(`Failed to load business memberships: ${error.message}`)

  type Row = { businesses: (Business & { is_active: boolean }) | null }
  return ((data ?? []) as unknown as Row[])
    .map((r) => r.businesses)
    .filter((b): b is Business & { is_active: boolean } => !!b && b.is_active)
    .map(({ id, name, slug, code }) => ({ id, name, slug, code }))
    .sort((a, b) => (a.slug === DEFAULT_BUSINESS_SLUG ? -1 : b.slug === DEFAULT_BUSINESS_SLUG ? 1 : a.name.localeCompare(b.name)))
}

/**
 * The business a request WITHOUT the header acts on.
 *
 * RISKY, DECIDED DEFAULT (Ammar, ARAPP-CHANGE-4): a request with no
 * `X-Business-Id` falls back to Ahsan Tariq Couture (slug "atc") -- but only
 * after checking the caller is an ATC member; otherwise it is refused (403).
 * It exists so clients that predate multi-business keep working, chiefly the
 * native Expo app (ar-studio-mobile), which this change does not touch. The
 * cost: such a client silently reads and WRITES ATC, even if its user meant
 * Techlink. It never falls back to the combined view, and never to Techlink.
 */
export function defaultBusiness(memberships: Business[]): Business | null {
  return memberships.find((b) => b.slug === DEFAULT_BUSINESS_SLUG) ?? null
}

const forbidden = (error: string) => NextResponse.json({ error }, { status: 403 })

async function resolve(
  request: Request,
  { roles = ['admin', 'staff'], allowAll }: Options & { allowAll: boolean }
): Promise<BusinessScope | NextResponse> {
  const auth = await requireRole(request, roles)
  if (auth instanceof NextResponse) return auth
  const { user } = auth

  let memberships: Business[]
  try {
    memberships = await getMemberships(user.id)
  } catch (error) {
    console.error('business-context:', error)
    return NextResponse.json({ error: 'Failed to resolve business access' }, { status: 500 })
  }
  if (memberships.length === 0) return forbidden('Forbidden - No business access')

  const header = request.headers.get(BUSINESS_HEADER)?.trim() || ''

  if (header.toLowerCase() === ALL_BUSINESSES) {
    // The combined view is admin-only and read/report-only. It is only ever
    // chosen explicitly; a missing header never means "all".
    if (!allowAll) {
      return NextResponse.json(
        { error: 'Select a single business to do this', code: 'BUSINESS_REQUIRED' },
        { status: 400 }
      )
    }
    if (user.role !== 'admin') return forbidden('Forbidden - Combined view is admin-only')
    return { user, memberships, businessIds: memberships.map((b) => b.id), business: null }
  }

  let business: Business | null
  if (header) {
    business = UUID.test(header) ? memberships.find((b) => b.id === header) ?? null : null
    if (!business) return forbidden('Forbidden - No access to this business')
  } else {
    business = defaultBusiness(memberships)
    if (!business) return forbidden(`Forbidden - Select a business (${BUSINESS_HEADER} header)`)
  }

  return { user, memberships, businessIds: [business.id], business }
}

/**
 * Exactly one business. Use for every write, and for reads that only make
 * sense inside one book (running balances, the vendor sub-ledger, order
 * numbering). The combined view is refused with 400.
 */
export async function requireBusiness(
  request: Request,
  options: Options = {}
): Promise<SingleBusinessScope | NextResponse> {
  const scope = await resolve(request, { ...options, allowAll: false })
  if (scope instanceof NextResponse) return scope
  const business = scope.business as Business
  return { ...scope, business, businessId: business.id }
}

/**
 * One business, or -- for an admin who explicitly asks with
 * `X-Business-Id: all` -- every business they belong to. GET routes only.
 */
export async function requireBusinessRead(
  request: Request,
  options: Options = {}
): Promise<BusinessScope | NextResponse> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return requireBusiness(request, options)
  }
  return resolve(request, { ...options, allowAll: true })
}

/**
 * Restrict a PostgREST query to the scope's businesses. Works on any filter
 * builder (select / update / delete) over a table with a business_id column.
 */
export function inScope<Q>(query: Q, scope: Pick<BusinessScope, 'businessIds'>, column = 'business_id'): Q {
  if (scope.businessIds.length === 0) throw new Error('inScope: empty business scope')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = query as any
  return (scope.businessIds.length === 1
    ? q.eq(column, scope.businessIds[0])
    : q.in(column, scope.businessIds)) as Q
}

/** Name lookup for labelling rows in the combined view. */
export function businessNames(scope: BusinessScope): Map<string, string> {
  return new Map(scope.memberships.map((b) => [b.id, b.name]))
}
