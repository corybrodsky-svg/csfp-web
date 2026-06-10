import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";

const DEMO_MARKER = "CFSP_KEYSTONE_DEMO_FAKE_DATA";
const DEMO_ORG = {
  name: "Keystone Simulation Alliance",
  slug: "keystone-simulation-alliance",
  type: "demo",
  status: "active",
};

const DEMO_FACULTY_STAFF = [
  { key: "dr-penelope", role: "faculty", directoryRole: "faculty", label: "Dr. Penelope Practice", email: "penelope.practice@example.com", phone: "555-0201" },
  { key: "prof-marty", role: "faculty", directoryRole: "faculty", label: "Prof. Marty Mockcase", email: "marty.mockcase@example.com", phone: "555-0202" },
  { key: "dana-demo", role: "sim_lead", directoryRole: "sim_ops", label: "Dana Demo", email: "dana.demo@example.com", phone: "555-0203" },
  { key: "casey-clipboard", role: "sim_staff", directoryRole: "sim_ops", label: "Casey Clipboard", email: "casey.clipboard@example.com", phone: "555-0204" },
  { key: "fiona-faculty", role: "faculty", directoryRole: "faculty", label: "Fiona Faculty", email: "fiona.faculty@example.com", phone: "555-0205" },
  { key: "greg-grading", role: "faculty", directoryRole: "sim_ops", label: "Greg Grading", email: "greg.grading@example.com", phone: "555-0206" },
  { key: "tina-training", role: "faculty", directoryRole: "sim_ops", label: "Tina Training", email: "tina.training@example.com", phone: "555-0207" },
  { key: "sam-scenario", role: "sim_staff", directoryRole: "sim_ops", label: "Sam Scenario", email: "sam.scenario@example.com", phone: "555-0208" },
  { key: "olivia-objective", role: "faculty", directoryRole: "faculty", label: "Olivia Objective", email: "olivia.objective@example.com", phone: "555-0209" },
  { key: "victor-validation", role: "sim_staff", directoryRole: "sim_ops", label: "Victor Validation", email: "victor.validation@example.com", phone: "555-0210" },
  { key: "carmen-checklist", role: "faculty", directoryRole: "faculty", label: "Carmen Checklist", email: "carmen.checklist@example.com", phone: "555-0211" },
  { key: "riley-rubric", role: "faculty", directoryRole: "faculty", label: "Riley Rubric", email: "riley.rubric@example.com", phone: "555-0212" },
];

const DEMO_EVENT_STAFF_ASSIGNMENTS = {
  "settings-complete": {
    faculty: "prof-marty",
    simLead: "dana-demo",
    simStaff: "casey-clipboard",
    trainingOwner: "faculty_led",
  },
  "poll-sent": {
    faculty: "dr-penelope",
    simLead: "dana-demo",
    simStaff: "sam-scenario",
    trainingOwner: "internal_sim",
  },
  "forms-imported": {
    faculty: "fiona-faculty",
    simLead: "casey-clipboard",
    simStaff: "tina-training",
    trainingOwner: "shared",
  },
  "hire-confirmation": {
    faculty: "olivia-objective",
    simLead: "greg-grading",
    simStaff: "victor-validation",
    trainingOwner: "internal_sim",
  },
  "confirmed-preview": {
    faculty: "sam-scenario",
    simLead: "casey-clipboard",
    simStaff: "carmen-checklist",
    trainingOwner: "shared",
  },
  completed: {
    faculty: "prof-marty",
    simLead: "dana-demo",
    simStaff: "olivia-objective",
    trainingOwner: "internal_sim",
  },
  orientation: {
    faculty: "riley-rubric",
    simLead: "dana-demo",
    simStaff: "fiona-faculty",
    trainingOwner: "faculty_led",
  },
};

const SAFE_WRITE_TARGET_PATTERN = /(localhost|127\.0\.0\.1|preview|staging|dev|development)/i;
const DEFAULT_SCHEDULE_FILES = ["Summer Schedule 2026(2).xlsx", path.join("uploads", "Summer Schedule 2026(2).xlsx")];
const DEFAULT_SP_FILES = ["ACTIVE SP HIRING.xlsx", path.join("uploads", "ACTIVE SP HIRING.xlsx")];
const DEMO_STAFF_DIRECTORY_PASSWORD = "DemoStaffOnly-2026!";
const SAFE_SP_PORTAL_STATUS = "not_invited";
const SAFE_SP_ONBOARDING_STATUS = "not_started";
const ALLOWED_SP_PORTAL_STATUSES = new Set(["not_invited", "invited", "linked", "needs_help", "disabled"]);
const ALLOWED_SP_ONBOARDING_STATUSES = new Set(["not_started", "invited", "in_progress", "complete", "needs_help", "declined"]);
const SAFE_EVENT_SP_STATUS = "invited";
const ALLOWED_EVENT_SP_STATUSES = new Set(["invited", "contacted", "confirmed", "declined", "backup", "no_show"]);
const SAFE_SP_ATTENDANCE_STATUS = "not_arrived";
const ALLOWED_SP_ATTENDANCE_STATUSES = new Set(["not_arrived", "arrived", "checked_in", "checked_out", "no_show", "excused"]);
const SP_PORTAL_STATUS_ALIASES = {
  profile_ready: "invited",
  ready_to_link: "invited",
};
const SP_ONBOARDING_STATUS_ALIASES = {
  profile_ready: "in_progress",
  ready_to_link: "in_progress",
};
const EVENT_SP_STATUS_ALIASES = {
  pending: "invited",
  available: "contacted",
  available_not_selected: "contacted",
  unavailable: "declined",
  backup_selected: "backup",
  confirmed_primary: "confirmed",
  confirmed_backup: "backup",
  completed: "confirmed",
  manual_follow_up: "contacted",
};

