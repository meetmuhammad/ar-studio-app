import { renderToString } from "react-dom/server"
import { PrintReceipt } from "@/components/print-receipt"
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

interface PrintReceiptOptions {
  order: OrderWithCustomer
  payments: Payment[]
}

export function printReceipt({ order, payments }: PrintReceiptOptions) {
  // Create a new window
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  
  if (!printWindow) {
    alert('Please allow popups to print the receipt')
    return
  }

  // Generate the HTML content
  const receiptHTML = renderToString(
    PrintReceipt({ order, payments })
  )

  // Write the complete HTML document
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Receipt - ${order.order_number}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print {
          .print-receipt {
            max-width: none !important;
            margin: 0 !important;
            padding: 20px !important;
            box-shadow: none !important;
            background: white !important;
          }
          
          body {
            font-size: 12pt !important;
            line-height: 1.3 !important;
            margin: 0 !important;
            padding: 0 !important;
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
          
          .bg-gray-100 {
            background-color: #f5f5f5 !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }

          .border-gray-300 {
            border-color: #d1d5db !important;
          }

          .border-gray-800 {
            border-color: #1f2937 !important;
          }

          .text-red-600 {
            color: #dc2626 !important;
          }

          .text-green-600 {
            color: #16a34a !important;
          }

          .text-orange-600 {
            color: #ea580c !important;
          }

          .text-gray-600 {
            color: #4b5563 !important;
          }

          .text-gray-700 {
            color: #374151 !important;
          }

          .text-gray-800 {
            color: #1f2937 !important;
          }
          
          @page {
            margin: 0.5in;
            size: A4;
          }
        }
        
        @media screen {
          body {
            background-color: #f5f5f5;
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      ${receiptHTML}
      <script>
        // Auto-print when page loads
        window.onload = function() {
          window.print();
          
          // Close window after printing (optional)
          window.onafterprint = function() {
            window.close();
          };
        };
      </script>
    </body>
    </html>
  `)

  printWindow.document.close()
}

// Alternative function that creates a print-friendly page without auto-print
export function openPrintPreview({ order, payments }: PrintReceiptOptions) {
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  
  if (!printWindow) {
    alert('Please allow popups to view the receipt')
    return
  }

  const receiptHTML = renderToString(
    PrintReceipt({ order, payments })
  )

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Receipt Preview - ${order.order_number}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print {
          .print-receipt {
            max-width: none !important;
            margin: 0 !important;
            padding: 20px !important;
            box-shadow: none !important;
            background: white !important;
          }
          
          body {
            font-size: 12pt !important;
            line-height: 1.3 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          .print-controls {
            display: none !important;
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
          
          .bg-gray-100 {
            background-color: #f5f5f5 !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }

          @page {
            margin: 0.5in;
            size: A4;
          }
        }
        
        @media screen {
          body {
            background-color: #f5f5f5;
            padding: 20px;
          }
          
          .print-controls {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
          }
        }
      </style>
    </head>
    <body>
      <div class="print-controls">
        <button onclick="window.print()" class="bg-blue-600 text-white px-4 py-2 rounded-lg mr-2 hover:bg-blue-700">
          🖨️ Print
        </button>
        <button onclick="window.close()" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700">
          ✕ Close
        </button>
      </div>
      ${receiptHTML}
    </body>
    </html>
  `)

  printWindow.document.close()
}