import { NextResponse } from "next/server";
import { sanitizePublicErrorMessage } from "../../lib/safeErrorMessage";
import {
  createSupabaseUserClient,
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";

const spSelectColumns =
  "id,first_name,last_name,full_name,working_email,email,phone,secondary_phone,portrayal_age,race,sex,status,do_not_hire_for,telehealth,pt_preferred,other_roles,birth_year,secondary_email,speaks_spanish,notes,created_at";
const SP_LOAD_ERROR_MESSAGE = "Could not load SP database right now. Please retry.";

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
  const source =
    error && typeof error === "object"
      ? (error as { message?: unknown })
      : null;
  return sanitizePublicErrorMessage(
    error instanceof Error ? error.message : source?.message || error,
    "Could not complete the SP database request right now."
  );
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

function duplicateResponse() {
  return NextResponse.json({ error: "SP already exists" }, { status: 409 });
}

export async function GET() {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
    if (organizationContext.role === "sp") {
      return forbiddenJson("SP accounts cannot open the SP database.", organizationContext);
    }

    const supabaseServer = createSupabaseUserClient(organizationContext.accessToken);
    let query = supabaseServer
      .from("sps")
      .select(spSelectColumns)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(500);
    if (organizationContext.schemaAvailable) {
      query = query.eq("organization_id", organizationContext.activeOrganization!.id);
    }
    const { data, error } = await query;

    if (error) {
      console.error("[api/sps] load failed", {
        message: error.message || "",
        code: error.code || "",
        details: error.details || "",
        hint: error.hint || "",
      });
      return NextResponse.json(
        { error: SP_LOAD_ERROR_MESSAGE },
        { status: 500 }
      );
    }

    return NextResponse.json({ sps: data || [] });
  } catch (error) {
    console.error("[api/sps] load threw", { message: getErrorMessage(error) });
    return NextResponse.json(
      { error: SP_LOAD_ERROR_MESSAGE },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
    if (!roleCanOperateOrganization(organizationContext.role)) {
      return forbiddenJson("Only Sim Ops or admin accounts can manage the SP database.", organizationContext);
    }

    const supabaseServer = createSupabaseUserClient(organizationContext.accessToken);
    const rawPayload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!rawPayload || typeof rawPayload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const payload = {
      ...buildSpInsertPayload(rawPayload),
      ...(organizationContext.schemaAvailable
        ? { organization_id: organizationContext.activeOrganization!.id }
        : {}),
    };
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
      let emailQuery = supabaseServer
        .from("sps")
        .select("id,working_email")
        .ilike("working_email", workingEmail)
        .limit(1);
      if (organizationContext.schemaAvailable) {
        emailQuery = emailQuery.eq("organization_id", organizationContext.activeOrganization!.id);
      }
      const { data: emailMatches, error: duplicateError } =
        await emailQuery.returns<Pick<SPDuplicateCandidate, "id" | "working_email">[]>();

      if (duplicateError) {
        console.error("[api/sps] duplicate email check failed", {
          message: duplicateError.message || "",
          code: duplicateError.code || "",
        });
        return NextResponse.json(
          { error: "Could not check for duplicate SPs right now. Please retry." },
          { status: 500 }
        );
      }

      if ((emailMatches || []).some((sp) => normalizeEmail(sp.working_email) === workingEmail)) {
        return duplicateResponse();
      }
    } else if (fullName && phone) {
      let namePhoneQuery = supabaseServer
        .from("sps")
        .select("id,first_name,last_name,full_name,working_email,phone");
      if (organizationContext.schemaAvailable) {
        namePhoneQuery = namePhoneQuery.eq("organization_id", organizationContext.activeOrganization!.id);
      }
      const { data: namePhoneMatches, error: duplicateError } =
        await namePhoneQuery.returns<SPDuplicateCandidate[]>();

      if (duplicateError) {
        console.error("[api/sps] duplicate name/phone check failed", {
          message: duplicateError.message || "",
          code: duplicateError.code || "",
        });
        return NextResponse.json(
          { error: "Could not check for duplicate SPs right now. Please retry." },
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
      console.error("[api/sps] create failed", {
        message: error.message || "",
        code: error.code || "",
        details: error.details || "",
        hint: error.hint || "",
      });
      return NextResponse.json(
        { error: sanitizePublicErrorMessage(error.message, "Could not create SP right now. Please retry.") },
        { status: 500 }
      );
    }

    return NextResponse.json({ sp: data }, { status: 201 });
  } catch (error) {
    console.error("[api/sps] create threw", { message: getErrorMessage(error) });
    return NextResponse.json(
      { error: "Could not create SP right now. Please retry." },
      { status: 500 }
    );
  }
}
