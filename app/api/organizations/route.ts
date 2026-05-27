import { createSupabaseAdminClient } from "../../lib/supabaseAdminClient";
import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  normalizeOrganizationRole,
  requireActiveOrganization,
  setActiveOrganizationCookie,
  unauthorizedJson,
  type OrganizationRole,
} from "../../lib/organizationAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OrganizationRow = {
  id: string;
  name: string | null;
  slug: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
};

type AccessCodeRow = {
  id: string;
  organization_id: string;
  code: string;
  label: string | null;
  default_requested_role: string | null;
  active: boolean | null;
  requires_manual_approval: boolean | null;
  created_at: string | null;
};

const ACCESS_CODE_ROLES = new Set<OrganizationRole>(["org_admin", "sim_ops", "faculty", "sp", "viewer"]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeSlug(value: unknown) {
  const raw = asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return raw.slice(0, 64);
}

function normalizeCode(value: unknown) {
  const text = asText(value).toUpperCase().replace(/\s+/g, "-");
  return text.replace(/[^A-Z0-9_-]/g, "");
}

function normalizeRequestedRole(value: unknown): OrganizationRole {
  const normalized = normalizeOrganizationRole(value);
  if (ACCESS_CODE_ROLES.has(normalized)) return normalized;
  return "viewer";
}

function normalizeDomains(value: unknown) {
  const raw = Array.isArray(value) ? value : asText(value).split(/[,\n]/g);
  return Array.from(
    new Set(
      raw
        .map((item) => asText(item).replace(/^@+/, "").toLowerCase())
        .filter(Boolean)
    )
  );
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return fallback;
}

function generateAccessCode() {
  return `CFSP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function GET() {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);

  const organizations = context.memberships
    .filter((membership) => membership.status === "active" && membership.organization)
    .map((membership) => ({
      id: membership.organization_id,
      name: membership.organization?.name || "Organization",
      slug: membership.organization?.slug || null,
      status: membership.organization?.status || "active",
      role: membership.role,
      isActive: context.activeOrganization?.id === membership.organization_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return applyOrganizationAuthCookies(
    jsonNoStore({
      ok: true,
      organizations,
      memberships: context.memberships,
      activeOrganization: context.activeOrganization,
      role: context.role,
      canCreateOrganizations: context.role === "platform_owner",
    }),
    context
  );
}

export async function POST(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);
  if (context.role !== "platform_owner") {
    return forbiddenJson("Only platform owners can create organizations.", context);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Organization creation requires a configured Supabase service role." }, { status: 500 }),
      context
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = asText(body?.name);
  if (!name) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Organization name is required." }, { status: 400 }),
      context
    );
  }

  const requestedSlug = normalizeSlug(body?.slug);
  const slug = requestedSlug || normalizeSlug(name) || null;
  const requestedType = asText(body?.type) || "workspace";
  const createInitialAccessCode =
    parseBoolean(body?.create_initial_access_code ?? body?.createInitialAccessCode, false) ||
    Boolean(asText(body?.initial_access_code ?? body?.initialAccessCode));
  const initialAccessCode = normalizeCode(body?.initial_access_code ?? body?.initialAccessCode);
  const accessCodeLabel = asText(body?.access_code_label ?? body?.accessCodeLabel) || null;
  const accessCodeDomains = normalizeDomains(body?.allowed_email_domains ?? body?.allowedEmailDomains);
  const accessCodeRole = normalizeRequestedRole(body?.default_requested_role ?? body?.defaultRequestedRole);
  const accessCodeRequiresManualApproval = parseBoolean(
    body?.requires_manual_approval ?? body?.requiresManualApproval,
    true
  );
  const accessCodeActive = parseBoolean(body?.access_code_active ?? body?.accessCodeActive, true);

  const { data: organization, error: createOrganizationError } = await admin
    .from("organizations")
    .insert({
      name,
      slug,
      type: requestedType,
      status: "active",
      created_by: context.user.id,
    })
    .select("id,name,slug,type,status,created_at")
    .maybeSingle<OrganizationRow>();

  if (createOrganizationError || !organization) {
    const duplicateSlug = asText((createOrganizationError as { code?: string } | null)?.code) === "23505";
    return applyOrganizationAuthCookies(
      jsonNoStore(
        {
          ok: false,
          error: duplicateSlug
            ? "An organization with that slug already exists."
            : "Could not create organization.",
        },
        { status: duplicateSlug ? 409 : 500 }
      ),
      context
    );
  }

  const { error: membershipError } = await admin
    .from("organization_memberships")
    .insert({
      organization_id: organization.id,
      user_id: context.user.id,
      role: "platform_owner",
      status: "active",
      approved_by: context.user.id,
      approved_at: new Date().toISOString(),
    });

  if (membershipError) {
    await admin.from("organizations").delete().eq("id", organization.id);
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Organization was created, but membership setup failed." }, { status: 500 }),
      context
    );
  }

  let createdAccessCode: AccessCodeRow | null = null;
  if (createInitialAccessCode) {
    const { data: accessCodeData, error: accessCodeError } = await admin
      .from("organization_access_codes")
      .insert({
        organization_id: organization.id,
        code: initialAccessCode || generateAccessCode(),
        label: accessCodeLabel,
        allowed_email_domains: accessCodeDomains,
        default_requested_role: accessCodeRole,
        active: accessCodeActive,
        requires_manual_approval: accessCodeRequiresManualApproval,
      })
      .select("id,organization_id,code,label,default_requested_role,active,requires_manual_approval,created_at")
      .maybeSingle<AccessCodeRow>();

    if (!accessCodeError) createdAccessCode = accessCodeData || null;
  }

  const response = jsonNoStore(
    {
      ok: true,
      organization,
      activeOrganization: organization,
      createdAccessCode,
      message: "Organization created.",
    },
    { status: 201 }
  );
  setActiveOrganizationCookie(response, organization.id);
  return applyOrganizationAuthCookies(response, context);
}
