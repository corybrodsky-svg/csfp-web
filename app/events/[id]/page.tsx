"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SiteShell from "../../components/SiteShell";
import { supabase } from "../../lib/supabaseClient";

type EventDetailRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed: number | null;
  sp_assigned: number | null;
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

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #dbe4ee",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 10px 26px rgba(15, 23, 42, 0.06)",
  marginBottom: "18px",
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "14px",
  marginTop: "14px",
};

const statCard: React.CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "18px",
  padding: "14px",
  background: "#f8fbff",
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
};

const statValue: React.CSSProperties = {
  fontSize: "18px",
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

const coverageHeroStyle: React.CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: "22px",
  padding: "18px",
  background: "linear-gradient(135deg, #eff6ff, #f8fbff)",
  marginTop: "18px",
};

const detailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "12px",
  marginTop: "16px",
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
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  },
  contacted: {
    background: "#f5f3ff",
    color: "#6d28d9",
    border: "1px solid #ddd6fe",
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
  minHeight: "84px",
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

function getContactMethod(assignment: AssignmentRow) {
  const rawMethod = asText(assignment.contact_method) as ContactMethod;
  return contactMethods.includes(rawMethod) ? rawMethod : "";
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

function formatTimestamp(value?: string | null) {
  if (!value) return "Not contacted yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not contacted yet";
  return parsed.toLocaleString();
}

function formatSessionDate(value?: string | null) {
  if (!value) return "Date TBD";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatSessionTime(session: EventSessionRow) {
  if (session.start_time && session.end_time) {
    return `${session.start_time}-${session.end_time}`;
  }

  return session.start_time || session.end_time || "Time TBD";
}

function formatSessionLocation(session: EventSessionRow, eventLocation?: string | null) {
  return session.room || session.location || eventLocation || "Location TBD";
}

function formatSessionLabel(session: EventSessionRow, eventLocation?: string | null) {
  return [
    formatSessionDate(session.session_date),
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

async function fetchCommandCenterData(eventId: string): Promise<CommandCenterData> {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,name,status,date_text,sp_needed,sp_assigned,visibility,location,notes,created_at")
    .eq("id", eventId)
    .maybeSingle<EventDetailRow>();

  if (eventError) {
    return {
      event: null,
      sessions: [],
      sps: [],
      assignments: [],
      availabilityRows: [],
      errorMessage: eventError.message || "Could not load event from Supabase.",
      sessionErrorMessage: "",
      availabilityErrorMessage: "",
    };
  }

  const { data: sessions, error: sessionError } = await supabase
    .from("event_sessions")
    .select("id,event_id,session_date,start_time,end_time,location,room,created_at")
    .eq("event_id", eventId)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .returns<EventSessionRow[]>();

  const { data: sps, error: spError } = await supabase
    .from("sps")
    .select("id,first_name,last_name,full_name,working_email,email,phone,portrayal_age,race,sex,telehealth,pt_preferred,other_roles,speaks_spanish,notes,status")
    .returns<SPRow[]>();

  if (spError) {
    return {
      event,
      sessions: sessions || [],
      sps: [],
      assignments: [],
      availabilityRows: [],
      errorMessage: spError.message || "Could not load SPs from Supabase.",
      sessionErrorMessage: sessionError
        ? sessionError.message || "Could not load event sessions from Supabase."
        : "",
      availabilityErrorMessage: "",
    };
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("event_sps")
    .select("id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method,created_at")
    .eq("event_id", eventId)
    .returns<AssignmentRow[]>();

  if (assignmentError) {
    return {
      event,
      sessions: sessions || [],
      sps: [...(sps || [])].sort(sortSPs),
      assignments: [],
      availabilityRows: [],
      errorMessage: assignmentError.message || "Could not load assignments from Supabase.",
      sessionErrorMessage: sessionError
        ? sessionError.message || "Could not load event sessions from Supabase."
        : "",
      availabilityErrorMessage: "",
    };
  }

  const { data: availabilityRows, error: availabilityError } = await supabase
    .from("sp_availability")
    .select("*")
    .limit(1000)
    .returns<AvailabilityRow[]>();

  return {
    event,
    sessions: sessions || [],
    sps: [...(sps || [])].sort(sortSPs),
    assignments: assignments || [],
    availabilityRows: availabilityRows || [],
    errorMessage: "",
    sessionErrorMessage: sessionError
      ? sessionError.message || "Could not load event sessions from Supabase."
      : "",
    availabilityErrorMessage: availabilityError
      ? availabilityError.message || "Could not load SP availability from Supabase."
      : "",
  };
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
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
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

  const assignmentsBySpId = useMemo(() => {
    const next = new Map<string, AssignmentRow>();
    assignments.forEach((assignment) => {
      const spId = asText(assignment.sp_id);
      if (spId) next.set(spId, assignment);
    });
    return next;
  }, [assignments]);

  const filteredCandidateSps = useMemo(
    () =>
      sps.filter((sp) => {
        const query = candidateQuery.trim().toLowerCase();
        if (query && !getCandidateSearchText(sp).includes(query)) return false;
        if (activeOnly && !isActiveSp(sp)) return false;
        if (spanishOnly && !speaksSpanish(sp)) return false;
        if (telehealthOnly && !hasTelehealth(sp)) return false;
        if (ptPreferredOnly && !hasPtPreferred(sp)) return false;
        return true;
      }),
    [activeOnly, candidateQuery, ptPreferredOnly, spanishOnly, sps, telehealthOnly]
  );

  const availableSps = useMemo(
    () => filteredCandidateSps.filter((sp) => !assignedSpIds.has(String(sp.id))),
    [assignedSpIds, filteredCandidateSps]
  );

  const availabilityBySpId = useMemo(() => {
    const next = new Map<string, AvailabilityRow[]>();

    sps.forEach((sp) => {
      next.set(sp.id, getAvailabilityForSp(sp.id, availabilityRows));
    });

    return next;
  }, [availabilityRows, sps]);

  const confirmedCount = assignments.filter(
    (assignment) => getAssignmentStatus(assignment) === "confirmed"
  ).length;
  const unconfirmedCount = Math.max(assignments.length - confirmedCount, 0);
  const needed = Number(event?.sp_needed || 0);
  const shortage = Math.max(needed - confirmedCount, 0);
  const coveragePercent =
    needed > 0 ? Math.min(100, Math.round((confirmedCount / needed) * 100)) : 0;
  const isCovered = needed > 0 && shortage === 0;
  const structuredDateLabel = sessions.length
    ? sessions.map((session) => formatSessionLabel(session, event?.location)).join("; ")
    : "";
  const eventDateLabel = structuredDateLabel || event?.date_text || "TBD";
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

  const emailSubject = `SP Assignment: ${event?.name || "CFSP Event"}`;
  const emailBody = [
    "Hello,",
    "",
    `You are receiving this because you are assigned as an SP for ${event?.name || "this CFSP event"}.`,
    "",
    `Event: ${event?.name || "TBD"}`,
    `Date(s): ${eventDateLabel}`,
    `Location: ${event?.location || "TBD"}`,
    "",
    "Reporting instructions: Please arrive at the assigned reporting location 15 minutes before the event start time. Additional case-specific instructions will be shared by the simulation operations team.",
    "",
    "Please reply to confirm your assignment and availability for this event.",
    "",
    "Thank you,",
    "CFSP Simulation Operations",
  ].join("\n");
  const mailtoHref = buildMailtoHref({
    bcc: bccEmails,
    subject: emailSubject,
    body: emailBody,
  });

  async function refreshData() {
    if (!id) return;

    const result = await fetchCommandCenterData(id);
    setEvent(result.event);
    setSessions(result.sessions);
    setSps(result.sps);
    setAssignments(result.assignments);
    setAvailabilityRows(result.availabilityRows);
    setErrorMessage(result.errorMessage);
    setSessionErrorMessage(result.sessionErrorMessage);
    setAvailabilityErrorMessage(result.availabilityErrorMessage);
    setSelectedSpId("");
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

    const channel = supabase
      .channel(`event-command-center-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_sessions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sps" }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_sps" },
        refresh
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      supabase.removeChannel(channel);
    };
  }, [id]);

  async function handleAddAssignment(spId = selectedSpId) {
    if (!id || !spId) return;

    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase.from("event_sps").insert({
      event_id: id,
      sp_id: spId,
      status: "invited",
      confirmed: false,
    });

    if (error) {
      setErrorMessage(error.message || "Could not save assignment.");
      setSaving(false);
      return;
    }

    await refreshData();
    setSaving(false);
  }

  async function handleStatusChange(assignment: AssignmentRow, status: AssignmentStatus) {
    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("event_sps")
      .update({ status, confirmed: status === "confirmed" })
      .eq("id", assignment.id);

    if (error) {
      setErrorMessage(error.message || "Could not update assignment.");
      setSaving(false);
      return;
    }

    await refreshData();
    setSaving(false);
  }

  async function handleAssignmentDetailsChange(
    assignment: AssignmentRow,
    updates: Partial<Pick<AssignmentRow, "notes" | "last_contacted_at" | "contact_method">>
  ) {
    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase.from("event_sps").update(updates).eq("id", assignment.id);

    if (error) {
      setErrorMessage(error.message || "Could not update assignment details.");
      setSaving(false);
      return;
    }

    await refreshData();
    setSaving(false);
  }

  async function handleRemoveAssignment(assignment: AssignmentRow) {
    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("event_sps")
      .delete()
      .eq("id", assignment.id);

    if (error) {
      setErrorMessage(error.message || "Could not remove assignment.");
      setSaving(false);
      return;
    }

    await refreshData();
    setSaving(false);
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
        <Link href="/events" style={{ color: "#1d4ed8", fontWeight: 800, textDecoration: "none" }}>
          Back to Events
        </Link>

        <h1 style={{ margin: "18px 0 6px", fontSize: "38px", color: "#173b6c" }}>
          {event.name || "Untitled Event"}
        </h1>

        <div style={{ color: "#64748b", fontWeight: 800 }}>
          {event.status || "No status"}
        </div>

        <div style={coverageHeroStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <div style={statLabel}>Coverage</div>
              <div style={{ fontSize: "42px", fontWeight: 900, color: "#173b6c", lineHeight: 1 }}>
                {confirmedCount}/{needed || 0}
              </div>
              <div style={{ marginTop: "8px", color: "#64748b", fontWeight: 800 }}>
                {needed > 0
                  ? `${coveragePercent}% confirmed coverage`
                  : "No SP target set"}
              </div>
            </div>

            <div
              style={{
                borderRadius: "999px",
                padding: "12px 16px",
                background: isCovered ? "#ecfdf3" : "#fff7ed",
                border: isCovered ? "1px solid #bbf7d0" : "1px solid #fed7aa",
                color: isCovered ? "#166534" : "#9a3412",
                fontWeight: 900,
              }}
            >
              {isCovered ? "Covered" : `${shortage} SP short`}
            </div>
          </div>
        </div>

        <div style={statGrid}>
          <div style={statCard}>
            <div style={statLabel}>Confirmed</div>
            <div style={statValue}>{confirmedCount}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Unconfirmed</div>
            <div style={statValue}>{unconfirmedCount}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>SPs Needed</div>
            <div style={statValue}>{needed}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Shortage</div>
            <div style={statValue}>{shortage}</div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: "#173b6c" }}>Event Details</h2>

        <div style={detailGridStyle}>
          <div style={statCard}>
            <div style={statLabel}>Date</div>
            <div style={statValue}>{eventDateLabel}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Location</div>
            <div style={statValue}>{event.location || "—"}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Status</div>
            <div style={statValue}>{event.status || "—"}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Visibility</div>
            <div style={statValue}>{event.visibility || "—"}</div>
          </div>
        </div>

        <div
          style={{
            marginTop: "16px",
            border: "1px solid #dbe4ee",
            borderRadius: "18px",
            padding: "16px",
            background: "#f8fbff",
          }}
        >
          <div style={statLabel}>Event Sessions</div>
          {sessions.length ? (
            <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
              {sessions.map((session) => (
                <div key={session.id} style={{ ...statCard, background: "#ffffff" }}>
                  <div style={{ color: "#173b6c", fontWeight: 900 }}>
                    {formatSessionDate(session.session_date)}
                  </div>
                  <div style={{ marginTop: "6px", color: "#334155", lineHeight: 1.7 }}>
                    <div>
                      <strong>Time:</strong> {formatSessionTime(session)}
                    </div>
                    <div>
                      <strong>Location/Room:</strong>{" "}
                      {formatSessionLocation(session, event.location)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: "8px", color: "#64748b", fontWeight: 700 }}>
              No structured sessions yet. Fallback date text: {event.date_text || "—"}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "16px",
            border: "1px solid #dbe4ee",
            borderRadius: "18px",
            padding: "16px",
            background: "#f8fbff",
            color: "#173b6c",
            lineHeight: 1.7,
          }}
        >
          <div style={statLabel}>Notes</div>
          <div style={{ marginTop: "6px", whiteSpace: "pre-wrap" }}>{event.notes || "—"}</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: "#173b6c" }}>Assign SP</h2>
        <p style={{ marginTop: 0, color: "#64748b", fontWeight: 700 }}>
          Search, filter, and add SPs as invited while coverage stays visible.
        </p>

        <div
          style={{
            border: "1px solid #dbe4ee",
            borderRadius: "18px",
            padding: "16px",
            background: "#f8fbff",
            display: "grid",
            gap: "14px",
          }}
        >
          <div style={{ ...statCard, background: "#ffffff" }}>
            <div style={statLabel}>Live Coverage</div>
            <div style={{ marginTop: "6px", color: "#173b6c", fontWeight: 900 }}>
              {confirmedCount} confirmed / {needed} needed · {shortage} short
            </div>
          </div>

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
              Add Selected SP
            </button>
          </div>
        </div>

        <div style={{ marginTop: "16px" }}>
          <div style={statLabel}>
            Candidate Picker · {availableSps.length} addable / {filteredCandidateSps.length} shown
          </div>
          <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
            {filteredCandidateSps.length === 0 ? (
              <div style={{ ...statCard, color: "#64748b", fontWeight: 700 }}>
                No SPs match the current search and filters.
              </div>
            ) : (
              filteredCandidateSps.slice(0, 12).map((sp) => {
                const rows = availabilityBySpId.get(sp.id) || [];
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
                  <div key={sp.id} style={{ ...statCard, background: "#ffffff" }}>
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
                        {assignmentStatus ? (
                          <span
                            style={{
                              ...assignmentStatusStyles[assignmentStatus],
                              borderRadius: "999px",
                              padding: "7px 11px",
                              fontSize: "12px",
                              fontWeight: 900,
                            }}
                          >
                            Already {assignmentStatusLabels[assignmentStatus]}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleAddAssignment(sp.id)}
                            disabled={saving}
                            style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
                          >
                            Add SP
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: "10px", color: "#64748b", whiteSpace: "pre-wrap" }}>
                      <strong>Availability:</strong> {formatAvailabilityRows(rows)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
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
            <h2 style={{ margin: 0, color: "#173b6c" }}>SP Email</h2>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontWeight: 700 }}>
              Email addresses are sourced from assigned `event_sps.sp_id` rows matched to `sps.working_email` first, then `sps.email`.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowEmailDraft((current) => !current)}
            style={buttonStyle}
          >
            Generate SP Email
          </button>
        </div>

        {showEmailDraft ? (
          <div style={{ marginTop: "16px", display: "grid", gap: "14px" }}>
            <div style={statCard}>
              <div style={statLabel}>BCC Recipients</div>
              <div style={{ marginTop: "8px", color: "#173b6c", lineHeight: 1.7 }}>
                {bccEmails.length ? bccEmails.join(", ") : "No assigned SP emails found."}
              </div>
            </div>

            <div style={statCard}>
              <div style={statLabel}>Email Source Detail</div>
              <div style={{ marginTop: "8px", color: "#173b6c", lineHeight: 1.7 }}>
                {assignedEmailSources.length ? (
                  assignedEmailSources.map((item) => (
                    <div key={item.assignmentId}>
                      <strong>{item.spName}:</strong> {item.email} from {item.source}
                    </div>
                  ))
                ) : (
                  "No assigned SPs have an email in sps.working_email or sps.email."
                )}
              </div>
            </div>

            <label style={{ display: "grid", gap: "6px" }}>
              <span style={statLabel}>Subject</span>
              <input readOnly value={emailSubject} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </label>

            <label style={{ display: "grid", gap: "6px" }}>
              <span style={statLabel}>Copyable Email Body</span>
              <textarea readOnly value={emailBody} style={{ ...textareaStyle, minHeight: "220px" }} />
            </label>

            <div>
              <a
                href={mailtoHref}
                style={{
                  ...buttonStyle,
                  display: "inline-flex",
                  textDecoration: "none",
                }}
              >
                Open Mailto Draft
              </a>
            </div>
          </div>
        ) : null}
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, color: "#173b6c" }}>Assigned SPs</h2>
          <div style={{ color: "#64748b", fontWeight: 800 }}>
            {confirmedCount} confirmed · {unconfirmedCount} unconfirmed
          </div>
        </div>

        {assignments.length === 0 ? (
          <p style={{ color: "#64748b", marginBottom: 0, marginTop: "14px" }}>
            No SPs assigned yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
            {assignments.map((assignment) => {
              const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
              const status = getAssignmentStatus(assignment);
              const confirmed = status === "confirmed";
              const email = sp ? getEmail(sp) : "";
              const statusStyle = assignmentStatusStyles[status];
              const contactMethod = getContactMethod(assignment);
              const availabilityForSp = assignment.sp_id
                ? availabilityBySpId.get(assignment.sp_id) || []
                : [];

              return (
                <div
                  key={assignment.id}
                  style={{
                    border: statusStyle.border,
                    borderRadius: "18px",
                    padding: "16px",
                    background: confirmed ? "#ecfdf3" : "#ffffff",
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
                      <h3 style={{ margin: 0, color: "#173b6c", fontSize: "24px" }}>
                        {sp ? getFullName(sp) : "Unknown SP"}
                      </h3>
                      <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
                        {email || assignment.sp_id || "No SP id"}
                      </div>
                      <div style={{ marginTop: 6, color: "#334155", lineHeight: 1.6 }}>
                        <strong>Phone:</strong> {sp?.phone || "—"}
                      </div>
                      <div style={{ marginTop: 6, color: "#334155", lineHeight: 1.6 }}>
                        <strong>Last contact:</strong> {formatTimestamp(assignment.last_contacted_at)}
                      </div>
                      <div style={{ marginTop: 6, color: "#334155", lineHeight: 1.6 }}>
                        <strong>Availability:</strong>
                        <span style={{ display: "block", whiteSpace: "pre-wrap" }}>
                          {formatAvailabilityRows(availabilityForSp)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          marginTop: 10,
                          borderRadius: "999px",
                          padding: "7px 11px",
                          background: statusStyle.background,
                          color: statusStyle.color,
                          border: statusStyle.border,
                          fontWeight: 900,
                          fontSize: "13px",
                        }}
                      >
                        {assignmentStatusLabels[status]}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <select
                        value={status}
                        onChange={(e) =>
                          handleStatusChange(assignment, e.target.value as AssignmentStatus)
                        }
                        disabled={saving}
                        style={{
                          ...selectStyle,
                          width: "190px",
                          maxWidth: "190px",
                          background: "#ffffff",
                        }}
                      >
                        {assignmentStatuses.map((option) => (
                          <option key={option} value={option}>
                            {assignmentStatusLabels[option]}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveAssignment(assignment)}
                        disabled={saving}
                        style={dangerButtonStyle}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div style={{ ...detailGridStyle, marginTop: "16px" }}>
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

                  <label style={{ display: "grid", gap: "6px", marginTop: "16px" }}>
                    <span style={statLabel}>Assignment Notes</span>
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
                      style={textareaStyle}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
