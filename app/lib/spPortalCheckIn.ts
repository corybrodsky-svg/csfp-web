import type { TrainingEventMetadata } from "./trainingEventNotes";

export type SpPortalCheckInMethod = "location_verified" | "location_failed" | "manual";
export type SpPortalCheckInWindowStatus = "ready" | "not_open" | "closed" | "missing_time";

export type SpPortalCheckInMetadata = {
  checkInMethod: SpPortalCheckInMethod | "";
  locationVerified: boolean | null;
  distanceMeters: number | null;
  accuracyMeters: number | null;
  checkedInAt: string;
  attemptedAt: string;
  updatedAt: string;
  failureReason: string;
  manualOverride: string;
};

export type SpPortalCheckInWindow = {
  status: SpPortalCheckInWindowStatus;
  canCheckIn: boolean;
  opensAt: string | null;
  closesAt: string | null;
  message: string;
};

export type SpPortalCheckInGeofence = {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  ready: boolean;
};

export type SpPortalCheckInEventTiming = {
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

const CHECK_IN_METADATA_START = "[CFSP_SP_CHECK_IN_METADATA]";
const CHECK_IN_METADATA_END = "[/CFSP_SP_CHECK_IN_METADATA]";
const DEFAULT_CHECK_IN_RADIUS_METERS = 150;
const CHECK_IN_OPEN_LEAD_MS = 2 * 60 * 60 * 1000;
const FALLBACK_CHECK_IN_DURATION_MS = 2 * 60 * 60 * 1000;
const DEMO_CHECKIN_WINDOW_BUFFER_MS = 2 * 60 * 60 * 1000;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseFiniteNumber(value: unknown) {
  const numeric = Number(asText(value));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseBoolean(value: unknown) {
  const text = asText(value).toLowerCase();
  if (text === "true" || text === "yes" || text === "1") return true;
  if (text === "false" || text === "no" || text === "0") return false;
  return null;
}

export function normalizeSpPortalCheckInMethod(value: unknown): SpPortalCheckInMethod | "" {
  const method = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (method === "location_verified" || method === "location_failed" || method === "manual") return method;
  return "";
}

export function emptySpPortalCheckInMetadata(): SpPortalCheckInMetadata {
  return {
    checkInMethod: "",
    locationVerified: null,
    distanceMeters: null,
    accuracyMeters: null,
    checkedInAt: "",
    attemptedAt: "",
    updatedAt: "",
    failureReason: "",
    manualOverride: "",
  };
}

export function stripSpPortalCheckInMetadata(notes?: string | null) {
  return asText(notes)
    .replace(/\n?\[CFSP_SP_CHECK_IN_METADATA\][\s\S]*?\[\/CFSP_SP_CHECK_IN_METADATA\]\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSpPortalCheckInMetadataBlock(notes?: string | null) {
  const text = asText(notes);
  const startIndex = text.indexOf(CHECK_IN_METADATA_START);
  const endIndex = text.indexOf(CHECK_IN_METADATA_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return "";
  return text.slice(startIndex + CHECK_IN_METADATA_START.length, endIndex).trim();
}

export function parseSpPortalCheckInMetadata(notes?: string | null): SpPortalCheckInMetadata {
  const metadata = emptySpPortalCheckInMetadata();
  const block = getSpPortalCheckInMetadataBlock(notes);
  if (!block) return metadata;

  block.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (!match) return;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === "check_in_method") metadata.checkInMethod = normalizeSpPortalCheckInMethod(value);
    if (key === "location_verified") metadata.locationVerified = parseBoolean(value);
    if (key === "distance_meters") metadata.distanceMeters = parseFiniteNumber(value);
    if (key === "accuracy_meters") metadata.accuracyMeters = parseFiniteNumber(value);
    if (key === "checked_in_at") metadata.checkedInAt = value;
    if (key === "attempted_at") metadata.attemptedAt = value;
    if (key === "updated_at") metadata.updatedAt = value;
    if (key === "failure_reason") metadata.failureReason = value;
    if (key === "manual_override") metadata.manualOverride = value;
  });

  return metadata;
}

function formatOptionalNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(Math.round(value));
}

export function upsertSpPortalCheckInMetadata(
  notes: string | null | undefined,
  patch: Partial<{
    checkInMethod: SpPortalCheckInMethod | "";
    locationVerified: boolean | null;
    distanceMeters: number | null;
    accuracyMeters: number | null;
    checkedInAt: string | null;
    attemptedAt: string | null;
    updatedAt: string | null;
    failureReason: string | null;
    manualOverride: string | null;
  }>
) {
  const current = parseSpPortalCheckInMetadata(notes);
  const next = {
    ...current,
    ...patch,
  };

  const entries = ([
    ["check_in_method", normalizeSpPortalCheckInMethod(next.checkInMethod)],
    ["location_verified", next.locationVerified === null || next.locationVerified === undefined ? "" : String(next.locationVerified)],
    ["distance_meters", formatOptionalNumber(next.distanceMeters)],
    ["accuracy_meters", formatOptionalNumber(next.accuracyMeters)],
    ["checked_in_at", asText(next.checkedInAt)],
    ["attempted_at", asText(next.attemptedAt)],
    ["updated_at", asText(next.updatedAt)],
    ["failure_reason", asText(next.failureReason)],
    ["manual_override", asText(next.manualOverride)],
  ] as Array<[string, string]>).filter((entry) => Boolean(entry[1]));

  const visibleNotes = stripSpPortalCheckInMetadata(notes);
  if (!entries.length) return visibleNotes;
  const block = [CHECK_IN_METADATA_START, ...entries.map(([key, value]) => `${key}: ${value}`), CHECK_IN_METADATA_END].join("\n");
  return visibleNotes ? `${block}\n${visibleNotes}` : block;
}

function parseDateTime(value?: string | null, time?: string | null) {
  const dateText = asText(value);
  if (!dateText) return null;
  const timeText = asText(time) || "00:00:00";
  const isoLike = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
    ? `${dateText}T${timeText}`
    : `${dateText} ${timeText}`;
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function buildSpPortalCheckInWindow(
  event: SpPortalCheckInEventTiming | null | undefined,
  nowMs = Date.now(),
  metadata: Partial<
    Pick<
      TrainingEventMetadata,
      "sp_portal_checkin_demo_window_open" | "sp_portal_checkin_demo_window_open_until"
    >
  > = {}
): SpPortalCheckInWindow {
  const demoWindowEnabled = isDemoCheckInWindowOverrideEnabled({
    sp_portal_checkin_demo_window_open: asText(metadata.sp_portal_checkin_demo_window_open),
    sp_portal_checkin_demo_window_open_until: asText(metadata.sp_portal_checkin_demo_window_open_until),
  });

  if (demoWindowEnabled) {
    const now = new Date(nowMs);
    const expiresText = asText(metadata.sp_portal_checkin_demo_window_open_until);
    const explicitCloseAt = Date.parse(expiresText);
    const closes = Number.isNaN(explicitCloseAt) ? nowMs + DEMO_CHECKIN_WINDOW_BUFFER_MS : explicitCloseAt;
    return {
      status: "ready",
      canCheckIn: true,
      opensAt: new Date(nowMs - 60 * 1000).toISOString(),
      closesAt: new Date(Math.max(now.getTime(), Math.min(closes, nowMs + FALLBACK_CHECK_IN_DURATION_MS))).toISOString(),
      message: "Demo check-in window is open.",
    };
  }

  const start = parseDateTime(event?.date, event?.start_time);
  if (!start) {
    return {
      status: "missing_time",
      canCheckIn: false,
      opensAt: null,
      closesAt: null,
      message: "Check-in time is not set up yet.",
    };
  }

  const parsedEnd = parseDateTime(event?.date, event?.end_time);
  const end = parsedEnd && parsedEnd.getTime() > start.getTime()
    ? parsedEnd
    : new Date(start.getTime() + FALLBACK_CHECK_IN_DURATION_MS);
  const opens = new Date(start.getTime() - CHECK_IN_OPEN_LEAD_MS);
  const now = nowMs;

  if (now < opens.getTime()) {
    return {
      status: "not_open",
      canCheckIn: false,
      opensAt: opens.toISOString(),
      closesAt: end.toISOString(),
      message: "Check-in is not open yet.",
    };
  }

  if (now > end.getTime()) {
    return {
      status: "closed",
      canCheckIn: false,
      opensAt: opens.toISOString(),
      closesAt: end.toISOString(),
      message: "Check-in is closed for this event.",
    };
  }

  return {
    status: "ready",
    canCheckIn: true,
    opensAt: opens.toISOString(),
    closesAt: end.toISOString(),
    message: "Check-in is open.",
  };
}

function isDemoCheckInWindowOverrideEnabled(metadata: Pick<
  TrainingEventMetadata,
  "sp_portal_checkin_demo_window_open" | "sp_portal_checkin_demo_window_open_until"
>) {
  if (!isDemoCheckInWindowOverrideAllowed()) return false;
  if (parseBoolean(metadata.sp_portal_checkin_demo_window_open) !== true) return false;
  const expiresText = asText(metadata.sp_portal_checkin_demo_window_open_until);
  if (!expiresText) return true;
  const expiresAt = Date.parse(expiresText);
  if (Number.isNaN(expiresAt)) return false;
  return Date.now() <= expiresAt;
}

function isDemoCheckInWindowOverrideAllowed() {
  const target = asText(process.env.CFSP_DEMO_SEED_TARGET).toLowerCase();
  return process.env.CFSP_ALLOW_DEMO_SEED === "true" && target === "dev" && process.env.NODE_ENV !== "production";
}

export function getSpPortalCheckInGeofence(metadata: Pick<TrainingEventMetadata, "sp_portal_checkin_latitude" | "sp_portal_checkin_longitude" | "sp_portal_checkin_radius_meters">): SpPortalCheckInGeofence {
  const latitude = parseFiniteNumber(metadata.sp_portal_checkin_latitude);
  const longitude = parseFiniteNumber(metadata.sp_portal_checkin_longitude);
  const radius = parseFiniteNumber(metadata.sp_portal_checkin_radius_meters);
  const radiusMeters = radius && radius > 0 ? radius : DEFAULT_CHECK_IN_RADIUS_METERS;
  return {
    latitude,
    longitude,
    radiusMeters,
    ready: latitude !== null && longitude !== null,
  };
}

export function getHaversineDistanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildSpPortalCheckInSummary(
  attendance: { status?: unknown; checked_in_at?: unknown; notes?: unknown } | null | undefined,
  event: SpPortalCheckInEventTiming | null | undefined,
  metadata: TrainingEventMetadata,
  nowMs = Date.now()
) {
  const checkInMetadata = parseSpPortalCheckInMetadata(asText(attendance?.notes));
  const window = buildSpPortalCheckInWindow(event, nowMs, metadata);
  const geofence = getSpPortalCheckInGeofence(metadata);
  return {
    canCheckIn: window.canCheckIn && geofence.ready,
    windowStatus: window.status,
    windowMessage: window.message,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
    geofenceReady: geofence.ready,
    radiusMeters: geofence.ready ? geofence.radiusMeters : null,
    method: checkInMetadata.checkInMethod || null,
    locationVerified: checkInMetadata.locationVerified,
    distanceMeters: checkInMetadata.distanceMeters,
    accuracyMeters: checkInMetadata.accuracyMeters,
    attemptedAt: checkInMetadata.attemptedAt || null,
    failureReason: checkInMetadata.failureReason || null,
  };
}
