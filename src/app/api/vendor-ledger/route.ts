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
      // (entry_date, created_at, id) is the total order the database now stores
      // balances in. Without `id` the ordering is not total and two rows tying
      // on both timestamps could be displayed in an order their running
      // balances disagree with.
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

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

    // `balance` is derived, never supplied. It used to be computed here from
    // `order by entry_date desc, created_at desc limit 1`, which is not a total
    // order and, for a back-dated entry, read the newest row rather than the
    // row this entry actually follows. The database now owns it:
    // trg_calculate_vendor_ledger_balance seeds the new row from its true
    // predecessor within this vendor, and the statement-level AFTER INSERT
    // trigger repairs every later row for that vendor. See
    // supabase/migrations/20260817160000_vendor_ledger_balance_integrity.sql.
    const { data: entry, error } = await supabase
      .from('vendor_ledger')
      .insert({
        vendor_id,
        general_ledger_id: null, // No link to general ledger
        entry_date,
        particulars: particulars.trim(),
        debit: debit || null,
        credit: credit || null,
        balance: 0, // overwritten by the BEFORE INSERT trigger
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
