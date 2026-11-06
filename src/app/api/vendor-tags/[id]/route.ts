import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { requireBusiness } from '@/lib/business-context'

// DELETE /api/vendor-tags/[id] - Delete vendor tag
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusiness(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

  try {
    const supabase = createAdminSupabaseClient()
    const { id } = await params

    // The tag's vendor must be in this business; otherwise it is not found.
    const { data: tag } = await supabase
      .from('vendor_tags')
      .select('id, vendors!inner(business_id)')
      .eq('id', id)
      .eq('vendors.business_id', scope.businessId)
      .maybeSingle()
    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

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
