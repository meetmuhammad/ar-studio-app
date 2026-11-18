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
}

interface ModuleDef extends Omit<ResourceProps, 'meta'> {
  list: string
  label: string
  icon: React.ReactNode
  businessScoped: boolean
}

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
  },
  { name: 'orders', list: '/orders', label: 'Orders', icon: <ShoppingOutlined />, businessScoped: true },
  { name: 'measurements', list: '/measurements', label: 'Measurements', icon: <ColumnHeightOutlined />, businessScoped: true },
  { name: 'vendors', list: '/vendors', show: '/vendors/:id', label: 'Vendors', icon: <ShopOutlined />, businessScoped: true },
  { name: 'ledger', list: '/ledger', label: 'Ledger', icon: <BookOutlined />, businessScoped: true },
  { name: 'pnl', list: '/pnl', label: 'P&L', icon: <FundOutlined />, businessScoped: false },
]

const rolesFor = (href: string): Role[] => {
  const item = NAV_ITEMS.find((i) => i.href === href)
  if (!item) throw new Error(`No NAV_ITEMS entry (roles) for route ${href}`)
  return item.roles
}

export const resources: ResourceProps[] = MODULES.map(({ label, icon, businessScoped, ...resource }) => {
  const meta: ResourceMeta = { label, icon, roles: rolesFor(resource.list), businessScoped }
  return { ...resource, meta }
})

const META_BY_NAME = new Map(resources.map((r) => [r.name, r.meta as ResourceMeta]))

export const resourceMeta = (name: string | undefined): ResourceMeta | undefined =>
  name ? META_BY_NAME.get(name) : undefined
