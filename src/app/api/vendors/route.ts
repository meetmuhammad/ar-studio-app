import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { withAdmin } from '@/lib/api-auth'

// GET /api/vendors - List all vendors
async function GETHandler() {
  try {
    const supabase = createAdminSupabaseClient()

    const { data: vendors, error } = await supabase
      .from('vendors')
      .select('*')
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
async function POSTHandler(request: Request) {
  try {
    const supabase = createAdminSupabaseClient()
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
      .insert({
        name: name.trim(),
        contact_person: contact_person?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Authorization: admin only
// Mirrors the client-side RoleGuard on the corresponding page. The handlers
// above are unchanged; only the exported entry points are wrapped.
// ─────────────────────────────────────────────────────────────────────────────
export const GET = withAdmin(GETHandler)
export const POST = withAdmin(POSTHandler)
