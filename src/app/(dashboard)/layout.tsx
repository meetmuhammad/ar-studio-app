"use client"

import { useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { RouteGuard } from '@/components/auth/route-guard'
import { OrderDialog } from '@/components/dialogs/order-dialog'
import { PaymentDialog } from '@/components/dialogs/payment-dialog'
import { CreateOrderInput } from '@/lib/validators'
import { toast } from 'sonner'

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
      const response = await fetch('/api/orders', {
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

  return (
    <RouteGuard requireAuth={true} requiredRoles={['admin', 'staff']}>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header 
            onCreateOrder={openOrderDialog}
            onAddPayment={openPaymentDialog}
          />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-muted/40 p-6">
            {children}
          </main>
        </div>
        
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
    </RouteGuard>
  )
}
