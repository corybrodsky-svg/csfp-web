"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";

type SettingsState = {
  eventName: string;
  status: string;
  visibility: string;
  location: string;
  courseProgram: string;
  facultyContact: string;
  facultyEmail: string;
  simLead: string;
  operationalNotes: string;
  roomDisplay: string;
};

type SupportState = {
  av: boolean;
  simTech: boolean;
  facultyOperator: boolean;
  recording: boolean;
  zoom: boolean;
  materialsReady: boolean;
  staffingReady: boolean;
  qaReady: boolean;
  commandOpen: boolean;
  liveTelemetry: boolean;
  communicationChecklist: boolean;
};

type EventRow = {
  id?: string;
  name?: string | null;
  title?: string | null;
  status?: string | null;
  visibility?: string | null;
  location?: string | null;
  notes?: string | null;
};

type MeResponse = {
  profile?: {
    role?: string | null;
  } | null;
  user?: {
    email?: string | null;
  } | null;
};

const eventTags = ["Skills", "SP", "HiFi", "Training", "Virtual"];
const metadataOpen = "[CFSP_SETTINGS]";
const metadataClose = "[/CFSP_SETTINGS]";

const initialSettings: SettingsState = {
  eventName: "",
  status: "Planning",
  visibility: "Internal",
  location: "",
  courseProgram: "",
  facultyContact: "",
  facultyEmail: "",
  simLead: "",
  operationalNotes: "",
  roomDisplay: "Room number + learner/SP",
};

const initialSupport: SupportState = {
  av: false,
  simTech: false,
  facultyOperator: false,
  recording: false,
  zoom: false,
  materialsReady: false,
  staffingReady: false,
  qaReady: false,
  commandOpen: true,
  liveTelemetry: true,
  communicationChecklist: false,
};

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function extractApiEvent(payload: unknown): EventRow | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.event && typeof record.event === "object") return record.event as EventRow;
  return record as EventRow;
}

function parseSettingsMetadata(notes: string) {
  const start = notes.indexOf(metadataOpen);
  const end = notes.indexOf(metadataClose);
  if (start < 0 || end < 0 || end <= start) return null;

  const raw = notes.slice(start + metadataOpen.length, end).trim();
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<{
      settings: Partial<SettingsState>;
      selectedTags: string[];
      support: Partial<SupportState>;
    }>) : null;
  } catch {
    return null;
  }
}

function stripSettingsMetadata(notes: string) {
  const start = notes.indexOf(metadataOpen);
  const end = notes.indexOf(metadataClose);
  if (start < 0 || end < 0 || end <= start) return notes.trim();
  return `${notes.slice(0, start).trim()}\n${notes.slice(end + metadataClose.length).trim()}`.trim();
}

function buildNotesWithSettings(baseNotes: string, settings: SettingsState, selectedTags: string[], support: SupportState) {
  const visibleNotes = stripSettingsMetadata(baseNotes || settings.operationalNotes || "");
  const payload = {
    settings: {
      courseProgram: settings.courseProgram,
      facultyContact: settings.facultyContact,
      facultyEmail: settings.facultyEmail,
      simLead: settings.simLead,
      roomDisplay: settings.roomDisplay,
    },
    selectedTags,
    support,
    savedAt: new Date().toISOString(),
  };

  return `${visibleNotes ? `${visibleNotes}\n\n` : ""}${metadataOpen}\n${JSON.stringify(payload, null, 2)}\n${metadataClose}`;
}

