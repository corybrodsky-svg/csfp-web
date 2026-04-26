function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function splitPeopleList(value: string) {
  return value
    .split(/\s*(?:,|;|\/| and | & )\s*/i)
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

export function getSimStaffNames(notes?: string | null) {
  const text = asText(notes);
  if (!text) return [];

  const names = extractRosterLine(text, /^Sim Staff\s*:\s*(.+)$/i);
  return Array.from(new Set(names));
}

export function getSimStaffLabel(notes?: string | null) {
  const names = getSimStaffNames(notes);
  if (!names.length) return "No sim staff listed";
  return names.join(", ");
}
