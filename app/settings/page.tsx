"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";

type SettingsState = {
  eventName: string;
  status: string;
  visibility: string;
  facultyContact: string;
  facultyEmail: string;
  courseProgram: string;
  simLead: string;
  trainingDate: string;
  trainingTime: string;
  trainingLocation: string;
  trainingLink: string;
  scheduleStatus: string;
  roomDisplay: string;
};

const initialSettings: SettingsState = {
  eventName: "",
  status: "Planning",
  visibility: "Internal",
  facultyContact: "",
  facultyEmail: "",
  courseProgram: "",
  simLead: "",
  trainingDate: "",
  trainingTime: "",
  trainingLocation: "",
  trainingLink: "",
  scheduleStatus: "Not started",
  roomDisplay: "Room number + learner/SP",
};

const eventTags = ["Skills", "SP", "HiFi", "Training", "Virtual"];

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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
    <label className="grid gap-1.5">
      <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none focus:border-[#198a70]"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  detail,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  detail?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-3 py-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1" />
      <span>
        <span className="block text-sm font-black text-[var(--cfsp-text)]">{label}</span>
        {detail ? <span className="mt-1 block text-xs font-semibold text-[var(--cfsp-text-muted)]">{detail}</span> : null}
      </span>
    </label>
  );
}

