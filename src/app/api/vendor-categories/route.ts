import { withAdmin } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

/**
 * Global vendor categories — the controlled list used to classify vendors for
 * accounting.
 *
 * Distinct from vendor_tags: tags are free-text labels a vendor may have many
 * of; a category is one classification chosen from this list.
 *
 * ADMIN ONLY, including reads. This is the accounting chart, and the sibling
 * vendor routes are admin-only for the same reason. The guard is the wrapper,
 * not the UI — staff hitting these endpoints directly get 403 regardless of
 * what is rendered.
 */

// GET /api/vendor-categories?include_archived=1
export const GET = withAdmin(async (request: Request) => {
  try {
    const supabase = createAdminSupabaseClient()
    const { searchParams } = new URL(request.url)
    const includeArchived = searchParams.get('include_archived') === '1'

    let query = supabase
      .from('vendor_categories')
      .select('*')
      .order('name', { ascending: true })

    if (!includeArchived) query = query.is('archived_at', null)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching vendor categories:', error)
      return NextResponse.json({ error: 'Failed to fetch vendor categories' }, { status: 500 })
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Error in GET /api/vendor-categories:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

// POST /api/vendor-categories  { name }
export const POST = withAdmin(async (request: Request) => {
  try {
    const supabase = createAdminSupabaseClient()
    const body = await request.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!name) {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 })
    }
    if (name.length > 120) {
      return NextResponse.json({ error: 'Category name is too long (max 120)' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('vendor_categories')
      .insert({ name })
      .select()
      .single()

    if (error) {
      // Unique index is on lower(btrim(name)), so this also catches
      // "charity" against an existing "Charity".
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A category with that name already exists', code: 'DUPLICATE_CATEGORY' },
          { status: 409 }
        )
      }
      console.error('Error creating vendor category:', error)
      return NextResponse.json({ error: 'Failed to create vendor category' }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/vendor-categories:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
