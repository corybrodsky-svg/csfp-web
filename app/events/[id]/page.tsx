"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import EventPlanningTimeline from "../../components/EventPlanningTimeline";
import SiteShell from "../../components/SiteShell";
import {
  formatHumanDate,
  getImportedYearHint,
  normalizeLooseDateToIso,
} from "../../lib/eventDateUtils";
import {
  classifyEventPresentation,
  getEventBadgeAppearance,
  isSkillsWorkshopEvent,
  type EventDisplayType,
} from "../../lib/eventClassification";

type EventDetailRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed: number | null;
  visibility: string | null;
  location: string | null;
  notes: string | null;
  created_at: string | null;
};

type EventSessionRow = {
  id: string;
  event_id: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  room: string | null;
  created_at: string | null;
};

type SPRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  working_email: string | null;
  email: string | null;
  phone: string | null;
  portrayal_age: string | null;
  race: string | null;
  sex: string | null;
  telehealth: string | null;
  pt_preferred: string | null;
  other_roles: string | null;
  speaks_spanish: string | boolean | null;
  notes: string | null;
  status: string | null;
};

type AssignmentRow = {
  id: string;
  event_id: string | null;
  sp_id: string | null;
  status: AssignmentStatus | null;
  confirmed: boolean | null;
  notes: string | null;
  last_contacted_at: string | null;
  contact_method: ContactMethod | null;
  created_at: string | null;
};

type AvailabilityRow = {
  id?: string | number | null;
  sp_id?: string | number | null;
  date?: string | null;
  availability_date?: string | null;
  start_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  availability_status?: string | null;
  available?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type AssignmentStatus =
  | "invited"
  | "contacted"
  | "confirmed"
  | "declined"
  | "backup"
  | "no_show";

type ContactMethod = "call" | "text" | "email";
type AssignmentFilterStatus = "all" | "invited" | "confirmed" | "declined";

type AvailabilityMatchStatus =
  | "available"
  | "partial"
  | "none"
  | "unknown";

type AvailabilityMatchDetails = {
  status: AvailabilityMatchStatus;
  matchedSessions: number;
  totalSessions: number;
  reason: string;
};

type CommandCenterData = {
  event: EventDetailRow | null;
  sessions: EventSessionRow[];
  sps: SPRow[];
  assignments: AssignmentRow[];
  availabilityRows: AvailabilityRow[];
  errorMessage: string;
  sessionErrorMessage: string;
  availabilityErrorMessage: string;
};

type EventEditorState = {
  name: string;
  status: string;
  visibility: string;
  location: string;
  notes: string;
  sp_needed: string;
};

const emptySpRow: SPRow = {
  id: "",
  first_name: null,
  last_name: null,
  full_name: null,
  working_email: null,
  email: null,
  phone: null,
  portrayal_age: null,
  race: null,
  sex: null,
  telehealth: null,
  pt_preferred: null,
  other_roles: null,
  speaks_spanish: null,
  notes: null,
  status: null,
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ee",
  borderRadius: "20px",
  padding: "16px",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
  marginBottom: "14px",
};

const statCard: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "14px",
  padding: "11px 12px",
  background: "#f8fbff",
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
};

const statValue: React.CSSProperties = {
  fontSize: "17px",
  fontWeight: 800,
  color: "#173b6c",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #173b6c",
  borderRadius: "12px",
  background: "#173b6c",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
  padding: "10px 14px",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#fff5f5",
  color: "#991b1b",
  border: "1px solid #fecaca",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "11px 12px",
  color: "#173b6c",
  fontWeight: 700,
};

const detailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  marginTop: "10px",
};

const compactSectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#173b6c",
  fontSize: "22px",
  lineHeight: 1.1,
};

const compactSectionHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontWeight: 700,
  fontSize: "13px",
};

const segmentedGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: "6px",
  padding: "4px",
  borderRadius: "999px",
  border: "1px solid #dbe4ee",
  background: "#f8fafc",
};

const assignmentStatuses: AssignmentStatus[] = [
  "invited",
  "contacted",
  "confirmed",
  "declined",
  "backup",
  "no_show",
];

const contactMethods: ContactMethod[] = ["call", "text", "email"];

const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  invited: "Invited",
  contacted: "Contacted",
  confirmed: "Confirmed",
  declined: "Declined",
  backup: "Backup",
  no_show: "No-show",
};

const assignmentStatusStyles: Record<AssignmentStatus, React.CSSProperties> = {
  invited: {
    background: "#dbeafe",
    color: "#1d4ed8",
    border: "1px solid #93c5fd",
  },
  contacted: {
    background: "#fef9c3",
    color: "#854d0e",
    border: "1px solid #fde68a",
  },
  confirmed: {
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #86efac",
  },
  declined: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  },
  backup: {
    background: "#fef9c3",
    color: "#854d0e",
    border: "1px solid #fde68a",
  },
  no_show: {
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #cbd5e1",
  },
};

const confirmationStyles = {
  confirmed: {
    background: "#173b6c",
    color: "#ffffff",
    border: "1px solid #173b6c",
  },
  pending: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
  },
} satisfies Record<"confirmed" | "pending", React.CSSProperties>;

const skillsWorkshopBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "6px 10px",
  background: "#ecfeff",
  border: "1px solid #99f6e4",
  color: "#0f766e",
  fontWeight: 900,
  fontSize: "12px",
};

const availabilityMatchLabels: Record<AvailabilityMatchStatus, string> = {
  available: "BEST MATCH",
  partial: "USABLE",
  none: "DO NOT USE",
  unknown: "UNKNOWN",
};

const availabilityMatchStyles: Record<AvailabilityMatchStatus, React.CSSProperties> = {
  available: {
    background: "#ecfdf3",
    color: "#166534",
    border: "1px solid #86efac",
  },
  partial: {
    background: "#fef9c3",
    color: "#854d0e",
    border: "1px solid #fde68a",
  },
  none: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
  },
  unknown: {
    background: "#f1f5f9",
    color: "#475569",
    border: "1px solid #cbd5e1",
  },
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "10px 12px",
  color: "#173b6c",
  fontWeight: 700,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
  minHeight: "72px",
  resize: "vertical",
  boxSizing: "border-box",
  fontWeight: 600,
  lineHeight: 1.5,
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getFullName(sp: SPRow) {
  const explicit = asText(sp.full_name);
  if (explicit) return explicit;

  const joined = [sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" ");
  return joined || "Unnamed SP";
}

function getEmail(sp: SPRow) {
  return asText(sp.working_email) || asText(sp.email);
}

function getEmailSource(sp: SPRow) {
  if (asText(sp.working_email)) return "sps.working_email";
  if (asText(sp.email)) return "sps.email";
  return "";
}

function sortSPs(a: SPRow, b: SPRow) {
  return getFullName(a).localeCompare(getFullName(b));
}

function getCandidateSearchText(sp: SPRow) {
  return [
    getFullName(sp),
    getEmail(sp),
    sp.phone,
    sp.notes,
    sp.telehealth,
    sp.pt_preferred,
    sp.other_roles,
  ]
    .map(asText)
    .join(" ")
    .toLowerCase();
}

function isActiveSp(sp: SPRow) {
  const status = asText(sp.status).toLowerCase();
  return !status || status === "active";
}

function speaksSpanish(sp: SPRow) {
  const value = sp.speaks_spanish;
  return value === true || ["yes", "true", "y"].includes(asText(value).toLowerCase());
}

function hasTelehealth(sp: SPRow) {
  return Boolean(asText(sp.telehealth));
}

function hasPtPreferred(sp: SPRow) {
  const value = asText(sp.pt_preferred).toLowerCase();
  return Boolean(value) && !["no", "n", "false"].includes(value);
}

function getAssignmentStatus(assignment: AssignmentRow): AssignmentStatus {
  const rawStatus = asText(assignment.status) as AssignmentStatus;
  if (assignmentStatuses.includes(rawStatus)) return rawStatus;
  return assignment.confirmed === true ? "confirmed" : "invited";
}

function isAssignmentConfirmed(assignment: AssignmentRow) {
  return assignment.confirmed === true || getAssignmentStatus(assignment) === "confirmed";
}