const DEMO_SPS = [
  { key: "wanda", first_name: "Wanda", last_name: "Wingdings", email: "wanda.wingdings@example.com", mode: "portal", portal: "invited", onboarding: "invited", tags: "IPE, inpatient, debrief-friendly" },
  { key: "doug", first_name: "Doug", last_name: "Debugger", email: "doug.debugger@example.com", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "OSCE, repeatable checklist" },
  { key: "nancy", first_name: "Nancy", last_name: "No-Show", email: "nancy.noshow@example.com", mode: "microsoft_forms", portal: "not_invited", onboarding: "not_started", tags: "Demo unavailable pattern" },
  { key: "frank", first_name: "Frank", last_name: "Formsworth", email: "frank.formsworth@example.com", mode: "microsoft_forms", portal: "not_invited", onboarding: "not_started", tags: "MS Forms respondent" },
  { key: "barb", first_name: "Barb", last_name: "Backup", email: "barb.backup@example.com", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Backup, family member" },
  { key: "peter", first_name: "Peter", last_name: "Placeholder", email: "peter.placeholder@example.com", mode: "manual", portal: "not_invited", onboarding: "not_started", tags: "Manual follow-up" },
  { key: "sally", first_name: "Sally", last_name: "Simulation", email: "sally.simulation@example.com", mode: "portal", portal: "linked", onboarding: "complete", tags: "High fidelity, training complete" },
  { key: "henry", first_name: "Henry", last_name: "Handoff", email: "henry.handoff@example.com", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "TeamSTEPPS, handoff" },
  { key: "molly", first_name: "Molly", last_name: "Mockcase", email: "molly.mockcase@example.com", mode: "portal", portal: "invited", onboarding: "invited", tags: "Cardio, clinic" },
  { key: "victor", first_name: "Victor", last_name: "Virtual", email: "victor.virtual@example.com", mode: "portal", portal: "linked", onboarding: "complete", tags: "Virtual encounters" },
  { key: "tina", first_name: "Tina", last_name: "Timeblock", email: "tina.timeblock@example.com", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Morning only" },
  { key: "gary", first_name: "Gary", last_name: "Glitch", email: "gary.glitch@example.com", mode: "manual", portal: "needs_help", onboarding: "needs_help", tags: "Needs coordinator help" },
  { key: "patty", first_name: "Patty", last_name: "Pollsent", email: "patty.pollsent@example.com", mode: "microsoft_forms", portal: "not_invited", onboarding: "not_started", tags: "Poll outreach" },
  { key: "benny", first_name: "Benny", last_name: "Backup", email: "benny.backup@example.com", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Backup" },
  { key: "rita", first_name: "Rita", last_name: "Rotation", email: "rita.rotation@example.com", mode: "portal", portal: "linked", onboarding: "complete", tags: "Rotation flow" },
  { key: "portal1", first_name: "Portal", last_name: "Demo One", email: "sp.demo1@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Portal test account candidate", portalTest: true },
  { key: "portal2", first_name: "Portal", last_name: "Demo Two", email: "sp.demo2@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Portal test account candidate", portalTest: true },
  { key: "portal3", first_name: "Portal", last_name: "Demo Three", email: "sp.demo3@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Portal test account candidate", portalTest: true },
  { key: "portal4", first_name: "Portal", last_name: "Demo Four", email: "sp.demo4@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Portal test account candidate", portalTest: true },
  { key: "portal5", first_name: "Portal", last_name: "Demo Five", email: "sp.demo5@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Portal test account candidate", portalTest: true },
];

const DEMO_EVENTS = [
  { key: "settings-complete", scenario: "A. Event settings complete, no SP poll yet", name: "NURS 421 IPE Simulation", type: "IPE Simulation", status: "Settings complete", date_text: "06/22/2026", session_date: "2026-06-22", start_time: "08:00", end_time: "12:00", location: "Keystone Demo Simulation Center", roomCount: 4, learnerCount: 32, studentsPerRoom: 8, roundCount: 4, sp_needed: 4, backups: 1, training: "required", communication: { sp_hiring_poll_email: "ready_to_draft", hire_confirmation_email: "needs_info", availability_poll_closed_email: "not_needed", prep_for_training_email: "ready_to_draft" } },
  { key: "poll-sent", scenario: "B. SP poll drafted/sent", name: "PA 561 Virtual Skills Day", type: "Virtual Skills", status: "SP poll sent", date_text: "06/29/2026", session_date: "2026-06-29", start_time: "13:00", end_time: "16:30", location: "Virtual Demo Campus", roomCount: 3, learnerCount: 24, studentsPerRoom: 8, roundCount: 3, sp_needed: 3, backups: 1, training: "required", communication: { sp_hiring_poll_email: "sent", hire_confirmation_email: "ready_to_draft", availability_poll_closed_email: "ready_to_draft", prep_for_training_email: "ready_to_draft" } },
  { key: "forms-imported", scenario: "C. MS Forms responses imported", name: "Pharm Mock OSCE", type: "OSCE", status: "Forms imported", date_text: "07/08/2026", session_date: "2026-07-08", start_time: "09:00", end_time: "12:30", location: "Keystone Clinical Skills Suite", roomCount: 5, learnerCount: 40, studentsPerRoom: 8, roundCount: 5, sp_needed: 5, backups: 2, training: "optional", communication: { sp_hiring_poll_email: "sent", hire_confirmation_email: "ready_to_draft", availability_poll_closed_email: "drafted", prep_for_training_email: "not_needed" } },
  { key: "hire-confirmation", scenario: "D. Hire confirmation drafted/sent", name: "Disaster Drill Demo", type: "Disaster Drill", status: "Hire confirmation sent", date_text: "07/16/2026", session_date: "2026-07-16", start_time: "08:30", end_time: "13:30", location: "Keystone Emergency Simulation Lab", roomCount: 6, learnerCount: 36, studentsPerRoom: 6, roundCount: 4, sp_needed: 6, backups: 2, training: "required", communication: { sp_hiring_poll_email: "sent", hire_confirmation_email: "sent", availability_poll_closed_email: "drafted", prep_for_training_email: "drafted" } },
  { key: "confirmed-preview", scenario: "E. Confirmed SPs with schedule preview", name: "Cardio Case Sprint", type: "Case Sprint", status: "Confirmed with schedule preview", date_text: "07/23/2026", session_date: "2026-07-23", start_time: "10:00", end_time: "14:00", location: "Keystone Cardio Lab", roomCount: 4, learnerCount: 28, studentsPerRoom: 7, roundCount: 4, sp_needed: 4, backups: 1, training: "required", scheduleComplete: true, communication: { sp_hiring_poll_email: "sent", hire_confirmation_email: "sent", availability_poll_closed_email: "sent", prep_for_training_email: "drafted" } },
  { key: "completed", scenario: "F. Completed demo event", name: "TeamSTEPPS Demo Encounter", type: "TeamSTEPPS", status: "Completed", date_text: "08/03/2026", session_date: "2026-08-03", start_time: "08:00", end_time: "11:30", location: "Keystone Team Training Floor", roomCount: 3, learnerCount: 18, studentsPerRoom: 6, roundCount: 3, sp_needed: 3, backups: 1, training: "completed", completed: true, scheduleComplete: true, communication: { sp_hiring_poll_email: "completed", hire_confirmation_email: "completed", availability_poll_closed_email: "completed", prep_for_training_email: "completed" } },
  { key: "orientation", scenario: "Bonus. Orientation lab with portal SPs", name: "Simulation Orientation Lab", type: "Orientation", status: "Portal demo ready", date_text: "08/10/2026", session_date: "2026-08-10", start_time: "14:00", end_time: "16:00", location: "Keystone Orientation Studio", roomCount: 2, learnerCount: 16, studentsPerRoom: 8, roundCount: 2, sp_needed: 2, backups: 1, training: "not_required", communication: { sp_hiring_poll_email: "not_needed", hire_confirmation_email: "sent", availability_poll_closed_email: "not_needed", prep_for_training_email: "not_needed" } },
];

const ASSIGNMENTS = [
  { event: "poll-sent", sp: "wanda", status: "contacted", confirmed: false },
  { event: "poll-sent", sp: "doug", status: "pending", confirmed: false },
  { event: "poll-sent", sp: "nancy", status: "unavailable", confirmed: false },
  { event: "forms-imported", sp: "frank", status: "available", confirmed: false },
  { event: "forms-imported", sp: "barb", status: "backup_selected", confirmed: false },
  { event: "forms-imported", sp: "patty", status: "available_not_selected", confirmed: false },
  { event: "hire-confirmation", sp: "sally", status: "confirmed_primary", confirmed: true },
  { event: "hire-confirmation", sp: "henry", status: "confirmed_primary", confirmed: true },
  { event: "hire-confirmation", sp: "benny", status: "confirmed_backup", confirmed: true },
  { event: "confirmed-preview", sp: "molly", status: "confirmed_primary", confirmed: true },
  { event: "confirmed-preview", sp: "victor", status: "confirmed_primary", confirmed: true },
  { event: "confirmed-preview", sp: "tina", status: "confirmed_primary", confirmed: true },
  { event: "confirmed-preview", sp: "rita", status: "confirmed_primary", confirmed: true },
  { event: "completed", sp: "sally", status: "completed", confirmed: true },
  { event: "completed", sp: "rita", status: "completed", confirmed: true },
  { event: "completed", sp: "portal1", status: "completed", confirmed: true },
  { event: "orientation", sp: "portal1", status: "confirmed_primary", confirmed: true },
  { event: "orientation", sp: "portal2", status: "confirmed_primary", confirmed: true },
  { event: "orientation", sp: "portal3", status: "confirmed_backup", confirmed: true },
];

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, "utf8").split(/\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^[\"']|[\"']$/g, "")];
  }));
}

