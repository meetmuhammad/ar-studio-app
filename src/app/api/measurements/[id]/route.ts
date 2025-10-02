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