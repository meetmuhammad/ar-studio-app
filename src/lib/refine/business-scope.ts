/**
 * The business ids the Refine data provider may read, kept in step with
 * BusinessProvider by <BusinessScopeSync /> (refine-provider.tsx).
 *
 * The selected business itself is read from src/lib/business-store.ts (the same
 * value authFetch sends as X-Business-Id). This module only adds the caller's
 * membership list, which the admin "All businesses" view reads across, the
 * same list the API uses for that view (active memberships).
 */
let memberships: string[] = []

export const getMembershipIds = (): string[] => memberships

export function setMembershipIds(ids: string[]): void {
  memberships = ids
}
