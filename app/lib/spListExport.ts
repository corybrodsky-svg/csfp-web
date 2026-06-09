export type SpExportNameInput = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

const unsafeParsedNameSuffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v", "md", "phd", "do", "pa", "rn"]);

function normalizeNameToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canConservativelyParseNamePart(value: string) {
  return /^[A-Za-z][A-Za-z.'-]*$/.test(value);
}

export function formatSpExportName(input: SpExportNameInput) {
  const firstName = asText(input.firstName);
  const lastName = asText(input.lastName);
  const displayName = asText(input.displayName);

  if (firstName && lastName) return `${lastName}, ${firstName}`;
  if (!displayName) return "";
  if (displayName.includes(",")) return displayName;

  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return displayName;
  if (!parts.every(canConservativelyParseNamePart)) return displayName;

  const lastPart = parts[parts.length - 1];
  if (unsafeParsedNameSuffixes.has(normalizeNameToken(lastPart))) return displayName;

  return `${lastPart}, ${parts.slice(0, -1).join(" ")}`;
}

export function getSpListExportFilePart(value: string) {
  return (
    asText(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "event"
  );
}
