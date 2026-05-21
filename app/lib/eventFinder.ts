import { classifyEventPresentation, getEventBadgeAppearance } from "./eventClassification";
import { getBestEventTeamInfo } from "./eventRoster";

export type FinderChipKey =
  | "needs_staffing"
  | "training_soon"
  | "live_today"
  | "materials_needed"
  | "recording_pending";

export type EventFinderScope = "my" | "all";

export type EventFinderEventRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  date_text?: string | null;
  location?: string | null;
  sp_needed?: number | null;
  sp_assigned?: number | null;
  total_assignments?: number | null;
  confirmed_assignments?: number | null;
  shortage?: number | null;
  assigned_sp_names?: string[] | null;
  visibility?: string | null;
  notes?: string | null;
  schedule_owner_text?: string | null;
  earliest_session_date?: string | null;
  latest_session_date?: string | null;
  earliest_session_start?: string | null;
  latest_session_end?: string | null;
  session_locations?: string[] | null;
  sessions?: Array<{
    session_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    room?: string | null;
  }>;
};

export type FinderIndexedEvent = {
  event: EventFinderEventRecord;
  eventId: string;
  eventName: string;
  eventLocation: string;
  searchText: string;
  nameText: string;
  eventTypeLabel: string;
  staffingLabel: string;
  shortageLabel: string;
  trainingLabel: string;
  modalityLabel: string;
  modeLabel: string;
  dateLabel: string;
  needsAttention: boolean;
  isUpcomingOrCurrent: boolean;
  hasTrainingOrMaterialContext: boolean;
  chipMatches: Record<FinderChipKey, boolean>;
  start: Date | null;
  needed: number;
  assigned: number;
  confirmed: number;
  shortage: number;
};

export type FinderResult = {
  entry: FinderIndexedEvent;
  score: number;
};

