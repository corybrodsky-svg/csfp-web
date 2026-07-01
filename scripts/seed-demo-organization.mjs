import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const DEMO_MARKER = "CFSP_SANDBOX_FAKE_DATA";
const DEMO_ORG = {
  name: "CFSP Sandbox Simulation Center",
  slug: "cfsp-sandbox-simulation-center",
  type: "demo",
  status: "active",
};
const SANDBOX_ACCESS_CODE = {
  code: "CFSP-SANDBOX",
  label: `${DEMO_MARKER}: Shared external tester sandbox access code`,
  default_requested_role: "sim_ops",
  active: true,
  requires_manual_approval: true,
};
const DANIEL_TEST_OPERATOR = {
  key: "daniel-test-operator",
  role: "sim_lead",
  directoryRole: "sim_ops",
  label: "Daniel Test Operator",
  email: "daniel.tester@conflictfreesp.com",
  phone: "555-0220",
  guardedAuth: true,
};

const DEMO_FACULTY_STAFF = [
  { key: "maya-benton", role: "faculty", directoryRole: "faculty", label: "Dr. Maya Benton", email: "maya.benton@sandbox.invalid", phone: "555-0201" },
  { key: "elena-watkins", role: "faculty", directoryRole: "faculty", label: "Prof. Elena Watkins", email: "elena.watkins@sandbox.invalid", phone: "555-0202" },
  { key: "jordan-lee", role: "sim_lead", directoryRole: "sim_ops", label: "Jordan Lee", email: "jordan.lee@sandbox.invalid", phone: "555-0203" },
  { key: "casey-rivera", role: "sim_staff", directoryRole: "sim_ops", label: "Casey Rivera", email: "casey.rivera@sandbox.invalid", phone: "555-0204" },
  { key: "nina-patel", role: "faculty", directoryRole: "faculty", label: "Dr. Nina Patel", email: "nina.patel@sandbox.invalid", phone: "555-0205" },
  { key: "marcus-wright", role: "sim_lead", directoryRole: "sim_ops", label: "Marcus Wright", email: "marcus.wright@sandbox.invalid", phone: "555-0206" },
  { key: "sofia-nguyen", role: "sim_staff", directoryRole: "sim_ops", label: "Sofia Nguyen", email: "sofia.nguyen@sandbox.invalid", phone: "555-0207" },
  { key: "amelia-ross", role: "faculty", directoryRole: "faculty", label: "Dr. Amelia Ross", email: "amelia.ross@sandbox.invalid", phone: "555-0208" },
  { key: "owen-clark", role: "sim_staff", directoryRole: "sim_ops", label: "Owen Clark", email: "owen.clark@sandbox.invalid", phone: "555-0209" },
  { key: "tessa-morgan", role: "faculty", directoryRole: "faculty", label: "Tessa Morgan, MSN", email: "tessa.morgan@sandbox.invalid", phone: "555-0210" },
  { key: "rachel-kim", role: "faculty", directoryRole: "faculty", label: "Dr. Rachel Kim", email: "rachel.kim@sandbox.invalid", phone: "555-0211" },
  { key: "samir-desai", role: "sim_staff", directoryRole: "sim_ops", label: "Samir Desai", email: "samir.desai@sandbox.invalid", phone: "555-0212" },
  DANIEL_TEST_OPERATOR,
];

