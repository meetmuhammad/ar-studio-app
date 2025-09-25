"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OrderForm } from "@/components/forms/order-form"
import { CreateOrderInput } from "@/lib/validators"
import type { OrderWithCustomer } from "@/lib/supabase-client"

interface OrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: OrderWithCustomer | null
  onSubmit: (data: CreateOrderInput) => Promise<void>
}

export function OrderDialog({
  open,
  onOpenChange,
  order,
  onSubmit,
}: OrderDialogProps) {
  const handleSubmit = async (data: CreateOrderInput) => {
    await onSubmit(data)
    onOpenChange(false)
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-6xl max-h-[95vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {order ? `Edit Order ${order.order_number}` : "Create New Order"}
          </DialogTitle>
          <DialogDescription>
            {order
              ? "Update the order information and measurements below."
              : "Create a new order with customer information and measurements."}
          </DialogDescription>
        </DialogHeader>
        <OrderForm
          order={order}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </DialogContent>
    </Dialog>
  )
}