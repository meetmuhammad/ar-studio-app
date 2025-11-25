import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/general-ledger/[id] - Get single entry
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = params

    const { data: entry, error } = await supabase
      .from('general_ledger')
      .select(`
        *,
        vendors (id, name),
        orders (id, order_number),
        vendor_tags (id, tag_name)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Entry not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching ledger entry:', error)
      return NextResponse.json(
        { error: 'Failed to fetch ledger entry' },
        { status: 500 }
      )
    }

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error in GET /api/general-ledger/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/general-ledger/[id] - Delete entry
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = params

    const { error } = await supabase
      .from('general_ledger')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting ledger entry:', error)
      return NextResponse.json(
        { error: 'Failed to delete ledger entry' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/general-ledger/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
