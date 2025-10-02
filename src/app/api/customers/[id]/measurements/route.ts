import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: customerId } = await params;
    const supabase = createAdminSupabaseClient();

    const { data: measurements, error } = await supabase
      .from("measurements")
      .select(`
        *,
        customer:customers(id, name, phone)
      `)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching customer measurements:", error);
      return NextResponse.json(
        { error: "Failed to fetch customer measurements" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      measurements: measurements || [],
      total: measurements?.length || 0,
    });
  } catch (error) {
    console.error("Get customer measurements error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}