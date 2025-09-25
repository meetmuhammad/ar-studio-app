"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CustomerForm } from "@/components/forms/customer-form"
import { CreateCustomerInput } from "@/lib/validators"
import type { Customer } from "@/lib/supabase-client"

interface CustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: Customer | null
  onSubmit: (data: CreateCustomerInput) => Promise<void>
}

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  onSubmit,
}: CustomerDialogProps) {
  const handleSubmit = async (data: CreateCustomerInput) => {
    await onSubmit(data)
    onOpenChange(false)
  }

  const handleCancel = () => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[425px]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {customer ? "Edit Customer" : "Create New Customer"}
          </DialogTitle>
          <DialogDescription>
            {customer
              ? "Update the customer information below."
              : "Add a new customer to your database."}
          </DialogDescription>
        </DialogHeader>
        <CustomerForm
          customer={customer}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </DialogContent>
    </Dialog>
  )
}