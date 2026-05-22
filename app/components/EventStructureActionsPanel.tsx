"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildDefaultFollowUpEventName,
  DEFAULT_FOLLOW_UP_COPY_OPTIONS,
  FOLLOW_UP_COPY_OPTION_LABELS,
  FOLLOW_UP_STATUS_OPTIONS,
  FOLLOW_UP_VISIBILITY_OPTIONS,
  stripCfspMetadataBlocks,
  type FollowUpCopyOptions,
} from "../lib/followUpSimulation";
import { parseEventMetadata } from "../lib/eventMetadata";

type EventStructureSession = {
  session_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
};

type CloneActionMode = "duplicate" | "follow_up";
type StructureActionModal = CloneActionMode | "add_day" | null;

type CloneDraft = {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  status: string;
  visibility: string;
  notes: string;
  copyOptions: FollowUpCopyOptions;
};

type AddDayDraft = {
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  copyDayStructure: boolean;
  sourceDay: number;
  copyScheduleRhythm: boolean;
  copyCases: boolean;
  copySpAssignments: boolean;
  copyLearnerGroups: boolean;
  copyRoomStructure: boolean;
};

type EventStructureActionsPanelProps = {
  eventId: string;
  eventName: string;
  eventLocation?: string | null;
  eventVisibility?: string | null;
  eventNotes?: string | null;
  sessions?: EventStructureSession[];
  canManage: boolean;
  variant?: "command-center" | "settings";
  onDataChanged?: () => Promise<void> | void;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toTimeInputValue(value: string | null | undefined) {
  const text = asText(value);
  if (!text) return "";
  const match = text.match(/^(\d{2}):(\d{2})/);
  if (!match) return "";
  return `${match[1]}:${match[2]}`;
}

function addOneDay(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setDate(parsed.getDate() + 1);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function sortSessions(sessions: EventStructureSession[]) {
  return [...sessions].sort((a, b) =>
    `${asText(a.session_date)} ${asText(a.start_time)}`.localeCompare(`${asText(b.session_date)} ${asText(b.start_time)}`)
  );
}

export default function EventStructureActionsPanel({
  eventId,
  eventName,
  eventLocation,
  eventVisibility,
  eventNotes,
  sessions = [],
  canManage,
  variant = "command-center",
  onDataChanged,
}: EventStructureActionsPanelProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<StructureActionModal>(null);
  const [cloneDraft, setCloneDraft] = useState<CloneDraft | null>(null);
  const [addDayDraft, setAddDayDraft] = useState<AddDayDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cloneSuccess, setCloneSuccess] = useState<{ label: string; name: string; redirectUrl: string } | null>(null);
  const [addDaySuccess, setAddDaySuccess] = useState<{ nextDay: number; builderUrl: string; date: string } | null>(null);

  const sortedSessions = useMemo(() => sortSessions(sessions), [sessions]);
  const firstSession = sortedSessions[0] || null;
  const lastSession = sortedSessions[sortedSessions.length - 1] || null;
  const visibleNotes = useMemo(() => stripCfspMetadataBlocks(eventNotes), [eventNotes]);
  const scheduleStatus = useMemo(() => asText(parseEventMetadata(eventNotes).training.schedule_status).toLowerCase(), [eventNotes]);

  const sourceDayOptions = useMemo(() => {
    const uniqueDates = Array.from(new Set(sortedSessions.map((session) => asText(session.session_date)).filter(Boolean)));
    return uniqueDates.map((date, index) => ({
      day: index + 1,
      date,
      label: `Day ${index + 1}${date ? ` · ${date}` : ""}`,
    }));
  }, [sortedSessions]);

  function buildDefaultCloneDraft(mode: CloneActionMode): CloneDraft {
    return {
      name: mode === "duplicate" ? `Copy of ${eventName || "Simulation Event"}` : buildDefaultFollowUpEventName(eventName),
      date: asText(firstSession?.session_date),
      startTime: toTimeInputValue(firstSession?.start_time),
      endTime: toTimeInputValue(lastSession?.end_time || firstSession?.end_time),
      location: asText(eventLocation || firstSession?.location),
      status: FOLLOW_UP_STATUS_OPTIONS[0]?.value || "Planning",
      visibility: asText(eventVisibility) || FOLLOW_UP_VISIBILITY_OPTIONS[0]?.value || "team",
      notes: visibleNotes,
      copyOptions: DEFAULT_FOLLOW_UP_COPY_OPTIONS,
    };
  }

  function buildDefaultAddDayDraft(): AddDayDraft {
    return {
      date: addOneDay(asText(lastSession?.session_date || firstSession?.session_date)),
      startTime: toTimeInputValue(firstSession?.start_time),
      endTime: toTimeInputValue(lastSession?.end_time || firstSession?.end_time),
      location: asText(eventLocation || firstSession?.location),
      notes: "",
      copyDayStructure: true,
      sourceDay: sourceDayOptions[0]?.day || 1,
      copyScheduleRhythm: true,
      copyCases: true,
      copySpAssignments: true,
      copyLearnerGroups: true,
      copyRoomStructure: true,
    };
  }

  function openCloneModal(mode: CloneActionMode) {
    setErrorMessage("");
    setCloneSuccess(null);
    setAddDaySuccess(null);
    setCloneDraft(buildDefaultCloneDraft(mode));
    setActiveModal(mode);
  }

  function openAddDayModal() {
    setErrorMessage("");
    setCloneSuccess(null);
    setAddDaySuccess(null);
    setAddDayDraft(buildDefaultAddDayDraft());
    setActiveModal("add_day");
  }

  function closeModal() {
    if (saving) return;
    setActiveModal(null);
  }

  async function refreshIfNeeded() {
    await onDataChanged?.();
  }

  async function submitClone(mode: CloneActionMode) {
    if (!cloneDraft) return;
    if (!cloneDraft.name.trim()) {
      setErrorMessage(mode === "duplicate" ? "Enter a name for the duplicated event." : "Enter a name for the follow-up simulation.");
      return;
    }
    if (!cloneDraft.date.trim()) {
      setErrorMessage("Choose a date for the new event.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const endpoint = mode === "duplicate" ? "duplicate" : "create-follow-up";
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cloneDraft),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            event?: { id?: string; name?: string | null } | null;
            redirectUrl?: string;
          }
        | null;
      if (!response.ok || !body?.redirectUrl) {
        throw new Error(body?.error || `Could not ${mode === "duplicate" ? "duplicate" : "create"} this event.`);
      }

      await refreshIfNeeded();
      setCloneSuccess({
        label: mode === "duplicate" ? "Duplicate event created" : "Follow-up simulation created",
        name: asText(body.event?.name) || cloneDraft.name,
        redirectUrl: body.redirectUrl,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create the new event.");
    } finally {
      setSaving(false);
    }
  }

  async function submitAddDay() {
    if (!addDayDraft) return;
    if (!addDayDraft.date.trim()) {
      setErrorMessage("Choose the extra event date.");
      return;
    }

    if (scheduleStatus === "complete") {
      const confirmed = window.confirm(
        "Add date to completed event?\n\nThis will add a new day to the same event. Existing completed days will not be changed."
      );
      if (!confirmed) return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/add-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addDayDraft),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            nextDay?: number;
            builderUrl?: string;
            date?: string;
          }
        | null;
      if (!response.ok || !body?.builderUrl || !body?.nextDay) {
        throw new Error(body?.error || "Could not add the extra event date.");
      }

      await refreshIfNeeded();
      setAddDaySuccess({
        nextDay: body.nextDay,
        builderUrl: body.builderUrl,
        date: body.date || addDayDraft.date,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not add the extra event date.");
    } finally {
      setSaving(false);
    }
  }

  const panelStyle =
    variant === "settings"
      ? {
          border: "1px solid rgba(20, 91, 150, 0.18)",
          background: "linear-gradient(135deg, rgba(247,253,255,0.98), rgba(236,253,245,0.86))",
        }
      : {
          border: "1px solid rgba(20, 91, 150, 0.2)",
          background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(239,246,255,0.92))",
          boxShadow: "0 14px 30px rgba(24, 52, 78, 0.08)",
        };

  if (!canManage) return null;

  return (
    <>
      <section className="rounded-[18px] p-4" style={panelStyle}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="cfsp-kicker">Event Structure</div>
            <h2 className="mt-1 text-[1.25rem] font-black text-[var(--cfsp-text)]">Event Structure Actions</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">
              Duplicate this event, create a related follow-up simulation, or add an extra day to the same event. These controls copy structure, not live completion state.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openCloneModal("duplicate")} className="cfsp-btn cfsp-btn-secondary">
              Duplicate Event
            </button>
            <button type="button" onClick={() => openCloneModal("follow_up")} className="cfsp-btn cfsp-btn-primary">
              Create Follow-Up Simulation
            </button>
            <button type="button" onClick={openAddDayModal} className="cfsp-btn cfsp-btn-secondary">
              Add Extra Date
            </button>
          </div>
        </div>
      </section>

      {activeModal ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 84,
            background: "rgba(5, 21, 34, 0.78)",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            color: "var(--cfsp-text)",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(920px, 100%)",
              maxHeight: "calc(100vh - 48px)",
              borderRadius: "16px",
              border: "1px solid rgba(148, 163, 184, 0.24)",
              background: "var(--cfsp-surface)",
              boxShadow: "0 24px 55px rgba(3, 10, 20, 0.42)",
              display: "grid",
              gap: "12px",
              padding: "18px",
              overflow: "auto",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 900 }}>
                  {activeModal === "duplicate"
                    ? "Duplicate Event"
                    : activeModal === "follow_up"
                      ? "Create Follow-Up Simulation"
                      : "Add Extra Date"}
                </h2>
                <p style={{ margin: "6px 0 0", color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "13px", lineHeight: 1.5 }}>
                  {activeModal === "duplicate"
                    ? "Create a clean copy of this event with copied structure and cleared live state."
                    : activeModal === "follow_up"
                      ? "Create a related next simulation with the same students, SPs, cases, and rotation structure."
                      : "Add another day to this same event without overwriting existing completed schedule days."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
              >
                Close
              </button>
            </div>

            {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

            {cloneSuccess ? (
              <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-sm font-black text-emerald-800">{cloneSuccess.label}</div>
                <div className="mt-1 text-xs font-semibold text-emerald-700">{cloneSuccess.name}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={cloneSuccess.redirectUrl} className="cfsp-btn cfsp-btn-primary">
                    Open New Event
                  </Link>
                  <button type="button" onClick={() => router.push(cloneSuccess.redirectUrl)} className="cfsp-btn cfsp-btn-secondary">
                    Redirect Now
                  </button>
                </div>
              </div>
            ) : null}

            {addDaySuccess ? (
              <div className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-sm font-black text-emerald-800">Extra date added</div>
                <div className="mt-1 text-xs font-semibold text-emerald-700">
                  Day {addDaySuccess.nextDay} · {addDaySuccess.date}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={addDaySuccess.builderUrl} className="cfsp-btn cfsp-btn-primary">
                    Open New Schedule Day
                  </Link>
                  <button type="button" onClick={() => router.push(addDaySuccess.builderUrl)} className="cfsp-btn cfsp-btn-secondary">
                    Open Builder Now
                  </button>
                </div>
              </div>
            ) : null}

            {(activeModal === "duplicate" || activeModal === "follow_up") && cloneDraft ? (
              <>
                <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">New event name</span>
                    <input value={cloneDraft.name} onChange={(event) => setCloneDraft((current) => current ? { ...current, name: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Date</span>
                    <input type="date" value={cloneDraft.date} onChange={(event) => setCloneDraft((current) => current ? { ...current, date: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Start time</span>
                    <input type="time" value={cloneDraft.startTime} onChange={(event) => setCloneDraft((current) => current ? { ...current, startTime: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">End time</span>
                    <input type="time" value={cloneDraft.endTime} onChange={(event) => setCloneDraft((current) => current ? { ...current, endTime: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Location</span>
                    <input value={cloneDraft.location} onChange={(event) => setCloneDraft((current) => current ? { ...current, location: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Status</span>
                    <select value={cloneDraft.status} onChange={(event) => setCloneDraft((current) => current ? { ...current, status: event.target.value } : current)} disabled={saving} className="cfsp-input">
                      {FOLLOW_UP_STATUS_OPTIONS.map((option) => (
                        <option key={`${activeModal}-status-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Visibility</span>
                    <select value={cloneDraft.visibility} onChange={(event) => setCloneDraft((current) => current ? { ...current, visibility: event.target.value } : current)} disabled={saving} className="cfsp-input">
                      {FOLLOW_UP_VISIBILITY_OPTIONS.map((option) => (
                        <option key={`${activeModal}-visibility-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                    <span className="cfsp-label">Notes</span>
                    <textarea value={cloneDraft.notes} onChange={(event) => setCloneDraft((current) => current ? { ...current, notes: event.target.value } : current)} disabled={saving} className="cfsp-input" style={{ minHeight: 120 }} />
                  </label>
                </div>

                <section
                  className="rounded-[14px] px-4 py-3"
                  style={{
                    border: "1px solid rgba(20, 91, 150, 0.16)",
                    background: "rgba(20, 91, 150, 0.05)",
                  }}
                >
                  <div className="cfsp-label">Copy options</div>
                  <div className="mt-1 text-[11px] font-semibold text-[var(--cfsp-text-muted)]">
                    IMPORTANT FOLLOW-UP SIMULATION GUARD:
                    Follow-up simulations copy operational structure, not live completion state. Do not copy attendance, delivered announcements, completed checklist state, or old live event statuses into the new event.
                  </div>
                  <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", marginTop: "10px" }}>
                    {(Object.keys(FOLLOW_UP_COPY_OPTION_LABELS) as Array<keyof FollowUpCopyOptions>).map((optionKey) => {
                      const isDisabled =
                        (optionKey === "copyLearnerRoster" && cloneDraft.copyOptions.copyScheduleStructure) ||
                        (optionKey === "copyAnnouncementSchedule" && !cloneDraft.copyOptions.copyScheduleStructure) ||
                        (optionKey === "createCompletedSchedule" && !cloneDraft.copyOptions.copyScheduleStructure);
                      return (
                        <label
                          key={`${activeModal}-copy-${optionKey}`}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            borderRadius: "12px",
                            border: "1px solid rgba(99, 181, 217, 0.14)",
                            background: "rgba(255,255,255,0.84)",
                            padding: "10px 12px",
                            color: "var(--cfsp-text)",
                            fontSize: "13px",
                            fontWeight: 800,
                            opacity: isDisabled ? 0.75 : 1,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={cloneDraft.copyOptions[optionKey]}
                            onChange={() =>
                              setCloneDraft((current) => {
                                if (!current) return current;
                                if (isDisabled) return current;
                                const nextCopyOptions = { ...current.copyOptions };
                                nextCopyOptions[optionKey] = !current.copyOptions[optionKey];
                                if (optionKey === "copyScheduleStructure" && nextCopyOptions.copyScheduleStructure) {
                                  nextCopyOptions.copyLearnerRoster = true;
                                  nextCopyOptions.copyAnnouncementSchedule = true;
                                }
                                if (optionKey === "copyScheduleStructure" && !nextCopyOptions.copyScheduleStructure) {
                                  nextCopyOptions.createCompletedSchedule = false;
                                  nextCopyOptions.copyAnnouncementSchedule = false;
                                }
                                if (optionKey === "createCompletedSchedule" && nextCopyOptions.createCompletedSchedule) {
                                  nextCopyOptions.copyScheduleStructure = true;
                                  nextCopyOptions.copyLearnerRoster = true;
                                }
                                return { ...current, copyOptions: nextCopyOptions };
                              })
                            }
                            disabled={saving || isDisabled}
                            style={{ marginTop: "1px", width: "15px", height: "15px", accentColor: "var(--cfsp-blue)" }}
                          />
                          <span>{FOLLOW_UP_COPY_OPTION_LABELS[optionKey]}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-[11px] font-semibold text-[var(--cfsp-text-muted)]">
                    Attendance statuses, completed QA checklist state, delivered announcements, payroll completion, live event timestamps, and repair metadata are always cleared.
                  </div>
                </section>
              </>
            ) : null}

            {activeModal === "add_day" && addDayDraft ? (
              <div className="grid gap-4">
                <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Date</span>
                    <input type="date" value={addDayDraft.date} onChange={(event) => setAddDayDraft((current) => current ? { ...current, date: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Start time</span>
                    <input type="time" value={addDayDraft.startTime} onChange={(event) => setAddDayDraft((current) => current ? { ...current, startTime: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">End time</span>
                    <input type="time" value={addDayDraft.endTime} onChange={(event) => setAddDayDraft((current) => current ? { ...current, endTime: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Location</span>
                    <input value={addDayDraft.location} onChange={(event) => setAddDayDraft((current) => current ? { ...current, location: event.target.value } : current)} disabled={saving} className="cfsp-input" />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span className="cfsp-label">Source day</span>
                    <select value={addDayDraft.sourceDay} onChange={(event) => setAddDayDraft((current) => current ? { ...current, sourceDay: Number.parseInt(event.target.value, 10) || 1 } : current)} disabled={saving || sourceDayOptions.length <= 1} className="cfsp-input">
                      {sourceDayOptions.length ? (
                        sourceDayOptions.map((option) => (
                          <option key={`source-day-${option.day}`} value={option.day}>
                            {option.label}
                          </option>
                        ))
                      ) : (
                        <option value={1}>Day 1</option>
                      )}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                    <span className="cfsp-label">Optional notes</span>
                    <textarea value={addDayDraft.notes} onChange={(event) => setAddDayDraft((current) => current ? { ...current, notes: event.target.value } : current)} disabled={saving} className="cfsp-input" style={{ minHeight: 110 }} />
                  </label>
                </div>

                <section
                  className="rounded-[14px] px-4 py-3"
                  style={{
                    border: "1px solid rgba(20, 91, 150, 0.16)",
                    background: "rgba(20, 91, 150, 0.05)",
                  }}
                >
                  <div className="cfsp-label">Day copy options</div>
                  <div className="mt-1 text-[11px] font-semibold text-[var(--cfsp-text-muted)]">
                    Existing days stay unchanged. The new day can inherit structure, rhythm, and schedule-day metadata from the selected source day.
                  </div>
                  <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: "10px" }}>
                    {[
                      ["copyDayStructure", "Copy day structure from existing day"],
                      ["copyScheduleRhythm", "Copy schedule rhythm"],
                      ["copyCases", "Copy cases"],
                      ["copySpAssignments", "Copy SP assignments"],
                      ["copyLearnerGroups", "Copy learner groups"],
                      ["copyRoomStructure", "Copy room structure"],
                    ].map(([key, label]) => (
                      <label
                        key={`add-day-${key}`}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          borderRadius: "12px",
                          border: "1px solid rgba(99, 181, 217, 0.14)",
                          background: "rgba(255,255,255,0.84)",
                          padding: "10px 12px",
                          color: "var(--cfsp-text)",
                          fontSize: "13px",
                          fontWeight: 800,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(addDayDraft[key as keyof AddDayDraft])}
                          onChange={(event) =>
                            setAddDayDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    [key]: event.target.checked,
                                  }
                                : current
                            )
                          }
                          disabled={saving}
                          style={{ marginTop: "1px", width: "15px", height: "15px", accentColor: "var(--cfsp-blue)" }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] font-semibold text-[var(--cfsp-text-muted)]">
                {activeModal === "add_day"
                  ? "The original completed day snapshots remain untouched."
                  : "The new event starts clean even when structure is copied."}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={closeModal} disabled={saving} className="cfsp-btn cfsp-btn-secondary disabled:opacity-60">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeModal === "duplicate" || activeModal === "follow_up") {
                      void submitClone(activeModal);
                    } else if (activeModal === "add_day") {
                      void submitAddDay();
                    }
                  }}
                  disabled={saving}
                  className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                >
                  {saving
                    ? activeModal === "add_day"
                      ? "Saving..."
                      : "Creating..."
                    : activeModal === "duplicate"
                      ? "Duplicate Event"
                      : activeModal === "follow_up"
                        ? "Create Follow-Up Simulation"
                        : "Add Extra Date"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
