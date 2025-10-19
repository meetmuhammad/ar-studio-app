import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { measurementSchema } from "@/types/measurements";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const supabase = createAdminSupabaseClient();

    const { data: measurement, error } = await supabase
      .from("measurements")
      .select(`
        *,
        customer:customers(id, name, phone)
      `)
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching measurement:", error);
      return NextResponse.json(
        { error: "Measurement not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ measurement });
  } catch (error) {
    console.error("Get measurement error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id } = await params;
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
        .eq("customer_id", measurementData.customer_id)
        .neq("id", id);
    }

    const { data, error } = await supabase
      .from("measurements")
      .update(measurementData)
      .eq("id", id)
      .select(`
        *,
        customer:customers(id, name, phone)
      `)
      .single();

    if (error) {
      console.error("Error updating measurement:", error);
      return NextResponse.json(
        { error: "Failed to update measurement" },
        { status: 500 }
      );
    }

    return NextResponse.json({ measurement: data });
  } catch (error) {
    console.error("Update measurement error:", error);
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
  { params }: RouteParams
) {
  try {
    const { id } = await params;
    const supabase = createAdminSupabaseClient();

    const { error } = await supabase
      .from("measurements")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting measurement:", error);
      return NextResponse.json(
        { error: "Failed to delete measurement" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: "Measurement deleted successfully" });
  } catch (error) {
    console.error("Delete measurement error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}