function getCommandCenterAssignmentLabel(assignment: AssignmentRow) {
  const status = getAssignmentStatus(assignment);
  if (status === "confirmed") return "Confirmed";
  if (status === "declined" || status === "no_show") return "Declined";
  if (status === "backup") return "Tentative";
  return "Assigned";
}

function getCommandCenterAssignmentTone(assignment: AssignmentRow): "confirmed" | "pending" {
  return isAssignmentConfirmed(assignment) ? "confirmed" : "pending";
}

function getEventTypeButtonStyle(type: EventDisplayType, activeType: EventDisplayType): React.CSSProperties {
  const active = type === activeType;
  const palettes: Record<EventDisplayType, { background: string; border: string; color: string }> = {
    skills: {
      background: "#ecfeff",
      border: "#99f6e4",
      color: "#0f766e",
    },
    sp: {
      background: "#eff6ff",
      border: "#93c5fd",
      color: "#1d4ed8",
    },
    hifi: {
      background: "#f5f3ff",
      border: "#c4b5fd",
      color: "#6d28d9",
    },
  };

  const palette = palettes[type];

  return {
    borderRadius: "999px",
    padding: "7px 12px",
    fontWeight: 900,
    fontSize: "12px",
    border: `1px solid ${active ? palette.border : "#e2e8f0"}`,
    background: active ? palette.background : "#ffffff",
    color: active ? palette.color : "#64748b",
    minWidth: "64px",
    textAlign: "center",
  };
}

function getContactMethod(assignment: AssignmentRow) {
  const rawMethod = asText(assignment.contact_method) as ContactMethod;
  return contactMethods.includes(rawMethod) ? rawMethod : "";
}

function getContactMethodLabel(assignment: AssignmentRow) {
  const raw = getContactMethod(assignment);
  return raw || "Not set";
}

function getAssignmentStatusRank(status: AssignmentStatus) {
  if (status === "confirmed") return 0;
  if (status === "contacted") return 1;
  if (status === "invited") return 2;
  if (status === "backup") return 3;
  if (status === "declined") return 4;
  return 5;
}

function getAvailabilitySpId(row: AvailabilityRow) {
  return asText(row.sp_id);
}

function getAvailabilityDate(row: AvailabilityRow) {
  return (
    asText(row.availability_date) ||
    asText(row.date) ||
    asText(row.start_date) ||
    "Date TBD"
  );
}

function normalizeDateValue(value?: string | null, fallbackYear?: number | null) {
  return normalizeLooseDateToIso(value, fallbackYear) || "";
}

function getAvailabilityStatus(row: AvailabilityRow) {
  if (typeof row.available === "boolean") {
    return row.available ? "Available" : "Unavailable";
  }

  return (
    asText(row.availability_status) ||
    asText(row.status) ||
    "Availability noted"
  );
}

function getAvailabilityState(row: AvailabilityRow) {
  if (typeof row.available === "boolean") {
    return row.available ? "available" : "unavailable";
  }
  const status = asText(row.availability_status || row.status).toLowerCase();
  if (!status) return "unknown";
  if (
    ["unavailable", "no", "false", "busy", "blocked"].includes(status) ||
    status.includes("unavailable")
  ) {
    return "unavailable";
  }
  if (["available", "yes", "true", "open"].includes(status)) return "available";
  if (status.includes("available") && !status.includes("unavailable")) return "available";
  return "unknown";
}

function getAvailabilityTime(row: AvailabilityRow) {
  const start = asText(row.start_time);
  const end = asText(row.end_time);
  if (start && end) return `${start}-${end}`;
  return start || end || "";
}

function getAvailabilityForSp(spId: string, availabilityRows: AvailabilityRow[]) {
  return availabilityRows
    .filter((row) => getAvailabilitySpId(row) === spId)
    .sort((a, b) => getAvailabilityDate(a).localeCompare(getAvailabilityDate(b)));
}

function formatAvailabilityRows(rows: AvailabilityRow[]) {
  if (!rows.length) return "No availability rows found.";

  return rows
    .slice(0, 3)
    .map((row) => {
      const time = getAvailabilityTime(row);
      const notes = asText(row.notes);
      return [
        getAvailabilityDate(row),
        getAvailabilityStatus(row),
        time,
        notes,
      ]
        .filter(Boolean)
        .join(" · ");
    })
    .join("\n");
}

function parseTimeToMinutes(value?: string | null) {
  const raw = asText(value).toLowerCase();
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, "");
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridiem = match[3];

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function sessionMatchesAvailability(
  session: EventSessionRow,
  row: AvailabilityRow,
  fallbackYear?: number | null
) {
  const sessionDate = normalizeDateValue(session.session_date, fallbackYear);
  const availabilityDate = normalizeDateValue(getAvailabilityDate(row));
  if (!sessionDate || !availabilityDate || sessionDate !== availabilityDate) return false;

  const sessionStart = parseTimeToMinutes(session.start_time);
  const sessionEnd = parseTimeToMinutes(session.end_time);
  const availabilityStart = parseTimeToMinutes(asText(row.start_time));
  const availabilityEnd = parseTimeToMinutes(asText(row.end_time));

  if (
    sessionStart === null ||
    sessionEnd === null ||
    availabilityStart === null ||
    availabilityEnd === null
  ) {
    return true;
  }

  return availabilityStart < sessionEnd && availabilityEnd > sessionStart;
}

function getAvailabilityMatchDetails(
  eventSessions: EventSessionRow[],
  rows: AvailabilityRow[],
  fallbackYear?: number | null
): AvailabilityMatchDetails {
  if (!eventSessions.length || !rows.length) {
    return {
      status: "unknown",
      matchedSessions: 0,
      totalSessions: eventSessions.length,
      reason: "No structured availability match data",
    };
  }

  let matchedSessions = 0;
  let sawRelevantAvailability = false;
  let sawUnavailableConflict = false;

  eventSessions.forEach((session) => {
    const relevantRows = rows.filter((row) => sessionMatchesAvailability(session, row, fallbackYear));
    if (!relevantRows.length) return;

    sawRelevantAvailability = true;
    if (relevantRows.some((row) => getAvailabilityState(row) === "unavailable")) {
      sawUnavailableConflict = true;
    }
    const hasAvailableMatch = relevantRows.some(
      (row) => getAvailabilityState(row) === "available"
    );
    if (hasAvailableMatch) matchedSessions += 1;
  });

  if (matchedSessions === eventSessions.length) {
    return {
      status: "available",
      matchedSessions,
      totalSessions: eventSessions.length,
      reason: "Available for all sessions",
    };
  }

  if (matchedSessions > 0) {
    return {
      status: "partial",
      matchedSessions,
      totalSessions: eventSessions.length,
      reason: `Available for ${matchedSessions} of ${eventSessions.length} sessions`,
    };
  }

  if (sawRelevantAvailability || sawUnavailableConflict) {
    return {
      status: "none",
      matchedSessions,
      totalSessions: eventSessions.length,
      reason: "Conflict with session time",
    };
  }

  return {
    status: "unknown",
    matchedSessions,
    totalSessions: eventSessions.length,
    reason: "No matching availability rows",
  };
}

function getAvailabilityMatchRank(status: AvailabilityMatchStatus) {
  if (status === "available") return 0;
  if (status === "partial") return 1;
  if (status === "unknown") return 2;
  return 3;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Not contacted yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not contacted yet";
  return parsed.toLocaleString();
}

function formatSessionDate(value?: string | null, fallbackYear?: number | null) {
  return formatHumanDate(value, fallbackYear);
}

