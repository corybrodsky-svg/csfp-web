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

type SPRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  working_email: string | null;
  email: string | null;
  phone: string | null;
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
  sps: SPRow[];
  assignments: AssignmentRow[];
  errorMessage: string;
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

function sortSPs(a: SPRow, b: SPRow) {
  return getFullName(a).localeCompare(getFullName(b));
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

function formatTimestamp(value?: string | null) {
  if (!value) return "Not contacted yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not contacted yet";
  return parsed.toLocaleString();
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

async function fetchCommandCenterData(eventId: string): Promise<CommandCenterData> {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,name,status,date_text,sp_needed,sp_assigned,visibility,location,notes,created_at")
    .eq("id", eventId)
    .maybeSingle<EventDetailRow>();

  if (eventError) {
    return {
      event: null,
      sps: [],
      assignments: [],
      errorMessage: eventError.message || "Could not load event from Supabase.",
    };
  }

  const { data: sps, error: spError } = await supabase
    .from("sps")
    .select("id,first_name,last_name,full_name,working_email,email,phone,status")
    .returns<SPRow[]>();

  if (spError) {
    return {
      event,
      sps: [],
      assignments: [],
      errorMessage: spError.message || "Could not load SPs from Supabase.",
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
      sps: [...(sps || [])].sort(sortSPs),
      assignments: [],
      errorMessage: assignmentError.message || "Could not load assignments from Supabase.",
    };
  }

  return {
    event,
    sps: [...(sps || [])].sort(sortSPs),
    assignments: assignments || [],
    errorMessage: "",
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
  const [sps, setSps] = useState<SPRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [selectedSpId, setSelectedSpId] = useState("");
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const spsById = useMemo(() => {
    const next = new Map<string, SPRow>();
    sps.forEach((sp) => next.set(String(sp.id), sp));
    return next;
  }, [sps]);

  const assignedSpIds = useMemo(
    () => new Set(assignments.map((assignment) => asText(assignment.sp_id)).filter(Boolean)),
    [assignments]
  );

  const availableSps = useMemo(
    () => sps.filter((sp) => !assignedSpIds.has(String(sp.id))),
    [assignedSpIds, sps]
  );

  const confirmedCount = assignments.filter(
    (assignment) => getAssignmentStatus(assignment) === "confirmed"
  ).length;
  const unconfirmedCount = Math.max(assignments.length - confirmedCount, 0);
  const needed = Number(event?.sp_needed || 0);
  const shortage = Math.max(needed - confirmedCount, 0);
  const coveragePercent =
    needed > 0 ? Math.min(100, Math.round((confirmedCount / needed) * 100)) : 0;
  const isCovered = needed > 0 && shortage === 0;

  async function refreshData() {
    if (!id) return;

    const result = await fetchCommandCenterData(id);
    setEvent(result.event);
    setSps(result.sps);
    setAssignments(result.assignments);
    setErrorMessage(result.errorMessage);
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
        setSps(result.sps);
        setAssignments(result.assignments);
        setErrorMessage(result.errorMessage);
        setLoading(false);
      });
    };

    refresh();

    window.addEventListener("focus", refresh);

    const channel = supabase
      .channel(`event-command-center-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, refresh)
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

  async function handleAddAssignment() {
    if (!id || !selectedSpId) return;

    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase.from("event_sps").insert({
      event_id: id,
      sp_id: selectedSpId,
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
            <div style={statValue}>{event.date_text || "—"}</div>
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
          Choose an available SP, add them as unconfirmed, then confirm once they accept.
        </p>

        <div
          style={{
            border: "1px solid #dbe4ee",
            borderRadius: "18px",
            padding: "16px",
            background: "#f8fbff",
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={selectedSpId}
            onChange={(e) => setSelectedSpId(e.target.value)}
            style={selectStyle}
            disabled={saving || availableSps.length === 0}
          >
            <option value="">
              {availableSps.length === 0 ? "No unassigned SPs available" : "Select an SP"}
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
            onClick={handleAddAssignment}
            disabled={saving || !selectedSpId}
            style={{ ...buttonStyle, opacity: saving || !selectedSpId ? 0.65 : 1 }}
          >
            Add Assignment
          </button>
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
