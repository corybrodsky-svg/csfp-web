export type AnyRecord = Record<string, unknown>;

export type ImportedEvent = {
  id: string;
  name: string;
  status: string;
  dateText: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  simOp?: string;
  faculty?: string;
  notes?: string;
  spNeeded: number;
  sessionCount: number;
  roomCount: number;
  roomsLabel: string;
  blueprintUrl?: string;
  simFlowUrl?: string;
  raw: AnyRecord;
};

export type SPRecord = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  campus: string;
  status: string;
  notes: string;
  createdAt: string;
};

export type EventAssignment = {
  id: string;
  eventId: string;
  eventName: string;
  spId: string;
  spName: string;
  email: string;
  phone: string;
  confirmed: boolean;
  notes: string;
  createdAt: string;
};

const SPS_KEY = "cfsp-sp-directory-v1";
const ASSIGNMENTS_KEY = "cfsp-event-assignments-v1";

export function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function slugify(value: string): string {
  return safeString(value)
    .toLowerCase()
    .replace(/%20/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getStorageArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function setStorageArray<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(data));
}

export function loadSPDirectory(): SPRecord[] {
  return getStorageArray<SPRecord>(SPS_KEY);
}

export function saveSPDirectory(items: SPRecord[]) {
  setStorageArray(SPS_KEY, items);
}

export function loadAssignments(): EventAssignment[] {
  return getStorageArray<EventAssignment>(ASSIGNMENTS_KEY);
}

export function saveAssignments(items: EventAssignment[]) {
  setStorageArray(ASSIGNMENTS_KEY, items);
}

export function extractPlanningRows(moduleLike: AnyRecord): AnyRecord[] {
  const rows: AnyRecord[] = [];

  Object.values(moduleLike).forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((row) => {
        if (row && typeof row === "object") {
          rows.push(row as AnyRecord);
        }
      });
    }
  });

  return rows;
}

export function normalizeImportedEvent(row: AnyRecord): ImportedEvent {
  const name =
    safeString(row.name) ||
    safeString(row.title) ||
    safeString(row.event_name) ||
    safeString(row.eventName) ||
    "Untitled Event";

  const id =
    safeString(row.id) ||
    safeString(row.event_id) ||
    safeString(row.eventId) ||
    slugify(name);

  return {
    id,
    name,
    status:
      safeString(row.status) ||
      safeString(row.event_status) ||
      safeString(row.eventStatus) ||
      "Draft",
    dateText:
      safeString(row.date_text) ||
      safeString(row.dateText) ||
      safeString(row.event_date) ||
      safeString(row.eventDate) ||
      safeString(row.date) ||
      "No date listed",
    startTime:
      safeString(row.start_time) ||
      safeString(row.startTime) ||
      safeString(row.time_start),
    endTime:
      safeString(row.end_time) ||
      safeString(row.endTime) ||
      safeString(row.time_end),
    location:
      safeString(row.location) ||
      safeString(row.room) ||
      safeString(row.site),
    simOp:
      safeString(row.sim_op) ||
      safeString(row.simOp) ||
      safeString(row.assigned_staff) ||
      safeString(row.staff),
    faculty:
      safeString(row.faculty) ||
      safeString(row.faculty_contact) ||
      safeString(row.leads) ||
      safeString(row.lead),
    notes: safeString(row.notes) || safeString(row.description),
    spNeeded:
      toNumber(row.sp_needed) ||
      toNumber(row.spNeeded) ||
      toNumber(row.needed),
    sessionCount:
      toNumber(row.session_count) ||
      toNumber(row.sessionCount) ||
      toNumber(row.sessions),
    roomCount:
      toNumber(row.room_count) ||
      toNumber(row.roomCount) ||
      toNumber(row.rooms_count),
    roomsLabel:
      safeString(row.rooms_label) ||
      safeString(row.roomsLabel) ||
      safeString(row.rooms) ||
      safeString(row.location) ||
      safeString(row.room) ||
      "—",
    blueprintUrl:
      safeString(row.blueprint_url) ||
      safeString(row.blueprintUrl) ||
      safeString(row.blueprint_link) ||
      safeString(row.blueprintLink) ||
      safeString(row.blueprint) ||
      undefined,
    simFlowUrl:
      safeString(row.sim_flow_url) ||
      safeString(row.simFlowUrl) ||
      safeString(row.sim_flow_link) ||
      safeString(row.simFlowLink) ||
      safeString(row.simFlow) ||
      undefined,
    raw: row,
  };
}

export function buildImportedEvents(moduleLike: AnyRecord): ImportedEvent[] {
  const rows = extractPlanningRows(moduleLike);

  const mapped = rows
    .filter((row) => {
      const maybeName =
        safeString(row.name) ||
        safeString(row.title) ||
        safeString(row.event_name) ||
        safeString(row.eventName);
      return Boolean(maybeName);
    })
    .map(normalizeImportedEvent);

  return mapped.filter(
    (event, index, arr) =>
      arr.findIndex(
        (x) =>
          slugify(x.id) === slugify(event.id) ||
          (slugify(x.name) === slugify(event.name) && x.dateText === event.dateText)
      ) === index
  );
}

export function buildMailtoHref(args: {
  bcc: string[];
  subject: string;
  body: string;
}) {
  const bcc = args.bcc.filter(Boolean).join(",");
  const params = new URLSearchParams();
  if (bcc) params.set("bcc", bcc);
  params.set("subject", args.subject);
  params.set("body", args.body);
  return `mailto:?${params.toString()}`;
}
