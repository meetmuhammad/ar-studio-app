"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Calendar } from "lucide-react"
import { format } from "date-fns"

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CustomerCombobox } from "@/components/combobox/customer-combobox"
import { CreateOrderSchema, CreateOrderInput } from "@/lib/validators"
import type { OrderWithCustomer } from "@/lib/supabase-client"
import { cn } from "@/lib/utils"

interface OrderFormProps {
  order?: OrderWithCustomer | null
  onSubmit: (data: CreateOrderInput) => Promise<void>
  onCancel: () => void
}

export function OrderForm({ order, onSubmit, onCancel }: OrderFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<CreateOrderInput>({
    resolver: zodResolver(CreateOrderSchema) as any,
    mode: "onTouched", // Only validate after field is touched
    defaultValues: {
      customerId: order?.customer_id || "",
      bookingDate: order?.booking_date ? new Date(order.booking_date) : new Date(),
      deliveryDate: order?.delivery_date ? new Date(order.delivery_date) : (() => {
        const defaultDelivery = new Date()
        defaultDelivery.setDate(defaultDelivery.getDate() + 7) // Default to 1 week from now
        return defaultDelivery
      })(),
      comments: order?.comments || "",
      // Reference to measurements table
      measurementId: order?.measurement_id || undefined,
      fittingPreferences: "",
      // Payment fields with default values
      totalAmount: order?.total_amount || 0,
      advancePaid: order?.advance_paid || 0,
      balance: order?.balance || 0,
      paymentMethod: order?.payment_method || "cash",
    },
  })

  const handleSubmit = async (data: CreateOrderInput) => {
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
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {/* General Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">General Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer</FormLabel>
                  <FormControl>
                    <CustomerCombobox
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="bookingDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Booking Date</FormLabel>
                    <FormControl>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isSubmitting}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              "Select booking date"
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deliveryDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Delivery Date (Optional)</FormLabel>
                    <FormControl>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isSubmitting}
                          >
                            <Calendar className="mr-2 h-4 w-4" />
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              "Select delivery date"
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="comments"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Comments</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Order comments or special instructions"
                      className="resize-none"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Note about measurements */}
        <Card>
          <CardContent className="py-4">
            <div className="text-center text-sm text-muted-foreground">
              <p>📏 Measurements are now managed separately in the <strong>Measurements</strong> tab.</p>
              <p>Use the multi-step order form to include measurements with orders.</p>
            </div>
          </CardContent>
        </Card>

        {/* Form Actions */}
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
            {order ? "Update Order" : "Create Order"}
          </Button>
        </div>
      </form>
    </Form>
  )
}