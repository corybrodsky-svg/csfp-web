function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function splitPeopleList(value: string) {
  return value
    .replace(/\r/g, "\n")
    .split(/\s*(?:\n|,|;|\/| and | & )\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractRosterLine(notes: string, labelPattern: RegExp) {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(labelPattern);
    if (match?.[1]) {
      return splitPeopleList(match[1]);
    }
  }

  return [];
}

const ROSTER_LABEL_PATTERNS = [
  { label: "Sim Staff", pattern: /^Sim Staff\s*:\s*(.+)$/i },
  { label: "Staff Hiring", pattern: /^Staff Hiring\s*:\s*(.+)$/i },
  { label: "Team", pattern: /^Event Lead\/Team\s*:\s*(.+)$/i },
  { label: "Team", pattern: /^Event Lead\s*:\s*(.+)$/i },
  { label: "Team", pattern: /^Team\s*:\s*(.+)$/i },
  { label: "Course Faculty", pattern: /^Course Faculty\s*:\s*(.+)$/i },
  { label: "Faculty", pattern: /^Faculty\s*:\s*(.+)$/i },
] as const;

export function getEventTeamInfo(notes?: string | null) {
  const text = asText(notes);
  if (!text) {
    return {
      names: [],
      label: "",
    };
  }

  for (const roster of ROSTER_LABEL_PATTERNS) {
    const names = extractRosterLine(text, roster.pattern);
    if (names.length) {
      return {
        names: Array.from(new Set(names)),
        label: roster.label,
      };
    }
  }

  return {
    names: [],
    label: "",
  };
}

export function getSimStaffNames(notes?: string | null) {
  return getEventTeamInfo(notes).names;
}

export function getSimStaffLabel(notes?: string | null) {
  const info = getEventTeamInfo(notes);
  if (!info.names.length) return "No sim staff listed";
  if (info.label === "Sim Staff") return info.names.join(", ");
  return `${info.label}: ${info.names.join(", ")}`;
}
