import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEMO_MARKER = "CFSP_PHASE6_DEMO_FAKE_DATA";
const DEMO_ORG = {
  name: "CFSP Demo Health Sciences Center",
  slug: "cfsp-demo-health-sciences-center",
  type: "demo",
  status: "active",
};

const SP_ROWS = [
  { key: "barbara", first_name: "Barbara", last_name: "Ellis", email: "demo.barbara.ellis@example.invalid", mode: "portal", portal: "linked", onboarding: "complete" },
  { key: "james", first_name: "James", last_name: "Morton", email: "demo.james.morton@example.invalid", mode: "email", portal: "not_invited", onboarding: "not_started" },
  { key: "angela", first_name: "Angela", last_name: "Price", email: "demo.angela.price@example.invalid", mode: "microsoft_forms", portal: "not_invited", onboarding: "not_started" },
  { key: "miguel", first_name: "Miguel", last_name: "Rivera", email: "demo.miguel.rivera@example.invalid", mode: "portal", portal: "linked", onboarding: "complete" },
  { key: "linda", first_name: "Linda", last_name: "Chen", email: "demo.linda.chen@example.invalid", mode: "email", portal: "needs_help", onboarding: "needs_help" },
  { key: "robert", first_name: "Robert", last_name: "Graham", email: "demo.robert.graham@example.invalid", mode: "manual", portal: "not_invited", onboarding: "not_started" },
  { key: "evelyn", first_name: "Evelyn", last_name: "Brooks", email: "demo.evelyn.brooks@example.invalid", mode: "do_not_contact", portal: "disabled", onboarding: "declined" },
  { key: "priya", first_name: "Priya", last_name: "Shah", email: "demo.priya.shah@example.invalid", mode: "portal", portal: "invited", onboarding: "invited" },
];

const EVENT_ROWS = [
  {
    key: "nursing-week",
    name: "Nursing Simulation Week",
    status: "Needs SPs",
    date_text: "07/14/2026",
    location: "Demo Simulation Center",
    sp_needed: 6,
    session_date: "2026-07-14",
    start_time: "08:30",
    end_time: "12:00",
    room: "Sim Lab A",
  },
  {
    key: "pa-osce",
    name: "PA OSCE Clinical Reasoning Lab",
    status: "Staffing in progress",
    date_text: "07/21/2026",
    location: "Demo Clinical Skills Suite",
    sp_needed: 4,
    session_date: "2026-07-21",
    start_time: "13:00",
    end_time: "16:30",
    room: "OSCE Hall 2",
  },
  {
    key: "sp-training",
    name: "SP Training Workshop",
    status: "Confirmed",
    date_text: "07/28/2026",
    location: "Demo Training Room",
    sp_needed: 8,
    session_date: "2026-07-28",
    start_time: "10:00",
    end_time: "12:00",
    room: "Workshop Room",
  },
  {
    key: "ipe",
    name: "Multi-room IPE Event",
    status: "Needs faculty review",
    date_text: "08/04/2026",
    location: "Demo IPE Floor",
    sp_needed: 10,
    session_date: "2026-08-04",
    start_time: "09:00",
    end_time: "13:00",
    room: "IPE Rooms 1-4",
  },
  {
    key: "command-center",
    name: "Live Event Command Center Demo",
    status: "Ready for demo",
    date_text: "08/11/2026",
    location: "Demo Operations Hub",
    sp_needed: 5,
    session_date: "2026-08-11",
    start_time: "08:00",
    end_time: "11:30",
    room: "Command Center",
  },
];

