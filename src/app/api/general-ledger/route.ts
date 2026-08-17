import { withAdmin } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/general-ledger - List entries with filters and pagination
export const GET = withAdmin(async (request: Request) => {
  try {
    const supabase = createAdminSupabaseClient()
    const { searchParams } = new URL(request.url)
    
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const entryType = searchParams.get('entry_type')
    const vendorId = searchParams.get('vendor_id')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '0') // 0 = no pagination (legacy)
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    let query = supabase
      .from('general_ledger')
      .select(`
        *,
        vendors (id, name),
        orders (id, order_number),
        vendor_tags (id, tag_name)
      `, { count: 'exact' })
      // (entry_date, created_at, id) is the ledger's canonical order and the
      // order the running balance is computed in
      // (recalculate_ledger_balances_from). `id` is not decoration: two entries
      // can tie on both date and created_at, and without the tiebreak the rows
      // would be listed in an order the stored balances do not follow.
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (startDate) {
      query = query.gte('entry_date', startDate)
    }
    if (endDate) {
      query = query.lte('entry_date', endDate)
    }
    if (entryType) {
      query = query.eq('entry_type', entryType)
    }
    if (vendorId) {
      query = query.eq('vendor_id', vendorId)
    }
    if (search) {
      query = query.ilike('particulars', `%${search}%`)
    }

    // Apply pagination if page > 0
    if (page > 0) {
      const offset = (page - 1) * pageSize
      query = query.range(offset, offset + pageSize - 1)
    }

    const { data: entries, error, count } = await query

    if (error) {
      console.error('Error fetching ledger entries:', error)
      return NextResponse.json(
        { error: 'Failed to fetch ledger entries' },
        { status: 500 }
      )
    }

    // If paginated, return with pagination info
    if (page > 0) {
      return NextResponse.json({
        data: entries,
        pagination: {
          page,
          pageSize,
          total: count || 0,
          pages: Math.ceil((count || 0) / pageSize),
        }
      })
    }

    // Legacy: return flat array for backward compatibility (dashboard-stats, etc.)
    return NextResponse.json(entries)
  } catch (error) {
    console.error('Error in GET /api/general-ledger:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})

// POST /api/general-ledger - Create new entry
export const POST = withAdmin(async (request: Request) => {
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
})
