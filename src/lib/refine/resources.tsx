import type { ResourceProps } from '@refinedev/core'
import {
  BookOutlined,
  ColumnHeightOutlined,
  DashboardOutlined,
  FundOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { NAV_ITEMS, type Role } from '@/components/dashboard/nav-items'

/**
 * Refine resources: one per dashboard module, in sidebar order.
 *
 * Which roles may open each module is NOT defined here: it is read from
 * NAV_ITEMS (src/components/dashboard/nav-items.ts) by route, the list the
 * legacy RoleGuard pages and the API rules were written against, so there is
 * one place to change it.
 *
 * `name` is the Refine resource key. For modules served by the Supabase data
 * provider it is also the table name (customers, orders, measurements, ...).
 */

export interface ResourceMeta {
  label: string
  icon: React.ReactNode
  /** Roles that may open the module at all. */
  roles: Role[]
  /** Rows carry business_id and must be scoped to the selected business. */
  businessScoped: boolean
  /**
   * Narrower roles for specific actions, mirroring the database policies in
   * supabase/migrations/20261119000000_role_scoped_rls.sql (e.g. delete is
   * admin-only on customers). Actions not listed use `roles`.
   */
  actionRoles?: Partial<Record<string, Role[]>>
  /** Not shown in the sidebar (access-control only). */
  hide?: boolean
}

interface ModuleDef extends Omit<ResourceProps, 'meta'> {
  label: string
  icon: React.ReactNode
  businessScoped: boolean
  actionRoles?: ResourceMeta['actionRoles']
  /** For modules without their own page; otherwise roles come from NAV_ITEMS. */
  roles?: Role[]
  hide?: boolean
}

const ADMIN_ONLY: Role[] = ['admin']
const ADMIN_DELETE = { delete: ADMIN_ONLY }
const ADMIN_WRITES = { create: ADMIN_ONLY, edit: ADMIN_ONLY, delete: ADMIN_ONLY, clone: ADMIN_ONLY }

const MODULES: ModuleDef[] = [
  { name: 'dashboard', list: '/', label: 'Dashboard', icon: <DashboardOutlined />, businessScoped: false },
  {
    name: 'customers',
    list: '/customers',
    create: '/customers/create',
    edit: '/customers/edit/:id',
    show: '/customers/show/:id',
    label: 'Customers',
    icon: <TeamOutlined />,
    businessScoped: true,
    actionRoles: ADMIN_DELETE,
  },
  { name: 'orders', list: '/orders', label: 'Orders', icon: <ShoppingOutlined />, businessScoped: true, actionRoles: ADMIN_DELETE },
  {
    name: 'measurements',
    list: '/measurements',
    label: 'Measurements',
    icon: <ColumnHeightOutlined />,
    businessScoped: true,
    actionRoles: ADMIN_DELETE,
  },
  // Vendors are admin-only as a whole (roles from NAV_ITEMS).
  { name: 'vendors', list: '/vendors', show: '/vendors/:id', label: 'Vendors', icon: <ShopOutlined />, businessScoped: true },
  { name: 'ledger', list: '/ledger', label: 'Ledger', icon: <BookOutlined />, businessScoped: true },
  { name: 'pnl', list: '/pnl', label: 'P&L', icon: <FundOutlined />, businessScoped: false },
  // No page of its own: members may read payments, only admins may write them.
  {
    name: 'payments',
    label: 'Payments',
    icon: null,
    businessScoped: true,
    roles: ['admin', 'staff'],
    actionRoles: ADMIN_WRITES,
    hide: true,
  },
]

const rolesFor = (href: string | undefined): Role[] => {
  const item = NAV_ITEMS.find((i) => i.href === href)
  if (!item) throw new Error(`No NAV_ITEMS entry (roles) for route ${href}`)
  return item.roles
}

export const resources: ResourceProps[] = MODULES.map(
  ({ label, icon, businessScoped, actionRoles, roles, hide, ...resource }) => {
    const meta: ResourceMeta = {
      label,
      icon,
      roles: roles ?? rolesFor(typeof resource.list === 'string' ? resource.list : undefined),
      businessScoped,
      actionRoles,
      hide,
    }
    return { ...resource, meta }
  }
)

const META_BY_NAME = new Map(resources.map((r) => [r.name, r.meta as ResourceMeta]))

export const resourceMeta = (name: string | undefined): ResourceMeta | undefined =>
  name ? META_BY_NAME.get(name) : undefined
