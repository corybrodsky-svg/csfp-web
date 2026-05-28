export type CanonicalEventType = "simulation" | "didactic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeEventType(value: unknown): CanonicalEventType {
  const normalized = asText(value).toLowerCase().replace(/[\s_-]+/g, " ");

  if (
    [
      "didactic",
      "didactic event",
      "lecture",
      "classroom",
      "seminar",
      "training",
      "training only",
      "education",
      "educational",
    ].includes(normalized)
  ) {
    return "didactic";
  }

  return "simulation";
}

export function normalizeEventTypeFromSources(...values: unknown[]): CanonicalEventType {
  for (const value of values) {
    const text = asText(value);
    if (!text) continue;
    const normalized = normalizeEventType(text);
    if (normalized === "didactic") return "didactic";
  }

  return "simulation";
}

