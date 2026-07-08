"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import {
  buildSpPortalCommandCenterState,
  buildSpPortalReadinessChecklist,
  buildSpPortalReleaseState,
  getSpPortalPendingDetailLabels,
  getSpPortalReleasedDetailLabels,
  getSpPortalAssignmentNextAction,
  getSpPortalResponseDisplay,
  type SpPortalReadinessChecklistItem,
  type SpPortalReleaseSectionKey,
  type SpPortalReleaseState,
  type SpPortalResponseAction,
} from "../lib/spPortalCommandCenter";
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
  release?: SpPortalReleaseState | null;
  schedule?: {
    released?: boolean | null;
    checked?: boolean | null;
    hasSourceInfo?: boolean | null;
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
  adminPreview?: {
    enabled?: boolean;
    spId?: string | null;
    spName?: string | null;
    viewerEmail?: string | null;
    viewerRole?: string | null;
  } | null;
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

const CHECK_IN_NOT_OPEN_LABEL = "Check-in not open yet — opens 2 hours before event start.";

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
  adminPreview?: SpPortalResponse["adminPreview"];
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

function responseLabel(value: unknown) {
  return getSpPortalResponseDisplay(value).label;
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

function releaseState(event: PortalAssignedEvent) {
  return buildSpPortalReleaseState(event.release || {
    eventBasics: true,
    location: Boolean(asText(event.location || event.event?.location)),
    arrival: Boolean(asText(event.reportCallTime || event.releaseEndTime || event.arrivalInstructions)),
    virtualAccess: Boolean(event.virtualLink),
    roleCase: Boolean(asText(event.role || event.caseInfo?.name || event.caseInfo?.note)),
    training: Boolean(event.training),
    schedule: Boolean(event.schedule?.released),
    materials: Boolean(event.materialsReleased && event.materials?.length),
  });
}

function releaseSection(event: PortalAssignedEvent, key: SpPortalReleaseSectionKey) {
  return releaseState(event)[key];
}

function materialStatusMessage(event: PortalAssignedEvent) {
  const release = releaseSection(event, "materials");
  if (!release.released) return release.spMessage;
  if (event.materialsReleased && event.materials?.length) return "Released materials";
  return "Training materials will appear here once released by the simulation team.";
}

function trainingSummary(event: PortalAssignedEvent) {
  const release = releaseSection(event, "training");
  if (!release.released) return release.spMessage;
  if (!event.training) return "Training details released.";
  const pieces = [
    asText(event.training.date) ? formatDateLabel(event.training.date) : "",
    asText(event.training.start_time || event.training.end_time) ? formatTimeRange(event.training.start_time, event.training.end_time) : "",
    asText(event.training.instructions),
  ].filter(Boolean);
  return pieces.join(" · ") || "Training details released.";
}

function scheduleSummary(event: PortalAssignedEvent) {
  const schedule = event.schedule;
  const release = releaseSection(event, "schedule");
  if (!release.released || !schedule?.released) return release.spMessage;
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
  const section = releaseSection(event, "arrival");
  if (!section.released) return section.spMessage;
  const report = asText(event.reportCallTime);
  const releaseTime = asText(event.releaseEndTime);
  return [
    report ? `Report ${report}` : "",
    releaseTime ? `Release ${releaseTime}` : "",
    asText(event.arrivalInstructions),
  ].filter(Boolean).join(" · ") || "Arrival/reporting instructions released.";
}

function roleCasePreview(event: PortalAssignedEvent) {
  const release = releaseSection(event, "roleCase");
  if (!release.released) return release.spMessage;
  const role = asText(event.role);
  const caseName = asText(event.caseInfo?.name);
  const caseNote = asText(event.caseInfo?.note);
  if (role && caseName) return `${role} · ${caseName}`;
  if (role) return role;
  if (caseName) return caseName;
  if (caseNote) return caseNote;
  return "Role/case assignment not released yet";
}

function locationPreview(event: PortalAssignedEvent) {
  const release = releaseSection(event, "location");
  if (!release.released) return release.spMessage;
  const location = asText(event.location || event.event?.location);
  const room = asText(event.event?.room);
  if (location && room) return `${location} · ${room}`;
  if (location) return location;
  return "Location released.";
}

function virtualAccessPreview(event: PortalAssignedEvent) {
  const release = releaseSection(event, "virtualAccess");
  if (!release.released) return release.spMessage;
  return event.virtualLink ? "Virtual access link released" : "Virtual access released.";
}

function cleanSpFacingNote(value: unknown) {
  const raw = asText(value);
  if (/CFSP_KEYSTONE_DEMO_FAKE_DATA|CFSP_SANDBOX_FAKE_DATA|fake poll\/opening|modeled after schedule/i.test(raw)) return "";
  const text = raw
    .replace(/\[CFSP[\s\S]*?\[\/CFSP[^\]]*\]/gi, "\n")
    .replace(/CFSP_KEYSTONE_DEMO_FAKE_DATA/gi, "")
    .replace(/CFSP_SANDBOX_FAKE_DATA/gi, "")
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
  return getSpPortalReleasedDetailLabels(releaseState(event));
}

function pendingDetailLabels(event: PortalAssignedEvent) {
  return getSpPortalPendingDetailLabels(releaseState(event));
}

function portalCheckInState(event: PortalAssignedEvent) {
  return event.checkIn || event.attendance?.checkIn || null;
}

function checkInNotOpenYet(event: PortalAssignedEvent) {
  return portalCheckInState(event)?.windowStatus === "not_open";
}

function eventCheckedInForPortal(event: PortalAssignedEvent) {
  if (checkInNotOpenYet(event)) return false;
  const attendanceStatus = asText(event.attendance?.status).toLowerCase();
  return attendanceStatus === "checked_in" || Boolean(event.attendance?.checked_in_at);
}

function beforeEventChecklist(event: PortalAssignedEvent): SpPortalReadinessChecklistItem[] {
  return buildSpPortalReadinessChecklist(releaseState(event));
}

function acknowledgmentChecked(event: PortalAssignedEvent, key: SpPortalAcknowledgmentKey) {
  return Boolean(asText(event.acknowledgments?.[key]));
}

function portalAcknowledgmentChecklist(event: PortalAssignedEvent): PortalAcknowledgmentChecklistItem[] {
  const release = releaseState(event);
  const items: PortalAcknowledgmentChecklistItem[] = [
    {
      key: "event_details",
      label: "Acknowledge event details",
      detail: `${formatDateLabel(event.event?.date)} · ${formatTimeRange(event.event?.start_time, event.event?.end_time)}`,
      checked: acknowledgmentChecked(event, "event_details"),
    },
  ];

  if (release.schedule.released) {
    items.push({
      key: "schedule",
      label: "Acknowledge schedule",
      detail: scheduleSummary(event),
      checked: acknowledgmentChecked(event, "schedule"),
    });
  }
  if (release.roleCase.released) {
    items.push({
      key: "role_case",
      label: "Acknowledge role/case information",
      detail: roleCasePreview(event),
      checked: acknowledgmentChecked(event, "role_case"),
    });
  }
  if (release.training.released) {
    items.push({
      key: "training",
      label: "Acknowledge training details",
      detail: trainingSummary(event),
      checked: acknowledgmentChecked(event, "training"),
    });
  }
  if (release.materials.released && event.materials?.length) {
    items.push({
      key: "materials",
      label: "Acknowledge materials/training",
      detail: `${event.materials.length} released file${event.materials.length === 1 ? "" : "s"}`,
      checked: acknowledgmentChecked(event, "materials"),
    });
  }
  if (release.arrival.released) {
    items.push({
      key: "arrival",
      label: "Acknowledge arrival instructions",
      detail: [
        asText(event.reportCallTime) ? `Report ${asText(event.reportCallTime)}` : "",
        asText(event.releaseEndTime) ? `Release ${asText(event.releaseEndTime)}` : "",
        asText(event.arrivalInstructions),
      ].filter(Boolean).join(" · ") || "Arrival/reporting instructions released.",
      checked: acknowledgmentChecked(event, "arrival"),
    });
  }

  return items;
}

function nextActionState(event: PortalAssignedEvent) {
  const pendingAcknowledgmentCount = portalAcknowledgmentChecklist(event).filter((item) => !item.checked).length;
  return getSpPortalAssignmentNextAction({
    assignmentStatus: event.status,
    confirmed: event.confirmed,
    readinessItems: beforeEventChecklist(event),
    pendingAcknowledgmentCount,
    checkedIn: eventCheckedInForPortal(event),
  });
}

function releaseSummaryText(event: PortalAssignedEvent) {
  const released = releasedDetailLabels(event).filter((label) => label !== "Event basics");
  const pending = pendingDetailLabels(event);
  if (released.length && pending.length) return `${released.length} released · ${pending.length} not released yet`;
  if (released.length) return "All core details that staff has prepared are released.";
  if (pending.length) return `Event basics visible · ${pending.length} detail${pending.length === 1 ? "" : "s"} not released yet`;
  return "Event basics visible.";
}

function attendanceDetail(event: PortalAssignedEvent) {
  if (checkInNotOpenYet(event)) return CHECK_IN_NOT_OPEN_LABEL;
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
  if (!checkIn) return "Check-in details are not available yet. Your simulation team will open check-in when it is ready.";
  const closesAt = formatTimestampLabel(checkIn.closesAt);
  if (!checkIn.geofenceReady) return "Check-in location is not set up yet. Please check in with the simulation team.";
  if (checkIn.windowStatus === "ready") return closesAt ? `Check-in is open until ${closesAt}.` : "Check-in is open.";
  if (checkIn.windowStatus === "not_open") return CHECK_IN_NOT_OPEN_LABEL;
  if (checkIn.windowStatus === "closed") return "Check-in is closed for this event.";
  return asText(checkIn.windowMessage) || "Check-in time is not set up yet. Check with your simulation team if you are onsite.";
}

function checkInStatusDetail(event: PortalAssignedEvent) {
  const checkIn = event.checkIn || event.attendance?.checkIn || null;
  const method = checkInMethodLabel(checkIn?.method);
  const attemptedAt = formatTimestampLabel(checkIn?.attemptedAt);
  if (checkInNotOpenYet(event)) return CHECK_IN_NOT_OPEN_LABEL;
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
    <div
      style={{
        border: "1px solid rgba(148, 163, 184, 0.22)",
        borderRadius: 9,
        padding: "10px 11px",
        minWidth: 0,
        background: "rgba(248, 250, 252, 0.58)",
      }}
    >
      <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.76rem", fontWeight: 900 }}>{label}</div>
      <div style={{ color: "var(--cfsp-text)", fontWeight: 850, marginTop: 4, overflowWrap: "anywhere" }}>{value}</div>
      {detail ? <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 4, fontSize: "0.88rem" }}>{detail}</div> : null}
    </div>
  );
}

