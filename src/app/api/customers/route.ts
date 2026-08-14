import { NextRequest, NextResponse } from 'next/server'
import { getCustomers, createCustomer } from '@/lib/database'
import { CreateCustomerSchema, CustomerQuerySchema } from '@/lib/validators'
import { withAuth } from '@/lib/api-auth'

// GET /api/customers - List customers with search and pagination
async function GETHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = CustomerQuerySchema.parse({
      q: searchParams.get('q') || undefined,
      page: searchParams.get('page') || '1',
      pageSize: searchParams.get('pageSize') || '10',
      sortBy: searchParams.get('sortBy') || undefined,
      sortDir: searchParams.get('sortDir') || 'desc',
    })

    const result = await getCustomers({
      q: query.q,
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
    console.error('GET /api/customers error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
      { status: 500 }
    )
  }
}

// POST /api/customers - Create a new customer
async function POSTHandler(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = CreateCustomerSchema.parse(body)

    const customer = await createCustomer({
      name: validatedData.name,
      phone: validatedData.phone,
      address: validatedData.address || null,
    })

    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('POST /api/customers error:', error)

    if (error instanceof Error && error.message.includes('Phone number already exists')) {
      return NextResponse.json(
        { error: 'Phone number already exists' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization: any signed-in user
// Mirrors the client-side RoleGuard on the corresponding page. The handlers
// above are unchanged; only the exported entry points are wrapped.
// ─────────────────────────────────────────────────────────────────────────────
export const GET = withAuth(GETHandler)
export const POST = withAuth(POSTHandler)
