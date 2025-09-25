import { NextRequest, NextResponse } from 'next/server'
import { getOrder, updateOrder, deleteOrder } from '@/lib/database'
import { UpdateOrderSchema } from '@/lib/validators'

// GET /api/orders/[id] - Get order by ID
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await getOrder(params.id)

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
  { params }: { params: { id: string } }
) {
  try {
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
      delivery_date: validatedData.deliveryDate?.toISOString().split('T')[0] || null,
      customer_id: validatedData.customerId,
      // Transform measurement field names to match database schema (snake_case)
      cross_back: validatedData.crossBack,
      three_piece_waistcoat: validatedData.threePieceWaistcoat,
      waistcoat_length: validatedData.waistcoatLength,
      sherwani_length: validatedData.sherwaniLength,
      pant_waist: validatedData.pantWaist,
      pant_length: validatedData.pantLength,
      shoe_size: validatedData.shoeSize,
      turban_length: validatedData.turbanLength,
      fitting_preferences: validatedData.fittingPreferences,
    }

    // Remove the camelCase fields that were transformed
    const {
      customerId,
      bookingDate,
      deliveryDate,
      crossBack,
      threePieceWaistcoat,
      waistcoatLength,
      sherwaniLength,
      pantWaist,
      pantLength,
      shoeSize,
      turbanLength,
      fittingPreferences,
      ...finalUpdateData
    } = updateData

    const order = await updateOrder(params.id, finalUpdateData as any)

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
  { params }: { params: { id: string } }
) {
  try {
    await deleteOrder(params.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/orders/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500 }
    )
  }
}