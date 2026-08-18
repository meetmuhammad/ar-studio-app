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

/**
 * The printed order receipt.
 *
 * Rendered with `renderToString` into a detached window, so it carries no
 * Tailwind classes and no `<style jsx>` — neither survives that trip. Styling
 * comes from the sheet in `lib/print-document.ts`; this file owns structure and
 * content only.
 */
export function PrintReceipt({ order, payments }: PrintReceiptProps) {
  const totalPaid =
    (order.advance_paid || 0) + payments.reduce((sum, payment) => sum + payment.amount, 0)
  const balance = (order.total_amount || 0) - totalPaid
  const hasPayments = Boolean(order.advance_paid && order.advance_paid > 0) || payments.length > 0

  // Owed reads as a debt, overpaid as something to reconcile, settled as neither.
  const balanceClass =
    balance > 0 ? "num amount--credit" : balance < 0 ? "num amount--over" : "num amount--debit"

  return (
    <div className="sheet sheet--letterhead">
      <div className="doc-head">
        <h1 className="doc-title">Order Receipt</h1>
        <div className="doc-ref">
          <p className="doc-ref__number">#{order.order_number}</p>
          <p className="doc-ref__stamp">
            {format(new Date(order.created_at), "MMM d, yyyy 'at' HH:mm")}
          </p>
        </div>
      </div>

      <div className="section grid-2">
        <div>
          <h2 className="section__title">Customer</h2>
          <div className="panel">
            <div className="field">
              <span className="field__label">Name</span>
              <span className="field__value">{order.customers.name}</span>
            </div>
            <div className="field">
              <span className="field__label">Phone</span>
              <span className="field__value field__value--mono">{order.customers.phone}</span>
            </div>
            {order.customers.address ? (
              <div className="field">
                <span className="field__label">Address</span>
                <span className="field__value">{order.customers.address}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="section__title">Schedule</h2>
          <table>
            <tbody>
              <tr>
                <th scope="row">Booking date</th>
                <td className="num">
                  {format(new Date(order.booking_date), "MMM d, yyyy")}
                </td>
              </tr>
              <tr>
                <th scope="row">Delivery date</th>
                <td className="num">
                  {order.delivery_date
                    ? format(new Date(order.delivery_date), "MMM d, yyyy")
                    : "Not set"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {order.order_items && order.order_items.length > 0 ? (
        <div className="section">
          <h2 className="section__title">Items</h2>
          <table>
            <thead>
              <tr>
                <th style={{ width: "8%" }}>#</th>
                <th style={{ width: "22%" }}>Type</th>
                <th style={{ width: "70%" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((item, index) => (
                <tr key={item.id}>
                  <td className="num">{index + 1}</td>
                  <td className="capitalize">{item.order_type}</td>
                  <td className="wrap">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {order.comments ? (
        <div className="section">
          <h2 className="section__title">Comments</h2>
          <div className="panel">
            <p className="note">{order.comments}</p>
          </div>
        </div>
      ) : null}

      <div className="section">
        <h2 className="section__title">Payments</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Date</th>
              <th>Description</th>
              <th className="num" style={{ width: "24%" }}>
                Amount (PKR)
              </th>
            </tr>
          </thead>
          <tbody>
            {order.advance_paid && order.advance_paid > 0 ? (
              <tr>
                <td className="num">{format(new Date(order.booking_date), "MMM d, yyyy")}</td>
                <td>Advance payment</td>
                <td className="num">{order.advance_paid.toFixed(2)}</td>
              </tr>
            ) : null}

            {payments.map((payment) => (
              <tr key={payment.id}>
                <td className="num">
                  {format(new Date(payment.payment_date), "MMM d, yyyy")}
                </td>
                <td>{payment.notes || `Payment via ${payment.payment_method}`}</td>
                <td className="num">{payment.amount.toFixed(2)}</td>
              </tr>
            ))}

            {!hasPayments ? (
              <tr>
                <td colSpan={3} className="empty">
                  No payments recorded
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Total order amount</td>
              <td className="num">{(order.total_amount || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td />
              <td>Total paid</td>
              <td className="num">{totalPaid.toFixed(2)}</td>
            </tr>
            <tr>
              <td />
              {/* The state is named in words as well as tinted: a receipt is
                  routinely printed on a mono laser, where colour is nothing. */}
              <td>
                {balance > 0
                  ? "Balance due"
                  : balance < 0
                    ? "Overpaid — refund due"
                    : "Balance due — settled in full"}
              </td>
              <td className={balanceClass}>{Math.abs(balance).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