function SettingsPanel({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-[var(--cfsp-border)] bg-[var(--cfsp-card-bg)] p-4 shadow-[var(--cfsp-card-glow)]">
      <p className="cfsp-kicker">Settings</p>
      <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">{title}</h2>
      <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">{detail}</p>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const eventId = text(searchParams.get("eventId"));
  const [settings, setSettings] = useState(initialSettings);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [support, setSupport] = useState({
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
  });
  const [savedMessage, setSavedMessage] = useState("");
  const eventHref = useMemo(() => (eventId ? `/events/${encodeURIComponent(eventId)}` : "/events"), [eventId]);

  function update<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSavedMessage("");
  }

  function updateSupport<K extends keyof typeof support>(key: K, value: (typeof support)[K]) {
    setSupport((current) => ({ ...current, [key]: value }));
    setSavedMessage("");
  }

  function toggleTag(tag: string) {
    setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
    setSavedMessage("");
  }

  function saveLocalSettings() {
    window.localStorage.setItem(`cfsp-settings:${eventId || "global"}`, JSON.stringify({ settings, selectedTags, support }));
    setSavedMessage("Settings saved locally. Event record saves remain on the event page so operational data stays safe.");
  }

  return (
    <SiteShell
      title="Settings"
      subtitle="A practical settings workspace for event operations, command preferences, support, communication, training, schedules, materials, and staffing."
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
              <p className="cfsp-kicker">Operations settings</p>
              <h1 className="mt-1 text-2xl font-black text-[#145b96]">Settings Center</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#466477]">
                Edit local preferences here, then jump back to the event command station for persisted event-specific saves, uploads, staffing, schedules, and email handlers.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary">
                {eventId ? "Back to Event" : "Open Events"}
              </Link>
              <button type="button" onClick={saveLocalSettings} className="cfsp-btn cfsp-btn-primary">
                Save Local Settings
              </button>
            </div>
          </div>
          {savedMessage ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{savedMessage}</div> : null}
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <SettingsPanel title="Event Settings" detail="Event identity, type tags, visibility, and status preferences.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Event name/title" value={settings.eventName} onChange={(value) => update("eventName", value)} />
              <Field label="Status" value={settings.status} onChange={(value) => update("status", value)} />
              <Field label="Visibility" value={settings.visibility} onChange={(value) => update("visibility", value)} />
              <Field label="Course / program" value={settings.courseProgram} onChange={(value) => update("courseProgram", value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {eventTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-black ${selectedTags.includes(tag) ? "border-[#198a70] bg-emerald-50 text-[#0f766e]" : "border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] text-[var(--cfsp-text-muted)]"}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </SettingsPanel>

          <SettingsPanel title="Command Center Settings" detail="Operational workstation defaults and live telemetry preferences.">
            <Toggle label="Central Command opens by default" checked={support.commandOpen} onChange={(value) => updateSupport("commandOpen", value)} detail="The event page currently enforces this for refresh stability." />
            <Toggle label="Show Live Command telemetry" checked={support.liveTelemetry} onChange={(value) => updateSupport("liveTelemetry", value)} />
            <Field label="Room / round display" value={settings.roomDisplay} onChange={(value) => update("roomDisplay", value)} />
          </SettingsPanel>

          <SettingsPanel title="Support Settings" detail="Support signals used by operations planning: AV, sim tech, recording, faculty operator, and Zoom/logistics.">
            <Toggle label="AV support" checked={support.av} onChange={(value) => updateSupport("av", value)} />
            <Toggle label="Sim tech support" checked={support.simTech} onChange={(value) => updateSupport("simTech", value)} />
            <Toggle label="Faculty operator" checked={support.facultyOperator} onChange={(value) => updateSupport("facultyOperator", value)} />
            <Toggle label="Recording support" checked={support.recording} onChange={(value) => updateSupport("recording", value)} />
            <Toggle label="Zoom / logistics support" checked={support.zoom} onChange={(value) => updateSupport("zoom", value)} />
          </SettingsPanel>

          <SettingsPanel title="Advanced Settings" detail="Faculty, contact, sim team, and lead information can be captured here and persisted from the event page.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Faculty contact" value={settings.facultyContact} onChange={(value) => update("facultyContact", value)} />
              <Field label="Faculty email" value={settings.facultyEmail} onChange={(value) => update("facultyEmail", value)} />
              <Field label="Sim team / event lead" value={settings.simLead} onChange={(value) => update("simLead", value)} />
            </div>
            <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event Faculty Editor</Link>
          </SettingsPanel>

          <SettingsPanel title="Communication Settings" detail="Communication checklist access for SP hiring, confirmation, training, wrap-up, payroll, and faculty training emails.">
            <Toggle label="Communication checklist reviewed" checked={support.communicationChecklist} onChange={(value) => updateSupport("communicationChecklist", value)} />
            <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event Email Workflows</Link>
          </SettingsPanel>

          <SettingsPanel title="Training Settings" detail="Training date, time, location, Zoom/link, recording, case, and doorsign preferences.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Training date" value={settings.trainingDate} onChange={(value) => update("trainingDate", value)} />
              <Field label="Training time" value={settings.trainingTime} onChange={(value) => update("trainingTime", value)} />
              <Field label="Training location" value={settings.trainingLocation} onChange={(value) => update("trainingLocation", value)} />
              <Field label="Zoom / recording / training link" value={settings.trainingLink} onChange={(value) => update("trainingLink", value)} />
            </div>
          </SettingsPanel>

          <SettingsPanel title="Schedule Builder Settings" detail="Schedule status and compact preview preferences.">
            <Field label="Schedule status" value={settings.scheduleStatus} onChange={(value) => update("scheduleStatus", value)} />
            <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event Schedule Builder</Link>
          </SettingsPanel>

          <SettingsPanel title="Live Event Mode Settings" detail="Live room occupancy, current block, learner arrival rail, and operational alert preferences.">
            <Toggle label="Live telemetry reviewed" checked={support.liveTelemetry} onChange={(value) => updateSupport("liveTelemetry", value)} />
            <Toggle label="Operational QA ready" checked={support.qaReady} onChange={(value) => updateSupport("qaReady", value)} />
          </SettingsPanel>

          <SettingsPanel title="Materials/File Cabinet Settings" detail="Materials readiness, file cabinet, case files, doorsign, roster, and recording guide access.">
            <Toggle label="Materials ready" checked={support.materialsReady} onChange={(value) => updateSupport("materialsReady", value)} />
            <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event File Cabinet</Link>
          </SettingsPanel>

          <SettingsPanel title="Staffing/SP Finder Settings" detail="Coverage, hired SPs, backups, sim team lead, and assignment workflow access.">
            <Toggle label="Staffing coverage ready" checked={support.staffingReady} onChange={(value) => updateSupport("staffingReady", value)} />
            <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event SP Finder</Link>
          </SettingsPanel>
        </div>
      </div>
    </SiteShell>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<main className="p-8 text-sm font-bold text-[var(--cfsp-text-muted)]">Loading settings...</main>}>
      <SettingsContent />
    </Suspense>
  );
}
