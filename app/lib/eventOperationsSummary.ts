export type CommandCenterToolKey =
  | "overview"
  | "event-settings"
  | "readiness"
  | "staffing"
  | "sp-finder"
  | "communications"
  | "schedule"
  | "room-operations"
  | "learner-roster"
  | "faculty-contacts"
  | "materials"
  | "day-of";

export type EventOperationsHandoff = {
  tool: CommandCenterToolKey;
  label: string;
};

const COMMAND_CENTER_TOOL_ALIASES: Record<string, CommandCenterToolKey> = {
  overview: "overview",
  command: "overview",
  "command-center": "overview",
  commandCenter: "overview",
  settings: "event-settings",
  "event-settings": "event-settings",
  event_settings: "event-settings",
  readiness: "readiness",
  checklist: "readiness",
  "event-readiness": "readiness",
  "readiness-checklist": "readiness",
  readiness_checklist: "readiness",
  staffing: "staffing",
  hiring: "staffing",
  "sp-hiring": "staffing",
  sp_hiring: "staffing",
  "sp-finder": "sp-finder",
  spFinder: "sp-finder",
  sp_finder: "sp-finder",
  communications: "communications",
  communication: "communications",
  email: "communications",
  schedule: "schedule",
  "schedule-builder": "schedule",
  schedule_builder: "schedule",
  builder: "schedule",
  "room-operations": "room-operations",
  room_operations: "room-operations",
  roomOps: "room-operations",
  rooms: "room-operations",
  "learner-roster": "learner-roster",
  learner_roster: "learner-roster",
  learners: "learner-roster",
  roster: "learner-roster",
  faculty: "faculty-contacts",
  contacts: "faculty-contacts",
  "faculty-contacts": "faculty-contacts",
  faculty_contacts: "faculty-contacts",
  materials: "materials",
  "case-files": "materials",
  case_files: "materials",
  files: "materials",
  "training-materials": "materials",
  training_materials: "materials",
  "day-of": "day-of",
  day_of: "day-of",
  "final-readiness": "day-of",
  final_readiness: "day-of",
  ops: "day-of",
};

const TOOL_LABELS: Record<CommandCenterToolKey, string> = {
  overview: "Command Center",
  "event-settings": "Event Settings",
  readiness: "Event Readiness Checklist",
  staffing: "Staffing / SP Hiring",
  "sp-finder": "SP Finder",
  communications: "Communications",
  schedule: "Schedule Builder",
  "room-operations": "Room Operations",
  "learner-roster": "Learner Roster",
  "faculty-contacts": "Faculty / Contacts",
  materials: "Training Materials / Case Files",
  "day-of": "Final Readiness / Day-of Ops",
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeText(value: unknown) {
  return asText(value).toLowerCase();
}

export function normalizeCommandCenterToolKey(value: unknown): CommandCenterToolKey | null {
  const raw = asText(value);
  if (!raw) return null;
  return COMMAND_CENTER_TOOL_ALIASES[raw] || COMMAND_CENTER_TOOL_ALIASES[raw.replace(/\s+/g, "-")] || null;
}

export function getCommandCenterToolLabel(tool: CommandCenterToolKey) {
  return TOOL_LABELS[tool];
}

export function buildEventCommandCenterHref(eventId: string, tool?: CommandCenterToolKey | null) {
  const encoded = encodeURIComponent(eventId);
  if (!tool || tool === "overview") return `/events/${encoded}`;
  return `/events/${encoded}?tool=${encodeURIComponent(tool)}`;
}

export function getEventOperationsHandoffForIssue(issue: unknown): EventOperationsHandoff {
  const text = normalizeText(issue);

  if (/\b(sp activity|portal activity|reviewed|checked in|accepted|maybe|declined|response|responses received|confirmation|confirmed|poll sent|poll drafted|hiring|coverage|staffing)\b/.test(text)) {
    const tool: CommandCenterToolKey = /\bcoverage|staffing|hiring\b/.test(text) ? "staffing" : "sp-finder";
    return { tool, label: `Open ${getCommandCenterToolLabel(tool)}` };
  }

  if (/\b(learner|roster|student)\b/.test(text)) {
    return { tool: "learner-roster", label: "Open Learner Roster" };
  }

  if (/\b(schedule|round|rotation|timeline)\b/.test(text)) {
    return { tool: "schedule", label: "Open Schedule Builder" };
  }

  if (/\b(case|file|material|recording|zoom link|training needed|training plan)\b/.test(text)) {
    return { tool: "materials", label: "Open Materials / Case Files" };
  }

  if (/\b(faculty|contact|packet|recipient)\b/.test(text)) {
    return { tool: "faculty-contacts", label: "Open Faculty / Contacts" };
  }

  if (/\b(email|communication|invite|announcement)\b/.test(text)) {
    return { tool: "communications", label: "Open Communications" };
  }

  if (/\b(room|location)\b/.test(text)) {
    return { tool: "room-operations", label: "Open Room Operations" };
  }

  if (/\b(readiness|ready|blocked|issue|attention|risk)\b/.test(text)) {
    return { tool: "readiness", label: "Open Event Readiness Checklist" };
  }

  return { tool: "overview", label: "Open Command Center" };
}

// Dashboard and Command Center both derive status from event notes, schedule metadata,
// staffing counts, materials, communications, and SP activity. Keep this module read-only:
// it is a handoff map for shared operational summaries, not a source of event state.
