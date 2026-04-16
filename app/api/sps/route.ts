import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";

export const dynamic = "force-dynamic";

const spSelectColumns =
  "id,first_name,last_name,full_name,working_email,email,phone,secondary_phone,portrayal_age,race,sex,status,do_not_hire_for,telehealth,pt_preferred,other_roles,birth_year,secondary_email,speaks_spanish,notes,created_at";

type SPDuplicateCandidate = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  working_email: string | null;
  phone: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  return asText(value).replace(/\D/g, "");
}

function getFullName(sp: Partial<SPDuplicateCandidate>) {
  return (
    asText(sp.full_name) ||
    [sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" ")
  );
}

function normalizeName(value: unknown) {
  return asText(value).replace(/\s+/g, " ").toLowerCase();
}

function duplicateResponse() {
  return NextResponse.json({ error: "SP already exists" }, { status: 409 });
}

export async function GET() {
  try {
    const supabaseServer = createSupabaseServerClient();
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
    const supabaseServer = createSupabaseServerClient();
    const payload = await request.json();
    const workingEmail = normalizeEmail(payload?.working_email);
    const fullName = normalizeName(getFullName(payload));
    const phone = normalizePhone(payload?.phone);

    if (workingEmail) {
      const { data: emailMatches, error: duplicateError } = await supabaseServer
        .from("sps")
        .select("id,working_email")
        .ilike("working_email", workingEmail)
        .limit(1)
        .returns<Pick<SPDuplicateCandidate, "id" | "working_email">[]>();

      if (duplicateError) {
        return NextResponse.json(
          { error: duplicateError.message || "Could not check for duplicate SPs." },
          { status: 500 }
        );
      }

      if ((emailMatches || []).some((sp) => normalizeEmail(sp.working_email) === workingEmail)) {
        return duplicateResponse();
      }
    } else if (fullName && phone) {
      const { data: namePhoneMatches, error: duplicateError } = await supabaseServer
        .from("sps")
        .select("id,first_name,last_name,full_name,working_email,phone")
        .returns<SPDuplicateCandidate[]>();

      if (duplicateError) {
        return NextResponse.json(
          { error: duplicateError.message || "Could not check for duplicate SPs." },
          { status: 500 }
        );
      }

      const duplicate = (namePhoneMatches || []).some(
        (sp) => normalizeName(getFullName(sp)) === fullName && normalizePhone(sp.phone) === phone
      );

      if (duplicate) {
        return duplicateResponse();
      }
    }

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
