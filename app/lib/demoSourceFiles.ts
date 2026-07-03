const SANDBOX_PUBLIC_FILE_PREFIX = "/cfsp-sandbox/";
const SANDBOX_MATERIAL_API_PREFIX = "/api/sandbox-materials/";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sandboxMaterialApiPathToPublicFile(pathname: string) {
  if (!pathname.startsWith(SANDBOX_MATERIAL_API_PREFIX)) return "";
  const slug = pathname.slice(SANDBOX_MATERIAL_API_PREFIX.length).split("/").filter(Boolean)[0] || "";
  if (!slug) return "";
  return `${SANDBOX_PUBLIC_FILE_PREFIX}${slug.endsWith(".pdf") ? slug : `${slug}.pdf`}`;
}

export function normalizeDemoSourceFileUrl(value: unknown) {
  const text = asText(value);
  if (!text) return "";
  if (text.startsWith(SANDBOX_PUBLIC_FILE_PREFIX)) return text;
  if (text.startsWith(SANDBOX_MATERIAL_API_PREFIX)) return sandboxMaterialApiPathToPublicFile(text.split(/[?#]/)[0] || "");

  try {
    const parsed = new URL(text, "https://cfsp.local");
    if (parsed.pathname.startsWith(SANDBOX_MATERIAL_API_PREFIX)) {
      return sandboxMaterialApiPathToPublicFile(parsed.pathname);
    }
    if (parsed.hostname === "example.com" && parsed.pathname.startsWith(SANDBOX_PUBLIC_FILE_PREFIX)) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (parsed.hostname === "example.com") return "";
  } catch {
    return text;
  }

  return text;
}
