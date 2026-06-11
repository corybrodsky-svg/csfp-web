"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";

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
};

type PortalAssignedEvent = {
  id: string;
  assignmentId?: string | null;
  eventId?: string | null;
  status?: string | null;
  confirmed?: boolean | null;
  role?: string | null;
  event?: PortalEventSummary | null;
  location?: string | null;
  virtualLink?: string | null;
  arrivalInstructions?: string | null;
  reportCallTime?: string | null;
  releaseEndTime?: string | null;
  training?: {
    date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    link?: string | null;
    password?: string | null;
  } | null;
  caseInfo?: {
    name?: string | null;
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
  } | null;
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
  if (event.materialsReleased) return "Materials are marked ready, but no files are attached yet.";
  return "Materials are not available yet.";
}

function scheduleSummary(event: PortalAssignedEvent) {
  const schedule = event.schedule;
  if (!schedule?.released) return "Schedule/rotation details are not available yet.";
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
  return asText(event.reportCallTime) || "Report time not available yet";
}

function roleCasePreview(event: PortalAssignedEvent) {
  const role = asText(event.role);
  const caseName = asText(event.caseInfo?.name);
  if (role && caseName) return `${role} · ${caseName}`;
  if (role) return role;
  if (caseName) return caseName;
  return "Role/case not available yet";
}

function locationPreview(event: PortalAssignedEvent) {
  const location = asText(event.location || event.event?.location);
  const room = asText(event.event?.room);
  if (location && room) return `${location} · ${room}`;
  if (location) return location;
  if (event.virtualLink) return "Virtual access released";
  return "Location not available yet";
}

function releasedDetailLabels(event: PortalAssignedEvent) {
  const labels: string[] = [];
  if (asText(event.location || event.event?.location) || event.virtualLink) labels.push("Location");
  if (asText(event.reportCallTime) || asText(event.arrivalInstructions)) labels.push("Arrival");
  if (asText(event.role) || asText(event.caseInfo?.name)) labels.push("Role/case");
  if (event.training) labels.push("Training");
  if (event.schedule?.released) labels.push("Schedule");
  if (event.materialsReleased && event.materials?.length) labels.push("Materials");
  labels.push("Attendance");
  return labels;
}

function pendingDetailLabels(event: PortalAssignedEvent) {
  const labels: string[] = [];
  if (!asText(event.location || event.event?.location) && !event.virtualLink) labels.push("location");
  if (!asText(event.reportCallTime) && !asText(event.arrivalInstructions)) labels.push("arrival instructions");
  if (!asText(event.role) && !asText(event.caseInfo?.name)) labels.push("role/case");
  if (!event.training) labels.push("training details");
  if (!event.schedule?.released) labels.push("schedule");
  if (!event.materialsReleased || !event.materials?.length) labels.push("materials");
  return labels;
}

