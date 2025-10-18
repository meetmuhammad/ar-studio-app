"use client"

import { format } from "date-fns"
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

interface PrintReceiptProps {
  order: OrderWithCustomer
  payments: Payment[]
}

export function PrintReceipt({ order, payments }: PrintReceiptProps) {
  const calculateTotalPaid = () => {
    const advancePaid = order.advance_paid || 0
    const additionalPayments = payments.reduce((sum, payment) => sum + payment.amount, 0)
    return advancePaid + additionalPayments
  }

  const calculateBalance = () => {
    return (order.total_amount || 0) - calculateTotalPaid()
  }

  return (
    <div className="print-receipt max-w-2xl mx-auto p-8 bg-white" style={{ marginTop: '144px', marginBottom: '72px' }}>
      {/* Order Information */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Order Details</h2>
          <div className="text-right">
            <p className="font-mono text-lg font-bold">#{order.order_number}</p>
            <p className="text-sm text-gray-600">
              {format(new Date(order.created_at), "MMM d, yyyy 'at' HH:mm")}
            </p>
          </div>
        </div>
      </div>

      {/* Customer Information */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-3 text-gray-800">Customer Information</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="font-medium">Name:</span>
            <span>{order.customers.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Phone:</span>
            <span className="font-mono">{order.customers.phone}</span>
          </div>
          {order.customers.address && (
            <div className="flex justify-between">
              <span className="font-medium">Address:</span>
              <span className="text-right max-w-xs">{order.customers.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Order Dates */}
      <div className="mb-8 grid grid-cols-2 gap-6">
        <div>
          <h4 className="font-medium text-gray-700">Booking Date</h4>
          <p className="text-lg">{format(new Date(order.booking_date), "MMM d, yyyy")}</p>
        </div>
        <div>
          <h4 className="font-medium text-gray-700">Delivery Date</h4>
          <p className="text-lg">
            {order.delivery_date 
              ? format(new Date(order.delivery_date), "MMM d, yyyy")
              : "Not set"
            }
          </p>
        </div>
      </div>

      {/* Comments */}
      {order.comments && (
        <div className="mb-8 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-700 mb-2">Order Comments</h4>
          <p className="text-gray-800">{order.comments}</p>
        </div>
      )}

      {/* Payment Details */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Payment Details</h3>
        
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-3 text-left">Date</th>
              <th className="border border-gray-300 p-3 text-left">Description</th>
              <th className="border border-gray-300 p-3 text-right">Amount (PKR)</th>
            </tr>
          </thead>
          <tbody>
            {/* Advance Payment */}
            {(order.advance_paid && order.advance_paid > 0) && (
              <tr>
                <td className="border border-gray-300 p-3 font-mono text-sm">
                  {format(new Date(order.booking_date), 'MMM d, yyyy')}
                </td>
                <td className="border border-gray-300 p-3">Advance Payment</td>
                <td className="border border-gray-300 p-3 text-right font-mono">
                  {(order.advance_paid || 0).toFixed(2)}
                </td>
              </tr>
            )}
            
            {/* Additional Payments */}
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="border border-gray-300 p-3 font-mono text-sm">
                  {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                </td>
                <td className="border border-gray-300 p-3">
                  {payment.notes || `Payment via ${payment.payment_method}`}
                </td>
                <td className="border border-gray-300 p-3 text-right font-mono">
                  {payment.amount.toFixed(2)}
                </td>
              </tr>
            ))}

            {/* No payments message */}
            {(!order.advance_paid || order.advance_paid === 0) && payments.length === 0 && (
              <tr>
                <td colSpan={3} className="border border-gray-300 p-3 text-center text-gray-500">
                  No payments recorded
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td className="border border-gray-300 p-3"></td>
              <td className="border border-gray-300 p-3">Total Order Amount</td>
              <td className="border border-gray-300 p-3 text-right font-mono">
                {(order.total_amount || 0).toFixed(2)}
              </td>
            </tr>
            <tr className="bg-gray-100 font-bold">
              <td className="border border-gray-300 p-3"></td>
              <td className="border border-gray-300 p-3">Total Paid</td>
              <td className="border border-gray-300 p-3 text-right font-mono">
                {calculateTotalPaid().toFixed(2)}
              </td>
            </tr>
            <tr className="bg-gray-100 font-bold">
              <td className="border border-gray-300 p-3"></td>
              <td className="border border-gray-300 p-3">Balance Due</td>
              <td className={`border border-gray-300 p-3 text-right font-mono ${
                calculateBalance() > 0 ? 'text-red-600' : 
                calculateBalance() < 0 ? 'text-orange-600' : 'text-green-600'
              }`}>
                {calculateBalance().toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>



      {/* Print styles */}
      <style jsx>{`
        @media print {
          .print-receipt {
            max-width: none !important;
            margin: 0 !important;
            margin-top: 144px !important;
            margin-bottom: 72px !important;
            padding: 20px !important;
            box-shadow: none !important;
            background: white !important;
          }
          
          body {
            font-size: 12pt !important;
            line-height: 1.3 !important;
          }
          
          h1 {
            font-size: 18pt !important;
          }
          
          h2, h3 {
            font-size: 14pt !important;
          }
          
          h4 {
            font-size: 12pt !important;
          }
          
          table {
            font-size: 10pt !important;
          }
          
          .text-3xl {
            font-size: 18pt !important;
          }
          
          .text-xl {
            font-size: 14pt !important;
          }
          
          .text-lg {
            font-size: 12pt !important;
          }
          
          .bg-gray-50 {
            background-color: #f9f9f9 !important;
          }
          
          .bg-gray-100 {
            background-color: #f5f5f5 !important;
          }
        }
      `}</style>
    </div>
  )
}