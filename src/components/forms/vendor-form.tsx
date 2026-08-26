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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useVendorCategories } from "@/hooks/use-api"
import type { Vendor } from "@/lib/supabase-client"

// "none" is a sentinel for the Select value, since Radix Select cannot use an
// empty string as an item value. Mapped back to null/undefined on submit --
// every vendor's category is optional.
const NO_CATEGORY = "none"

const VendorSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  notes: z.string().optional(),
  category_id: z.string().optional(),
})

type VendorInput = z.infer<typeof VendorSchema>

interface VendorFormProps {
  vendor?: Vendor | null
  onSubmit: (data: VendorInput) => Promise<void>
  onCancel: () => void
}

export function VendorForm({ vendor, onSubmit, onCancel }: VendorFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { data: categories = [] } = useVendorCategories()

  const form = useForm<VendorInput>({
    resolver: zodResolver(VendorSchema),
    defaultValues: {
      name: vendor?.name || "",
      notes: vendor?.notes || "",
      category_id: vendor?.category_id || NO_CATEGORY,
    },
  })

  const handleSubmit = async (data: VendorInput) => {
    setIsSubmitting(true)
    try {
      await onSubmit({
        ...data,
        category_id: data.category_id === NO_CATEGORY ? undefined : data.category_id,
      })
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vendor Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter vendor name"
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
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category (Optional)</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger disabled={isSubmitting}>
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter description or notes about this vendor"
                  className="resize-none"
                  rows={3}
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
            {vendor ? "Update Vendor" : "Create Vendor"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
