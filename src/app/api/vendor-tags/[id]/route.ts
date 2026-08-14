import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { withAdmin } from '@/lib/api-auth'

// DELETE /api/vendor-tags/[id] - Delete vendor tag
async function DELETEHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = await params

    const { error } = await supabase
      .from('vendor_tags')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting vendor tag:', error)
      return NextResponse.json(
        { error: 'Failed to delete vendor tag' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/vendor-tags/[id]:', error)
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
export const DELETE = withAdmin<{ params: Promise<{ id: string }> }>(DELETEHandler)
