"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";

type EventEditState = {
  name: string;
  status: string;
  visibility: string;
  location: string;
  spNeeded: string;
  dateText: string;
  notes: string;
};

type EventRow = {
  id?: string;
  name?: string | null;
  title?: string | null;
  status?: string | null;
  visibility?: string | null;
  location?: string | null;
  sp_needed?: number | string | null;
  spNeeded?: number | string | null;
  date_text?: string | null;
  dateText?: string | null;
  notes?: string | null;
};

type MeResponse = {
  profile?: {
    role?: string | null;
  } | null;
};

const initialEvent: EventEditState = {
  name: "",
  status: "",
  visibility: "",
  location: "",
  spNeeded: "",
  dateText: "",
  notes: "",
};

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function extractEvent(payload: unknown): EventRow | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.event && typeof record.event === "object") return record.event as EventRow;
  return record as EventRow;
}

function hydrateEvent(event: EventRow): EventEditState {
  return {
    name: text(event.name || event.title),
    status: text(event.status) || "Planning",
    visibility: text(event.visibility) || "Internal",
    location: text(event.location),
    spNeeded: text(event.sp_needed ?? event.spNeeded),
    dateText: text(event.date_text ?? event.dateText),
    notes: text(event.notes),
  };
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={8}
        className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold leading-6 text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
      />
    </label>
  );
}

function Panel({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[var(--cfsp-border)] bg-white p-4 shadow-sm">
      <p className="cfsp-kicker">Event editor</p>
      <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">{title}</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">{detail}</p>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const eventId = text(searchParams.get("eventId"));
  const eventHref = useMemo(() => (eventId ? `/events/${encodeURIComponent(eventId)}` : "/events"), [eventId]);

  const [eventEdit, setEventEdit] = useState<EventEditState>(initialEvent);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [roleLabel, setRoleLabel] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      setSavedMessage("");
      setErrorMessage("");

      if (!eventId) {
        setLoading(false);
        setCanEdit(false);
        setErrorMessage("Open Event Settings from a specific event so CFSP knows which event to edit.");
        return;
      }

      setLoading(true);

      try {
        const [meResponse, eventResponse] = await Promise.all([
          fetch("/api/me", { cache: "no-store" }),
          fetch(`/api/events/${encodeURIComponent(eventId)}`, { cache: "no-store" }),
        ]);

        const mePayload = (await meResponse.json().catch(() => ({}))) as MeResponse;
        const role = text(mePayload.profile?.role).toLowerCase();
        const allowed = ["admin", "sim_op", "super_admin"].includes(role);

        if (!eventResponse.ok) {
          throw new Error("Could not load this event.");
        }

        const eventPayload = await eventResponse.json();
        const event = extractEvent(eventPayload);

        if (!event) {
          throw new Error("Event data was not returned.");
        }

        if (!cancelled) {
          setRoleLabel(role || "unknown");
          setCanEdit(allowed);
          setEventEdit(hydrateEvent(event));
          if (!allowed) {
            setErrorMessage("This event is read-only for your current role. Admin or sim-op access is required.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load this event.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadEvent();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function update<K extends keyof EventEditState>(key: K, value: EventEditState[K]) {
    setEventEdit((current) => ({ ...current, [key]: value }));
    setSavedMessage("");
  }

  async function saveEvent() {
    setSavedMessage("");
    setErrorMessage("");

    if (!eventId) {
      setErrorMessage("No event is selected. Go back to the event and open Event Settings from there.");
      return;
    }

    if (!canEdit) {
      setErrorMessage("Admin or sim-op access is required to save this event.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eventEdit.name,
          status: eventEdit.status,
          visibility: eventEdit.visibility,
          location: eventEdit.location,
          sp_needed: eventEdit.spNeeded ? Number(eventEdit.spNeeded) : null,
          date_text: eventEdit.dateText,
          notes: eventEdit.notes,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || "Could not save this event.");
      }

      setSavedMessage("Event updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save this event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SiteShell
      title="Edit Event"
      subtitle="Edit the specific event opened from the command center."
    >
      <div className="grid gap-5">
        <section
          className="rounded-[24px] border p-5"
          style={{
            borderColor: "rgba(20, 91, 150, 0.18)",
            background: "radial-gradient(circle at 10% 0%, rgba(125, 211, 252, 0.2), transparent 32%), linear-gradient(135deg, rgba(247,253,255,0.98), rgba(236,253,245,0.86))",
          }}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="cfsp-kicker">Specific event editor</p>
              <h1 className="mt-1 text-2xl font-black text-[#145b96]">
                {eventEdit.name ? `Edit ${eventEdit.name}` : "Edit Event"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#466477]">
                This page edits the opened event directly. Use it for title, date text, location, status, visibility, SP need, and operational notes.
              </p>
              {roleLabel ? <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#466477]">Current role: {roleLabel}</p> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary">
                {eventId ? "Back to Event" : "Open Events"}
              </Link>
              <button
                type="button"
                onClick={saveEvent}
                disabled={loading || saving || !canEdit || !eventId}
                className="cfsp-btn cfsp-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Event"}
              </button>
            </div>
          </div>

          {savedMessage ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{savedMessage}</div> : null}
          {errorMessage ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{errorMessage}</div> : null}
        </section>

        {loading ? (
          <section className="rounded-[22px] border border-[var(--cfsp-border)] bg-white p-5 text-sm font-bold text-[var(--cfsp-text-muted)]">
            Loading event...
          </section>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="Core Event Details" detail="Edit the event record itself. These values should match what the command center shows.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Event name / title" value={eventEdit.name} onChange={(value) => update("name", value)} />
                <Field label="Date text" value={eventEdit.dateText} onChange={(value) => update("dateText", value)} placeholder="Example: 06/26/2026" />
                <Field label="Location" value={eventEdit.location} onChange={(value) => update("location", value)} />
                <Field label="SPs needed" value={eventEdit.spNeeded} onChange={(value) => update("spNeeded", value.replace(/[^0-9]/g, ""))} />
                <Field label="Status" value={eventEdit.status} onChange={(value) => update("status", value)} />
                <Field label="Visibility" value={eventEdit.visibility} onChange={(value) => update("visibility", value)} />
              </div>
            </Panel>

            <Panel title="Operational Notes" detail="Edit event notes used by the command center, ownership parsing, staffing context, and operational reminders.">
              <TextAreaField
                label="Notes"
                value={eventEdit.notes}
                onChange={(value) => update("notes", value)}
                placeholder="Sim Staff, faculty, hiring notes, operational reminders, support needs, etc."
              />
            </Panel>
          </div>
        )}
      </div>
    </SiteShell>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm font-bold text-slate-600">Loading event editor...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
