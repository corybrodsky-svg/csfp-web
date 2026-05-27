import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  normalizeOrganizationRole,
  requireActiveOrganization,
  roleCanManageOrganization,
  unauthorizedJson,
  type OrganizationRole,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccessCodeRow = {
  id: string;
  organization_id: string;
  code: string;
  label: string | null;
  allowed_email_domains: string[] | null;
  default_requested_role: string | null;
  active: boolean | null;
  requires_manual_approval: boolean | null;
  created_at: string | null;
};

const REQUESTABLE_ROLES = new Set<OrganizationRole>(["org_admin", "sim_ops", "faculty", "sp", "viewer"]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRequestedRole(value: unknown): OrganizationRole {
  const normalized = normalizeOrganizationRole(value);
  if (REQUESTABLE_ROLES.has(normalized)) return normalized;
  return "viewer";
}

function normalizeCode(value: unknown) {
  const text = asText(value).toUpperCase().replace(/\s+/g, "-");
  return text.replace(/[^A-Z0-9_-]/g, "");
}

function normalizeDomains(value: unknown) {
  const raw = Array.isArray(value) ? value : asText(value).split(/[,\n]/g);
  const domains = raw
    .map((item) => asText(item).replace(/^@+/, "").toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(domains));
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return fallback;
}

function generateCode() {
  return `CFSP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function GET() {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);
  if (!roleCanManageOrganization(context.role)) {
    return forbiddenJson("Only platform owners and organization admins can manage access codes.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Access code management requires a configured Supabase service role." }, { status: 500 }),
      context
    );
  }

  const { data, error } = await admin
    .from("organization_access_codes")
    .select("id,organization_id,code,label,allowed_email_domains,default_requested_role,active,requires_manual_approval,created_at")
    .eq("organization_id", context.activeOrganization!.id)
    .order("created_at", { ascending: false })
    .returns<AccessCodeRow[]>();

  if (error) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Could not load organization access codes." }, { status: 500 }),
      context
    );
  }

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      accessCodes: data || [],
      activeOrganization: context.activeOrganization,
      role: context.role,
    }),
    context
  );
}

export async function POST(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);
  if (!roleCanManageOrganization(context.role)) {
    return forbiddenJson("Only platform owners and organization admins can create access codes.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Access code management requires a configured Supabase service role." }, { status: 500 }),
      context
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const code = normalizeCode(body?.code) || generateCode();
  const label = asText(body?.label) || null;
  const allowedEmailDomains = normalizeDomains(body?.allowed_email_domains ?? body?.allowedEmailDomains);
  const defaultRequestedRole = normalizeRequestedRole(body?.default_requested_role ?? body?.defaultRequestedRole);
  const active = parseBoolean(body?.active, true);
  const requiresManualApproval = parseBoolean(body?.requires_manual_approval ?? body?.requiresManualApproval, true);

  const { data, error } = await admin
    .from("organization_access_codes")
    .insert({
      organization_id: context.activeOrganization!.id,
      code,
      label,
      allowed_email_domains: allowedEmailDomains,
      default_requested_role: defaultRequestedRole,
      active,
      requires_manual_approval: requiresManualApproval,
    })
    .select("id,organization_id,code,label,allowed_email_domains,default_requested_role,active,requires_manual_approval,created_at")
    .maybeSingle<AccessCodeRow>();

  if (error) {
    const duplicate = asText((error as { code?: string }).code) === "23505";
    return applyOrganizationAuthCookies(
      jsonNoStore(
        {
          ok: false,
          error: duplicate ? "That access code is already in use." : "Could not create organization access code.",
        },
        { status: duplicate ? 409 : 500 }
      ),
      context
    );
  }

  return applyOrganizationAuthCookies(jsonNoStore({ ok: true, accessCode: data }), context);
}

export async function PATCH(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);
  if (!roleCanManageOrganization(context.role)) {
    return forbiddenJson("Only platform owners and organization admins can update access codes.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Access code management requires a configured Supabase service role." }, { status: 500 }),
      context
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = asText(body?.id);
  if (!id) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Access code id is required." }, { status: 400 }),
      context
    );
  }

  const updates: Record<string, unknown> = {};
  if (body?.code !== undefined) {
    const normalizedCode = normalizeCode(body.code);
    if (!normalizedCode) {
      return applyOrganizationAuthCookies(
        jsonNoStore({ ok: false, error: "Access code cannot be blank." }, { status: 400 }),
        context
      );
    }
    updates.code = normalizedCode;
  }
  if (body?.label !== undefined) updates.label = asText(body.label) || null;
  if (body?.allowed_email_domains !== undefined || body?.allowedEmailDomains !== undefined) {
    updates.allowed_email_domains = normalizeDomains(body?.allowed_email_domains ?? body?.allowedEmailDomains);
  }
  if (body?.default_requested_role !== undefined || body?.defaultRequestedRole !== undefined) {
    updates.default_requested_role = normalizeRequestedRole(body?.default_requested_role ?? body?.defaultRequestedRole);
  }
  if (body?.active !== undefined) updates.active = parseBoolean(body.active, true);
  if (body?.requires_manual_approval !== undefined || body?.requiresManualApproval !== undefined) {
    updates.requires_manual_approval = parseBoolean(body?.requires_manual_approval ?? body?.requiresManualApproval, true);
  }

  if (!Object.keys(updates).length) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "No updates were provided." }, { status: 400 }),
      context
    );
  }

  const { data, error } = await admin
    .from("organization_access_codes")
    .update(updates)
    .eq("organization_id", context.activeOrganization!.id)
    .eq("id", id)
    .select("id,organization_id,code,label,allowed_email_domains,default_requested_role,active,requires_manual_approval,created_at")
    .maybeSingle<AccessCodeRow>();

  if (error) {
    const duplicate = asText((error as { code?: string }).code) === "23505";
    return applyOrganizationAuthCookies(
      jsonNoStore(
        {
          ok: false,
          error: duplicate ? "That access code is already in use." : "Could not update organization access code.",
        },
        { status: duplicate ? 409 : 500 }
      ),
      context
    );
  }

  if (!data) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Access code not found." }, { status: 404 }),
      context
    );
  }

  return applyOrganizationAuthCookies(jsonNoStore({ ok: true, accessCode: data }), context);
}
