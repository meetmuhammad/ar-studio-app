import { NextRequest, NextResponse } from 'next/server'
import { getOrder, updateOrder, deleteOrder, updateOrderItems } from '@/lib/database'
import { UpdateOrderSchema } from '@/lib/validators'

// GET /api/orders/[id] - Get order by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
}

// PATCH /api/orders/[id] - Update order
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Remove the camelCase fields that were transformed
    const {
      customerId,
      bookingDate,
      deliveryDate,
      totalAmount,
      advancePaid,
      balance,
      paymentMethod,
      measurementId,
      fittingPreferences,
      orderItems,
      ...finalUpdateData
    } = updateData

    // Update the order
    const order = await updateOrder(id, finalUpdateData)
    
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

// DELETE /api/orders/[id] - Delete order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
}