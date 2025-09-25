"use client"

import { format } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { OrderWithCustomer } from "@/lib/supabase-client"
import { measurementSections } from "@/components/forms/measurement-field"

interface OrderDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: OrderWithCustomer | null
}

export function OrderDetailsDialog({
  open,
  onOpenChange,
  order,
}: OrderDetailsDialogProps) {
  if (!order) return null

  // Get all non-null measurements
  const measurements = {
    chest: order.chest,
    waist: order.waist,
    hips: order.hips,
    sleeves: order.sleeves,
    neck: order.neck,
    shoulder: order.shoulder,
    crossBack: order.cross_back,
    biceps: order.biceps,
    wrist: order.wrist,
    coatLength: order.coat_length,
    threePieceWaistcoat: order.three_piece_waistcoat,
    waistcoatLength: order.waistcoat_length,
    sherwaniLength: order.sherwani_length,
    pantWaist: order.pant_waist,
    pantLength: order.pant_length,
    thigh: order.thigh,
    knee: order.knee,
    bottom: order.bottom,
    shoeSize: order.shoe_size,
    turbanLength: order.turban_length,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="w-[95vw] max-w-none sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[70vw] 2xl:w-[60vw] max-h-[95vh] overflow-y-auto"
        style={{ width: '70vw', maxWidth: 'none' }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Order Details
            <Badge variant="secondary" className="font-mono">
              {order.order_number}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Complete order information including measurements and customer details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Combined Customer and Order Information - Compact Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Customer Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Customer Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Name:</span>
                  <span className="font-medium">{order.customers.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Phone:</span>
                  <span className="font-mono text-sm">{order.customers.phone}</span>
                </div>
                {order.customers.address && (
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Address:</span>
                    <span className="text-sm text-right max-w-[200px]">{order.customers.address}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Order Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Booking Date:</span>
                  <span className="text-sm">{format(new Date(order.booking_date), "MMM d, yyyy")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Delivery Date:</span>
                  <span className="text-sm">
                    {order.delivery_date 
                      ? format(new Date(order.delivery_date), "MMM d, yyyy")
                      : <span className="text-muted-foreground">Not set</span>
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Created:</span>
                  <span className="text-sm">{format(new Date(order.created_at), "MMM d, yyyy 'at' HH:mm")}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Comments - Only if exists */}
          {order.comments && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Comments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm bg-muted p-3 rounded-md">{order.comments}</div>
              </CardContent>
            </Card>
          )}

          {/* Measurements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Measurements</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.values(measurements).some(m => m !== null && m !== undefined) ? (
                <div className="space-y-6">
                  {Object.entries(measurementSections).map(([key, section]) => {
                    // Filter out fields that have no values
                    const sectionMeasurements = section.fields.filter(field => {
                      const value = measurements[field.name as keyof typeof measurements]
                      return value !== null && value !== undefined
                    })

                    if (sectionMeasurements.length === 0) return null

                    return (
                      <div key={key}>
                        <h4 className="font-medium text-sm mb-3">{section.title}</h4>
                        <div className="grid grid-cols-3 gap-4">
                          {sectionMeasurements.map((field) => {
                            const value = measurements[field.name as keyof typeof measurements]
                            return (
                              <div key={field.name} className="text-sm">
                                <div className="text-muted-foreground">{field.label}</div>
                                <div className="font-mono font-medium">{value} cm</div>
                              </div>
                            )
                          })}
                        </div>
                        {key !== "accessories" && sectionMeasurements.length > 0 && <Separator className="mt-4" />}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No measurements recorded for this order.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fitting Preferences */}
          {order.fitting_preferences && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Fitting Preferences</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm bg-muted p-3 rounded-md">
                  {order.fitting_preferences}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}