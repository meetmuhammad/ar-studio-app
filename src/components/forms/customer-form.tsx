"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"

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
import { CreateCustomerSchema, CreateCustomerInput } from "@/lib/validators"
import type { Customer } from "@/lib/supabase-client"

interface CustomerFormProps {
  customer?: Customer | null
  onSubmit: (data: CreateCustomerInput) => Promise<void>
  onCancel: () => void
}

export function CustomerForm({ customer, onSubmit, onCancel }: CustomerFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(CreateCustomerSchema),
    defaultValues: {
      name: customer?.name || "",
      phone: customer?.phone || "",
      address: customer?.address || "",
    },
  })

  const handleSubmit = async (data: CreateCustomerInput) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data)
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
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter customer name"
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
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input
                  placeholder="+1234567890"
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
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Enter customer address"
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
            {customer ? "Update Customer" : "Create Customer"}
          </Button>
        </div>
      </form>
    </Form>
  )
}