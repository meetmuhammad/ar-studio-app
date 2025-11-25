import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/vendor-ledger?vendor_id={id} - Get vendor sub-ledger
export async function GET(request: Request) {
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

    const { data: entries, error } = await supabase
      .from('vendor_ledger')
      .select(`
        *,
        general_ledger (*)
      `)
      .eq('vendor_id', vendorId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching vendor ledger:', error)
      return NextResponse.json(
        { error: 'Failed to fetch vendor ledger' },
        { status: 500 }
      )
    }

    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error in GET /api/vendor-ledger:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
