"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OrderMultiStepForm } from "@/components/forms/order-multistep-form"
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
        className="w-[95vw] max-w-none sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[70vw] 2xl:w-[60vw] max-h-[95vh] overflow-y-auto"
        style={{ width: '70vw', maxWidth: 'none' }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {order ? `Edit Order ${order.order_number}` : "Create New Order"}
          </DialogTitle>
          <DialogDescription>
            {order
              ? "Update the order information, measurements, and payment details."
              : "Create a new order with customer information, measurements, and payment details."}
          </DialogDescription>
        </DialogHeader>
        <OrderMultiStepForm
          order={order}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </DialogContent>
    </Dialog>
  )
}