function beforeEventActions(event: PortalAssignedEvent) {
  const actions: string[] = [];
  const attendance = asText(event.attendance?.status).toLowerCase();
  if (attendance === "arrived" || attendance === "checked_in") actions.push("You are checked in for this event.");
  if (event.training) actions.push("Review the released training details.");
  if (event.materials?.length) actions.push("Review the released materials.");
  if (event.schedule?.released) actions.push("Review the schedule/rotation preview.");
  if (asText(event.reportCallTime) || asText(event.arrivalInstructions)) actions.push("Check reporting instructions before event day.");
  return actions.length ? actions : ["No action required yet. Staff will release more details here when they are ready."];
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

  const nextAssignedEvent = useMemo(() => {
    if (!portal?.assignedEvents.length) return null;
    return [...portal.assignedEvents].sort((a, b) => {
      const aKey = eventDateTimeKey(a.event);
      const bKey = eventDateTimeKey(b.event);
      if (aKey !== bKey) return aKey - bKey;
      return asText(a.event?.name).localeCompare(asText(b.event?.name));
    })[0] || null;
  }, [portal]);

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

  return (
    <SiteShell title="SP Portal" subtitle="My confirmed events, released details, materials, and attendance status.">
      <main style={{ display: "grid", gap: 16 }}>
        <section className="cfsp-panel-muted" style={{ borderRadius: 14, border: "1px solid var(--cfsp-border)", padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: "1.25rem", color: "var(--cfsp-text)" }}>My Confirmed Events</h2>
          <p style={{ margin: "8px 0 0", color: "var(--cfsp-text-muted)", maxWidth: 820 }}>
            This is your confirmed-work hub. Events appear here after staff schedules or confirms you. Availability polls and Microsoft Forms may still arrive by email.
          </p>
          {portal?.sp?.name ? (
            <p style={{ margin: "10px 0 0", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
              Signed in as <strong style={{ color: "var(--cfsp-text)" }}>{portal.sp.name}</strong>
            </p>
          ) : null}
          {portal ? (
            <p style={{ margin: "8px 0 0", color: "var(--cfsp-text-muted)", fontWeight: 800 }}>
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
            {nextAssignedEvent ? (
              <section className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.78rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Next confirmed event
                    </div>
                    <h3 style={{ margin: "4px 0 0", fontSize: "1.22rem", color: "var(--cfsp-text)" }}>
                      {asText(nextAssignedEvent.event?.name) || "CFSP Event"}
                    </h3>
                    <div style={{ marginTop: 6, color: "var(--cfsp-text)", fontWeight: 800 }}>
                      {formatDateLabel(nextAssignedEvent.event?.date)} · {formatTimeRange(nextAssignedEvent.event?.start_time, nextAssignedEvent.event?.end_time)}
                    </div>
                  </div>
                  <span style={{ color: "var(--cfsp-green)", fontWeight: 900, fontSize: "0.9rem" }}>
                    {assignmentStatusLabel(nextAssignedEvent.status, nextAssignedEvent.confirmed)}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
                  <div className="cfsp-panel-muted" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.76rem", fontWeight: 900 }}>Where</div>
                    <div style={{ color: "var(--cfsp-text)", fontWeight: 800, marginTop: 4 }}>{locationPreview(nextAssignedEvent)}</div>
                  </div>
                  <div className="cfsp-panel-muted" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.76rem", fontWeight: 900 }}>Report</div>
                    <div style={{ color: "var(--cfsp-text)", fontWeight: 800, marginTop: 4 }}>{reportPreview(nextAssignedEvent)}</div>
                  </div>
                  <div className="cfsp-panel-muted" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.76rem", fontWeight: 900 }}>Role / Case</div>
                    <div style={{ color: "var(--cfsp-text)", fontWeight: 800, marginTop: 4 }}>{roleCasePreview(nextAssignedEvent)}</div>
                  </div>
                  <div className="cfsp-panel-muted" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ color: "var(--cfsp-text-muted)", fontSize: "0.76rem", fontWeight: 900 }}>Before the Event</div>
                    <div style={{ color: "var(--cfsp-text)", fontWeight: 800, marginTop: 4 }}>{beforeEventActions(nextAssignedEvent)[0]}</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 850 }}>Released:</span>
                  {releasedDetailLabels(nextAssignedEvent).map((label) => (
                    <span
                      key={label}
                      style={{
                        border: "1px solid rgba(25, 138, 112, 0.22)",
                        background: "rgba(209, 250, 229, 0.56)",
                        color: "#065f46",
                        borderRadius: 999,
                        padding: "4px 8px",
                        fontSize: "0.78rem",
                        fontWeight: 900,
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                {pendingDetailLabels(nextAssignedEvent).length ? (
                  <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>
                    Not available yet: {pendingDetailLabels(nextAssignedEvent).slice(0, 4).join(", ")}
                    {pendingDetailLabels(nextAssignedEvent).length > 4 ? ", and more" : ""}.
                  </div>
                ) : null}
              </section>
            ) : null}

            <section id="assigned-events" className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>My Confirmed Events</h3>
                <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 800, fontSize: "0.88rem" }}>
                  {portal.assignedEvents.length} assignment{portal.assignedEvents.length === 1 ? "" : "s"}
                </span>
              </div>
              {portal.assignedEvents.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  No confirmed upcoming events yet. Once staff schedules or confirms you for an event, the details will appear here.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {portal.assignedEvents.map((item) => {
                    const event = item.event;
                    const eventName = asText(event?.name) || "CFSP Event";
                    const eventDate = formatDateLabel(event?.date);
                    const eventTime = formatTimeRange(event?.start_time, event?.end_time);
                    const attendanceText = attendanceLabel(item.attendance?.status);
                    const releasedLabels = releasedDetailLabels(item);
                    const pendingLabels = pendingDetailLabels(item);
                    const eventActions = beforeEventActions(item);
                    return (
                      <article
                        key={item.assignmentId || item.id}
                        className="cfsp-panel-muted"
                        style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}
                      >
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 900, fontSize: "1.06rem", color: "var(--cfsp-text)" }}>{eventName}</div>
                            <span style={{ color: "var(--cfsp-green)", fontWeight: 900, fontSize: "0.86rem" }}>
                              {assignmentStatusLabel(item.status, item.confirmed)}
                            </span>
                          </div>
                          <div style={{ color: "var(--cfsp-text)", fontWeight: 750 }}>{eventDate} · {eventTime}</div>
                          <div style={{ color: "var(--cfsp-text-muted)" }}>
                            {locationPreview(item)}
                          </div>
                          <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>Report: {reportPreview(item)}</div>
                          <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 750 }}>Role/case: {roleCasePreview(item)}</div>
                          {item.virtualLink ? (
                            <a href={item.virtualLink} target="_blank" rel="noreferrer" style={{ color: "var(--cfsp-blue)", fontWeight: 800 }}>
                              Virtual event link
                            </a>
                          ) : null}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {releasedLabels.slice(0, 5).map((label) => (
                              <span
                                key={label}
                                style={{
                                  border: "1px solid rgba(25, 138, 112, 0.2)",
                                  background: "rgba(209, 250, 229, 0.52)",
                                  color: "#065f46",
                                  borderRadius: 999,
                                  padding: "3px 7px",
                                  fontSize: "0.74rem",
                                  fontWeight: 900,
                                }}
                              >
                                {label}
                              </span>
                            ))}
                            {pendingLabels.length ? (
                              <span
                                style={{
                                  border: "1px solid var(--cfsp-border)",
                                  background: "var(--cfsp-surface)",
                                  color: "var(--cfsp-text-muted)",
                                  borderRadius: 999,
                                  padding: "3px 7px",
                                  fontSize: "0.74rem",
                                  fontWeight: 900,
                                }}
                              >
                                {pendingLabels.length} not available yet
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <details style={{ borderTop: "1px solid var(--cfsp-border)", paddingTop: 10 }}>
                          <summary style={{ cursor: "pointer", fontWeight: 850, color: "var(--cfsp-text)" }}>Event details and released materials</summary>
                          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                            <div className="cfsp-panel" style={{ border: "1px solid var(--cfsp-border)", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}>
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>Before the event</div>
                              <ul style={{ margin: 0, paddingLeft: 18, color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                                {eventActions.map((action) => (
                                  <li key={action}>{action}</li>
                                ))}
                              </ul>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                              <div>
                                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 800, fontSize: "0.78rem" }}>Role / Case</div>
                                <div style={{ color: "var(--cfsp-text)", fontWeight: 750 }}>
                                  {roleCasePreview(item)}
                                </div>
                              </div>
                              <div>
                                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 800, fontSize: "0.78rem" }}>Arrival</div>
                                <div style={{ color: "var(--cfsp-text)", fontWeight: 750 }}>
                                  {reportPreview(item)}
                                  {asText(item.releaseEndTime) ? ` · Release ${asText(item.releaseEndTime)}` : ""}
                                </div>
                              </div>
                              <div>
                                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 800, fontSize: "0.78rem" }}>Attendance</div>
                                <div style={{ color: "var(--cfsp-text)", fontWeight: 750 }}>{attendanceText}</div>
                              </div>
                            </div>

                            {item.arrivalInstructions ? (
                              <div style={{ color: "var(--cfsp-text)" }}>
                                <strong>Reporting instructions:</strong> {item.arrivalInstructions}
                              </div>
                            ) : (
                              <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>Reporting instructions are not available yet.</div>
                            )}

                            <div style={{ display: "grid", gap: 5 }}>
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 850 }}>Training</div>
                              {item.training ? (
                                <div style={{ color: "var(--cfsp-text-muted)" }}>
                                  {formatDateLabel(item.training.date)} · {formatTimeRange(item.training.start_time, item.training.end_time)}
                                  {item.training.link ? (
                                    <>
                                      {" · "}
                                      <a href={item.training.link} target="_blank" rel="noreferrer" style={{ color: "var(--cfsp-blue)", fontWeight: 800 }}>
                                        Training link
                                      </a>
                                    </>
                                  ) : null}
                                  {item.training.password ? ` · Password: ${item.training.password}` : ""}
                                </div>
                              ) : (
                                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>Training details are not available yet.</div>
                              )}
                            </div>

                            <div style={{ display: "grid", gap: 5 }}>
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 850 }}>Schedule / Rotation</div>
                              <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>{scheduleSummary(item)}</div>
                            </div>

                            <div style={{ display: "grid", gap: 7 }}>
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 850 }}>{materialStatusMessage(item)}</div>
                              {item.materials?.length ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                  {item.materials.map((material) => (
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
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section id="open-shifts" className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>Optional Open Shifts</h3>
              {portal.openShifts.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  No optional open shifts are available right now.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {portal.openShifts.map((shift) => {
                    const openingId = asText(shift.openingId);
                    const saving = Boolean(savingByOpeningId[openingId]);
                    const feedback = asText(saveFeedbackByOpeningId[openingId]);
                    const responseText = responseLabel(shift.currentResponse?.response);
                    return (
                      <article
                        key={openingId}
                        className="cfsp-panel-muted"
                        style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 14, display: "grid", gap: 8 }}
                      >
                        <div style={{ display: "grid", gap: 3 }}>
                          <div style={{ fontWeight: 850, fontSize: "1.04rem", color: "var(--cfsp-text)" }}>{asText(shift.event?.name) || "CFSP Event"}</div>
                          <div style={{ color: "var(--cfsp-text)", fontWeight: 700 }}>Shift: {asText(shift.title) || "Standardized Patient Shift"}</div>
                          <div style={{ color: "var(--cfsp-text-muted)" }}>
                            {formatDateLabel(shift.shift_date || shift.event?.date)} · {formatTimeLabel(shift.start_time)} - {formatTimeLabel(shift.end_time)}
                          </div>
                          <div style={{ color: "var(--cfsp-text-muted)" }}>
                            {asText(shift.location || shift.event?.location) || "Location TBD"}
                            {asText(shift.room) ? ` · ${asText(shift.room)}` : ""}
                          </div>
                        </div>
                        {asText(shift.requirements) ? (
                          <div style={{ color: "var(--cfsp-text)", fontSize: "0.92rem" }}>
                            <strong>Requirements:</strong> {asText(shift.requirements)}
                          </div>
                        ) : null}
                        {asText(shift.notes) ? (
                          <div style={{ color: "var(--cfsp-text)", fontSize: "0.92rem" }}>
                            <strong>Notes:</strong> {asText(shift.notes)}
                          </div>
                        ) : null}
                        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>Current response: {responseText}</div>
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
            </section>

            <section id="my-responses" className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>My Responses</h3>
              <p style={{ margin: 0, color: "var(--cfsp-text-muted)" }}>
                Staff will confirm final assignments. You can change your response if needed.
              </p>
              {sortedResponses.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>You have not responded to any shifts yet.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {sortedResponses.map((response) => (
                    <article
                      key={response.id}
                      className="cfsp-panel-muted"
                      style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 12, display: "grid", gap: 6 }}
                    >
                      <div style={{ fontWeight: 800, color: "var(--cfsp-text)" }}>{asText(response.event?.name) || "CFSP Event"}</div>
                      <div style={{ color: "var(--cfsp-text-muted)" }}>
                        {formatDateLabel(response.opening?.shift_date || response.event?.date)} · {formatTimeLabel(response.opening?.start_time)} - {formatTimeLabel(response.opening?.end_time)}
                      </div>
                      <div style={{ color: "var(--cfsp-text-muted)" }}>
                        Response: <strong style={{ color: "var(--cfsp-text)" }}>{responseLabel(response.response)}</strong>
                        {asText(response.updated_at || response.responded_at)
                          ? ` · Saved ${formatTimestampLabel(response.updated_at || response.responded_at)}`
                          : ""}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section id="my-attendance" className="cfsp-panel" style={{ padding: 18, display: "grid", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: "1.12rem", color: "var(--cfsp-text)" }}>My Attendance Status</h3>
              {sortedAttendance.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  No attendance records yet. Day-of status appears here after staff starts tracking your event attendance.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {sortedAttendance.map((record) => (
                    <article
                      key={record.id}
                      className="cfsp-panel-muted"
                      style={{ border: "1px solid var(--cfsp-border)", borderRadius: 12, padding: 12, display: "grid", gap: 6 }}
                    >
                      <div style={{ fontWeight: 800, color: "var(--cfsp-text)" }}>{asText(record.event?.name) || "CFSP Event"}</div>
                      <div style={{ color: "var(--cfsp-text-muted)" }}>
                        {formatDateLabel(record.event?.date)} · {formatTimeLabel(record.event?.start_time)} - {formatTimeLabel(record.event?.end_time)}
                      </div>
                      <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                        Status: <strong style={{ color: "var(--cfsp-text)" }}>{attendanceLabel(record.status)}</strong>
                      </div>
                      {asText(record.checked_in_at) ? (
                        <div style={{ color: "var(--cfsp-text-muted)" }}>
                          Checked in: {new Date(asText(record.checked_in_at)).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      ) : null}
                      {asText(record.checked_out_at) ? (
                        <div style={{ color: "var(--cfsp-text-muted)" }}>
                          Checked out: {new Date(asText(record.checked_out_at)).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </SiteShell>
  );
}
