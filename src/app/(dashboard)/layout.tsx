"use client"

import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Authenticated } from '@refinedev/core'
import { ThemedLayout, ThemedSider } from '@refinedev/antd'
import { Alert, Flex, Grid, Result, Spin, Typography } from 'antd'
import { BusinessScopeSync } from '@/components/providers/refine-provider'
import { ShellHeader } from '@/components/refine/header'
import { OrderDialog } from '@/components/dialogs/order-dialog'
import { PaymentDialog } from '@/components/dialogs/payment-dialog'
import { CreateOrderInput } from '@/lib/validators'
import { DashboardActionsProvider } from '@/contexts/dashboard-actions'
import { toast } from 'sonner'
import { authFetch } from '@/lib/auth-fetch'
import { BusinessProvider, useBusiness } from '@/contexts/business-context'

/**
 * Routes already built with Refine + antd. Every other dashboard route is a
 * legacy shadcn page and is wrapped in .legacy-page, which keeps the legacy
 * base styles (links, touch targets) scoped away from the antd shell.
 * Add a module's routes here when it is ported.
 */
const REFINE_MODULES = ['/customers', '/measurements']
const isRefineRoute = (pathname: string) =>
  pathname === '/' || REFINE_MODULES.some((base) => pathname === base || pathname.startsWith(`${base}/`))

/** Refine's sider without its built-in logout item (sign out lives in the header user menu). */
function ShellSider() {
  return <ThemedSider fixed render={({ items }) => items} />
}

function FullScreenStatus({ label }: { label: string }) {
  return (
    <Flex vertical align="center" justify="center" gap={16} style={{ minHeight: '100dvh' }}>
      <Spin size="large" />
      <Typography.Text type="secondary">{label}</Typography.Text>
    </Flex>
  )
}

/**
 * Page content for the selected business. Keyed by the switch generation, so
 * switching business remounts the page (and the global dialogs) and every
 * fetch runs again for the new business. Nothing renders until a business is
 * chosen, so no request goes out on the ATC fallback by accident.
 */
function BusinessScoped({ children, quiet = false }: { children: React.ReactNode; quiet?: boolean }) {
  const { ready, noAccess, isAll, generation } = useBusiness()

  // Global dialogs: nothing until a business is chosen, no banner.
  if (quiet) return ready && !noAccess ? <div key={generation} className="contents">{children}</div> : null

  if (noAccess) {
    return (
      <Result
        status="403"
        subTitle="Your account has not been given access to any business yet. Ask an administrator."
      />
    )
  }
  if (!ready) {
    return (
      <Flex justify="center" style={{ padding: '64px 0' }}>
        <Spin tip="Loading…">
          <div style={{ width: 120, height: 40 }} />
        </Spin>
      </Flex>
    )
  }

  return (
    <div key={generation} className="contents">
      {isAll && (
        <Alert
          role="status"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              <strong>All businesses</strong> — combined, read-only view. Each business keeps its own books, so there
              is no shared running balance. Switch to one business to add or edit.
            </span>
          }
        />
      )}
      {children}
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const legacy = !isRefineRoute(usePathname())
  const screens = Grid.useBreakpoint()
  const [orderDialog, setOrderDialog] = useState<{
    open: boolean
    order?: null
  }>({ open: false, order: null })
  
  const [paymentDialog, setPaymentDialog] = useState<{
    open: boolean
  }>({ open: false })

  // Handle create order
  const handleCreateOrder = async (data: CreateOrderInput) => {
    try {
      const response = await authFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create order')
      }

      toast.success('Order created successfully')
      // Optionally, trigger a refresh of orders data across the app
      window.dispatchEvent(new CustomEvent('orderCreated'))
    } catch (error) {
      console.error('Error creating order:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create order')
      throw error
    }
  }

  const openOrderDialog = () => {
    setOrderDialog({ open: true, order: null })
  }
  
  const openPaymentDialog = () => {
    setPaymentDialog({ open: true })
  }
  
  const handlePaymentSuccess = () => {
    // Optionally refresh any payment-related data
    window.dispatchEvent(new CustomEvent('paymentAdded'))
  }

  // Exposed to pages so PageHeader can render these as page-level actions.
  // The dialogs, handlers, and events above are unchanged.
  const dashboardActions = useMemo(
    () => ({ openOrderDialog, openPaymentDialog }),
    []
  )

  return (
    <Authenticated
      key="dashboard"
      redirectOnFail="/sign-in"
      appendCurrentPathToQuery={false}
      loading={<FullScreenStatus label="Checking authentication..." />}
    >
      <BusinessProvider>
      <BusinessScopeSync />
      <DashboardActionsProvider value={dashboardActions}>
      <div className="ar-antd">
        {/* Refine antd shell: sidebar menu from the resources, filtered per
            item by the accessControlProvider (CanAccess inside ThemedSider);
            collapsible on desktop, a drawer on phones. */}
        <ThemedLayout
          Header={ShellHeader}
          Sider={ShellSider}
        >
          {/* Below lg the sider is a drawer whose toggle button is fixed just
              under the header; the top padding keeps it off the page title. */}
          <main
            className={legacy ? 'legacy-page' : undefined}
            style={{ paddingTop: screens.lg === false ? 44 : 0, paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <BusinessScoped>{children}</BusinessScoped>
          </main>
        </ThemedLayout>
      </div>

        {/* Global dialogs, inside BusinessScoped so a switch remounts them too. */}
        <BusinessScoped quiet>
        {/* Global Order Dialog */}
        <OrderDialog
          open={orderDialog.open}
          onOpenChange={(open) => setOrderDialog({ open, order: null })}
          order={null}
          onSubmit={handleCreateOrder}
        />
        
        {/* Global Payment Dialog */}
        <PaymentDialog
          open={paymentDialog.open}
          onOpenChange={(open) => setPaymentDialog({ open })}
          onSuccess={handlePaymentSuccess}
        />
        </BusinessScoped>
      </DashboardActionsProvider>
      </BusinessProvider>
    </Authenticated>
  )
}
