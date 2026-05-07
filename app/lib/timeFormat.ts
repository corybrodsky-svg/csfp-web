function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

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

export function formatDisplayTime(value?: string | null) {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return asText(value) || "Time TBD";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const normalizedHours = hours % 12 || 12;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${normalizedHours}:${String(mins).padStart(2, "0")} ${suffix}`;
}
