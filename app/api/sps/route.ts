import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE } from "../../lib/authCookies";
import { getProfileForUser } from "../../lib/profileServer";
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

function buildSpInsertPayload(payload: Record<string, unknown>) {
  const firstName = asText(payload.first_name);
  const lastName = asText(payload.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    ...payload,
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: fullName,
    working_email: normalizeEmail(payload.working_email) || null,
    phone: asText(payload.phone) || null,
    portrayal_age: asText(payload.portrayal_age) || null,
    race: asText(payload.race) || null,
    sex: asText(payload.sex) || null,
    telehealth: asText(payload.telehealth) || null,
    pt_preferred: asText(payload.pt_preferred) || null,
    other_roles: asText(payload.other_roles) || null,
    status: asText(payload.status) || "Active",
    notes: asText(payload.notes) || null,
  };
}

function normalizeName(value: unknown) {
  return asText(value).replace(/\s+/g, " ").toLowerCase();
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "super_admin" || role === "admin" || role === "sim_op" || role === "sp") return role;
  return "sp";
}

async function getViewerRole() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value?.trim() || "";
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value?.trim() || "";
  if (!accessToken && !refreshToken) return "";

  const supabase = createSupabaseServerClient();
  let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null;
  let resolvedAccessToken = accessToken;

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) user = data.user;
  }

  if (!user && refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session?.access_token && (data.user || data.session.user)) {
      user = data.user || data.session.user;
      resolvedAccessToken = data.session.access_token;
    }
  }

  if (!user) return "";
  const profileResult = await getProfileForUser(user.id, resolvedAccessToken);
  return normalizeRole(profileResult.profile?.role || user.user_metadata?.role);
}

function duplicateResponse() {
  return NextResponse.json({ error: "SP already exists" }, { status: 409 });
}

export async function GET() {
  try {
    const role = await getViewerRole();
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (role === "sp") {
      return NextResponse.json({ error: "SP accounts cannot open the SP database." }, { status: 403 });
    }

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
    const role = await getViewerRole();
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (role === "sp") {
      return NextResponse.json({ error: "SP accounts cannot manage the SP database." }, { status: 403 });
    }

    const supabaseServer = createSupabaseServerClient();
    const rawPayload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!rawPayload || typeof rawPayload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const payload = buildSpInsertPayload(rawPayload);
    const workingEmail = normalizeEmail(payload.working_email);
    const fullNameText = getFullName(payload);
    const fullName = normalizeName(fullNameText);
    const phone = normalizePhone(payload.phone);

    if (!asText(payload.first_name) && !asText(payload.last_name)) {
      return NextResponse.json(
        { error: "Enter at least a first or last name before saving an SP." },
        { status: 400 }
      );
    }

    if (!fullNameText) {
      return NextResponse.json(
        { error: "SP full name could not be generated. Enter at least one name field." },
        { status: 400 }
      );
    }

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
