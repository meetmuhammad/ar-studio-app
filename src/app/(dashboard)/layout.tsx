"use client"

import { useMemo, useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { RouteGuard } from '@/components/auth/route-guard'
import { OrderDialog } from '@/components/dialogs/order-dialog'
import { PaymentDialog } from '@/components/dialogs/payment-dialog'
import { BottomNav } from '@/components/dashboard/bottom-nav'
import { CreateOrderInput } from '@/lib/validators'
import { DashboardActionsProvider } from '@/contexts/dashboard-actions'
import { toast } from 'sonner'
import { authFetch } from '@/lib/auth-fetch'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
    <RouteGuard requireAuth={true} requiredRoles={['admin', 'staff']}>
      <DashboardActionsProvider value={dashboardActions}>
      {/* h-dvh, not h-screen: on phones 100vh is taller than the visible area
          while the browser toolbar is showing, which pushes the bottom of the
          page (and the tab bar) off screen. */}
      <div className="flex h-dvh bg-background">
        {/* Tablet (md-lg): icon rail. Desktop (lg+): full sidebar. Phones: the
            bottom tab bar below replaces both. */}
        <aside className="hidden md:flex w-[4.5rem] lg:w-64 border-r">
          <Sidebar responsiveRail />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header />
          {/* bg-background, not bg-muted/40: the page surface is now a distinct
              step below the white cards, so the extra tint only muddied it.
              Bottom padding on phones clears the fixed tab bar plus the home
              indicator, so the last row is never covered. */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-background p-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:p-6">
            {children}
          </main>
        </div>

        <BottomNav />

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
      </div>
      </DashboardActionsProvider>
    </RouteGuard>
  )
}
