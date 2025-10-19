"use client"

import { format } from "date-fns"
import { Measurement, MEASUREMENT_FIELDS } from "@/types/measurements"
import type { OrderWithCustomer } from "@/lib/supabase-client"

interface PrintMeasurementProps {
  order: OrderWithCustomer
  measurement: Measurement
}

export function PrintMeasurement({ order, measurement }: PrintMeasurementProps) {
  // Filter measurement fields that have values
  const measurementsWithValues = MEASUREMENT_FIELDS.filter(field => 
    measurement[field.key] !== undefined && measurement[field.key] !== null
  )

  // Split measurements into two columns
  const midPoint = Math.ceil(measurementsWithValues.length / 2)
  const leftColumnMeasurements = measurementsWithValues.slice(0, midPoint)
  const rightColumnMeasurements = measurementsWithValues.slice(midPoint)

  return (
    <div className="print-measurement max-w-2xl mx-auto p-6 bg-white" style={{ marginTop: '120px', marginBottom: '48px' }}>
      {/* Header */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold">Customer Measurements</h2>
          <div className="text-right">
            <p className="font-mono text-base font-bold">#{order.order_number}</p>
            <p className="text-xs text-gray-600">
              {format(new Date(), "MMM d, yyyy 'at' HH:mm")}
            </p>
          </div>
        </div>
      </div>

      {/* Customer Information */}
      <div className="mb-4">
        <div className="p-2 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-semibold mb-1 text-gray-800">Customer Information</h3>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="font-medium">Name:</span>
              <span>{order.customers.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Measurement Set:</span>
              <span>{measurement.name}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Order Items */}
      {order.order_items && order.order_items.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-2 text-gray-800">Order Items</h3>
          
          <table className="w-full border-collapse order-items-table" style={{ border: '2px solid #374151' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th className="border text-left p-2 font-bold" style={{ border: '1px solid #374151', fontSize: '10pt', width: '8%' }}>
                  #
                </th>
                <th className="border text-left p-2 font-bold" style={{ border: '1px solid #374151', fontSize: '10pt', width: '20%' }}>
                  Type
                </th>
                <th className="border text-left p-2 font-bold" style={{ border: '1px solid #374151', fontSize: '10pt', width: '72%' }}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((item, index) => (
                <tr key={item.id}>
                  <td className="border p-2 font-medium" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                    {index + 1}
                  </td>
                  <td className="border p-2 font-medium capitalize" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                    {item.order_type}
                  </td>
                  <td className="border p-2" style={{ border: '1px solid #374151', fontSize: '9pt', whiteSpace: 'pre-wrap', lineHeight: '1.2' }}>
                    {item.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Measurements in Two Columns */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {/* Left Column */}
        <div>
          <table className="w-full border-collapse" style={{ border: '2px solid #374151' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th className="border text-left p-2 font-bold" style={{ border: '1px solid #374151', fontSize: '10pt' }}>
                  Measurement
                </th>
                <th className="border text-center p-2 font-bold" style={{ border: '1px solid #374151', fontSize: '10pt' }}>
                  Reading
                </th>
              </tr>
            </thead>
            <tbody>
              {leftColumnMeasurements.map((field) => (
                <tr key={field.key}>
                  <td className="border p-2 font-medium" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                    {field.label}
                  </td>
                  <td className="border p-2 text-center font-mono" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                    {measurement[field.key]?.toFixed(1) || '-'}
                  </td>
                </tr>
              ))}
              {/* Fill empty rows if left column has fewer items */}
              {rightColumnMeasurements.length > leftColumnMeasurements.length && 
                Array.from({ length: rightColumnMeasurements.length - leftColumnMeasurements.length }).map((_, index) => (
                  <tr key={`empty-left-${index}`}>
                    <td className="border p-2" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                      &nbsp;
                    </td>
                    <td className="border p-2" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                      &nbsp;
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Right Column */}
        <div>
          <table className="w-full border-collapse" style={{ border: '2px solid #374151' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th className="border text-left p-2 font-bold" style={{ border: '1px solid #374151', fontSize: '10pt' }}>
                  Measurement
                </th>
                <th className="border text-center p-2 font-bold" style={{ border: '1px solid #374151', fontSize: '10pt' }}>
                  Reading
                </th>
              </tr>
            </thead>
            <tbody>
              {rightColumnMeasurements.map((field) => (
                <tr key={field.key}>
                  <td className="border p-2 font-medium" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                    {field.label}
                  </td>
                  <td className="border p-2 text-center font-mono" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                    {measurement[field.key]?.toFixed(1) || '-'}
                  </td>
                </tr>
              ))}
              {/* Fill empty rows if right column has fewer items */}
              {leftColumnMeasurements.length > rightColumnMeasurements.length && 
                Array.from({ length: leftColumnMeasurements.length - rightColumnMeasurements.length }).map((_, index) => (
                  <tr key={`empty-right-${index}`}>
                    <td className="border p-2" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                      &nbsp;
                    </td>
                    <td className="border p-2" style={{ border: '1px solid #374151', fontSize: '9pt' }}>
                      &nbsp;
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Measurement Notes */}
      {measurement.notes && (
        <div className="mb-3 p-3 bg-gray-50 rounded-lg">
          <h4 className="font-semibold text-gray-700 mb-2 text-sm">Measurement Notes</h4>
          <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">{measurement.notes}</p>
        </div>
      )}

      {/* Print styles */}
      <style jsx>{`
        @media print {
          .print-measurement {
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
          
          .bg-gray-50 {
            background-color: #f9f9f9 !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }
          
          /* Table styles */
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          
          table, th, td {
            border: 2px solid #374151 !important;
          }
          
          th {
            background-color: #f9fafb !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            font-weight: bold !important;
          }
          
          th, td {
            padding: 6px !important;
          }
          
          /* Order items table specific styles */
          .order-items-table {
            margin-bottom: 16px !important;
          }
          
          .order-items-table th,
          .order-items-table td {
            font-size: 9pt !important;
          }
          
          /* Optimized spacing for Letter size (8.5" x 10.8") */
          h2 {
            font-size: 16pt !important;
            margin-bottom: 12px !important;
          }
          
          h3 {
            font-size: 12pt !important;
            margin-bottom: 6px !important;
          }
          
          h4 {
            font-size: 11pt !important;
            margin-bottom: 6px !important;
          }
          
          .mb-3 {
            margin-bottom: 12px !important;
          }
          
          .mb-4 {
            margin-bottom: 16px !important;
          }
          
          .text-xs {
            font-size: 8pt !important;
          }
          
          .text-sm {
            font-size: 9pt !important;
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