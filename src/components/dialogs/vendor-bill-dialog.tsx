"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { VendorBillForm } from "@/components/forms/vendor-bill-form"
import { toast } from "sonner"

interface VendorBillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendorId: string
  vendorName: string
  onSuccess: () => void
}

export function VendorBillDialog({
  open,
  onOpenChange,
  vendorId,
  vendorName,
  onSuccess,
}: VendorBillDialogProps) {
  const handleSubmit = async (data: any) => {
    try {
      const response = await fetch('/api/vendor-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || 'Failed to create bill')
        throw new Error(error.error || 'Failed to create bill')
      }

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating bill:', error)
      if (error instanceof Error && !error.message.includes('Failed to create bill')) {
        toast.error('An unexpected error occurred')
      }
      throw error
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Bill</DialogTitle>
          <DialogDescription>
            Create a bill/invoice from this vendor. This creates a Credit entry in the vendor's sub-ledger only (not in main ledger).
          </DialogDescription>
        </DialogHeader>
        <VendorBillForm
          vendorId={vendorId}
          vendorName={vendorName}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
