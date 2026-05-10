export type EditableEventType = "skills" | "sp" | "hifi" | "training" | "virtual";

export const editableEventTypeLabels: Record<EditableEventType, string> = {
  skills: "Skills",
  sp: "SP",
  hifi: "HiFi",
  training: "Training",
  virtual: "Virtual",
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeExplicitEventType(value: string): EditableEventType | null {
  const normalized = asText(value).toLowerCase().replace(/[\s_-]+/g, " ");

  if (["skills", "skill", "skills workshop", "workshop"].includes(normalized)) return "skills";
  if (["sp", "sp event", "standardized patient", "standardized patient event"].includes(normalized)) {
    return "sp";
  }
  if (["hifi", "hi fi", "hi-fi", "high fidelity"].includes(normalized)) return "hifi";
  if (["training", "orientation", "onboarding"].includes(normalized)) return "training";
  if (["virtual", "virtual sp", "zoom", "simiq"].includes(normalized)) return "virtual";
  return null;
}

function dedupeEventTypes(types: EditableEventType[]) {
  return Array.from(new Set(types));
}

export function getExplicitEventTypes(notes?: string | null): EditableEventType[] {
  const text = asText(notes);
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const found: EditableEventType[] = [];

  for (const line of lines) {
    const match = line.match(/^(Event Type|Event Category)\s*:\s*(.+)$/i);
    if (!match) continue;
    const normalized = normalizeExplicitEventType(match[2]);
    if (normalized) found.push(normalized);
  }

  for (const line of lines) {
    const match = line.match(/^Event Types?\s*:\s*(.+)$/i);
    if (!match) continue;

    const normalizedTypes = match[1]
      .split(/[,+/|]/)
      .map((value) => normalizeExplicitEventType(value))
      .filter((value): value is EditableEventType => Boolean(value));

    found.push(...normalizedTypes);
  }

  return dedupeEventTypes(found);
}

export function getExplicitEventType(notes?: string | null): EditableEventType | null {
  return getExplicitEventTypes(notes)[0] || null;
}

export function upsertEventTypesInNotes(
  notes: string | null | undefined,
  nextTypes: EditableEventType[]
) {
  const text = asText(notes);
  const normalizedTypes = dedupeEventTypes(nextTypes);

  if (!normalizedTypes.length) {
    return text
      .replace(/^(Event Types?|Event Category)\s*:.*$/gim, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const nextLine = `Event Types: ${normalizedTypes
    .map((type) => editableEventTypeLabels[type])
    .join(", ")}`;

  if (!text) return nextLine;

  if (/^(Event Types?|Event Category)\s*:/im.test(text)) {
    return text.replace(/^(Event Types?|Event Category)\s*:.*$/gim, nextLine);
  }

  return `${nextLine}\n${text}`;
}

export function upsertEventTypeInNotes(
  notes: string | null | undefined,
  nextType: EditableEventType
) {
  return upsertEventTypesInNotes(notes, [nextType]);
}
