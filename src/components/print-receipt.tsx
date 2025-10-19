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
    <div className="print-receipt max-w-2xl mx-auto p-6 bg-white" style={{ marginTop: '120px', marginBottom: '48px' }}>
      {/* Order Information */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Order Details</h2>
          <div className="text-right">
            <p className="font-mono text-base font-bold">#{order.order_number}</p>
            <p className="text-xs text-gray-600">
              {format(new Date(order.created_at), "MMM d, yyyy 'at' HH:mm")}
            </p>
          </div>
        </div>
      </div>

      {/* Customer Information and Order Schedule in 2 columns */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {/* Customer Information */}
        <div className="p-2 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-semibold mb-1 text-gray-800">Customer Information</h3>
          <div className="space-y-1 text-xs">
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
                <span className="text-right max-w-xs text-xs leading-tight">{order.customers.address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Order Schedule */}
        <div>
          <h3 className="text-sm font-semibold mb-1 text-gray-800">Order Schedule</h3>
          
          <table className="w-full border-collapse" style={{ border: '1px solid #374151' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th className="border text-left p-1" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                  Date Type
                </th>
                <th className="border text-left p-1" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-1 font-medium" style={{ border: '1px solid #374151', fontSize: '8pt' }}>
                  Booking Date
                </td>
                <td className="border p-1" style={{ border: '1px solid #374151', fontSize: '8pt' }}>
                  {format(new Date(order.booking_date), "MMM d, yyyy")}
                </td>
              </tr>
              <tr>
                <td className="border p-1 font-medium" style={{ border: '1px solid #374151', fontSize: '8pt' }}>
                  Delivery Date
                </td>
                <td className="border p-1" style={{ border: '1px solid #374151', fontSize: '8pt' }}>
                  {order.delivery_date 
                    ? format(new Date(order.delivery_date), "MMM d, yyyy")
                    : "Not set"
                  }
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Items */}
      {order.order_items && order.order_items.length > 0 && (
        <div className="mb-3">
          <h3 className="text-sm font-semibold mb-1 text-gray-800">Order Items</h3>
          
          <table className="w-full border-collapse" style={{ border: '1px solid #374151' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th className="border text-left p-1" style={{ border: '1px solid #374151', fontSize: '8pt', width: '8%' }}>
                  #
                </th>
                <th className="border text-left p-1" style={{ border: '1px solid #374151', fontSize: '8pt', width: '20%' }}>
                  Type
                </th>
                <th className="border text-left p-1" style={{ border: '1px solid #374151', fontSize: '8pt', width: '72%' }}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((item, index) => (
                <tr key={item.id}>
                  <td className="border p-1 font-medium" style={{ border: '1px solid #374151', fontSize: '8pt' }}>
                    {index + 1}
                  </td>
                  <td className="border p-1 font-medium capitalize" style={{ border: '1px solid #374151', fontSize: '8pt' }}>
                    {item.order_type}
                  </td>
                  <td className="border p-1" style={{ border: '1px solid #374151', fontSize: '8pt', whiteSpace: 'pre-wrap', lineHeight: '1.2' }}>
                    {item.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Comments */}
      {order.comments && (
        <div className="mb-3 p-2 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-700 mb-1 text-xs">Order Comments</h4>
          <p className="text-gray-800 text-xs leading-tight">{order.comments}</p>
        </div>
      )}

      {/* Payment Details */}
      <div className="mb-3">
        <h3 className="text-sm font-semibold mb-1 text-gray-800">Payment Details</h3>
        
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
            margin-top: 120px !important;
            margin-bottom: 48px !important;
            padding: 16px !important;
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
          
          /* Order items table styles */
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          
          table, th, td {
            border: 1px solid #374151 !important;
          }
          
          table {
            border: 2px solid #374151 !important;
          }
          
          th {
            background-color: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            font-weight: bold !important;
          }
          
          th, td {
            padding: 4px !important;
            text-align: left !important;
          }
          
          /* Optimized spacing for Letter size (8.5" x 10.8") */
          h2 {
            font-size: 14pt !important;
            margin-bottom: 8px !important;
          }
          
          h3 {
            font-size: 10pt !important;
            margin-bottom: 4px !important;
          }
          
          .mb-3 {
            margin-bottom: 8px !important;
          }
          
          .mb-4 {
            margin-bottom: 10px !important;
          }
          
          .text-xs {
            font-size: 7pt !important;
          }
          
          .text-sm {
            font-size: 8pt !important;
          }
          
          @page {
            margin: 0.4in;
            size: letter; /* 8.5" x 11" */
          }
        }
      `}</style>
    </div>
  )
}