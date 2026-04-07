export type ImportedSession = {
  id?: string;
  date?: string;
  room?: string;
  roomRaw?: string;
  startTime?: string;
  endTime?: string;
  employees?: string[];
  lead?: string;
};

export type EventRecord = {
  id: string;
  name: string;
  status: string;
  date_text: string;
  sp_needed: number;
  sp_assigned: number;
  updated_at: string;
  assignedSimOps?: string[];
  leadSimOps?: string[];
  sessions?: ImportedSession[];
};

export type BlueprintSegment = {
  id: string;
  name: string;
  duration: number;
  roomType: string;
  notes?: string;
};

export type EventBlueprint = {
  eventId: string;
  blueprintName: string;
  eventType: string;
  startTime: string;
  rounds: number;
  encounterMinutes: number;
  transitionMinutes: number;
  orientationMinutes: number;
  debriefMinutes: number;
  learnersPerRound: number;
  roomCountOverride: number;
  notes: string;
  segments: BlueprintSegment[];
  updatedAt: string;
};

export type SimFlowRow = {
  label: string;
  start: string;
  end: string;
  kind: "orientation" | "encounter" | "transition" | "debrief";
};

const EVENT_STORAGE_KEY = "cfsp_events_v1";
const BLUEPRINT_STORAGE_KEY = "cfsp_event_blueprints_v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
}

export function parseClockToMinutes(value?: string) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]);
    const minutes = Number(ampmMatch[2]);
    const suffix = ampmMatch[3].toUpperCase();

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

    if (suffix === "AM") {
      if (hours === 12) hours = 0;
    } else if (suffix === "PM") {
      if (hours !== 12) hours += 12;
    }

    return hours * 60 + minutes;
  }

  const twentyFourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourMatch) {
    const hours = Number(twentyFourMatch[1]);
    const minutes = Number(twentyFourMatch[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }

  return null;
}

export function minutesToClock(totalMinutes: number) {
  const safe = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function addMinutesToClock(baseTime: string, minutesToAdd: number) {
  const base = parseClockToMinutes(baseTime);
  if (base === null) return baseTime;
  return minutesToClock(base + minutesToAdd);
}

export function diffMinutes(start?: string, end?: string) {
  const s = parseClockToMinutes(start);
  const e = parseClockToMinutes(end);
  if (s === null || e === null) return null;
  const diff = e - s;
  return diff > 0 ? diff : null;
}

export function formatIsoDateShort(value?: string) {
  if (!value) return "TBD";

  const raw = String(value).trim();
  if (!raw) return "TBD";
  if (raw.toLowerCase().includes("nan")) return "TBD";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parts = raw.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return `${month}/${day}/${String(year).slice(-2)}`;
    }
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(raw)) {
    return raw;
  }

  return "TBD";
}

function sanitizeLegacyDateText(value?: string) {
  if (!value) return "";

  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.toLowerCase().includes("nan")) return "";

  const cleanedParts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => formatIsoDateShort(part))
    .filter((part) => part !== "TBD");

  return cleanedParts.join(", ");
}

export function getStoredEvents(): EventRecord[] {
  const parsed = readJson<unknown>(EVENT_STORAGE_KEY, []);
  return Array.isArray(parsed) ? (parsed as EventRecord[]) : [];
}

export function getSortedEvents() {
  const events = getStoredEvents();

  return [...events].sort((a, b) => {
    const aDate =
      (a.sessions || [])
        .map((session) => String(session.date || ""))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .sort()[0] || "9999-12-31";

    const bDate =
      (b.sessions || [])
        .map((session) => String(session.date || ""))
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .sort()[0] || "9999-12-31";

    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.name.localeCompare(b.name);
  });
}

export function getEventById(eventId: string) {
  return getStoredEvents().find((event) => event.id === eventId);
}

export function getEventRooms(event: EventRecord) {
  return uniqueStrings(
    (event.sessions || []).map((session) => session.room || session.roomRaw || "")
  );
}

export function getEventSimOps(event: EventRecord) {
  const direct = uniqueStrings(event.assignedSimOps || []);
  if (direct.length) return direct;

  return uniqueStrings(
    (event.sessions || []).flatMap((session) => session.employees || [])
  );
}

export function getEventLeads(event: EventRecord) {
  const direct = uniqueStrings(event.leadSimOps || []);
  if (direct.length) return direct;

  return uniqueStrings(
    (event.sessions || []).map((session) => session.lead || "")
  );
}

export function getEventDateLabel(event: EventRecord) {
  const dates = uniqueStrings(
    (event.sessions || [])
      .map((session) => session.date || "")
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
  ).sort();

  if (dates.length) {
    return dates.map(formatIsoDateShort).join(", ");
  }

  const cleanedFallback = sanitizeLegacyDateText(event.date_text);
  return cleanedFallback || "Date TBD";
}

