"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { CreatePaymentSchema, CreatePaymentInput } from "@/lib/validators"
import { toast } from "sonner"
import { format } from "date-fns"
import { Banknote, CreditCard, Wallet, DollarSign, Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
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

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function PaymentDialog({
  open,
  onOpenChange,
  onSuccess,
}: PaymentDialogProps) {
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [selectedOrder, setSelectedOrder] = useState<OrderWithCustomer | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderSearchOpen, setOrderSearchOpen] = useState(false)

  const form = useForm<CreatePaymentInput>({
    resolver: zodResolver(CreatePaymentSchema) as any,
    mode: "onSubmit",
    defaultValues: {
      order_id: "",
      customer_id: "",
      amount: 0,
      payment_method: "other",
      payment_date: new Date(),
      notes: "",
    },
  })

  // Fetch orders when dialog opens
  useEffect(() => {
    if (open) {
      fetchOrders()
    }
  }, [open])

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset()
      setSelectedOrder(null)
      setPayments([])
      setOrderSearchOpen(false)
    }
  }, [open, form])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/orders?pageSize=1000')
      if (!response.ok) throw new Error('Failed to fetch orders')
      
      const data = await response.json()
      setOrders(data.data || [])
    } catch (error) {
      console.error('Error fetching orders:', error)
      toast.error('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const fetchPayments = async (orderId: string) => {
    try {
      setLoadingPayments(true)
      const response = await fetch(`/api/payments?order_id=${orderId}`)
      if (!response.ok) throw new Error('Failed to fetch payments')
      
      const data = await response.json()
      setPayments(data.payments || [])
    } catch (error) {
      console.error('Error fetching payments:', error)
      toast.error('Failed to load payment history')
    } finally {
      setLoadingPayments(false)
    }
  }

  const handleOrderSelect = (orderId: string) => {
    const order = orders.find(o => o.id === orderId)
    if (order) {
      setSelectedOrder(order)
      form.setValue("order_id", orderId)
      form.setValue("customer_id", order.customer_id)
      form.setValue("amount", 0) // Keep amount empty by default
      setOrderSearchOpen(false)
      fetchPayments(orderId) // Fetch payment history for this order
    }
  }

  const onSubmit = async (data: CreatePaymentInput) => {
    if (!selectedOrder) {
      toast.error('Please select an order')
      return
    }

    try {
      setIsSubmitting(true)

      const paymentData = {
        ...data,
        payment_date: data.payment_date.toISOString().split('T')[0] // Convert to YYYY-MM-DD
      }

      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create payment')
      }

      toast.success('Payment added successfully!')
      // Refresh payment history
      if (selectedOrder) {
        fetchPayments(selectedOrder.id)
      }
              // Reset form but keep order selected
              form.setValue("amount", 0)
              form.setValue("notes", "")
      onSuccess?.()
    } catch (error) {
      console.error('Error creating payment:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const calculateTotalPaid = () => {
    if (!selectedOrder) return 0
    const advancePaid = selectedOrder.advance_paid || 0
    const additionalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0)
    return advancePaid + additionalPayments
  }

  const calculateBalance = () => {
    if (!selectedOrder) return 0
    return (selectedOrder.total_amount || 0) - calculateTotalPaid()
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
            <DollarSign className="h-5 w-5" />
            Add New Payment
          </DialogTitle>
          <DialogDescription>
            Select an order and add a new payment record. Track customer payments over time.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Order Selection */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Order *</Label>
                <Popover open={orderSearchOpen} onOpenChange={setOrderSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={orderSearchOpen}
                      className="w-full justify-between"
                      disabled={loading}
                    >
                      {selectedOrder
                        ? `${selectedOrder.order_number} - ${selectedOrder.customers.name}`
                        : loading ? "Loading orders..." : "Search and select order..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[500px] p-0" side="bottom" align="start">
                    <Command>
                      <CommandInput placeholder="Search by order # or customer name..." />
                      <CommandEmpty>No orders found.</CommandEmpty>
                      <CommandGroup className="max-h-[300px] overflow-y-auto">
                        {orders.map((order) => (
                          <CommandItem
                            key={order.id}
                            value={`${order.order_number} ${order.customers.name}`}
                            onSelect={() => handleOrderSelect(order.id)}
                            className="flex items-center gap-3 p-3"
                          >
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                selectedOrder?.id === order.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-mono font-medium text-sm">{order.order_number}</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {order.customers.name}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Order Details & Payment Summary */}
              {selectedOrder && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center justify-between">
                        <span>Order Summary</span>
                        <Badge variant="outline" className="font-mono">
                          {selectedOrder.order_number}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div>
                          <span className="text-muted-foreground">Customer:</span>
                          <span className="ml-2 font-medium">{selectedOrder.customers.name}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Phone:</span>
                          <span className="ml-2 font-mono">{selectedOrder.customers.phone}</span>
                        </div>
                      </div>

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
                          {(selectedOrder.advance_paid && selectedOrder.advance_paid > 0) && (
                            <TableRow>
                              <TableCell className="font-mono text-sm">
                                {format(new Date(selectedOrder.booking_date), 'MMM d, yyyy')}
                              </TableCell>
                              <TableCell className="font-medium text-green-700">Advance Payment</TableCell>
                              <TableCell className="text-right font-mono text-green-700">
                                -{(selectedOrder.advance_paid || 0).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          )}
                          {/* Show additional payments */}
                          {payments.map((payment) => (
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
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell className="font-mono text-sm">
                              {format(new Date(selectedOrder.booking_date), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="font-bold">Total Order Amount</TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              {(selectedOrder.total_amount || 0).toFixed(2)}
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
                  
                </div>
              )}
            </div>

            {/* Payment Form */}
            {selectedOrder && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Amount */}
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount (PKR) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="Enter payment amount"
                            {...field}
                            value={field.value !== undefined ? field.value.toString() : ''}
                            onChange={(e) => {
                              const value = e.target.value
                              field.onChange(value === '' ? undefined : parseFloat(value) || 0)
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Payment Date */}
                  <FormField
                    control={form.control}
                    name="payment_date"
                    render={() => (
                      <FormItem>
                        <FormLabel>Date *</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            value={format(new Date(), 'PPP')}
                            readOnly
                            disabled
                            className="bg-muted cursor-not-allowed"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Description */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Add a description for this payment..."
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Payment Method */}
                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="grid grid-cols-3 gap-4"
                        >
                          <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-accent">
                            <RadioGroupItem value="cash" id="cash" />
                            <Label htmlFor="cash" className="flex items-center gap-2 cursor-pointer">
                              <Banknote className="h-4 w-4" />
                              Cash
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-accent">
                            <RadioGroupItem value="bank" id="bank" />
                            <Label htmlFor="bank" className="flex items-center gap-2 cursor-pointer">
                              <CreditCard className="h-4 w-4" />
                              Bank Transfer
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-accent">
                            <RadioGroupItem value="other" id="other" />
                            <Label htmlFor="other" className="flex items-center gap-2 cursor-pointer">
                              <Wallet className="h-4 w-4" />
                              Other
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !selectedOrder}
              >
                {isSubmitting ? "Adding Payment..." : "Add Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}