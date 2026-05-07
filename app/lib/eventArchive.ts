import { getImportedYearHint, normalizeLooseDateToIso } from "./eventDateUtils";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeArchiveDate(value?: string | null, notes?: string | null) {
  return normalizeLooseDateToIso(value, getImportedYearHint(notes)) || "";
}

export function getEventArchiveDate(args: {
  latestSessionDate?: string | null;
  earliestSessionDate?: string | null;
  dateText?: string | null;
  notes?: string | null;
}) {
  return (
    normalizeArchiveDate(args.latestSessionDate, args.notes) ||
    normalizeArchiveDate(args.earliestSessionDate, args.notes) ||
    normalizeArchiveDate(args.dateText, args.notes)
  );
}

export function isPastEvent(args: {
  latestSessionDate?: string | null;
  earliestSessionDate?: string | null;
  dateText?: string | null;
  notes?: string | null;
}, todayIso = getTodayIsoDate()) {
  const effectiveDate = getEventArchiveDate(args);
  if (!effectiveDate) return false;
  return effectiveDate < todayIso;
}

export function compareByArchiveDate(
  a: { latestSessionDate?: string | null; earliestSessionDate?: string | null; dateText?: string | null; notes?: string | null; name?: string | null },
  b: { latestSessionDate?: string | null; earliestSessionDate?: string | null; dateText?: string | null; notes?: string | null; name?: string | null },
  direction: "asc" | "desc" = "asc"
) {
  const aDate = getEventArchiveDate(a);
  const bDate = getEventArchiveDate(b);

  if (aDate && bDate && aDate !== bDate) {
    return direction === "asc" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
  }
  if (aDate && !bDate) return -1;
  if (!aDate && bDate) return 1;
  return asText(a.name).localeCompare(asText(b.name));
}