function getEnvironment() {
  const cwd = process.cwd();
  return { ...readEnvFile(path.join(cwd, ".env.local")), ...process.env };
}

function parseArgs(argv) {
  const args = { dryRun: false, write: false, reset: false, verify: false, help: false, scheduleFile: "", spFile: "" };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--write") args.write = true;
    else if (arg === "--reset") args.reset = true;
    else if (arg === "--verify") args.verify = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--schedule-file=")) args.scheduleFile = arg.slice("--schedule-file=".length);
    else if (arg.startsWith("--sp-file=")) args.spFile = arg.slice("--sp-file=".length);
  }
  if (!args.write && !args.reset && !args.verify) args.dryRun = true;
  return args;
}

function showHelp() {
  console.log(`CFSP Keystone demo org seeder\n\nUsage:\n  npm run seed:demo-org -- --dry-run\n  CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run seed:demo-org -- --write\n  CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run seed:demo-org -- --reset\n  npm run seed:demo-org -- --verify\n\nOptional structure-model files:\n  --schedule-file="Summer Schedule 2026(2).xlsx"\n  --sp-file="ACTIVE SP HIRING.xlsx"\n\nThe workbook reader reports only structure/counts and never imports names, emails, phones, faculty, learners, or SP identities.`);
}

function resolveWorkbookPath(explicitPath, defaults) {
  const candidates = [explicitPath, ...defaults].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return "";
}

function categorizeHeader(header) {
  const text = String(header || "").toLowerCase();
  if (/date|day/.test(text)) return "date";
  if (/time|start|end|call|release/.test(text)) return "time";
  if (/room|lab|space|site|location/.test(text)) return "room/location";
  if (/rotation|round|block/.test(text)) return "rotation";
  if (/train|zoom|recording/.test(text)) return "training";
  if (/email|phone|contact/.test(text)) return "contact";
  if (/status|confirm|avail|response|pending/.test(text)) return "status/availability";
  if (/name|sp|faculty|student|learner/.test(text)) return "identity-like";
  return "other";
}

