function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export const MINUTES_PER_DAY = 24 * 60;

export function parseTimeToMinutes(value?: string | null) {
  const raw = asText(value).toLowerCase();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridiem = match[4];

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function normalizeEndMinutesForRange(
  startMinutes: number | null,
  endMinutes: number | null
) {
  if (startMinutes === null || endMinutes === null) return null;
  return endMinutes < startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
}

export function normalizeClockMinutesForWindow(
  minutes: number | null,
  windowStartMinutes: number | null,
  normalizedWindowEndMinutes: number | null
) {
  if (minutes === null || windowStartMinutes === null || normalizedWindowEndMinutes === null) {
    return minutes;
  }
  if (normalizedWindowEndMinutes <= windowStartMinutes || normalizedWindowEndMinutes < MINUTES_PER_DAY) {
    return minutes;
  }

  const normalizedClockMinutes = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const windowStartClockMinutes =
    ((windowStartMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const nextDayCandidate =
    (Math.floor(windowStartMinutes / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY +
    normalizedClockMinutes;

  if (
    minutes < windowStartMinutes &&
    normalizedClockMinutes < windowStartClockMinutes &&
    (nextDayCandidate <= normalizedWindowEndMinutes || normalizedClockMinutes < 8 * 60)
  ) {
    return nextDayCandidate;
  }

  return minutes;
}

export function getMinuteDayOffset(totalMinutes: number) {
  return Math.floor(Math.max(0, Math.floor(totalMinutes)) / MINUTES_PER_DAY);
}

function formatDayOffset(offset: number) {
  return offset > 0 ? ` (+${offset} day${offset === 1 ? "" : "s"})` : "";
}

export function formatDisplayTimeFromMinutes(totalMinutes: number) {
  const normalized = ((Math.floor(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const normalizedHours = hours % 12 || 12;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${normalizedHours}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatDisplayMinuteRange(startMinutes: number, endMinutes: number) {
  const startOffset = getMinuteDayOffset(startMinutes);
  const endOffset = getMinuteDayOffset(endMinutes);
  const startLabel = formatDisplayTimeFromMinutes(startMinutes);
  const endLabel = formatDisplayTimeFromMinutes(endMinutes);

  if (startOffset === endOffset) {
    return `${startLabel} - ${endLabel}${formatDayOffset(endOffset)}`;
  }

  return `${startLabel}${formatDayOffset(startOffset)} - ${endLabel}${formatDayOffset(endOffset)}`;
}

export function formatDisplayTime(value?: string | null) {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return asText(value) || "Time TBD";

  return formatDisplayTimeFromMinutes(minutes);
}
