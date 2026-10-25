import { BookOpen, Building2, Home, Ruler, ShoppingBag, Users, type LucideIcon } from 'lucide-react'

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
 * The single source of truth for navigation. The sidebar (tablet/desktop), the
 * bottom tab bar and the "More" sheet (phones) all read this list, so a role
 * can never see a destination on one surface that another surface hides.
 * Hiding a link is a UI affordance only; access is enforced by RoleGuard and
 * the API.
 *
 * Phone tabs follow the native app: admins get Home, Orders, Customers, Ledger;
 * staff get Orders, Customers, Measurements. Everything else is under More.
 */
export const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', tabLabel: 'Home', href: '/', icon: Home, roles: ['admin'], tab: { admin: 0 } },
  { name: 'Customers', href: '/customers', icon: Users, roles: ['admin', 'staff'], tab: { admin: 2, staff: 1 } },
  { name: 'Orders', href: '/orders', icon: ShoppingBag, roles: ['admin', 'staff'], tab: { admin: 1, staff: 0 } },
  { name: 'Measurements', href: '/measurements', icon: Ruler, roles: ['admin', 'staff'], tab: { staff: 2 } },
  { name: 'Ledger', href: '/ledger', icon: BookOpen, roles: ['admin'], tab: { admin: 3 } },
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
