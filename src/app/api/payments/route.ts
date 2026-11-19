import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { inScope, requireBusiness, requireBusinessRead } from "@/lib/business-context";
import { callerSupabaseClient, rpcErrorStatus } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const scope = await requireBusinessRead(request);
  if (scope instanceof NextResponse) return scope;

  try {
    const supabase = createAdminSupabaseClient();
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("order_id");
    const customerId = searchParams.get("customer_id");

    let query = inScope(supabase
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
      `), scope)
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

// The payment as the mobile app has always received it (with its order).
const PAYMENT_WITH_ORDER = `
  *,
  order:orders(
    id,
    order_number,
    total_amount,
    advance_paid,
    balance,
    customer:customers(id, name, phone)
  )
`;

export async function POST(request: NextRequest) {
  // Recording a payment (and its ledger row) is admin only, as in RLS
  // (20261119000000) and record_payment (20261119000100). Staff may read.
  const scope = await requireBusiness(request, { roles: ['admin'] });
  if (scope instanceof NextResponse) return scope;

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

    // Validate that the order exists, belongs to the customer and is in the
    // business of this request (X-Business-Id). record_payment checks
    // membership of the order's business, not which business was selected.
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, customer_id, booking_date, total_amount, advance_paid, balance")
      .eq("id", order_id)
      .eq("customer_id", customer_id)
      // An order of another business is not found.
      .eq("business_id", scope.businessId)
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

    // The payment and its linked general_ledger row are written in one
    // transaction by record_payment (20261119000100 + 20261119000500), as the
    // caller, so the database applies the same admin/member checks as the web app.
    const { data: recorded, error: paymentError } = await callerSupabaseClient(request).rpc("record_payment", {
      p_order_id: order_id,
      p_payment: {
        customer_id,
        amount: parseFloat(amount),
        payment_method: payment_method || "other",
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        notes: notes || null,
      },
    });

    if (paymentError) {
      const status = rpcErrorStatus(paymentError);
      if (status === 404) {
        return NextResponse.json({ error: "Order not found or does not belong to customer" }, { status });
      }
      if (status === 400) return NextResponse.json({ error: paymentError.message }, { status });
      if (status === 401) return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status });
      if (status === 403) return NextResponse.json({ error: "Forbidden - Insufficient permissions" }, { status });
      console.error("Error creating payment:", paymentError);
      return NextResponse.json(
        { error: "Failed to create payment" },
        { status: 500 }
      );
    }

    // Same response as before: the payment with its order.
    const { data: payment, error: readError } = await supabase
      .from("payments")
      .select(PAYMENT_WITH_ORDER)
      .eq("id", recorded.id)
      .single();

    if (readError || !payment) {
      // The payment is recorded; answering 500 would invite a duplicate retry.
      console.error("Payment recorded but could not be read back:", readError);
      return NextResponse.json({ payment: recorded }, { status: 201 });
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
