import { NextRequest, NextResponse } from 'next/server'
import { getOrders, createOrder } from '@/lib/database'
import { CreateOrderSchema, OrderQuerySchema } from '@/lib/validators'

// GET /api/orders - List orders with search and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = OrderQuerySchema.parse({
      q: searchParams.get('q') || undefined,
      customerId: searchParams.get('customerId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      page: searchParams.get('page') || '1',
      pageSize: searchParams.get('pageSize') || '10',
      sortBy: searchParams.get('sortBy') || undefined,
      sortDir: searchParams.get('sortDir') || 'desc',
    })

    const result = await getOrders({
      q: query.q,
      customerId: query.customerId,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    })

    return NextResponse.json({
      data: result.data,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        pages: result.pages,
      },
    })
  } catch (error) {
    console.error('GET /api/orders error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}

// POST /api/orders - Create a new order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Transform date strings to proper format for validation
    if (body.bookingDate) {
      body.bookingDate = new Date(body.bookingDate)
    }
    if (body.deliveryDate) {
      body.deliveryDate = new Date(body.deliveryDate)
    }

    const validatedData = CreateOrderSchema.parse(body)

    // Transform dates back to ISO strings for database storage
    const orderData = {
      ...validatedData,
      booking_date: validatedData.bookingDate.toISOString().split('T')[0],
      delivery_date: validatedData.deliveryDate.toISOString().split('T')[0], // Now mandatory
      customer_id: validatedData.customerId,
      // Payment fields
      total_amount: validatedData.totalAmount || null,
      advance_paid: validatedData.advancePaid || null,
      balance: validatedData.balance || null,
      payment_method: validatedData.paymentMethod || null,
      // Reference to measurements table
      measurement_id: validatedData.measurementId || null,
      // Fitting preferences as separate field
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
      ...finalOrderData
    } = orderData

    const order = await createOrder(finalOrderData)

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('POST /api/orders error:', error)
    
    // Check if it's a validation error
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation failed', details: error.message },
        { status: 400 }
      )
    }
    
    // Return the actual error message for debugging
    const errorMessage = error instanceof Error ? error.message : 'Failed to create order'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
