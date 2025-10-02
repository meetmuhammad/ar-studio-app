import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { measurementSchema } from "@/types/measurements";

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminSupabaseClient();
    const { searchParams } = new URL(request.url);
    const customer_id = searchParams.get("customer_id");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("measurements")
      .select(`
        *,
        customer:customers(id, name, phone)
      `)
      .order("created_at", { ascending: false });

    // Filter by customer if provided
    if (customer_id) {
      query = query.eq("customer_id", customer_id);
    }

    // Search in measurement name or customer name
    if (search) {
      query = query.or(`name.ilike.%${search}%,customer.name.ilike.%${search}%`);
    }

    // Apply pagination
    const countQuery = supabase
      .from("measurements")
      .select("*", { count: "exact", head: true });
    
    if (customer_id) {
      countQuery.eq("customer_id", customer_id);
    }
    if (search) {
      countQuery.or(`name.ilike.%${search}%,customer.name.ilike.%${search}%`);
    }

    const [{ data: measurements, error }, { count }] = await Promise.all([
      query.range(offset, offset + limit - 1),
      countQuery,
    ]);

    if (error) {
      console.error("Error fetching measurements:", error);
      return NextResponse.json(
        { error: "Failed to fetch measurements" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      measurements: measurements || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error("Measurements API error:", error);
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

    // Validate the request body
    const validatedData = measurementSchema.parse(body);

    // Convert empty strings to null for optional numeric fields
    const measurementData = {
      ...validatedData,
      chest: validatedData.chest === "" ? null : validatedData.chest,
      waist: validatedData.waist === "" ? null : validatedData.waist,
      hip: validatedData.hip === "" ? null : validatedData.hip,
      shoulder_width: validatedData.shoulder_width === "" ? null : validatedData.shoulder_width,
      arm_length: validatedData.arm_length === "" ? null : validatedData.arm_length,
      bicep: validatedData.bicep === "" ? null : validatedData.bicep,
      neck: validatedData.neck === "" ? null : validatedData.neck,
      wrist: validatedData.wrist === "" ? null : validatedData.wrist,
      thigh: validatedData.thigh === "" ? null : validatedData.thigh,
      inseam: validatedData.inseam === "" ? null : validatedData.inseam,
      outseam: validatedData.outseam === "" ? null : validatedData.outseam,
      knee: validatedData.knee === "" ? null : validatedData.knee,
      calf: validatedData.calf === "" ? null : validatedData.calf,
      ankle: validatedData.ankle === "" ? null : validatedData.ankle,
      back_length: validatedData.back_length === "" ? null : validatedData.back_length,
      front_length: validatedData.front_length === "" ? null : validatedData.front_length,
    };

    // If this is set as default, unset other defaults for the same customer
    if (measurementData.is_default) {
      await supabase
        .from("measurements")
        .update({ is_default: false })
        .eq("customer_id", measurementData.customer_id);
    }

    const { data, error } = await supabase
      .from("measurements")
      .insert([measurementData])
      .select(`
        *,
        customer:customers(id, name, phone)
      `)
      .single();

    if (error) {
      console.error("Error creating measurement:", error);
      return NextResponse.json(
        { error: "Failed to create measurement" },
        { status: 500 }
      );
    }

    return NextResponse.json({ measurement: data }, { status: 201 });
  } catch (error) {
    console.error("Create measurement error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}