import { NextRequest, NextResponse } from 'next/server'
import { getCustomers, createCustomer } from '@/lib/database'
import { CreateCustomerSchema, CustomerQuerySchema } from '@/lib/validators'

// GET /api/customers - List customers with search and pagination
export async function GET(request: NextRequest) {
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
export async function POST(request: NextRequest) {
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