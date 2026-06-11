"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import type { SpPortalAcknowledgmentKey, SpPortalAcknowledgmentState } from "../lib/spPortalAcknowledgments";

type PortalEventSummary = {
  id: string;
  name: string;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  room?: string | null;
};

type PortalOpeningSummary = {
  id?: string | null;
  title?: string | null;
  shift_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  room?: string | null;
};

type PortalResponseRecord = {
  id: string;
  openingId?: string | null;
  response?: string | null;
  source?: string | null;
  message?: string | null;
  responded_at?: string | null;
  updated_at?: string | null;
  event?: PortalEventSummary | null;
  opening?: PortalOpeningSummary | null;
};

type PortalOpenShift = {
  openingId: string;
  title: string;
  shift_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  room?: string | null;
  needed_count?: number | null;
  requirements?: string | null;
  notes?: string | null;
  event: PortalEventSummary;
  currentResponse?: {
    id?: string | null;
    response?: string | null;
    source?: string | null;
    responded_at?: string | null;
    updated_at?: string | null;
  } | null;
};

type PortalAttendanceRecord = {
  id: string;
  eventId?: string | null;
  status?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  updated_at?: string | null;
  event?: PortalEventSummary | null;
  checkIn?: PortalCheckInState | null;
};

type PortalCheckInState = {
  canCheckIn?: boolean | null;
  windowStatus?: "ready" | "not_open" | "closed" | "missing_time" | string | null;
  windowMessage?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  geofenceReady?: boolean | null;
  radiusMeters?: number | null;
  method?: "location_verified" | "location_failed" | "manual" | string | null;
  locationVerified?: boolean | null;
  distanceMeters?: number | null;
  accuracyMeters?: number | null;
  attemptedAt?: string | null;
  failureReason?: string | null;
};

type PortalAssignedEvent = {
  id: string;
  assignmentId?: string | null;
  eventId?: string | null;
  status?: string | null;
  confirmed?: boolean | null;
  acknowledgments?: SpPortalAcknowledgmentState | null;
  role?: string | null;
  event?: PortalEventSummary | null;
  location?: string | null;
  virtualLink?: string | null;
  arrivalInstructions?: string | null;
  eventNote?: string | null;
  reportCallTime?: string | null;
  releaseEndTime?: string | null;
  training?: {
    date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    instructions?: string | null;
    link?: string | null;
    password?: string | null;
  } | null;
  caseInfo?: {
    name?: string | null;
    note?: string | null;
  } | null;
  materials?: Array<{
    key: string;
    label: string;
    name: string;
    url: string;
  }>;
  materialsReleased?: boolean | null;
  materialStatus?: string | null;
  schedule?: {
    released?: boolean | null;
    status?: string | null;
    roundCount?: string | null;
    roomCount?: string | null;
    encounterMinutes?: string | null;
    feedbackMinutes?: string | null;
    transitionMinutes?: string | null;
  } | null;
  attendance?: {
    id?: string | null;
    status?: string | null;
    checked_in_at?: string | null;
    checked_out_at?: string | null;
    updated_at?: string | null;
    checkIn?: PortalCheckInState | null;
  } | null;
  checkIn?: PortalCheckInState | null;
};

type PortalUpcomingItem = {
  id: string;
  source?: string | null;
  status?: string | null;
  confirmed?: boolean | null;
  created_at?: string | null;
  response?: string | null;
  openingId?: string | null;
  openingTitle?: string | null;
  shift_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  event?: PortalEventSummary | null;
};

type SpPortalResponse = {
  ok?: boolean;
  admin_view?: boolean;
  sp?: {
    id?: string | null;
    name?: string | null;
  };
  communicationPreference?: {
    preferred_mode?: string | null;
    portal_status?: string | null;
    onboarding_status?: string | null;
  } | null;
  openShifts?: PortalOpenShift[];
  assignedEvents?: PortalAssignedEvent[];
  myResponses?: PortalResponseRecord[];
  myAttendance?: PortalAttendanceRecord[];
  upcomingItems?: PortalUpcomingItem[];
  diagnostics?: {
    userEmail?: string | null;
    fullName?: string | null;
    scheduleMatchName?: string | null;
    checkedFields?: string[];
    candidateCount?: number;
    candidates?: {
      sp_id?: string | null;
      sp_name?: string | null;
      matched_by?: string | null;
      matched_fields?: string[] | null;
    }[];
  };
  message?: string;
  error?: string;
};

type ShiftResponseApiPayload = {
  ok?: boolean;
  response?: {
    id?: string | null;
    opening_id?: string | null;
    response?: string | null;
    source?: string | null;
    message?: string | null;
    responded_at?: string | null;
    updated_at?: string | null;
    event_id?: string | null;
  } | null;
  message?: string;
  error?: string;
};

type SpCheckInApiPayload = {
  ok?: boolean;
  checkedIn?: boolean;
  attendance?: PortalAssignedEvent["attendance"] | null;
  checkIn?: PortalCheckInState | null;
  message?: string;
  error?: string;
};

type PortalState = {
  sp: {
    id: string;
    name: string;
  };
  openShifts: PortalOpenShift[];
  assignedEvents: PortalAssignedEvent[];
  myResponses: PortalResponseRecord[];
  myAttendance: PortalAttendanceRecord[];
  upcomingItems: PortalUpcomingItem[];
  communicationPreference?: {
    preferred_mode?: string | null;
    portal_status?: string | null;
    onboarding_status?: string | null;
  } | null;
};

type ChecklistItem = {
  label: string;
  detail: string;
  ready: boolean;
};

