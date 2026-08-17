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

    // Write to the GENERAL LEDGER, not straight into vendor_ledger.
    //
    // This route used to insert a vendor_ledger row with
    // `general_ledger_id: null` and a comment saying "No link to general
    // ledger". The two ledgers then diverged: an entry added from the vendor
    // sub-ledger screen existed only in the sub-ledger and never reached the
    // main books.
    //
    // The synchronisation already exists and runs the other way. The general
    // ledger is the source of truth: `trg_create_vendor_sub_ledger_entry` fires
    // AFTER INSERT on general_ledger and creates the matching vendor_ledger row
    // with `general_ledger_id` set. So the fix is to insert where the mechanism
    // already starts and let it mirror down, rather than adding a second,
    // opposite path.
    //
    // That is also why this cannot recurse. There is no vendor_ledger ->
    // general_ledger trigger and none is being added; this route no longer
    // touches vendor_ledger at all. One insert here yields exactly one
    // general_ledger row and exactly one vendor_ledger row.
    //
    // DIRECTION. The caller speaks sub-ledger: the bill form sends
    // `credit: amount` for "bill from vendor". The mirroring trigger inverts
    // (general-ledger credit -> vendor debit), so the general-ledger row must be
    // written inverted for the sub-ledger row to come back out the way the user
    // entered it.
    //
    // `balance` on both rows is derived by the database triggers, and the Wave 4
    // category snapshot is filled by trg_snapshot_vendor_category because this
    // insert carries vendor_id.
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
})