const OPENINGS = [
  { key: "nursing-morning", event: "nursing-week", title: "Morning inpatient case SP", shift_date: "2026-07-14", start_time: "08:00", end_time: "12:15", room: "Sim Lab A", needed_count: 4, requirements: "Comfortable portraying adult inpatient concerns", notes: "Demo-only open shift for portal response flow." },
  { key: "nursing-family", event: "nursing-week", title: "Family member role", shift_date: "2026-07-15", start_time: "09:00", end_time: "11:30", room: "Sim Lab B", needed_count: 2, requirements: "Conversation-focused role", notes: "Demo-only optional role." },
  { key: "pa-osce-afternoon", event: "pa-osce", title: "Afternoon OSCE SP", shift_date: "2026-07-21", start_time: "12:30", end_time: "16:45", room: "OSCE Hall 2", needed_count: 4, requirements: "Repeatable clinical reasoning case", notes: "Demo-only shift." },
  { key: "training-observer", event: "sp-training", title: "Training workshop participant", shift_date: "2026-07-28", start_time: "09:45", end_time: "12:15", room: "Workshop Room", needed_count: 8, requirements: "New and returning SPs welcome", notes: "Demo-only training attendance example." },
  { key: "ipe-standard", event: "ipe", title: "IPE standardized patient", shift_date: "2026-08-04", start_time: "08:30", end_time: "13:15", room: "IPE Rooms 1-4", needed_count: 8, requirements: "Team communication scenario", notes: "Demo-only multi-room staffing example." },
  { key: "command-center-live", event: "command-center", title: "Live command center SP", shift_date: "2026-08-11", start_time: "07:45", end_time: "11:45", room: "Command Center", needed_count: 5, requirements: "Used for live attendance demo", notes: "Demo-only day-of operations example." },
];

const ASSIGNMENTS = [
  { event: "nursing-week", sp: "barbara", status: "confirmed", confirmed: true },
  { event: "nursing-week", sp: "james", status: "invited", confirmed: false },
  { event: "nursing-week", sp: "angela", status: "maybe", confirmed: false },
  { event: "pa-osce", sp: "miguel", status: "confirmed", confirmed: true },
  { event: "pa-osce", sp: "linda", status: "needs_help", confirmed: false },
  { event: "sp-training", sp: "priya", status: "invited", confirmed: false },
  { event: "ipe", sp: "robert", status: "manual_follow_up", confirmed: false },
  { event: "command-center", sp: "barbara", status: "confirmed", confirmed: true },
  { event: "command-center", sp: "miguel", status: "confirmed", confirmed: true },
];

const RESPONSES = [
  { opening: "nursing-morning", sp: "barbara", response: "accepted", source: "portal" },
  { opening: "nursing-morning", sp: "james", response: "maybe", source: "email" },
  { opening: "nursing-morning", sp: "angela", response: "declined", source: "microsoft_forms" },
  { opening: "pa-osce-afternoon", sp: "miguel", response: "accepted", source: "portal" },
  { opening: "training-observer", sp: "priya", response: "available", source: "manual" },
  { opening: "ipe-standard", sp: "robert", response: "maybe", source: "manual" },
  { opening: "command-center-live", sp: "barbara", response: "accepted", source: "portal" },
  { opening: "command-center-live", sp: "miguel", response: "accepted", source: "portal" },
];

const ATTENDANCE = [
  { event: "command-center", sp: "barbara", status: "checked_in", checked_in_at: "2026-08-11T12:05:00.000Z" },
  { event: "command-center", sp: "miguel", status: "arrived" },
  { event: "nursing-week", sp: "barbara", status: "checked_out", checked_in_at: "2026-07-14T12:05:00.000Z", checked_out_at: "2026-07-14T16:15:00.000Z" },
  { event: "nursing-week", sp: "james", status: "not_arrived" },
  { event: "pa-osce", sp: "linda", status: "excused" },
  { event: "ipe", sp: "robert", status: "no_show" },
];

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^['\"]|['\"]$/g, "")];
      })
  );
}

function showHelp() {
  console.log(`CFSP demo seed\n\nSeeds fake, clearly labeled demo data for design partner walkthroughs.\n\nUsage:\n  npm run seed:demo -- --dry-run\n  CFSP_ALLOW_DEMO_SEED=true npm run seed:demo -- --write\n\nRequired for --write:\n  CFSP_ALLOW_DEMO_SEED=true\n  NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY\n\nThis script never creates auth users and never creates raw invite tokens.`);
}

