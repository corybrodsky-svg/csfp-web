const SANDBOX_PUBLIC_FILE_PREFIX = "/cfsp-sandbox/";
const SANDBOX_MATERIAL_API_PREFIX = "/api/sandbox-materials/";
const SANDBOX_STUDENT_ROSTER_TEMPLATE_URL = "/cfsp-sandbox/cfsp-sandbox-student-roster-template.xlsx";
const LEGACY_LEARNER_ROSTER_PUBLIC_PATH = "/cfsp-sandbox/stroke-warning-signs-learner-roster.pdf";
const LEGACY_LEARNER_ROSTER_MATERIAL_SLUG = "stroke-warning-signs-learner-roster";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sandboxMaterialApiPathToPublicFile(pathname: string) {
  if (!pathname.startsWith(SANDBOX_MATERIAL_API_PREFIX)) return "";
  const slug = pathname.slice(SANDBOX_MATERIAL_API_PREFIX.length).split("/").filter(Boolean)[0] || "";
  if (!slug) return "";
  if (slug === LEGACY_LEARNER_ROSTER_MATERIAL_SLUG) return SANDBOX_STUDENT_ROSTER_TEMPLATE_URL;
  return `${SANDBOX_PUBLIC_FILE_PREFIX}${slug.endsWith(".pdf") ? slug : `${slug}.pdf`}`;
}

function normalizeSandboxPublicFilePath(value: string) {
  const pathname = value.split(/[?#]/)[0] || "";
  if (pathname === LEGACY_LEARNER_ROSTER_PUBLIC_PATH) return SANDBOX_STUDENT_ROSTER_TEMPLATE_URL;
  return value;
}

export function normalizeDemoSourceFileUrl(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  if (text.startsWith(SANDBOX_PUBLIC_FILE_PREFIX)) return normalizeSandboxPublicFilePath(text);
  if (text.startsWith(SANDBOX_MATERIAL_API_PREFIX)) return sandboxMaterialApiPathToPublicFile(text.split(/[?#]/)[0] || "");

  try {
    const parsed = new URL(text, "https://cfsp.local");
    if (parsed.pathname.startsWith(SANDBOX_MATERIAL_API_PREFIX)) {
      return sandboxMaterialApiPathToPublicFile(parsed.pathname);
    }
    if (parsed.hostname === "example.com" && parsed.pathname.startsWith(SANDBOX_PUBLIC_FILE_PREFIX)) {
      return normalizeSandboxPublicFilePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    }
    if (parsed.hostname === "example.com") return "";
  } catch {
    return text;
  }

  return text;
}