function workbookStructureSummary(filePath) {
  if (!filePath) return null;
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const firstNonEmpty = rows.find((row) => Array.isArray(row) && row.some((value) => value !== null && String(value).trim())) || [];
    const categories = firstNonEmpty.map(categorizeHeader).reduce((acc, category) => {
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    return { sheetName, rows: Math.max(0, rows.length - 1), columns: range.e.c + 1, headerCategories: categories };
  });
  return { fileName: path.basename(filePath), sheets };
}

function fullName(sp) {
  return [sp.first_name, sp.last_name].filter(Boolean).join(" ");
}

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeAllowedStatus(value, allowed, aliases, fallback) {
  const normalized = normalizeToken(value);
  const mapped = aliases[normalized] || normalized;
  return allowed.has(mapped) ? mapped : fallback;
}

function normalizeSpPortalStatus(value) {
  return normalizeAllowedStatus(value, ALLOWED_SP_PORTAL_STATUSES, SP_PORTAL_STATUS_ALIASES, SAFE_SP_PORTAL_STATUS);
}

function normalizeSpOnboardingStatus(value) {
  return normalizeAllowedStatus(value, ALLOWED_SP_ONBOARDING_STATUSES, SP_ONBOARDING_STATUS_ALIASES, SAFE_SP_ONBOARDING_STATUS);
}

function normalizeEventSpStatus(value) {
  return normalizeAllowedStatus(value, ALLOWED_EVENT_SP_STATUSES, EVENT_SP_STATUS_ALIASES, SAFE_EVENT_SP_STATUS);
}

function normalizeSpAttendanceStatus(value) {
  return normalizeAllowedStatus(value, ALLOWED_SP_ATTENDANCE_STATUSES, {}, SAFE_SP_ATTENDANCE_STATUS);
}

function resolveDirectoryRole(person) {
  const candidate = String(person?.directoryRole || person?.role || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (candidate === "sim_ops" || candidate === "sim_op") return "sim_ops";
  if (candidate === "sim_lead" || candidate === "sim_staff" || candidate === "faculty_lead" || candidate === "coordinator") return "sim_ops";
  if (candidate === "faculty") return "faculty";
  if (candidate === "org_admin" || candidate === "admin") return "org_admin";
  if (candidate === "platform_owner" || candidate === "super_admin") return "org_admin";
  if (candidate === "sp") return "sp";
  if (candidate === "viewer" || candidate === "read_only") return "viewer";
  return "faculty";
}

function metadataRoleFromDirectoryRole(directoryRole) {
  return directoryRole === "sim_ops" ? "sim_op" : directoryRole === "org_admin" ? "admin" : directoryRole;
}

function addMinutes(time, minutes) {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute + minutes));
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function getProfileByKey(profileKey) {
  return DEMO_FACULTY_STAFF.find((person) => person.key === profileKey);
}

function inferCoursePrefixFromEventName(value) {
  const match = String(value || "").match(/([A-Za-z]{2,}\s+\d{3,4}[A-Za-z]?)/);
  return match ? match[1].trim() : "Demo Simulation Program";
}

function resolveEventTeamContacts(event) {
  const assignment = DEMO_EVENT_STAFF_ASSIGNMENTS[event.key] || {};
  const facultyChoices = DEMO_FACULTY_STAFF.filter((person) => person.role === "faculty");
  const staffChoices = DEMO_FACULTY_STAFF.filter((person) => person.role === "sim_staff" || person.role === "sim_lead");
  const leadChoices = DEMO_FACULTY_STAFF.filter((person) => person.role === "sim_lead");

  const eventIndex = Math.max(0, DEMO_EVENTS.findIndex((candidate) => candidate.key === event.key));
  const faculty = getProfileByKey(assignment.faculty) || facultyChoices[eventIndex % Math.max(1, facultyChoices.length)] || facultyChoices[0];
  const simLead = getProfileByKey(assignment.simLead) || leadChoices[eventIndex % Math.max(1, leadChoices.length)] || staffChoices[eventIndex % Math.max(1, staffChoices.length)] || faculty;
  const simStaff = getProfileByKey(assignment.simStaff) || staffChoices[(eventIndex + 1) % Math.max(1, staffChoices.length)] || simLead;
  const trainingOwner = event.training === "not_required"
    ? ""
    : assignment.trainingOwner === "faculty_led" || assignment.trainingOwner === "internal_sim" || assignment.trainingOwner === "shared"
      ? assignment.trainingOwner
      : "internal_sim";
  return {
    faculty,
    simLead,
    simStaff,
    trainingOwner,
  };
}

function buildCommunicationStatuses(statuses) {
  return Object.entries(statuses || {}).map(([key, value]) => `${key}:${value}`).join(";");
}

function buildScheduleBuilderSnapshot(event) {
  return JSON.stringify({
    version: "demo-seed-v1",
    source: DEMO_MARKER,
    readOnlyDemo: true,
    days: [{
      date: event.session_date,
      startTime: event.start_time,
      endTime: event.end_time,
      rooms: Array.from({ length: event.roomCount }, (_, index) => `Demo Room ${index + 1}`),
      rounds: event.roundCount,
      learners: event.learnerCount,
      studentsPerRoom: event.studentsPerRoom,
    }],
  });
}

