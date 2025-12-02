"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const VendorBillSchema = z.object({
  entry_date: z.string().min(1, "Date is required"),
  particulars: z.string().min(1, "Particulars is required"),
  amount: z.string().min(1, "Amount is required"),
  notes: z.string().optional(),
})

type VendorBillInput = z.infer<typeof VendorBillSchema>

interface VendorBillFormProps {
  vendorId: string
  vendorName: string
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
}

export function VendorBillForm({ vendorId, vendorName, onSubmit, onCancel }: VendorBillFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<VendorBillInput>({
    resolver: zodResolver(VendorBillSchema),
    defaultValues: {
      entry_date: new Date().toISOString().split('T')[0],
      particulars: "",
      amount: "",
      notes: "",
    },
  })

  const handleSubmit = async (data: VendorBillInput) => {
    setIsSubmitting(true)
    try {
      const amount = parseFloat(data.amount)
      const submitData = {
        vendor_id: vendorId,
        entry_date: data.entry_date,
        particulars: data.particulars,
        debit: null,
        credit: amount, // Credit = Bill/invoice from vendor
        notes: data.notes || null,
      }
      await onSubmit(submitData)
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="bg-muted p-3 rounded-md mb-4">
          <p className="text-sm text-muted-foreground">
            Creating bill for: <strong>{vendorName}</strong>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            📄 This will create a <strong>Credit entry</strong> in vendor ledger (bill/invoice from vendor)
          </p>
        </div>

        <FormField
          control={form.control}
          name="entry_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="particulars"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Particulars</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Fabric purchase, Material payment"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Additional notes"
                  className="resize-none"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Bill
          </Button>
        </div>
      </form>
    </Form>
  )
}
