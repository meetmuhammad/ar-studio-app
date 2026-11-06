import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { inScope, requireBusinessRead } from "@/lib/business-context";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const scope = await requireBusinessRead(request);
  if (scope instanceof NextResponse) return scope;

  try {
    const { id: customerId } = await params;
    const supabase = createAdminSupabaseClient();

    const { data: measurements, error } = await inScope(supabase
      .from("measurements")
      .select(`
        *,
        customer:customers(id, name, phone)
      `)
      .eq("customer_id", customerId), scope)
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