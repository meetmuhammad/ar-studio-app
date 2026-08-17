import { withAuth } from '@/lib/api-auth'
import { NextRequest, NextResponse } from 'next/server'
import { getOrders, createOrder, createOrderItems } from '@/lib/database'
import { CreateOrderSchema, OrderQuerySchema } from '@/lib/validators'

/**
 * The exact set of `orders` columns a create is allowed to write.
 *
 * RETIRED COLUMNS -- deliberately absent:
 *
 *   - order_number : server-assigned by `nextOrderNumber()`, never from the client.
 *
 *   - balance      : a legacy denormalised column. Nothing keeps it current: no
 *                    trigger maintains it, POST never wrote it (the old code
 *                    computed `balance` and then destructured it away), and
 *                    PATCH /api/orders/[id] deliberately stopped writing it on
 *                    `fix/advance-payment-immutability`. Recording a payment
 *                    does not touch it either. On staging it already disagrees
 *                    with `total_amount - total_paid` on roughly 50 of 65
 *                    orders.
 *
 *                    It is retired here rather than revived. The only value
 *                    that could honestly be written at create time is
 *                    `total_amount - advance_paid`, which is true for exactly
 *                    as long as it takes to record the first payment and
 *                    silently wrong forever after -- and, because it is only
 *                    written on some rows, a reader cannot tell a fresh value
 *                    from a stale one. That is worse than no value.
 *
 *                    The authoritative figure is
 *                    `orders_with_payment_status.current_balance`
 *                    = total_amount - (COALESCE(advance_paid,0) + SUM(payments.amount)),
 *                    derived on read and therefore never stale.
 *
 * `CreateOrderSchema` still accepts a `balance` key so the existing forms keep
 * validating; the value is simply not persisted.
 */
type NewOrderColumns = {
  customer_id: string
  booking_date: string
  delivery_date: string
  status: 'In Process' | 'Delivered' | 'Cancelled'
  comments: string | null
  total_amount: number | null
  advance_paid: number | null
  payment_method: 'cash' | 'bank' | 'other' | null
  measurement_id: string | null
  fitting_preferences: string | null
}

// GET /api/orders - List orders with search and pagination
export const GET = withAuth(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const query = OrderQuerySchema.parse({
      q: searchParams.get('q') || undefined,
      customerId: searchParams.get('customerId') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      status: searchParams.get('status') || undefined,
      page: searchParams.get('page') || '1',
      pageSize: searchParams.get('pageSize') || '10',
      sortBy: searchParams.get('sortBy') || undefined,
      sortDir: searchParams.get('sortDir') || 'asc',
    })

    const result = await getOrders({
      q: query.q,
      customerId: query.customerId,
      from: query.from,
      to: query.to,
      status: query.status,
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
})

// POST /api/orders - Create a new order
export const POST = withAuth(async (request: NextRequest) => {
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

    // Build the row key by key, the same way PATCH /api/orders/[id] does.
    //
    // The previous version spread the validated object and then destructured
    // the camelCase keys back out, which had two consequences:
    //
    //   1. `x || null` mapped a legitimate 0 to NULL. An order genuinely worth
    //      0, or booked with no advance, stored NULL -- indistinguishable from
    //      "not recorded", and NULL propagates through every SUM and
    //      comparison differently from 0.
    //   2. `balance` was listed in the destructure that stripped the camelCase
    //      keys, so the snake_case `balance` it had just computed was thrown
    //      away with them. `orders.balance` was therefore never written on
    //      create at all -- see the note on RETIRED COLUMNS below.
    const bookingDate = validatedData.bookingDate.toISOString().split('T')[0]

    const orderRow: NewOrderColumns = {
      customer_id: validatedData.customerId,
      booking_date: bookingDate,
      delivery_date: validatedData.deliveryDate.toISOString().split('T')[0],
      status: validatedData.status || 'In Process',
      comments: validatedData.comments || null,
      // Monetary fields: `?? null` keeps 0 as 0 and only maps a genuinely
      // absent value to NULL.
      total_amount: validatedData.totalAmount ?? null,
      advance_paid: validatedData.advancePaid ?? null,
      payment_method: validatedData.paymentMethod ?? null,
      measurement_id: validatedData.measurementId ?? null,
      fitting_preferences: validatedData.fittingPreferences || null,
    }

    // Create the order first
    const order = await createOrder(orderRow)

    // Create order items if any
    const orderItems = validatedData.orderItems
    if (orderItems && orderItems.length > 0) {
      await createOrderItems(order.id, orderItems)
    }

    // Create ledger entry if advance payment > 0
    const advancePaid = orderRow.advance_paid
    if (advancePaid !== null && advancePaid > 0) {
      const { createAdminSupabaseClient } = await import('@/lib/supabase')
      const supabase = createAdminSupabaseClient()

      await supabase.from('general_ledger').insert({
        entry_date: bookingDate,
        particulars: `Advance payment for Order #${order.order_number}`,
        debit: advancePaid,
        entry_type: 'order_payment',
        order_id: order.id,
        notes: `Initial advance payment during order creation`,
      })
    }

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
})