function formatDisplayTime(value?: string | null) {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return asText(value) || "Time TBD";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const normalizedHours = hours % 12 || 12;
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${normalizedHours}:${String(mins).padStart(2, "0")} ${suffix}`;
}

function formatEventDateText(value?: string | null, fallbackYear?: number | null) {
  return formatHumanDate(value, fallbackYear);
}

function formatSessionTime(session: EventSessionRow) {
  if (session.start_time && session.end_time) {
    return `${formatDisplayTime(session.start_time)} - ${formatDisplayTime(session.end_time)}`;
  }

  return formatDisplayTime(session.start_time || session.end_time);
}

function formatSessionLocation(session: EventSessionRow, eventLocation?: string | null) {
  return session.room || session.location || eventLocation || "Location TBD";
}

function formatSessionLabel(
  session: EventSessionRow,
  eventLocation?: string | null,
  fallbackYear?: number | null
) {
  return [
    formatSessionDate(session.session_date, fallbackYear),
    formatSessionTime(session),
    formatSessionLocation(session, eventLocation),
  ].join(" · ");
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildMailtoHref(args: { bcc: string[]; subject: string; body: string }) {
  const params = new URLSearchParams();
  if (args.bcc.length) params.set("bcc", args.bcc.join(","));
  params.set("subject", args.subject);
  params.set("body", args.body);
  return `mailto:?${params.toString()}`;
}

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function fetchCommandCenterData(eventId: string): Promise<CommandCenterData> {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        event: null,
        sessions: [],
        sps: [],
        assignments: [],
        availabilityRows: [],
        errorMessage: body?.error || `Could not load event (${response.status}).`,
        sessionErrorMessage: "",
        availabilityErrorMessage: "",
      };
    }

    return {
      event: body?.event || null,
      sessions: Array.isArray(body?.sessions) ? body.sessions : [],
      sps: Array.isArray(body?.sps) ? [...body.sps].sort(sortSPs) : [],
      assignments: Array.isArray(body?.assignments) ? body.assignments : [],
      availabilityRows: Array.isArray(body?.availabilityRows) ? body.availabilityRows : [],
      errorMessage: body?.errorMessage || "",
      sessionErrorMessage: body?.sessionErrorMessage || "",
      availabilityErrorMessage: body?.availabilityErrorMessage || "",
    };
  } catch (error) {
    return {
      event: null,
      sessions: [],
      sps: [],
      assignments: [],
      availabilityRows: [],
      errorMessage: error instanceof Error ? error.message : "Could not load event.",
      sessionErrorMessage: "",
      availabilityErrorMessage: "",
    };
  }
}

function getRouteId(params: ReturnType<typeof useParams>) {
  const raw = params?.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

export default function EventDetailPage() {
  const params = useParams();
  const id = getRouteId(params);

  const [event, setEvent] = useState<EventDetailRow | null>(null);
  const [eventEditor, setEventEditor] = useState<EventEditorState>({
    name: "",
    status: "",
    visibility: "",
    location: "",
    notes: "",
    sp_needed: "",
  });
  const [sessions, setSessions] = useState<EventSessionRow[]>([]);
  const [sps, setSps] = useState<SPRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([]);
  const [selectedSpId, setSelectedSpId] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [spanishOnly, setSpanishOnly] = useState(false);
  const [telehealthOnly, setTelehealthOnly] = useState(false);
  const [ptPreferredOnly, setPtPreferredOnly] = useState(false);
  const [availableForEventOnly, setAvailableForEventOnly] = useState(false);
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilterStatus>("all");
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [assigningSpId, setAssigningSpId] = useState("");
  const [assignmentSuccessMessage, setAssignmentSuccessMessage] = useState("");
  const [recentAssignedSpId, setRecentAssignedSpId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [eventSaveMessage, setEventSaveMessage] = useState("");
  const [eventSaveError, setEventSaveError] = useState("");
  const [sessionErrorMessage, setSessionErrorMessage] = useState("");
  const [availabilityErrorMessage, setAvailabilityErrorMessage] = useState("");

  const spsById = useMemo(() => {
    const next = new Map<string, SPRow>();
    sps.forEach((sp) => next.set(String(sp.id), sp));
    return next;
  }, [sps]);

  const assignedSpIds = useMemo(
    () => new Set(assignments.map((assignment) => asText(assignment.sp_id)).filter(Boolean)),
    [assignments]
  );

  const sortedAssignments = useMemo(
    () =>
      [...assignments].sort((a, b) => {
        const aStatus = getAssignmentStatus(a);
        const bStatus = getAssignmentStatus(b);
        const rankDiff = getAssignmentStatusRank(aStatus) - getAssignmentStatusRank(bStatus);
        if (rankDiff !== 0) return rankDiff;

        const aSp = a.sp_id ? spsById.get(a.sp_id) : undefined;
        const bSp = b.sp_id ? spsById.get(b.sp_id) : undefined;
        return getFullName(aSp || emptySpRow).localeCompare(getFullName(bSp || emptySpRow));
      }),
    [assignments, spsById]
  );

  const filteredAssignments = useMemo(() => {
    if (assignmentFilter === "all") return sortedAssignments;
    return sortedAssignments.filter((assignment) => getAssignmentStatus(assignment) === assignmentFilter);
  }, [assignmentFilter, sortedAssignments]);

  const assignmentsBySpId = useMemo(() => {
    const next = new Map<string, AssignmentRow>();
    assignments.forEach((assignment) => {
      const spId = asText(assignment.sp_id);
      if (spId) next.set(spId, assignment);
    });
    return next;
  }, [assignments]);

  const availabilityBySpId = useMemo(() => {
    const next = new Map<string, AvailabilityRow[]>();

    sps.forEach((sp) => {
      next.set(sp.id, getAvailabilityForSp(sp.id, availabilityRows));
    });

    return next;
  }, [availabilityRows, sps]);

  const availabilityMatchBySpId = useMemo(() => {
    const next = new Map<string, AvailabilityMatchDetails>();
    const fallbackYear = getImportedYearHint(event?.notes);

    sps.forEach((sp) => {
      next.set(
        sp.id,
        getAvailabilityMatchDetails(sessions, availabilityBySpId.get(sp.id) || [], fallbackYear)
      );
    });

    return next;
  }, [availabilityBySpId, event?.notes, sessions, sps]);

  const filteredCandidateSps = useMemo(
    () =>
      sps
        .filter((sp) => {
          const query = candidateQuery.trim().toLowerCase();
          const availabilityMatch = availabilityMatchBySpId.get(sp.id)?.status || "unknown";
          if (query && !getCandidateSearchText(sp).includes(query)) return false;
          if (activeOnly && !isActiveSp(sp)) return false;
          if (spanishOnly && !speaksSpanish(sp)) return false;
          if (telehealthOnly && !hasTelehealth(sp)) return false;
          if (ptPreferredOnly && !hasPtPreferred(sp)) return false;
          if (availableForEventOnly && !["available", "partial"].includes(availabilityMatch)) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aMatch = availabilityMatchBySpId.get(a.id)?.status || "unknown";
          const bMatch = availabilityMatchBySpId.get(b.id)?.status || "unknown";
          const rankDiff = getAvailabilityMatchRank(aMatch) - getAvailabilityMatchRank(bMatch);
          if (rankDiff !== 0) return rankDiff;
          return sortSPs(a, b);
        }),
    [
      activeOnly,
      availabilityMatchBySpId,
      availableForEventOnly,
      candidateQuery,
      ptPreferredOnly,
      spanishOnly,
      sps,
      telehealthOnly,
    ]
  );

  const availableSps = useMemo(
    () => filteredCandidateSps.filter((sp) => !assignedSpIds.has(String(sp.id))),
    [assignedSpIds, filteredCandidateSps]
  );

  const recommendedSps = useMemo(
    () =>
      availableSps
        .filter((sp) => {
          const matchStatus = availabilityMatchBySpId.get(sp.id)?.status || "unknown";
          if (matchStatus === "available") return isActiveSp(sp);
          return matchStatus === "partial";
        })
        .slice(0, 5),
    [availabilityMatchBySpId, availableSps]
  );

  const confirmedCount = assignments.filter(
    (assignment) => getAssignmentStatus(assignment) === "confirmed"
  ).length;
  const assignmentCount = assignments.length;
  const unconfirmedCount = Math.max(assignments.length - confirmedCount, 0);
  const needed = Number(event?.sp_needed || 0);
  const shortage = Math.max(needed - confirmedCount, 0);
  const eventMeta = classifyEventPresentation({
    name: event?.name,
    status: event?.status,
    notes: event?.notes,
    location: event?.location,
    visibility: event?.visibility,
    spNeeded: needed,
    assignmentCount,
    confirmedCount,
    isWorkshop: isSkillsWorkshopEvent(needed, assignmentCount, confirmedCount),
  });
  const badgeAppearance = getEventBadgeAppearance(eventMeta.primaryBadgeKind);
  const isWorkshop = eventMeta.isSkillsWorkshop;
  const coverageStatus =
    isWorkshop
      ? {
          message: "Skills Workshop",
          background: "#ecfeff",
          border: "1px solid #99f6e4",
          color: "#0f766e",
        }
      : needed <= 0
      ? {
          message: "No SP target set",
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          color: "#475569",
        }
      : shortage === 0
        ? {
            message: "Coverage complete",
            background: "#ecfdf3",
            border: "1px solid #86efac",
            color: "#166534",
          }
        : {
            message: `${shortage} SP${shortage === 1 ? "" : "s"} still needed`,
            background: shortage <= 2 ? "#fff7ed" : "#fff5f5",
            border: shortage <= 2 ? "1px solid #fed7aa" : "1px solid #fecaca",
            color: shortage <= 2 ? "#9a3412" : "#991b1b",
          };
  const coveragePercent =
    needed > 0 ? Math.min(100, Math.round((confirmedCount / needed) * 100)) : 0;
  const importedYearHint = getImportedYearHint(event?.notes);
  const structuredDateLabel = sessions.length
    ? sessions
        .map((session) => formatSessionLabel(session, event?.location, importedYearHint))
        .join("; ")
    : "";
  const eventDateLabel = structuredDateLabel || formatEventDateText(event?.date_text, importedYearHint);
  const uniqueSessionDates = useMemo(
    () =>
      Array.from(
        new Set(
          sessions
            .map((session) => formatSessionDate(session.session_date, importedYearHint))
            .filter(Boolean)
        )
      ),
    [importedYearHint, sessions]
  );
  const sessionSummaryLabel = useMemo(() => {
    if (!sessions.length) return formatEventDateText(event?.date_text, importedYearHint);
    if (sessions.length === 1) return formatSessionDate(sessions[0]?.session_date, importedYearHint);
    if (uniqueSessionDates.length === 1) {
      return `${sessions.length} sessions on ${uniqueSessionDates[0]}`;
    }
    return `${sessions.length} sessions across ${uniqueSessionDates.join(", ")}`;
  }, [event?.date_text, importedYearHint, sessions, uniqueSessionDates]);
  const summaryTimeLabel = useMemo(() => {
    if (!sessions.length) return "Time TBD";
    if (sessions.length === 1) return formatSessionTime(sessions[0]);
    const firstStart = sessions[0]?.start_time;
    const lastEnd = sessions[sessions.length - 1]?.end_time;
    if (firstStart && lastEnd) {
      return `${formatDisplayTime(firstStart)} - ${formatDisplayTime(lastEnd)}`;
    }
    return "See sessions below";
  }, [sessions]);
  const assignedEmailSources = useMemo(() => {
    return assignments
      .map((assignment) => {
        const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
        if (!sp) return null;

        const email = getEmail(sp);
        if (!email) return null;

        return {
          assignmentId: assignment.id,
          spName: getFullName(sp),
          email,
          source: getEmailSource(sp),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [assignments, spsById]);

  const bccEmails = useMemo(
    () => Array.from(new Set(assignedEmailSources.map((item) => item.email))),
    [assignedEmailSources]
  );
  const assignedEmailRecipients = useMemo(
    () =>
      sortedAssignments
        .map((assignment) => {
          const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
          if (!sp) return null;

          const email = getEmail(sp);
          if (!email) return null;

          return {
            assignment,
            sp,
            email,
          };
        })
        .filter(
          (
            item
          ): item is {
            assignment: AssignmentRow;
            sp: SPRow;
            email: string;
          } => Boolean(item)
        ),
    [sortedAssignments, spsById]
  );
  const assignedBccEmails = useMemo(
    () => Array.from(new Set(assignedEmailRecipients.map((item) => item.email))),
    [assignedEmailRecipients]
  );
  const assignedCount = assignmentCount;
  const shortageCount = isWorkshop ? 0 : shortage;
  const eventType = eventMeta.eventType;
  const staffingRelevant = eventType !== "hifi" || needed > 0 || assignmentCount > 0;
  const emailSubject = `[CFSP] ${event?.name || "CFSP Event"} - ${eventDateLabel}`;
  const emailBody = [
    "Hello,",
    "",
    "We are reaching out regarding the following CFSP event:",
    "",
    `Event: ${event?.name || "TBD"}`,
    `Date: ${eventDateLabel || "TBD"}`,
    `Time: ${summaryTimeLabel || "TBD"}`,
    `Location: ${event?.location || "TBD"}`,
    "",
    "Please reply to confirm your availability and assignment status for this event.",
    "If you have any scheduling conflicts or questions, include them in your reply.",
    "",
    "Thank you,",
    "CFSP Simulation Operations",
  ].join("\n");
  const mailtoHref = buildMailtoHref({
    bcc: assignedBccEmails.length ? assignedBccEmails : bccEmails,
    subject: emailSubject,
    body: emailBody,
  });

  async function refreshData() {
    if (!id) return;

    const result = await fetchCommandCenterData(id);
    setEvent(result.event);
    setEventEditor({
      name: result.event?.name || "",
      status: result.event?.status || "",
      visibility: result.event?.visibility || "",
      location: result.event?.location || "",
      notes: result.event?.notes || "",
      sp_needed:
        result.event?.sp_needed === null || result.event?.sp_needed === undefined
          ? ""
          : String(result.event.sp_needed),
    });
    setSessions(result.sessions);
    setSps(result.sps);
    setAssignments(result.assignments);
    setAvailabilityRows(result.availabilityRows);
    setErrorMessage(result.errorMessage);
    setSessionErrorMessage(result.sessionErrorMessage);
    setAvailabilityErrorMessage(result.availabilityErrorMessage);
    setSelectedSpId("");
  }

  async function saveAssignmentRequest(method: "POST" | "PATCH" | "DELETE", body: object) {
    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }
  }

  async function assignMultipleSpIds(spIds: string[], successLabel: string) {
    if (!id || spIds.length === 0) return;

    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      for (const spId of spIds) {
        await saveAssignmentRequest("POST", { sp_id: spId });
      }

      await refreshData();
      setAssignmentSuccessMessage(successLabel);
      window.setTimeout(() => {
        setAssignmentSuccessMessage("");
      }, 2200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEventDetails() {
    if (!id) return;

    const nextSpNeeded = Number(eventEditor.sp_needed);
    const spNeeded =
      eventEditor.sp_needed.trim() === "" || Number.isNaN(nextSpNeeded)
        ? 0
        : Math.max(0, Math.round(nextSpNeeded));

    setSaving(true);
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_updates: {
            name: eventEditor.name,
            status: eventEditor.status,
            visibility: eventEditor.visibility,
            location: eventEditor.location,
            notes: eventEditor.notes,
            sp_needed: spNeeded,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setEventSaveMessage("Event details saved.");
      await refreshData();
    } catch (error) {
      setEventSaveError(
        error instanceof Error ? error.message : "Could not save event details."
      );
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  useEffect(() => {
    let cancelled = false;

    if (!id) {
      return;
    }

    const refresh = () => {
      void fetchCommandCenterData(id).then((result) => {
        if (cancelled) return;

        setEvent(result.event);
        setEventEditor({
          name: result.event?.name || "",
          status: result.event?.status || "",
          visibility: result.event?.visibility || "",
          location: result.event?.location || "",
          notes: result.event?.notes || "",
          sp_needed:
            result.event?.sp_needed === null || result.event?.sp_needed === undefined
              ? ""
              : String(result.event.sp_needed),
        });
        setSessions(result.sessions);
        setSps(result.sps);
        setAssignments(result.assignments);
        setAvailabilityRows(result.availabilityRows);
        setErrorMessage(result.errorMessage);
        setSessionErrorMessage(result.sessionErrorMessage);
        setAvailabilityErrorMessage(result.availabilityErrorMessage);
        setLoading(false);
      });
    };

    refresh();

    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [id]);

  async function handleAddAssignment(spId = selectedSpId) {
    if (!id || !spId) return;

    setSaving(true);
    setAssigningSpId(spId);
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      await saveAssignmentRequest("POST", {
        sp_id: spId,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save assignment.");
      setAssigningSpId("");
      setSaving(false);
      return;
    }

    await refreshData();
    setRecentAssignedSpId(spId);
    setAssignmentSuccessMessage("SP assigned");
    window.setTimeout(() => {
      setAssignmentSuccessMessage("");
    }, 2000);
    window.setTimeout(() => {
      setRecentAssignedSpId("");
    }, 2400);
    setAssigningSpId("");
    setSaving(false);
  }

  async function handleStatusChange(assignment: AssignmentRow, status: AssignmentStatus) {
    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      await saveAssignmentRequest("PATCH", {
        assignment_id: assignment.id,
        updates: {
          status,
          confirmed: status === "confirmed",
          last_contacted_at:
            status === "contacted" ? new Date().toISOString() : assignment.last_contacted_at,
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update assignment.");
      setSaving(false);
      return;
    }

    await refreshData();
    setEventSaveMessage(`Status updated to ${assignmentStatusLabels[status]}.`);
    setSaving(false);
  }

  async function handleAssignmentDetailsChange(
    assignment: AssignmentRow,
    updates: Partial<Pick<AssignmentRow, "notes" | "last_contacted_at" | "contact_method">>
  ) {
    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      await saveAssignmentRequest("PATCH", {
        assignment_id: assignment.id,
        updates,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update assignment details.");
      setSaving(false);
      return;
    }

    await refreshData();
    setEventSaveMessage("Assignment details saved.");
    setSaving(false);
  }

  async function handleRemoveAssignment(assignment: AssignmentRow) {
    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      await saveAssignmentRequest("DELETE", {
        assignment_id: assignment.id,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove assignment.");
      setSaving(false);
      return;
    }

    await refreshData();
    setEventSaveMessage("Assignment removed.");
    setSaving(false);
  }

  async function handleOpenAvailabilityRequest() {
    if (!assignedBccEmails.length) {
      setEventSaveError("No assigned SP emails are available for an email draft.");
      return;
    }

    setEventSaveError("");
    window.location.href = mailtoHref;
    setEventSaveMessage(
      `Email draft opened for ${assignedBccEmails.length} assigned SP${assignedBccEmails.length === 1 ? "" : "s"}.`
    );
  }

  async function handleFillRemainingSpots() {
    const eligibleIds = availableSps
      .filter((sp) => {
        const status = availabilityMatchBySpId.get(sp.id)?.status || "unknown";
        return status === "available" || status === "partial";
      })
      .slice(0, Math.max(shortage, 0))
      .map((sp) => sp.id);

    await assignMultipleSpIds(
      eligibleIds,
      `Added ${eligibleIds.length} SP${eligibleIds.length === 1 ? "" : "s"}.`
    );
  }

  async function handleAddTopMatches() {
    const topIds = recommendedSps.slice(0, 3).map((sp) => sp.id);

    await assignMultipleSpIds(
      topIds,
      `Added ${topIds.length} top match${topIds.length === 1 ? "" : "es"}.`
    );
  }

  if (loading) {
    return (
      <SiteShell title="Event Command Center" subtitle="Loading event details from Supabase.">
        <div style={cardStyle}>Loading...</div>
      </SiteShell>
    );
  }

  if (!id) {
    return (
      <SiteShell title="Event Command Center" subtitle="Event details were not found.">
        <div style={cardStyle}>
          <p style={{ color: "#991b1b", fontWeight: 700 }}>Missing event id.</p>
          <Link href="/events" style={{ color: "#1d4ed8", fontWeight: 700 }}>
            Back to Events
          </Link>
        </div>
      </SiteShell>
    );
  }

  if (!event) {
    return (
      <SiteShell title="Event Command Center" subtitle="Event details were not found.">
        <div style={cardStyle}>
          {errorMessage ? <p style={{ color: "#991b1b", fontWeight: 700 }}>{errorMessage}</p> : null}
          <p>Event not found.</p>
          <Link href="/events" style={{ color: "#1d4ed8", fontWeight: 700 }}>
            Back to Events
          </Link>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell
      title="Event Command Center"
      subtitle="Manage real Supabase event coverage and SP assignments."
    >
      {errorMessage ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fecaca",
            background: "#fff5f5",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          Supabase error: {errorMessage}
        </div>
      ) : null}

      {sessionErrorMessage ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fed7aa",
            background: "#fff7ed",
            color: "#9a3412",
            fontWeight: 700,
          }}
        >
          Session warning: {sessionErrorMessage}. Falling back to event date text.
        </div>
      ) : null}

      {availabilityErrorMessage ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fed7aa",
            background: "#fff7ed",
            color: "#9a3412",
            fontWeight: 700,
          }}
        >
          Availability warning: {availabilityErrorMessage}
        </div>
      ) : null}

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <Link
              href="/events"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                color: "#1d4ed8",
                fontWeight: 900,
                textDecoration: "none",
              }}
            >
              <span aria-hidden="true">←</span>
              <span>Back to Events</span>
            </Link>

            <div style={segmentedGroupStyle} aria-label="Event type">
              <span style={getEventTypeButtonStyle("skills", eventType)}>Skills</span>
              <span style={getEventTypeButtonStyle("sp", eventType)}>SP</span>
              <span style={getEventTypeButtonStyle("hifi", eventType)}>HiFi</span>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <h1 style={{ margin: 0, fontSize: "28px", color: "#173b6c", lineHeight: 1.05 }}>
                {event.name || "Untitled Event"}
              </h1>
              <span
                style={{
                  ...assignmentStatusStyles[
                    (event.status || "").toLowerCase() === "confirmed" ? "confirmed" : "invited"
                  ],
                  borderRadius: "999px",
                  padding: "6px 10px",
                  fontWeight: 900,
                  fontSize: "12px",
                }}
              >
                {event.status || "No status"}
              </span>
              <span
                style={{
                  borderRadius: "999px",
                  padding: "6px 10px",
                  background: coverageStatus.background,
                  border: coverageStatus.border,
                  color: coverageStatus.color,
                  fontWeight: 900,
                  fontSize: "12px",
                }}
              >
                {coverageStatus.message}
              </span>
              <span
                style={{
                  ...skillsWorkshopBadgeStyle,
                  background: badgeAppearance.background,
                  border: `1px solid ${badgeAppearance.border}`,
                  color: badgeAppearance.color,
                }}
              >
                {eventMeta.primaryBadgeLabel}
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "10px",
            border: "1px solid #bfdbfe",
            borderRadius: "16px",
            padding: "14px",
            background: "#f8fbff",
          }}
        >
          <div style={{ ...statLabel, color: "#173b6c" }}>Event Summary</div>
          <div style={{ ...detailGridStyle, marginTop: "8px", gap: "8px" }}>
            <div style={{ ...statCard, background: "#ffffff" }}>
              <div style={statLabel}>Event Name</div>
              <div style={statValue}>{event.name || "Untitled Event"}</div>
            </div>
            <div style={{ ...statCard, background: "#ffffff" }}>
              <div style={statLabel}>Status</div>
              <div style={statValue}>{event.status || "No status"}</div>
            </div>
            <div style={{ ...statCard, background: "#ffffff" }}>
              <div style={statLabel}>Location</div>
              <div style={statValue}>{event.location || "Location TBD"}</div>
            </div>
            <div style={{ ...statCard, background: "#ffffff" }}>
              <div style={statLabel}>SP Needed</div>
              <div style={statValue}>{needed}</div>
            </div>
            <div style={{ ...statCard, background: "#ffffff" }}>
              <div style={statLabel}>Assigned</div>
              <div style={{ ...statValue, color: "#173b6c" }}>{assignedCount}</div>
            </div>
            <div style={{ ...statCard, background: "#ffffff" }}>
              <div style={statLabel}>{isWorkshop ? "Workshop" : "Shortage"}</div>
              <div style={{ ...statValue, color: isWorkshop ? "#0f766e" : shortage > 0 ? "#9a3412" : "#166534" }}>
                {isWorkshop ? "Skills Workshop" : shortageCount}
              </div>
            </div>
            <div style={{ ...statCard, background: "#ffffff" }}>
              <div style={statLabel}>Date</div>
              <div style={statValue}>{sessionSummaryLabel}</div>
            </div>
            <div style={{ ...statCard, background: "#ffffff" }}>
              <div style={statLabel}>Time</div>
              <div style={statValue}>{summaryTimeLabel}</div>
            </div>
          </div>

          {sessions.length ? (
            <div style={{ marginTop: "10px" }}>
              <div style={statLabel}>Sessions</div>
              <div style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                {sessions.map((session) => (
                  <div key={session.id} style={{ ...statCard, background: "#ffffff" }}>
                    <div style={{ color: "#173b6c", fontWeight: 900 }}>
                      {formatSessionDate(session.session_date, importedYearHint)}
                    </div>
                    <div style={{ marginTop: "4px", color: "#475569", lineHeight: 1.5, fontSize: "13px" }}>
                      {formatSessionTime(session)} · {formatSessionLocation(session, event.location)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: "10px", color: "#64748b", fontWeight: 700 }}>
              No structured sessions yet. Fallback date text: {formatEventDateText(event.date_text, importedYearHint)}
            </div>
          )}
        </div>
      </div>

      <EventPlanningTimeline
        eventDateLabel={eventDateLabel}
        summaryTimeLabel={summaryTimeLabel}
      />

      {eventSaveMessage ? (
        <div
          style={{
            ...cardStyle,
            borderRadius: "12px",
            border: "1px solid #bbf7d0",
            background: "#ecfdf3",
            color: "#166534",
            padding: "10px 12px",
            fontWeight: 800,
          }}
        >
          {eventSaveMessage}
        </div>
      ) : null}

      {eventSaveError ? (
        <div
          style={{
            ...cardStyle,
            borderRadius: "12px",
            border: "1px solid #fecaca",
            background: "#fff5f5",
            color: "#991b1b",
            padding: "10px 12px",
            fontWeight: 800,
          }}
        >
          {eventSaveError}
        </div>
      ) : null}

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h2 style={compactSectionTitleStyle}>Event Editor</h2>
            <p style={compactSectionHintStyle}>Update the core event record.</p>
          </div>

          <button
            type="button"
            onClick={() => void saveEventDetails()}
            disabled={saving}
            style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
          >
            Save Event Details
          </button>
        </div>

        <div
          style={{
            ...detailGridStyle,
            gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
            alignItems: "start",
            marginTop: "10px",
          }}
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ ...statCard, background: coverageStatus.background, border: coverageStatus.border }}>
              <div style={statLabel}>Coverage Status</div>
              <div style={{ ...statValue, color: coverageStatus.color }}>{coverageStatus.message}</div>
              <div style={{ marginTop: "2px", color: "#64748b", fontWeight: 700, fontSize: "12px" }}>
                {isWorkshop
                  ? "No SP staffing required for this event"
                  : needed > 0
                    ? `${coveragePercent}% confirmed coverage`
                    : "No SP target set"}
              </div>
            </div>

            <div style={{ ...detailGridStyle, marginTop: 0, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Name</span>
                <input
                  value={eventEditor.name}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, name: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Status</span>
                <input
                  value={eventEditor.status}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, status: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Visibility</span>
                <input
                  value={eventEditor.visibility}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, visibility: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>SPs Needed</span>
                <input
                  type="number"
                  min={0}
                  value={eventEditor.sp_needed}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, sp_needed: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                <span style={statLabel}>Location</span>
                <input
                  value={eventEditor.location}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, location: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>
            </div>
          </div>

          <details
            open
            style={{
              border: "1px solid #dbe4ee",
              borderRadius: "14px",
              padding: "12px",
              background: "#f8fbff",
            }}
          >
            <summary style={{ cursor: "pointer", color: "#173b6c", fontWeight: 800 }}>
              Notes
            </summary>
            <textarea
              value={eventEditor.notes}
              onChange={(event) =>
                setEventEditor((current) => ({ ...current, notes: event.target.value }))
              }
              disabled={saving}
              placeholder="Add operational notes, setup details, reporting instructions..."
              style={{ ...textareaStyle, marginTop: "10px" }}
            />
          </details>
        </div>
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h2 style={compactSectionTitleStyle}>Assigned SPs</h2>
            <p style={compactSectionHintStyle}>
              {staffingRelevant ? "Primary staffing view." : "HiFi event. Staffing is not currently driving this record."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {assignedBccEmails.length ? (
              <button
                type="button"
                onClick={() => void handleOpenAvailabilityRequest()}
                style={{
                  display: "inline-block",
                  background: "#16a34a",
                  color: "#fff",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  fontWeight: 800,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Send Email
              </button>
            ) : (
              <span
                style={{
                  display: "inline-block",
                  background: "#e5e7eb",
                  color: "#6b7280",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  fontWeight: 800,
                }}
              >
                No Assigned SP Emails
              </span>
            )}
            <div
              style={{
                display: "grid",
                gap: "8px",
                minWidth: "200px",
                border: "1px solid #dbe4ee",
                borderRadius: "16px",
                padding: "12px",
                background: "#f8fbff",
              }}
            >
              <div style={{ color: "#173b6c", fontWeight: 900, fontSize: "20px" }}>
                {needed} SPs needed / {confirmedCount} confirmed
              </div>
              <div style={{ color: "#9a3412", fontWeight: 800 }}>
                {unconfirmedCount} still need attention
              </div>
            </div>
          </div>
        </div>

        {!staffingRelevant ? (
          <div
            style={{
              ...statCard,
              marginTop: "10px",
              background: "#faf5ff",
              border: "1px solid #ddd6fe",
              color: "#5b21b6",
            }}
          >
            <div style={statLabel}>HiFi Operations</div>
            <div style={{ marginTop: "4px", fontWeight: 800 }}>
              This event is currently classified as HiFi. SP staffing stays available if needed, but no active SP coverage target is driving the workflow.
            </div>
          </div>
        ) : null}

        {showEmailDraft ? (
          <div style={{ ...statCard, marginTop: "12px", background: "#ffffff" }}>
            <div style={statLabel}>Email Draft Preview</div>
            <div style={{ marginTop: "8px", color: "#173b6c", lineHeight: 1.7 }}>
              <div><strong>Recipients (BCC):</strong> {assignedBccEmails.length ? assignedBccEmails.join(", ") : "No assigned SP emails found."}</div>
              <div style={{ marginTop: "8px" }}><strong>Subject:</strong> {emailSubject}</div>
              <div style={{ marginTop: "8px", whiteSpace: "pre-wrap" }}><strong>Body:</strong>{"\n"}{emailBody}</div>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
          {[
            { value: "all", label: `All (${sortedAssignments.length})` },
            {
              value: "invited",
              label: `Invited (${sortedAssignments.filter((item) => getAssignmentStatus(item) === "invited").length})`,
            },
            {
              value: "confirmed",
              label: `Confirmed (${sortedAssignments.filter((item) => getAssignmentStatus(item) === "confirmed").length})`,
            },
            {
              value: "declined",
              label: `Declined (${sortedAssignments.filter((item) => getAssignmentStatus(item) === "declined").length})`,
            },
          ].map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setAssignmentFilter(filter.value as AssignmentFilterStatus)}
              style={{
                ...buttonStyle,
                background: assignmentFilter === filter.value ? "#173b6c" : "#ffffff",
                color: assignmentFilter === filter.value ? "#ffffff" : "#173b6c",
                border: assignmentFilter === filter.value ? "1px solid #173b6c" : "1px solid #cbd5e1",
                padding: "8px 12px",
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {assignments.length === 0 ? (
          <p style={{ color: "#64748b", marginBottom: 0, marginTop: "14px" }}>
            No SPs assigned yet.
          </p>
        ) : filteredAssignments.length === 0 ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid #dbe4ee",
              borderRadius: "16px",
              padding: "16px",
              background: "#f8fafc",
              color: "#64748b",
              fontWeight: 700,
            }}
          >
            No assigned SPs match the current filter.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "12px",
              marginTop: "12px",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            }}
          >
            {filteredAssignments.map((assignment) => {
              const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
              const status = getAssignmentStatus(assignment);
              const confirmed = isAssignmentConfirmed(assignment);
              const commandLabel = getCommandCenterAssignmentLabel(assignment);
              const confirmationTone = getCommandCenterAssignmentTone(assignment);
              const email = sp ? getEmail(sp) : "";
              const contactMethod = getContactMethod(assignment);
              const availabilityForSp = assignment.sp_id
                ? availabilityBySpId.get(assignment.sp_id) || []
                : [];
              const isRecentlyAssigned = assignment.sp_id === recentAssignedSpId;

              return (
                <div
                  key={assignment.id}
                  style={{
                    border: confirmed ? "1px solid #173b6c" : confirmationStyles.pending.border,
                    borderRadius: "18px",
                    padding: "14px",
                    background: confirmed ? "#f8fbff" : "#fffdfa",
                    boxShadow: isRecentlyAssigned
                      ? "0 0 0 4px rgba(34, 197, 94, 0.18), 0 12px 28px rgba(15, 23, 42, 0.08)"
                      : "0 8px 24px rgba(15, 23, 42, 0.05)",
                    transform: isRecentlyAssigned ? "translateY(-2px)" : "translateY(0)",
                    transition: "box-shadow 180ms ease, transform 180ms ease",
                  }}
                >
                  <div style={{ display: "grid", gap: "12px" }}>
                    <div>
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <h3 style={{ margin: 0, color: "#173b6c", fontSize: "20px" }}>
                          {sp ? getFullName(sp) : "Unknown SP"}
                        </h3>
                        <span
                          style={{
                            ...confirmationStyles[confirmationTone],
                            borderRadius: "999px",
                            padding: "9px 14px",
                            fontWeight: 900,
                            fontSize: "14px",
                            letterSpacing: "0.01em",
                          }}
                        >
                          {commandLabel}
                        </span>
                        <span
                          style={{
                            borderRadius: "999px",
                            padding: "8px 12px",
                            background: confirmed ? "#173b6c" : "#fff7ed",
                            color: confirmed ? "#ffffff" : "#9a3412",
                            border: confirmed ? "1px solid #173b6c" : "1px solid #fed7aa",
                            fontWeight: 900,
                            fontSize: "12px",
                          }}
                        >
                          {confirmed ? "Confirmed" : "Needs Confirmation"}
                        </span>
                      </div>

                      <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700, lineHeight: 1.6 }}>
                        <div>{email || assignment.sp_id || "No SP id"}</div>
                        <div>{sp?.phone || "No phone on file"}</div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gap: "10px",
                        gridTemplateColumns: "1fr auto",
                        alignItems: "start",
                      }}
                    >
                      <div
                        style={{
                          border: confirmationStyles[confirmationTone].border,
                          borderRadius: "18px",
                          padding: "12px",
                          background: confirmationStyles[confirmationTone].background,
                          color: confirmationStyles[confirmationTone].color,
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase" }}>
                          Assignment State
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "18px", fontWeight: 900 }}>
                          {commandLabel}
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 800, opacity: 0.88 }}>
                          {confirmed ? "Confirmed coverage" : "Still needs confirmation"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleRemoveAssignment(assignment)}
                        disabled={saving}
                        style={{
                          ...dangerButtonStyle,
                          opacity: saving ? 0.65 : 1,
                          minWidth: "120px",
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    <div style={{ ...detailGridStyle, marginTop: 0 }}>
                      <div style={{ ...statCard, background: "#ffffff" }}>
                        <div style={statLabel}>Status</div>
                        <select
                          value={status}
                          onChange={(e) =>
                            handleStatusChange(assignment, e.target.value as AssignmentStatus)
                          }
                          disabled={saving}
                          style={{
                            ...selectStyle,
                            width: "100%",
                            maxWidth: "100%",
                            background: "#ffffff",
                            marginTop: "8px",
                          }}
                        >
                          {assignmentStatuses.map((option) => (
                            <option key={option} value={option}>
                              {assignmentStatusLabels[option]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ ...statCard, background: "#ffffff" }}>
                        <div style={statLabel}>Contact Method</div>
                        <div style={{ ...statValue, fontSize: "16px" }}>
                          {getContactMethodLabel(assignment)}
                        </div>
                        <div style={{ marginTop: "4px", color: "#64748b", fontWeight: 700, fontSize: "12px" }}>
                          {formatTimestamp(assignment.last_contacted_at)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid #dbe4ee",
                        borderRadius: "16px",
                        padding: "12px",
                        background: confirmed ? "#eff6ff" : "#f8fbff",
                      }}
                    >
                      <div style={statLabel}>Notes</div>
                      <div style={{ marginTop: "8px" }}>
                        <textarea
                          key={`${assignment.id}-${assignment.notes || ""}`}
                          defaultValue={assignment.notes || ""}
                          onBlur={(e) =>
                            handleAssignmentDetailsChange(assignment, {
                              notes: e.target.value.trim() || null,
                            })
                          }
                          placeholder="Add contact notes, constraints, follow-up details..."
                          disabled={saving}
                          style={{ ...textareaStyle, minHeight: "88px" }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        borderRadius: "16px",
                        padding: "12px",
                        background: "#ffffff",
                        border: "1px solid #dbe4ee",
                        color: "#334155",
                        lineHeight: 1.6,
                      }}
                    >
                      <div style={statLabel}>Availability Summary</div>
                      <div
                        style={{
                          marginTop: "6px",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {formatAvailabilityRows(availabilityForSp)}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(assignment, "confirmed")}
                        disabled={saving || status === "confirmed"}
                        style={{ ...buttonStyle, opacity: saving || status === "confirmed" ? 0.65 : 1 }}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(assignment, "contacted")}
                        disabled={saving || status === "contacted"}
                        style={{
                          ...buttonStyle,
                          background: "#ffffff",
                          color: "#854d0e",
                          border: "1px solid #fde68a",
                          opacity: saving || status === "contacted" ? 0.65 : 1,
                        }}
                      >
                        Mark Contacted
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(assignment, "declined")}
                        disabled={saving || status === "declined"}
                        style={{
                          ...buttonStyle,
                          background: "#fff5f5",
                          color: "#991b1b",
                          border: "1px solid #fecaca",
                          opacity: saving || status === "declined" ? 0.65 : 1,
                        }}
                      >
                        Decline
                      </button>
                    </div>

                    <div style={{ ...detailGridStyle, marginTop: "2px" }}>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={statLabel}>Contact Method</span>
                        <select
                          value={contactMethod}
                          onChange={(e) =>
                            handleAssignmentDetailsChange(assignment, {
                              contact_method: e.target.value
                                ? (e.target.value as ContactMethod)
                                : null,
                            })
                          }
                          disabled={saving}
                          style={{ ...selectStyle, maxWidth: "100%", width: "100%", background: "#ffffff" }}
                        >
                          <option value="">Not set</option>
                          {contactMethods.map((method) => (
                            <option key={method} value={method}>
                              {method}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={statLabel}>Last Contacted</span>
                        <input
                          type="datetime-local"
                          defaultValue={toDatetimeLocalValue(assignment.last_contacted_at)}
                          onBlur={(e) =>
                            handleAssignmentDetailsChange(assignment, {
                              last_contacted_at: fromDatetimeLocalValue(e.target.value),
                            })
                          }
                          disabled={saving}
                          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                        />
                      </label>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, background: "#f8fbff", borderColor: "#bfdbfe" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={compactSectionTitleStyle}>Candidate SPs</h2>
            <p style={compactSectionHintStyle}>
              {staffingRelevant ? "Search and assign matches." : "Candidate workflow is available if HiFi staffing becomes relevant."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void handleFillRemainingSpots()}
              disabled={
                saving ||
                shortage <= 0 ||
                availableSps.filter((sp) => {
                  const status = availabilityMatchBySpId.get(sp.id)?.status || "unknown";
                  return status === "available" || status === "partial";
                }).length === 0
              }
              style={{ ...buttonStyle, opacity: saving || shortage <= 0 ? 0.65 : 1 }}
            >
              Fill Remaining Spots
            </button>
            <button
              type="button"
              onClick={() => void handleAddTopMatches()}
              disabled={saving || recommendedSps.length === 0}
              style={{
                ...buttonStyle,
                background: "#ffffff",
                color: "#173b6c",
                border: "1px solid #cbd5e1",
                opacity: saving || recommendedSps.length === 0 ? 0.65 : 1,
              }}
            >
              Add Top 3 Matches
            </button>
            <button
              type="button"
              onClick={() => setShowEmailDraft((current) => !current)}
              disabled={saving}
              style={{
                ...buttonStyle,
                background: "#ffffff",
                color: "#173b6c",
                border: "1px solid #bfdbfe",
                opacity: saving ? 0.65 : 1,
              }}
            >
              {showEmailDraft ? "Hide Email Preview" : "Show Email Preview"}
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #dbe4ee",
            borderRadius: "16px",
            padding: "14px",
            background: "#f8fbff",
            display: "grid",
            gap: "10px",
            marginTop: "10px",
          }}
        >
          {assignmentSuccessMessage ? (
            <div
              style={{
                borderRadius: "14px",
                padding: "12px 14px",
                background: "#ecfdf3",
                border: "1px solid #86efac",
                color: "#166534",
                fontWeight: 900,
              }}
            >
              {assignmentSuccessMessage}
            </div>
          ) : null}

          <div
            style={{
              borderRadius: "14px",
              padding: "12px 14px",
              background: coverageStatus.background,
              border: coverageStatus.border,
              color: coverageStatus.color,
            }}
          >
            <div style={statLabel}>{eventType === "hifi" ? "Operational Mode" : "Coverage Status"}</div>
            <div style={{ marginTop: "4px", fontSize: "18px", fontWeight: 900 }}>
              {eventType === "hifi" && !staffingRelevant ? "HiFi event with no active SP staffing target" : coverageStatus.message}
            </div>
          </div>

          {staffingRelevant ? (
          <div style={{ ...statCard, background: "#ffffff" }}>
            <div style={statLabel}>Recommended SPs</div>

            {recommendedSps.length === 0 ? (
              <div style={{ marginTop: "8px", color: "#64748b", fontWeight: 700 }}>
                No recommended SPs yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                {recommendedSps.map((sp) => {
                  const availabilityMatch = availabilityMatchBySpId.get(sp.id) || {
                    status: "unknown" as AvailabilityMatchStatus,
                    matchedSessions: 0,
                    totalSessions: sessions.length,
                    reason: "No structured availability match data",
                  };

                  return (
                    <div
                      key={sp.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        alignItems: "center",
                        borderRadius: "16px",
                        padding: "12px 14px",
                        background:
                          availabilityMatch.status === "available" ? "#f0fdf4" : "#fffbeb",
                        border:
                          availabilityMatch.status === "available"
                            ? "1px solid #86efac"
                            : "1px solid #fde68a",
                      }}
                    >
                      <div>
                        <div style={{ color: "#173b6c", fontWeight: 900 }}>
                          {getFullName(sp)}
                        </div>
                        <div
                          style={{
                            marginTop: "4px",
                            display: "inline-flex",
                            borderRadius: "999px",
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontWeight: 900,
                            ...availabilityMatchStyles[availabilityMatch.status],
                          }}
                        >
                          {availabilityMatchLabels[availabilityMatch.status]}
                        </div>
                        <div style={{ marginTop: "6px", color: "#64748b", fontWeight: 700 }}>
                          {availabilityMatch.reason}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleAddAssignment(sp.id)}
                        disabled={saving}
                        style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
                      >
                        {assigningSpId === sp.id ? "Assigning..." : "Assign"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          <input
            value={candidateQuery}
            onChange={(event) => setCandidateQuery(event.target.value)}
            placeholder="Search by name, email, phone, notes, roles, or preferences..."
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          />

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {[
              { label: "Active only", active: activeOnly, setActive: setActiveOnly },
              { label: "Spanish-speaking", active: spanishOnly, setActive: setSpanishOnly },
              { label: "Telehealth", active: telehealthOnly, setActive: setTelehealthOnly },
              { label: "PT preferred", active: ptPreferredOnly, setActive: setPtPreferredOnly },
              { label: "Available for event", active: availableForEventOnly, setActive: setAvailableForEventOnly },
            ].map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() => filter.setActive((current) => !current)}
                style={{
                  ...buttonStyle,
                  background: filter.active ? "#173b6c" : "#ffffff",
                  color: filter.active ? "#ffffff" : "#173b6c",
                  padding: "8px 12px",
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={selectedSpId}
              onChange={(e) => setSelectedSpId(e.target.value)}
              style={selectStyle}
              disabled={saving || availableSps.length === 0}
            >
              <option value="">
                {availableSps.length === 0 ? "No matching unassigned SPs" : "Quick select an SP"}
              </option>
              {availableSps.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {getFullName(sp)}
                  {getEmail(sp) ? ` — ${getEmail(sp)}` : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void handleAddAssignment()}
              disabled={saving || !selectedSpId}
              style={{ ...buttonStyle, opacity: saving || !selectedSpId ? 0.65 : 1 }}
            >
              {assigningSpId && assigningSpId === selectedSpId ? "Assigning..." : "Add Selected SP"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
          <div style={statLabel}>
            Candidate Picker · {availableSps.length} addable / {filteredCandidateSps.length} shown
          </div>
          <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
            {filteredCandidateSps.length === 0 ? (
              <div style={{ ...statCard, color: "#64748b", fontWeight: 700 }}>
                No SPs match the current search and filters.
              </div>
            ) : (
              filteredCandidateSps.slice(0, 12).map((sp) => {
                const rows = availabilityBySpId.get(sp.id) || [];
                const availabilityMatch = availabilityMatchBySpId.get(sp.id) || {
                  status: "unknown" as AvailabilityMatchStatus,
                  matchedSessions: 0,
                  totalSessions: sessions.length,
                  reason: "No structured availability match data",
                };
                const assignment = assignmentsBySpId.get(sp.id);
                const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
                const demographics = [sp.portrayal_age, sp.race, sp.sex]
                  .map(asText)
                  .filter(Boolean)
                  .join(" / ");
                const roleDetails = [sp.telehealth, sp.pt_preferred, sp.other_roles]
                  .map(asText)
                  .filter(Boolean)
                  .join(" / ");

                return (
                  <div
                    key={sp.id}
                    style={{
                      ...statCard,
                      background:
                        availabilityMatch.status === "available"
                          ? "#f0fdf4"
                          : availabilityMatch.status === "none"
                            ? "#fafafa"
                            : "#ffffff",
                      border:
                        availabilityMatch.status === "available"
                          ? "1px solid #86efac"
                          : availabilityMatch.status === "partial"
                            ? "1px solid #fde68a"
                            : availabilityMatch.status === "none"
                              ? "1px solid #fecaca"
                              : "1px solid #dbe4ee",
                      opacity: availabilityMatch.status === "none" ? 0.75 : 1,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ color: "#173b6c", fontWeight: 900, fontSize: "18px" }}>
                          {getFullName(sp)}
                        </div>
                        <div style={{ marginTop: "6px", color: "#334155", lineHeight: 1.6 }}>
                          <div><strong>Email:</strong> {getEmail(sp) || "—"}</div>
                          <div><strong>Phone:</strong> {sp.phone || "—"}</div>
                          <div><strong>Portrayal / race / sex:</strong> {demographics || "—"}</div>
                          <div><strong>Roles / preferences:</strong> {roleDetails || "—"}</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                        <span
                          style={{
                            ...availabilityMatchStyles[availabilityMatch.status],
                            borderRadius: "999px",
                            padding: "8px 12px",
                            fontSize: "13px",
                            fontWeight: 900,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {availabilityMatchLabels[availabilityMatch.status]}
                        </span>

                        {assignmentStatus ? (
                          <button
                            type="button"
                            disabled
                            style={{
                              ...(assignment ? confirmationStyles[getCommandCenterAssignmentTone(assignment)] : confirmationStyles.pending),
                              borderRadius: "999px",
                              padding: "7px 11px",
                              fontSize: "12px",
                              fontWeight: 900,
                              cursor: "not-allowed",
                              opacity: 0.85,
                            }}
                          >
                            {assignment
                              ? `Already ${getCommandCenterAssignmentLabel(assignment)}`
                              : "Already Assigned"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleAddAssignment(sp.id)}
                            disabled={saving || Boolean(assignmentStatus)}
                            style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
                          >
                            {assigningSpId === sp.id ? "Assigning..." : "Assign"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "10px",
                        color:
                          availabilityMatch.status === "none"
                            ? "#991b1b"
                            : availabilityMatch.status === "available"
                              ? "#166534"
                              : "#64748b",
                        fontWeight: 800,
                      }}
                    >
                      Match reason: {availabilityMatch.reason}
                    </div>

                    <div style={{ marginTop: "10px", color: "#64748b", whiteSpace: "pre-wrap" }}>
                      <strong>Availability rows:</strong> {formatAvailabilityRows(rows)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
