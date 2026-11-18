import { supabase } from './supabase-client'
import { fetchRole } from './auth/role'
import { DEFAULT_BUSINESS_SLUG, type Business, type MyBusinessesResponse } from './business-shared'

/**
 * The signed-in user's businesses, read in the browser with the user's own
 * session (no service-role API). RLS allows it: user_businesses rows where
 * user_id = auth.uid(), and businesses the user is a member of.
 *
 * Returns exactly what GET /api/me/businesses returns, built the same way as
 * getMemberships / defaultBusiness in src/lib/business-context.ts:
 * - active businesses only, ATC first, then by name;
 * - defaultBusinessId: ATC when the user is an ATC member, otherwise null;
 * - canViewAll: admin with more than one business.
 *
 * This only decides what the switcher offers. The API and RLS still check
 * membership on every request.
 */
export async function loadMyBusinesses(): Promise<MyBusinessesResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not signed in')

  const [{ data, error }, role] = await Promise.all([
    supabase.from('user_businesses').select('businesses (id, name, slug, code, is_active)').eq('user_id', userId),
    // The role is read fresh (not from the UI cache), as the API reads it per request.
    fetchRole(userId).catch(() => null),
  ])
  if (error) throw new Error(`Failed to load business memberships: ${error.message}`)

  type Row = { businesses: (Business & { is_active: boolean }) | null }
  const businesses = ((data ?? []) as unknown as Row[])
    .map((r) => r.businesses)
    .filter((b): b is Business & { is_active: boolean } => !!b && b.is_active)
    .map(({ id, name, slug, code }) => ({ id, name, slug, code }))
    .sort((a, b) =>
      a.slug === DEFAULT_BUSINESS_SLUG ? -1 : b.slug === DEFAULT_BUSINESS_SLUG ? 1 : a.name.localeCompare(b.name)
    )

  return {
    businesses,
    defaultBusinessId: businesses.find((b) => b.slug === DEFAULT_BUSINESS_SLUG)?.id ?? null,
    canViewAll: role === 'admin' && businesses.length > 1,
  }
}
