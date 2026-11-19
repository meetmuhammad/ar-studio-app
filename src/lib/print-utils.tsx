import { renderToString } from "react-dom/server"
import { PrintReceipt } from "@/components/print-receipt"
import { PrintMeasurement } from "@/components/print-measurement"
import type { OrderWithCustomer } from "@/lib/supabase-client"
import { Measurement } from "@/types/measurements"
import { BRAND } from "@/lib/brand"

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

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/**
 * Self-contained styles for the print window, so a receipt or measurement
 * sheet prints the same with no network. The templates
 * (print-receipt.tsx, print-measurement.tsx) use Tailwind class names; these
 * rules define exactly those classes with Tailwind's values, plus the small
 * reset (preflight) they rely on. Nothing is loaded from a CDN.
 */
const BASE_CSS = `
  *, ::before, ::after { box-sizing: border-box; border: 0 solid #e5e7eb; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; line-height: 1.5; color: #111827;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  h1, h2, h3, h4, p { margin: 0; font-size: inherit; font-weight: inherit; }
  table { border-collapse: collapse; border-color: inherit; text-indent: 0; }
  th { font-weight: inherit; text-align: inherit; }
  button { font: inherit; cursor: pointer; }

  .max-w-2xl { max-width: 42rem; } .max-w-xs { max-width: 20rem; }
  .mx-auto { margin-left: auto; margin-right: auto; }
  .w-full { width: 100%; }
  .p-1 { padding: 0.25rem; } .p-2 { padding: 0.5rem; } .p-3 { padding: 0.75rem; } .p-6 { padding: 1.5rem; }
  .mb-1 { margin-bottom: 0.25rem; } .mb-2 { margin-bottom: 0.5rem; } .mb-3 { margin-bottom: 0.75rem; } .mb-4 { margin-bottom: 1rem; }
  .space-y-1 > * + * { margin-top: 0.25rem; }
  .flex { display: flex; } .justify-between { justify-content: space-between; } .items-center { align-items: center; }
  .grid { display: grid; } .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .gap-4 { gap: 1rem; }
  .rounded-lg { border-radius: 0.5rem; }
  .border { border-width: 1px; } .border-collapse { border-collapse: collapse; }
  .border-gray-300 { border-color: #d1d5db; }
  .bg-white { background-color: #fff; } .bg-gray-50 { background-color: #f9fafb; } .bg-gray-100 { background-color: #f3f4f6; }
  .text-xs { font-size: 0.75rem; line-height: 1rem; } .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
  .text-base { font-size: 1rem; line-height: 1.5rem; } .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
  .font-medium { font-weight: 500; } .font-semibold { font-weight: 600; } .font-bold { font-weight: 700; }
  .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .leading-tight { line-height: 1.25; } .leading-relaxed { line-height: 1.625; }
  .text-left { text-align: left; } .text-center { text-align: center; } .text-right { text-align: right; }
  .capitalize { text-transform: capitalize; } .whitespace-pre-wrap { white-space: pre-wrap; }
  .text-gray-500 { color: #6b7280; } .text-gray-600 { color: #4b5563; } .text-gray-700 { color: #374151; } .text-gray-800 { color: #1f2937; }
  .text-red-600 { color: #dc2626; } .text-orange-600 { color: #ea580c; } .text-green-600 { color: #16a34a; }

  @media screen {
    body { background-color: #f5f5f5; padding: 20px; }
    .print-controls { position: fixed; top: 20px; right: 20px; z-index: 1000; display: flex; gap: 0.5rem; }
    .print-controls button { color: #fff; padding: 0.5rem 1rem; border-radius: 0.5rem; }
    .print-controls .print { background-color: #2563eb; } .print-controls .print:hover { background-color: #1d4ed8; }
    .print-controls .close { background-color: #4b5563; } .print-controls .close:hover { background-color: #374151; }
  }
  @media print {
    .print-controls { display: none !important; }
    body { font-size: 12pt !important; line-height: 1.3 !important; margin: 0 !important; padding: 0 !important; }
    h1 { font-size: 18pt !important; }
    h2, h3 { font-size: 14pt !important; }
    h4 { font-size: 12pt !important; }
    .bg-gray-50, .bg-gray-100, th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .bg-gray-50 { background-color: #f9f9f9 !important; }
    .bg-gray-100 { background-color: #f5f5f5 !important; }
    @page { margin: 0.5in; size: A4; }
  }
`

