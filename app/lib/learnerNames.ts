function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeLearnerName(value: unknown) {
  return asText(value)
    .normalize("NFC")
    .replace(/_x000d_/gi, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u00ca\ufffd]+$/g, "")
    .trim();
}

export function normalizeLearnerNames(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];
  return values.map(normalizeLearnerName).filter(Boolean);
}