export function inferEventStartTime(event: EventRecord) {
  const starts = (event.sessions || [])
    .map((session) => session.startTime || "")
    .filter(Boolean)
    .map((value) => ({
      raw: value,
      minutes: parseClockToMinutes(value),
    }))
    .filter((item) => item.minutes !== null) as { raw: string; minutes: number }[];

  if (!starts.length) return "08:10";

  starts.sort((a, b) => a.minutes - b.minutes);
  return minutesToClock(starts[0].minutes);
}

export function inferEncounterMinutes(event: EventRecord) {
  const firstWithTimes = (event.sessions || []).find(
    (session) => diffMinutes(session.startTime, session.endTime) !== null
  );

  const duration = diffMinutes(firstWithTimes?.startTime, firstWithTimes?.endTime);
  return duration && duration > 0 ? duration : 20;
}

export function inferRoomCount(event: EventRecord) {
  const rooms = getEventRooms(event);
  return rooms.length || 1;
}

export function inferLearnersPerRound(event: EventRecord) {
  const roomCount = inferRoomCount(event);
  return roomCount;
}

function cryptoSafeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildDefaultBlueprint(event: EventRecord): EventBlueprint {
  const encounterMinutes = inferEncounterMinutes(event);

  return {
    eventId: event.id,
    blueprintName: `${event.name} Blueprint`,
    eventType: "Custom",
    startTime: inferEventStartTime(event),
    rounds: Math.max(1, Math.min((event.sessions || []).length || 1, 12)),
    encounterMinutes,
    transitionMinutes: 5,
    orientationMinutes: 10,
    debriefMinutes: 10,
    learnersPerRound: inferLearnersPerRound(event),
    roomCountOverride: inferRoomCount(event),
    notes: "",
    segments: [
      {
        id: cryptoSafeId("orientation"),
        name: "Orientation",
        duration: 10,
        roomType: "Classroom",
      },
      {
        id: cryptoSafeId("encounter"),
        name: "Encounter",
        duration: encounterMinutes,
        roomType: "Exam Room",
      },
      {
        id: cryptoSafeId("debrief"),
        name: "Debrief",
        duration: 10,
        roomType: "Debrief Room",
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function getStoredBlueprints(): EventBlueprint[] {
  const parsed = readJson<unknown>(BLUEPRINT_STORAGE_KEY, []);
  return Array.isArray(parsed) ? (parsed as EventBlueprint[]) : [];
}

export function getBlueprintForEvent(eventId: string) {
  return getStoredBlueprints().find((item) => item.eventId === eventId);
}

export function saveBlueprint(blueprint: EventBlueprint) {
  const existing = getStoredBlueprints();
  const filtered = existing.filter((item) => item.eventId !== blueprint.eventId);
  const next = [{ ...blueprint, updatedAt: new Date().toISOString() }, ...filtered];
  writeJson(BLUEPRINT_STORAGE_KEY, next);
  return next;
}

export function buildSimFlow(event: EventRecord, blueprint: EventBlueprint) {
  const roomCount = blueprint.roomCountOverride || inferRoomCount(event);
  const learnersPerRound = blueprint.learnersPerRound || inferLearnersPerRound(event);

  const rows: SimFlowRow[] = [];
  let current = blueprint.startTime || inferEventStartTime(event);

  if (blueprint.orientationMinutes > 0) {
    const end = addMinutesToClock(current, blueprint.orientationMinutes);
    rows.push({
      label: "Orientation",
      start: current,
      end,
      kind: "orientation",
    });
    current = end;
  }

  for (let round = 1; round <= blueprint.rounds; round += 1) {
    const encounterEnd = addMinutesToClock(current, blueprint.encounterMinutes);
    rows.push({
      label: `Round ${round} Encounter`,
      start: current,
      end: encounterEnd,
      kind: "encounter",
    });
    current = encounterEnd;

    if (blueprint.transitionMinutes > 0 && round < blueprint.rounds) {
      const transitionEnd = addMinutesToClock(current, blueprint.transitionMinutes);
      rows.push({
        label: `Round ${round} Transition`,
        start: current,
        end: transitionEnd,
        kind: "transition",
      });
      current = transitionEnd;
    }
  }

  if (blueprint.debriefMinutes > 0) {
    const end = addMinutesToClock(current, blueprint.debriefMinutes);
    rows.push({
      label: "Debrief",
      start: current,
      end,
      kind: "debrief",
    });
    current = end;
  }

  const totalMinutes =
    blueprint.orientationMinutes +
    blueprint.rounds * blueprint.encounterMinutes +
    Math.max(0, blueprint.rounds - 1) * blueprint.transitionMinutes +
    blueprint.debriefMinutes;

  return {
    rows,
    endTime: current,
    totalMinutes,
    roomCount,
    learnersPerRound,
    roomPressure:
      learnersPerRound > roomCount ? "Over capacity risk" : "Within stated capacity",
    approxSPLoad: Math.min(roomCount, learnersPerRound),
    importedSessionCount: (event.sessions || []).length,
    importedDateLabel: getEventDateLabel(event),
  };
}
