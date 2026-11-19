export type Role = 'admin' | 'staff'

export interface NavItem {
  name: string
  href: string
  roles: Role[]
}

/**
 * The single source of truth for which roles may open each module. The Refine
 * resources (src/lib/refine/resources.tsx) read `roles` from here by route, and
 * the accessControlProvider filters the sider menu with it. Hiding a link is a
 * UI affordance only; access is enforced by CanAccess / ResourceGuard on the
 * page, by the API (docs/API-ROLES.md) and by RLS.
 */
export const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', href: '/', roles: ['admin'] },
  { name: 'Customers', href: '/customers', roles: ['admin', 'staff'] },
  { name: 'Orders', href: '/orders', roles: ['admin', 'staff'] },
  { name: 'Measurements', href: '/measurements', roles: ['admin', 'staff'] },
  { name: 'Ledger', href: '/ledger', roles: ['admin'] },
  { name: 'Profit & Loss', href: '/pnl', roles: ['admin'] },
  { name: 'Vendors', href: '/vendors', roles: ['admin'] },
]
