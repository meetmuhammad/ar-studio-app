import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { inScope, requireBusiness, requireBusinessRead } from '@/lib/business-context'

// GET /api/vendors - List all vendors
export async function GET(request: Request) {
  const scope = await requireBusinessRead(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  try {
    const supabase = createAdminSupabaseClient()

    // Vendors belong to one business. Categories stay shared (global chart).
    const { data: vendors, error } = await inScope(supabase
      .from('vendors')
      .select(`
        *,
        vendor_categories (id, name, archived_at)
      `), scope)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching vendors:', error)
      return NextResponse.json(
        { error: 'Failed to fetch vendors' },
        { status: 500 }
      )
    }

    return NextResponse.json(vendors)
  } catch (error) {
    console.error('Error in GET /api/vendors:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/vendors - Create new vendor
export async function POST(request: Request) {
  const scope = await requireBusiness(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  try {
    const supabase = createAdminSupabaseClient()
    const body = await request.json()

    const { name, contact_person, phone, email, address, notes, category_id } = body

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Vendor name is required' },
        { status: 400 }
      )
    }

    const { data: vendor, error } = await supabase
      .from('vendors')
      .insert({
        business_id: scope.businessId,
        name: name.trim(),
        contact_person: contact_person?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        // Optional: every vendor may have ONE primary accounting category.
        category_id: category_id || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating vendor:', error)
      return NextResponse.json(
        { error: 'Failed to create vendor' },
        { status: 500 }
      )
    }

    return NextResponse.json(vendor, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/vendors:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
