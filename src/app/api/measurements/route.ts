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
      sleeves: validatedData.sleeves === "" ? null : validatedData.sleeves,
      biceps: validatedData.biceps === "" ? null : validatedData.biceps,
      wrist: validatedData.wrist === "" ? null : validatedData.wrist,
      neck: validatedData.neck === "" ? null : validatedData.neck,
      shoulder: validatedData.shoulder === "" ? null : validatedData.shoulder,
      cross_back: validatedData.cross_back === "" ? null : validatedData.cross_back,
      open_coat_length: validatedData.open_coat_length === "" ? null : validatedData.open_coat_length,
      coat_length: validatedData.coat_length === "" ? null : validatedData.coat_length,
      sherwani_length: validatedData.sherwani_length === "" ? null : validatedData.sherwani_length,
      kameez_length: validatedData.kameez_length === "" ? null : validatedData.kameez_length,
      three_piece_waistcoat_length: validatedData.three_piece_waistcoat_length === "" ? null : validatedData.three_piece_waistcoat_length,
      waistcoat_length: validatedData.waistcoat_length === "" ? null : validatedData.waistcoat_length,
      pent_waist: validatedData.pent_waist === "" ? null : validatedData.pent_waist,
      pent_length: validatedData.pent_length === "" ? null : validatedData.pent_length,
      thigh: validatedData.thigh === "" ? null : validatedData.thigh,
      knee: validatedData.knee === "" ? null : validatedData.knee,
      bottom: validatedData.bottom === "" ? null : validatedData.bottom,
      shoe_size: validatedData.shoe_size === "" ? null : validatedData.shoe_size,
      turban_size: validatedData.turban_size === "" ? null : validatedData.turban_size,
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