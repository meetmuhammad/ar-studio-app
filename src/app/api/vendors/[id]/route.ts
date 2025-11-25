import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/vendors/[id] - Get vendor with ledger entries
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = params

    const { data: vendor, error } = await supabase
      .from('vendors')
      .select(`
        *,
        vendor_tags (*),
        vendor_ledger (*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Vendor not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching vendor:', error)
      return NextResponse.json(
        { error: 'Failed to fetch vendor' },
        { status: 500 }
      )
    }

    return NextResponse.json(vendor)
  } catch (error) {
    console.error('Error in GET /api/vendors/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/vendors/[id] - Update vendor
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = params
    const body = await request.json()

    const { name, contact_person, phone, email, address, notes } = body

    if (!name || name.trim() === '') {
      return NextResponse.json(
        { error: 'Vendor name is required' },
        { status: 400 }
      )
    }

    const { data: vendor, error } = await supabase
      .from('vendors')
      .update({
        name: name.trim(),
        contact_person: contact_person?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Vendor not found' },
          { status: 404 }
        )
      }
      console.error('Error updating vendor:', error)
      return NextResponse.json(
        { error: 'Failed to update vendor' },
        { status: 500 }
      )
    }

    return NextResponse.json(vendor)
  } catch (error) {
    console.error('Error in PUT /api/vendors/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/vendors/[id] - Delete vendor
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = params

    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting vendor:', error)
      return NextResponse.json(
        { error: 'Failed to delete vendor' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/vendors/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
