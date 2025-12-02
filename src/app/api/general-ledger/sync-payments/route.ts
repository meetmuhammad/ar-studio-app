import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase'

// POST /api/general-ledger/sync-payments - Sync existing order payments to ledger
export async function POST() {
  try {
    const supabase = createAdminSupabaseClient()

    // First, delete all existing order_payment entries to recreate them
    const { error: deleteError } = await supabase
      .from('general_ledger')
      .delete()
      .eq('entry_type', 'order_payment')

    if (deleteError) {
      console.error('Error deleting existing order payments:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete existing entries' },
        { status: 500 }
      )
    }

    // Get all orders with advance_paid > 0
    const { data: ordersWithAdvance, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, advance_paid, booking_date')
      .gt('advance_paid', 0)

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      )
    }

    // Get all payments
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id, order_id, amount, payment_date, payment_method, notes, order:orders(order_number)')

    if (paymentsError) {
      console.error('Error fetching payments:', paymentsError)
      return NextResponse.json(
        { error: 'Failed to fetch payments' },
        { status: 500 }
      )
    }

    const entriesToCreate = []

    // Create entries for all orders with advance payments
    for (const order of ordersWithAdvance || []) {
      entriesToCreate.push({
        entry_date: order.booking_date,
        particulars: `Advance payment for Order #${order.order_number}`,
        debit: order.advance_paid,
        entry_type: 'order_payment',
        order_id: order.id,
        notes: 'Synced from order advance payment',
      })
    }

    // Create entries for all additional payments
    for (const payment of payments || []) {
      entriesToCreate.push({
        entry_date: payment.payment_date,
        particulars: `Payment for Order #${payment.order.order_number}`,
        debit: payment.amount,
        entry_type: 'order_payment',
        order_id: payment.order_id,
        notes: payment.notes || `Payment via ${payment.payment_method}`,
      })
    }

    // Bulk insert
    if (entriesToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from('general_ledger')
        .insert(entriesToCreate)

      if (insertError) {
        console.error('Error inserting ledger entries:', insertError)
        return NextResponse.json(
          { error: 'Failed to create ledger entries' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      synced: entriesToCreate.length,
      orders: ordersWithAdvance?.length || 0,
      payments: payments?.length || 0,
    })
  } catch (error) {
    console.error('Error in POST /api/general-ledger/sync-payments:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