export const FINDER_CHIPS: Array<{ key: FinderChipKey; label: string }> = [
  { key: "needs_staffing", label: "Needs Staffing" },
  { key: "training_soon", label: "Training Soon" },
  { key: "live_today", label: "Live / Today" },
  { key: "materials_needed", label: "Materials Needed" },
  { key: "recording_pending", label: "Recording Pending" },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

export function parseFinderEventStart(event: EventFinderEventRecord): Date | null {
  if (event.earliest_session_date) {
    const datePart = event.earliest_session_date;
    const timePart = event.earliest_session_start || "00:00:00";
    const dt = new Date(`${datePart}T${timePart}`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const firstSession = Array.isArray(event.sessions) && event.sessions.length > 0 ? event.sessions[0] : null;
  if (firstSession?.session_date) {
    const iso = `${firstSession.session_date}T${firstSession.start_time || "00:00:00"}`;
    const dt = new Date(iso);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  if (event.date_text) {
    const dt = new Date(event.date_text);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return null;
}

function getStartOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function eventLocation(event: EventFinderEventRecord) {
  const firstSession = Array.isArray(event.sessions) && event.sessions.length > 0 ? event.sessions[0] : null;
  return (
    asText(firstSession?.location) ||
    asText(firstSession?.room) ||
    asText(event.location) ||
    asText(event.session_locations?.[0]) ||
    "Location TBD"
  );
}

export function formatFinderDate(start: Date | null, fallback?: string | null) {
  if (!start) return fallback || "Date TBD";
  return start.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getEventBadges(event: EventFinderEventRecord) {
  const presentation = classifyEventPresentation({
    name: event.name,
    status: event.status,
    notes: event.notes,
    location: event.location,
    spNeeded: event.sp_needed,
    assignmentCount: event.total_assignments ?? event.sp_assigned,
    confirmedCount: event.confirmed_assignments ?? event.sp_assigned,
  });

  return presentation.activeBadgeKinds.map((kind) => ({
    key: kind,
    label:
      kind === "virtual_sp" && presentation.primaryBadgeKind !== "virtual_sp"
        ? "Virtual"
        : getEventBadgeAppearance(kind) &&
            (kind === "training"
              ? "Training"
              : kind === "virtual_sp"
                ? "Virtual SP"
                : kind === "hifi"
                  ? "HiFi"
                  : kind === "skills_workshop"
                    ? "Skills"
                    : "SP Event"),
  }));
}

function getPrimaryEventTypeLabel(event: EventFinderEventRecord) {
  return asText(getEventBadges(event)[0]?.label) || "Event";
}

export function normalizeFinderText(value: unknown) {
  return asText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fuzzyTokenMatches(token: string, candidate: string) {
  if (!token) return true;
  if (candidate.includes(token)) return true;

  let tokenIndex = 0;
  for (const char of candidate) {
    if (char === token[tokenIndex]) tokenIndex += 1;
    if (tokenIndex === token.length) return true;
  }
  return false;
}

function getEventModalityLabel(event: EventFinderEventRecord) {
  const text = normalizeFinderText([event.name, event.status, event.location, event.notes].join(" "));
  if (/\b(zoom|virtual|telehealth|remote|online)\b/.test(text)) return "Virtual";
  if (/\b(hybrid)\b/.test(text)) return "Hybrid";
  return "In Person";
}

function getTrainingReadinessLabel(event: EventFinderEventRecord) {
  const text = normalizeFinderText([event.name, event.status, event.notes].join(" "));
  if (/\b(training ready|training complete|training completed|materials ready|recording ready)\b/.test(text)) {
    return "Training Ready";
  }
  if (/\b(training planned|training scheduled|training date|training link|zoom link|sp training)\b/.test(text)) {
    return "Training Planned";
  }
  if (text.includes("training")) return "Training Review";
  return "Training TBD";
}

function getFinderModeLabel(event: EventFinderEventRecord, start: Date | null) {
  const status = normalizeFinderText(event.status);
  if (/\b(live|in progress|running)\b/.test(status)) return "Live Mode";
  if (start && getStartOfDay(start) === getStartOfToday()) return "Live Today";
  return "Planning Mode";
}

function getEventFinderSearchText(event: EventFinderEventRecord) {
  const teamInfo = getBestEventTeamInfo({
    notes: event.notes,
    schedule_owner_text: event.schedule_owner_text,
  });
  const badges = getEventBadges(event).map((badge) => badge.label);
  const sessionText = (event.sessions || [])
    .map((session) =>
      [session.session_date, session.start_time, session.end_time, session.location, session.room]
        .map(asText)
        .join(" ")
    )
    .join(" ");

  return normalizeFinderText(
    [
      event.name,
      event.status,
      event.date_text,
      event.location,
      event.notes,
      event.schedule_owner_text,
      eventLocation(event),
      sessionText,
      event.session_locations?.join(" "),
      teamInfo.teamLabel,
      teamInfo.facultyLabel,
      ...teamInfo.teamNames,
      ...teamInfo.facultyNames,
      ...badges,
      getPrimaryEventTypeLabel(event),
      getTrainingReadinessLabel(event),
      getEventModalityLabel(event),
      ...(event.assigned_sp_names || []),
    ].join(" ")
  );
}

function isEventToday(start: Date | null, statusText: string) {
  if (/\b(live|in progress|running)\b/.test(statusText)) return true;
  return Boolean(start && getStartOfDay(start) === getStartOfToday());
}

function isEventUpcomingOrCurrent(event: EventFinderEventRecord, start: Date | null) {
  const text = normalizeFinderText(event.status);
  if (/\b(live|in progress|running)\b/.test(text)) return true;
  if (!start) return false;
  return start.getTime() >= Date.now() - 6 * 60 * 60 * 1000;
}

function isEventTrainingSoonWithSearchText(start: Date | null, searchText: string) {
  if (!/\b(training|zoom|training planned|training scheduled|training date|sp training)\b/.test(searchText)) {
    return false;
  }
  if (!start) return true;
  const daysUntilEvent = Math.floor((start.getTime() - Date.now()) / MS_PER_DAY);
  return daysUntilEvent >= -1 && daysUntilEvent <= 21;
}

function eventMaterialsNeedReviewWithSearchText(searchText: string) {
  return /\b(materials needed|material needed|awaiting faculty materials|awaiting materials|materials uploaded review needed|materials uploaded review)\b/.test(
    searchText
  );
}

function eventRecordingPendingWithSearchText(searchText: string) {
  return /\b(recording pending|recording planned|recording status pending|recording status planned|recording review)\b/.test(
    searchText
  );
}

export function buildFinderIndexedEvent(event: EventFinderEventRecord): FinderIndexedEvent {
  const start = parseFinderEventStart(event);
  const needed = Math.max(0, parseNumber(event.sp_needed));
  const assigned = Math.max(0, parseNumber(event.total_assignments ?? event.sp_assigned));
  const confirmed = Math.max(0, parseNumber(event.confirmed_assignments ?? event.sp_assigned));
  const shortage = Math.max(0, parseNumber(event.shortage) || Math.max(needed - confirmed, 0));
  const searchText = getEventFinderSearchText(event);
  const nameText = normalizeFinderText(event.name);
  const eventTypeLabel = getPrimaryEventTypeLabel(event);
  const trainingLabel = getTrainingReadinessLabel(event);
  const modalityLabel = getEventModalityLabel(event);
  const modeLabel = getFinderModeLabel(event, start);
  const staffingLabel =
    needed <= 0 ? "No SP target" : shortage > 0 ? "Staffing gap" : "Coverage ready";
  const shortageLabel = shortage > 0 ? `${shortage} SP shortage` : needed > 0 ? "Coverage met" : "No shortage";
  const dateLabel = formatFinderDate(start, event.date_text);
  const isUpcomingOrCurrent = isEventUpcomingOrCurrent(event, start);
  const trainingSoon = isEventTrainingSoonWithSearchText(start, searchText);
  const materialsNeeded = eventMaterialsNeedReviewWithSearchText(searchText);
  const recordingPending = eventRecordingPendingWithSearchText(searchText);
  const liveToday = isEventToday(start, normalizeFinderText(event.status));
  const hasTrainingOrMaterialContext =
    trainingLabel !== "Training TBD" || /\b(material|materials|zoom|training)\b/.test(searchText);
  const needsAttention = shortage > 0 || materialsNeeded || recordingPending || trainingSoon;

  return {
    event,
    eventId: event.id,
    eventName: asText(event.name) || "Untitled Event",
    eventLocation: eventLocation(event),
    searchText,
    nameText,
    eventTypeLabel,
    staffingLabel,
    shortageLabel,
    trainingLabel,
    modalityLabel,
    modeLabel,
    dateLabel,
    needsAttention,
    isUpcomingOrCurrent,
    hasTrainingOrMaterialContext,
    chipMatches: {
      needs_staffing: shortage > 0,
      training_soon: trainingSoon,
      live_today: liveToday,
      materials_needed: materialsNeeded,
      recording_pending: recordingPending,
    },
    start,
    needed,
    assigned,
    confirmed,
    shortage,
  };
}

export function scoreFinderIndexedEntry(
  entry: FinderIndexedEvent,
  query: string,
  options: {
    activeChip?: FinderChipKey | null;
    myEventIds?: Set<string>;
    scope?: EventFinderScope;
  } = {}
) {
  const normalizedQuery = normalizeFinderText(query);
  if (options.activeChip && !entry.chipMatches[options.activeChip]) return 0;
  if (!normalizedQuery && !options.activeChip) return 0;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  let score = options.activeChip ? 100 : 0;

  for (const token of tokens) {
    if (!fuzzyTokenMatches(token, entry.searchText)) return 0;
    if (entry.nameText === token) score += 96;
    else if (entry.nameText.startsWith(token)) score += 54;
    else if (entry.nameText.includes(token)) score += 38;
    else if (entry.searchText.includes(token)) score += 18;
    else score += 8;
  }

  if (normalizedQuery) {
    if (entry.nameText === normalizedQuery) score += 520;
    else if (entry.nameText.startsWith(normalizedQuery)) score += 180;
    else if (entry.nameText.includes(normalizedQuery)) score += 120;
  }

  if (entry.isUpcomingOrCurrent) score += 60;
  if (options.scope === "my" && options.myEventIds?.has(entry.eventId)) score += 48;
  if (entry.needsAttention) score += 34;
  if (entry.start) {
    const daysUntilEvent = Math.floor((entry.start.getTime() - Date.now()) / MS_PER_DAY);
    if (daysUntilEvent >= 0) score += Math.max(0, 28 - Math.min(28, daysUntilEvent));
  }

  return score;
}

export function isEditableFinderTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
