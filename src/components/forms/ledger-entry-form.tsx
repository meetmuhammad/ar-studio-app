"use client"

import { useState, useEffect } from "react"
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
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Vendor, LedgerEntryType, GeneralLedger } from "@/lib/supabase-client"

const LedgerEntrySchema = z.object({
  entry_date: z.string().min(1, "Entry date is required"),
  particulars: z.string().optional(),
  amount: z.string().min(1, "Amount is required"),
  transaction_type: z.enum(["debit", "credit"], {
    message: "Transaction type is required",
  }),
  entry_type: z.enum(["opening_balance", "order_payment", "vendor_payment", "miscellaneous"], {
    message: "Entry type is required",
  }),
  vendor_id: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => {
  // For non-vendor entries, particulars is required
  if (data.entry_type !== "vendor_payment" && !data.particulars) {
    return false
  }
  // For vendor entries, vendor_id is required
  if (data.entry_type === "vendor_payment" && !data.vendor_id) {
    return false
  }
  return true
}, {
  message: "Particulars is required for this entry type",
  path: ["particulars"],
})

type LedgerEntryInput = z.infer<typeof LedgerEntrySchema>

interface LedgerEntryFormProps {
  entry?: GeneralLedger | null
  onSubmit: (data: any) => Promise<void>
  onCancel: () => void
}

export function LedgerEntryForm({ entry, onSubmit, onCancel }: LedgerEntryFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [vendors, setVendors] = useState<Vendor[]>([])

  const form = useForm<LedgerEntryInput>({
    resolver: zodResolver(LedgerEntrySchema),
    defaultValues: {
      entry_date: entry?.entry_date || new Date().toISOString().split('T')[0],
      particulars: entry?.particulars || "",
      amount: entry ? String(entry.debit || entry.credit || "") : "",
      transaction_type: entry?.debit ? "debit" : "credit",
      entry_type: entry?.entry_type || "miscellaneous",
      vendor_id: entry?.vendor_id || "",
      notes: entry?.notes || "",
    },
  })

  const entryType = form.watch("entry_type")
  const vendorId = form.watch("vendor_id")

  // Auto-set transaction type to Credit for vendor payments
  useEffect(() => {
    if (entryType === "vendor_payment") {
      form.setValue("transaction_type", "credit")
    }
  }, [entryType, form])

  // Auto-set particulars to vendor name when vendor is selected
  useEffect(() => {
    if (entryType === "vendor_payment" && vendorId && vendors.length > 0) {
      const selectedVendor = vendors.find(v => v.id === vendorId)
      if (selectedVendor) {
        form.setValue("particulars", `Payment to ${selectedVendor.name}`)
      }
    }
  }, [vendorId, entryType, vendors, form])

  useEffect(() => {
    // Fetch vendors for the dropdown
    fetch('/api/vendors')
      .then(res => res.json())
      .then(data => setVendors(data))
      .catch(err => console.error('Error fetching vendors:', err))
  }, [])

  const handleSubmit = async (data: LedgerEntryInput) => {
    setIsSubmitting(true)
    try {
      const amount = parseFloat(data.amount)
      const submitData = {
        entry_date: data.entry_date,
        particulars: data.particulars,
        debit: data.transaction_type === "debit" ? amount : null,
        credit: data.transaction_type === "credit" ? amount : null,
        entry_type: data.entry_type,
        vendor_id: data.vendor_id || null,
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
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="entry_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entry Date</FormLabel>
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
            name="entry_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entry Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger disabled={isSubmitting}>
                      <SelectValue placeholder="Select entry type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="opening_balance">Opening Balance</SelectItem>
                    <SelectItem value="vendor_payment">Vendor Payment</SelectItem>
                    <SelectItem value="miscellaneous">Miscellaneous</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Show vendor selection for vendor payments */}
        {entryType === "vendor_payment" && (
          <FormField
            control={form.control}
            name="vendor_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vendor *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger disabled={isSubmitting}>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription className="text-xs">
                  The vendor name will be used as the particulars
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Hide particulars field for vendor payments - it's auto-populated */}
        {entryType !== "vendor_payment" && (
          <FormField
            control={form.control}
            name="particulars"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Particulars</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter transaction details"
                    {...field}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
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

          {/* Hide transaction type for vendor payments (always Credit) */}
          {entryType !== "vendor_payment" && (
            <FormField
              control={form.control}
              name="transaction_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger disabled={isSubmitting}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="debit">Debit (Money In)</SelectItem>
                      <SelectItem value="credit">Credit (Money Out)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs">
                    {field.value === "debit" ? "Money received/income" : "Money paid/expense"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Show info message for vendor payments */}
          {entryType === "vendor_payment" && (
            <div className="flex items-center">
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                💳 <strong>Vendor payments are always Credit</strong> (money OUT to vendor)
              </div>
            </div>
          )}
        </div>

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
            {entry ? "Update Entry" : "Add Entry"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
