import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// PATCH /api/vendor-categories/[id]  { name?, archived? }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = await params
    const body = await request.json()

    const update: Record<string, unknown> = {}

    if (body?.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'Category name cannot be empty' }, { status: 400 })
      if (name.length > 120) return NextResponse.json({ error: 'Category name is too long (max 120)' }, { status: 400 })
      update.name = name
    }

    // Archiving hides a category from pickers without destroying the accounting
    // meaning of entries already classified under it.
    if (body?.archived !== undefined) {
      update.archived_at = body.archived ? new Date().toISOString() : null
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('vendor_categories')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A category with that name already exists', code: 'DUPLICATE_CATEGORY' },
          { status: 409 }
        )
      }
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Category not found' }, { status: 404 })
      }
      console.error('Error updating vendor category:', error)
      return NextResponse.json({ error: 'Failed to update vendor category' }, { status: 500 })
    }

    // A rename does NOT rewrite ledger snapshots. Entries keep the name the
    // books carried when they were written -- that is what the snapshot is for.
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PATCH /api/vendor-categories/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/vendor-categories/[id]
 *
 * Refuses when the category is referenced, and says by what. Deleting a
 * category that has classified real ledger entries would strip the meaning from
 * historical accounting rows, so the safe operation is archiving, which the
 * response points at. Only a category nothing has ever used can be removed
 * outright.
 *
 * The database enforces this too — both foreign keys are ON DELETE RESTRICT —
 * so a caller that bypasses this check still cannot corrupt the history.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = await params

    const [{ count: vendorCount }, { count: ledgerCount }] = await Promise.all([
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('category_id', id),
      supabase.from('general_ledger').select('*', { count: 'exact', head: true }).eq('vendor_category_id', id),
    ])

    if ((vendorCount ?? 0) > 0 || (ledgerCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: 'This category is in use and cannot be deleted. Archive it instead.',
          code: 'CATEGORY_IN_USE',
          vendors: vendorCount ?? 0,
          ledgerEntries: ledgerCount ?? 0,
        },
        { status: 409 }
      )
    }

    const { error } = await supabase.from('vendor_categories').delete().eq('id', id)

    if (error) {
      if (error.code === '23503') {
        return NextResponse.json(
          { error: 'This category is in use and cannot be deleted. Archive it instead.', code: 'CATEGORY_IN_USE' },
          { status: 409 }
        )
      }
      console.error('Error deleting vendor category:', error)
      return NextResponse.json({ error: 'Failed to delete vendor category' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/vendor-categories/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
