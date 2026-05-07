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

export function getExplicitEventType(notes?: string | null): EditableEventType | null {
  const text = asText(notes);
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(Event Type|Event Category)\s*:\s*(.+)$/i);
    if (!match) continue;
    return normalizeExplicitEventType(match[2]);
  }

  return null;
}

export function upsertEventTypeInNotes(
  notes: string | null | undefined,
  nextType: EditableEventType
) {
  const nextLine = `Event Type: ${editableEventTypeLabels[nextType]}`;
  const text = asText(notes);

  if (!text) return nextLine;

  if (/^(Event Type|Event Category)\s*:/im.test(text)) {
    return text.replace(/^(Event Type|Event Category)\s*:.*$/im, nextLine);
  }

  return `${nextLine}\n${text}`;
}
