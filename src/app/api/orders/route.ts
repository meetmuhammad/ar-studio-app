import { NextRequest, NextResponse } from 'next/server'
import { getOrders } from '@/lib/database'
import { CreateOrderSchema, OrderQuerySchema } from '@/lib/validators'
import { requireBusiness, requireBusinessRead } from '@/lib/business-context'
import { callerSupabaseClient, rpcErrorStatus } from '@/lib/api-auth'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/orders - List orders with search and pagination
export async function GET(request: NextRequest) {
  const scope = await requireBusinessRead(request)
  if (scope instanceof NextResponse) return scope

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
      scope,
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
    // Bad query params (an unknown sortBy, a non-uuid customerId, ...) are the
    // caller's mistake: 400, not 500.
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.message },
        { status: 400 }
      )
    }
    console.error('GET /api/orders error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}

// POST /api/orders - Create a new order
export async function POST(request: NextRequest) {
  // Creating an order also writes its advance to the ledger, so this is a
  // ledger write path; staff create orders, so staff stay allowed.
  const scope = await requireBusiness(request)
  if (scope instanceof NextResponse) return scope

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

    // Stored exactly as before: dates as YYYY-MM-DD, `value || null` for the
    // optional fields. `balance` is always sent (null when absent) so
    // create_order stores null like this route always has, instead of
    // computing total - advance.
    const order = {
      customer_id: validatedData.customerId,
      booking_date: validatedData.bookingDate.toISOString().split('T')[0],
      delivery_date: validatedData.deliveryDate.toISOString().split('T')[0],
      status: validatedData.status || 'In Process',
      comments: validatedData.comments,
      total_amount: validatedData.totalAmount || null,
      advance_paid: validatedData.advancePaid || null,
      balance: validatedData.balance || null,
      payment_method: validatedData.paymentMethod || null,
      measurement_id: validatedData.measurementId || null,
      fitting_preferences: validatedData.fittingPreferences,
    }

    // The order, its items and its advance ledger row are written in one
    // transaction by create_order (20261119000100), as the caller: same
    // numbering (<code>-#####), same advance row, same member check, and the
    // customer / measurement must be in this business (P0002 -> 404).
    const { data: created, error: createError } = await callerSupabaseClient(request).rpc('create_order', {
      p_business_id: scope.businessId,
      p_order: order,
      p_items: validatedData.orderItems ?? [],
      p_advance: null,
    })

    if (createError) {
      const status = rpcErrorStatus(createError)
      if (status === 404) {
        return NextResponse.json({ error: 'Customer or measurement not found' }, { status })
      }
      if (status === 401) return NextResponse.json({ error: 'Unauthorized - Please sign in' }, { status })
      if (status === 403) return NextResponse.json({ error: 'Forbidden - No access to this business' }, { status })
      if (status === 400) {
        return NextResponse.json({ error: 'Validation failed', details: createError.message }, { status })
      }
      console.error('POST /api/orders create_order error:', createError)
      return NextResponse.json({ error: `Failed to create order: ${createError.message}` }, { status: 500 })
    }

    // Same response as before: the orders row alone (create_order also
    // returns the items, which this route never did).
    const createdOrder: Record<string, unknown> = { ...(created as Record<string, unknown>) }
    delete createdOrder.order_items
    const { data: saved, error: readError } = await createAdminSupabaseClient()
      .from('orders')
      .select('*')
      .eq('id', createdOrder.id as string)
      .single()

    if (readError || !saved) {
      // The order exists; answering 500 would invite a duplicate retry.
      console.error('POST /api/orders: created but could not be read back:', readError)
      return NextResponse.json(createdOrder, { status: 201 })
    }

    return NextResponse.json(saved, { status: 201 })
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