function hydrateFromEvent(event: EventRow) {
  const notes = text(event.notes);
  const metadata = parseSettingsMetadata(notes);
  const metadataSettings = metadata?.settings || {};

  return {
    settings: {
      ...initialSettings,
      eventName: text(event.name || event.title),
      status: text(event.status) || initialSettings.status,
      visibility: text(event.visibility) || initialSettings.visibility,
      location: text(event.location),
      operationalNotes: stripSettingsMetadata(notes),
      courseProgram: text(metadataSettings.courseProgram),
      facultyContact: text(metadataSettings.facultyContact),
      facultyEmail: text(metadataSettings.facultyEmail),
      simLead: text(metadataSettings.simLead),
      roomDisplay: text(metadataSettings.roomDisplay) || initialSettings.roomDisplay,
    },
    selectedTags: Array.isArray(metadata?.selectedTags)
      ? metadata.selectedTags.map(text).filter(Boolean)
      : [],
    support: {
      ...initialSupport,
      ...(metadata?.support || {}),
    },
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
        rows={6}
        className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold leading-6 text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange, detail }: { label: string; checked: boolean; onChange: (value: boolean) => void; detail?: string }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1" />
      <span>
        <span className="block text-sm font-black text-[var(--cfsp-text)]">{label}</span>
        {detail ? <span className="block text-xs font-semibold leading-5 text-[var(--cfsp-text-muted)]">{detail}</span> : null}
      </span>
    </label>
  );
}

