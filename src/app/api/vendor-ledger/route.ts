import { withAdmin } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/vendor-ledger?vendor_id={id} - Get vendor sub-ledger
export const GET = withAdmin(async (request: Request) => {
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
        general_ledger (
          id,
          entry_type,
          order_id,
          orders (id, order_number)
        )
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
})

// POST /api/vendor-ledger - Create vendor bill (sub-ledger only, no main ledger entry)
export const POST = withAdmin(async (request: Request) => {
  try {
    const supabase = createAdminSupabaseClient()
    const body = await request.json()

    const {
      vendor_id,
      entry_date,
      particulars,
      debit,
      credit,
      notes,
    } = body

    // Validation
    if (!vendor_id || !entry_date || !particulars) {
      return NextResponse.json(
        { error: 'vendor_id, entry_date, and particulars are required' },
        { status: 400 }
      )
    }

    // Ensure either debit or credit is provided, not both
    if ((debit && credit) || (!debit && !credit)) {
      return NextResponse.json(
        { error: 'Provide either debit or credit, not both' },
        { status: 400 }
      )
    }

    // Get the last balance for this vendor
    const { data: lastEntry } = await supabase
      .from('vendor_ledger')
      .select('balance')
      .eq('vendor_id', vendor_id)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const previousBalance = lastEntry?.balance || 0
    const newBalance = previousBalance + (debit || 0) - (credit || 0)

    // Create vendor_ledger entry only (no general ledger entry)
    const { data: entry, error } = await supabase
      .from('vendor_ledger')
      .insert({
        vendor_id,
        general_ledger_id: null, // No link to general ledger
        entry_date,
        particulars: particulars.trim(),
        debit: debit || null,
        credit: credit || null,
        balance: newBalance,
        notes: notes?.trim() || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating vendor ledger entry:', error)
      return NextResponse.json(
        { error: 'Failed to create vendor ledger entry' },
        { status: 500 }
      )
    }

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/vendor-ledger:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