function fullName(sp) {
  return [sp.first_name, sp.last_name].filter(Boolean).join(" ");
}

function printPlan() {
  console.log("This seeds fake demo data only. Do not use real SP/student/patient data.");
  console.log(`Demo organization: ${DEMO_ORG.name}`);
  console.log(`Fake SPs: ${SP_ROWS.length}`);
  console.log(`Fake events: ${EVENT_ROWS.length}`);
  console.log(`Shift openings: ${OPENINGS.length}`);
  console.log(`Shift responses: ${RESPONSES.length}`);
  console.log(`Attendance examples: ${ATTENDANCE.length}`);
  console.log("No auth users, passwords, PHI, student grades, real invite links, or raw invite tokens are created.");
}

function requireRow(row, label) {
  if (!row?.id) throw new Error(`Could not resolve ${label}.`);
  return row;
}

async function selectOne(supabase, table, filters) {
  let query = supabase.from(table).select("id").limit(1);
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${table} lookup failed: ${error.message}`);
  return data || null;
}

async function upsertBy(supabase, table, filters, payload, label) {
  const existing = await selectOne(supabase, table, filters);
  if (existing?.id) {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw new Error(`${label} update failed: ${error.message}`);
    return requireRow(data, label);
  }

  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(`${label} insert failed: ${error.message}`);
  return requireRow(data, label);
}

async function seed() {
  const cwd = process.cwd();
  const env = {
    ...readEnvFile(path.join(cwd, ".env.local")),
    ...process.env,
  };
  const args = new Set(process.argv.slice(2));
  const help = args.has("--help") || args.has("-h");
  const write = args.has("--write");

  if (help) {
    showHelp();
    return;
  }

  printPlan();

  if (!write) {
    console.log("\nDry run only. Re-run with CFSP_ALLOW_DEMO_SEED=true and --write to seed Supabase.");
    return;
  }

  if (env.CFSP_ALLOW_DEMO_SEED !== "true") {
    console.error("\nRefusing to write. Set CFSP_ALLOW_DEMO_SEED=true to confirm this is intentional fake demo seeding.");
    process.exit(1);
  }

  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();

  const org = await upsertBy(
    supabase,
    "organizations",
    { slug: DEMO_ORG.slug },
    DEMO_ORG,
    "demo organization"
  );
  const organizationId = org.id;

  await upsertBy(
    supabase,
    "organization_communication_settings",
    { organization_id: organizationId },
    {
      organization_id: organizationId,
      default_sp_communication_mode: "hybrid",
      allow_sp_portal: true,
      allow_email_workflow: true,
      allow_microsoft_forms_workflow: true,
      allow_manual_workflow: true,
      default_ms_forms_url: "https://forms.office.com/demo-cfsp-fake",
      default_reply_to_email: "simulation.coordinator@example.invalid",
      sp_onboarding_message: "Demo only: CFSP supports portal, email, Microsoft Forms, and manual workflows during onboarding.",
    },
    "organization communication settings"
  );

  const spIds = new Map();
  for (const sp of SP_ROWS) {
    const name = fullName(sp);
    const row = await upsertBy(
      supabase,
      "sps",
      { organization_id: organizationId, full_name: name },
      {
        organization_id: organizationId,
        first_name: sp.first_name,
        last_name: sp.last_name,
        full_name: name,
        working_email: sp.email,
        email: sp.email,
        phone: "555-0100",
        status: "Active",
        notes: `${DEMO_MARKER}: fake SP record for demo only.`,
      },
      `SP ${name}`
    );
    spIds.set(sp.key, row.id);

    await upsertBy(
      supabase,
      "sp_communication_preferences",
      { organization_id: organizationId, sp_id: row.id },
      {
        organization_id: organizationId,
        sp_id: row.id,
        preferred_mode: sp.mode,
        portal_status: sp.portal,
        onboarding_status: sp.onboarding,
        last_invited_at: sp.portal === "invited" ? now : null,
        notes: `${DEMO_MARKER}: admin-only fake communication note.`,
      },
      `communication preference for ${name}`
    );
  }

  const eventIds = new Map();
  for (const event of EVENT_ROWS) {
    const row = await upsertBy(
      supabase,
      "events",
      { organization_id: organizationId, name: event.name },
      {
        organization_id: organizationId,
        name: event.name,
        status: event.status,
        date_text: event.date_text,
        sp_needed: event.sp_needed,
        visibility: "team",
        location: event.location,
        notes: `${DEMO_MARKER}: fake event for demo walkthroughs only.`,
      },
      `event ${event.name}`
    );
    eventIds.set(event.key, row.id);

    await upsertBy(
      supabase,
      "event_sessions",
      { event_id: row.id, session_date: event.session_date, start_time: event.start_time },
      {
        organization_id: organizationId,
        event_id: row.id,
        session_date: event.session_date,
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location,
        room: event.room,
      },
      `session for ${event.name}`
    );
  }

  const openingIds = new Map();
  for (const opening of OPENINGS) {
    const eventId = eventIds.get(opening.event);
    const event = EVENT_ROWS.find((candidate) => candidate.key === opening.event);
    const row = await upsertBy(
      supabase,
      "event_shift_openings",
      { event_id: eventId, title: opening.title, shift_date: opening.shift_date, start_time: opening.start_time },
      {
        organization_id: organizationId,
        event_id: eventId,
        title: opening.title,
        shift_date: opening.shift_date,
        start_time: opening.start_time,
        end_time: opening.end_time,
        location: event?.location || "Demo Simulation Center",
        room: opening.room,
        needed_count: opening.needed_count,
        status: "open",
        visibility: "portal_and_email",
        requirements: opening.requirements,
        notes: `${DEMO_MARKER}: ${opening.notes}`,
        updated_at: now,
      },
      `shift opening ${opening.title}`
    );
    openingIds.set(opening.key, row.id);
  }

  for (const assignment of ASSIGNMENTS) {
    const eventId = eventIds.get(assignment.event);
    const spId = spIds.get(assignment.sp);
    await upsertBy(
      supabase,
      "event_sps",
      { event_id: eventId, sp_id: spId },
      {
        organization_id: organizationId,
        event_id: eventId,
        sp_id: spId,
        status: assignment.status,
        assignment_status: assignment.status,
        role_name: assignment.status,
        confirmed: assignment.confirmed,
        notes: `${DEMO_MARKER}: fake assignment for demo only.`,
      },
      `assignment ${assignment.event}/${assignment.sp}`
    );
  }

  for (const response of RESPONSES) {
    const openingId = openingIds.get(response.opening);
    const opening = OPENINGS.find((candidate) => candidate.key === response.opening);
    const eventId = opening ? eventIds.get(opening.event) : null;
    const spId = spIds.get(response.sp);
    await upsertBy(
      supabase,
      "event_shift_responses",
      { opening_id: openingId, sp_id: spId },
      {
        event_id: eventId,
        opening_id: openingId,
        sp_id: spId,
        response: response.response,
        source: response.source,
        message: "Fake demo response.",
        responded_at: now,
        updated_at: now,
      },
      `response ${response.opening}/${response.sp}`
    );
  }

  for (const attendance of ATTENDANCE) {
    const eventId = eventIds.get(attendance.event);
    const spId = spIds.get(attendance.sp);
    await upsertBy(
      supabase,
      "event_sp_attendance",
      { event_id: eventId, sp_id: spId },
      {
        event_id: eventId,
        sp_id: spId,
        status: attendance.status,
        notes: `${DEMO_MARKER}: fake attendance status for live sync demo.`,
        checked_in_at: attendance.checked_in_at || null,
        checked_out_at: attendance.checked_out_at || null,
        updated_at: now,
      },
      `attendance ${attendance.event}/${attendance.sp}`
    );
  }

  console.log("\nDemo seed complete.");
  console.log(`Organization slug: ${DEMO_ORG.slug}`);
  console.log("Reminder: this data is fake and should stay out of real pilot reporting.");
}

seed().catch((error) => {
  console.error("Demo seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
