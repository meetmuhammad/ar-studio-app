import { withAuth, withAdmin } from '@/lib/api-auth'
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const supabase = createAdminSupabaseClient();
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    const customerId = searchParams.get("customer_id");

    let query = supabase
      .from("payments")
      // `balance` deliberately not projected: it is the retired denormalised
      // `orders.balance`, wrong on 58 of 65 staging orders, and no client reads
      // it off this embed. The honest outstanding figure is
      // `orders_with_payment_status.current_balance`.
      .select(`
        *,
        order:orders(
          id,
          order_number,
          total_amount,
          advance_paid,
          booking_date,
          customer:customers(id, name, phone)
        )
      `)
      .order("payment_date", { ascending: false });

    // Filter by order if provided
    if (orderId) {
      query = query.eq("order_id", orderId);
    }

    // Filter by customer if provided
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error("Error fetching payments:", error);
      return NextResponse.json(
        { error: "Failed to fetch payments" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      payments: payments || [],
    });
  } catch (error) {
    console.error("Payments API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
})

export const POST = withAdmin(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const supabase = createAdminSupabaseClient();

    // Validate required fields
    const { order_id, customer_id, amount, payment_method, payment_date, notes } = body;

    if (!order_id || !customer_id || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: order_id, customer_id, amount" },
        { status: 400 }
      );
    }

    // Validate that the order exists and belongs to the customer
    const { data: order, error: orderError } = await supabase
      .from("orders")
      // Existence/ownership check only. `balance` dropped: retired column,
      // and nothing below reads it.
      .select("id, customer_id, booking_date, total_amount, advance_paid")
      .eq("id", order_id)
      .eq("customer_id", customer_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found or does not belong to customer" },
        { status: 404 }
      );
    }

    // IMPORTANT: We are creating a NEW payment in the payments table
    // This should NOT modify the advance_paid field in the orders table
    // The advance_paid field should only be set during order creation
    console.log(`[PAYMENT CREATE] Order ${order_id} current advance_paid: ${order.advance_paid}`);

    // Create the payment
    const paymentData = {
      order_id,
      customer_id,
      amount: parseFloat(amount),
      payment_method: payment_method || "other",
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      notes: notes || null,
    };

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert([paymentData])
      // `balance` deliberately not projected -- see the note on the GET query.
      .select(`
        *,
        order:orders(
          id,
          order_number,
          total_amount,
          advance_paid,
          customer:customers(id, name, phone)
        )
      `)
      .single();

    if (paymentError) {
      console.error("Error creating payment:", paymentError);
      return NextResponse.json(
        { error: "Failed to create payment" },
        { status: 500 }
      );
    }

    // Create ledger entry for this payment
    const { error: ledgerError } = await supabase.from('general_ledger').insert({
      entry_date: paymentData.payment_date,
      particulars: `Payment for Order #${payment.order.order_number}`,
      debit: paymentData.amount,
      entry_type: 'order_payment',
      order_id: order_id,
      notes: paymentData.notes || `Payment via ${paymentData.payment_method}`,
    });

    if (ledgerError) {
      console.error("Error creating ledger entry:", ledgerError);
      // Don't fail the payment creation if ledger entry fails
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("Create payment error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
})