import {
  applyOrganizationAuthCookies,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  requireActiveOrganization,
  setActiveOrganizationCookie,
  unauthorizedJson,
} from "../../../lib/organizationAuth";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export async function POST(request: Request) {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return forbiddenJson("No active organization membership.", context);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const organizationId = asText(body?.organization_id ?? body?.organizationId);

  if (!organizationId) {
    return applyOrganizationAuthCookies(
      jsonNoStore({ ok: false, error: "Organization id is required." }, { status: 400 }),
      context
    );
  }

  const allowed = context.memberships.some(
    (membership) => membership.organization_id === organizationId && membership.status === "active"
  );

  if (!allowed) {
    return forbiddenJson("You do not have access to that organization.", context);
  }

  const activeOrganization =
    context.memberships.find((membership) => membership.organization_id === organizationId)?.organization || null;
  const response = jsonNoStore({
    ok: true,
    activeOrganization,
  });
  setActiveOrganizationCookie(response, organizationId);
  return applyOrganizationAuthCookies(response, context);
}
