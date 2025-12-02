import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/general-ledger/[id] - Get single entry
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = await params

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

// PUT /api/general-ledger/[id] - Update entry
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = await params
    const body = await request.json()

    const {
      entry_date,
      particulars,
      debit,
      credit,
      entry_type,
      notes,
      vendor_id,
    } = body

    // Validation
    if (!entry_date || !particulars || !entry_type) {
      return NextResponse.json(
        { error: 'entry_date, particulars, and entry_type are required' },
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

    const { data: entry, error } = await supabase
      .from('general_ledger')
      .update({
        entry_date,
        particulars: particulars.trim(),
        debit: debit || null,
        credit: credit || null,
        entry_type,
        notes: notes?.trim() || null,
        vendor_id: vendor_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        vendors (id, name),
        orders (id, order_number),
        vendor_tags (id, tag_name)
      `)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Entry not found' },
          { status: 404 }
        )
      }
      console.error('Error updating ledger entry:', error)
      return NextResponse.json(
        { error: 'Failed to update ledger entry' },
        { status: 500 }
      )
    }

    // Update or create vendor_ledger entry if vendor_id exists
    // First, delete existing vendor_ledger entry for this general_ledger entry
    await supabase
      .from('vendor_ledger')
      .delete()
      .eq('general_ledger_id', id)

    // If vendor_id is provided, create new vendor_ledger entry with reversed debit/credit
    if (vendor_id) {
      const { error: vendorLedgerError } = await supabase
        .from('vendor_ledger')
        .insert({
          vendor_id,
          general_ledger_id: id,
          entry_date,
          particulars: particulars.trim(),
          debit: credit || null,  // Reverse: main ledger credit = vendor ledger debit
          credit: debit || null,  // Reverse: main ledger debit = vendor ledger credit
          notes: notes?.trim() || null,
        })

      if (vendorLedgerError) {
        console.error('Error updating vendor ledger entry:', vendorLedgerError)
      }
    }

    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error in PUT /api/general-ledger/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/general-ledger/[id] - Delete entry
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createAdminSupabaseClient()
    const { id } = await params

    // First delete vendor_ledger entries (if any)
    await supabase
      .from('vendor_ledger')
      .delete()
      .eq('general_ledger_id', id)

    // Then delete the general ledger entry
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
