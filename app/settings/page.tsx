"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";

type SettingsState = {
  eventName: string;
  eventStatus: string;
  eventVisibility: string;
  courseProgram: string;
  facultyContact: string;
  simLead: string;
  planningMode: boolean;
  liveMode: boolean;
  commandCenterDefault: boolean;
  avSupport: boolean;
  simTech: boolean;
  facultyOperator: boolean;
  recording: boolean;
  zoomLogistics: boolean;
  trainingDate: string;
  trainingTime: string;
  trainingLocation: string;
  trainingZoom: string;
  caseMaterialsReady: boolean;
  doorsignReady: boolean;
  communicationChecklist: boolean;
  scheduleStatus: string;
  roomDisplay: string;
  roundDisplay: string;
  staffingReady: boolean;
  qaReady: boolean;
};

type EventTag = "Skills" | "SP" | "HiFi" | "Training" | "Virtual";

const eventTags: EventTag[] = ["Skills", "SP", "HiFi", "Training", "Virtual"];

const defaultSettings: SettingsState = {
  eventName: "",
  eventStatus: "Planning",
  eventVisibility: "Internal",
  courseProgram: "",
  facultyContact: "",
  simLead: "",
  planningMode: true,
  liveMode: true,
  commandCenterDefault: true,
  avSupport: false,
  simTech: false,
  facultyOperator: false,
  recording: false,
  zoomLogistics: false,
  trainingDate: "",
  trainingTime: "",
  trainingLocation: "",
  trainingZoom: "",
  caseMaterialsReady: false,
  doorsignReady: false,
  communicationChecklist: false,
  scheduleStatus: "Not started",
  roomDisplay: "Exam room numbering",
  roundDisplay: "Round number + time",
  staffingReady: false,
  qaReady: false,
};

