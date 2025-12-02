"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { VendorForm } from "@/components/forms/vendor-form"
import type { Vendor } from "@/lib/supabase-client"

interface VendorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendor?: Vendor | null
  onSuccess?: () => void
}

export function VendorDialog({
  open,
  onOpenChange,
  vendor,
  onSuccess,
}: VendorDialogProps) {
  const handleSubmit = async (data: any) => {
    const url = vendor ? `/api/vendors/${vendor.id}` : '/api/vendors'
    const method = vendor ? 'PUT' : 'POST'
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to save vendor')
    }

    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{vendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          <DialogDescription>
            {vendor ? "Update the vendor details" : "Create a new vendor"}
          </DialogDescription>
        </DialogHeader>
        <VendorForm
          vendor={vendor}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
