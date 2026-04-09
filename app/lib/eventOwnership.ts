export type OwnershipEventLike = {
  owner_id?: string | null;
  schedule_owner_text?: string | null;
  notes?: string | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeMatchValue(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function getScheduleNameVariants(value: string) {
  const normalized = normalizeMatchValue(value);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length > 1) {
    variants.add(parts[0]);
    variants.add(parts.slice(0, 2).join(" "));
  }

  return Array.from(variants);
}

export function ownershipTextMatchesScheduleName(ownerText: string, scheduleName: string) {
  const normalizedOwner = normalizeMatchValue(ownerText);
  const normalizedSchedule = normalizeMatchValue(scheduleName);
  if (!normalizedOwner || !normalizedSchedule) return false;

  const ownerSegments = normalizedOwner
    .split(/\/|,|;|&|\band\b/)
    .map((segment) => normalizeMatchValue(segment))
    .filter(Boolean);
  const ownerCandidates = Array.from(new Set([normalizedOwner, ...ownerSegments]));
  const scheduleVariants = getScheduleNameVariants(normalizedSchedule);

  return scheduleVariants.some((variant) =>
    ownerCandidates.some(
      (candidate) => candidate === variant || candidate.includes(variant) || variant.includes(candidate)
    )
  );
}

export function getOwnershipTextFromNotes(notes: string) {
  const match = notes.match(/Event Lead\/Team:\s*(.+)/i);
  return match ? asText(match[1]) : "";
}

export function eventMatchesOwnership(
  event: OwnershipEventLike,
  currentUserId: string,
  scheduleName: string
) {
  if (asText(event.owner_id) === currentUserId) return true;
  if (ownershipTextMatchesScheduleName(asText(event.schedule_owner_text), scheduleName)) return true;
  return ownershipTextMatchesScheduleName(getOwnershipTextFromNotes(asText(event.notes)), scheduleName);
}
