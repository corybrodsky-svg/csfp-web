export type AnnouncementCuePersistentStatus = "delivered" | "skipped";

export type AnnouncementCueStateRecord = {
  status?: AnnouncementCuePersistentStatus;
  updatedAt?: string;
  updatedBy?: string;
  snoozedUntil?: string;
};

export type AnnouncementAlertSettings = {
  liveModeActive?: boolean;
  muteAlerts?: boolean;
  notificationsEnabled?: boolean;
  lastStartedAt?: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseJsonRecord<T>(value: string, fallback: T) {
  const text = asText(value);
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function parseAnnouncementCueOverrides(value?: string | null) {
  const parsed = parseJsonRecord<Record<string, unknown>>(asText(value), {});
  return Object.fromEntries(
    Object.entries(parsed)
      .map(([key, entryValue]) => [asText(key), asText(entryValue)])
      .filter(([key, entryValue]) => key && entryValue)
  ) as Record<string, string>;
}

export function serializeAnnouncementCueOverrides(value: Record<string, string>) {
  const normalized = Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [asText(key), asText(entryValue)])
      .filter(([key, entryValue]) => key && entryValue)
  );
  return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
}

export function parseAnnouncementCueState(value?: string | null) {
  const parsed = parseJsonRecord<Record<string, AnnouncementCueStateRecord | null | undefined>>(asText(value), {});
  const normalized: Record<string, AnnouncementCueStateRecord> = {};
  Object.entries(parsed).forEach(([key, entryValue]) => {
    const normalizedKey = asText(key);
    if (!normalizedKey || !entryValue || typeof entryValue !== "object") return;
    const normalizedStatus =
      entryValue.status === "delivered" || entryValue.status === "skipped"
        ? entryValue.status
        : undefined;
    normalized[normalizedKey] = {
      status: normalizedStatus,
      updatedAt: asText(entryValue.updatedAt),
      updatedBy: asText(entryValue.updatedBy),
      snoozedUntil: asText(entryValue.snoozedUntil),
    };
  });
  return normalized;
}

export function serializeAnnouncementCueState(value: Record<string, AnnouncementCueStateRecord>) {
  const normalized: Record<string, AnnouncementCueStateRecord> = {};
  Object.entries(value).forEach(([key, entryValue]) => {
    const normalizedKey = asText(key);
    if (!normalizedKey) return;
    const status =
      entryValue.status === "delivered" || entryValue.status === "skipped"
        ? entryValue.status
        : undefined;
    const record: AnnouncementCueStateRecord = {
      ...(status ? { status } : {}),
      ...(asText(entryValue.updatedAt) ? { updatedAt: asText(entryValue.updatedAt) } : {}),
      ...(asText(entryValue.updatedBy) ? { updatedBy: asText(entryValue.updatedBy) } : {}),
      ...(asText(entryValue.snoozedUntil) ? { snoozedUntil: asText(entryValue.snoozedUntil) } : {}),
    };
    if (Object.keys(record).length) {
      normalized[normalizedKey] = record;
    }
  });
  return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
}

export function parseAnnouncementAlertSettings(value?: string | null): AnnouncementAlertSettings {
  const parsed = parseJsonRecord<Record<string, unknown>>(asText(value), {});
  return {
    liveModeActive: parsed.liveModeActive === true,
    muteAlerts: parsed.muteAlerts === true,
    notificationsEnabled: parsed.notificationsEnabled === true,
    lastStartedAt: asText(parsed.lastStartedAt),
  };
}

export function serializeAnnouncementAlertSettings(value: AnnouncementAlertSettings) {
  const normalized = {
    ...(value.liveModeActive ? { liveModeActive: true } : {}),
    ...(value.muteAlerts ? { muteAlerts: true } : {}),
    ...(value.notificationsEnabled ? { notificationsEnabled: true } : {}),
    ...(asText(value.lastStartedAt) ? { lastStartedAt: asText(value.lastStartedAt) } : {}),
  };
  return Object.keys(normalized).length ? JSON.stringify(normalized) : "";
}

export function formatCueCountdown(deltaMinutes: number | null) {
  if (deltaMinutes === null || !Number.isFinite(deltaMinutes)) return "Timing unavailable";
  const roundedSeconds = Math.max(0, Math.round(deltaMinutes * 60));
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
