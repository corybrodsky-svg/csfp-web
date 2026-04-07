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
  confirmed: boolean | null;
  notes: string | null;
  created_at: string | null;
};

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

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#ffffff",
  color: "#173b6c",
  border: "1px solid #cfd8e3",
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
    .from("event_assignments")
    .select("id,event_id,sp_id,confirmed,notes,created_at")
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
    (assignment) => assignment.confirmed === true
  ).length;
  const needed = Number(event?.sp_needed || 0);
  const shortage = Math.max(needed - confirmedCount, 0);

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

    void fetchCommandCenterData(id).then((result) => {
      if (cancelled) return;

      setEvent(result.event);
      setSps(result.sps);
      setAssignments(result.assignments);
      setErrorMessage(result.errorMessage);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleAddAssignment() {
    if (!id || !selectedSpId) return;

    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase.from("event_assignments").insert({
      event_id: id,
      sp_id: selectedSpId,
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

  async function handleConfirmChange(assignment: AssignmentRow, confirmed: boolean) {
    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("event_assignments")
      .update({ confirmed })
      .eq("id", assignment.id);

    if (error) {
      setErrorMessage(error.message || "Could not update assignment.");
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
      .from("event_assignments")
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

        <div style={statGrid}>
          <div style={statCard}>
            <div style={statLabel}>Date</div>
            <div style={statValue}>{event.date_text || "—"}</div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Location</div>
            <div style={statValue}>{event.location || "—"}</div>
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

        <div style={{ marginTop: 14, color: "#173b6c", lineHeight: 1.8 }}>
          <div>
            <strong>Confirmed:</strong> {confirmedCount}
          </div>
          <div>
            <strong>Total assigned:</strong> {assignments.length}
          </div>
          <div>
            <strong>Visibility:</strong> {event.visibility || "—"}
          </div>
          <div>
            <strong>Notes:</strong> {event.notes || "—"}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, color: "#173b6c" }}>Assign SP</h2>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
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
        <h2 style={{ marginTop: 0, color: "#173b6c" }}>Saved Assignments</h2>

        {assignments.length === 0 ? (
          <p style={{ color: "#64748b", marginBottom: 0 }}>No SPs assigned yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {assignments.map((assignment) => {
              const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
              const confirmed = assignment.confirmed === true;

              return (
                <div
                  key={assignment.id}
                  style={{
                    border: "1px solid #dbe4ee",
                    borderRadius: "18px",
                    padding: "16px",
                    background: confirmed ? "#ecfdf3" : "#f8fbff",
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
                        {sp ? getEmail(sp) || "No email" : assignment.sp_id || "No SP id"}
                      </div>
                      <div style={{ marginTop: 6, color: "#173b6c", fontWeight: 800 }}>
                        {confirmed ? "Confirmed" : "Unconfirmed"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => handleConfirmChange(assignment, !confirmed)}
                        disabled={saving}
                        style={secondaryButtonStyle}
                      >
                        {confirmed ? "Unconfirm" : "Confirm"}
                      </button>

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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SiteShell>
  );
}
