'use client'

import { Grid, Select, Space, Typography } from 'antd'
import { AppstoreOutlined, ShopOutlined } from '@ant-design/icons'
import { useBusiness } from '@/contexts/business-context'
import { ALL_BUSINESSES } from '@/lib/business-shared'

/**
 * Business switcher for the shell header (antd). Same behaviour as before:
 * only the caller's memberships; a plain label with one business; admins with
 * more than one also get "All businesses" (read-only combined view).
 * Switching goes through BusinessProvider, which clears the query cache and
 * remounts the page.
 */
export function BusinessSwitcher() {
  const { businesses, business, isAll, canViewAll, ready, switchBusiness } = useBusiness()
  const compact = !Grid.useBreakpoint().sm

  if (!ready || businesses.length === 0) return null

  if (businesses.length === 1 && !canViewAll) {
    return (
      <Space size={6}>
        <ShopOutlined />
        <Typography.Text strong ellipsis style={{ maxWidth: compact ? 120 : 260 }}>
          {businesses[0].name}
        </Typography.Text>
      </Space>
    )
  }

  return (
    <Select
      aria-label="Business"
      value={isAll ? ALL_BUSINESSES : business?.id}
      onChange={(value: string) => void switchBusiness(value)}
      style={{ width: compact ? 132 : 220 }}
      popupMatchSelectWidth={false}
      suffixIcon={isAll ? <AppstoreOutlined /> : <ShopOutlined />}
      options={[
        ...businesses.map((b) => ({ value: b.id, label: b.name })),
        ...(canViewAll ? [{ value: ALL_BUSINESSES, label: 'All businesses (read only)' }] : []),
      ]}
    />
  )
}
