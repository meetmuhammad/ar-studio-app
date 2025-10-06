import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminSupabaseClient();
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    const customerId = searchParams.get("customer_id");

    let query = supabase
      .from("payments")
      .select(`
        *,
        order:orders(
          id,
          order_number,
          total_amount,
          advance_paid,
          balance,
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
}

export async function POST(request: NextRequest) {
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
      .select("id, customer_id, booking_date, total_amount, advance_paid, balance")
      .eq("id", order_id)
      .eq("customer_id", customer_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: "Order not found or does not belong to customer" },
        { status: 404 }
      );
    }


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
      .select(`
        *,
        order:orders(
          id,
          order_number,
          total_amount,
          advance_paid,
          balance,
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
}