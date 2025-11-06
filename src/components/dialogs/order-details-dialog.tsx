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
import { Button } from "@/components/ui/button"
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
import { Printer, FileText, Edit, Save, X } from "lucide-react"
import { openPrintPreview, openMeasurementPrintPreview } from "@/lib/print-utils"
import type { OrderWithCustomer } from "@/lib/supabase-client"
import { Measurement } from "@/types/measurements"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

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
  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  const [loadingMeasurement, setLoadingMeasurement] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)

  // Fetch payments and measurements when dialog opens and order changes
  useEffect(() => {
    if (open && order) {
      fetchPayments(order.id)
      if (order.measurement_id) {
        fetchMeasurement(order.measurement_id)
      }
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

  const fetchMeasurement = async (measurementId: string) => {
    try {
      setLoadingMeasurement(true)
      const response = await fetch(`/api/measurements/${measurementId}`)
      if (!response.ok) throw new Error('Failed to fetch measurement')
      
      const data = await response.json()
      setMeasurement(data.measurement || null)
    } catch (error) {
      console.error('Error fetching measurement:', error)
      setMeasurement(null)
    } finally {
      setLoadingMeasurement(false)
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

  const handleEditPayment = (payment: Payment) => {
    setEditingPaymentId(payment.id)
    setEditAmount(payment.amount.toString())
  }

  const handleCancelEdit = () => {
    setEditingPaymentId(null)
    setEditAmount("")
  }

  const handleSavePayment = async (paymentId: string) => {
    const amount = parseFloat(editAmount)
    
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    try {
      setIsSaving(true)
      const response = await fetch(`/api/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update payment')
      }

      toast.success('Payment updated successfully!')
      setEditingPaymentId(null)
      setEditAmount("")
      
      // Refresh payments
      if (order) {
        fetchPayments(order.id)
      }
    } catch (error) {
      console.error('Error updating payment:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update payment')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, paymentId: string) => {
    if (e.key === 'Enter') {
      handleSavePayment(paymentId)
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="w-[95vw] max-w-none sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[70vw] 2xl:w-[60vw] max-h-[95vh] overflow-y-auto"
        style={{ width: '70vw', maxWidth: 'none' }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              Order Details
              <Badge variant="secondary" className="font-mono">
                {order.order_number}
              </Badge>
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openPrintPreview({ order, payments })}>
                <Printer className="h-4 w-4 mr-2" />
                Print Receipt
              </Button>
              {hasMeasurements && measurement && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => openMeasurementPrintPreview({ order, measurement })}
                  disabled={loadingMeasurement}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Print Measurement
                </Button>
              )}
            </div>
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
                    <TableHead className="w-[80px]"></TableHead>
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
                          {editingPaymentId === payment.id ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, payment.id)}
                              className="w-32 text-right ml-auto"
                              autoFocus
                              disabled={isSaving}
                            />
                          ) : (
                            `-${payment.amount.toFixed(2)}`
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {editingPaymentId === payment.id ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSavePayment(payment.id)}
                                  disabled={isSaving}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                >
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleCancelEdit}
                                  disabled={isSaving}
                                  className="text-gray-600 hover:text-gray-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditPayment(payment)}
                                disabled={editingPaymentId !== null}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                📋 Order Items
                {order.order_items && order.order_items.length > 0 ? (
                  <Badge variant="default" className="text-xs">
                    {order.order_items.length} item{order.order_items.length !== 1 ? 's' : ''}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    No items
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.order_items && order.order_items.length > 0 ? (
                <div className="space-y-4">
                  {order.order_items.map((item, index) => (
                    <div key={item.id} className="border border-border rounded-lg p-4 bg-card">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-card-foreground">
                            #{index + 1}
                          </span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.order_type}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-card-foreground whitespace-pre-wrap">
                        {item.description}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <div className="text-sm mb-2">No order items added.</div>
                  <div className="text-xs">
                    Order items can be added when creating or editing the order.
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
                <div className="py-6">
                  {loadingMeasurement ? (
                    <div className="text-center text-muted-foreground">
                      <div className="text-sm mb-2">Loading measurement details...</div>
                    </div>
                  ) : measurement ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-sm text-muted-foreground mb-1">
                          Measurement set is linked to this order
                        </div>
                        <div className="font-medium text-lg">{measurement.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Created: {format(new Date(measurement.created_at), "MMM d, yyyy")}
                        </div>
                      </div>
                      
                      <div className="bg-muted/30 p-3 rounded-lg">
                        <div className="text-sm text-muted-foreground mb-2">Available Measurements:</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(measurement)
                            .filter(([key, value]) => 
                              key !== 'id' && key !== 'customer_id' && key !== 'name' && 
                              key !== 'is_default' && key !== 'notes' && key !== 'created_at' && 
                              key !== 'updated_at' && key !== 'customer' && 
                              value !== null && value !== undefined
                            )
                            .map(([key]) => (
                              <span key={key} className="text-xs bg-background px-2 py-1 rounded border">
                                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                            ))
                          }
                        </div>
                        {measurement.notes && (
                          <div className="mt-3">
                            <div className="text-xs text-muted-foreground mb-1">Notes:</div>
                            <div className="text-sm italic">{measurement.notes}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-orange-600">
                      <div className="text-sm mb-2">⚠️ Measurement linked but could not be loaded</div>
                      <div className="text-xs text-muted-foreground">
                        Measurement ID: <span className="font-mono">{order.measurement_id}</span>
                      </div>
                    </div>
                  )}
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