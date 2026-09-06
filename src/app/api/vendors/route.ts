import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/vendors - List all vendors
export async function GET() {
  try {
    const supabase = createAdminSupabaseClient()

    const { data: vendors, error } = await supabase
      .from('vendors')
      .select(`
        *,
        vendor_categories (id, name, archived_at)
      `)
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
