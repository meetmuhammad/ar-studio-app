import { NextRequest, NextResponse } from 'next/server'
import { getCustomer, updateCustomer, deleteCustomer } from '@/lib/database'
import { UpdateCustomerSchema } from '@/lib/validators'
import { requireBusiness, requireBusinessRead } from '@/lib/business-context'

// GET /api/customers/[id] - Get customer by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusinessRead(request)
  if (scope instanceof NextResponse) return scope

  try {
    const { id } = await params
    // A customer of another business is simply not found.
    const customer = await getCustomer(id, scope)

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(customer)
  } catch (error) {
    console.error('GET /api/customers/[id] error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
      { status: 500 }
    )
  }
}

// PATCH /api/customers/[id] - Update customer
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusiness(request)
  if (scope instanceof NextResponse) return scope

  try {
    const { id } = await params
    const body = await request.json()
    const validatedData = UpdateCustomerSchema.parse(body)

    const customer = await updateCustomer(id, scope.businessId, validatedData)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    return NextResponse.json(customer)
  } catch (error) {
    console.error('PATCH /api/customers/[id] error:', error)

    if (error instanceof Error && error.message.includes('Phone number already exists')) {
      return NextResponse.json(
        { error: 'Phone number already exists' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}

// DELETE /api/customers/[id] - Delete customer
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusiness(request)
  if (scope instanceof NextResponse) return scope

  try {
    const { id } = await params
    if (!(await deleteCustomer(id, scope.businessId))) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/customers/[id] error:', error)

    if (error instanceof Error && error.message.includes('Customer has orders')) {
      return NextResponse.json(
        { error: 'Customer has orders; reassign or delete orders first' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to delete customer' },
      { status: 500 }
    )
  }
}