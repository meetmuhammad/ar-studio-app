"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { User, Calendar, Phone, MapPin, Package, DollarSign } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { Customer } from "@/lib/supabase-client"

interface CustomerOrder {
  id: string
  order_number: string
  booking_date: string
  delivery_date: string
  total_amount?: number | null
  advance_paid?: number | null
  balance?: number | null
  payment_method?: string | null
  comments?: string | null
  created_at: string
}

interface CustomerWithOrderCount extends Customer {
  orders?: { count: number }
}

interface CustomerDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: CustomerWithOrderCount | null
}

export function CustomerDetailDialog({
  open,
  onOpenChange,
  customer,
}: CustomerDetailDialogProps) {
  const [orders, setOrders] = useState<CustomerOrder[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch customer orders when dialog opens
  useEffect(() => {
    if (open && customer) {
      fetchCustomerOrders()
    }
  }, [open, customer])

  const fetchCustomerOrders = async () => {
    if (!customer) return

    setLoading(true)
    try {
      const response = await fetch(`/api/orders?customerId=${customer.id}&pageSize=100`)
      if (response.ok) {
        const data = await response.json()
        setOrders(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching customer orders:', error)
    } finally {
      setLoading(false)
    }
  }

  if (!customer) return null

  const totalRevenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0)
  const totalAdvance = orders.reduce((sum, order) => sum + (order.advance_paid || 0), 0)
  const totalBalance = orders.reduce((sum, order) => sum + (order.balance || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="w-[95vw] max-w-none sm:w-[90vw] md:w-[80vw] lg:w-[70vw] xl:w-[70vw] 2xl:w-[60vw] max-h-[95vh] overflow-y-auto"
        style={{ width: '70vw', maxWidth: 'none' }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {customer.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Customer Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{customer.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Joined {format(new Date(customer.created_at), "MMM d, yyyy")}</span>
                </div>
              </div>
              {customer.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-sm">{customer.address}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Order Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Total Orders</p>
                    <p className="text-2xl font-bold">{orders.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Total Revenue</p>
                    <p className="text-2xl font-bold">PKR {totalRevenue.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">Total Paid</p>
                    <p className="text-2xl font-bold text-green-600">PKR {totalAdvance.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-orange-600" />
                  <div>
                    <p className="text-sm font-medium">Total Balance</p>
                    <p className="text-2xl font-bold text-orange-600">PKR {totalBalance.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Orders List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Orders History</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Loading orders...</p>
              ) : orders.length > 0 ? (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{order.order_number}</p>
                          <p className="text-sm text-muted-foreground">
                            Booking: {format(new Date(order.booking_date), "MMM d, yyyy")} • 
                            Delivery: {format(new Date(order.delivery_date), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">PKR {(order.total_amount || 0).toLocaleString()}</p>
                          {order.balance && order.balance > 0 && (
                            <Badge variant="secondary" className="text-orange-600">
                              PKR {order.balance.toLocaleString()} pending
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span>Paid: PKR {(order.advance_paid || 0).toLocaleString()}</span>
                        {order.payment_method && (
                          <Badge variant="outline">{order.payment_method}</Badge>
                        )}
                      </div>
                      
                      {order.comments && (
                        <>
                          <Separator />
                          <p className="text-sm text-muted-foreground">{order.comments}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No orders found</p>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}