function buildEventNotes(event) {
  const contacts = resolveEventTeamContacts(event);
  const facultyProgram = inferCoursePrefixFromEventName(event.name);
  const trainingDate = event.training === "not_required" ? "" : event.session_date;
  const lines = [
    "[CFSP_TRAINING_METADATA]",
    `canonical_event_type: ${event.type}`,
    `modality: ${event.name.includes("Virtual") ? "Virtual" : "In person"}`,
    `canonical_course_program: ${facultyProgram}`,
    `course_faculty: ${contacts.faculty?.label || ""}`,
    `faculty_names: ${contacts.faculty?.label || ""}`,
    `faculty_email: ${contacts.faculty?.email || ""}`,
    `faculty_phone: ${contacts.faculty?.phone || ""}`,
    `faculty_program: ${facultyProgram}`,
    `sim_contact: ${contacts.simLead?.label || ""}`,
    `sim_lead: ${contacts.simLead?.label || ""}`,
    `sim_staff: ${contacts.simStaff?.label || ""}`,
    `schedule_learner_count: ${event.learnerCount}`,
    `schedule_room_count: ${event.roomCount}`,
    `schedule_round_count: ${event.roundCount}`,
    `schedule_room_capacity: ${event.studentsPerRoom}`,
    `schedule_encounter_minutes: 25`,
    `schedule_feedback_minutes: 5`,
    `schedule_transition_minutes: 5`,
    `prebrief_enabled: yes`,
    `prebrief_length_minutes: 20`,
    `prebrief_location: Demo Briefing Room`,
    `case_count: ${Math.max(1, Math.min(event.roomCount, 4))}`,
    `case_rotation_required: yes`,
    `event_session_date: ${event.session_date}`,
    `event_start_time: ${event.start_time}`,
    `event_end_time: ${event.end_time}`,
    `training_required: ${event.training === "not_required" ? "no" : "yes"}`,
    `training_ownership: ${event.training === "not_required" ? "" : contacts.trainingOwner}`,
    `training_date: ${trainingDate}`,
    `training_start_time: ${event.training === "not_required" ? "" : "15:00"}`,
    `training_end_time: ${event.training === "not_required" ? "" : "16:00"}`,
    `training_zoom_required: ${event.name.includes("Virtual") ? "yes" : "no"}`,
    `training_recording_planned: ${event.training === "required" ? "yes" : "no"}`,
    `faculty_availability_unknown: no`,
    `backups_required: yes`,
    `backup_count: ${event.backups}`,
    `staffing_status: ${event.status}`,
    `communications_status: ${event.completed ? "completed" : "in_progress"}`,
    `communication_template_statuses: ${buildCommunicationStatuses(event.communication)}`,
    `sp_poll_builder_state: ${event.communication?.sp_hiring_poll_email === "sent" ? "sent" : "draft"}`,
    `hiring_email_drafted_at: ${event.communication?.sp_hiring_poll_email === "sent" ? `${event.session_date}T12:00:00.000Z` : ""}`,
    `hiring_email_sent_at: ${event.communication?.sp_hiring_poll_email === "sent" ? `${event.session_date}T12:15:00.000Z` : ""}`,
    `confirmation_email_drafted_at: ${["drafted", "sent", "completed"].includes(event.communication?.hire_confirmation_email) ? `${event.session_date}T13:00:00.000Z` : ""}`,
    `confirmation_email_sent_at: ${["sent", "completed"].includes(event.communication?.hire_confirmation_email) ? `${event.session_date}T13:15:00.000Z` : ""}`,
    `schedule_status: ${event.scheduleComplete ? "complete" : "preview"}`,
    `schedule_completed_at: ${event.scheduleComplete ? `${event.session_date}T18:00:00.000Z` : ""}`,
    `schedule_builder_snapshot: ${buildScheduleBuilderSnapshot(event)}`,
    `Course Faculty: ${contacts.faculty?.label || ""}`,
    `Faculty Email: ${contacts.faculty?.email || ""}`,
    `Sim Staff: ${contacts.simStaff?.label || ""}`,
    `Event Lead/Team: ${contacts.simLead?.label || ""}`,
    "[/CFSP_TRAINING_METADATA]",
    `${DEMO_MARKER}: fake Keystone demo event. No real names, emails, learners, faculty, or SP identities were imported.`,
    `Demo scenario: ${event.scenario}`,
  ];
  return lines.join("\n");
}

function buildPlan(options = {}) {
  const schedulePath = resolveWorkbookPath(options.scheduleFile || "", DEFAULT_SCHEDULE_FILES);
  const spPath = resolveWorkbookPath(options.spFile || "", DEFAULT_SP_FILES);
  const eventStaffAssignments = DEMO_EVENTS.map((event) => {
    const contacts = resolveEventTeamContacts(event);
    return {
      event: event.key,
      faculty: contacts.faculty?.label || "",
      simLead: contacts.simLead?.label || "",
      simStaff: contacts.simStaff?.label || "",
      trainingOwner: contacts.trainingOwner,
    };
  });
  return {
    org: DEMO_ORG,
    sps: DEMO_SPS,
    events: DEMO_EVENTS,
    facultyStaff: DEMO_FACULTY_STAFF,
    assignments: ASSIGNMENTS,
    eventStaffAssignments,
    staffDirectorySource: "auth users + organization_memberships",
    sessions: DEMO_EVENTS.reduce((sum, event) => sum + event.roomCount * event.roundCount, 0),
    workflowStates: DEMO_EVENTS.map((event) => event.scenario),
    workbookModels: {
      schedule: workbookStructureSummary(schedulePath),
      spHiring: workbookStructureSummary(spPath),
    },
  };
}

function printPlan(plan, organizationId = "not looked up in dry run") {
  console.log("Keystone demo seed plan");
  console.log(`Target org: ${plan.org.name}`);
  console.log(`Target org id: ${organizationId}`);
  console.log(`Events to create/upsert: ${plan.events.length}`);
  console.log(`Fake faculty/staff profiles to create/upsert: ${plan.facultyStaff.length}`);
  console.log(`Staff directory source: ${plan.staffDirectorySource}`);
  console.log(`Fake staff directory rows to create/upsert: ${plan.facultyStaff.length}`);
  console.log(`Events linked to faculty/staff contacts: ${plan.eventStaffAssignments.length}`);
  console.log(`Faculty/staff sample contacts: ${plan.facultyStaff.slice(0, 6).map((person) => `${person.label} (${person.email})`).join("; ")}`);
  console.log(`Fake SP profiles to create/upsert: ${plan.sps.length}`);
  console.log(`Portal test SP profiles: ${plan.sps.filter((sp) => sp.portalTest).map((sp) => sp.email).join(", ")}`);
  console.log(`Assignments to create/upsert: ${plan.assignments.length}`);
  console.log(`Schedule/session rows to create/upsert: ${plan.sessions}`);
  console.log("Workflow states:");
  plan.workflowStates.forEach((state) => console.log(`- ${state}`));
  console.log("Workbook structure models:");
  for (const [label, summary] of Object.entries(plan.workbookModels)) {
    if (!summary) {
      console.log(`- ${label}: source workbook not found; using built-in fake model shaped for summer schedule / active hiring demos`);
      continue;
    }
    console.log(`- ${label}: ${summary.fileName}`);
    summary.sheets.forEach((sheet) => console.log(`  ${sheet.sheetName}: rows=${sheet.rows}, columns=${sheet.columns}, headerCategories=${JSON.stringify(sheet.headerCategories)}`));
  }
  console.log("PII guard: real workbook cell values are never inserted; all names/emails/phones are generated fake demo values.");
}

