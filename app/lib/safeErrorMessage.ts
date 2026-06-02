function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

const HTML_LIKE_PATTERN = /<\s*(!doctype|html|head|body|title|script|style|meta|link)\b/i;
const TAG_PATTERN = /<[^>]+>/g;

export function sanitizePublicErrorMessage(
  value: unknown,
  fallback = "Request temporarily unavailable. Please try again shortly.",
  maxLength = 220
) {
  const raw = asText(value);
  if (!raw) return fallback;

  if (HTML_LIKE_PATTERN.test(raw)) return fallback;

  const withoutScripts = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(TAG_PATTERN, " ");
  const normalized = withoutTags.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;

  const lower = normalized.toLowerCase();
  if (
    lower.includes("supabase request failed") ||
    lower.includes("permission denied for table") ||
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("violates row-level security")
  ) {
    return fallback;
  }

  if (lower.includes("cloudflare") || lower.includes("supabase.co") || lower.includes("520:")) {
    return fallback;
  }

  if (normalized.length > maxLength) {
    return `${normalized.slice(0, maxLength).trimEnd()}…`;
  }

  return normalized;
}
