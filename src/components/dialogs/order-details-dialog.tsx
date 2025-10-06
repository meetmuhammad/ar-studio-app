"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { OrderWithCustomer } from "@/lib/supabase-client"

interface Payment {
  id: string
  order_id: string
  customer_id: string
  amount: number
  payment_method: string
  payment_date: string
  notes?: string
  created_at: string
}

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
  const [payments, setPayments] = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)

  // Fetch payments when dialog opens and order changes
  useEffect(() => {
    if (open && order) {
      fetchPayments(order.id)
    }
  }, [open, order])

  // Early return after all hooks
  if (!order) return null

  // Check if measurements are linked
  const hasMeasurements = order.measurement_id !== null && order.measurement_id !== undefined

  const fetchPayments = async (orderId: string) => {
    try {
      setLoadingPayments(true)
      const response = await fetch(`/api/payments?order_id=${orderId}`)
      if (!response.ok) throw new Error('Failed to fetch payments')
      
      const data = await response.json()
      setPayments(data.payments || [])
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoadingPayments(false)
    }
  }

  const calculateTotalPaid = () => {
    const advancePaid = order.advance_paid || 0
    const additionalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0)
    return advancePaid + additionalPayments
  }

  const calculateBalance = () => {
    return (order.total_amount || 0) - calculateTotalPaid()
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

          {/* Payment Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                💰 Payment Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Payment Summary Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Date</TableHead>
                    <TableHead className="text-left">Description</TableHead>
                    <TableHead className="text-right">Amount (PKR)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Show advance payment if paid */}
                  {(order.advance_paid && order.advance_paid > 0) && (
                    <TableRow>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(order.booking_date), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-medium text-green-700">Advance Payment</TableCell>
                      <TableCell className="text-right font-mono text-green-700">
                        -{(order.advance_paid || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Show additional payments */}
                  {loadingPayments ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                        Loading payments...
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="font-medium text-green-700">
                          {payment.notes || `Payment via ${payment.payment_method}`}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-700">
                          -{payment.amount.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {/* Show message if no payments */}
                  {!loadingPayments && (!order.advance_paid || order.advance_paid === 0) && payments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                        No payments recorded
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-mono text-sm">
                      {format(new Date(order.booking_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-bold">Total Order Amount</TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {(order.total_amount || 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell></TableCell>
                    <TableCell className="font-bold">Balance Due</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${
                      calculateBalance() > 0 ? 'text-orange-600' : 
                      calculateBalance() < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {calculateBalance().toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>

              {/* Payment Status Messages */}
              {calculateBalance() === 0 && (
                <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-600">✓ Paid in Full</Badge>
                    <span className="text-sm text-green-700 dark:text-green-400">
                      This order has been completely paid.
                    </span>
                  </div>
                </div>
              )}
              {calculateBalance() < 0 && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">Overpaid</Badge>
                    <span className="text-sm text-red-700 dark:text-red-400">
                      Customer has paid PKR {Math.abs(calculateBalance()).toFixed(2)} more than the order amount.
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

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
                    This order has measurements linked from the customer&apos;s measurement profile.
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