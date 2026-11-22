'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCan, useGetIdentity, useLogout } from '@refinedev/core'
import { Avatar, Button, Dropdown, Grid, Layout, Space, Tag, Tooltip, Typography, theme } from 'antd'
import {
  BellOutlined,
  DollarOutlined,
  DownOutlined,
  LogoutOutlined,
  MoonOutlined,
  PlusOutlined,
  SunOutlined,
} from '@ant-design/icons'
import { useColorMode } from '@/components/providers/color-mode-provider'
import { PaymentModal } from '@/components/orders/payment-modal'
import { useBusiness } from '@/contexts/business-context'
import type { Identity } from '@/lib/refine/auth-provider'
import { BusinessSwitcher } from './business-switcher'

/**
 * Signs out through Refine's authProvider, then reloads on /sign-in so no
 * in-memory state (selected business, cached queries) survives, as before.
 */
function useSignOut() {
  const { mutate: logout } = useLogout()
  return () =>
    logout(
      { redirectPath: false },
      {
        onSuccess: () => {
          window.location.href = '/sign-in'
        },
        onError: (error) => console.error('Error signing out:', error),
      }
    )
}

/**
 * Shell header: business switcher on the left; the global "Create New Order"
 * (opens /orders/create) and "Add New Payment" (payment modal with an order
 * picker) actions, the light/dark toggle, a notifications bell and the user
 * menu on the right.
 */
export function ShellHeader() {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const compact = !screens.md
  const { mode, toggle } = useColorMode()
  const { data: user } = useGetIdentity<Identity | null>()
  const router = useRouter()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const actions = {
    openOrderDialog: () => router.push('/orders/create'),
    openPaymentDialog: () => setPaymentOpen(true),
  }
  const { isAll } = useBusiness()
  const signOut = useSignOut()
  const readOnlyTitle = isAll ? 'Read-only: pick one business' : undefined
  // Payments are admin-only to write (database policy); staff see the button disabled.
  const { data: canAddPayment } = useCan({ resource: 'payments', action: 'create' })
  const paymentDisabled = isAll || !canAddPayment?.can
  const paymentTitle = readOnlyTitle ?? (canAddPayment && !canAddPayment.can ? canAddPayment.reason : undefined)

  return (
    <Layout.Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        height: 64,
        paddingInline: compact ? 12 : 24,
        paddingTop: 'env(safe-area-inset-top)',
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center' }}>
        <BusinessSwitcher />
      </div>

      <Space size={compact ? 4 : 8} align="center">
        {compact ? (
            <Dropdown
              disabled={isAll}
              menu={{
                items: [
                  { key: 'order', icon: <PlusOutlined />, label: 'New order', onClick: actions.openOrderDialog },
                  {
                    key: 'payment',
                    icon: <DollarOutlined />,
                    label: 'Add payment',
                    disabled: paymentDisabled,
                    title: paymentTitle,
                    onClick: actions.openPaymentDialog,
                  },
                ],
              }}
            >
              <Button type="primary" icon={<PlusOutlined />} title={readOnlyTitle}>
                Create
              </Button>
            </Dropdown>
          ) : (
            <>
              <Button type="primary" icon={<PlusOutlined />} onClick={actions.openOrderDialog} disabled={isAll} title={readOnlyTitle}>
                {screens.lg ? 'Create New Order' : 'Order'}
              </Button>
              <Button icon={<DollarOutlined />} onClick={actions.openPaymentDialog} disabled={paymentDisabled} title={paymentTitle}>
                {screens.lg ? 'Add New Payment' : 'Payment'}
              </Button>
            </>
          )}
        <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} />

        <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <Button
            type="text"
            shape="circle"
            aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            onClick={toggle}
          />
        </Tooltip>

        <Tooltip title="No new notifications">
          <Button type="text" shape="circle" aria-label="Notifications" icon={<BellOutlined />} />
        </Tooltip>

        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'who',
                disabled: true,
                label: (
                  <Space direction="vertical" size={0}>
                    <Typography.Text strong>{user?.name ?? 'User'}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {user?.email}
                    </Typography.Text>
                  </Space>
                ),
              },
              { type: 'divider' },
              { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: signOut },
            ],
          }}
        >
          <Button type="text" style={{ height: 40, paddingInline: 6 }} aria-label="Account menu">
            <Space size={8}>
              <Avatar size={32} style={{ background: token.colorPrimary }}>
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </Avatar>
              {!compact && (
                <>
                  <Typography.Text strong>{user?.name ?? 'User'}</Typography.Text>
                  {user?.role && <Tag color={user.role === 'admin' ? 'blue' : 'default'}>{user.role}</Tag>}
                  <DownOutlined style={{ fontSize: 10 }} />
                </>
              )}
            </Space>
          </Button>
        </Dropdown>
      </Space>
    </Layout.Header>
  )
}