function ReleaseStatusRow({ event }: { event: PortalAssignedEvent }) {
  const release = releaseState(event);
  const released = Object.values(release).filter((section) => section.released);
  const pending = Object.values(release).filter((section) => section.key !== "eventBasics" && !section.released);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 800 }}>{releaseSummaryText(event)}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {released.map((section) => (
          <StatusPill key={`released-${section.key}`} tone="success">
            {section.key === "eventBasics" ? "Event basics visible" : `${section.label} released`}
          </StatusPill>
        ))}
        {pending.map((section) => (
          <StatusPill key={`pending-${section.key}`} tone="waiting">{section.label} not released yet</StatusPill>
        ))}
      </div>
    </div>
  );
}

function BeforeEventChecklist({ items }: { items: SpPortalReadinessChecklistItem[] }) {
  return (
    <div className="cfsp-panel" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
      <div>
        <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>SP readiness checklist</div>
        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 3 }}>
          Available items are ready to review. Not released items are controlled by your simulation team.
        </div>
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
              background: item.status === "available" ? "rgba(209, 250, 229, 0.34)" : "var(--cfsp-surface)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--cfsp-text)", fontWeight: 850 }}>{item.label}</div>
              <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 3, overflowWrap: "anywhere" }}>{item.detail}</div>
            </div>
            <StatusPill tone={item.status === "available" ? "success" : item.status === "not_needed" ? "neutral" : "waiting"}>{item.statusLabel}</StatusPill>
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
    <div style={{ display: "grid", gap: 6 }}>
        {items.map((item) => {
          const saving = Boolean(savingByKey[item.key]);
          return (
            <label
              key={item.key}
              style={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr) auto",
                gap: 9,
                alignItems: "start",
                borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
                padding: "8px 0",
                background: "transparent",
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
                <span style={{ display: "block", color: "var(--cfsp-text-muted)", fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" }}>{item.detail}</span>
              </span>
              <StatusPill tone={item.checked ? "success" : "waiting"}>{saving ? "Saving" : item.checked ? "Acknowledged" : "Not yet acknowledged"}</StatusPill>
            </label>
          );
        })}
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
  const checkInNotOpen = checkInNotOpenYet(event);
  const checkedIn = eventCheckedInForPortal(event);
  const locationVerified = checkIn?.locationVerified === true;
  const canCheckIn = Boolean(checkIn?.canCheckIn && !checkedIn);
  const statusTone = checkedIn ? "success" : checkIn?.method === "location_failed" && !checkInNotOpen ? "waiting" : "neutral";
  const statusText = checkInNotOpen
    ? "Not open yet"
    : checkedIn
    ? locationVerified
      ? "Checked in - location verified"
      : "Checked in"
    : checkIn?.method === "location_failed"
      ? "Location not verified"
      : "Not checked in";

  return (
    <div style={{ display: "grid", gap: 10 }}>
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
  const checkedIn = eventCheckedInForPortal(event);
  const checkInNotOpen = checkInNotOpenYet(event);
  const checkIn = event.checkIn || event.attendance?.checkIn || null;
  const checkInLabel = checkInNotOpen
    ? CHECK_IN_NOT_OPEN_LABEL
    : checkedIn
    ? checkIn?.locationVerified === true
      ? "Checked in - location verified"
      : "Checked in"
    : checkIn?.method === "location_failed"
      ? "Location not verified"
      : "Not checked in";
  const acknowledgmentItems = portalAcknowledgmentChecklist(event);
  const acknowledgedCount = acknowledgmentItems.filter((item) => item.checked).length;
  const materials = event.materialsReleased && event.materials?.length ? event.materials : [];
  const isPrimary = variant === "primary";
  const readinessItems = beforeEventChecklist(event);
  const nextAction = nextActionState(event);

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
            Confirmed event
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
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <InfoTile label="Event Basics" value={`${eventDate} · ${eventTime}`} detail="Visible" />
        <InfoTile label="Location / Room" value={locationPreview(event)} />
        <InfoTile label="Virtual Access" value={virtualAccessPreview(event)} />
        <InfoTile label="Report / Release" value={reportPreview(event)} detail={asText(event.arrivalInstructions) || undefined} />
        <InfoTile label="Role / Case" value={roleCasePreview(event)} />
        <InfoTile label="Schedule Preview" value={scheduleSummary(event)} />
        <InfoTile label="Training" value={trainingSummary(event)} />
        <InfoTile label="Materials" value={materialStatusMessage(event)} />
        <InfoTile label="Acknowledgments" value={`${acknowledgedCount} / ${acknowledgmentItems.length} acknowledged`} />
        <InfoTile label="Check-in" value={checkInLabel} />
      </div>

      <ReleaseStatusRow event={event} />

      <BeforeEventChecklist items={readinessItems} />

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
          <StatusPill tone={nextAction.tone}>{nextAction.label}</StatusPill>
        </div>
        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>{nextAction.detail}</div>
        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "0.86rem" }}>
          {acknowledgedCount} / {acknowledgmentItems.length} released checklist item{acknowledgmentItems.length === 1 ? "" : "s"} acknowledged
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <details style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>Released details</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
              Only details your simulation team has released are shown here.
            </div>
            {event.eventNote ? (
              <div style={{ color: "var(--cfsp-text)", fontWeight: 750, lineHeight: 1.5 }}>
                {event.eventNote}
              </div>
            ) : null}
            <InfoTile label="Location / Room" value={locationPreview(event)} />
            {event.virtualLink ? (
              <a href={event.virtualLink} target="_blank" rel="noreferrer" style={{ color: "var(--cfsp-blue)", fontWeight: 850 }}>
                Virtual event link
              </a>
            ) : null}
            <InfoTile label="Virtual Access" value={virtualAccessPreview(event)} />
            <InfoTile label="Role / Case" value={roleCasePreview(event)} />
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

        <details style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>Acknowledgments</summary>
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
          <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>Released training/materials</summary>
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
    adminPreview: body.adminPreview || null,
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
  const [portalNotice, setPortalNotice] = useState("");
  const [savingAcknowledgmentByKey, setSavingAcknowledgmentByKey] = useState<Record<string, boolean>>({});
  const [acknowledgmentFeedbackByAssignmentId, setAcknowledgmentFeedbackByAssignmentId] = useState<Record<string, string>>({});
  const [checkingInByAssignmentId, setCheckingInByAssignmentId] = useState<Record<string, boolean>>({});
  const [checkInFeedbackByAssignmentId, setCheckInFeedbackByAssignmentId] = useState<Record<string, string>>({});

  const loadPortal = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      setError("");
      try {
        const previewSpId =
          typeof window === "undefined" ? "" : asText(new URLSearchParams(window.location.search).get("previewSpId"));
        const query = previewSpId ? `?previewSpId=${encodeURIComponent(previewSpId)}` : "";
        const response = await fetch(`/api/sp/portal${query}`, {
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

  const commandCenterState = useMemo(() => {
    if (!portal) {
      return buildSpPortalCommandCenterState<PortalOpenShift, PortalResponseRecord, PortalAssignedEvent>({
        openShifts: [],
        myResponses: [],
        assignedEvents: [],
      });
    }
    return buildSpPortalCommandCenterState<PortalOpenShift, PortalResponseRecord, PortalAssignedEvent>({
      openShifts: portal.openShifts,
      myResponses: portal.myResponses,
      assignedEvents: portal.assignedEvents,
    });
  }, [portal]);

  const sortedAssignedEvents = useMemo(() => {
    if (!commandCenterState.confirmedAssignments.length) return null;
    return [...commandCenterState.confirmedAssignments].sort((a, b) => {
      const aKey = eventDateTimeKey(a.event);
      const bKey = eventDateTimeKey(b.event);
      if (aKey !== bKey) return aKey - bKey;
      return asText(a.event?.name).localeCompare(asText(b.event?.name));
    });
  }, [commandCenterState.confirmedAssignments]);
  const nextAssignedEvent = sortedAssignedEvents?.[0] || null;
  const otherAssignedEvents = sortedAssignedEvents?.slice(1) || [];

  const actionableOpenShifts = commandCenterState.openShifts;
  const pendingResponses = commandCenterState.pendingResponses.sort((a, b) =>
    asText(b.updated_at || b.responded_at).localeCompare(asText(a.updated_at || a.responded_at))
  );
  const responseHistory = commandCenterState.pastResponses.sort((a, b) =>
    asText(b.updated_at || b.responded_at).localeCompare(asText(a.updated_at || a.responded_at))
  );

  async function saveShiftResponse(shift: PortalOpenShift, nextResponse: SpPortalResponseAction) {
    const openingId = asText(shift.openingId);
    const eventId = asText(shift.event?.id);
    if (!openingId || !eventId) return;
    if (portal?.adminPreview?.enabled) {
      setSaveFeedbackByOpeningId((prev) => ({
        ...prev,
        [openingId]: "Admin preview is read-only. Log in as the linked SP to respond.",
      }));
      return;
    }

    setSavingByOpeningId((prev) => ({ ...prev, [openingId]: true }));
    setSaveFeedbackByOpeningId((prev) => ({ ...prev, [openingId]: "" }));
    setPortalNotice("");

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

        const nextOpenShifts = current.openShifts.filter((item) => asText(item.openingId) !== openingId);

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

      setPortalNotice(nextResponse === "accepted" ? "Response sent — awaiting confirmation." : "Response sent — declined.");
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
    if (portal?.adminPreview?.enabled) {
      setAcknowledgmentFeedbackByAssignmentId((prev) => ({
        ...prev,
        [assignmentId]: "Admin preview is read-only. Log in as the linked SP to acknowledge.",
      }));
      return;
    }

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
    if (portal?.adminPreview?.enabled) {
      setCheckInFeedbackByAssignmentId((prev) => ({
        ...prev,
        [assignmentId]: "Admin preview is read-only. Log in as the linked SP to check in.",
      }));
      return;
    }

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

  const adminPreviewEnabled = Boolean(portal?.adminPreview?.enabled);
  const previewSpName = asText(portal?.adminPreview?.spName || portal?.sp?.name);

  return (
    <SiteShell
      title={adminPreviewEnabled ? `Admin Preview: ${previewSpName || "SP Portal"}` : "SP Confirmed Work Hub"}
      subtitle={
        adminPreviewEnabled
          ? "Preview-only SP portal view. You are still signed in with your admin account."
          : "Confirmed assignments, released prep details, materials, acknowledgments, and event-day check-in."
      }
    >
      <main style={{ display: "grid", gap: 16 }}>
        <section className="cfsp-panel-muted" style={{ borderRadius: 14, border: "1px solid var(--cfsp-border)", padding: 16, display: "grid", gap: 8 }}>
          <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.78rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            SP Portal
          </div>
          <h2 style={{ margin: 0, fontSize: "1.28rem", color: "var(--cfsp-text)" }}>
            {portal?.sp?.name ? `Welcome, ${portal.sp.name}.` : "Your confirmed simulation work, all in one place."}
          </h2>
          <p style={{ margin: 0, color: "var(--cfsp-text-muted)", maxWidth: 820, fontWeight: 700 }}>
            Your confirmed assignments, event date/time/location, report and release details, role/case, released schedule preview,
            training/materials, acknowledgments, and check-in status appear here when your simulation team makes them available.
          </p>
          <p style={{ margin: 0, color: "var(--cfsp-text-muted)", maxWidth: 820, fontWeight: 700 }}>
            If anything looks wrong or missing for work you believe is confirmed, contact your simulation team before event day.
          </p>
        </section>

        {adminPreviewEnabled ? (
          <section className="cfsp-alert cfsp-alert-info" style={{ display: "grid", gap: 6 }}>
            <strong>Admin preview — not logged in as this SP.</strong>
            <span>
              You are previewing what {previewSpName || "this SP"} can see after confirmation and portal release. Responses,
              acknowledgments, and check-in are read-only here; use a linked SP account to test the live SP workflow.
            </span>
          </section>
        ) : null}

        {error ? <div className="cfsp-alert cfsp-alert-error">{error}</div> : null}
        {portalNotice ? <div className="cfsp-alert cfsp-alert-success">{portalNotice}</div> : null}

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
                  <h3 style={{ margin: 0, fontSize: "1.14rem", color: "var(--cfsp-text)" }}>Confirmed Assignments</h3>
                  <div style={{ marginTop: 4, color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
                    Your confirmed simulation work and the details your program has released to you.
                  </div>
                </div>
                <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 800, fontSize: "0.88rem" }}>
                  {commandCenterState.counts.confirmedAssignments} assignment{commandCenterState.counts.confirmedAssignments === 1 ? "" : "s"}
                </span>
              </div>
              {commandCenterState.counts.confirmedAssignments === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  No confirmed assignments yet. Once your simulation team confirms you for an event, the event date/time/location, report
                  time, role/case, released schedule preview, and released training/materials will appear here.
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

            <section id="pending-responses" className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>Pending Responses</h3>
                  <div style={{ marginTop: 4, color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
                    Offers you accepted that are waiting for the simulation team to confirm.
                  </div>
                </div>
                <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 850, fontSize: "0.88rem" }}>
                  {commandCenterState.counts.pendingResponses} pending
                </span>
              </div>
              {pendingResponses.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  No responses are waiting for confirmation.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {pendingResponses.map((response) => (
                    <div
                      key={response.id}
                      className="cfsp-panel-muted"
                      style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 850, color: "var(--cfsp-text)", overflowWrap: "anywhere" }}>
                            {asText(response.event?.name) || "CFSP Event"}
                          </div>
                          <div style={{ color: "var(--cfsp-text-muted)", marginTop: 3 }}>
                            {formatDateLabel(response.opening?.shift_date || response.event?.date)} · {formatTimeLabel(response.opening?.start_time)} - {formatTimeLabel(response.opening?.end_time)}
                          </div>
                        </div>
                        <StatusPill tone="waiting">Response sent — awaiting confirmation</StatusPill>
                      </div>
                      {asText(response.updated_at || response.responded_at) ? (
                        <div style={{ marginTop: 8, color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
                          Sent {formatTimestampLabel(response.updated_at || response.responded_at)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <details id="open-shifts" className="cfsp-panel" style={{ padding: 18 }}>
              <summary style={{ cursor: "pointer", listStyle: "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>Open Shift Offers</h3>
                    <div style={{ marginTop: 4, color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
                      These are availability offers, not confirmed assignments. Confirmed assignments stay above after the simulation team confirms you.
                    </div>
                  </div>
                  <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 850, fontSize: "0.88rem" }}>
                    {commandCenterState.counts.openShifts} available
                  </span>
                </div>
              </summary>
              <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                {actionableOpenShifts.length === 0 ? (
                  <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                    No open shift offers need a response right now.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {actionableOpenShifts.map((shift) => {
                      const openingId = asText(shift.openingId);
                      const saving = Boolean(savingByOpeningId[openingId]);
                      const feedback = asText(saveFeedbackByOpeningId[openingId]);
                      const responseText = responseLabel(shift.currentResponse?.response);
                      const responseStatus = asText(shift.currentResponse?.response).toLowerCase();
                      const responseTone: "success" | "waiting" | "neutral" = responseStatus === "accepted" || responseStatus === "available"
                        ? "waiting"
                        : responseStatus
                          ? "neutral"
                          : "neutral";
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
                            <StatusPill tone={responseTone}>{responseText}</StatusPill>
                          </div>
                          {shift.currentResponse?.response ? (
                            <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.9rem", fontWeight: 750 }}>
                              {asText(shift.currentResponse.response).toLowerCase() === "accepted" || asText(shift.currentResponse.response).toLowerCase() === "available"
                                ? "Your response was sent to the simulation team. This is not confirmed work until they confirm your assignment."
                                : "Your response was sent to the simulation team."}
                            </div>
                          ) : null}
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

                {responseHistory.length ? (
                  <details style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 900, color: "var(--cfsp-text)" }}>
                      Past or declined responses ({responseHistory.length})
                    </summary>
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      {responseHistory.map((response) => (
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
