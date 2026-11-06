import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { requireBusiness, requireBusinessRead } from '@/lib/business-context'
import { createAdminSupabaseClient as adminClient } from '@/lib/supabase'

/** Tags follow their vendor: the vendor must be in one of the scope's businesses. */
async function vendorInScope(vendorId: string, businessIds: string[]) {
  const { data } = await adminClient()
    .from('vendors').select('id').eq('id', vendorId).in('business_id', businessIds).maybeSingle()
  return !!data
}

// GET /api/vendor-tags?vendor_id={id} - Get tags for a vendor
export async function GET(request: Request) {
  const scope = await requireBusinessRead(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  try {
    const supabase = createAdminSupabaseClient()
    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendor_id')

    if (!vendorId) {
      return NextResponse.json(
        { error: 'vendor_id is required' },
        { status: 400 }
      )
    }

    if (!(await vendorInScope(vendorId, scope.businessIds))) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    const { data: tags, error } = await supabase
      .from('vendor_tags')
      .select('*')
      .eq('vendor_id', vendorId)
      .order('tag_name', { ascending: true })

    if (error) {
      console.error('Error fetching vendor tags:', error)
      return NextResponse.json(
        { error: 'Failed to fetch vendor tags' },
        { status: 500 }
      )
    }

    return NextResponse.json(tags)
  } catch (error) {
    console.error('Error in GET /api/vendor-tags:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/vendor-tags - Create new tag
export async function POST(request: Request) {
  const scope = await requireBusiness(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  try {
    const supabase = createAdminSupabaseClient()
    const body = await request.json()

    const { vendor_id, tag_name } = body

    if (!vendor_id || !tag_name || tag_name.trim() === '') {
      return NextResponse.json(
        { error: 'vendor_id and tag_name are required' },
        { status: 400 }
      )
    }

    if (!(await vendorInScope(vendor_id, scope.businessIds))) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    const { data: tag, error } = await supabase
      .from('vendor_tags')
      .insert({
        vendor_id,
        tag_name: tag_name.trim(),
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Tag already exists for this vendor' },
          { status: 409 }
        )
      }
      console.error('Error creating vendor tag:', error)
      return NextResponse.json(
        { error: 'Failed to create vendor tag' },
        { status: 500 }
      )
    }

    return NextResponse.json(tag, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/vendor-tags:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
