import "server-only";

import {
  ASSIGNMENTS,
  DANIEL_TEST_OPERATOR,
  DEMO_EVENTS,
  DEMO_FACULTY_STAFF,
  DEMO_MARKER,
  DEMO_ORG,
  DEMO_SPS,
  SANDBOX_ACCESS_CODE,
  findSandboxOrganizations,
  seedDemoData,
} from "../../scripts/seed-demo-organization.mjs";

export const SANDBOX_REPAIR_CONFIRMATION = "REPAIR CFSP SANDBOX";

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getErrorText(error) {
  if (!error || typeof error !== "object") return asText(error);
  return [error.code, error.message, error.details, error.hint].map(asText).join(" ");
}

function isMissingColumnError(error, columnName) {
  const text = getErrorText(error).toLowerCase();
  const column = String(columnName || "").toLowerCase();
  return text.includes(column) && (text.includes("column") || text.includes("schema cache") || text.includes("does not exist") || text.includes("could not find"));
}

function isMissingTableError(error, tableName) {
  const text = getErrorText(error).toLowerCase();
  const table = String(tableName || "").toLowerCase();
  return text.includes(table) && (text.includes("relation") || text.includes("table") || text.includes("schema cache") || text.includes("pgrst205") || text.includes("42p01"));
}

async function countRows(query) {
  const { count, error } = await query;
  if (error) throw new Error(error.message || "Count query failed.");
  return count || 0;
}

async function safeCountRows(query, fallback = 0) {
  const { count, error } = await query;
  if (error) return { count: fallback, error };
  return { count: count || 0, error: null };
}

