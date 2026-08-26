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
}

// POST /api/vendor-ledger - Create vendor bill
//
// Ported from feat/vendor-categories (commit 91bb9ab). This route used to
// insert straight into vendor_ledger with `general_ledger_id: null` and a
// comment reading "no link to general ledger" -- so a bill entered from a
// vendor's sub-ledger screen existed only in vendor_ledger and never reached
// general_ledger. Money recorded against a vendor was invisible in the main
// books, and the running `balance` on that orphaned row was computed by hand
// here, disconnected from the rest of the ledger.
//
// The other direction already keeps the two ledgers in sync: main's own
// `POST /api/general-ledger` (src/app/api/general-ledger/route.ts) inserts
// only into general_ledger and explicitly comments
// "Vendor ledger entry is automatically created by database trigger
// (trg_create_vendor_sub_ledger_entry) -- no need to create it here". That
// trigger is not part of this port (no migration here creates or changes it);
// it is existing infrastructure this route now relies on, the same way the
// general-ledger route already does.
//
// Fix: write to general_ledger, the trigger mirrors the row into
// vendor_ledger (balance included), and this route reads that mirrored row
// back so the response contract (a vendor_ledger row) is unchanged.
//
// Direction: the caller speaks sub-ledger -- the bill form sends
// `credit: amount` for "bill from vendor". The mirroring trigger inverts
// (general-ledger credit -> vendor debit), so the general-ledger row must be
// written inverted for the sub-ledger row to come back out the way the user
// entered it.
//
// This cannot recurse or double-write: there is no vendor_ledger ->
// general_ledger trigger, none is added here, and this route no longer
// touches vendor_ledger directly at all. One insert yields exactly one
// general_ledger row and exactly one vendor_ledger row.
export async function POST(request: Request) {
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

    const { data: ledgerEntry, error: ledgerError } = await supabase
      .from('general_ledger')
      .insert({
        entry_date,
        particulars: particulars.trim(),
        debit: credit || null,   // sub-ledger credit -> general-ledger debit
        credit: debit || null,   // sub-ledger debit  -> general-ledger credit
        entry_type: 'vendor_payment',
        vendor_id,
        notes: notes?.trim() || null,
      })
      .select()
      .single()

    if (ledgerError) {
      console.error('Error creating general ledger entry:', ledgerError)
      return NextResponse.json(
        { error: 'Failed to create vendor ledger entry' },
        { status: 500 }
      )
    }

    // Return the vendor_ledger row the trigger produced -- callers of this
    // endpoint expect the sub-ledger entry, and that contract is unchanged.
    const { data: entry, error } = await supabase
      .from('vendor_ledger')
      .select('*')
      .eq('general_ledger_id', ledgerEntry.id)
      .single()

    if (error || !entry) {
      console.error('General ledger row created but no vendor_ledger row found:', error)
      return NextResponse.json(
        { error: 'Vendor ledger entry was not created' },
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
}
