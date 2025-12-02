import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// GET /api/general-ledger/stats - Get ledger statistics
export async function GET() {
  try {
    const supabase = createAdminSupabaseClient()

    const { data: entries, error } = await supabase
      .from('general_ledger')
      .select('debit, credit, balance')

    if (error) {
      console.error('Error fetching ledger stats:', error)
      return NextResponse.json(
        { error: 'Failed to fetch ledger stats' },
        { status: 500 }
      )
    }

    const totalDebit = entries.reduce((sum, entry) => sum + (entry.debit || 0), 0)
    const totalCredit = entries.reduce((sum, entry) => sum + (entry.credit || 0), 0)
    // Calculate balance as: Credit (money in) - Debit (money out)
    const currentBalance = totalCredit - totalDebit

    return NextResponse.json({
      totalDebit,
      totalCredit,
      currentBalance,
      entryCount: entries.length,
    })
  } catch (error) {
    console.error('Error in GET /api/general-ledger/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
