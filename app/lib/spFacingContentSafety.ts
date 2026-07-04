const INTERNAL_READINESS_RISK_PATTERNS = [
  /\breadiness\s+risk/i,
  /\broom\s*\d+\b[^.]{0,100}\bnot\s+ready\b/i,
  /\bfaculty\s+guide\b[^.]{0,100}\b(pending|review|not\s+ready)\b/i,
  /\blearner\s+flow\b[^.]{0,100}\b(at\s+risk|risk|blocked|not\s+ready)\b/i,
  /\b(SP|standardized patient)\b[^.]{0,100}\bnot\s+checked\s+in\b/i,
  /\bbackup\s+SP\b[^.]{0,100}\b(still\s+needed|pending|gap|short|shortage)\b/i,
  /\bstaffing\b[^.]{0,100}\b(risk|gap|shortage|coverage)\b/i,
];

export const SAFE_SP_PORTAL_EVENT_NOTE_FALLBACK =
  "Please review the released schedule, role/case details, and training materials before arrival. Contact the simulation team if any released detail is unclear.";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function containsInternalReadinessRiskLanguage(value: unknown) {
  const text = asText(value);
  return Boolean(text && INTERNAL_READINESS_RISK_PATTERNS.some((pattern) => pattern.test(text)));
}

export function sanitizeSpFacingPortalText(value: unknown, fallback = "") {
  const text = asText(value);
  if (!text) return "";
  return containsInternalReadinessRiskLanguage(text) ? fallback : text;
}
