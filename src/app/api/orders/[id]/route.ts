import { NextRequest, NextResponse } from 'next/server'
import { getOrder, updateOrder, updateOrderItems, belongsToBusiness } from '@/lib/database'
import { callerSupabaseClient, rpcErrorStatus } from '@/lib/api-auth'
import { UpdateOrderSchema } from '@/lib/validators'
import { requireBusiness, requireBusinessRead } from '@/lib/business-context'
import { omit } from '@/lib/utils'

// GET /api/orders/[id] - Get order by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusinessRead(request)
  if (scope instanceof NextResponse) return scope

  try {
    const { id } = await params
    const order = await getOrder(id, scope)

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
}

// PATCH /api/orders/[id] - Update order
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusiness(request)
  if (scope instanceof NextResponse) return scope

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

    // Transform dates back to ISO strings for database storage
    const updateData = {
      ...validatedData,
      booking_date: validatedData.bookingDate?.toISOString().split('T')[0],
      delivery_date: validatedData.deliveryDate?.toISOString().split('T')[0],
      status: validatedData.status, // Include status if provided
      customer_id: validatedData.customerId,
      // Payment fields
      total_amount: validatedData.totalAmount || null,
      advance_paid: validatedData.advancePaid || null,
      balance: validatedData.balance || null,
      payment_method: validatedData.paymentMethod || null,
      // Reference to measurements table
      measurement_id: validatedData.measurementId || null,
      fitting_preferences: validatedData.fittingPreferences,
    }

    const { orderItems } = updateData
    // Remove the camelCase fields that were transformed, and status (re-added
    // below). balance has the same name in both forms, so it is removed too.
    const finalUpdateData = omit(updateData, [
      'customerId',
      'bookingDate',
      'deliveryDate',
      'totalAmount',
      'advancePaid',
      'balance',
      'paymentMethod',
      'measurementId',
      'fittingPreferences',
      'orderItems',
      'status',
    ])
    
    // Re-add status if provided
    const updateWithStatus = {
      ...finalUpdateData,
      ...(updateData.status && { status: updateData.status })
    }

    // A new customer/measurement must also be in this business.
    if (
      !(await belongsToBusiness('customers', [updateWithStatus.customer_id], scope.businessId)) ||
      !(await belongsToBusiness('measurements', [updateWithStatus.measurement_id], scope.businessId))
    ) {
      return NextResponse.json({ error: 'Customer or measurement not found' }, { status: 404 })
    }

    // Update the order (scoped: an order of another business is not found)
    const order = await updateOrder(id, scope.businessId, updateWithStatus)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Update order items if provided
    if (orderItems !== undefined) {
      await updateOrderItems(id, orderItems)
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('PATCH /api/orders/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    )
  }
}

// DELETE /api/orders/[id] - Delete order (with its items, payments and their
// order_payment ledger rows). Admin only, as in RLS (20261119000000) and
// delete_order (20261119000100), which does it in one transaction as the caller.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusiness(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  try {
    const { id } = await params
    // In the business of this request (X-Business-Id); delete_order checks
    // membership of the order's business, not which business was selected.
    if (!(await belongsToBusiness('orders', [id], scope.businessId))) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const { error } = await callerSupabaseClient(request).rpc('delete_order', { p_order_id: id })
    if (error) {
      const status = rpcErrorStatus(error)
      if (status === 404) return NextResponse.json({ error: 'Order not found' }, { status })
      if (status === 401) return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status })
      if (status === 403) return NextResponse.json({ error: 'Forbidden - Insufficient permissions' }, { status })
      console.error('DELETE /api/orders/[id] delete_order error:', error)
      return NextResponse.json(
        { error: 'Failed to delete order' },
        { status: 500 }
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/orders/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500 }
    )
  }
}