function createSeedClientOrExit(env, mode) {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(`${mode} requires SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
    process.exit(1);
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function assertWriteAllowed(env) {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (env.CFSP_ALLOW_DEMO_SEED !== "true") throw new Error("Refusing to write. Set CFSP_ALLOW_DEMO_SEED=true.");
  if (!SAFE_WRITE_TARGET_PATTERN.test(supabaseUrl) && env.CFSP_DEMO_SEED_TARGET !== "dev" && env.CFSP_DEMO_SEED_TARGET !== "preview") {
    throw new Error("Refusing to write without a dev/preview/local target signal. Set CFSP_DEMO_SEED_TARGET=dev only for safe non-production databases.");
  }
}

async function selectOne(supabase, table, filters) {
  let query = supabase.from(table).select("id").limit(1);
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${table} lookup failed: ${error.message}`);
  return data || null;
}

async function upsertBy(supabase, table, filters, payload, label) {
  const existing = await selectOne(supabase, table, filters);
  if (existing?.id) {
    const { data, error } = await supabase.from(table).update(payload).eq("id", existing.id).select("id").single();
    if (error) throw new Error(`${label} update failed: ${error.message}`);
    return data;
  }
  const { data, error } = await supabase.from(table).insert(payload).select("id").single();
  if (error) throw new Error(`${label} insert failed: ${error.message}`);
  return data;
}

