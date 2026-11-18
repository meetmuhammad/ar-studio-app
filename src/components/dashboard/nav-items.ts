import { BookOpen, Building2, Home, Ruler, Scale, ShoppingBag, Users, type LucideIcon } from 'lucide-react'

export type Role = 'admin' | 'staff'

export interface NavItem {
  name: string
  /** Shorter label for the phone tab bar. */
  tabLabel?: string
  href: string
  icon: LucideIcon
  roles: Role[]
  /** Order of the item in the phone bottom bar for each role; absent = lives under "More". */
  tab?: Partial<Record<Role, number>>
}

/**
 * The single source of truth for which roles may open each module. The Refine
 * resources (src/lib/refine/resources.tsx) read `roles` from here by route, and
 * the accessControlProvider filters the sidebar with it. Hiding a link is a UI
 * affordance only; access is enforced by RoleGuard / CanAccess on the page and
 * by the API and RLS.
 *
 * `tab` / `tabLabel` described the former phone tab bar (admins: Home, Orders,
 * Customers, Ledger; staff: Orders, Customers, Measurements). The antd shell
 * uses a drawer on phones instead; the values are kept for a future tab bar.
 */
export const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', tabLabel: 'Home', href: '/', icon: Home, roles: ['admin'], tab: { admin: 0 } },
  { name: 'Customers', href: '/customers', icon: Users, roles: ['admin', 'staff'], tab: { admin: 2, staff: 1 } },
  { name: 'Orders', href: '/orders', icon: ShoppingBag, roles: ['admin', 'staff'], tab: { admin: 1, staff: 0 } },
  { name: 'Measurements', href: '/measurements', icon: Ruler, roles: ['admin', 'staff'], tab: { staff: 2 } },
  { name: 'Ledger', href: '/ledger', icon: BookOpen, roles: ['admin'], tab: { admin: 3 } },
  { name: 'Profit & Loss', href: '/pnl', icon: Scale, roles: ['admin'] },
  { name: 'Vendors', href: '/vendors', icon: Building2, roles: ['admin'] },
]

export const itemsFor = (role: Role | undefined) => (role ? NAV_ITEMS.filter((i) => i.roles.includes(role)) : [])

export const tabItemsFor = (role: Role | undefined) =>
  itemsFor(role)
    .filter((i) => role && i.tab?.[role] !== undefined)
    .sort((a, b) => a.tab![role!]! - b.tab![role!]!)

export const moreItemsFor = (role: Role | undefined) =>
  itemsFor(role).filter((i) => !(role && i.tab?.[role] !== undefined))

export const isActivePath = (pathname: string, href: string) =>
  pathname === href || (href !== '/' && pathname.startsWith(href))