const DEMO_EVENT_STAFF_ASSIGNMENTS = {
  "chest-pain-osce": {
    faculty: "maya-benton",
    simLead: "jordan-lee",
    simStaff: "casey-rivera",
    trainingOwner: "faculty_led",
  },
  "discharge-planning": {
    faculty: "elena-watkins",
    simLead: "daniel-test-operator",
    simStaff: "sofia-nguyen",
    trainingOwner: "shared",
  },
  "behavioral-health": {
    faculty: "nina-patel",
    simLead: "marcus-wright",
    simStaff: "owen-clark",
    trainingOwner: "internal_sim",
  },
  "pediatric-asthma": {
    faculty: "amelia-ross",
    simLead: "jordan-lee",
    simStaff: "samir-desai",
    trainingOwner: "shared",
  },
  "med-rec-lab": {
    faculty: "tessa-morgan",
    simLead: "daniel-test-operator",
    simStaff: "casey-rivera",
    trainingOwner: "faculty_led",
  },
  "goals-of-care": {
    faculty: "rachel-kim",
    simLead: "jordan-lee",
    simStaff: "sofia-nguyen",
    trainingOwner: "shared",
  },
  "stroke-warning-signs": {
    faculty: "maya-benton",
    simLead: "daniel-test-operator",
    simStaff: "samir-desai",
    trainingOwner: "internal_sim",
  },
  "telehealth-followup": {
    faculty: "elena-watkins",
    simLead: "daniel-test-operator",
    simStaff: "owen-clark",
    trainingOwner: "shared",
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
  { key: "alex", first_name: "Alex", last_name: "Hart", email: "alex.hart@sandbox.invalid", mode: "portal", portal: "linked", onboarding: "complete", tags: "OSCE, chest pain, calm affect" },
  { key: "marisol", first_name: "Marisol", last_name: "Vega", email: "marisol.vega@sandbox.invalid", mode: "portal", portal: "linked", onboarding: "complete", tags: "Caregiver roles, discharge teaching" },
  { key: "devon", first_name: "Devon", last_name: "Reed", email: "devon.reed@sandbox.invalid", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Adult acute care, focused feedback" },
  { key: "jana", first_name: "Jana", last_name: "Morris", email: "jana.morris@sandbox.invalid", mode: "microsoft_forms", portal: "not_invited", onboarding: "not_started", tags: "Medication reconciliation, outpatient clinic" },
  { key: "omar", first_name: "Omar", last_name: "Chen", email: "omar.chen@sandbox.invalid", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Backup coverage, flexible availability" },
  { key: "priya-sp", first_name: "Priya", last_name: "Shah", email: "priya.shah.sp@sandbox.invalid", mode: "portal", portal: "invited", onboarding: "invited", tags: "IPE, caregiver communication" },
  { key: "eli", first_name: "Eli", last_name: "Walker", email: "eli.walker@sandbox.invalid", mode: "manual", portal: "not_invited", onboarding: "not_started", tags: "Behavioral health, de-escalation" },
  { key: "nora", first_name: "Nora", last_name: "Kim", email: "nora.kim@sandbox.invalid", mode: "portal", portal: "linked", onboarding: "complete", tags: "Telehealth, chronic disease follow-up" },
  { key: "simon", first_name: "Simon", last_name: "Brooks", email: "simon.brooks@sandbox.invalid", mode: "portal", portal: "linked", onboarding: "complete", tags: "Neurologic assessment, standardized cueing" },
  { key: "leah", first_name: "Leah", last_name: "Grant", email: "leah.grant@sandbox.invalid", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Pediatric caregiver, education checklist" },
  { key: "theo", first_name: "Theo", last_name: "Ortiz", email: "theo.ortiz@sandbox.invalid", mode: "microsoft_forms", portal: "not_invited", onboarding: "not_started", tags: "Agitated patient role, safety boundaries" },
  { key: "iris", first_name: "Iris", last_name: "Cole", email: "iris.cole@sandbox.invalid", mode: "portal", portal: "linked", onboarding: "complete", tags: "End-of-life communication, reflective feedback" },
  { key: "calvin", first_name: "Calvin", last_name: "Price", email: "calvin.price@sandbox.invalid", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Family member, goals of care" },
  { key: "june", first_name: "June", last_name: "Ellis", email: "june.ellis@sandbox.invalid", mode: "manual", portal: "needs_help", onboarding: "needs_help", tags: "Backup pool, phone confirmation" },
  { key: "robin", first_name: "Robin", last_name: "Miles", email: "robin.miles@sandbox.invalid", mode: "portal", portal: "invited", onboarding: "in_progress", tags: "Pediatrics, caregiver anxiety" },
  { key: "mila", first_name: "Mila", last_name: "Patel", email: "mila.patel@sandbox.invalid", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Medication education, teach-back" },
  { key: "andre", first_name: "Andre", last_name: "Coleman", email: "andre.coleman@sandbox.invalid", mode: "portal", portal: "linked", onboarding: "complete", tags: "Stroke warning signs, mobility limitations" },
  { key: "hana", first_name: "Hana", last_name: "Sato", email: "hana.sato@sandbox.invalid", mode: "portal", portal: "linked", onboarding: "complete", tags: "Neurologic assessment, aphasia cues" },
  { key: "jonah", first_name: "Jonah", last_name: "Reed", email: "jonah.reed@sandbox.invalid", mode: "email", portal: "not_invited", onboarding: "not_started", tags: "Day-of risk example, needs phone confirmation" },
  { key: "louisa", first_name: "Louisa", last_name: "Park", email: "louisa.park@sandbox.invalid", mode: "portal", portal: "linked", onboarding: "complete", tags: "Caregiver, discharge questions" },
  { key: "portal1", first_name: "Sandbox", last_name: "Portal One", email: "sp.demo1@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Cory-controlled SP portal test account", portalTest: true },
  { key: "portal2", first_name: "Sandbox", last_name: "Portal Two", email: "sp.demo2@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Cory-controlled SP portal test account", portalTest: true },
  { key: "portal3", first_name: "Sandbox", last_name: "Portal Three", email: "sp.demo3@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Cory-controlled SP portal test account", portalTest: true },
  { key: "portal4", first_name: "Sandbox", last_name: "Portal Four", email: "sp.demo4@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Cory-controlled SP portal test account", portalTest: true },
  { key: "portal5", first_name: "Sandbox", last_name: "Portal Five", email: "sp.demo5@conflictfreesp.com", mode: "portal", portal: "profile_ready", onboarding: "ready_to_link", tags: "Cory-controlled SP portal test account", portalTest: true },
];

const DEMO_EVENTS = [
  { key: "chest-pain-osce", scenario: "A. Complete OSCE staffing and materials readiness", name: "Acute Chest Pain Assessment OSCE", program: "Advanced Health Assessment", type: "OSCE", status: "Ready for final review", date_text: "07/15/2026", session_date: "2026-07-15", start_time: "08:30", end_time: "12:00", location: "Sandbox Clinical Skills Suite", roomNames: ["Exam Room 1", "Exam Room 2", "Exam Room 3", "Exam Room 4"], roomCount: 4, learnerCount: 32, studentsPerRoom: 8, roundCount: 4, sp_needed: 4, backups: 1, training: "required", scheduleComplete: true, materialsReadiness: "Ready", roomReadiness: "Ready", spConfirmationStatus: "4 confirmed, 1 backup confirmed", learnerFlowStatus: "Ready", missingCoverage: "None", atRiskCoverage: "None", recommendedAction: "Open the final readiness checklist and confirm faculty packet review before learner release.", communication: { sp_hiring_poll_email: "drafted", hire_confirmation_email: "drafted", availability_poll_closed_email: "ready_to_draft", prep_for_training_email: "drafted" } },
  { key: "discharge-planning", scenario: "B. IPE event with one backup still pending", name: "Interprofessional Discharge Planning Simulation", program: "Interprofessional Education", type: "IPE Simulation", status: "Staffing confirmation in progress", date_text: "07/16/2026", session_date: "2026-07-16", start_time: "13:00", end_time: "16:30", location: "Sandbox Inpatient Unit", roomNames: ["Room A", "Room B", "Room C", "Family Conference Room"], roomCount: 4, learnerCount: 40, studentsPerRoom: 10, roundCount: 4, sp_needed: 5, backups: 1, training: "required", scheduleComplete: true, materialsReadiness: "Ready", roomReadiness: "Ready", spConfirmationStatus: "5 confirmed, backup pending", learnerFlowStatus: "Ready", missingCoverage: "No primary gaps", atRiskCoverage: "Backup coverage not confirmed", recommendedAction: "Confirm backup availability and preview the discharge instruction email before sending.", communication: { sp_hiring_poll_email: "drafted", hire_confirmation_email: "ready_to_draft", availability_poll_closed_email: "ready_to_draft", prep_for_training_email: "drafted" } },
  { key: "behavioral-health", scenario: "C. Safety-sensitive behavioral health encounter", name: "Behavioral Health De-escalation Encounter", program: "Behavioral Health Nursing", type: "Simulation", status: "Safety briefing ready", date_text: "07/20/2026", session_date: "2026-07-20", start_time: "09:00", end_time: "11:45", location: "Sandbox Behavioral Health Suite", roomNames: ["Consult Room 1", "Consult Room 2", "Observation Room"], roomCount: 3, learnerCount: 24, studentsPerRoom: 8, roundCount: 3, sp_needed: 3, backups: 1, training: "required", scheduleComplete: true, materialsReadiness: "Ready", roomReadiness: "Ready", spConfirmationStatus: "3 confirmed, 1 backup confirmed", learnerFlowStatus: "Ready", missingCoverage: "None", atRiskCoverage: "Safety huddle must remain on the event-day checklist", recommendedAction: "Review safety boundaries and role-stop language during the prebrief.", communication: { sp_hiring_poll_email: "drafted", hire_confirmation_email: "drafted", availability_poll_closed_email: "not_needed", prep_for_training_email: "drafted" } },
  { key: "pediatric-asthma", scenario: "D. Pediatric OSCE with caregiver communication focus", name: "Pediatric Asthma Caregiver Communication OSCE", program: "Pediatric Nursing", type: "OSCE", status: "Materials review in progress", date_text: "07/21/2026", session_date: "2026-07-21", start_time: "10:00", end_time: "13:30", location: "Sandbox Pediatric Skills Lab", roomNames: ["Peds Room 1", "Peds Room 2", "Peds Room 3", "Peds Room 4"], roomCount: 4, learnerCount: 28, studentsPerRoom: 7, roundCount: 4, sp_needed: 4, backups: 1, training: "required", scheduleComplete: true, materialsReadiness: "Faculty guide in review", roomReadiness: "Ready", spConfirmationStatus: "4 confirmed", learnerFlowStatus: "Ready", missingCoverage: "Backup optional", atRiskCoverage: "Faculty guide review due before prep email", recommendedAction: "Finalize the caregiver cue sheet before releasing prep materials to SPs.", communication: { sp_hiring_poll_email: "drafted", hire_confirmation_email: "ready_to_draft", availability_poll_closed_email: "ready_to_draft", prep_for_training_email: "ready_to_draft" } },
  { key: "med-rec-lab", scenario: "E. Medication reconciliation lab with one primary gap", name: "Medication Reconciliation and Patient Education Lab", program: "Pharmacy Practice", type: "Skills Lab", status: "Coverage gap visible", date_text: "07/23/2026", session_date: "2026-07-23", start_time: "08:00", end_time: "11:30", location: "Sandbox Ambulatory Care Clinic", roomNames: ["Clinic Room 1", "Clinic Room 2", "Clinic Room 3", "Clinic Room 4"], roomCount: 4, learnerCount: 36, studentsPerRoom: 9, roundCount: 4, sp_needed: 4, backups: 1, training: "optional", scheduleComplete: false, materialsReadiness: "Medication list ready", roomReadiness: "Ready", spConfirmationStatus: "3 confirmed, 1 pending", learnerFlowStatus: "Schedule preview needed", missingCoverage: "1 primary SP", atRiskCoverage: "Room 4 needs assigned SP", recommendedAction: "Assign one additional SP before publishing the schedule preview.", communication: { sp_hiring_poll_email: "drafted", hire_confirmation_email: "ready_to_draft", availability_poll_closed_email: "ready_to_draft", prep_for_training_email: "not_needed" } },
  { key: "goals-of-care", scenario: "F. Communication-intensive case with complete staffing", name: "End-of-Life Goals of Care Conversation", program: "Graduate Nursing", type: "Communication Simulation", status: "Ready for facilitator review", date_text: "07/28/2026", session_date: "2026-07-28", start_time: "13:30", end_time: "16:30", location: "Sandbox Communication Lab", roomNames: ["Consult Room A", "Consult Room B", "Consult Room C"], roomCount: 3, learnerCount: 18, studentsPerRoom: 6, roundCount: 3, sp_needed: 3, backups: 1, training: "required", scheduleComplete: true, materialsReadiness: "Ready", roomReadiness: "Ready", spConfirmationStatus: "3 confirmed, 1 backup confirmed", learnerFlowStatus: "Ready", missingCoverage: "None", atRiskCoverage: "None", recommendedAction: "Review facilitator prompts and confirm debrief room setup.", communication: { sp_hiring_poll_email: "drafted", hire_confirmation_email: "drafted", availability_poll_closed_email: "not_needed", prep_for_training_email: "drafted" } },
  { key: "stroke-warning-signs", scenario: "Showcase. Day-of Event Command Center with realistic readiness risks", name: "Neurologic Assessment: Stroke Warning Signs", program: "Adult Health Nursing", type: "Simulation", status: "Day-of readiness at risk", date_text: "07/30/2026", session_date: "2026-07-30", start_time: "08:00", end_time: "12:00", location: "Sandbox Neuro Skills Unit", roomNames: ["Neuro Room 1", "Neuro Room 2", "Neuro Room 3", "Room 4 - Stroke Response"], roomCount: 4, learnerCount: 32, studentsPerRoom: 8, roundCount: 4, sp_needed: 5, backups: 1, training: "required", scheduleComplete: true, materialsReadiness: "Faculty guide pending final review", roomReadiness: "Room 4 not ready", spConfirmationStatus: "5 confirmed, 1 not checked in, 1 backup arrived", learnerFlowStatus: "At risk", missingCoverage: "None assigned, but 1 primary SP is not checked in", atRiskCoverage: "Room 4 coverage and learner flow depend on backup decision", recommendedAction: "Most urgent: contact the not-arrived SP, prepare the backup for Room 4, and dispatch Sim Ops to finish Room 4 before learner release.", showcase: true, communication: { sp_hiring_poll_email: "drafted", hire_confirmation_email: "drafted", availability_poll_closed_email: "ready_to_draft", prep_for_training_email: "drafted" } },
  { key: "telehealth-followup", scenario: "H. Virtual follow-up event with communications preview", name: "Telehealth Follow-Up Visit Simulation", program: "Primary Care Telehealth", type: "Virtual Simulation", status: "Portal communications preview ready", date_text: "08/04/2026", session_date: "2026-08-04", start_time: "14:00", end_time: "16:30", location: "Sandbox Telehealth Studio", roomNames: ["Virtual Room 1", "Virtual Room 2", "Virtual Room 3"], roomCount: 3, learnerCount: 18, studentsPerRoom: 6, roundCount: 3, sp_needed: 3, backups: 1, training: "required", scheduleComplete: true, materialsReadiness: "Ready", roomReadiness: "Virtual links ready", spConfirmationStatus: "3 confirmed", learnerFlowStatus: "Ready", missingCoverage: "None", atRiskCoverage: "Confirm backup for virtual access fallback", recommendedAction: "Preview SP telehealth instructions and confirm virtual access details remain test-safe.", communication: { sp_hiring_poll_email: "drafted", hire_confirmation_email: "drafted", availability_poll_closed_email: "not_needed", prep_for_training_email: "drafted" } },
];

const ASSIGNMENTS = [
  { event: "chest-pain-osce", sp: "alex", status: "confirmed_primary", confirmed: true },
  { event: "chest-pain-osce", sp: "marisol", status: "confirmed_primary", confirmed: true },
  { event: "chest-pain-osce", sp: "devon", status: "confirmed_primary", confirmed: true },
  { event: "chest-pain-osce", sp: "jana", status: "confirmed_primary", confirmed: true },
  { event: "chest-pain-osce", sp: "omar", status: "confirmed_backup", confirmed: true },
  { event: "discharge-planning", sp: "priya-sp", status: "confirmed_primary", confirmed: true },
  { event: "discharge-planning", sp: "eli", status: "confirmed_primary", confirmed: true },
  { event: "discharge-planning", sp: "nora", status: "confirmed_primary", confirmed: true },
  { event: "discharge-planning", sp: "simon", status: "confirmed_primary", confirmed: true },
  { event: "discharge-planning", sp: "leah", status: "confirmed_primary", confirmed: true },
  { event: "discharge-planning", sp: "june", status: "manual_follow_up", confirmed: false },
  { event: "behavioral-health", sp: "theo", status: "confirmed_primary", confirmed: true },
  { event: "behavioral-health", sp: "iris", status: "confirmed_primary", confirmed: true },
  { event: "behavioral-health", sp: "calvin", status: "confirmed_primary", confirmed: true },
  { event: "behavioral-health", sp: "june", status: "confirmed_backup", confirmed: true },
  { event: "pediatric-asthma", sp: "robin", status: "confirmed_primary", confirmed: true },
  { event: "pediatric-asthma", sp: "mila", status: "confirmed_primary", confirmed: true },
  { event: "pediatric-asthma", sp: "andre", status: "confirmed_primary", confirmed: true },
  { event: "pediatric-asthma", sp: "portal2", status: "confirmed_primary", confirmed: true },
  { event: "med-rec-lab", sp: "alex", status: "confirmed_primary", confirmed: true },
  { event: "med-rec-lab", sp: "leah", status: "confirmed_primary", confirmed: true },
  { event: "med-rec-lab", sp: "priya-sp", status: "confirmed_primary", confirmed: true },
  { event: "med-rec-lab", sp: "omar", status: "contacted", confirmed: false },
  { event: "goals-of-care", sp: "iris", status: "confirmed_primary", confirmed: true },
  { event: "goals-of-care", sp: "calvin", status: "confirmed_primary", confirmed: true },
  { event: "goals-of-care", sp: "marisol", status: "confirmed_primary", confirmed: true },
  { event: "goals-of-care", sp: "devon", status: "confirmed_backup", confirmed: true },
  { event: "stroke-warning-signs", sp: "portal1", status: "confirmed_primary", confirmed: true, attendance: "checked_in" },
  { event: "stroke-warning-signs", sp: "hana", status: "confirmed_primary", confirmed: true, attendance: "checked_in" },
  { event: "stroke-warning-signs", sp: "jonah", status: "confirmed_primary", confirmed: true, attendance: "not_arrived" },
  { event: "stroke-warning-signs", sp: "louisa", status: "confirmed_primary", confirmed: true, attendance: "checked_in" },
  { event: "stroke-warning-signs", sp: "andre", status: "confirmed_primary", confirmed: true, attendance: "checked_in" },
  { event: "stroke-warning-signs", sp: "june", status: "confirmed_backup", confirmed: true, attendance: "arrived" },
  { event: "telehealth-followup", sp: "portal3", status: "confirmed_primary", confirmed: true },
  { event: "telehealth-followup", sp: "simon", status: "confirmed_primary", confirmed: true },
  { event: "telehealth-followup", sp: "nora", status: "confirmed_primary", confirmed: true },
  { event: "telehealth-followup", sp: "omar", status: "confirmed_backup", confirmed: true },
];

const PRIMARY_DEMO_ASSIGNMENT_DETAILS = {
  "stroke-warning-signs:portal1": { role: "SP - facial droop and speech change", caseName: "FAST warning signs" },
  "stroke-warning-signs:hana": { role: "SP - arm weakness progression", caseName: "Stroke symptom escalation" },
  "stroke-warning-signs:jonah": { role: "SP - time-last-known-well history", caseName: "Delayed presentation" },
  "stroke-warning-signs:louisa": { role: "Caregiver - medication and timeline collateral", caseName: "Caregiver history" },
  "stroke-warning-signs:andre": { role: "SP - gait change and dizziness", caseName: "Posterior circulation warning signs" },
  "stroke-warning-signs:june": { role: "Backup SP - Room 4 coverage", caseName: "Backup stroke response case" },
};

function assignmentDetail(assignment) {
  return PRIMARY_DEMO_ASSIGNMENT_DETAILS[`${assignment.event}:${assignment.sp}`] || null;
}

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
  const args = { dryRun: false, write: false, reset: false, verify: false, help: false, scheduleFile: "", spFile: "", createDanielAuth: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--write") args.write = true;
    else if (arg === "--reset") args.reset = true;
    else if (arg === "--verify") args.verify = true;
    else if (arg === "--create-daniel-auth") args.createDanielAuth = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--schedule-file=")) args.scheduleFile = arg.slice("--schedule-file=".length);
    else if (arg.startsWith("--sp-file=")) args.spFile = arg.slice("--sp-file=".length);
  }
  if (!args.write && !args.reset && !args.verify) args.dryRun = true;
  return args;
}

function showHelp() {
  console.log(`CFSP sandbox org seeder\n\nUsage:\n  npm run seed:demo-org -- --dry-run\n  CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run seed:demo-org -- --write\n  CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD="..." npm run seed:demo-org -- --write --create-daniel-auth\n  CFSP_ALLOW_DEMO_SEED=true CFSP_DEMO_SEED_TARGET=dev npm run seed:demo-org -- --reset\n  npm run seed:demo-org -- --verify\n\nOptional structure-model files:\n  --schedule-file="Summer Schedule 2026(2).xlsx"\n  --sp-file="ACTIVE SP HIRING.xlsx"\n\nTester auth:\n  --create-daniel-auth creates/updates ${DANIEL_TEST_OPERATOR.email} with a temporary sandbox password from CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD and sim_ops membership.\n  Without that flag, Daniel remains visible in event owner/staff data and any existing Daniel auth user is linked, but a new login is not created.\n\nThe workbook reader reports only structure/counts and never imports names, emails, phones, faculty, learners, or SP identities.`);
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

function contactTypeFromDirectoryRole(directoryRole) {
  if (directoryRole === "faculty") return "faculty";
  if (directoryRole === "sim_ops" || directoryRole === "org_admin" || directoryRole === "platform_owner") return "sim_ops";
  return "staff";
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
  return JSON.stringify(statuses || {});
}

function getRoomNames(event) {
  return Array.isArray(event.roomNames) && event.roomNames.length
    ? event.roomNames
    : Array.from({ length: event.roomCount }, (_, index) => `Simulation Room ${index + 1}`);
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
      rooms: getRoomNames(event),
      rounds: event.roundCount,
      learners: event.learnerCount,
      studentsPerRoom: event.studentsPerRoom,
    }],
  });
}

function isShowcaseEvent(event) {
  return event.key === "stroke-warning-signs";
}

function buildShowcaseCaseFilesJson() {
  return JSON.stringify([
    {
      name: "Stroke Warning Signs - SP Case Brief",
      url: "https://example.com/cfsp-sandbox/stroke-warning-signs-sp-case-brief.pdf",
      status: "active",
    },
    {
      name: "Stroke Warning Signs - Faculty Guide",
      url: "https://example.com/cfsp-sandbox/stroke-warning-signs-faculty-guide.pdf",
      status: "pending_final_review",
    },
    {
      name: "Stroke Warning Signs - Learner Flow Preview",
      url: "https://example.com/cfsp-sandbox/stroke-warning-signs-learner-flow-preview.pdf",
      status: "active",
    },
    {
      name: "Stroke Warning Signs - Room 4 Setup Checklist",
      url: "https://example.com/cfsp-sandbox/stroke-warning-signs-room-4-setup.pdf",
      status: "active",
    },
  ]);
}

function buildEventNotes(event) {
  const contacts = resolveEventTeamContacts(event);
  const facultyProgram = event.program || inferCoursePrefixFromEventName(event.name);
  const trainingDate = event.training === "not_required" ? "" : event.session_date;
  const showcaseEvent = isShowcaseEvent(event);
  const roomNames = getRoomNames(event);
  const operationalSummary = [
    `Program: ${facultyProgram}`,
    `Event type: ${event.type}`,
    `Rooms/stations: ${roomNames.join(", ")}`,
    `SP need: ${event.sp_needed} primary${event.sp_needed === 1 ? "" : " SPs"}${event.backups ? ` + ${event.backups} backup${event.backups === 1 ? "" : "s"}` : ""}`,
    `Assigned SP coverage: ${event.spConfirmationStatus}`,
    `Missing/at-risk coverage: ${event.missingCoverage}; ${event.atRiskCoverage}`,
    `Faculty/educator owner: ${contacts.faculty?.label || ""}`,
    `Sim operations owner: ${contacts.simLead?.label || ""}`,
    `Materials readiness: ${event.materialsReadiness}`,
    `Room readiness: ${event.roomReadiness}`,
    `Learner flow status: ${event.learnerFlowStatus}`,
    `Recommended next action: ${event.recommendedAction}`,
  ];
  const lines = [
    "[CFSP_TRAINING_METADATA]",
    `canonical_event_type: simulation`,
    `modality: ${event.type.includes("Virtual") || event.name.includes("Telehealth") ? "Virtual" : "In person"}`,
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
    `case_fixed_rooms: ${roomNames.join(", ")}`,
    `event_session_date: ${event.session_date}`,
    `event_start_time: ${event.start_time}`,
    `event_end_time: ${event.end_time}`,
    `training_required: ${event.training === "not_required" ? "no" : "yes"}`,
    `training_ownership: ${event.training === "not_required" ? "" : contacts.trainingOwner}`,
    `training_date: ${trainingDate}`,
    `training_start_time: ${event.training === "not_required" ? "" : "15:00"}`,
    `training_end_time: ${event.training === "not_required" ? "" : "16:00"}`,
    `training_zoom_required: ${event.type.includes("Virtual") || event.name.includes("Telehealth") ? "yes" : "no"}`,
    `training_zoom_link: ${showcaseEvent ? "https://example.com/cfsp-sandbox/stroke-warning-signs-sp-training" : ""}`,
    `training_password: ${showcaseEvent ? "SandboxOnly2026" : ""}`,
    `training_recording_planned: ${event.training === "required" ? "yes" : "no"}`,
    `training_scheduling_status: ${event.training === "not_required" ? "not_required" : "scheduled"}`,
    `training_notes: ${showcaseEvent ? "Day-of focus: stroke warning sign cues, time-last-known-well history, Room 4 setup, and backup SP handoff if the not-arrived SP remains unavailable." : `Sandbox readiness note: ${event.recommendedAction}`}`,
    `faculty_availability_unknown: no`,
    `backups_required: yes`,
    `backup_count: ${event.backups}`,
    `staffing_status: ${event.status}`,
    `email_status: preview_only`,
    `communications_status: ${buildCommunicationStatuses(event.communication)}`,
    `communication_recipient_verifications: Sandbox preview only. Seeded contacts use .invalid addresses or Cory-controlled portal aliases; do not send bulk email without explicit enablement.`,
    `sp_poll_builder_state: draft`,
    `hiring_email_drafted_at: ${event.communication?.sp_hiring_poll_email === "drafted" ? `${event.session_date}T12:00:00.000Z` : ""}`,
    `hiring_email_sent_at: `,
    `confirmation_email_drafted_at: ${["drafted", "sent", "completed"].includes(event.communication?.hire_confirmation_email) ? `${event.session_date}T13:00:00.000Z` : ""}`,
    `confirmation_email_sent_at: `,
    `schedule_status: ${event.scheduleComplete ? "complete" : "preview"}`,
    `schedule_completed_at: ${event.scheduleComplete ? `${event.session_date}T18:00:00.000Z` : ""}`,
    `schedule_builder_snapshot: ${buildScheduleBuilderSnapshot(event)}`,
    `schedule_preview_enabled_for_sps: ${showcaseEvent ? "yes" : "preview"}`,
    `schedule_room_adjustments: ${event.roomReadiness}`,
    `live_room_adjustments: ${event.roomReadiness}`,
    `live_learner_attendance: ${event.learnerFlowStatus}`,
    `live_flow_status: ${event.learnerFlowStatus}`,
    `sp_report_call_time: ${showcaseEvent ? "07:15" : ""}`,
    `sp_release_end_time: ${showcaseEvent ? "12:15" : ""}`,
    `sp_portal_arrival_instructions: ${showcaseEvent ? "Report to the Sandbox Neuro Skills Unit check-in desk by 7:15 AM. Room and case details remain test-safe and fictional." : ""}`,
    `sp_portal_training_instructions: ${showcaseEvent ? "Review the stroke warning signs case brief, role/case note, and learner flow preview before arrival." : ""}`,
    `sp_portal_event_note: ${showcaseEvent ? "Showcase event: realistic day-of readiness risks include one SP not checked in, Room 4 not ready, faculty guide pending final review, and learner flow at risk." : ""}`,
    `sp_portal_role_case_note: ${showcaseEvent ? "Role/case details are assigned by the simulation team. Use this portal preview for testing only." : ""}`,
    `sp_portal_release_arrival_instructions: ${showcaseEvent ? "yes" : ""}`,
    `sp_portal_release_location: ${showcaseEvent ? "yes" : ""}`,
    `sp_portal_release_virtual_access: ${showcaseEvent ? "no" : ""}`,
    `sp_portal_release_training_details: ${showcaseEvent ? "yes" : ""}`,
    `sp_portal_release_role_case: ${showcaseEvent ? "yes" : ""}`,
    `sp_portal_release_case_files: ${showcaseEvent ? "yes" : ""}`,
    `sp_portal_release_training_materials: ${showcaseEvent ? "yes" : ""}`,
    `event_material_status: ${event.materialsReadiness}`,
    `case_name: ${showcaseEvent ? "Neurologic Assessment: Stroke Warning Signs" : event.name}`,
    `case_file_name: ${showcaseEvent ? "Stroke Warning Signs - SP Case Brief" : ""}`,
    `case_file_url: ${showcaseEvent ? "https://example.com/cfsp-sandbox/stroke-warning-signs-sp-case-brief.pdf" : ""}`,
    `case_manager_cases: ${showcaseEvent ? buildShowcaseCaseFilesJson() : ""}`,
    `supplemental_doc_name: ${showcaseEvent ? "Stroke Warning Signs - Learner Flow Preview" : ""}`,
    `supplemental_doc_url: ${showcaseEvent ? "https://example.com/cfsp-sandbox/stroke-warning-signs-learner-flow-preview.pdf" : ""}`,
    `faculty_schedule_file_url: https://example.com/cfsp-sandbox/${event.key}-faculty-schedule.pdf`,
    `student_roster_file_url: https://example.com/cfsp-sandbox/${event.key}-learner-roster.pdf`,
    `readiness_checklist_note: ${event.recommendedAction}`,
    `workflow_manual_checks: ${operationalSummary.join(" | ")}`,
    `Course Faculty: ${contacts.faculty?.label || ""}`,
    `Faculty Email: ${contacts.faculty?.email || ""}`,
    `Sim Staff: ${contacts.simStaff?.label || ""}`,
    `Event Lead/Team: ${contacts.simLead?.label || ""}`,
    "[/CFSP_TRAINING_METADATA]",
    `${DEMO_MARKER}: fake shared sandbox simulation event. No real PHI, student records, SP records, institution names, or patient data were imported.`,
    `Demo scenario: ${event.scenario}`,
    "Sandbox operations summary:",
    ...operationalSummary,
    "Communication safety: seeded contacts use .invalid addresses or Cory-controlled aliases; the seed does not send email or create bulk outbound jobs.",
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
    staffDirectorySource: options.createDanielAuth
      ? "auth users + organization_memberships; Daniel tester auth will be created/updated"
      : "auth users + organization_memberships; Daniel tester auth is guarded unless --create-daniel-auth is used",
    sessions: DEMO_EVENTS.reduce((sum, event) => sum + event.roomCount * event.roundCount, 0),
    workflowStates: DEMO_EVENTS.map((event) => event.scenario),
    workbookModels: {
      schedule: workbookStructureSummary(schedulePath),
      spHiring: workbookStructureSummary(spPath),
    },
  };
}

function printPlan(plan, organizationId = "not looked up in dry run") {
  console.log("CFSP sandbox seed plan");
  console.log(`Target org: ${plan.org.name}`);
  console.log(`Target org id: ${organizationId}`);
  console.log(`Sandbox access code: ${SANDBOX_ACCESS_CODE.code} (default requested role: ${SANDBOX_ACCESS_CODE.default_requested_role}; manual approval required)`);
  console.log(`Events to create/upsert: ${plan.events.length}`);
  console.log(`Fake faculty/staff profiles to create/upsert: ${plan.facultyStaff.length}`);
  console.log(`Staff directory source: ${plan.staffDirectorySource}`);
  console.log(`Fake staff directory rows to create/upsert: ${plan.facultyStaff.length}`);
  console.log(`Daniel tester/operator: ${DANIEL_TEST_OPERATOR.label} (${DANIEL_TEST_OPERATOR.email}) as sim_ops; auth creation guarded by --create-daniel-auth`);
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

function isMissingColumnMessage(error, columnName) {
  const text = String(error?.message || error || "").toLowerCase();
  const column = String(columnName || "").toLowerCase();
  return text.includes(column) && (text.includes("column") || text.includes("schema cache") || text.includes("could not find") || text.includes("does not exist"));
}

function normalizeMembershipRole(role) {
  const normalized = String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "platform_owner" || normalized === "owner" || normalized === "super_admin") return "platform_owner";
  if (normalized === "org_admin" || normalized === "organization_admin" || normalized === "admin") return "org_admin";
  if (normalized === "sim_ops" || normalized === "sim_op") return "sim_ops";
  if (normalized === "faculty") return "faculty";
  if (normalized === "sp") return "sp";
  return "viewer";
}

function roleRank(role) {
  const normalized = normalizeMembershipRole(role);
  if (normalized === "platform_owner") return 5;
  if (normalized === "org_admin") return 4;
  if (normalized === "sim_ops") return 3;
  if (normalized === "faculty") return 2;
  if (normalized === "sp") return 1;
  return 0;
}

function higherDirectoryRole(a, b) {
  return roleRank(a) >= roleRank(b) ? normalizeMembershipRole(a) : normalizeMembershipRole(b);
}

async function selectMembershipWithOptionalSpId(supabase, filters) {
  const run = async (select) => {
    let query = supabase.from("organization_memberships").select(select).limit(1);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    return await query.maybeSingle();
  };
  let result = await run("id,organization_id,user_id,sp_id,role,status,approved_at,created_at");
  if (result.error && isMissingColumnMessage(result.error, "sp_id")) {
    result = await run("id,organization_id,user_id,role,status,approved_at,created_at");
  }
  if (result.error) throw new Error(`organization_memberships lookup failed: ${result.error.message}`);
  return result.data || null;
}

async function upsertMembershipWithOptionalSpId(supabase, filters, payload, label) {
  const existing = await selectMembershipWithOptionalSpId(supabase, filters);
  const run = async (nextPayload) => {
    return existing?.id
      ? await supabase.from("organization_memberships").update(nextPayload).eq("id", existing.id).select("id").single()
      : await supabase.from("organization_memberships").insert(nextPayload).select("id").single();
  };
  let result = await run(payload);
  if (result.error && isMissingColumnMessage(result.error, "sp_id")) {
    const fallback = { ...payload };
    delete fallback.sp_id;
    result = await run(fallback);
  }
  if (result.error) throw new Error(`${label} upsert failed: ${result.error.message}`);
  return result.data;
}

async function upsertProfileWithOptionalColumns(supabase, user, person) {
  if (!user?.id) return;
  const directoryRole = resolveDirectoryRole(person);
  const profileRole = metadataRoleFromDirectoryRole(directoryRole);
  const fullName = person.label || "";
  const basePayload = {
    id: user.id,
    full_name: fullName,
    schedule_name: fullName,
    email: person.email,
    role: profileRole,
    is_active: true,
  };
  let payload = { ...basePayload };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase.from("profiles").upsert(payload, { onConflict: "id" }).select("id").maybeSingle();
    if (!result.error) return;
    if (isMissingColumnMessage(result.error, "schedule_name")) {
      delete payload.schedule_name;
      continue;
    }
    if (/relation .*profiles|table .*profiles|pgrst205|42p01/i.test(result.error.message || "")) return;
    throw new Error(`Profile upsert failed for ${person.email}: ${result.error.message}`);
  }
}

async function upsertSandboxStaffContact(supabase, organizationId, person) {
  const directoryRole = resolveDirectoryRole(person);
  const email = String(person.email || "").trim().toLowerCase();
  if (!organizationId || !email) return { skipped: true };

  const payload = {
    organization_id: organizationId,
    full_name: person.label || email,
    email,
    normalized_email: email,
    contact_type: contactTypeFromDirectoryRole(directoryRole),
    role_metadata: {
      role: directoryRole,
      sandbox_key: person.key || null,
      source: "sandbox_manager",
    },
    source_event_id: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("organization_contacts")
    .upsert(payload, { onConflict: "organization_id,normalized_email" });
  if (error && /organization_contacts|relation .* does not exist|schema cache|pgrst205|42p01/i.test(error.message || "")) {
    return { skipped: true };
  }
  if (error) throw new Error(`Staff contact upsert failed for ${person.email}: ${error.message}`);
  return { skipped: false };
}

function getDanielTemporaryPassword(options = {}) {
  return String(options.danielTempPassword || process.env.CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD || "").trim();
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

async function ensureDemoStaffDirectoryUser(supabase, person, organizationId, options = {}) {
  const directoryRole = resolveDirectoryRole(person);
  const metadataRole = metadataRoleFromDirectoryRole(directoryRole);
  const fullName = person.label || "";
  const existingUser = await findAuthUserByEmail(supabase, person.email);
  if (!existingUser && person.guardedAuth && !options.createDanielAuth) return null;
  const guardedPassword = person.guardedAuth ? getDanielTemporaryPassword(options) : "";
  if (!existingUser && person.guardedAuth && !guardedPassword) {
    throw new Error(`Refusing to create ${person.email} without CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD.`);
  }

  if (!existingUser) {
    const result = await supabase.auth.admin.createUser({
      email: person.email,
      password: guardedPassword || DEMO_STAFF_DIRECTORY_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        schedule_name: fullName,
        role: metadataRole,
        organization_id: organizationId,
        sandbox: true,
        source: "seed-demo-organization",
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
        sandbox: true,
        source: "seed-demo-organization",
      },
    });
    if (updateResult.error) throw new Error(`Could not update directory user ${person.email}: ${updateResult.error.message}`);
  }

  return existingUser;
}

async function upsertDirectoryMembership(supabase, organizationId, person, options = {}) {
  const user = await ensureDemoStaffDirectoryUser(supabase, person, organizationId, options);
  if (!user?.id) return null;
  const userId = user.id;
  const directoryRole = resolveDirectoryRole(person);
  await upsertMembershipWithOptionalSpId(supabase, { organization_id: organizationId, user_id: userId }, {
    organization_id: organizationId,
    user_id: userId,
    role: directoryRole,
    status: "active",
    approved_at: new Date().toISOString(),
  }, `staff membership for ${person.email}`);
  await upsertProfileWithOptionalColumns(supabase, user, person);
  return user;
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

function sortOrganizationsForCanonicalChoice(rows) {
  return [...rows].sort((a, b) => {
    const aHasSlug = a.slug === DEMO_ORG.slug ? 0 : 1;
    const bHasSlug = b.slug === DEMO_ORG.slug ? 0 : 1;
    if (aHasSlug !== bHasSlug) return aHasSlug - bHasSlug;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
}

async function findSandboxOrganizations(supabase) {
  const columns = "id,name,slug,type,status,created_at";
  const [slugResult, nameResult] = await Promise.all([
    supabase.from("organizations").select(columns).eq("slug", DEMO_ORG.slug).limit(20),
    supabase.from("organizations").select(columns).eq("name", DEMO_ORG.name).limit(20),
  ]);
  if (slugResult.error) throw new Error(`Sandbox organization slug lookup failed: ${slugResult.error.message}`);
  if (nameResult.error) throw new Error(`Sandbox organization name lookup failed: ${nameResult.error.message}`);
  const byId = new Map();
  for (const row of [...(slugResult.data || []), ...(nameResult.data || [])]) {
    if (row?.id) byId.set(row.id, row);
  }
  return sortOrganizationsForCanonicalChoice(Array.from(byId.values()));
}

async function ensureCanonicalSandboxOrganization(supabase) {
  const existing = await findSandboxOrganizations(supabase);
  if (!existing.length) {
    const { data, error } = await supabase.from("organizations").insert(DEMO_ORG).select("id,name,slug,type,status,created_at").single();
    if (error) throw new Error(`demo organization insert failed: ${error.message}`);
    return { organization: data, duplicateIds: [] };
  }

  const canonical = existing[0];
  const { data, error } = await supabase
    .from("organizations")
    .update(DEMO_ORG)
    .eq("id", canonical.id)
    .select("id,name,slug,type,status,created_at")
    .single();
  if (error) throw new Error(`demo organization canonical update failed: ${error.message}`);

  return {
    organization: data,
    duplicateIds: existing.map((row) => row.id).filter((id) => id && id !== canonical.id),
  };
}

async function migrateDuplicateSandboxMemberships(supabase, organizationId, duplicateIds) {
  if (!duplicateIds.length) return 0;
  let query = supabase
    .from("organization_memberships")
    .select("id,organization_id,user_id,sp_id,role,status,approved_at,created_at")
    .in("organization_id", duplicateIds);
  let result = await query;
  if (result.error && isMissingColumnMessage(result.error, "sp_id")) {
    result = await supabase
      .from("organization_memberships")
      .select("id,organization_id,user_id,role,status,approved_at,created_at")
      .in("organization_id", duplicateIds);
  }
  if (result.error) throw new Error(`duplicate sandbox membership lookup failed: ${result.error.message}`);

  let moved = 0;
  for (const membership of result.data || []) {
    const userId = String(membership.user_id || "");
    if (!userId) continue;
    const existing = await selectMembershipWithOptionalSpId(supabase, { organization_id: organizationId, user_id: userId });
    const nextRole = existing?.role ? higherDirectoryRole(existing.role, membership.role) : normalizeMembershipRole(membership.role);
    await upsertMembershipWithOptionalSpId(supabase, { organization_id: organizationId, user_id: userId }, {
      organization_id: organizationId,
      user_id: userId,
      sp_id: membership.sp_id || existing?.sp_id || null,
      role: nextRole,
      status: existing?.status === "active" || membership.status === "active" ? "active" : (membership.status || existing?.status || "active"),
      approved_at: existing?.approved_at || membership.approved_at || new Date().toISOString(),
    }, `merged sandbox membership for ${userId}`);
    const deleteResult = await supabase.from("organization_memberships").delete().eq("id", membership.id);
    if (deleteResult.error) throw new Error(`duplicate sandbox membership cleanup failed: ${deleteResult.error.message}`);
    moved += 1;
  }
  return moved;
}

async function migrateDuplicateSandboxAccessRequests(supabase, organizationId, duplicateIds) {
  if (!duplicateIds.length) return 0;
  const { data, error } = await supabase
    .from("access_requests")
    .update({ organization_id: organizationId })
    .in("organization_id", duplicateIds)
    .select("id");
  if (error) {
    if (/relation .*access_requests|table .*access_requests|pgrst205|42p01/i.test(error.message || "")) return 0;
    throw new Error(`duplicate sandbox access request migration failed: ${error.message}`);
  }
  return data?.length || 0;
}

async function retireDuplicateSandboxOrganizations(supabase, duplicateIds) {
  if (!duplicateIds.length) return 0;
  const { data, error } = await supabase
    .from("organizations")
    .update({ type: "demo", status: "inactive" })
    .in("id", duplicateIds)
    .select("id");
  if (error) throw new Error(`duplicate sandbox organization retirement failed: ${error.message}`);
  return data?.length || 0;
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
  if (!org?.id) throw new Error("CFSP Sandbox Simulation Center organization was not found.");
  const expectedEventNames = DEMO_EVENTS.map((event) => event.name);
  const [{ data: eventRows, error: eventError }, { count: spCount, error: spError }, sandboxOrgs] = await Promise.all([
    supabase.from("events").select("id,name,organization_id,notes").eq("organization_id", org.id).in("name", expectedEventNames),
    supabase.from("sps").select("id", { count: "exact", head: true }).eq("organization_id", org.id).ilike("notes", `%${DEMO_MARKER}%`),
    findSandboxOrganizations(supabase),
  ]);
  if (eventError) throw new Error(`event verify failed: ${eventError.message}`);
  if (spError) throw new Error(`SP verify failed: ${spError.message}`);
  const foundEventNames = new Set((eventRows || []).filter((row) => String(row.notes || "").includes(DEMO_MARKER)).map((row) => String(row.name || "")));
  const missingEventNames = expectedEventNames.filter((name) => !foundEventNames.has(name));
  console.log(`Sandbox org id: ${org.id}`);
  console.log(`Sandbox org slug/name matches: ${sandboxOrgs.length}`);
  console.log(`Sandbox events found under canonical org: ${foundEventNames.size}/${DEMO_EVENTS.length}`);
  if (missingEventNames.length) {
    console.log("Missing sandbox events:");
    missingEventNames.forEach((name) => console.log(`- ${name}`));
  }
  console.log(`Sandbox SP profiles found: ${spCount || 0}/${DEMO_SPS.length}`);
  if (missingEventNames.length || (spCount || 0) < DEMO_SPS.length) process.exit(1);
}

async function seedDemoData(supabase, options = {}) {
  const now = new Date().toISOString();
  const canonical = await ensureCanonicalSandboxOrganization(supabase);
  const org = canonical.organization;
  const organizationId = org.id;
  const duplicateIds = canonical.duplicateIds;
  const repairSummary = {
    duplicateOrganizationsFound: duplicateIds.length,
    membershipsMoved: await migrateDuplicateSandboxMemberships(supabase, organizationId, duplicateIds),
    accessRequestsMoved: await migrateDuplicateSandboxAccessRequests(supabase, organizationId, duplicateIds),
    duplicateSeedRowsReset: {},
    duplicateOrganizationsRetired: 0,
  };
  for (const duplicateId of duplicateIds) {
    repairSummary.duplicateSeedRowsReset[duplicateId] = await resetDemoData(supabase, duplicateId);
  }
  repairSummary.duplicateOrganizationsRetired = await retireDuplicateSandboxOrganizations(supabase, duplicateIds);

  await upsertBy(supabase, "organization_access_codes", { code: SANDBOX_ACCESS_CODE.code }, {
    organization_id: organizationId,
    ...SANDBOX_ACCESS_CODE,
    allowed_email_domains: null,
  }, "sandbox organization access code");

  await upsertBy(supabase, "organization_communication_settings", { organization_id: organizationId }, {
    organization_id: organizationId,
    default_sp_communication_mode: "hybrid",
    allow_sp_portal: true,
    allow_email_workflow: true,
    allow_microsoft_forms_workflow: true,
    allow_manual_workflow: true,
    default_ms_forms_url: "https://forms.office.com/cfsp-sandbox-preview-only",
    default_reply_to_email: "sandbox-reply@sandbox.invalid",
    sp_onboarding_message: "Sandbox only: CFSP Sandbox Simulation Center supports portal, email-preview, Microsoft Forms-preview, and manual SP workflows. Do not send real bulk email from seeded data.",
  }, "organization communication settings");

  const staffUserIds = new Map();
  for (const person of DEMO_FACULTY_STAFF) {
    await upsertSandboxStaffContact(supabase, organizationId, person);
    if (options.createDirectoryAuthUsers !== false) {
      const user = await upsertDirectoryMembership(supabase, organizationId, person, options);
      if (user?.id) staffUserIds.set(person.key, user.id);
    }
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
      notes: `${DEMO_MARKER}: fake SP profile for the shared CFSP sandbox only. Tags: ${sp.tags}. Safe contact rule: .invalid addresses are non-deliverable; conflictfreesp.com portal aliases are Cory-controlled.`,
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
    const eventStaff = DEMO_EVENT_STAFF_ASSIGNMENTS[event.key] || {};
    const ownerId = staffUserIds.get(eventStaff.simLead);
    const eventPayload = {
      organization_id: organizationId,
      name: event.name,
      status: event.status,
      date_text: event.date_text,
      sp_needed: event.sp_needed,
      visibility: "team",
      location: event.location,
      notes: buildEventNotes(event),
    };
    if (ownerId) eventPayload.owner_id = ownerId;
    const row = await upsertBy(supabase, "events", { organization_id: organizationId, name: event.name }, {
      ...eventPayload,
    }, `event ${event.name}`).catch(async (error) => {
      if (!isMissingColumnMessage(error, "owner_id")) throw error;
      delete eventPayload.owner_id;
      return await upsertBy(supabase, "events", { organization_id: organizationId, name: event.name }, eventPayload, `event ${event.name}`);
    });
    eventIds.set(event.key, row.id);

    const roundMinutes = Math.max(20, Math.floor(((Number(event.end_time.slice(0, 2)) * 60 + Number(event.end_time.slice(3))) - (Number(event.start_time.slice(0, 2)) * 60 + Number(event.start_time.slice(3)))) / event.roundCount));
    const roomNames = getRoomNames(event);
    for (let round = 0; round < event.roundCount; round += 1) {
      for (let room = 1; room <= event.roomCount; room += 1) {
        const start = addMinutes(event.start_time, round * roundMinutes);
        const end = addMinutes(start, Math.max(15, roundMinutes - 5));
        const roomName = roomNames[room - 1] || `Simulation Room ${room}`;
        await upsertBy(supabase, "event_sessions", { event_id: row.id, session_date: event.session_date, start_time: start, room: roomName }, {
          organization_id: organizationId,
          event_id: row.id,
          session_date: event.session_date,
          start_time: start,
          end_time: end,
          location: event.location,
          room: roomName,
        }, `session ${event.name} round ${round + 1} room ${room}`);
      }
    }
  }

  for (const assignment of ASSIGNMENTS) {
    const eventId = eventIds.get(assignment.event);
    const spId = spIds.get(assignment.sp);
    const eventSpStatus = normalizeEventSpStatus(assignment.status);
    const detail = assignmentDetail(assignment);
    await upsertBy(supabase, "event_sps", { event_id: eventId, sp_id: spId }, {
      organization_id: organizationId,
      event_id: eventId,
      sp_id: spId,
      status: eventSpStatus,
      assignment_status: assignment.status,
      role_name: detail?.role || (assignment.status.includes("backup") ? "Backup SP" : "Primary SP"),
      confirmed: assignment.confirmed,
      notes: detail
        ? `${DEMO_MARKER}: fake assignment for the shared CFSP sandbox only.\nCase: ${detail.caseName}`
        : `${DEMO_MARKER}: fake assignment for the shared CFSP sandbox only.`,
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
      room: getRoomNames(event).join(", "),
      needed_count: event.sp_needed + event.backups,
      status: event.completed ? "closed" : "open",
      visibility: "portal_and_email",
      requirements: `${event.type}; ${event.training === "not_required" ? "training not required" : "training required"}`,
      notes: `${DEMO_MARKER}: fake poll/opening modeled after schedule room and rotation patterns. Preview/test-safe only; no email is sent by the seed.`,
      updated_at: now,
    }, `shift opening ${event.name}`);
  }

  for (const assignment of ASSIGNMENTS.filter((item) => ["completed", "confirmed_primary", "confirmed_backup"].includes(item.status))) {
    const eventId = eventIds.get(assignment.event);
    const spId = spIds.get(assignment.sp);
    const attendanceStatus = normalizeSpAttendanceStatus(assignment.attendance || (assignment.status === "completed" ? "checked_out" : "not_arrived"));
    await upsertBy(supabase, "event_sp_attendance", { event_id: eventId, sp_id: spId }, {
      organization_id: organizationId,
      event_id: eventId,
      sp_id: spId,
      status: attendanceStatus,
      notes: `${DEMO_MARKER}: fake attendance status for sandbox room operations testing.`,
      checked_in_at: ["arrived", "checked_in", "checked_out"].includes(attendanceStatus) ? `${DEMO_EVENTS.find((event) => event.key === assignment.event)?.session_date}T12:00:00.000Z` : null,
      checked_out_at: attendanceStatus === "checked_out" ? `${DEMO_EVENTS.find((event) => event.key === assignment.event)?.session_date}T15:30:00.000Z` : null,
      updated_at: now,
    }, `attendance ${assignment.event}/${assignment.sp}`);
  }

  return {
    organizationId,
    repairSummary,
    danielAuthLinked: Boolean(staffUserIds.get(DANIEL_TEST_OPERATOR.key)),
    danielAuthCreatedOrUpdated: Boolean(options.createDanielAuth && staffUserIds.get(DANIEL_TEST_OPERATOR.key)),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return showHelp();
  if ([args.write, args.reset, args.verify].filter(Boolean).length > 1) throw new Error("Choose only one of --write, --reset, or --verify.");

  const plan = buildPlan({ scheduleFile: args.scheduleFile, spFile: args.spFile, createDanielAuth: args.createDanielAuth });
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
      console.log("CFSP Sandbox Simulation Center does not exist; nothing to reset.");
      return;
    }
    const counts = await resetDemoData(supabase, existingOrg.id);
    console.log("CFSP sandbox reset complete. Deleted only seeder-owned sandbox rows:");
    Object.entries(counts).forEach(([table, count]) => console.log(`- ${table}: ${count}`));
    return;
  }

  const result = await seedDemoData(supabase, { createDanielAuth: args.createDanielAuth });
  printPlan(plan, result.organizationId);
  console.log("\nSandbox seed complete.");
  console.log(`Org name/id: ${DEMO_ORG.name} / ${result.organizationId}`);
  console.log(`Access code for tester requests: ${SANDBOX_ACCESS_CODE.code} (approve as sim_ops by default)`);
  console.log(`Events created/upserted: ${DEMO_EVENTS.length}`);
  console.log(`SP profiles created/upserted: ${DEMO_SPS.length}`);
  console.log(`Test SP profiles: ${DEMO_SPS.filter((sp) => sp.portalTest).map((sp) => sp.email).join(", ")}`);
  console.log(`Sandbox org repair: duplicate orgs found=${result.repairSummary.duplicateOrganizationsFound}, memberships moved=${result.repairSummary.membershipsMoved}, access requests moved=${result.repairSummary.accessRequestsMoved}, duplicates retired=${result.repairSummary.duplicateOrganizationsRetired}`);
  console.log(`Daniel tester/operator: ${result.danielAuthLinked ? "auth linked with sim_ops membership" : "visible in event owner/staff notes; auth not created"} (${DANIEL_TEST_OPERATOR.email})`);
  if (result.danielAuthCreatedOrUpdated) {
    console.log("Daniel temporary password came from CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD. Share it out-of-band and rotate it after first login.");
  } else {
    console.log("Daniel login creation skipped. Add --create-daniel-auth and CFSP_DANIEL_TEST_OPERATOR_TEMP_PASSWORD with the guarded write command to create/update his temporary test login.");
  }
  console.log("Manual steps: approve external testers through /request-access as sim_ops. Create/link Supabase auth users for sp.demo1@conflictfreesp.com through sp.demo5@conflictfreesp.com only if SP portal login testing is needed.");
}

export {
  ASSIGNMENTS,
  DANIEL_TEST_OPERATOR,
  DEMO_EVENTS,
  DEMO_FACULTY_STAFF,
  DEMO_MARKER,
  DEMO_ORG,
  DEMO_SPS,
  SANDBOX_ACCESS_CODE,
  buildPlan,
  findDemoOrganization,
  findSandboxOrganizations,
  seedDemoData,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Sandbox seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
