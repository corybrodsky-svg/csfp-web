export type OpenShiftResponseCounts = {
  no_response?: number;
  available?: number;
  accepted?: number;
  maybe?: number;
  declined?: number;
  withdrawn?: number;
};

export type OpenShiftOfferIdentityInput = {
  id?: unknown;
  eventId?: unknown;
  event_id?: unknown;
  organizationId?: unknown;
  organization_id?: unknown;
  shiftDate?: unknown;
  shift_date?: unknown;
  startTime?: unknown;
  start_time?: unknown;
  endTime?: unknown;
  end_time?: unknown;
  location?: unknown;
  room?: unknown;
  visibility?: unknown;
  status?: unknown;
  openingStatus?: unknown;
  outreachMethod?: unknown;
  outreachStatus?: unknown;
  notes?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
};

export type OpenShiftOfferMetadata = {
  pollMethod: string;
  cfspPollStatus: string;
  cfspSelectedSpIds: string;
};

const SHIFT_OPENING_POLL_METADATA_START = "[CFSP_SHIFT_POLL_METADATA]";
const SHIFT_OPENING_POLL_METADATA_END = "[/CFSP_SHIFT_POLL_METADATA]";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeIdentityText(value: unknown) {
  return asText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeIdentityTime(value: unknown) {
  const text = normalizeIdentityText(value);
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return text;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function decodeMetadataValue(value: string) {
  const text = asText(value);
  if (!text) return "";
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function parseOpenShiftOfferMetadata(notes?: unknown): OpenShiftOfferMetadata {
  const text = asText(notes);
  const empty = {
    pollMethod: "",
    cfspPollStatus: "",
    cfspSelectedSpIds: "",
  };
  if (!text) return empty;
  const startIndex = text.indexOf(SHIFT_OPENING_POLL_METADATA_START);
  const endIndex = text.indexOf(SHIFT_OPENING_POLL_METADATA_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return empty;

  const block = text.slice(startIndex + SHIFT_OPENING_POLL_METADATA_START.length, endIndex).trim();
  return block.split(/\r?\n/).reduce((metadata, line) => {
    const match = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (!match) return metadata;
    if (match[1] === "pollMethod") metadata.pollMethod = normalizeIdentityText(match[2]);
    if (match[1] === "cfspPollStatus") metadata.cfspPollStatus = normalizeIdentityText(match[2]);
    if (match[1] === "cfspSelectedSpIds") metadata.cfspSelectedSpIds = decodeMetadataValue(match[2]);
    return metadata;
  }, empty);
}

export function parseOpenShiftSelectedSpIds(value: unknown) {
  return Array.from(new Set(asText(value).split(",").map((item) => asText(item)).filter(Boolean)));
}

export function getOpenShiftOfferIdentity(input: OpenShiftOfferIdentityInput) {
  const metadata = parseOpenShiftOfferMetadata(input.notes);
  const eventId = asText(input.eventId ?? input.event_id);
  const organizationId = asText(input.organizationId ?? input.organization_id) || "legacy";
  const shiftDate = normalizeIdentityText(input.shiftDate ?? input.shift_date);
  const startTime = normalizeIdentityTime(input.startTime ?? input.start_time);
  const endTime = normalizeIdentityTime(input.endTime ?? input.end_time);
  const location = normalizeIdentityText(input.location);
  const room = normalizeIdentityText(input.room);
  const outreachMethod = normalizeIdentityText(input.outreachMethod || metadata.pollMethod || input.visibility || "cfsp");
  const openingStatus = normalizeIdentityText(input.openingStatus || input.status || "open");
  const outreachStatus = normalizeIdentityText(input.outreachStatus || metadata.cfspPollStatus || openingStatus || "open");

  return [
    eventId,
    organizationId,
    shiftDate,
    startTime,
    endTime,
    location,
    room,
    outreachMethod,
    openingStatus,
    outreachStatus,
  ].join("|");
}

export function getOpenShiftOfferTimestamp(input: OpenShiftOfferIdentityInput) {
  const updatedAt = Date.parse(asText(input.updatedAt ?? input.updated_at));
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = Date.parse(asText(input.createdAt ?? input.created_at));
  if (Number.isFinite(createdAt)) return createdAt;
  return 0;
}

export function dedupeOpenShiftOfferRows<T>(
  rows: T[],
  getIdentityInput: (row: T) => OpenShiftOfferIdentityInput
) {
  const latestByIdentity = new Map<string, { row: T; timestamp: number; index: number }>();

  rows.forEach((row, index) => {
    const input = getIdentityInput(row);
    const identity = getOpenShiftOfferIdentity(input);
    const timestamp = getOpenShiftOfferTimestamp(input);
    const current = latestByIdentity.get(identity);
    if (!current || timestamp > current.timestamp || (timestamp === current.timestamp && index < current.index)) {
      latestByIdentity.set(identity, { row, timestamp, index });
    }
  });

  return Array.from(latestByIdentity.values())
    .sort((a, b) => b.timestamp - a.timestamp || a.index - b.index)
    .map((entry) => entry.row);
}

export function getOpenShiftResponseTotal(counts?: OpenShiftResponseCounts | null) {
  if (!counts) return 0;
  return (
    (counts.no_response || 0) +
    (counts.accepted || 0) +
    (counts.available || 0) +
    (counts.maybe || 0) +
    (counts.declined || 0) +
    (counts.withdrawn || 0)
  );
}

export function getOpenShiftResponseReceivedCount(counts?: OpenShiftResponseCounts | null) {
  if (!counts) return 0;
  return (
    (counts.accepted || 0) +
    (counts.available || 0) +
    (counts.maybe || 0) +
    (counts.declined || 0) +
    (counts.withdrawn || 0)
  );
}

export function getOpenShiftRecipientCount({
  counts,
  selectedCount,
  metadataSelectedCount,
}: {
  counts?: OpenShiftResponseCounts | null;
  selectedCount?: unknown;
  metadataSelectedCount?: number;
}) {
  const parsedSelectedCount = Number.parseInt(asText(selectedCount), 10);
  return Math.max(
    Number.isFinite(parsedSelectedCount) ? parsedSelectedCount : 0,
    metadataSelectedCount || 0,
    getOpenShiftResponseTotal(counts)
  );
}
