import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'
import { businessNames, requireBusiness, requireBusinessRead } from '@/lib/business-context'
import { belongsToBusiness } from '@/lib/database'
import { getRangeRunningBalances, listLedgerEntries } from '@/lib/ledger-service'

// GET /api/general-ledger - List entries with filters and pagination
export async function GET(request: Request) {
  const scope = await requireBusinessRead(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

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
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const { entries, count } = await listLedgerEntries({
      businessIds: scope.businessIds,
      startDate,
      endDate,
      entryType: searchParams.get('entry_type'),
      vendorId: searchParams.get('vendor_id'),
      vendorCategoryId: searchParams.get('vendor_category_id'),
      search: searchParams.get('search'),
      page,
      pageSize,
    })

    // Admin combined view (X-Business-Id: all): read-only, and with NO running
    // balance. Each business is its own book, so one balance column walking
    // through both would be meaningless; `balance` and `range_balance` are
    // null and every row says which business it belongs to.
    if (!scope.business) {
      const names = businessNames(scope)
      const combined = entries.map((e: { business_id?: string }) => ({
        ...e,
        balance: null,
        range_balance: null,
        business_name: names.get(e.business_id ?? '') ?? null,
      }))
      if (page > 0) {
        return NextResponse.json({
          data: combined,
          combined: true,
          pagination: { page, pageSize, total: count, pages: Math.ceil(count / pageSize) },
        })
      }
      return NextResponse.json(combined)
    }

    // If paginated, return with pagination info
    if (page > 0) {
      // range_balance: the running balance within the selected date range
      // (starts at 0, debit - credit in ledger order), so the newest in-range
      // entry equals the stats route's currentBalance for the same range. It is
      // computed over every entry in the range, not just this page, so later
      // pages and search/category filters do not change it. `balance` stays the
      // stored all-time running balance.
      const rangeBalances = await getRangeRunningBalances(
        scope.business.id,
        entries.map((e: { id: string }) => e.id),
        { startDate: startDate || null, endDate: endDate || null },
      )
      const withRangeBalance = entries.map((e: { id: string }) => {
        const b = rangeBalances.get(e.id)
        return { ...e, range_balance: b === undefined ? null : Number(b) }
      })
      return NextResponse.json({
        data: withRangeBalance,
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
  const scope = await requireBusiness(request, { roles: ['admin'] })
  if (scope instanceof NextResponse) return scope

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

    // Linked vendor / order / tag must be in this business: not found otherwise.
    if (
      !(await belongsToBusiness('vendors', [vendor_id], scope.businessId)) ||
      !(await belongsToBusiness('orders', [order_id], scope.businessId))
    ) {
      return NextResponse.json({ error: 'Vendor or order not found' }, { status: 404 })
    }
    if (tag_id) {
      const { data: tag } = await supabase
        .from('vendor_tags')
        .select('id, vendors!inner(business_id)')
        .eq('id', tag_id)
        .eq('vendors.business_id', scope.businessId)
        .maybeSingle()
      if (!tag) return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }

    const { data: entry, error } = await supabase
      .from('general_ledger')
      .insert({
        business_id: scope.businessId,
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
