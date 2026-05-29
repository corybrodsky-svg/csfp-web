import { NextResponse } from "next/server";
import { sanitizePublicErrorMessage } from "../../lib/safeErrorMessage";
import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import {
  createSupabaseUserClient,
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
  type OrganizationRole,
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

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toSupabaseError(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== "object") return {};
  const source = error as SupabaseErrorLike;
  return {
    message: source.message || null,
    code: source.code || null,
    details: source.details || null,
    hint: source.hint || null,
  };
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = toSupabaseError(error);
  const message = asText(source.message).toLowerCase();
  const code = asText(source.code).toLowerCase();
  const target = columnName.toLowerCase();
  if (code === "42703") return true;
  if (!message) return false;
  return (
    message.includes(target) &&
    (message.includes("does not exist") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      message.includes("column"))
  );
}

function isMissingOrganizationColumnError(error: unknown) {
  return isMissingColumnError(error, "organization_id");
}

function getMissingColumnName(error: unknown) {
  const source = toSupabaseError(error);
  const text = [source.message, source.details, source.hint].map(asText).join(" ");
  const match = text.match(/column\s+["']?([a-zA-Z0-9_.]+)["']?\s+(?:of relation .* )?does not exist/i);
  if (match?.[1]) return match[1];
  if (/organization_id/i.test(text)) return "organization_id";
  return "";
}

function canUsePrivilegedSpDirectoryRead(role: OrganizationRole | null | undefined, legacyRole: string) {
  return (
    roleCanOperateOrganization(role) ||
    legacyRole === "super_admin" ||
    legacyRole === "admin" ||
    legacyRole === "sim_op"
  );
}

function logSpsFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[api/sps] failed", {
    stage,
    message: source.message || "",
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
    missingColumn: getMissingColumnName(error) || "",
    ...(extra || {}),
  });
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

    const activeOrganizationId = asText(organizationContext.activeOrganization?.id);
    const privilegedRead = canUsePrivilegedSpDirectoryRead(organizationContext.role, organizationContext.legacyRole);
    const adminClient = privilegedRead ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || createSupabaseUserClient(organizationContext.accessToken);
    const includeLegacyUnscopedRows =
      organizationContext.role === "platform_owner" ||
      organizationContext.role === "org_admin" ||
      organizationContext.legacyRole === "super_admin" ||
      organizationContext.legacyRole === "admin";

    const runQuery = async (mode: "scoped" | "scoped_plus_legacy" | "unscoped_no_org_column") => {
      let query = supabaseServer
        .from("sps")
        .select(spSelectColumns)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .limit(500);
      if (mode === "scoped" && organizationContext.schemaAvailable && activeOrganizationId) {
        query = query.eq("organization_id", activeOrganizationId);
      } else if (mode === "scoped_plus_legacy" && organizationContext.schemaAvailable && activeOrganizationId) {
        query = query.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`);
      }
      const result = await query;
      return {
        data: result.data || [],
        error: result.error as SupabaseErrorLike | null,
      };
    };

    const initialMode =
      organizationContext.schemaAvailable && activeOrganizationId
        ? includeLegacyUnscopedRows
          ? "scoped_plus_legacy"
          : "scoped"
        : "unscoped_no_org_column";

    let result = await runQuery(initialMode);
    if (result.error && organizationContext.schemaAvailable && isMissingOrganizationColumnError(result.error)) {
      logSpsFailure("load-scope-fallback", result.error, {
        statusCode: 500,
        role: organizationContext.legacyRole,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      result = await runQuery("unscoped_no_org_column");
    }

    if (result.error) {
      logSpsFailure("load-query", result.error, {
        statusCode: 500,
        role: organizationContext.legacyRole,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      return NextResponse.json(
        { error: SP_LOAD_ERROR_MESSAGE },
        { status: 500 }
      );
    }

    return NextResponse.json({ sps: result.data || [] });
  } catch (error) {
    logSpsFailure("load-threw", error, { statusCode: 500 });
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

    const rawPayload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!rawPayload || typeof rawPayload !== "object") {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const activeOrganizationId = asText(organizationContext.activeOrganization?.id);
    const privilegedWrite = canUsePrivilegedSpDirectoryRead(organizationContext.role, organizationContext.legacyRole);
    const adminClient = privilegedWrite ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || createSupabaseUserClient(organizationContext.accessToken);

    const payload = {
      ...buildSpInsertPayload(rawPayload),
      ...(organizationContext.schemaAvailable
        ? { organization_id: activeOrganizationId }
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
      const runEmailDuplicateQuery = async (mode: "scoped" | "unscoped_no_org_column") => {
        let emailQuery = supabaseServer
          .from("sps")
          .select("id,working_email")
          .ilike("working_email", workingEmail)
          .limit(1);
        if (mode === "scoped" && organizationContext.schemaAvailable && activeOrganizationId) {
          emailQuery = emailQuery.eq("organization_id", activeOrganizationId);
        }
        return emailQuery.returns<Pick<SPDuplicateCandidate, "id" | "working_email">[]>();
      };

      let { data: emailMatches, error: duplicateError } = await runEmailDuplicateQuery("scoped");
      if (duplicateError && organizationContext.schemaAvailable && isMissingOrganizationColumnError(duplicateError)) {
        logSpsFailure("duplicate-email-scope-fallback", duplicateError, {
          statusCode: 500,
          role: organizationContext.legacyRole,
          organizationRole: organizationContext.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
        });
        ({ data: emailMatches, error: duplicateError } = await runEmailDuplicateQuery("unscoped_no_org_column"));
      }

      if (duplicateError) {
        logSpsFailure("duplicate-email-check", duplicateError, {
          statusCode: 500,
          role: organizationContext.legacyRole,
          organizationRole: organizationContext.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
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
      const runNamePhoneQuery = async (mode: "scoped" | "unscoped_no_org_column") => {
        let namePhoneQuery = supabaseServer
          .from("sps")
          .select("id,first_name,last_name,full_name,working_email,phone");
        if (mode === "scoped" && organizationContext.schemaAvailable && activeOrganizationId) {
          namePhoneQuery = namePhoneQuery.eq("organization_id", activeOrganizationId);
        }
        return namePhoneQuery.returns<SPDuplicateCandidate[]>();
      };

      let { data: namePhoneMatches, error: duplicateError } = await runNamePhoneQuery("scoped");
      if (duplicateError && organizationContext.schemaAvailable && isMissingOrganizationColumnError(duplicateError)) {
        logSpsFailure("duplicate-name-phone-scope-fallback", duplicateError, {
          statusCode: 500,
          role: organizationContext.legacyRole,
          organizationRole: organizationContext.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
        });
        ({ data: namePhoneMatches, error: duplicateError } = await runNamePhoneQuery("unscoped_no_org_column"));
      }

      if (duplicateError) {
        logSpsFailure("duplicate-name-phone-check", duplicateError, {
          statusCode: 500,
          role: organizationContext.legacyRole,
          organizationRole: organizationContext.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
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

    const runInsert = async (includeOrganizationId: boolean) => {
      const insertPayload = includeOrganizationId
        ? payload
        : Object.fromEntries(
            Object.entries(payload).filter(([key]) => key !== "organization_id")
          );
      return supabaseServer
        .from("sps")
        .insert(insertPayload)
        .select(spSelectColumns)
        .single();
    };

    let { data, error } = await runInsert(Boolean(organizationContext.schemaAvailable && activeOrganizationId));
    if (error && organizationContext.schemaAvailable && isMissingOrganizationColumnError(error)) {
      logSpsFailure("create-scope-fallback", error, {
        statusCode: 500,
        role: organizationContext.legacyRole,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      ({ data, error } = await runInsert(false));
    }

    if (error) {
      logSpsFailure("create-query", error, {
        statusCode: 500,
        role: organizationContext.legacyRole,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      return NextResponse.json(
        { error: sanitizePublicErrorMessage(error.message, "Could not create SP right now. Please retry.") },
        { status: 500 }
      );
    }

    return NextResponse.json({ sp: data }, { status: 201 });
  } catch (error) {
    logSpsFailure("create-threw", error, { statusCode: 500 });
    return NextResponse.json(
      { error: "Could not create SP right now. Please retry." },
      { status: 500 }
    );
  }
}
