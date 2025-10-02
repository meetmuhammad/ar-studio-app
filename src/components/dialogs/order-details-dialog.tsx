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

  // Check if measurements are linked
  const hasMeasurements = order.measurement_id !== null && order.measurement_id !== undefined

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

          {/* Payment Information */}
          {(order.total_amount || order.advance_paid || order.payment_method) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  💰 Payment Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {order.payment_method && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Method:</span>
                    <span className="text-sm font-semibold capitalize">
                      {order.payment_method === 'bank' ? 'Bank Transfer' : order.payment_method}
                    </span>
                  </div>
                )}
                
                {order.total_amount && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Total:</span>
                    <span className="text-sm font-mono font-bold text-green-600">
                      PKR {order.total_amount.toFixed(2)}
                    </span>
                  </div>
                )}
                
                {order.advance_paid !== undefined && order.advance_paid !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Advance:</span>
                    <span className="text-sm font-mono font-bold text-foreground">
                      PKR {order.advance_paid.toFixed(2)}
                    </span>
                  </div>
                )}
                
                {order.total_amount && order.advance_paid !== undefined && order.advance_paid !== null && (
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-medium text-muted-foreground">Balance:</span>
                    <span className="text-sm font-mono font-bold text-red-600">
                      PKR {Math.max(0, order.total_amount - order.advance_paid).toFixed(2)}
                    </span>
                  </div>
                )}
                
                {/* Show overpaid warning if applicable */}
                {order.total_amount && order.advance_paid && order.advance_paid > order.total_amount && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-yellow-800">Overpaid Amount:</span>
                      <span className="text-sm font-mono font-bold text-yellow-600">
                        PKR {(order.advance_paid - order.total_amount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Measurements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                📏 Measurements
                {hasMeasurements ? (
                  <Badge variant="default" className="text-xs">
                    ✅ Linked
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    ❌ None
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hasMeasurements ? (
                <div className="text-center py-6">
                  <div className="text-sm text-muted-foreground mb-2">
                    This order has measurements linked from the customer's measurement profile.
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Measurement ID: <span className="font-mono">{order.measurement_id}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <div className="text-sm mb-2">No measurements linked to this order.</div>
                  <div className="text-xs">
                    Measurements can be added from the order edit form or the Measurements page.
                  </div>
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