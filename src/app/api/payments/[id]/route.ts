import { NextRequest, NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { requireBusiness } from "@/lib/business-context";
import { callerSupabaseClient, rpcErrorStatus } from "@/lib/api-auth";

// Payment writes are admin only, as in RLS (20261119000000) and
// update_payment / delete_payment (20261119000100). Both run those functions
// as the caller, so the payment and its linked general_ledger row
// (20261119000500) change in one transaction.

/** A function error as this route has always answered it, or null for a 500. */
function knownRpcError(error: PostgrestError): NextResponse | null {
  const status = rpcErrorStatus(error);
  if (status === 404) return NextResponse.json({ error: "Payment not found" }, { status });
  if (status === 400) return NextResponse.json({ error: error.message }, { status });
  if (status === 401) return NextResponse.json({ error: "Unauthorized - Please sign in" }, { status });
  if (status === 403) return NextResponse.json({ error: "Forbidden - Insufficient permissions" }, { status });
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusiness(request, { roles: ['admin'] });
  if (scope instanceof NextResponse) return scope;

  try {
    const body = await request.json();
    const supabase = createAdminSupabaseClient();
    const { id: paymentId } = await params;

    // Validate payment exists in the business of this request (X-Business-Id)
    const { data: existingPayment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .eq("business_id", scope.businessId)
      .single();

    if (fetchError || !existingPayment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // IMPORTANT: ONLY payments fields. The orders table (advance_paid,
    // total_amount, balance) is never changed here; update_payment ignores
    // any other key.
    const patch: Record<string, unknown> = {};
    if (body.amount !== undefined) patch.amount = parseFloat(body.amount);
    if (body.payment_method !== undefined) patch.payment_method = body.payment_method;
    if (body.payment_date !== undefined) patch.payment_date = body.payment_date;
    if (body.notes !== undefined) patch.notes = body.notes;

    const { error: updateError } = await callerSupabaseClient(request).rpc("update_payment", {
      p_payment_id: paymentId,
      p_patch: patch,
    });

    if (updateError) {
      const known = knownRpcError(updateError);
      if (known) return known;
      console.error("Error updating payment:", updateError);
      return NextResponse.json(
        { error: "Failed to update payment" },
        { status: 500 }
      );
    }

    // Same response as before: the payment with its order.
    const { data: payment, error: readError } = await supabase
      .from("payments")
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
      .eq("id", paymentId)
      .eq("business_id", scope.businessId)
      .single();

    if (readError || !payment) {
      console.error("Payment updated but could not be read back:", readError);
      return NextResponse.json(
        { error: "Failed to update payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payment });
  } catch (error) {
    console.error("Update payment error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await requireBusiness(request, { roles: ['admin'] });
  if (scope instanceof NextResponse) return scope;

  try {
    const supabase = createAdminSupabaseClient();
    const { id: paymentId } = await params;

    // Validate payment exists in the business of this request (X-Business-Id)
    const { data: existingPayment, error: fetchError } = await supabase
      .from("payments")
      .select("id")
      .eq("id", paymentId)
      .eq("business_id", scope.businessId)
      .single();

    if (fetchError || !existingPayment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Deletes the payment AND its general_ledger row, in one transaction.
    const { error: deleteError } = await callerSupabaseClient(request).rpc("delete_payment", {
      p_payment_id: paymentId,
    });

    if (deleteError) {
      const known = knownRpcError(deleteError);
      if (known) return known;
      console.error("Error deleting payment:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete payment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