type PortalAcknowledgmentChecklistItem = {
  key: SpPortalAcknowledgmentKey;
  label: string;
  detail: string;
  checked: boolean;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDateLabel(value?: string | null) {
  const text = asText(value);
  if (!text) return "Date TBD";
  const dt = new Date(`${text}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return text;
  return dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatTimeLabel(value?: string | null) {
  const text = asText(value);
  if (!text) return "TBD";
  const probe = new Date(`1970-01-01T${text}`);
  if (Number.isNaN(probe.getTime())) return text;
  return probe.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatTimestampLabel(value?: string | null) {
  const text = asText(value);
  if (!text) return "";
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return text;
  return dt.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function timestampSortKey(value?: string | null) {
  const text = asText(value);
  if (!text) return Number.POSITIVE_INFINITY;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return Number.POSITIVE_INFINITY;
  return dt.getTime();
}

function responseLabel(value: unknown) {
  const status = asText(value).toLowerCase();
  if (status === "accepted") return "Accepted";
  if (status === "maybe") return "Maybe";
  if (status === "declined") return "Declined";
  if (status === "available") return "Available";
  if (status === "withdrawn") return "Withdrawn";
  return "No response";
}

function assignmentStatusLabel(value: unknown, confirmed?: boolean | null) {
  const status = asText(value).toLowerCase();
  if (confirmed || status === "confirmed") return "Confirmed";
  if (status === "scheduled" || status === "assigned") return "Scheduled";
  if (status === "backup") return "Backup";
  return "Scheduled";
}

function attendanceLabel(value: unknown) {
  const status = asText(value).toLowerCase();
  if (status === "not_arrived") return "Not arrived";
  if (status === "arrived") return "Arrived";
  if (status === "checked_in") return "Checked in";
  if (status === "checked_out") return "Checked out";
  if (status === "no_show") return "No-show";
  if (status === "excused") return "Excused";
  return "Not arrived";
}

function formatTimeRange(start?: string | null, end?: string | null) {
  const startLabel = formatTimeLabel(start);
  const endLabel = formatTimeLabel(end);
  if (startLabel === "TBD" && endLabel === "TBD") return "Time TBD";
  if (startLabel !== "TBD" && endLabel !== "TBD") return `${startLabel} - ${endLabel}`;
  return startLabel !== "TBD" ? startLabel : endLabel;
}

function materialStatusMessage(event: PortalAssignedEvent) {
  if (event.materialsReleased && event.materials?.length) return "Released materials";
  if (event.materialsReleased) return "Materials are not available yet.";
  return "Materials are not available yet.";
}

function trainingSummary(event: PortalAssignedEvent) {
  if (!event.training) return "Training details are not released yet.";
  const pieces = [
    asText(event.training.date) ? formatDateLabel(event.training.date) : "",
    asText(event.training.start_time || event.training.end_time) ? formatTimeRange(event.training.start_time, event.training.end_time) : "",
    asText(event.training.instructions),
  ].filter(Boolean);
  return pieces.join(" · ") || "Training details released.";
}

function scheduleSummary(event: PortalAssignedEvent) {
  const schedule = event.schedule;
  if (!schedule?.released) return "Schedule is not available yet.";
  return [
    asText(schedule.roundCount) ? `${asText(schedule.roundCount)} round${asText(schedule.roundCount) === "1" ? "" : "s"}` : "",
    asText(schedule.roomCount) ? `${asText(schedule.roomCount)} room${asText(schedule.roomCount) === "1" ? "" : "s"}` : "",
    asText(schedule.encounterMinutes) ? `${asText(schedule.encounterMinutes)} min encounter` : "",
    asText(schedule.feedbackMinutes) ? `${asText(schedule.feedbackMinutes)} min feedback` : "",
    asText(schedule.transitionMinutes) ? `${asText(schedule.transitionMinutes)} min transition` : "",
  ].filter(Boolean).join(" · ") || "Schedule released.";
}

function eventDateTimeKey(event?: PortalEventSummary | null) {
  const date = asText(event?.date);
  const time = asText(event?.start_time);
  if (!date) return Number.POSITIVE_INFINITY;
  const dt = new Date(`${date}T${time || "00:00:00"}`);
  if (Number.isNaN(dt.getTime())) return Number.POSITIVE_INFINITY;
  return dt.getTime();
}

function reportPreview(event: PortalAssignedEvent) {
  return asText(event.reportCallTime) || "Report time not released yet";
}

function roleCasePreview(event: PortalAssignedEvent) {
  const role = asText(event.role);
  const caseName = asText(event.caseInfo?.name);
  const caseNote = asText(event.caseInfo?.note);
  if (role && caseName) return `${role} · ${caseName}`;
  if (role) return role;
  if (caseName) return caseName;
  if (caseNote) return caseNote;
  return "Role/case not released yet";
}

function locationPreview(event: PortalAssignedEvent) {
  const location = asText(event.location || event.event?.location);
  const room = asText(event.event?.room);
  if (location && room) return `${location} · ${room}`;
  if (location) return location;
  if (event.virtualLink) return "Virtual access released";
  return "Location not released yet";
}

function cleanSpFacingNote(value: unknown) {
  const raw = asText(value);
  if (/CFSP_KEYSTONE_DEMO_FAKE_DATA|fake poll\/opening|modeled after schedule/i.test(raw)) return "";
  const text = raw
    .replace(/\[CFSP[\s\S]*?\[\/CFSP[^\]]*\]/gi, "\n")
    .replace(/CFSP_KEYSTONE_DEMO_FAKE_DATA/gi, "")
    .replace(/CFSP_[A-Z0-9_:-]+/g, "");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^(event|date|time|location|room|coverage|source|context source|draft source)\s*:/i.test(line)) return false;
      if (/hidden|metadata|internal|demo fake data/i.test(line)) return false;
      if (!/[A-Za-z]{2,}/.test(line)) return false;
      if (/^[a-z]/.test(line) && !/[.!?]$/.test(line)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

function releasedDetailLabels(event: PortalAssignedEvent) {
  const labels: string[] = [];
  if (asText(event.location || event.event?.location) || event.virtualLink) labels.push("Location");
  if (asText(event.reportCallTime) || asText(event.arrivalInstructions)) labels.push("Arrival");
  if (asText(event.role) || asText(event.caseInfo?.name) || asText(event.caseInfo?.note)) labels.push("Role/case");
  if (event.training) labels.push("Training");
  if (event.schedule?.released) labels.push("Schedule");
  if (event.materialsReleased && event.materials?.length) labels.push("Materials");
  return labels;
}

function pendingDetailLabels(event: PortalAssignedEvent) {
  const labels: string[] = [];
  if (!asText(event.location || event.event?.location) && !event.virtualLink) labels.push("Location");
  if (!asText(event.reportCallTime) && !asText(event.arrivalInstructions)) labels.push("Arrival/reporting");
  if (!asText(event.role) && !asText(event.caseInfo?.name) && !asText(event.caseInfo?.note)) labels.push("Role/case");
  if (!event.training) labels.push("Training");
  if (!event.schedule?.released) labels.push("Schedule");
  if (!event.materialsReleased || !event.materials?.length) labels.push("Materials");
  return labels;
}

function beforeEventChecklist(event: PortalAssignedEvent): ChecklistItem[] {
  const attendance = asText(event.attendance?.status).toLowerCase();
  return [
    {
      label: "Review schedule",
      detail: event.schedule?.released ? scheduleSummary(event) : "Schedule is not available yet.",
      ready: Boolean(event.schedule?.released),
    },
    {
      label: "Review case/materials",
      detail: event.materialsReleased && event.materials?.length ? `${event.materials.length} released file${event.materials.length === 1 ? "" : "s"}` : "Materials are not available yet.",
      ready: Boolean(event.materialsReleased && event.materials?.length),
    },
    {
      label: "Review training details",
      detail: trainingSummary(event),
      ready: Boolean(event.training),
    },
    {
      label: "Check arrival/reporting instructions",
      detail: asText(event.reportCallTime || event.arrivalInstructions)
        ? [asText(event.reportCallTime) ? `Report ${asText(event.reportCallTime)}` : "", asText(event.arrivalInstructions)].filter(Boolean).join(" · ")
        : "Arrival/reporting instructions are not released yet.",
      ready: Boolean(asText(event.reportCallTime || event.arrivalInstructions)),
    },
    {
      label: "Check attendance status",
      detail: attendanceLabel(attendance),
      ready: attendance === "arrived" || attendance === "checked_in" || attendance === "checked_out",
    },
  ];
}

function acknowledgmentChecked(event: PortalAssignedEvent, key: SpPortalAcknowledgmentKey) {
  return Boolean(asText(event.acknowledgments?.[key]));
}

function portalAcknowledgmentChecklist(event: PortalAssignedEvent): PortalAcknowledgmentChecklistItem[] {
  const items: PortalAcknowledgmentChecklistItem[] = [
    {
      key: "event_details",
      label: "I reviewed the event details.",
      detail: `${formatDateLabel(event.event?.date)} · ${formatTimeRange(event.event?.start_time, event.event?.end_time)}`,
      checked: acknowledgmentChecked(event, "event_details"),
    },
  ];

  if (event.schedule?.released) {
    items.push({
      key: "schedule",
      label: "I reviewed the schedule.",
      detail: scheduleSummary(event),
      checked: acknowledgmentChecked(event, "schedule"),
    });
  }
  if (asText(event.role) || asText(event.caseInfo?.name) || asText(event.caseInfo?.note)) {
    items.push({
      key: "role_case",
      label: "I reviewed the role/case information.",
      detail: roleCasePreview(event),
      checked: acknowledgmentChecked(event, "role_case"),
    });
  }
  if (event.training) {
    items.push({
      key: "training",
      label: "I reviewed the training details.",
      detail: trainingSummary(event),
      checked: acknowledgmentChecked(event, "training"),
    });
  }
  if (event.materialsReleased && event.materials?.length) {
    items.push({
      key: "materials",
      label: "I reviewed the case files/materials.",
      detail: `${event.materials.length} released file${event.materials.length === 1 ? "" : "s"}`,
      checked: acknowledgmentChecked(event, "materials"),
    });
  }
  if (asText(event.reportCallTime) || asText(event.releaseEndTime) || asText(event.arrivalInstructions)) {
    items.push({
      key: "arrival",
      label: "I understand the arrival/reporting instructions.",
      detail: [asText(event.reportCallTime) ? `Report ${asText(event.reportCallTime)}` : "", asText(event.arrivalInstructions)].filter(Boolean).join(" · ") || "Arrival/reporting instructions released.",
      checked: acknowledgmentChecked(event, "arrival"),
    });
  }

  return items;
}

function nextActionSummary(event: PortalAssignedEvent) {
  const nextAcknowledgment = portalAcknowledgmentChecklist(event).find((item) => !item.checked);
  if (nextAcknowledgment) return nextAcknowledgment.label.replace(/\.$/, "");
  const checklist = beforeEventChecklist(event);
  const readyItem = checklist.find((item) => item.ready && item.label !== "Check attendance status");
  if (readyItem) return readyItem.label;
  return "No action needed yet";
}

function releaseSummaryText(event: PortalAssignedEvent) {
  const released = releasedDetailLabels(event);
  const pending = pendingDetailLabels(event);
  if (released.length && pending.length) return `${released.length} released · ${pending.length} not released yet`;
  if (released.length) return "All core details that staff has prepared are released.";
  return "Staff has not released event details yet.";
}

function attendanceDetail(event: PortalAssignedEvent) {
  const checkedIn = formatTimestampLabel(event.attendance?.checked_in_at);
  const checkedOut = formatTimestampLabel(event.attendance?.checked_out_at);
  return [checkedIn ? `Checked in ${checkedIn}` : "", checkedOut ? `Checked out ${checkedOut}` : ""].filter(Boolean).join(" · ") || "Check-in status updates during the event.";
}

function checkInMethodLabel(method: unknown) {
  const value = asText(method).toLowerCase();
  if (value === "location_verified") return "Location verified";
  if (value === "location_failed") return "Location not verified";
  if (value === "manual") return "Checked by staff";
  return "Not checked in";
}

function checkInAvailabilityMessage(event: PortalAssignedEvent) {
  const checkIn = event.checkIn || event.attendance?.checkIn || null;
  if (!checkIn) return "Check-in details are not available yet.";
  const opensAt = formatTimestampLabel(checkIn.opensAt);
  const closesAt = formatTimestampLabel(checkIn.closesAt);
  if (!checkIn.geofenceReady) return "Check-in location is not set up yet. Please check in with the simulation team.";
  if (checkIn.windowStatus === "ready") return closesAt ? `Check-in is open until ${closesAt}.` : "Check-in is open.";
  if (checkIn.windowStatus === "not_open") return opensAt ? `Check-in opens ${opensAt}.` : "Check-in is not open yet.";
  if (checkIn.windowStatus === "closed") return "Check-in is closed for this event.";
  return asText(checkIn.windowMessage) || "Check-in time is not set up yet.";
}

function checkInStatusDetail(event: PortalAssignedEvent) {
  const checkIn = event.checkIn || event.attendance?.checkIn || null;
  const method = checkInMethodLabel(checkIn?.method);
  const attemptedAt = formatTimestampLabel(checkIn?.attemptedAt);
  if (event.attendance?.checked_in_at) {
    return [method, formatTimestampLabel(event.attendance.checked_in_at)].filter(Boolean).join(" · ");
  }
  if (checkIn?.method === "location_failed") {
    return attemptedAt ? `Location check failed ${attemptedAt}` : "Location check failed.";
  }
  return checkInAvailabilityMessage(event);
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "waiting" | "neutral" }) {
  const palette =
    tone === "success"
      ? {
          border: "rgba(25, 138, 112, 0.22)",
          background: "rgba(209, 250, 229, 0.62)",
          color: "#065f46",
        }
      : tone === "waiting"
        ? {
            border: "rgba(148, 163, 184, 0.34)",
            background: "rgba(248, 250, 252, 0.82)",
            color: "var(--cfsp-text-muted)",
          }
        : {
            border: "var(--cfsp-border)",
            background: "var(--cfsp-surface)",
            color: "var(--cfsp-text-muted)",
          };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        borderRadius: 999,
        padding: "4px 9px",
        fontSize: "0.76rem",
        fontWeight: 900,
        lineHeight: 1.2,
      }}
    >
      {children}
    </span>
  );
}

function InfoTile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="cfsp-panel-muted" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12, minWidth: 0 }}>
      <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.76rem", fontWeight: 900 }}>{label}</div>
      <div style={{ color: "var(--cfsp-text)", fontWeight: 850, marginTop: 4, overflowWrap: "anywhere" }}>{value}</div>
      {detail ? <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 4, fontSize: "0.88rem" }}>{detail}</div> : null}
    </div>
  );
}

function ReleaseStatusRow({ event }: { event: PortalAssignedEvent }) {
  const released = releasedDetailLabels(event);
  const pending = pendingDetailLabels(event);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 800 }}>{releaseSummaryText(event)}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {released.map((label) => (
          <StatusPill key={`released-${label}`} tone="success">{label} released</StatusPill>
        ))}
        {pending.map((label) => (
          <StatusPill key={`pending-${label}`} tone="waiting">{label} not released yet</StatusPill>
        ))}
      </div>
    </div>
  );
}

function BeforeEventChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <div className="cfsp-panel" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
      <div>
        <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>Before the event</div>
        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 3 }}>Use this as your prep check before event day.</div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 10,
              alignItems: "start",
              border: "1px solid var(--cfsp-border)",
              borderRadius: 10,
              padding: 10,
              background: item.ready ? "rgba(209, 250, 229, 0.34)" : "var(--cfsp-surface)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--cfsp-text)", fontWeight: 850 }}>{item.label}</div>
              <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 3, overflowWrap: "anywhere" }}>{item.detail}</div>
            </div>
            <StatusPill tone={item.ready ? "success" : "waiting"}>{item.ready ? "Ready" : "Not released"}</StatusPill>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortalAcknowledgmentChecklist({
  items,
  savingByKey,
  onToggle,
}: {
  items: PortalAcknowledgmentChecklistItem[];
  savingByKey: Record<string, boolean>;
  onToggle: (item: PortalAcknowledgmentChecklistItem, checked: boolean) => void;
}) {
  return (
    <div className="cfsp-panel" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
      <div>
        <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>Review checklist</div>
        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 3 }}>
          Check off the released event information you have reviewed.
        </div>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((item) => {
          const saving = Boolean(savingByKey[item.key]);
          return (
            <label
              key={item.key}
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr) auto",
                gap: 10,
                alignItems: "start",
                border: "1px solid var(--cfsp-border)",
                borderRadius: 10,
                padding: 10,
                background: item.checked ? "rgba(209, 250, 229, 0.34)" : "var(--cfsp-surface)",
                color: "var(--cfsp-text)",
              }}
            >
              <input
                type="checkbox"
                checked={item.checked}
                disabled={saving}
                onChange={(event) => onToggle(item, event.target.checked)}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: "var(--cfsp-green)" }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", color: "var(--cfsp-text)", fontWeight: 850 }}>{item.label}</span>
                <span style={{ display: "block", color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 3, overflowWrap: "anywhere" }}>{item.detail}</span>
              </span>
              <StatusPill tone={item.checked ? "success" : "waiting"}>{saving ? "Saving" : item.checked ? "Reviewed" : "Open"}</StatusPill>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SpCheckInPanel({
  event,
  checkingIn,
  feedback,
  onCheckIn,
}: {
  event: PortalAssignedEvent;
  checkingIn: boolean;
  feedback: string;
  onCheckIn: () => void;
}) {
  const checkIn = event.checkIn || event.attendance?.checkIn || null;
  const checkedIn = asText(event.attendance?.status).toLowerCase() === "checked_in" || Boolean(event.attendance?.checked_in_at);
  const locationVerified = checkIn?.locationVerified === true;
  const canCheckIn = Boolean(checkIn?.canCheckIn && !checkedIn);
  const statusTone = checkedIn ? "success" : checkIn?.method === "location_failed" ? "waiting" : "neutral";
  const statusText = checkedIn
    ? locationVerified
      ? "Checked in - location verified"
      : "Checked in"
    : checkIn?.method === "location_failed"
      ? "Location not verified"
      : "Not checked in";

  return (
    <div className="cfsp-panel" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>Event check-in</div>
          <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 3 }}>
            {checkInStatusDetail(event)}
          </div>
        </div>
        <StatusPill tone={statusTone}>{statusText}</StatusPill>
      </div>
      {!checkedIn ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="cfsp-btn cfsp-btn-primary"
            onClick={onCheckIn}
            disabled={!canCheckIn || checkingIn}
            style={{ opacity: !canCheckIn || checkingIn ? 0.62 : 1 }}
          >
            {checkingIn ? "Checking in..." : "Check in"}
          </button>
          <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.88rem", fontWeight: 750, maxWidth: 620 }}>
            {checkInAvailabilityMessage(event)}
          </div>
        </div>
      ) : null}
      {feedback ? (
        <div
          style={{
            color: feedback.toLowerCase().includes("checked in") ? "var(--cfsp-green)" : "var(--cfsp-text-muted)",
            fontWeight: 850,
          }}
        >
          {feedback}
        </div>
      ) : null}
    </div>
  );
}

function ConfirmedEventCard({
  event,
  variant = "primary",
  acknowledgmentSavingByKey,
  acknowledgmentFeedback,
  checkingIn,
  checkInFeedback,
  onAcknowledgmentToggle,
  onCheckIn,
}: {
  event: PortalAssignedEvent;
  variant?: "primary" | "secondary";
  acknowledgmentSavingByKey: Record<string, boolean>;
  acknowledgmentFeedback: string;
  checkingIn: boolean;
  checkInFeedback: string;
  onAcknowledgmentToggle: (item: PortalAcknowledgmentChecklistItem, checked: boolean) => void;
  onCheckIn: () => void;
}) {
  const eventSummary = event.event;
  const eventName = asText(eventSummary?.name) || "CFSP Event";
  const eventDate = formatDateLabel(eventSummary?.date);
  const eventTime = formatTimeRange(eventSummary?.start_time, eventSummary?.end_time);
  const checkedIn = asText(event.attendance?.status).toLowerCase() === "checked_in" || Boolean(event.attendance?.checked_in_at);
  const checkIn = event.checkIn || event.attendance?.checkIn || null;
  const checkInTone = checkedIn ? "success" : checkIn?.method === "location_failed" ? "waiting" : "neutral";
  const checkInLabel = checkedIn
    ? checkIn?.locationVerified === true
      ? "Checked in - location verified"
      : "Checked in"
    : checkIn?.method === "location_failed"
      ? "Location not verified"
      : "Not checked in";
  const acknowledgmentItems = portalAcknowledgmentChecklist(event);
  const reviewedCount = acknowledgmentItems.filter((item) => item.checked).length;
  const materials = event.materialsReleased && event.materials?.length ? event.materials : [];
  const isPrimary = variant === "primary";

  return (
    <article
      className={isPrimary ? "cfsp-panel" : "cfsp-panel-muted"}
      style={{
        border: isPrimary ? "1px solid rgba(25, 138, 112, 0.22)" : "1px solid var(--cfsp-border)",
        borderRadius: 12,
        padding: isPrimary ? 18 : 14,
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.78rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {isPrimary ? "Next confirmed event" : "Confirmed event"}
          </div>
          <h3 style={{ margin: "4px 0 0", fontSize: isPrimary ? "1.28rem" : "1.08rem", color: "var(--cfsp-text)", overflowWrap: "anywhere" }}>
            {eventName}
          </h3>
          <div style={{ marginTop: 6, color: "var(--cfsp-text)", fontWeight: 800 }}>
            {eventDate} · {eventTime}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <StatusPill tone="success">{assignmentStatusLabel(event.status, event.confirmed)}</StatusPill>
          <StatusPill tone={checkInTone}>{checkInLabel}</StatusPill>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <InfoTile label="When" value={`${eventDate} · ${eventTime}`} />
        <InfoTile label="Where" value={locationPreview(event)} />
        <InfoTile label="Report" value={reportPreview(event)} />
        <InfoTile label="Role / Case" value={roleCasePreview(event)} />
      </div>

      <div
        style={{
          border: "1px solid rgba(148, 163, 184, 0.22)",
          borderRadius: 10,
          background: "var(--cfsp-surface-muted)",
          padding: 12,
          display: "grid",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>Next prep action</div>
          <StatusPill tone={reviewedCount === acknowledgmentItems.length && acknowledgmentItems.length > 0 ? "success" : "waiting"}>
            {reviewedCount} / {acknowledgmentItems.length} reviewed
          </StatusPill>
        </div>
        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>{nextActionSummary(event)}</div>
      </div>

      {event.eventNote ? (
        <div
          style={{
            border: "1px solid rgba(20, 91, 150, 0.16)",
            borderRadius: 10,
            background: "rgba(239, 246, 255, 0.56)",
            color: "var(--cfsp-text)",
            fontWeight: 750,
            lineHeight: 1.5,
            padding: 10,
          }}
        >
          {event.eventNote}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        <details open={isPrimary} style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>Details</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <InfoTile label="Location / Room" value={locationPreview(event)} />
            {event.virtualLink ? (
              <a href={event.virtualLink} target="_blank" rel="noreferrer" style={{ color: "var(--cfsp-blue)", fontWeight: 850 }}>
                Virtual event link
              </a>
            ) : null}
            <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
              <strong style={{ color: "var(--cfsp-text)" }}>Arrival:</strong>{" "}
              {event.arrivalInstructions || reportPreview(event)}
              {asText(event.releaseEndTime) ? ` · Release ${asText(event.releaseEndTime)}` : ""}
            </div>
            <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
              <strong style={{ color: "var(--cfsp-text)" }}>Training:</strong> {trainingSummary(event)}
              {event.training?.link ? (
                <>
                  {" · "}
                  <a href={event.training.link} target="_blank" rel="noreferrer" style={{ color: "var(--cfsp-blue)", fontWeight: 850 }}>
                    Training link
                  </a>
                </>
              ) : null}
            </div>
            <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
              <strong style={{ color: "var(--cfsp-text)" }}>Schedule:</strong> {scheduleSummary(event)}
            </div>
          </div>
        </details>

        <details open={isPrimary} style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>Review checklist</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <PortalAcknowledgmentChecklist
              items={acknowledgmentItems}
              savingByKey={acknowledgmentSavingByKey}
              onToggle={onAcknowledgmentToggle}
            />
            {acknowledgmentFeedback ? (
              <div style={{ color: acknowledgmentFeedback === "Saved" ? "var(--cfsp-green)" : "var(--cfsp-danger)", fontWeight: 800 }}>
                {acknowledgmentFeedback}
              </div>
            ) : null}
          </div>
        </details>

        <details style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>Materials</summary>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>{materialStatusMessage(event)}</div>
            {materials.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {materials.map((material) => (
                  <a
                    key={material.key}
                    href={material.url}
                    target="_blank"
                    rel="noreferrer"
                    className="cfsp-btn cfsp-btn-secondary"
                    style={{ textDecoration: "none" }}
                  >
                    {material.label}: {material.name}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </details>

        <details style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>Check-in</summary>
          <div style={{ marginTop: 10 }}>
            <SpCheckInPanel event={event} checkingIn={checkingIn} feedback={checkInFeedback} onCheckIn={onCheckIn} />
          </div>
        </details>
      </div>
    </article>
  );
}

function toPortalState(body: SpPortalResponse): PortalState | null {
  if (!body || body.ok !== true) return null;
  const spId = asText(body.sp?.id);
  if (!spId) return null;
  return {
    sp: {
      id: spId,
      name: asText(body.sp?.name) || "SP",
    },
    openShifts: Array.isArray(body.openShifts) ? body.openShifts : [],
    assignedEvents: Array.isArray(body.assignedEvents) ? body.assignedEvents : [],
    myResponses: Array.isArray(body.myResponses) ? body.myResponses : [],
    myAttendance: Array.isArray(body.myAttendance) ? body.myAttendance : [],
    upcomingItems: Array.isArray(body.upcomingItems) ? body.upcomingItems : [],
    communicationPreference: body.communicationPreference || null,
  };
}

function portalPreferenceNote(preference?: PortalState["communicationPreference"]) {
  const preferredMode = asText(preference?.preferred_mode).toLowerCase();
  const portalStatus = asText(preference?.portal_status).toLowerCase();
  if (preferredMode === "portal" || portalStatus === "linked") return "You are set up for the SP Portal.";
  return "Your program may still contact you by email, phone, or Microsoft Forms.";
}

export default function SpPortalPage() {
  const router = useRouter();
  const [portal, setPortal] = useState<PortalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingByOpeningId, setSavingByOpeningId] = useState<Record<string, boolean>>({});
  const [saveFeedbackByOpeningId, setSaveFeedbackByOpeningId] = useState<Record<string, string>>({});
  const [savingAcknowledgmentByKey, setSavingAcknowledgmentByKey] = useState<Record<string, boolean>>({});
  const [acknowledgmentFeedbackByAssignmentId, setAcknowledgmentFeedbackByAssignmentId] = useState<Record<string, string>>({});
  const [checkingInByAssignmentId, setCheckingInByAssignmentId] = useState<Record<string, boolean>>({});
  const [checkInFeedbackByAssignmentId, setCheckInFeedbackByAssignmentId] = useState<Record<string, string>>({});

  const loadPortal = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/sp/portal", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const body = (await response.json().catch(() => null)) as SpPortalResponse | null;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok || body?.ok !== true) {
          if (asText(body?.error) === "sp_profile_not_linked") {
            const baseMessage =
              "We could not find an SP profile linked to your account. Please contact your simulation program coordinator.";
            const diagnostics = body?.diagnostics || {};
            const checks = Array.isArray(diagnostics?.checkedFields)
              ? diagnostics.checkedFields.filter((field) => asText(field))
              : [];
            const isAdminView = body?.admin_view === true;
            const extra = isAdminView
              ? [
                  asText(diagnostics.userEmail) ? `Account email: ${asText(diagnostics.userEmail)}` : "",
                  asText(diagnostics.scheduleMatchName)
                    ? `Schedule match name: ${asText(diagnostics.scheduleMatchName)}`
                    : "",
                  `Candidate count: ${asText(diagnostics.candidateCount)}`,
                  checks.length ? `Lookup fields checked: ${checks.join(", ")}` : "",
                ].filter(Boolean)
              : [];
            throw new Error([baseMessage, ...extra].filter(Boolean).join(" | "));
          }
          const message = asText(body?.message || body?.error) || `Could not load the SP portal (${response.status}).`;
          throw new Error(message);
        }

        const nextState = toPortalState(body);
        if (!nextState) throw new Error("SP portal data is unavailable.");
        setPortal(nextState);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load the SP portal.");
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

  const sortedResponses = useMemo(() => {
    if (!portal) return [];
    return [...portal.myResponses].sort((a, b) => asText(b.updated_at || b.responded_at).localeCompare(asText(a.updated_at || a.responded_at)));
  }, [portal]);

  const sortedAttendance = useMemo(() => {
    if (!portal) return [];
    return [...portal.myAttendance].sort((a, b) => {
      const aKey = timestampSortKey(a.checked_in_at || a.updated_at);
      const bKey = timestampSortKey(b.checked_in_at || b.updated_at);
      if (aKey !== bKey) return bKey - aKey;
      return asText(a.event?.name).localeCompare(asText(b.event?.name));
    });
  }, [portal]);

  const sortedAssignedEvents = useMemo(() => {
    if (!portal?.assignedEvents.length) return null;
    return [...portal.assignedEvents].sort((a, b) => {
      const aKey = eventDateTimeKey(a.event);
      const bKey = eventDateTimeKey(b.event);
      if (aKey !== bKey) return aKey - bKey;
      return asText(a.event?.name).localeCompare(asText(b.event?.name));
    });
  }, [portal]);
  const nextAssignedEvent = sortedAssignedEvents?.[0] || null;
  const otherAssignedEvents = sortedAssignedEvents?.slice(1) || [];

  async function saveShiftResponse(shift: PortalOpenShift, nextResponse: "accepted" | "maybe" | "declined") {
    const openingId = asText(shift.openingId);
    const eventId = asText(shift.event?.id);
    if (!openingId || !eventId) return;

    setSavingByOpeningId((prev) => ({ ...prev, [openingId]: true }));
    setSaveFeedbackByOpeningId((prev) => ({ ...prev, [openingId]: "" }));

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/shift-responses`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          openingId,
          response: nextResponse,
          source: "portal",
        }),
      });
      const body = (await response.json().catch(() => null)) as ShiftResponseApiPayload | null;
      if (!response.ok || body?.ok === false) {
        throw new Error(asText(body?.message || body?.error) || `Could not save response (${response.status}).`);
      }

      setPortal((current) => {
        if (!current) return current;

        const savedResponse = body?.response;
        const savedRecord: PortalResponseRecord = {
          id: asText(savedResponse?.id) || `${openingId}:${Date.now()}`,
          openingId,
          response: asText(savedResponse?.response) || nextResponse,
          source: asText(savedResponse?.source) || "portal",
          message: asText(savedResponse?.message) || null,
          responded_at: asText(savedResponse?.responded_at) || new Date().toISOString(),
          updated_at: asText(savedResponse?.updated_at) || new Date().toISOString(),
          event: shift.event,
          opening: {
            id: openingId,
            title: shift.title,
            shift_date: shift.shift_date || null,
            start_time: shift.start_time || null,
            end_time: shift.end_time || null,
            location: shift.location || null,
            room: shift.room || null,
          },
        };

        const nextOpenShifts = current.openShifts.map((item) =>
          asText(item.openingId) !== openingId
            ? item
            : {
                ...item,
                currentResponse: {
                  id: savedRecord.id,
                  response: savedRecord.response || nextResponse,
                  source: savedRecord.source || "portal",
                  responded_at: savedRecord.responded_at || new Date().toISOString(),
                  updated_at: savedRecord.updated_at || new Date().toISOString(),
                },
              }
        );

        const withoutCurrentOpening = current.myResponses.filter((item) => asText(item.openingId) !== openingId);
        const nextResponses = [savedRecord, ...withoutCurrentOpening];
        const nextUpcomingItems = [...current.upcomingItems];
        const existingUpcomingIndex = nextUpcomingItems.findIndex((item) => asText(item.openingId) === openingId);

        if (nextResponse === "accepted") {
          const acceptedUpcoming: PortalUpcomingItem = {
            id: savedRecord.id,
            source: "accepted_response",
            response: "accepted",
            openingId,
            openingTitle: shift.title,
            shift_date: shift.shift_date || null,
            start_time: shift.start_time || null,
            end_time: shift.end_time || null,
            event: shift.event,
          };
          if (existingUpcomingIndex >= 0) nextUpcomingItems[existingUpcomingIndex] = acceptedUpcoming;
          else nextUpcomingItems.push(acceptedUpcoming);
        } else if (existingUpcomingIndex >= 0 && asText(nextUpcomingItems[existingUpcomingIndex]?.source) === "accepted_response") {
          nextUpcomingItems.splice(existingUpcomingIndex, 1);
        }

        return {
          ...current,
          openShifts: nextOpenShifts,
          myResponses: nextResponses,
          upcomingItems: nextUpcomingItems,
        };
      });

      setSaveFeedbackByOpeningId((prev) => ({ ...prev, [openingId]: "Saved ✓" }));
      window.setTimeout(() => {
        setSaveFeedbackByOpeningId((prev) => ({ ...prev, [openingId]: "" }));
      }, 2200);
      void loadPortal({ silent: true });
    } catch (err) {
      setSaveFeedbackByOpeningId((prev) => ({
        ...prev,
        [openingId]: err instanceof Error ? err.message : "Could not save your response.",
      }));
    } finally {
      setSavingByOpeningId((prev) => ({ ...prev, [openingId]: false }));
    }
  }

  async function savePortalAcknowledgment(
    event: PortalAssignedEvent,
    item: PortalAcknowledgmentChecklistItem,
    checked: boolean
  ) {
    const eventId = asText(event.eventId || event.event?.id);
    const assignmentId = asText(event.assignmentId || event.id);
    if (!eventId || !assignmentId) return;

    const savingKey = `${assignmentId}:${item.key}`;
    setSavingAcknowledgmentByKey((prev) => ({ ...prev, [savingKey]: true }));
    setAcknowledgmentFeedbackByAssignmentId((prev) => ({ ...prev, [assignmentId]: "" }));

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/sp-portal-acknowledgments`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignmentId,
          key: item.key,
          checked,
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; acknowledgments?: SpPortalAcknowledgmentState; error?: string; message?: string } | null;
      if (!response.ok || body?.ok === false) {
        throw new Error(asText(body?.message || body?.error) || `Could not save acknowledgment (${response.status}).`);
      }

      const acknowledgments = body?.acknowledgments || {};
      setPortal((current) => {
        if (!current) return current;
        return {
          ...current,
          assignedEvents: current.assignedEvents.map((assignedEvent) =>
            asText(assignedEvent.assignmentId || assignedEvent.id) === assignmentId
              ? { ...assignedEvent, acknowledgments }
              : assignedEvent
          ),
        };
      });

      setAcknowledgmentFeedbackByAssignmentId((prev) => ({ ...prev, [assignmentId]: "Saved" }));
      window.setTimeout(() => {
        setAcknowledgmentFeedbackByAssignmentId((prev) => ({ ...prev, [assignmentId]: "" }));
      }, 1800);
    } catch (err) {
      setAcknowledgmentFeedbackByAssignmentId((prev) => ({
        ...prev,
        [assignmentId]: err instanceof Error ? err.message : "Could not save acknowledgment.",
      }));
    } finally {
      setSavingAcknowledgmentByKey((prev) => ({ ...prev, [savingKey]: false }));
    }
  }

  function requestBrowserLocation() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("Location services are not available in this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000,
      });
    });
  }

  async function saveSpCheckIn(event: PortalAssignedEvent) {
    const eventId = asText(event.eventId || event.event?.id);
    const assignmentId = asText(event.assignmentId || event.id);
    if (!eventId || !assignmentId) return;

    setCheckingInByAssignmentId((prev) => ({ ...prev, [assignmentId]: true }));
    setCheckInFeedbackByAssignmentId((prev) => ({ ...prev, [assignmentId]: "" }));

    try {
      const position = await requestBrowserLocation();
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/sp-check-in`, {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignmentId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        }),
      });
      const body = (await response.json().catch(() => null)) as SpCheckInApiPayload | null;
      if (!response.ok || body?.ok === false) {
        throw new Error(asText(body?.message || body?.error) || `Could not check in (${response.status}).`);
      }

      setPortal((current) => {
        if (!current) return current;
        const savedAttendance = body?.attendance || null;
        const savedCheckIn = body?.checkIn || savedAttendance?.checkIn || null;
        const nextAssignedEvents = current.assignedEvents.map((assignedEvent) => {
          if (asText(assignedEvent.assignmentId || assignedEvent.id) !== assignmentId) return assignedEvent;
          return {
            ...assignedEvent,
            attendance: savedAttendance
              ? {
                  ...assignedEvent.attendance,
                  ...savedAttendance,
                  checkIn: savedCheckIn || savedAttendance.checkIn || assignedEvent.attendance?.checkIn || null,
                }
              : assignedEvent.attendance,
            checkIn: savedCheckIn || assignedEvent.checkIn || null,
          };
        });
        const eventSummary = event.event || null;
        const nextAttendance = savedAttendance
          ? [
              {
                id: asText(savedAttendance.id) || `${eventId}:${Date.now()}`,
                eventId,
                status: asText(savedAttendance.status) || "not_arrived",
                checked_in_at: asText(savedAttendance.checked_in_at) || null,
                checked_out_at: asText(savedAttendance.checked_out_at) || null,
                updated_at: asText(savedAttendance.updated_at) || new Date().toISOString(),
                event: eventSummary,
                checkIn: savedCheckIn || null,
              },
              ...current.myAttendance.filter((record) => asText(record.eventId) !== eventId),
            ]
          : current.myAttendance;
        return {
          ...current,
          assignedEvents: nextAssignedEvents,
          myAttendance: nextAttendance,
        };
      });

      setCheckInFeedbackByAssignmentId((prev) => ({
        ...prev,
        [assignmentId]: body?.checkedIn
          ? "Checked in - location verified"
          : asText(body?.message) || "We could not verify that you are at the event location.",
      }));
      void loadPortal({ silent: true });
    } catch (err) {
      const geolocationError = err as GeolocationPositionError;
      const denied =
        typeof geolocationError === "object" &&
        geolocationError !== null &&
        "code" in geolocationError &&
        geolocationError.code === 1;
      setCheckInFeedbackByAssignmentId((prev) => ({
        ...prev,
        [assignmentId]: denied
          ? "Location permission was denied. Please check in with the simulation team."
          : err instanceof Error
            ? err.message
            : "Could not check in. Please check in with the simulation team.",
      }));
    } finally {
      setCheckingInByAssignmentId((prev) => ({ ...prev, [assignmentId]: false }));
    }
  }

  return (
    <SiteShell title="SP Portal" subtitle="Confirmed event details, released materials, and day-of status.">
      <main style={{ display: "grid", gap: 16 }}>
        <section className="cfsp-panel-muted" style={{ borderRadius: 14, border: "1px solid var(--cfsp-border)", padding: 16, display: "grid", gap: 8 }}>
          <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.78rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            My confirmed work
          </div>
          <h2 style={{ margin: 0, fontSize: "1.28rem", color: "var(--cfsp-text)" }}>
            {portal?.sp?.name ? `Welcome, ${portal.sp.name}.` : "Welcome to your SP Portal."}
          </h2>
          <p style={{ margin: 0, color: "var(--cfsp-text-muted)", maxWidth: 820, fontWeight: 700 }}>
            Your confirmed events, released details, prep items, and attendance status appear here when your program makes them available.
          </p>
          {portal?.sp?.name ? (
            <p style={{ margin: 0, color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
              Signed in as <strong style={{ color: "var(--cfsp-text)" }}>{portal.sp.name}</strong>
            </p>
          ) : null}
          {portal ? (
            <p style={{ margin: 0, color: "var(--cfsp-text-muted)", fontWeight: 800 }}>
              {portalPreferenceNote(portal.communicationPreference)}
            </p>
          ) : null}
        </section>

        {error ? <div className="cfsp-alert cfsp-alert-error">{error}</div> : null}

        {loading ? (
          <div className="cfsp-panel" style={{ padding: 18, color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
            Loading your SP portal...
          </div>
        ) : null}

        {!loading && portal ? (
          <>
            <section id="assigned-events" className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.14rem", color: "var(--cfsp-text)" }}>My Confirmed Work</h3>
                  <div style={{ marginTop: 4, color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
                    Your scheduled events and the details your program has released.
                  </div>
                </div>
                <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 800, fontSize: "0.88rem" }}>
                  {portal.assignedEvents.length} assignment{portal.assignedEvents.length === 1 ? "" : "s"}
                </span>
              </div>
              {portal.assignedEvents.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  No confirmed upcoming events yet. Once staff schedules or confirms you for an event, the details will appear here.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {nextAssignedEvent ? (() => {
                    const assignmentId = asText(nextAssignedEvent.assignmentId || nextAssignedEvent.id);
                    const acknowledgmentItems = portalAcknowledgmentChecklist(nextAssignedEvent);
                    const acknowledgmentSavingForEvent = Object.fromEntries(
                      acknowledgmentItems.map((ackItem) => [ackItem.key, Boolean(savingAcknowledgmentByKey[`${assignmentId}:${ackItem.key}`])])
                    );
                    return (
                      <ConfirmedEventCard
                        key={nextAssignedEvent.assignmentId || nextAssignedEvent.id}
                        event={nextAssignedEvent}
                        acknowledgmentSavingByKey={acknowledgmentSavingForEvent}
                        acknowledgmentFeedback={asText(acknowledgmentFeedbackByAssignmentId[assignmentId])}
                        checkingIn={Boolean(checkingInByAssignmentId[assignmentId])}
                        checkInFeedback={asText(checkInFeedbackByAssignmentId[assignmentId])}
                        onAcknowledgmentToggle={(ackItem, checked) => void savePortalAcknowledgment(nextAssignedEvent, ackItem, checked)}
                        onCheckIn={() => void saveSpCheckIn(nextAssignedEvent)}
                      />
                    );
                  })() : null}

                  {otherAssignedEvents.length ? (
                    <details style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 12, background: "var(--cfsp-surface-muted)" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>
                        Other confirmed events ({otherAssignedEvents.length})
                      </summary>
                      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        {otherAssignedEvents.map((item) => {
                          const assignmentId = asText(item.assignmentId || item.id);
                          const acknowledgmentItems = portalAcknowledgmentChecklist(item);
                          const acknowledgmentSavingForEvent = Object.fromEntries(
                            acknowledgmentItems.map((ackItem) => [ackItem.key, Boolean(savingAcknowledgmentByKey[`${assignmentId}:${ackItem.key}`])])
                          );
                          return (
                            <ConfirmedEventCard
                              key={item.assignmentId || item.id}
                              event={item}
                              variant="secondary"
                              acknowledgmentSavingByKey={acknowledgmentSavingForEvent}
                              acknowledgmentFeedback={asText(acknowledgmentFeedbackByAssignmentId[assignmentId])}
                              checkingIn={Boolean(checkingInByAssignmentId[assignmentId])}
                              checkInFeedback={asText(checkInFeedbackByAssignmentId[assignmentId])}
                              onAcknowledgmentToggle={(ackItem, checked) => void savePortalAcknowledgment(item, ackItem, checked)}
                              onCheckIn={() => void saveSpCheckIn(item)}
                            />
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                </div>
              )}
            </section>

            <details id="open-shifts" className="cfsp-panel" style={{ padding: 18 }}>
              <summary style={{ cursor: "pointer", listStyle: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>Optional Open Shifts</h3>
                    <div style={{ marginTop: 4, color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
                      Extra opportunities your program has made available.
                    </div>
                  </div>
                  <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 850, fontSize: "0.88rem" }}>
                    {portal.openShifts.length} available
                  </span>
                </div>
              </summary>
              <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                {portal.openShifts.length === 0 ? (
                  <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                    No optional open shifts are available right now.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {portal.openShifts.map((shift) => {
                      const openingId = asText(shift.openingId);
                      const saving = Boolean(savingByOpeningId[openingId]);
                      const feedback = asText(saveFeedbackByOpeningId[openingId]);
                      const responseText = responseLabel(shift.currentResponse?.response);
                      const cleanRequirements = cleanSpFacingNote(shift.requirements);
                      const cleanNotes = cleanSpFacingNote(shift.notes);
                      return (
                        <article
                          key={openingId}
                          className="cfsp-panel-muted"
                          style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 850, fontSize: "1rem", color: "var(--cfsp-text)", overflowWrap: "anywhere" }}>{asText(shift.event?.name) || "CFSP Event"}</div>
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 700, marginTop: 3 }}>{asText(shift.title) || "Standardized Patient Shift"}</div>
                              <div style={{ color: "var(--cfsp-text-muted)", marginTop: 3 }}>
                                {formatDateLabel(shift.shift_date || shift.event?.date)} · {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)}
                              </div>
                            </div>
                            <StatusPill tone={shift.currentResponse?.response ? "success" : "neutral"}>{responseText}</StatusPill>
                          </div>
                          <div style={{ color: "var(--cfsp-text-muted)" }}>
                            {asText(shift.location || shift.event?.location) || "Location TBD"}
                            {asText(shift.room) ? ` · ${asText(shift.room)}` : ""}
                          </div>
                          {cleanRequirements ? (
                            <div style={{ color: "var(--cfsp-text)", fontSize: "0.92rem" }}>
                              <strong>Requirements:</strong> {cleanRequirements}
                            </div>
                          ) : null}
                          {cleanNotes ? (
                            <div style={{ color: "var(--cfsp-text)", fontSize: "0.92rem", whiteSpace: "pre-wrap" }}>
                              {cleanNotes}
                            </div>
                          ) : null}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="button" className="cfsp-btn cfsp-btn-success" disabled={saving} onClick={() => void saveShiftResponse(shift, "accepted")}>
                              {saving ? "Saving..." : "Accept"}
                            </button>
                            <button type="button" className="cfsp-btn cfsp-btn-secondary" disabled={saving} onClick={() => void saveShiftResponse(shift, "maybe")}>
                              Maybe
                            </button>
                            <button type="button" className="cfsp-btn cfsp-btn-subtle" disabled={saving} onClick={() => void saveShiftResponse(shift, "declined")}>
                              Decline
                            </button>
                            {feedback ? (
                              <span style={{ alignSelf: "center", color: feedback === "Saved ✓" ? "var(--cfsp-green)" : "var(--cfsp-danger)", fontWeight: 800 }}>
                                {feedback}
                              </span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}

                {sortedResponses.length ? (
                  <details style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>
                      My shift responses ({sortedResponses.length})
                    </summary>
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {sortedResponses.map((response) => (
                        <div
                          key={response.id}
                          className="cfsp-panel-muted"
                          style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 10 }}
                        >
                          <div style={{ fontWeight: 800, color: "var(--cfsp-text)" }}>{asText(response.event?.name) || "CFSP Event"}</div>
                          <div style={{ color: "var(--cfsp-text-muted)", marginTop: 3 }}>
                            {formatDateLabel(response.opening?.shift_date || response.event?.date)} · {formatTimeLabel(response.opening?.start_time)} - {formatTimeLabel(response.opening?.end_time)}
                          </div>
                          <div style={{ color: "var(--cfsp-text-muted)", marginTop: 3 }}>
                            Response: <strong style={{ color: "var(--cfsp-text)" }}>{responseLabel(response.response)}</strong>
                            {asText(response.updated_at || response.responded_at)
                              ? ` · Saved ${formatTimestampLabel(response.updated_at || response.responded_at)}`
                              : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </details>
          </>
        ) : null}
      </main>
    </SiteShell>
  );
}