/** Print rules specific to each sheet (as before). */
const RECEIPT_CSS = `
  @media print {
    .print-receipt { max-width: none !important; margin: 0 !important; padding: 20px !important; box-shadow: none !important; background: white !important; }
    table { font-size: 10pt !important; }
    .border-gray-300 { border-color: #d1d5db !important; }
    .text-red-600 { color: #dc2626 !important; } .text-green-600 { color: #16a34a !important; } .text-orange-600 { color: #ea580c !important; }
    .text-gray-600 { color: #4b5563 !important; } .text-gray-700 { color: #374151 !important; } .text-gray-800 { color: #1f2937 !important; }
  }
`

const MEASUREMENT_CSS = `
  @media print {
    .print-measurement { max-width: none !important; margin: 0 !important; padding: 20px !important; box-shadow: none !important; background: white !important; }
    table { font-size: 10pt !important; border-collapse: collapse !important; }
    table, th, td { border: 2px solid #374151 !important; }
    th { background-color: #f9fafb !important; font-weight: bold !important; }
  }
`

/**
 * Opens a window with one printable sheet. `autoPrint` prints on load and
 * closes afterwards; otherwise the window shows Print / Close controls.
 */
function openSheet({ title, body, css, autoPrint }: { title: string; body: string; css: string; autoPrint: boolean }) {
  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (!printWindow) return false

  const controls = autoPrint
    ? ''
    : `<div class="print-controls">
        <button type="button" class="print" onclick="window.print()">🖨️ Print</button>
        <button type="button" class="close" onclick="window.close()">✕ Close</button>
      </div>`
  const script = autoPrint
    ? `<script>
        window.onload = function () {
          window.print();
          window.onafterprint = function () { window.close(); };
        };
      </script>`
    : ''

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(`${title} | ${BRAND.name}`)}</title>
  <style>${BASE_CSS}${css}</style>
</head>
<body>
  ${controls}
  ${body}
  ${script}
</body>
</html>`)
  printWindow.document.close()
  return true
}

export function printReceipt({ order, payments }: PrintReceiptOptions) {
  const ok = openSheet({
    title: `Receipt - ${order.order_number}`,
    body: renderToString(PrintReceipt({ order, payments })),
    css: RECEIPT_CSS,
    autoPrint: true,
  })
  if (!ok) alert('Please allow popups to print the receipt')
}

/** Print-friendly receipt with Print / Close controls (no auto-print). */
export function openPrintPreview({ order, payments }: PrintReceiptOptions) {
  const ok = openSheet({
    title: `Receipt Preview - ${order.order_number}`,
    body: renderToString(PrintReceipt({ order, payments })),
    css: RECEIPT_CSS,
    autoPrint: false,
  })
  if (!ok) alert('Please allow popups to view the receipt')
}

interface PrintMeasurementOptions {
  /** Optional: omit to print a measurement on its own (no order header or items). */
  order?: OrderWithCustomer
  measurement: Measurement
}

export function printMeasurement({ order, measurement }: PrintMeasurementOptions) {
  const ok = openSheet({
    title: `Measurement - ${order ? order.order_number : measurement.name}`,
    body: renderToString(PrintMeasurement({ order, measurement })),
    css: MEASUREMENT_CSS,
    autoPrint: true,
  })
  if (!ok) alert('Please allow popups to print the measurement')
}

/** Print-friendly measurement sheet with Print / Close controls (no auto-print). */
export function openMeasurementPrintPreview({ order, measurement }: PrintMeasurementOptions) {
  const ok = openSheet({
    title: `Measurement Preview - ${order ? order.order_number : measurement.name}`,
    body: renderToString(PrintMeasurement({ order, measurement })),
    css: MEASUREMENT_CSS,
    autoPrint: false,
  })
  if (!ok) alert('Please allow popups to view the measurement')
}
