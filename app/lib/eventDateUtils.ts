export function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function getImportedYearHint(notes?: string | null) {
  const match = asText(notes).match(/\b20\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeYear(year: number, fallbackYear?: number | null) {
  if (year >= 2000 && year <= 2100) return year;
  if (year >= 0 && year <= 99) return 2000 + year;
  if (fallbackYear && year < 2000) return fallbackYear;
  return year >= 1900 && year <= 2100 ? year : fallbackYear || null;
}

function toIsoDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeLooseDateToIso(
  value?: string | null,
  fallbackYear?: number | null
) {
  const raw = asText(value);
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = normalizeYear(Number(isoMatch[1]), fallbackYear);
    return year ? toIsoDate(year, Number(isoMatch[2]), Number(isoMatch[3])) : null;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/);
  if (slashMatch) {
    const year = normalizeYear(Number(slashMatch[3]), fallbackYear);
    return year ? toIsoDate(year, Number(slashMatch[1]), Number(slashMatch[2])) : null;
  }

  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;

  const parsedDate = new Date(parsed);
  const parsedYear = normalizeYear(parsedDate.getFullYear(), fallbackYear);
  if (!parsedYear) return null;
  return toIsoDate(parsedYear, parsedDate.getMonth() + 1, parsedDate.getDate());
}

export function formatUsDate(value?: string | null, fallbackYear?: number | null) {
  const iso = normalizeLooseDateToIso(value, fallbackYear);
  if (!iso) return asText(value) || null;

  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

export function formatHumanDate(value?: string | null, fallbackYear?: number | null) {
  const iso = normalizeLooseDateToIso(value, fallbackYear);
  if (!iso) return asText(value) || "Date TBD";

  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return asText(value) || "Date TBD";
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getDateSortValue(value?: string | null, fallbackYear?: number | null) {
  const iso = normalizeLooseDateToIso(value, fallbackYear);
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(`${iso}T00:00:00`);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}