async function findAuthUserByEmail(supabase, email) {
  const targetEmail = String(email || "").trim().toLowerCase();
  if (!targetEmail) return null;

  const perPage = 200;
  let page = 1;
  while (true) {
    const result = await supabase.auth.admin.listUsers({ page, perPage });
    if (result.error) throw new Error(`Auth lookup failed for ${targetEmail}: ${result.error.message}`);
    const users = result.data?.users || [];
    const match = users.find((user) => String(user?.email || "").toLowerCase() === targetEmail);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function ensureDemoStaffDirectoryUser(supabase, person, organizationId) {
  const directoryRole = resolveDirectoryRole(person);
  const metadataRole = metadataRoleFromDirectoryRole(directoryRole);
  const fullName = person.label || "";
  const existingUser = await findAuthUserByEmail(supabase, person.email);
  if (!existingUser) {
    const result = await supabase.auth.admin.createUser({
      email: person.email,
      password: DEMO_STAFF_DIRECTORY_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        schedule_name: fullName,
        role: metadataRole,
        organization_id: organizationId,
      },
    });
    if (result.error) throw new Error(`Could not create directory user ${person.email}: ${result.error.message}`);
    return result.data.user;
  }

  const existingMetadata = existingUser.user_metadata || {};
  const shouldUpdateMetadata = existingMetadata.full_name !== fullName || existingMetadata.schedule_name !== fullName || existingMetadata.role !== metadataRole || existingMetadata.organization_id !== organizationId;
  if (shouldUpdateMetadata) {
    const updateResult = await supabase.auth.admin.updateUserById(existingUser.id, {
      user_metadata: {
        ...existingMetadata,
        full_name: fullName,
        schedule_name: fullName,
        role: metadataRole,
        organization_id: organizationId,
      },
    });
    if (updateResult.error) throw new Error(`Could not update directory user ${person.email}: ${updateResult.error.message}`);
  }

  return existingUser;
}

async function upsertDirectoryMembership(supabase, organizationId, person) {
  const user = await ensureDemoStaffDirectoryUser(supabase, person, organizationId);
  const userId = user.id;
  if (!userId) throw new Error(`Missing auth user id for fake staff member ${person.email}.`);
  const directoryRole = resolveDirectoryRole(person);
  await upsertBy(supabase, "organization_memberships", { organization_id: organizationId, user_id: userId }, {
    organization_id: organizationId,
    user_id: userId,
    role: directoryRole,
    status: "active",
  }, `staff membership for ${person.email}`);
}

async function lookupDemoStaffAuthUserIds(supabase) {
  const userLookup = await Promise.all(DEMO_FACULTY_STAFF.map((person) => findAuthUserByEmail(supabase, person.email)));
  const ids = userLookup
    .filter(Boolean)
    .map((user) => String(user.id))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

async function deleteDemoStaffMemberships(supabase, organizationId, userIds) {
  if (!userIds.length) return 0;
  const { error, count } = await supabase
    .from("organization_memberships")
    .delete({ count: "exact" })
    .eq("organization_id", organizationId)
    .in("user_id", userIds);
  if (error) throw new Error(`Demo staff memberships reset failed: ${error.message}`);
  return count || 0;
}

async function findDemoOrganization(supabase) {
  return await selectOne(supabase, "organizations", { slug: DEMO_ORG.slug }) || await selectOne(supabase, "organizations", { name: DEMO_ORG.name });
}

async function deleteWhereIn(supabase, table, column, ids) {
  if (!ids.length) return 0;
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).in(column, ids);
  if (error) throw new Error(`${table} reset failed: ${error.message}`);
  return count || 0;
}

async function resetDemoData(supabase, organizationId) {
  const expectedEventNames = new Set(DEMO_EVENTS.map((event) => event.name));
  const expectedSpEmails = new Set(DEMO_SPS.map((sp) => sp.email.toLowerCase()));
  const { data: events, error: eventsError } = await supabase.from("events").select("id,name,notes").eq("organization_id", organizationId).limit(1000);
  if (eventsError) throw new Error(`events reset lookup failed: ${eventsError.message}`);
  const eventIds = (events || [])
    .filter((row) => String(row.notes || "").includes(DEMO_MARKER) || expectedEventNames.has(String(row.name || "")))
    .map((row) => row.id)
    .filter(Boolean);

  const { data: sps, error: spsError } = await supabase.from("sps").select("id,working_email,notes").eq("organization_id", organizationId).limit(1000);
  if (spsError) throw new Error(`SP reset lookup failed: ${spsError.message}`);
  const spIds = (sps || [])
    .filter((row) => String(row.notes || "").includes(DEMO_MARKER) || expectedSpEmails.has(String(row.working_email || "").toLowerCase()))
    .map((row) => row.id)
    .filter(Boolean);
  const demoStaffUserIds = await lookupDemoStaffAuthUserIds(supabase);

  const counts = {};
  counts.event_sp_attendance = await deleteWhereIn(supabase, "event_sp_attendance", "event_id", eventIds);
  counts.event_shift_responses = await deleteWhereIn(supabase, "event_shift_responses", "event_id", eventIds);
  counts.event_shift_openings = await deleteWhereIn(supabase, "event_shift_openings", "event_id", eventIds);
  counts.event_sps = await deleteWhereIn(supabase, "event_sps", "event_id", eventIds);
  counts.event_sessions = await deleteWhereIn(supabase, "event_sessions", "event_id", eventIds);
  counts.events = await deleteWhereIn(supabase, "events", "id", eventIds);
  counts.sp_communication_preferences = await deleteWhereIn(supabase, "sp_communication_preferences", "sp_id", spIds);
  counts.sps = await deleteWhereIn(supabase, "sps", "id", spIds);
  counts.organization_memberships = await deleteDemoStaffMemberships(supabase, organizationId, demoStaffUserIds);
  return counts;
}

async function verifyDemoSeed() {
  const env = getEnvironment();
  const supabase = createSeedClientOrExit(env, "Verify mode");
  const org = await findDemoOrganization(supabase);
  if (!org?.id) throw new Error("Keystone Simulation Alliance organization was not found.");
  const [{ count: eventCount, error: eventError }, { count: spCount, error: spError }] = await Promise.all([
    supabase.from("events").select("id", { count: "exact", head: true }).eq("organization_id", org.id).ilike("notes", `%${DEMO_MARKER}%`),
    supabase.from("sps").select("id", { count: "exact", head: true }).eq("organization_id", org.id).ilike("notes", `%${DEMO_MARKER}%`),
  ]);
  if (eventError) throw new Error(`event verify failed: ${eventError.message}`);
  if (spError) throw new Error(`SP verify failed: ${spError.message}`);
  console.log(`Keystone org id: ${org.id}`);
  console.log(`Demo events found: ${eventCount || 0}/${DEMO_EVENTS.length}`);
  console.log(`Demo SP profiles found: ${spCount || 0}/${DEMO_SPS.length}`);
  if ((eventCount || 0) < DEMO_EVENTS.length || (spCount || 0) < DEMO_SPS.length) process.exit(1);
}

async function seedDemoData(supabase) {
  const now = new Date().toISOString();
  const org = await upsertBy(supabase, "organizations", { slug: DEMO_ORG.slug }, DEMO_ORG, "demo organization");
  const organizationId = org.id;

  await upsertBy(supabase, "organization_communication_settings", { organization_id: organizationId }, {
    organization_id: organizationId,
    default_sp_communication_mode: "hybrid",
    allow_sp_portal: true,
    allow_email_workflow: true,
    allow_microsoft_forms_workflow: true,
    allow_manual_workflow: true,
    default_ms_forms_url: "https://forms.office.com/demo-keystone-fake",
    default_reply_to_email: "keystone.demo@example.com",
    sp_onboarding_message: "Demo only: Keystone Simulation Alliance supports portal, email, Microsoft Forms, and manual SP workflows.",
  }, "organization communication settings");

  for (const person of DEMO_FACULTY_STAFF) {
    await upsertDirectoryMembership(supabase, organizationId, person);
  }

  const spIds = new Map();
  for (const sp of DEMO_SPS) {
    const name = fullName(sp);
    const portalStatus = normalizeSpPortalStatus(sp.portal);
    const onboardingStatus = normalizeSpOnboardingStatus(sp.onboarding);
    const row = await upsertBy(supabase, "sps", { organization_id: organizationId, working_email: sp.email }, {
      organization_id: organizationId,
      first_name: sp.first_name,
      last_name: sp.last_name,
      full_name: name,
      working_email: sp.email,
      email: sp.email,
      phone: sp.portalTest ? null : "555-0100",
      status: "Active",
      notes: `${DEMO_MARKER}: fake SP profile for Keystone demo only. Tags: ${sp.tags}.`,
    }, `SP ${name}`);
    spIds.set(sp.key, row.id);
    await upsertBy(supabase, "sp_communication_preferences", { organization_id: organizationId, sp_id: row.id }, {
      organization_id: organizationId,
      sp_id: row.id,
      preferred_mode: sp.mode,
      portal_status: portalStatus,
      onboarding_status: onboardingStatus,
      last_invited_at: ["invited", "profile_ready", "ready_to_link"].includes(normalizeToken(sp.portal)) ? now : null,
      notes: `${DEMO_MARKER}: fake communication preference. ${sp.portalTest ? "Manual step: link this SP profile to the matching auth account email if needed." : ""}`,
    }, `communication preference for ${name}`);
  }

  const eventIds = new Map();
  for (const event of DEMO_EVENTS) {
    const row = await upsertBy(supabase, "events", { organization_id: organizationId, name: event.name }, {
      organization_id: organizationId,
      name: event.name,
      status: event.status,
      date_text: event.date_text,
      sp_needed: event.sp_needed,
      visibility: "team",
      location: event.location,
      notes: buildEventNotes(event),
    }, `event ${event.name}`);
    eventIds.set(event.key, row.id);

    const roundMinutes = Math.max(20, Math.floor(((Number(event.end_time.slice(0, 2)) * 60 + Number(event.end_time.slice(3))) - (Number(event.start_time.slice(0, 2)) * 60 + Number(event.start_time.slice(3)))) / event.roundCount));
    for (let round = 0; round < event.roundCount; round += 1) {
      for (let room = 1; room <= event.roomCount; room += 1) {
        const start = addMinutes(event.start_time, round * roundMinutes);
        const end = addMinutes(start, Math.max(15, roundMinutes - 5));
        await upsertBy(supabase, "event_sessions", { event_id: row.id, session_date: event.session_date, start_time: start, room: `Demo Room ${room}` }, {
          organization_id: organizationId,
          event_id: row.id,
          session_date: event.session_date,
          start_time: start,
          end_time: end,
          location: event.location,
          room: `Demo Room ${room}`,
        }, `session ${event.name} round ${round + 1} room ${room}`);
      }
    }
  }

  for (const assignment of ASSIGNMENTS) {
    const eventId = eventIds.get(assignment.event);
    const spId = spIds.get(assignment.sp);
    const eventSpStatus = normalizeEventSpStatus(assignment.status);
    await upsertBy(supabase, "event_sps", { event_id: eventId, sp_id: spId }, {
      organization_id: organizationId,
      event_id: eventId,
      sp_id: spId,
      status: eventSpStatus,
      assignment_status: assignment.status,
      role_name: assignment.status.includes("backup") ? "Backup SP" : "Primary SP",
      confirmed: assignment.confirmed,
      notes: `${DEMO_MARKER}: fake assignment for Keystone demo only.`,
    }, `assignment ${assignment.event}/${assignment.sp}`);
  }

  for (const event of DEMO_EVENTS) {
    const eventId = eventIds.get(event.key);
    await upsertBy(supabase, "event_shift_openings", { event_id: eventId, title: `${event.name} SP Coverage`, shift_date: event.session_date, start_time: event.start_time }, {
      organization_id: organizationId,
      event_id: eventId,
      title: `${event.name} SP Coverage`,
      shift_date: event.session_date,
      start_time: event.start_time,
      end_time: event.end_time,
      location: event.location,
      room: `${event.roomCount} demo rooms`,
      needed_count: event.sp_needed + event.backups,
      status: event.completed ? "closed" : "open",
      visibility: "portal_and_email",
      requirements: `${event.type}; ${event.training === "not_required" ? "training not required" : "training required"}`,
      notes: `${DEMO_MARKER}: fake poll/opening modeled after schedule room and rotation patterns.`,
      updated_at: now,
    }, `shift opening ${event.name}`);
  }

  for (const assignment of ASSIGNMENTS.filter((item) => ["completed", "confirmed_primary", "confirmed_backup"].includes(item.status))) {
    const eventId = eventIds.get(assignment.event);
    const spId = spIds.get(assignment.sp);
    const attendanceStatus = normalizeSpAttendanceStatus(assignment.status === "completed" ? "checked_out" : "not_arrived");
    await upsertBy(supabase, "event_sp_attendance", { event_id: eventId, sp_id: spId }, {
      event_id: eventId,
      sp_id: spId,
      status: attendanceStatus,
      notes: `${DEMO_MARKER}: fake attendance status for room operations demo.`,
      checked_in_at: assignment.status === "completed" ? `${DEMO_EVENTS.find((event) => event.key === assignment.event)?.session_date}T12:00:00.000Z` : null,
      checked_out_at: assignment.status === "completed" ? `${DEMO_EVENTS.find((event) => event.key === assignment.event)?.session_date}T15:30:00.000Z` : null,
      updated_at: now,
    }, `attendance ${assignment.event}/${assignment.sp}`);
  }

  return { organizationId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return showHelp();
  if ([args.write, args.reset, args.verify].filter(Boolean).length > 1) throw new Error("Choose only one of --write, --reset, or --verify.");

  const plan = buildPlan({ scheduleFile: args.scheduleFile, spFile: args.spFile });
  if (args.dryRun) {
    printPlan(plan);
    return;
  }

  const env = getEnvironment();
  if (args.verify) return verifyDemoSeed();
  assertWriteAllowed(env);
  const supabase = createSeedClientOrExit(env, args.reset ? "Reset mode" : "Write mode");

  const existingOrg = await findDemoOrganization(supabase);
  if (args.reset) {
    if (!existingOrg?.id) {
      console.log("Keystone Simulation Alliance does not exist; nothing to reset.");
      return;
    }
    const counts = await resetDemoData(supabase, existingOrg.id);
    console.log("Keystone demo reset complete. Deleted only seeder-owned demo rows:");
    Object.entries(counts).forEach(([table, count]) => console.log(`- ${table}: ${count}`));
    return;
  }

  const result = await seedDemoData(supabase);
  printPlan(plan, result.organizationId);
  console.log("\nDemo seed complete.");
  console.log(`Org name/id: ${DEMO_ORG.name} / ${result.organizationId}`);
  console.log(`Events created/upserted: ${DEMO_EVENTS.length}`);
  console.log(`SP profiles created/upserted: ${DEMO_SPS.length}`);
  console.log(`Test SP profiles: ${DEMO_SPS.filter((sp) => sp.portalTest).map((sp) => sp.email).join(", ")}`);
  console.log("Manual steps: create/link Supabase auth users for sp.demo1@conflictfreesp.com through sp.demo5@conflictfreesp.com only if portal login testing is needed.");
}

main().catch((error) => {
  console.error("Demo seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
