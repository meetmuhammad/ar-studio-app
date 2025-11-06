import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const supabase = createAdminSupabaseClient();
    const { id: paymentId } = await params;

    // Validate payment exists
    const { data: existingPayment, error: fetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (fetchError || !existingPayment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount);
    if (body.payment_method !== undefined) updateData.payment_method = body.payment_method;
    if (body.payment_date !== undefined) updateData.payment_date = body.payment_date;
    if (body.notes !== undefined) updateData.notes = body.notes;

    // Update the payment
    const { data: payment, error: updateError } = await supabase
      .from("payments")
      .update(updateData)
      .eq("id", paymentId)
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

    if (updateError) {
      console.error("Error updating payment:", updateError);
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
  try {
    const supabase = createAdminSupabaseClient();
    const { id: paymentId } = await params;

    // Validate payment exists
    const { data: existingPayment, error: fetchError } = await supabase
      .from("payments")
      .select("id")
      .eq("id", paymentId)
      .single();

    if (fetchError || !existingPayment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Delete the payment
    const { error: deleteError } = await supabase
      .from("payments")
      .delete()
      .eq("id", paymentId);

    if (deleteError) {
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