async function loadNamedSandboxEventsByOrganization(db) {
  const expectedNames = DEMO_EVENTS.map((event) => event.name);
  const { data, error } = await db
    .from("events")
    .select("id,name,organization_id,notes")
    .in("name", expectedNames)
    .limit(1000);
  if (error) {
    if (isMissingColumnError(error, "organization_id")) {
      return {
        rows: [],
        byOrganizationId: {},
        totalNamedRows: 0,
        error: error.message || "",
      };
    }
    throw new Error(error.message || "Could not load named sandbox events.");
  }

  const rows = (data || []).filter((row) => asText(row.notes).includes(DEMO_MARKER) || expectedNames.includes(asText(row.name)));
  const byOrganizationId = rows.reduce((counts, row) => {
    const key = asText(row.organization_id) || "null";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  return {
    rows,
    byOrganizationId,
    totalNamedRows: rows.length,
    error: "",
  };
}

async function countStaffFaculty(db, organizationId) {
  if (!organizationId) return { count: 0, source: "none", warning: "" };

  const contactsResult = await safeCountRows(
    db
      .from("organization_contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("contact_type", ["faculty", "sim_ops", "staff"]),
    0
  );
  if (!contactsResult.error) {
    return { count: contactsResult.count, source: "organization_contacts", warning: "" };
  }
  if (!isMissingTableError(contactsResult.error, "organization_contacts")) {
    return { count: 0, source: "organization_contacts", warning: contactsResult.error.message || "Could not count staff contacts." };
  }

  const membershipResult = await safeCountRows(
    db
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("role", ["faculty", "sim_ops", "org_admin", "platform_owner"]),
    0
  );
  if (membershipResult.error) {
    return { count: 0, source: "organization_memberships", warning: membershipResult.error.message || "Could not count staff/faculty." };
  }
  return { count: membershipResult.count, source: "organization_memberships", warning: "" };
}

async function countAssignments(db, organizationId, eventIds) {
  if (!organizationId) return { count: 0, warning: "" };

  const directResult = await safeCountRows(
    db
      .from("event_sps")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    0
  );
  if (!directResult.error) return { count: directResult.count, warning: "" };
  if (!isMissingColumnError(directResult.error, "organization_id")) {
    return { count: 0, warning: directResult.error.message || "Could not count assignments." };
  }
  if (!eventIds.length) return { count: 0, warning: "event_sps.organization_id is unavailable and no sandbox events were found." };

  const fallbackResult = await safeCountRows(
    db.from("event_sps").select("id", { count: "exact", head: true }).in("event_id", eventIds),
    0
  );
  if (fallbackResult.error) return { count: 0, warning: fallbackResult.error.message || "Could not count assignments." };
  return { count: fallbackResult.count, warning: "Counted assignments by event_id because event_sps.organization_id is unavailable." };
}

function diagnoseEventsZeroState(args) {
  const {
    sandboxOrgId,
    activeOrganizationId,
    sandboxEventCount,
    activeOrganizationEventCount,
    nullOrgEventCount,
    namedSandboxEvents,
  } = args;

  if (!sandboxOrgId) return "The shared sandbox organization does not exist yet, so the seed has not run against this database.";
  if (sandboxEventCount > 0 && activeOrganizationId && activeOrganizationId !== sandboxOrgId) {
    return "The sandbox has events, but your active organization is different from the sandbox organization. The Events Board filters by the active organization id.";
  }
  if (sandboxEventCount > 0) return "The sandbox has organization-scoped events. If /events still shows 0, check the active organization cookie/session and the /api/events response.";
  if (namedSandboxEvents.totalNamedRows > 0) {
    return "Sandbox event names exist, but not under the canonical sandbox organization id. Repair will move/recreate the seeded rows under the shared sandbox org.";
  }
  if (nullOrgEventCount > 0) return "There are unscoped legacy events, but no events for the sandbox organization. The current Events Board intentionally excludes null-organization rows.";
  if (activeOrganizationEventCount === 0) return "No events were found for the active organization. The seed likely did not run against this database or wrote incompatible rows.";
  return "The active organization has events, but none of the shared sandbox events exist under the sandbox organization.";
}

export function getSandboxPlanSummary() {
  return {
    organizationName: DEMO_ORG.name,
    organizationSlug: DEMO_ORG.slug,
    accessCode: SANDBOX_ACCESS_CODE.code,
    expectedEvents: DEMO_EVENTS.length,
    expectedSpProfiles: DEMO_SPS.length,
    expectedStaffFaculty: DEMO_FACULTY_STAFF.length,
    expectedAssignments: ASSIGNMENTS.length,
    showcaseEvent: "Neurologic Assessment: Stroke Warning Signs",
    daniel: {
      name: DANIEL_TEST_OPERATOR.label,
      email: DANIEL_TEST_OPERATOR.email,
      role: "sim_ops",
    },
  };
}

export async function loadSandboxDiagnostics(db, options = {}) {
  const sandboxOrganizations = await findSandboxOrganizations(db);
  const sandboxOrg = sandboxOrganizations[0] || null;
  const sandboxOrgId = asText(sandboxOrg?.id);
  const namedSandboxEvents = await loadNamedSandboxEventsByOrganization(db);

  const accessCodeResult = await db
    .from("organization_access_codes")
    .select("id,organization_id,code,active,default_requested_role,requires_manual_approval")
    .eq("code", SANDBOX_ACCESS_CODE.code)
    .limit(1)
    .maybeSingle();
  if (accessCodeResult.error && !/0 rows/i.test(accessCodeResult.error.message || "")) {
    throw new Error(accessCodeResult.error.message || "Could not load sandbox access code.");
  }

  const sandboxEventRows = sandboxOrgId
    ? await db
        .from("events")
        .select("id,name,created_at")
        .eq("organization_id", sandboxOrgId)
        .order("created_at", { ascending: false })
        .limit(1000)
    : { data: [], error: null };
  if (sandboxEventRows.error) throw new Error(sandboxEventRows.error.message || "Could not load sandbox events.");
  const sandboxEvents = sandboxEventRows.data || [];
  const sandboxEventIds = sandboxEvents.map((event) => event.id).filter(Boolean);

  const spCount = sandboxOrgId
    ? await countRows(db.from("sps").select("id", { count: "exact", head: true }).eq("organization_id", sandboxOrgId))
    : 0;
  const staffFaculty = await countStaffFaculty(db, sandboxOrgId);
  const assignments = await countAssignments(db, sandboxOrgId, sandboxEventIds);
  const nullOrgEventCount = await countRows(db.from("events").select("id", { count: "exact", head: true }).is("organization_id", null));
  const activeOrganizationEventCount = options.activeOrganizationId
    ? await countRows(db.from("events").select("id", { count: "exact", head: true }).eq("organization_id", options.activeOrganizationId))
    : 0;

  const diagnostics = {
    generatedAt: new Date().toISOString(),
    sandboxOrgExists: Boolean(sandboxOrgId),
    sandboxOrgId: sandboxOrgId || null,
    sandboxOrgName: sandboxOrg?.name || DEMO_ORG.name,
    sandboxOrgSlug: sandboxOrg?.slug || DEMO_ORG.slug,
    duplicateSandboxOrgIds: sandboxOrganizations.slice(1).map((row) => row.id).filter(Boolean),
    accessCodeExists: Boolean(accessCodeResult.data?.id),
    accessCodeOrganizationId: accessCodeResult.data?.organization_id || null,
    accessCodeActive: accessCodeResult.data?.active ?? null,
    eventCount: sandboxEvents.length,
    spProfileCount: spCount,
    staffFacultyCount: staffFaculty.count,
    staffFacultySource: staffFaculty.source,
    assignmentCount: assignments.count,
    firstFiveEventNames: sandboxEvents.slice(0, 5).map((event) => event.name).filter(Boolean),
    activeOrganizationId: options.activeOrganizationId || null,
    activeOrganizationName: options.activeOrganizationName || null,
    activeOrganizationEventCount,
    nullOrgEventCount,
    namedSandboxEventsByOrganizationId: namedSandboxEvents.byOrganizationId,
    namedSandboxEventRows: namedSandboxEvents.totalNamedRows,
    expected: getSandboxPlanSummary(),
    warnings: [staffFaculty.warning, assignments.warning, namedSandboxEvents.error].filter(Boolean),
  };

  return {
    ...diagnostics,
    eventsZeroStateDiagnosis: diagnoseEventsZeroState({
      sandboxOrgId,
      activeOrganizationId: options.activeOrganizationId || "",
      sandboxEventCount: diagnostics.eventCount,
      activeOrganizationEventCount,
      nullOrgEventCount,
      namedSandboxEvents,
    }),
  };
}

export async function repairSandbox(db, options = {}) {
  try {
    const result = await seedDemoData(db, {
      createDanielAuth: false,
      createDirectoryAuthUsers: false,
    });
    const diagnostics = await loadSandboxDiagnostics(db, options);
    diagnostics.reusedSpEmails = Array.from(new Set(result.repairSummary.reusedSpEmails || []));
    diagnostics.reassociatedSpEmails = Array.from(new Set(result.repairSummary.reassociatedSpEmails || []));
    diagnostics.createdSpEmails = Array.from(new Set(result.repairSummary.createdSpEmails || []));
    diagnostics.skippedSpEmails = Array.from(new Set(result.repairSummary.skippedSpEmails || []));
    diagnostics.spWarnings = result.repairSummary.spWarnings || [];
    return {
      ok: true,
      organizationId: result.organizationId,
      repairSummary: result.repairSummary,
      danielAuthCreated: false,
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`app/lib/sandboxManager.js repairSandbox failed while running seedDemoData: ${message}`);
  }
}
