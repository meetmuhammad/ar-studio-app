import type { AccessControlProvider, CanReturnType } from '@refinedev/core'
import { supabase } from '@/lib/supabase-client'
import { resolveRole, type Role } from '@/lib/auth/role'
import { isCombinedView } from '@/lib/business-store'
import { resourceMeta } from './resources'

/**
 * Role-based access control matching the database policies
 * (supabase/migrations/20261119000000_role_scoped_rls.sql):
 *
 * - Which roles may open a module comes from NAV_ITEMS (via resources.tsx):
 *   Dashboard, Ledger, Profit & Loss and Vendors are admin-only; Customers,
 *   Orders and Measurements are admin + staff. Same as RoleGuard.
 * - Per-action narrowing from the resource's `actionRoles`: deleting
 *   customers, orders and measurements is admin-only; payments may be read
 *   by members but only admins create, edit or delete them.
 * - The admin "All businesses" view is read-only: create/edit/delete on a
 *   business-scoped module is denied there, matching authFetch and the API.
 * - Unknown resources are denied.
 *
 * Hiding UI is an affordance only; RLS enforces the same rules for the
 * browser client, and the API routes check access server-side.
 */

const WRITE_ACTIONS = new Set(['create', 'edit', 'delete', 'clone'])

const ACTION_VERB: Record<string, string> = { create: 'create', edit: 'edit', delete: 'delete', clone: 'copy' }

export const COMBINED_VIEW_READ_ONLY =
  'All businesses is a read-only view. Switch to one business to make changes.'

/** Synchronous rule shared by the provider and the navigation. */
export function canRoleAccess(
  role: Role | null | undefined,
  resource: string | undefined,
  action: string,
  combinedView = isCombinedView()
): CanReturnType {
  const meta = resourceMeta(resource)
  if (!role || !meta) return { can: false, reason: 'Not allowed' }
  if (!meta.roles.includes(role)) return { can: false, reason: 'Your role cannot open this section' }
  const actionRoles = meta.actionRoles?.[action]
  if (actionRoles && !actionRoles.includes(role)) {
    return { can: false, reason: `Only an admin can ${ACTION_VERB[action] ?? action} this` }
  }
  if (combinedView && meta.businessScoped && WRITE_ACTIONS.has(action)) {
    return { can: false, reason: COMBINED_VIEW_READ_ONLY }
  }
  return { can: true }
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action, params }) => {
    const { data: { session } } = await supabase.auth.getSession()
    const role = session?.user ? await resolveRole(session.user.id) : null
    return canRoleAccess(role, resource ?? params?.resource?.name, action)
  },
  options: {
    buttons: { enableAccessControl: true, hideIfUnauthorized: false },
  },
}
