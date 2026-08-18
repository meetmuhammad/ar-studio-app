import { renderToString } from "react-dom/server"
import { toast } from "sonner"

import { PrintReceipt } from "@/components/print-receipt"
import { PrintMeasurement } from "@/components/print-measurement"
import { openPrintWindow } from "@/lib/print-document"
import type { OrderWithCustomer } from "@/lib/supabase-client"
import { Measurement } from "@/types/measurements"

/**
 * Entry points for the two printable documents.
 *
 * Each used to carry its own copy of a ~120-line stylesheet — four copies that
 * had already drifted apart (the receipt printed `size: letter`, its own preview
 * `size: A4`). The sheet now lives once in `print-document.ts`; these four
 * functions differ only in what they render and whether they auto-print.
 */

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

interface PrintMeasurementOptions {
  order: OrderWithCustomer
  measurement: Measurement
}

function open(title: string, body: string, mode: "preview" | "print") {
  const opened = openPrintWindow({ title, body, mode })

  if (!opened) {
    // A toast, not the native alert() this used to raise: alert() blocks the
    // whole tab behind a dialog that doesn't say which setting to change.
    toast.error("Your browser blocked the print window", {
      description: "Allow pop-ups for this site, then try again.",
    })
  }
}

export function printReceipt({ order, payments }: PrintReceiptOptions) {
  open(
    `Receipt ${order.order_number}`,
    renderToString(<PrintReceipt order={order} payments={payments} />),
    "print"
  )
}

export function openPrintPreview({ order, payments }: PrintReceiptOptions) {
  open(
    `Receipt ${order.order_number}`,
    renderToString(<PrintReceipt order={order} payments={payments} />),
    "preview"
  )
}

export function printMeasurement({ order, measurement }: PrintMeasurementOptions) {
  open(
    `Measurements ${order.order_number}`,
    renderToString(<PrintMeasurement order={order} measurement={measurement} />),
    "print"
  )
}

export function openMeasurementPrintPreview({
  order,
  measurement,
}: PrintMeasurementOptions) {
  open(
    `Measurements ${order.order_number}`,
    renderToString(<PrintMeasurement order={order} measurement={measurement} />),
    "preview"
  )
}
