import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { requireAdmin } from '@/lib/api-auth'
import { listLedgerEntries } from '@/lib/ledger-service'

// GET /api/general-ledger - List entries with filters and pagination
export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)

    // vendor_category_id filters by the vendor's CURRENT category
    // (vendors.category_id), not the per-row snapshot
    // general_ledger.vendor_category_id. Filtering on the snapshot matched
    // nothing for any vendor classified after its entries were written, which
    // is every vendor, since the category system postdates the books.
    const page = parseInt(searchParams.get('page') || '0') // 0 = no pagination (legacy)
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    // The query itself lives in the shared ledger service so the MCP server
    // reads the ledger through exactly the same code.
    const { entries, count } = await listLedgerEntries({
      startDate: searchParams.get('start_date'),
      endDate: searchParams.get('end_date'),
      entryType: searchParams.get('entry_type'),
      vendorId: searchParams.get('vendor_id'),
      vendorCategoryId: searchParams.get('vendor_category_id'),
      search: searchParams.get('search'),
      page,
      pageSize,
    })

    // If paginated, return with pagination info
    if (page > 0) {
      return NextResponse.json({
        data: entries,
        pagination: {
          page,
          pageSize,
          total: count,
          pages: Math.ceil(count / pageSize),
        }
      })
    }

    // Legacy: return flat array for backward compatibility (dashboard-stats, etc.)
    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error in GET /api/general-ledger:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ledger entries' },
      { status: 500 }
    )
  }
}

// POST /api/general-ledger - Create new entry
export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (auth instanceof NextResponse) return auth

  try {
    const supabase = createAdminSupabaseClient()
    const body = await request.json()

    const {
      entry_date,
      particulars,
      debit,
      credit,
      entry_type,
      notes,
      order_id,
      vendor_id,
      tag_id,
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
      .insert({
        entry_date,
        particulars: particulars.trim(),
        debit: debit || null,
        credit: credit || null,
        entry_type,
        notes: notes?.trim() || null,
        order_id: order_id || null,
        vendor_id: vendor_id || null,
        tag_id: tag_id || null,
      })
      .select(`
        *,
        vendors (id, name),
        orders (id, order_number),
        vendor_tags (id, tag_name)
      `)
      .single()

    if (error) {
      console.error('Error creating ledger entry:', error)
      return NextResponse.json(
        { error: 'Failed to create ledger entry' },
        { status: 500 }
      )
    }

    // Note: Vendor ledger entry is automatically created by database trigger
    // (trg_create_vendor_sub_ledger_entry) - no need to create it here

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/general-ledger:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
