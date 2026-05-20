"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";
import {
  DEFAULT_CFSP_EMAIL_TEMPLATES,
  renderEmailTemplate,
  type EmailTemplateRecord,
} from "../lib/emailTemplates";
import { formatHumanDate } from "../lib/eventDateUtils";
import { parseEventMetadata } from "../lib/eventMetadata";
import {
  buildSessionChecklist,
  getDefaultSessionChecklistConfig,
  getSessionChecklistConfig,
  parseSessionChecklistState,
  upsertSessionChecklistConfigInNotes,
  type SessionChecklistDueAnchor,
  type SessionChecklistOffsetDirection,
  type SessionChecklistOffsetUnit,
  type SessionChecklistSection,
  type SessionChecklistTaskConfig,
} from "../lib/sessionQaChecklist";

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

type EventSessionRow = {
  session_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type MeResponse = {
  profile?: {
    role?: string | null;
  } | null;
};

type EmailTemplateApiResponse = {
  templates?: EmailTemplateRecord[];
  source?: "defaults" | "database";
  canManage?: boolean;
  warning?: string;
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

function formatSettingsDate(value: string) {
  return formatHumanDate(value) || text(value) || "Event date TBD";
}

function formatSettingsTime(value: string) {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour)) return raw;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function buildTemplatePreviewContext(event: EventEditState, sessions: EventSessionRow[] = []) {
  const metadata = parseEventMetadata(event.notes).training;
  const sortedSessions = [...sessions].sort((a, b) =>
    `${text(a.session_date)} ${text(a.start_time)}`.localeCompare(`${text(b.session_date)} ${text(b.start_time)}`)
  );
  const firstSession = sortedSessions[0] || null;
  const lastSession = sortedSessions[sortedSessions.length - 1] || null;
  const eventDate = formatSettingsDate(event.dateText);
  const eventTime =
    text(metadata.imported_event_times) ||
    [formatSettingsTime(metadata.event_start_time), formatSettingsTime(metadata.event_end_time)].filter(Boolean).join(" - ") ||
    [formatSettingsTime(firstSession?.start_time || ""), formatSettingsTime(lastSession?.end_time || "")].filter(Boolean).join(" - ") ||
    "Event time TBD";
  const isVirtualAccess =
    /\b(vir|virtual|zoom|telehealth|remote)\b/i.test(`${event.name} ${event.location} ${metadata.training_zoom_required}`);
  const locationAccess =
    (isVirtualAccess ? text(metadata.zoom_url) || text(metadata.training_zoom_link) : "") ||
    text(event.location) ||
    text(metadata.zoom_url) ||
    text(metadata.training_zoom_link) ||
    "Location / access TBD";
  const faculty = text(metadata.faculty_email) || text(metadata.faculty_names) || "Faculty contact TBD";
  const senderName = text(metadata.sim_contact) || "CFSP Simulation Operations";
  const senderEmail = "sender@example.edu";

  return {
    eventName: event.name || "NURS Simulation Event",
    eventDate,
    eventDates: eventDate,
    eventTime,
    eventLocation: locationAccess,
    caseName: text(metadata.case_name) || "Case / Role TBD",
    simStaff: text(metadata.sim_contact) || "Simulation Operations",
    faculty,
    trainingDate: formatSettingsDate(metadata.training_date || metadata.imported_training_date || metadata.preferred_training_date),
    trainingTime:
      [formatSettingsTime(metadata.training_start_time), formatSettingsTime(metadata.training_end_time)].filter(Boolean).join(" - ") ||
      text(metadata.imported_training_time) ||
      text(metadata.preferred_training_time) ||
      "Training time TBD",
    trainingZoomLink: text(metadata.training_zoom_link) || text(metadata.zoom_url) || "Training access TBD",
    spFirstName: "Alex",
    spFullName: "Alex Standardized Patient",
    spEmails: "sp-list-hidden-in-bcc@example.edu",
    universityName: "Drexel University",
    programName: text(metadata.faculty_program) || "CFSP",
    senderName,
    senderTitle: "Simulation Operations",
    senderEmail,
    generalStaffSignature: `${senderName}\n${senderEmail}`,
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

const blankTemplate: EmailTemplateRecord = {
  name: "",
  category: "training",
  university_name: "CFSP",
  program_name: "",
  subject_template: "",
  body_template: "",
  body_format: "plain_text",
  default_to: "{{senderEmail}}",
  default_cc: "{{faculty}}",
  default_bcc: "{{spEmails}}",
  default_from_label: "{{senderName}}",
  is_active: true,
};

function parseLooseDate(value: string) {
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (normalized) {
    const date = new Date(`${normalized[1]}-${normalized[2]}-${normalized[3]}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateTime(dateText: string, timeText: string) {
  const date = parseLooseDate(dateText);
  if (!date) return null;
  const rawTime = text(timeText);
  if (!rawTime) return date;
  const match = rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return date;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return date;
  const next = new Date(date.getTime());
  next.setHours(hour, minute, 0, 0);
  return next;
}

function SessionChecklistManager({
  canEdit,
  eventId,
  eventNotes,
  eventDateText,
  sessions,
  onNotesChange,
}: {
  canEdit: boolean;
  eventId: string;
  eventNotes: string;
  eventDateText: string;
  sessions: EventSessionRow[];
  onNotesChange: (nextNotes: string) => void;
}) {
  const [configDraft, setConfigDraft] = useState<SessionChecklistTaskConfig[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const loaded = getSessionChecklistConfig(eventNotes);
    setConfigDraft(loaded);
    setDirty(false);
  }, [eventNotes]);

  const checklistState = useMemo(() => parseSessionChecklistState(eventNotes), [eventNotes]);
  const trainingMetadata = useMemo(() => parseEventMetadata(eventNotes).training, [eventNotes]);
  const orderedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        `${text(a.session_date)} ${text(a.start_time)}`.localeCompare(`${text(b.session_date)} ${text(b.start_time)}`)
      ),
    [sessions]
  );
  const firstSession = orderedSessions[0] || null;
  const lastSession = orderedSessions[orderedSessions.length - 1] || null;
  const trainingDate =
    parseLooseDate(trainingMetadata.training_date || trainingMetadata.preferred_training_date || trainingMetadata.imported_training_date) || null;
  const eventDate = parseLooseDate(firstSession?.session_date || eventDateText) || null;
  const eventStart =
    parseDateTime(
      firstSession?.session_date || eventDateText,
      firstSession?.start_time || trainingMetadata.event_start_time || ""
    ) || null;
  const eventEnd =
    parseDateTime(
      lastSession?.session_date || firstSession?.session_date || eventDateText,
      lastSession?.end_time || trainingMetadata.event_end_time || ""
    ) || null;

  const preview = useMemo(
    () =>
      buildSessionChecklist(configDraft, checklistState, {
        trainingDate,
        eventDate,
        eventStart,
        eventEnd,
      }),
    [checklistState, configDraft, eventDate, eventEnd, eventStart, trainingDate]
  );

  const sectionOptions: Array<{ value: SessionChecklistSection; label: string }> = [
    { value: "planning", label: "Planning" },
    { value: "day_of", label: "Day-of" },
  ];
  const anchorOptions: Array<{ value: SessionChecklistDueAnchor; label: string }> = [
    { value: "training_date", label: "Training Date" },
    { value: "event_date", label: "Event Date" },
    { value: "event_start", label: "Event Start" },
    { value: "event_end", label: "Event End" },
  ];
  const unitOptions: Array<{ value: SessionChecklistOffsetUnit; label: string }> = [
    { value: "minutes", label: "Minutes" },
    { value: "hours", label: "Hours" },
    { value: "days", label: "Days" },
  ];
  const directionOptions: Array<{ value: SessionChecklistOffsetDirection; label: string }> = [
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
  ];

  function updateTask(taskId: string, patch: Partial<SessionChecklistTaskConfig>) {
    setConfigDraft((current) =>
      current.map((task) => (task.taskId === taskId ? { ...task, ...patch } : task))
    );
    setDirty(true);
    setMessage("");
    setError("");
  }

  function reorderTask(taskId: string, direction: "up" | "down") {
    setConfigDraft((current) => {
      const index = current.findIndex((task) => task.taskId === taskId);
      if (index < 0) return current;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next.map((task, taskIndex) => ({ ...task, sortOrder: taskIndex }));
    });
    setDirty(true);
    setMessage("");
    setError("");
  }

  function removeTask(taskId: string) {
    setConfigDraft((current) =>
      current
        .filter((task) => task.taskId !== taskId)
        .map((task, index) => ({ ...task, sortOrder: index }))
    );
    setDirty(true);
    setMessage("");
    setError("");
  }

  function addTask(section: SessionChecklistSection) {
    setConfigDraft((current) => {
      const nextId = `qa-task-${Date.now()}`;
      return [
        ...current,
        {
          taskId: nextId,
          section,
          label: "New checklist task",
          dueAnchor: section === "planning" ? "event_date" : "event_start",
          offsetValue: section === "planning" ? 2 : 0,
          offsetUnit: section === "planning" ? "days" : "minutes",
          offsetDirection: "before",
          active: true,
          owner: "",
          notes: "",
          sortOrder: current.length,
          required: true,
        },
      ];
    });
    setDirty(true);
    setMessage("");
    setError("");
  }

  async function saveChecklistConfig() {
    if (!eventId) {
      setError("Select an event before saving checklist settings.");
      return;
    }
    if (!canEdit) {
      setError("Admin or Sim Ops access is required to edit checklist settings.");
      return;
    }

    const normalizedConfig = configDraft.map((task, index) => ({
      ...task,
      label: text(task.label) || "Untitled task",
      offsetValue: Number.isFinite(Number(task.offsetValue)) ? Math.max(0, Math.floor(Number(task.offsetValue))) : 0,
      sortOrder: index,
    }));

    setSaving(true);
    setMessage("");
    setError("");
    try {
      const nextNotes = upsertSessionChecklistConfigInNotes(eventNotes, normalizedConfig);
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_updates: {
            notes: nextNotes,
          },
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || "Could not save checklist settings.");
      }
      onNotesChange(nextNotes);
      setConfigDraft(normalizedConfig);
      setDirty(false);
      setMessage("Checklist settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save checklist settings.");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setConfigDraft(getDefaultSessionChecklistConfig());
    setDirty(true);
    setMessage("");
    setError("");
  }

  return (
    <section id="session-checklist" className="rounded-[22px] border border-[var(--cfsp-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="cfsp-kicker">Event Setup</p>
          <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">Session Checklist Settings</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">
            Configure Planning and Day-of operational tasks that drive the QA board in Event Command Center.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addTask("planning")}
            disabled={!canEdit}
            className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Planning Task
          </button>
          <button
            type="button"
            onClick={() => addTask("day_of")}
            disabled={!canEdit}
            className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add Day-of Task
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            disabled={!canEdit}
            className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={() => void saveChecklistConfig()}
            disabled={!dirty || saving || !canEdit}
            className="cfsp-btn cfsp-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Checklist"}
          </button>
        </div>
      </div>

      {message ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}
      {!canEdit ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          Read-only. Admin or Sim Ops access is required to edit checklist settings.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {configDraft.map((task, index) => {
          const resolvedTask = preview.tasks.find((row) => row.taskId === task.taskId);
          return (
            <article key={task.taskId} className="rounded-2xl border border-[var(--cfsp-border)] bg-slate-50 p-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Task name" value={task.label} onChange={(value) => updateTask(task.taskId, { label: value })} />
                <Field label="Owner / role" value={task.owner} onChange={(value) => updateTask(task.taskId, { owner: value })} />
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Section</span>
                  <select
                    value={task.section}
                    onChange={(event) => updateTask(task.taskId, { section: event.target.value as SessionChecklistSection })}
                    className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
                  >
                    {sectionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Due anchor</span>
                  <select
                    value={task.dueAnchor}
                    onChange={(event) => updateTask(task.taskId, { dueAnchor: event.target.value as SessionChecklistDueAnchor })}
                    className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
                  >
                    {anchorOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Offset value</span>
                  <input
                    type="number"
                    min={0}
                    value={task.offsetValue}
                    onChange={(event) => updateTask(task.taskId, { offsetValue: Number(event.target.value || 0) })}
                    className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Offset unit</span>
                  <select
                    value={task.offsetUnit}
                    onChange={(event) => updateTask(task.taskId, { offsetUnit: event.target.value as SessionChecklistOffsetUnit })}
                    className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
                  >
                    {unitOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Before / after</span>
                  <select
                    value={task.offsetDirection}
                    onChange={(event) => updateTask(task.taskId, { offsetDirection: event.target.value as SessionChecklistOffsetDirection })}
                    className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
                  >
                    {directionOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-black text-[var(--cfsp-text)]">
                  <input
                    type="checkbox"
                    checked={task.active !== false}
                    onChange={(event) => updateTask(task.taskId, { active: event.target.checked })}
                  />
                  Active task
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-black text-[var(--cfsp-text)]">
                  <input
                    type="checkbox"
                    checked={task.required !== false}
                    onChange={(event) => updateTask(task.taskId, { required: event.target.checked })}
                  />
                  Required for readiness
                </label>
                <div className="lg:col-span-2">
                  <TextAreaField
                    label="Task notes"
                    value={task.notes}
                    onChange={(value) => updateTask(task.taskId, { notes: value })}
                    placeholder="Optional context for operators."
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--cfsp-text-muted)]">
                <span>Status preview: {resolvedTask?.statusLabel || "Upcoming"}</span>
                <span>•</span>
                <span>{resolvedTask?.dueRuleLabel || "Due rule pending"}</span>
                <span>•</span>
                <span>{resolvedTask?.dueAtLabel || "Date needed"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => reorderTask(task.taskId, "up")} disabled={index === 0 || !canEdit} className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  Move Up
                </button>
                <button type="button" onClick={() => reorderTask(task.taskId, "down")} disabled={index === configDraft.length - 1 || !canEdit} className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  Move Down
                </button>
                <button type="button" onClick={() => removeTask(task.taskId)} disabled={!canEdit} className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  Delete
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EmailTemplatesManager({ canEdit, event, sessions }: { canEdit: boolean; event: EventEditState; sessions: EventSessionRow[] }) {
  const [templates, setTemplates] = useState<EmailTemplateRecord[]>(DEFAULT_CFSP_EMAIL_TEMPLATES);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<EmailTemplateRecord>(blankTemplate);
  const [source, setSource] = useState<"defaults" | "database">("defaults");
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/email-templates", { cache: "no-store" });
        const payload = await response.json().catch(() => null) as EmailTemplateApiResponse | null;
        const nextTemplates = Array.isArray(payload?.templates) && payload.templates.length
          ? payload.templates
          : DEFAULT_CFSP_EMAIL_TEMPLATES;
        if (!cancelled) {
          setTemplates(nextTemplates);
          setCanManage(Boolean(payload?.canManage));
          setSource(payload?.source === "database" ? "database" : "defaults");
          if (payload?.warning) setError(payload.warning);
          const first = nextTemplates[0] || blankTemplate;
          setSelectedId(first.id || first.name);
          setDraft(first);
        }
      } catch (loadError) {
        if (!cancelled) {
          setTemplates(DEFAULT_CFSP_EMAIL_TEMPLATES);
          setSource("defaults");
          setError(loadError instanceof Error ? loadError.message : "Could not load templates.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTemplates();

    return () => {
      cancelled = true;
    };
  }, []);

  function selectTemplate(template: EmailTemplateRecord) {
    setSelectedId(template.id || template.name);
    setDraft({ ...template });
    setMessage("");
    setError("");
  }

  function update<K extends keyof EmailTemplateRecord>(key: K, value: EmailTemplateRecord[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  async function saveTemplate(nextDraft = draft, duplicate = false) {
    if (!canEdit || !canManage) {
      setError("Admin or Sim Ops access is required to manage email templates.");
      return;
    }
    if (!text(nextDraft.name) || !text(nextDraft.subject_template) || !text(nextDraft.body_template)) {
      setError("Template name, subject, and body are required.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    const payload = duplicate
      ? { ...nextDraft, id: undefined, name: `${nextDraft.name} Copy` }
      : nextDraft;

    try {
      const response = await fetch("/api/email-templates", {
        method: duplicate || !payload.id ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null) as { template?: EmailTemplateRecord; error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Could not save template.");
      const saved = body?.template;
      if (!saved) throw new Error("Template was saved but not returned.");

      setTemplates((current) => {
        const withoutSaved = current.filter((template) => template.id !== saved.id);
        return [...withoutSaved, saved].sort((a, b) => `${a.category || ""}${a.name}`.localeCompare(`${b.category || ""}${b.name}`));
      });
      setDraft(saved);
      setSelectedId(saved.id || saved.name);
      setSource("database");
      setMessage(duplicate ? "Template duplicated." : "Template saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save template.");
    } finally {
      setSaving(false);
    }
  }

  const previewContext = buildTemplatePreviewContext(event, sessions);
  const preview = renderEmailTemplate(draft, {
    ...previewContext,
    universityName: draft.university_name || previewContext.universityName,
    programName: draft.program_name || previewContext.programName,
  });

  return (
    <section id="email-templates" className="rounded-[22px] border border-[var(--cfsp-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="cfsp-kicker">Communication Settings</p>
          <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">Email Templates</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">
            Manage reusable CFSP plain-text templates with merge fields. SP recipient lists stay in Bcc when event drafts open.
          </p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#466477]">
            Source: {source === "database" ? "Saved database templates" : "Built-in defaults"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedId("new");
            setDraft(blankTemplate);
            setMessage("");
            setError("");
          }}
          disabled={!canEdit || !canManage}
          className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add Template
        </button>
      </div>

      {loading ? <p className="mt-4 text-sm font-bold text-[var(--cfsp-text-muted)]">Loading templates...</p> : null}
      {message ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{error}</div> : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)]">
        <div className="grid gap-2 self-start">
          {templates.map((template) => {
            const key = template.id || template.name;
            const selected = selectedId === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectTemplate(template)}
                className="rounded-xl border px-3 py-2 text-left transition"
                style={{
                  borderColor: selected ? "rgba(20,91,150,0.48)" : "var(--cfsp-border)",
                  background: selected ? "linear-gradient(135deg, rgba(224,242,254,0.92), rgba(236,253,245,0.9))" : "#fff",
                }}
              >
                <span className="block text-sm font-black text-[var(--cfsp-text)]">{template.name}</span>
                <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">
                  {template.category || "uncategorized"} · {template.is_active === false ? "Inactive" : "Active"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Template name" value={draft.name} onChange={(value) => update("name", value)} />
            <Field label="Category / type" value={draft.category || ""} onChange={(value) => update("category", value)} />
            <Field label="University ownership" value={draft.university_name || ""} onChange={(value) => update("university_name", value)} />
            <Field label="Program ownership" value={draft.program_name || ""} onChange={(value) => update("program_name", value)} />
            <Field label="Default To" value={draft.default_to || ""} onChange={(value) => update("default_to", value)} />
            <Field label="Default Cc" value={draft.default_cc || ""} onChange={(value) => update("default_cc", value)} />
            <Field label="Default Bcc" value={draft.default_bcc || ""} onChange={(value) => update("default_bcc", value)} />
            <Field label="From label" value={draft.default_from_label || ""} onChange={(value) => update("default_from_label", value)} />
          </div>
          <Field label="Subject template" value={draft.subject_template} onChange={(value) => update("subject_template", value)} />
          <TextAreaField label="Body template" value={draft.body_template} onChange={(value) => update("body_template", value)} />
          <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
            <input type="checkbox" checked={draft.is_active !== false} onChange={(event) => update("is_active", event.target.checked)} />
            Active template
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveTemplate()} disabled={saving || !canEdit || !canManage} className="cfsp-btn cfsp-btn-primary disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving..." : "Save Template"}
            </button>
            <button type="button" onClick={() => void saveTemplate(draft, true)} disabled={saving || !canEdit || !canManage} className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
              Duplicate
            </button>
            <button type="button" onClick={() => void saveTemplate({ ...draft, is_active: false })} disabled={saving || !canEdit || !canManage || draft.is_active === false} className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
              Deactivate
            </button>
          </div>
          <div className="rounded-2xl border border-[var(--cfsp-border)] bg-slate-50 p-3">
            <p className="cfsp-kicker">Preview with current event data</p>
            <div className="mt-2 text-sm font-black text-[var(--cfsp-text)]">Subject: {preview.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-xs font-semibold leading-5 text-slate-700">{preview.body}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const eventId = text(searchParams.get("eventId"));
  const eventHref = useMemo(() => (eventId ? `/events/${encodeURIComponent(eventId)}` : "/events"), [eventId]);

  const [eventEdit, setEventEdit] = useState<EventEditState>(initialEvent);
  const [eventSessions, setEventSessions] = useState<EventSessionRow[]>([]);
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
          setEventSessions(Array.isArray((eventPayload as { sessions?: unknown }).sessions) ? ((eventPayload as { sessions?: EventSessionRow[] }).sessions || []) : []);
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
          event_updates: {
            name: eventEdit.name,
            status: eventEdit.status,
            visibility: eventEdit.visibility,
            location: eventEdit.location,
            sp_needed: eventEdit.spNeeded ? Number(eventEdit.spNeeded) : null,
            date_text: eventEdit.dateText,
            notes: eventEdit.notes,
          },
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
            <div className="xl:col-span-2">
              <EmailTemplatesManager canEdit={canEdit} event={eventEdit} sessions={eventSessions} />
            </div>
            <div className="xl:col-span-2">
              <SessionChecklistManager
                canEdit={canEdit}
                eventId={eventId}
                eventNotes={eventEdit.notes}
                eventDateText={eventEdit.dateText}
                sessions={eventSessions}
                onNotesChange={(nextNotes) => setEventEdit((current) => ({ ...current, notes: nextNotes }))}
              />
            </div>

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

            <Panel title="Faculty Requests" detail="Track exactly what faculty requested for this event.">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nfaculty_requested_recording: ${e.target.checked ? "yes" : "no"}`)} />
                  Recording requested
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nfaculty_requested_zoom: ${e.target.checked ? "yes" : "no"}`)} />
                  Zoom / telehealth requested
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nfaculty_requested_av: ${e.target.checked ? "yes" : "no"}`)} />
                  AV requested
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nfaculty_requested_sim_tech: ${e.target.checked ? "yes" : "no"}`)} />
                  Sim tech requested
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nfaculty_requested_door_sign: ${e.target.checked ? "yes" : "no"}`)} />
                  Door sign requested
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nfaculty_requested_case_materials: ${e.target.checked ? "yes" : "no"}`)} />
                  Case/materials requested
                </label>
              </div>
              <Field label="Faculty contact" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nfaculty_contact: ${value}`)} />
              <Field label="Faculty email" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nfaculty_email: ${value}`)} />
              <TextAreaField label="Faculty request notes" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nfaculty_request_notes: ${value}`)} />
            </Panel>

            <Panel title="Staffing Requirements" detail="Configure SP hiring and staffing needs for this event.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Backups needed" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nbackups_needed: ${value}`)} />
                <Field label="SP portrayal / role notes" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nsp_role_notes: ${value}`)} />
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\npt_preferred: ${e.target.checked ? "yes" : "no"}`)} />
                  PT preferred
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nspanish_speaking_needed: ${e.target.checked ? "yes" : "no"}`)} />
                  Spanish-speaking SP needed
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\ntelehealth_capable_needed: ${e.target.checked ? "yes" : "no"}`)} />
                  Telehealth-capable SP needed
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nstaffing_ready: ${e.target.checked ? "yes" : "no"}`)} />
                  Staffing ready
                </label>
              </div>
              <TextAreaField label="Hiring / staffing notes" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nstaffing_notes: ${value}`)} />
            </Panel>

            <Panel title="Room & Simulation Setup" detail="Capture the room setup, sim equipment, moulage, and operational layout needs.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Room list" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nroom_list: ${value}`)} />
                <Field label="Room count" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nroom_count: ${value}`)} />
                <Field label="Equipment needs" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nequipment_needs: ${value}`)} />
                <Field label="Simulator / manikin needs" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nsimulator_needs: ${value}`)} />
                <Field label="Task trainer needs" value="" onChange={(value) => update("notes", `${eventEdit.notes}\ntask_trainer_needs: ${value}`)} />
                <Field label="Moulage needs" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nmoulage_needs: ${value}`)} />
              </div>
            </Panel>

            <Panel title="Training, Materials & Tech" detail="Readiness controls for training, prep materials, recording, Zoom, and SimulationIQ.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Training date/time" value="" onChange={(value) => update("notes", `${eventEdit.notes}\ntraining_datetime: ${value}`)} />
                <Field label="Training location / Zoom" value="" onChange={(value) => update("notes", `${eventEdit.notes}\ntraining_location_zoom: ${value}`)} />
                <Field label="Training recording link" value="" onChange={(value) => update("notes", `${eventEdit.notes}\ntraining_recording_link: ${value}`)} />
                <Field label="SimulationIQ / recording status" value="" onChange={(value) => update("notes", `${eventEdit.notes}\nrecording_status: ${value}`)} />
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\ntraining_required: ${e.target.checked ? "yes" : "no"}`)} />
                  Training required
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\nmaterials_ready: ${e.target.checked ? "yes" : "no"}`)} />
                  Materials ready
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\ndoor_sign_ready: ${e.target.checked ? "yes" : "no"}`)} />
                  Door sign ready
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" onChange={(e) => update("notes", `${eventEdit.notes}\ncase_file_ready: ${e.target.checked ? "yes" : "no"}`)} />
                  Case file ready
                </label>
              </div>
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
