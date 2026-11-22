import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { requireAdmin, requireAuth } from '@/lib/api-auth'

/**
 * Global vendor categories — the controlled list used to classify vendors for
 * accounting.
 *
 * Distinct from vendor_tags: tags are free-text labels a vendor may have many
 * of; a category is one classification chosen from this list.
 *
 * One list shared by every business. Any signed-in user with a role (admin or
 * staff) may read it; only admins may create, rename, archive or delete
 * categories. Same rules as RLS (20261119000000).
 */

// GET /api/vendor-categories?include_archived=1
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

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
}

// POST /api/vendor-categories  { name }
export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) return auth

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
}
