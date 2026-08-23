import { format } from "date-fns"
import { Measurement, MEASUREMENT_FIELDS } from "@/types/measurements"
import type { OrderWithCustomer } from "@/lib/supabase-client"

interface PrintMeasurementProps {
  order: OrderWithCustomer
  measurement: Measurement
}

/**
 * The printed measurement sheet — the page a tailor works from at the bench.
 *
 * Like the receipt, this renders into a detached window via `renderToString`,
 * so it carries structure only; `lib/print-document.ts` owns the styling.
 */
export function PrintMeasurement({ order, measurement }: PrintMeasurementProps) {
  const recorded = MEASUREMENT_FIELDS.filter(
    (field) => measurement[field.key] !== undefined && measurement[field.key] !== null
  )

  // Split down the middle so both columns are read top-to-bottom, and pad the
  // shorter one so the two tables end on the same line.
  const midPoint = Math.ceil(recorded.length / 2)
  const columns = [recorded.slice(0, midPoint), recorded.slice(midPoint)]
  const rowCount = Math.max(columns[0].length, columns[1].length)

  return (
    <div className="sheet sheet--letterhead">
      <div className="doc-head">
        <h1 className="doc-title">Measurement Sheet</h1>
        <div className="doc-ref">
          <p className="doc-ref__number">#{order.order_number}</p>
          <p className="doc-ref__stamp">{format(new Date(), "MMM d, yyyy 'at' HH:mm")}</p>
        </div>
      </div>

      <div className="section">
        <h2 className="section__title">Customer</h2>
        <div className="panel">
          <div className="field">
            <span className="field__label">Name</span>
            <span className="field__value">{order.customers.name}</span>
          </div>
          <div className="field">
            <span className="field__label">Measurement set</span>
            <span className="field__value">{measurement.name}</span>
          </div>
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

      <div className="section">
        <h2 className="section__title">Measurements</h2>
        {recorded.length === 0 ? (
          <div className="panel">
            <p className="note">No measurements recorded for this set.</p>
          </div>
        ) : (
          <div className="grid-2">
            {columns.map((column, columnIndex) => (
              <table key={columnIndex}>
                <thead>
                  <tr>
                    <th>Measurement</th>
                    <th className="center" style={{ width: "34%" }}>
                      Reading
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rowCount }).map((_, rowIndex) => {
                    const field = column[rowIndex]

                    // Blank rows keep the two columns the same height, so the
                    // pair reads as one ruled block rather than a ragged edge.
                    if (!field) {
                      return (
                        <tr key={`blank-${columnIndex}-${rowIndex}`}>
                          <td>&nbsp;</td>
                          <td>&nbsp;</td>
                        </tr>
                      )
                    }

                    return (
                      <tr key={field.key}>
                        <td>{field.label}</td>
                        <td className="num center">
                          {measurement[field.key]?.toFixed(1) ?? "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ))}
          </div>
        )}
      </div>

      {measurement.notes ? (
        <div className="section">
          <h2 className="section__title">Notes</h2>
          <div className="panel">
            <p className="note">{measurement.notes}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
