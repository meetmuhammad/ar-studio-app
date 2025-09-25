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
import { MeasurementField, measurementSections } from "./measurement-field"
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
    defaultValues: {
      customerId: order?.customer_id || "",
      bookingDate: order?.booking_date ? new Date(order.booking_date) : new Date(),
      deliveryDate: order?.delivery_date ? new Date(order.delivery_date) : undefined,
      comments: order?.comments || "",
      // Measurements
      chest: order?.chest || undefined,
      waist: order?.waist || undefined,
      hips: order?.hips || undefined,
      sleeves: order?.sleeves || undefined,
      neck: order?.neck || undefined,
      shoulder: order?.shoulder || undefined,
      crossBack: order?.cross_back || undefined,
      biceps: order?.biceps || undefined,
      wrist: order?.wrist || undefined,
      coatLength: order?.coat_length || undefined,
      threePieceWaistcoat: order?.three_piece_waistcoat || undefined,
      waistcoatLength: order?.waistcoat_length || undefined,
      sherwaniLength: order?.sherwani_length || undefined,
      pantWaist: order?.pant_waist || undefined,
      pantLength: order?.pant_length || undefined,
      thigh: order?.thigh || undefined,
      knee: order?.knee || undefined,
      bottom: order?.bottom || undefined,
      shoeSize: order?.shoe_size || undefined,
      turbanLength: order?.turban_length || undefined,
      fittingPreferences: order?.fitting_preferences || "",
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

        {/* Measurements */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Measurements</CardTitle>
            <p className="text-sm text-muted-foreground">
              All measurements are optional. Enter values in centimeters.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.entries(measurementSections).map(([key, section]) => (
              <div key={key}>
                <h4 className="font-medium text-sm mb-3">{section.title}</h4>
                <div className="grid grid-cols-3 gap-3">
                  {section.fields.map((field) => (
                    <MeasurementField
                      key={field.name}
                      control={form.control}
                      name={field.name as keyof CreateOrderInput}
                      label={field.label}
                      disabled={isSubmitting}
                    />
                  ))}
                </div>
                {key !== "accessories" && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Fitting Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Fitting Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="fittingPreferences"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fitting Preferences & Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Specify fitting style, adjustments, or special requirements"
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