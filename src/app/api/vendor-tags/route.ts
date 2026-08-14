import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { withAdmin } from '@/lib/api-auth'

// GET /api/vendor-tags?vendor_id={id} - Get tags for a vendor
async function GETHandler(request: Request) {
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
async function POSTHandler(request: Request) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Authorization: admin only
// Mirrors the client-side RoleGuard on the corresponding page. The handlers
// above are unchanged; only the exported entry points are wrapped.
// ─────────────────────────────────────────────────────────────────────────────
export const GET = withAdmin(GETHandler)
export const POST = withAdmin(POSTHandler)
