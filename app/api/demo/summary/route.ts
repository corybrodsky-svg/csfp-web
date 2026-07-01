import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyOrganizationAuthCookies,
  createSupabaseUserClient,
  forbiddenJson,
  getOrganizationContext,
  jsonNoStore,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
  type OrganizationSummary,
} from "../../../lib/organizationAuth";
import { sanitizePublicErrorMessage } from "../../../lib/safeErrorMessage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEMO_ORG_NAME_MARKER = "cfsp demo";
const SANDBOX_ORG_NAME_MARKER = "cfsp sandbox";
const DEMO_ORG_SLUG = "cfsp-demo-health-sciences-center";
const SANDBOX_ORG_SLUG = "cfsp-sandbox-simulation-center";

type DemoCounts = {
  events: number;
  sps: number;
  shiftOpenings: number;
  responses: number;
  attendanceRecords: number;
  portalInvites: number;
};

type EventSummaryRow = {
  id?: string | null;
  name?: string | null;
  date_text?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isDemoOrganization(organization: OrganizationSummary | null | undefined) {
  const name = asText(organization?.name).toLowerCase();
  const slug = asText(organization?.slug).toLowerCase();
  return (
    name.includes(DEMO_ORG_NAME_MARKER) ||
    name.includes(SANDBOX_ORG_NAME_MARKER) ||
    slug === DEMO_ORG_SLUG ||
    slug === SANDBOX_ORG_SLUG ||
    slug.includes("cfsp-demo") ||
    slug.includes("cfsp-sandbox")
  );
}

function canUseDemoOperator(context: Awaited<ReturnType<typeof getOrganizationContext>>) {
  return (
    roleCanOperateOrganization(context.role) ||
    context.legacyRole === "super_admin" ||
    context.legacyRole === "admin" ||
    context.legacyRole === "sim_op"
  );
}

function emptyCounts(): DemoCounts {
  return {
    events: 0,
    sps: 0,
    shiftOpenings: 0,
    responses: 0,
    attendanceRecords: 0,
    portalInvites: 0,
  };
}

async function countPortalInvites(db: SupabaseClient, organizationId: string) {
  const { count, error } = await db
    .from("sp_portal_invites")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) return 0;
  return count || 0;
}

async function loadDemoSummary(db: SupabaseClient, organizationId: string) {
  const eventsResult = await db
    .from("events")
    .select("id,name,date_text", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("date_text", { ascending: true })
    .limit(50);
  if (eventsResult.error) throw eventsResult.error;

  const events = ((eventsResult.data || []) as EventSummaryRow[])
    .map((event) => ({
      id: asText(event.id),
      name: asText(event.name) || "Untitled demo event",
      date: asText(event.date_text) || null,
    }))
    .filter((event) => event.id);
  const eventIds = events.map((event) => event.id);

  const spsResult = await db
    .from("sps")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (spsResult.error) throw spsResult.error;

  const openingsResult = await db
    .from("event_shift_openings")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (openingsResult.error) throw openingsResult.error;

  let responses = 0;
  if (eventIds.length) {
    const responsesResult = await db
      .from("event_shift_responses")
      .select("id", { count: "exact", head: true })
      .in("event_id", eventIds);
    if (responsesResult.error) throw responsesResult.error;
    responses = responsesResult.count || 0;
  }

  let attendanceRecords = 0;
  if (eventIds.length) {
    const attendanceResult = await db
      .from("event_sp_attendance")
      .select("id", { count: "exact", head: true })
      .in("event_id", eventIds);
    if (attendanceResult.error) throw attendanceResult.error;
    attendanceRecords = attendanceResult.count || 0;
  }

  const portalInvites = await countPortalInvites(db, organizationId);

  return {
    counts: {
      events: eventsResult.count || events.length,
      sps: spsResult.count || 0,
      shiftOpenings: openingsResult.count || 0,
      responses,
      attendanceRecords,
      portalInvites,
    } satisfies DemoCounts,
    demoEvents: events,
  };
}

export async function GET() {
  const context = await getOrganizationContext();
  if (!context.user) return unauthorizedJson(context);
  if (!requireActiveOrganization(context)) return noActiveOrganizationJson(context);
  if (!canUseDemoOperator(context)) {
    return forbiddenJson("Demo operator tools are only available to admins and simulation operators.", context);
  }

  const activeOrganization = context.activeOrganization;
  const isDemoOrg = isDemoOrganization(activeOrganization);
  const organizationName = asText(activeOrganization?.name) || "Organization";

  if (!isDemoOrg) {
    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        isDemoOrg: false,
        organizationName,
        counts: emptyCounts(),
        demoEvents: [],
        message: "Switch to the CFSP Sandbox Simulation Center before showing sandbox data.",
      }),
      context
    );
  }

  try {
    const db = createSupabaseUserClient(context.accessToken);
    const summary = await loadDemoSummary(db, activeOrganization!.id);
    return applyOrganizationAuthCookies(
      jsonNoStore({
        ok: true,
        isDemoOrg: true,
        organizationName,
        counts: summary.counts,
        demoEvents: summary.demoEvents,
      }),
      context
    );
  } catch (error) {
    console.error("[api/demo/summary] failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return applyOrganizationAuthCookies(
      jsonNoStore(
        {
          ok: false,
          error: sanitizePublicErrorMessage(error instanceof Error ? error.message : "", "Could not load demo readiness summary."),
        },
        { status: 500 }
      ),
      context
    );
  }
}
