import { withAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { getOrder, updateOrder, deleteOrder, updateOrderItems } from '@/lib/database'
import { UpdateOrderSchema } from '@/lib/validators'

/**
 * The exact set of `orders` columns a PATCH is allowed to write.
 *
 * Deliberately absent:
 *   - order_number  : server-assigned, never client-editable.
 *   - advance_paid  : fixed at order creation. Money collected later belongs in
 *                     the `payments` table (POST /api/payments), which is what
 *                     `orders_with_payment_status.total_paid` sums. Letting an
 *                     order edit move it would silently rewrite history and
 *                     desynchronise it from the ledger entry written at
 *                     creation time.
 *   - balance       : a legacy denormalised column that no code keeps current
 *                     (it already disagrees with total_amount - total_paid on
 *                     most rows). `orders_with_payment_status.current_balance`
 *                     is the authoritative figure and the UI computes its own.
 *                     Writing a client-supplied value here would only mint a
 *                     fresh lie, so PATCH leaves the column alone.
 */
type PatchableOrderColumns = {
  customer_id: string
  booking_date: string
  delivery_date: string
  status: 'In Process' | 'Delivered' | 'Cancelled'
  comments: string | null
  total_amount: number | null
  payment_method: 'cash' | 'bank' | 'other' | null
  measurement_id: string | null
  fitting_preferences: string | null
}

// GET /api/orders/[id] - Get order by ID
export const GET = withAuth<{ params: Promise<{ id: string }> }>(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params
    const order = await getOrder(id)

    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('GET /api/orders/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    )
  }
})

// PATCH /api/orders/[id] - Update order
export const PATCH = withAuth<{ params: Promise<{ id: string }> }>(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params
    const body = await request.json()
    
    // Transform date strings to proper format for validation
    if (body.bookingDate) {
      body.bookingDate = new Date(body.bookingDate)
    }
    if (body.deliveryDate) {
      body.deliveryDate = new Date(body.deliveryDate)
    }

    const validatedData = UpdateOrderSchema.parse(body)

    const existing = await getOrder(id)
    if (!existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // advance_paid is the initial advance and nothing else. Accept it only when
    // the caller is echoing back the value already stored (the edit form always
    // sends the whole object, so a no-op must not 400); reject any actual change
    // and point the caller at the payments flow.
    if (validatedData.advancePaid !== undefined) {
      const current = Number(existing.advance_paid ?? 0)
      const requested = Number(validatedData.advancePaid)
      if (requested !== current) {
        return NextResponse.json(
          {
            error:
              'advance_paid is fixed when the order is created. Record money collected later as a payment (POST /api/payments) instead of editing the order.',
            code: 'ADVANCE_PAID_IMMUTABLE',
            current_advance_paid: current,
          },
          { status: 400 }
        )
      }
    }

    // The database enforces `advance_paid <= total_amount`
    // (check_advance_not_exceed_total). Zod cannot see that on a partial update
    // because the advance usually is not in the body, so lowering the total
    // below the already-collected advance used to surface as an opaque 500.
    if (validatedData.totalAmount !== undefined) {
      const currentAdvance = Number(existing.advance_paid ?? 0)
      if (validatedData.totalAmount < currentAdvance) {
        return NextResponse.json(
          {
            error: `Total amount cannot be less than the advance already collected (${currentAdvance}).`,
            code: 'TOTAL_BELOW_ADVANCE',
            current_advance_paid: currentAdvance,
          },
          { status: 400 }
        )
      }
    }

    // Build the update from the fields that were ACTUALLY sent.
    //
    // The previous version spread the whole validated object and used
    // `x || null` for the money fields, so a partial PATCH -- e.g. `{ comments }`
    // -- shipped `total_amount: null, advance_paid: null, payment_method: null`
    // and wiped them. `|| null` also mapped a legitimate 0 to NULL. An absent
    // key here is simply never added, and supabase-js JSON-encodes the payload,
    // so an untouched column is left untouched.
    const updates: Partial<PatchableOrderColumns> = {}

    if (validatedData.customerId !== undefined) updates.customer_id = validatedData.customerId
    if (validatedData.bookingDate !== undefined)
      updates.booking_date = validatedData.bookingDate.toISOString().split('T')[0]
    if (validatedData.deliveryDate !== undefined)
      updates.delivery_date = validatedData.deliveryDate.toISOString().split('T')[0]
    if (validatedData.status !== undefined) updates.status = validatedData.status
    if (validatedData.comments !== undefined) updates.comments = validatedData.comments || null
    if (validatedData.totalAmount !== undefined) updates.total_amount = validatedData.totalAmount
    if (validatedData.paymentMethod !== undefined) updates.payment_method = validatedData.paymentMethod
    if (validatedData.measurementId !== undefined) updates.measurement_id = validatedData.measurementId
    if (validatedData.fittingPreferences !== undefined)
      updates.fitting_preferences = validatedData.fittingPreferences || null

    // Update the order. An empty `updates` still refreshes updated_at, which is
    // the same thing the old code did for a body of `{}`.
    const order = await updateOrder(id, updates)

    // Update order items if provided
    if (validatedData.orderItems !== undefined) {
      await updateOrderItems(id, validatedData.orderItems)
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('PATCH /api/orders/[id] error:', error)

    // A rejected body is the caller's fault, not ours. Returning 500 here made
    // every validation failure look like an outage in the client.
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    )
  }
})

// DELETE /api/orders/[id] - Delete order
export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params
    await deleteOrder(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/orders/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500 }
    )
  }
})