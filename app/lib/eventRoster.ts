import { parseEventMetadata } from "./eventMetadata";

type EventRosterSource = {
  notes?: string | null;
  schedule_owner_text?: string | null;
};

type ParsedRosterLine = {
  label: string;
  text: string;
  names: string[];
};

export type BestEventTeamInfo = {
  teamLabel: string;
  teamText: string;
  teamNames: string[];
  facultyLabel: string;
  facultyText: string;
  facultyNames: string[];
  teamSource: "metadata" | "workbook" | "notes" | "none";
  facultySource: "metadata" | "notes" | "none";
};

const EMPTY_TEAM_INFO: BestEventTeamInfo = {
  teamLabel: "Sim Team / Event Lead",
  teamText: "",
  teamNames: [],
  facultyLabel: "Faculty",
  facultyText: "",
  facultyNames: [],
  teamSource: "none",
  facultySource: "none",
};

const TEAM_LINE_PATTERNS = [
  { label: "Sim Team / Event Lead", pattern: /^Sim Team(?:\s*\/\s*Event Lead)?\s*:\s*(.+)$/i },
  { label: "Sim Team / Event Lead", pattern: /^Event Lead\s*\/\s*Team\s*:\s*(.+)$/i },
  { label: "Sim Team / Event Lead", pattern: /^Event Lead\/Team\s*:\s*(.+)$/i },
  { label: "Sim Team / Event Lead", pattern: /^Event Lead\s*:\s*(.+)$/i },
  { label: "Sim Team / Event Lead", pattern: /^Sim Staff\s*:\s*(.+)$/i },
  { label: "Sim Team / Event Lead", pattern: /^Staff Hiring\s*:\s*(.+)$/i },
  { label: "Sim Team / Event Lead", pattern: /^Team\s*:\s*(.+)$/i },
] as const;

const FACULTY_LINE_PATTERNS = [
  { label: "Faculty", pattern: /^Lead Faculty\s*:\s*(.+)$/i },
  { label: "Faculty", pattern: /^Instructor\s*:\s*(.+)$/i },
  { label: "Faculty", pattern: /^Course Faculty\s*:\s*(.+)$/i },
  { label: "Faculty", pattern: /^Faculty\s*:\s*(.+)$/i },
] as const;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function isMeaningfulRosterText(value: unknown) {
  const normalized = asText(value).toLowerCase();
  if (!normalized) return false;
  return ![
    "not assigned",
    "team not assigned",
    "faculty not assigned",
    "no sim staff listed",
    "none",
    "n/a",
    "na",
    "unknown",
    "unassigned",
    "tbd",
  ].includes(normalized);
}

function splitPeopleList(value: string) {
  return value
    .replace(/\r/g, "\n")
    .split(/\s*(?:\n|,|;|\/| and | & )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const name of names) {
    const normalized = asText(name).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(asText(name));
  }

  return next;
}

function extractFirstMatchingLine(
  notes: string,
  patterns: readonly { label: string; pattern: RegExp }[]
): ParsedRosterLine | null {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const config of patterns) {
      const match = line.match(config.pattern);
      const text = asText(match?.[1]);
      if (!isMeaningfulRosterText(text)) continue;
      const names = uniqueNames(splitPeopleList(text));
      if (!names.length) continue;
      return {
        label: config.label,
        text,
        names,
      };
    }
  }

  return null;
}

function namesFromText(value: unknown) {
  if (!isMeaningfulRosterText(value)) return [];
  return uniqueNames(splitPeopleList(asText(value)));
}

export function getEventTeamInfo(notes?: string | null) {
  const parsed = extractFirstMatchingLine(asText(notes), TEAM_LINE_PATTERNS);
  return {
    names: parsed?.names || [],
    label: parsed?.label || "",
  };
}

export function getSimStaffNames(notes?: string | null) {
  return getEventTeamInfo(notes).names;
}

export function getSimStaffLabel(notes?: string | null) {
  const info = getEventTeamInfo(notes);
  if (!info.names.length) return "No sim staff listed";
  return `${info.label || "Sim Team / Event Lead"}: ${info.names.join(", ")}`;
}

export function getFacultyNames(notes?: string | null) {
  const parsed = extractFirstMatchingLine(asText(notes), FACULTY_LINE_PATTERNS);
  return parsed?.names || [];
}

export function getFacultyText(notes?: string | null) {
  const parsed = extractFirstMatchingLine(asText(notes), FACULTY_LINE_PATTERNS);
  return parsed?.text || "";
}

export function getBestEventTeamInfo(event?: EventRosterSource | null): BestEventTeamInfo {
  if (!event) return EMPTY_TEAM_INFO;

  const notes = asText(event.notes);
  const metadata = parseEventMetadata(notes).training;
  const explicitTeamNames = namesFromText(metadata.sim_contact);
  const explicitFacultyNames = namesFromText(metadata.faculty_names);
  const workbookTeamNames = namesFromText(event.schedule_owner_text);
  const parsedTeam = extractFirstMatchingLine(notes, TEAM_LINE_PATTERNS);
  const parsedFaculty = extractFirstMatchingLine(notes, FACULTY_LINE_PATTERNS);

  const teamNames = explicitTeamNames.length
    ? explicitTeamNames
    : workbookTeamNames.length
      ? workbookTeamNames
      : parsedTeam?.names || [];
  const facultyNames = explicitFacultyNames.length
    ? explicitFacultyNames
    : parsedFaculty?.names || [];

  return {
    teamLabel: "Sim Team / Event Lead",
    teamText:
      explicitTeamNames.length
        ? asText(metadata.sim_contact)
        : workbookTeamNames.length
          ? asText(event.schedule_owner_text)
          : parsedTeam?.text || "",
    teamNames,
    facultyLabel: "Faculty",
    facultyText:
      explicitFacultyNames.length ? asText(metadata.faculty_names) : parsedFaculty?.text || "",
    facultyNames,
    teamSource: explicitTeamNames.length
      ? "metadata"
      : workbookTeamNames.length
        ? "workbook"
        : parsedTeam?.names.length
          ? "notes"
          : "none",
    facultySource: explicitFacultyNames.length
      ? "metadata"
      : parsedFaculty?.names.length
        ? "notes"
        : "none",
  };
}
