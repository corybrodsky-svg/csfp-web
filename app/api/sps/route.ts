import { NextResponse } from "next/server";
import { supabaseServer } from "../../lib/supabaseServerClient";

export const dynamic = "force-dynamic";

const spSelectColumns =
  "id,first_name,last_name,full_name,working_email,email,phone,secondary_phone,portrayal_age,race,sex,status,do_not_hire_for,telehealth,pt_preferred,other_roles,birth_year,secondary_email,speaks_spanish,notes,created_at";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("sps")
      .select(spSelectColumns);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not load SPs from Supabase." },
        { status: 500 }
      );
    }

    return NextResponse.json({ sps: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { data, error } = await supabaseServer
      .from("sps")
      .insert(payload)
      .select(spSelectColumns)
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not create SP in Supabase." },
        { status: 500 }
      );
    }

    return NextResponse.json({ sp: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