function SettingsPanel({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[var(--cfsp-border)] bg-white p-4 shadow-sm">
      <p className="cfsp-kicker">Event configuration</p>
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

  const [settings, setSettings] = useState<SettingsState>(initialSettings);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [support, setSupport] = useState<SupportState>(initialSupport);
  const [savedMessage, setSavedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [baseNotes, setBaseNotes] = useState("");
  const [canEdit, setCanEdit] = useState(!eventId);
  const [roleLabel, setRoleLabel] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEventSettings() {
      if (!eventId) {
        setLoading(false);
        setCanEdit(true);
        return;
      }

      setLoading(true);
      setErrorMessage("");

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
        const event = extractApiEvent(eventPayload);

        if (!event) {
          throw new Error("Event response did not include usable event data.");
        }

        const hydrated = hydrateFromEvent(event);

        if (!cancelled) {
          setRoleLabel(role || "unknown");
          setCanEdit(allowed);
          setSettings(hydrated.settings);
          setSelectedTags(hydrated.selectedTags);
          setSupport(hydrated.support);
          setBaseNotes(text(event.notes));
          setErrorMessage(allowed ? "" : "This page is read-only for your current role. Admin or sim-op access is required to save event settings.");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Could not load event settings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadEventSettings();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSavedMessage("");
  }

  function updateSupport<K extends keyof SupportState>(key: K, value: SupportState[K]) {
    setSupport((current) => ({ ...current, [key]: value }));
    setSavedMessage("");
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
    setSavedMessage("");
  }

  async function saveEventSettings() {
    setSavedMessage("");
    setErrorMessage("");

    if (!eventId) {
      window.localStorage.setItem("cfsp-settings:global", JSON.stringify({ settings, selectedTags, support }));
      setSavedMessage("Global workstation settings saved locally.");
      return;
    }

    if (!canEdit) {
      setErrorMessage("Admin or sim-op access is required to save event settings.");
      return;
    }

    setSaving(true);
    try {
      const nextNotes = buildNotesWithSettings(settings.operationalNotes || baseNotes, settings, selectedTags, support);

      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settings.eventName,
          status: settings.status,
          visibility: settings.visibility,
          location: settings.location,
          notes: nextNotes,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || "Could not save event settings.");
      }

      setBaseNotes(nextNotes);
      setSavedMessage("Event settings saved to this event.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save event settings.");
    } finally {
      setSaving(false);
    }
  }

  const isEventMode = Boolean(eventId);

  return (
    <SiteShell
      title={isEventMode ? "Event Settings" : "Settings"}
      subtitle={
        isEventMode
          ? "Event-specific configuration for the opened command center."
          : "A practical settings workspace for command preferences and local workstation defaults."
      }
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
              <p className="cfsp-kicker">{isEventMode ? "Event configuration" : "Operations settings"}</p>
              <h1 className="mt-1 text-2xl font-black text-[#145b96]">{isEventMode ? "Event Settings" : "Settings Center"}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#466477]">
                {isEventMode
                  ? "Edit operational details for this event, then return to the command center."
                  : "Edit local workstation preferences for CFSP command workflows."}
              </p>
              {roleLabel ? <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#466477]">Current role: {roleLabel}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary">
                {isEventMode ? "Back to Event" : "Open Events"}
              </Link>
              <button type="button" onClick={saveEventSettings} disabled={loading || saving || !canEdit} className="cfsp-btn cfsp-btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? "Saving..." : isEventMode ? "Save Event Settings" : "Save Local Settings"}
              </button>
            </div>
          </div>
          {savedMessage ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{savedMessage}</div> : null}
          {errorMessage ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{errorMessage}</div> : null}
        </section>

        {loading ? (
          <section className="rounded-[22px] border border-[var(--cfsp-border)] bg-white p-5 text-sm font-bold text-[var(--cfsp-text-muted)]">
            Loading event settings...
          </section>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            <SettingsPanel title="Event Settings" detail="Event identity, type tags, visibility, status, and location for this opened event.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Event name/title" value={settings.eventName} onChange={(value) => update("eventName", value)} />
                <Field label="Status" value={settings.status} onChange={(value) => update("status", value)} />
                <Field label="Visibility" value={settings.visibility} onChange={(value) => update("visibility", value)} />
                <Field label="Location" value={settings.location} onChange={(value) => update("location", value)} />
                <Field label="Course / program" value={settings.courseProgram} onChange={(value) => update("courseProgram", value)} />
                <Field label="Room / round display" value={settings.roomDisplay} onChange={(value) => update("roomDisplay", value)} />
              </div>

              <div className="flex flex-wrap gap-2">
                {eventTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-2 text-sm font-black transition ${
                      selectedTags.includes(tag)
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-[var(--cfsp-border)] bg-white text-[var(--cfsp-text-muted)]"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <TextAreaField
                label="Operational notes"
                value={settings.operationalNotes}
                onChange={(value) => update("operationalNotes", value)}
                placeholder="Event-specific operational notes, support details, reminders, or command center context."
              />
            </SettingsPanel>

            <SettingsPanel title="Command Center Settings" detail="Event-specific command center behavior stored with this event.">
              <Toggle label="Central Command opens by default" checked={support.commandOpen} onChange={(value) => updateSupport("commandOpen", value)} />
              <Toggle label="Show Live Command telemetry" checked={support.liveTelemetry} onChange={(value) => updateSupport("liveTelemetry", value)} />
              <Toggle label="Communication checklist required" checked={support.communicationChecklist} onChange={(value) => updateSupport("communicationChecklist", value)} />
              <Toggle label="Staffing reviewed" checked={support.staffingReady} onChange={(value) => updateSupport("staffingReady", value)} />
              <Toggle label="QA / readiness reviewed" checked={support.qaReady} onChange={(value) => updateSupport("qaReady", value)} />
            </SettingsPanel>

            <SettingsPanel title="Support Settings" detail="Operational support signals for AV, sim tech, recording, faculty operator, Zoom/logistics, and materials.">
              <Toggle label="AV support needed" checked={support.av} onChange={(value) => updateSupport("av", value)} />
              <Toggle label="Simulation technician support needed" checked={support.simTech} onChange={(value) => updateSupport("simTech", value)} />
              <Toggle label="Faculty operator needed" checked={support.facultyOperator} onChange={(value) => updateSupport("facultyOperator", value)} />
              <Toggle label="Recording needed" checked={support.recording} onChange={(value) => updateSupport("recording", value)} />
              <Toggle label="Zoom / telehealth logistics needed" checked={support.zoom} onChange={(value) => updateSupport("zoom", value)} />
              <Toggle label="Materials ready" checked={support.materialsReady} onChange={(value) => updateSupport("materialsReady", value)} />
            </SettingsPanel>

            <SettingsPanel title="Advanced Settings" detail="Faculty, contact, sim team, and lead information persisted with the event metadata.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Faculty contact" value={settings.facultyContact} onChange={(value) => update("facultyContact", value)} />
                <Field label="Faculty email" value={settings.facultyEmail} onChange={(value) => update("facultyEmail", value)} />
                <Field label="Sim staff / event lead" value={settings.simLead} onChange={(value) => update("simLead", value)} />
              </div>
            </SettingsPanel>
          </div>
        )}
      </div>
    </SiteShell>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm font-bold text-slate-600">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