function asText(value: unknown) {
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
  note,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  note?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface)] px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-black text-[var(--cfsp-text)]">{label}</span>
        {note ? <span className="mt-1 block text-xs font-semibold text-[var(--cfsp-text-muted)]">{note}</span> : null}
      </span>
    </label>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-[var(--cfsp-border)] bg-[var(--cfsp-card-bg)] p-4 shadow-[var(--cfsp-card-glow)]">
      <div>
        <p className="cfsp-kicker">Settings</p>
        <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">{title}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">{description}</p>
      </div>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const eventId = asText(searchParams.get("eventId"));
  const storageKey = useMemo(() => `cfsp-settings:${eventId || "global"}`, [eventId]);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [selectedTags, setSelectedTags] = useState<EventTag[]>([]);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    window.setTimeout(() => {
      if (cancelled) return;
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (!saved) return;
        const parsed = JSON.parse(saved) as Partial<SettingsState> & { selectedTags?: EventTag[] };
        setSettings({ ...defaultSettings, ...parsed });
        setSelectedTags((parsed.selectedTags || []).filter((tag): tag is EventTag => eventTags.includes(tag as EventTag)));
      } catch {
        setSettings(defaultSettings);
        setSelectedTags([]);
      }
    }, 0);
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  function updateSetting<Key extends keyof SettingsState>(key: Key, value: SettingsState[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSavedMessage("");
  }

  function toggleTag(tag: EventTag) {
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
    setSavedMessage("");
  }

  function saveLocalSettings() {
    window.localStorage.setItem(storageKey, JSON.stringify({ ...settings, selectedTags }));
    setSavedMessage(eventId ? "Event settings preferences saved locally." : "Global settings preferences saved locally.");
  }

  return (
    <SiteShell
      title="Settings"
      subtitle="Centralized configuration for event operations. Event-safe controls are local until a workflow already supports persistence."
    >
      <div className="grid gap-5">
        <section
          className="rounded-[24px] border p-5"
          style={{
            borderColor: "rgba(20, 91, 150, 0.18)",
            background:
              "radial-gradient(circle at 8% 0%, rgba(125, 211, 252, 0.22), transparent 34%), linear-gradient(135deg, rgba(247,253,255,0.98), rgba(236,253,245,0.86))",
          }}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="cfsp-kicker">Operations settings</p>
              <h1 className="mt-1 text-2xl font-black text-[#145b96]">Command Station Settings</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#466477]">
                Use this page as the single settings hub. Controls marked local-only are safe preference captures and do not mutate event records until a matching event workflow exists.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {eventId ? (
                <Link href={`/events/${encodeURIComponent(eventId)}`} className="cfsp-btn cfsp-btn-secondary">
                  Back to Event
                </Link>
              ) : null}
              <button type="button" onClick={saveLocalSettings} className="cfsp-btn cfsp-btn-primary">
                Save Local Settings
              </button>
            </div>
          </div>
          {savedMessage ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{savedMessage}</div> : null}
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <SettingsSection title="Event Settings" description="Core event identity and high-level record fields. Persist final record edits from the event page when needed.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Event name/title" value={settings.eventName} onChange={(value) => updateSetting("eventName", value)} placeholder="Event title" />
              <Field label="Status" value={settings.eventStatus} onChange={(value) => updateSetting("eventStatus", value)} placeholder="Planning, Live, Complete" />
              <Field label="Visibility" value={settings.eventVisibility} onChange={(value) => updateSetting("eventVisibility", value)} placeholder="Internal, Public, Archived" />
              <Field label="Course / Program" value={settings.courseProgram} onChange={(value) => updateSetting("courseProgram", value)} placeholder="Program or course" />
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
          </SettingsSection>

          <SettingsSection title="Command Center Settings" description="Preferences for the primary workstation and Planning/Live command behavior.">
            <Toggle label="Open Central Command by default" checked={settings.commandCenterDefault} onChange={(value) => updateSetting("commandCenterDefault", value)} note="Event pages currently force this on for stability." />
            <Toggle label="Planning Mode enabled" checked={settings.planningMode} onChange={(value) => updateSetting("planningMode", value)} />
            <Toggle label="Live Event Mode enabled" checked={settings.liveMode} onChange={(value) => updateSetting("liveMode", value)} />
          </SettingsSection>

          <SettingsSection title="Support Settings" description="Operational support needs surfaced in Command Center readiness panels.">
            <Toggle label="AV support" checked={settings.avSupport} onChange={(value) => updateSetting("avSupport", value)} />
            <Toggle label="Sim tech support" checked={settings.simTech} onChange={(value) => updateSetting("simTech", value)} />
            <Toggle label="Faculty operator" checked={settings.facultyOperator} onChange={(value) => updateSetting("facultyOperator", value)} />
            <Toggle label="Recording support" checked={settings.recording} onChange={(value) => updateSetting("recording", value)} />
            <Toggle label="Zoom / logistics support" checked={settings.zoomLogistics} onChange={(value) => updateSetting("zoomLogistics", value)} />
          </SettingsSection>

          <SettingsSection title="Advanced Settings" description="Record maintenance and admin-oriented preferences. Event saves remain on the event page to avoid accidental mutations.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Faculty / Contact" value={settings.facultyContact} onChange={(value) => updateSetting("facultyContact", value)} />
              <Field label="Sim team / Event lead" value={settings.simLead} onChange={(value) => updateSetting("simLead", value)} />
            </div>
            {eventId ? <Link href={`/events/${encodeURIComponent(eventId)}`} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event Advanced Record</Link> : null}
          </SettingsSection>

          <SettingsSection title="Communication Settings" description="Checklist preferences for hiring, confirmation, training, faculty, and payroll communication.">
            <Toggle label="Communication checklist ready" checked={settings.communicationChecklist} onChange={(value) => updateSetting("communicationChecklist", value)} note="Email drafting remains in the event command window where recipient handlers exist." />
            {eventId ? <Link href={`/events/${encodeURIComponent(eventId)}#communication-center`} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event Email Workflows</Link> : null}
          </SettingsSection>

          <SettingsSection title="Training Settings" description="Training date, time, location, Zoom, recording, and material readiness preferences.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Training date" value={settings.trainingDate} onChange={(value) => updateSetting("trainingDate", value)} placeholder="YYYY-MM-DD or text" />
              <Field label="Training time" value={settings.trainingTime} onChange={(value) => updateSetting("trainingTime", value)} placeholder="Time" />
              <Field label="Training location" value={settings.trainingLocation} onChange={(value) => updateSetting("trainingLocation", value)} placeholder="Room / virtual" />
              <Field label="Zoom / recording link" value={settings.trainingZoom} onChange={(value) => updateSetting("trainingZoom", value)} placeholder="https://..." />
            </div>
          </SettingsSection>

          <SettingsSection title="Schedule Builder Settings" description="Schedule status and display preferences for rooms, rounds, and compact previews.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Schedule status" value={settings.scheduleStatus} onChange={(value) => updateSetting("scheduleStatus", value)} />
              <Field label="Room display" value={settings.roomDisplay} onChange={(value) => updateSetting("roomDisplay", value)} />
              <Field label="Round display" value={settings.roundDisplay} onChange={(value) => updateSetting("roundDisplay", value)} />
            </div>
          </SettingsSection>

          <SettingsSection title="Live Event Mode Settings" description="Local preferences for live flow, occupancy, arrivals, and telemetry.">
            <Toggle label="Show live room occupancy" checked={settings.liveMode} onChange={(value) => updateSetting("liveMode", value)} />
            <Toggle label="Operational QA ready" checked={settings.qaReady} onChange={(value) => updateSetting("qaReady", value)} />
          </SettingsSection>

          <SettingsSection title="Materials/File Cabinet Settings" description="Materials readiness preferences for case files, doorsigns, recordings, and supporting documents.">
            <Toggle label="Case materials ready" checked={settings.caseMaterialsReady} onChange={(value) => updateSetting("caseMaterialsReady", value)} />
            <Toggle label="Doorsign ready" checked={settings.doorsignReady} onChange={(value) => updateSetting("doorsignReady", value)} />
            {eventId ? <Link href={`/events/${encodeURIComponent(eventId)}`} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event File Cabinet</Link> : null}
          </SettingsSection>

          <SettingsSection title="Staffing/SP Finder Settings" description="Staffing readiness, SP Finder, primary/backup workflow, and coverage preferences.">
            <Toggle label="Staffing coverage ready" checked={settings.staffingReady} onChange={(value) => updateSetting("staffingReady", value)} />
            {eventId ? <Link href={`/events/${encodeURIComponent(eventId)}`} className="cfsp-btn cfsp-btn-secondary w-fit">Open Event SP Finder</Link> : null}
          </SettingsSection>
        </div>
      </div>
    </SiteShell>
  );
}
