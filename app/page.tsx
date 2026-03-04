"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";

type Visibility = "team" | "personal";

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed: number | null;
  sp_assigned: number | null;
  owner_id: string | null;
  visibility: Visibility;
  created_at?: string;
};

const STATUSES = ["Needs SPs", "Scheduled", "In Progress", "Completed", "Canceled"];
const VISIBILITIES: Visibility[] = ["team", "personal"];

function numOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function shortage(e: EventRow) {
  const needed = e.sp_needed ?? 0;
  const assigned = e.sp_assigned ?? 0;
  return Math.max(needed - assigned, 0);
}

function labelVisibility(v: Visibility) {
  return v === "team" ? "Team" : "Personal";
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // View filter
  const [view, setView] = useState<"all" | Visibility>("all");

  // Form state
  const [name, setName] = useState("N651 Virtual");
  const [status, setStatus] = useState("Needs SPs");
  const [dateText, setDateText] = useState("3/10, 3/11");
  const [spNeeded, setSpNeeded] = useState("6");
  const [spAssigned, setSpAssigned] = useState("2");
  const [visibility, setVisibility] = useState<Visibility>("team");

  // Edit modal
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editDateText, setEditDateText] = useState("");
  const [editSpNeeded, setEditSpNeeded] = useState("");
  const [editSpAssigned, setEditSpAssigned] = useState("");
  const [editVisibility, setEditVisibility] = useState<Visibility>("team");

  async function loadEvents() {
    setError(null);

    const { data, error } = await supabase
      .from("events")
      .select("id,name,status,date_text,sp_needed,sp_assigned,owner_id,visibility,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setEvents([]);
      return;
    }

    // Make sure visibility is always typed correctly even if null/old rows exist
    const normalized = ((data as any[]) ?? []).map((r) => ({
      ...r,
      visibility: (r.visibility === "personal" ? "personal" : "team") as Visibility,
    })) as EventRow[];

    setEvents(normalized);
  }

  useEffect(() => {
    (async () => {
      // Auth gate
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSessionOk(true);

      const uid = data.session.user.id;
      setUserId(uid);

      await loadEvents();

      // Realtime updates
      const channel = supabase
        .channel("events-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => {
          loadEvents();
        })
        .subscribe();

      setLoading(false);

      return () => {
        supabase.removeChannel(channel);
      };
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (view === "all") return events;
    return events.filter((e) => e.visibility === view);
  }, [events, view]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const sa = shortage(a);
      const sb = shortage(b);
      if (sb !== sa) return sb - sa; // most shortage first
      const an = (a.name ?? "").toLowerCase();
      const bn = (b.name ?? "").toLowerCase();
      return an.localeCompare(bn);
    });
    return copy;
  }, [filtered]);

  async function addEvent() {
    setError(null);

    if (!userId) {
      setError("Not signed in.");
      return;
    }

    const payload = {
      name: name.trim() || null,
      status: status.trim() || null,
      date_text: dateText.trim() || null,
      sp_needed: numOrNull(spNeeded),
      sp_assigned: numOrNull(spAssigned),
      owner_id: userId,
      visibility,
    };

    const { error } = await supabase.from("events").insert(payload);
    if (error) {
      setError(error.message);
      return;
    }

    setName("");
    setDateText("");
    setSpNeeded("");
    setSpAssigned("");
    setVisibility("team");
    await loadEvents();
  }

  function openEdit(e: EventRow) {
    setEditing(e);
    setEditName(e.name ?? "");
    setEditStatus(e.status ?? "Needs SPs");
    setEditDateText(e.date_text ?? "");
    setEditSpNeeded(String(e.sp_needed ?? ""));
    setEditSpAssigned(String(e.sp_assigned ?? ""));
    setEditVisibility(e.visibility ?? "team");
  }

  async function saveEdit() {
    if (!editing) return;
    setError(null);

    // Preserve owner_id so nobody accidentally blanks/changes it
    const updates = {
      name: editName.trim() || null,
      status: editStatus.trim() || null,
      date_text: editDateText.trim() || null,
      sp_needed: numOrNull(editSpNeeded),
      sp_assigned: numOrNull(editSpAssigned),
      visibility: editVisibility,
      owner_id: editing.owner_id, // keep original
    };

    const { error } = await supabase.from("events").update(updates).eq("id", editing.id);
    if (error) setError(error.message);

    setEditing(null);
    await loadEvents();
  }

  async function deleteEvent(id: string) {
    if (!confirm("Delete this event?")) return;
    setError(null);

    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) setError(error.message);

    await loadEvents();
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function canEdit(e: EventRow) {
    // UX hint only — real enforcement is RLS
    return e.visibility === "team" || (!!userId && e.owner_id === userId);
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0b0b", color: "white" }}>
        Loading...
      </main>
    );
  }

  if (!sessionOk) return null;

  return (
    <main style={{ background: "#0b0b0b", color: "white", minHeight: "100vh", padding: 24, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 36, margin: 0 }}>CFSP Ops Board</h1>
          <div style={{ opacity: 0.75, marginTop: 4 }}>Conflict Free SP · Simulation Operations</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* View filter */}
          <div style={{ minWidth: 220 }}>
            <SelectField
              label="View"
              value={view}
              onChange={(v) => setView(v as any)}
              options={["all", "team", "personal"]}
              optionLabel={(o) => (o === "all" ? "All" : o === "team" ? "Team" : "Personal")}
            />
          </div>

          <button
            onClick={signOut}
            style={{
              height: 38,
              padding: "0 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid rgba(255, 120, 120, 0.35)", background: "rgba(255, 60, 60, 0.12)" }}>
          <b>Supabase error:</b> {error}
        </div>
      )}

      {/* Form */}
      <section
        style={{
          marginTop: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 16,
          padding: 14,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 0.8fr", gap: 10 }}>
          <Field label="Name" value={name} onChange={setName} placeholder="N651 Virtual" />
          <SelectField label="Status" value={status} onChange={setStatus} options={STATUSES} />
          <Field label="Date (text)" value={dateText} onChange={setDateText} placeholder="3/10, 3/11" />
          <Field label="SP Needed" value={spNeeded} onChange={setSpNeeded} placeholder="6" inputMode="numeric" />
        </div>

        <div style={{ marginTop: 10, display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
          <div style={{ width: 220 }}>
            <Field label="SP Assigned" value={spAssigned} onChange={setSpAssigned} placeholder="2" inputMode="numeric" />
          </div>

          <div style={{ width: 220 }}>
            <SelectField
              label="Visibility"
              value={visibility}
              onChange={(v) => setVisibility(v as Visibility)}
              options={VISIBILITIES}
              optionLabel={(o) => labelVisibility(o as Visibility)}
            />
          </div>

          <button onClick={addEvent} style={btnStyle()}>
            Add / Save Event
          </button>

          <button onClick={loadEvents} style={btnStyle(true)}>
            Refresh
          </button>
        </div>
      </section>

      {/* List */}
      <section style={{ marginTop: 18 }}>
        {sorted.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No events yet. Add one above.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12 }}>
            {sorted.map((e) => {
              const need = e.sp_needed ?? 0;
              const assigned = e.sp_assigned ?? 0;
              const short = shortage(e);
              const editable = canEdit(e);

              return (
                <div
                  key={e.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 16,
                    padding: 14,
                    opacity: editable ? 1 : 0.92,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{e.name ?? "(untitled)"}</div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "rgba(255,255,255,0.06)",
                            fontSize: 12,
                            opacity: 0.9,
                          }}
                        >
                          {labelVisibility(e.visibility)}
                        </span>

                        {e.visibility === "personal" && userId && e.owner_id === userId && (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(120,180,255,0.25)",
                              background: "rgba(80,140,255,0.12)",
                              fontSize: 12,
                              opacity: 0.95,
                            }}
                          >
                            Mine
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => openEdit(e)}
                        title={editable ? "Edit" : "Edit (not allowed)"}
                        style={iconBtn(!editable)}
                        disabled={!editable}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => deleteEvent(e.id)}
                        title={editable ? "Delete" : "Delete (not allowed)"}
                        style={iconBtn(!editable)}
                        disabled={!editable}
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 6, opacity: 0.9 }}>
                    <div>
                      <b>Status:</b> {e.status ?? "-"}
                    </div>
                    <div>
                      <b>Date:</b> {e.date_text ?? "-"}
                    </div>
                    <div>
                      <b>SPs:</b> {assigned} / {need}
                      {short > 0 && (
                        <span style={{ marginLeft: 10, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(255,120,120,0.35)", background: "rgba(255,60,60,0.12)" }}>
                          Short {short}
                        </span>
                      )}
                      {short === 0 && need > 0 && (
                        <span style={{ marginLeft: 10, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(120,255,170,0.25)", background: "rgba(60,255,140,0.10)" }}>
                          Covered
                        </span>
                      )}
                    </div>

                    {!editable && (
                      <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                        You can view this event, but you don’t have permission to edit/delete it.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Edit Modal */}
      {editing && (
        <div
          onClick={() => setEditing(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 96vw)",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "#0f0f0f",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Edit Event</div>
              <button onClick={() => setEditing(null)} style={iconBtn()}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "2fr 1.2fr 1.2fr 0.8fr", gap: 10 }}>
              <Field label="Name" value={editName} onChange={setEditName} placeholder="Event name" />
              <SelectField label="Status" value={editStatus} onChange={setEditStatus} options={STATUSES} />
              <Field label="Date (text)" value={editDateText} onChange={setEditDateText} placeholder="3/10, 3/11" />
              <Field label="SP Needed" value={editSpNeeded} onChange={setEditSpNeeded} placeholder="6" inputMode="numeric" />
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <div style={{ width: 220 }}>
                <Field label="SP Assigned" value={editSpAssigned} onChange={setEditSpAssigned} placeholder="2" inputMode="numeric" />
              </div>

              <div style={{ width: 220 }}>
                <SelectField
                  label="Visibility"
                  value={editVisibility}
                  onChange={(v) => setEditVisibility(v as Visibility)}
                  options={VISIBILITIES}
                  optionLabel={(o) => labelVisibility(o as Visibility)}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={btnStyle(true)}>
                Cancel
              </button>
              <button onClick={saveEdit} style={btnStyle()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ opacity: 0.75, fontSize: 12 }}>{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        style={{
          height: 42,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#0f0f0f",
          color: "white",
          padding: "0 12px",
          outline: "none",
        }}
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  optionLabel?: (o: string) => string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ opacity: 0.75, fontSize: 12 }}>{props.label}</span>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        style={{
          height: 42,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "#0f0f0f",
          color: "white",
          padding: "0 10px",
          outline: "none",
        }}
      >
        {props.options.map((o) => (
          <option key={o} value={o}>
            {props.optionLabel ? props.optionLabel(o) : o}
          </option>
        ))}
      </select>
    </label>
  );
}

function btnStyle(secondary?: boolean): React.CSSProperties {
  return {
    height: 42,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: secondary ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.10)",
    color: "white",
    cursor: "pointer",
  };
}

function iconBtn(disabled?: boolean): React.CSSProperties {
  return {
    height: 32,
    width: 32,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: disabled ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
    color: "white",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}