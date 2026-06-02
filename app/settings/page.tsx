"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import EventStructureActionsPanel from "../components/EventStructureActionsPanel";
import SiteShell from "../components/SiteShell";
import {
  buildRoundAnnouncementCueTimeline,
  getDefaultVirAnnouncementCues,
  normalizeAnnouncementScheduleConfig,
  parseAnnouncementScheduleFromNotes,
  upsertAnnouncementScheduleInNotes,
  type AnnouncementCueAnchor,
  type AnnouncementScheduleConfig,
  type AnnouncementScheduleCueConfig,
} from "../lib/announcementSchedule";
import {
  DEFAULT_CFSP_EMAIL_TEMPLATES,
  renderEmailTemplate,
  type EmailTemplateRecord,
} from "../lib/emailTemplates";
import { formatHumanDate } from "../lib/eventDateUtils";
import { parseEventMetadata, upsertEventMetadata } from "../lib/eventMetadata";
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
import {
  DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_CONFIG,
  getFacultySimOpsInstructionsConfigFromMetadata,
  getStudentInstructionsConfigFromMetadata,
  normalizeFacultySimOpsInstructionsConfig,
  normalizeStudentInstructionsConfig,
  serializeFacultySimOpsInstructionsConfig,
  serializeStudentInstructionsConfig,
} from "../lib/studentInstructionsConfig";

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

type RelatedCopyOption =
  | "assigned_sps"
  | "training_materials"
  | "faculty"
  | "zoom_recording"
  | "sim_contact"
  | "case_doorsign";

type RelatedEventPreview = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  exact_course_match?: boolean;
};

type PushRelatedSummary = {
  updated_events: Array<{ id: string; name: string }>;
  skipped_events: Array<{ id: string; name: string; reason: string }>;
  sps_copied: number;
  duplicates_skipped: number;
  blank_source_fields?: string[];
  copied_categories?: RelatedCopyOption[];
};

type MeResponse = {
  role?: string | null;
  profile?: {
    role?: string | null;
    organization_role?: string | null;
  } | null;
};

type EmailTemplateApiResponse = {
  templates?: EmailTemplateRecord[];
  source?: "defaults" | "database";
  canManage?: boolean;
  warning?: string;
};

type SettingsSectionId =
  | "event-structure"
  | "announcement-schedule"
  | "email-templates"
  | "sp-communication"
  | "instruction-templates"
  | "session-checklist"
  | "core-event-details"
  | "operational-notes"
  | "faculty-requests"
  | "staffing-requirements"
  | "room-simulation-setup"
  | "training-materials-tech";

const SETTINGS_SECTION_IDS: SettingsSectionId[] = [
  "event-structure",
  "announcement-schedule",
  "email-templates",
  "sp-communication",
  "instruction-templates",
  "session-checklist",
  "core-event-details",
  "operational-notes",
  "faculty-requests",
  "staffing-requirements",
  "room-simulation-setup",
  "training-materials-tech",
];

const initialEvent: EventEditState = {
  name: "",
  status: "",
  visibility: "",
  location: "",
  spNeeded: "",
  dateText: "",
  notes: "",
};

const relatedCopyOptionLabels: Record<RelatedCopyOption, string> = {
  assigned_sps: "Selected SPs",
  training_materials: "Training metadata/materials",
  faculty: "Faculty",
  zoom_recording: "Zoom/recording info",
  sim_contact: "Sim contact",
  case_doorsign: "Case/doorsign",
};

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseSettingsNumber(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(text(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSettingsBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (["yes", "true", "1", "required", "scheduled", "complete", "ready"].includes(normalized)) return true;
  if (["no", "false", "0", "not_required", "not required", "none"].includes(normalized)) return false;
  return fallback;
}

function parseSettingsJsonObject(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const candidates = [raw];
  try {
    candidates.unshift(decodeURIComponent(raw));
  } catch {
    // Plain JSON is also accepted.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeSettingsTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value)
    .split(/\r?\n|,|\|/)
    .map(text)
    .filter(Boolean);
}

function getSettingsNoteLineValues(notes: string | null | undefined, labels: string[]) {
  const normalizedLabels = new Set(labels.map((label) => label.toLowerCase()));
  return text(notes)
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (!match) return "";
      return normalizedLabels.has(text(match[1]).toLowerCase()) ? text(match[2]) : "";
    })
    .filter(Boolean);
}

function getFirstSettingsNoteLineValue(notes: string | null | undefined, labels: string[]) {
  return getSettingsNoteLineValues(notes, labels)[0] || "";
}

function upsertSettingsNoteLine(notes: string | null | undefined, label: string, value: string) {
  const normalizedLabel = label.toLowerCase();
  const lines = text(notes)
    .split(/\r?\n/)
    .filter((line) => {
      const match = line.match(/^([^:]+):/);
      return !match || text(match[1]).toLowerCase() !== normalizedLabel;
    });
  const cleanedValue = text(value);
  if (cleanedValue) lines.push(`${label}: ${cleanedValue}`);
  return lines.join("\n").trim();
}

function parseSettingsVirtualAccess(raw: unknown) {
  const parsed = parseSettingsJsonObject(raw);
  return {
    training_url: text(parsed?.training_url),
    event_url: text(parsed?.event_url),
    training_meeting_id: text(parsed?.training_meeting_id),
    training_passcode: text(parsed?.training_passcode),
    event_meeting_id: text(parsed?.event_meeting_id),
    event_passcode: text(parsed?.event_passcode),
  };
}

function stringifySettingsVirtualAccess(value: ReturnType<typeof parseSettingsVirtualAccess>) {
  const payload = {
    training_url: text(value.training_url),
    event_url: text(value.event_url),
    training_meeting_id: text(value.training_meeting_id),
    training_passcode: text(value.training_passcode),
    event_meeting_id: text(value.event_meeting_id),
    event_passcode: text(value.event_passcode),
    updated_at: new Date().toISOString(),
  };
  return encodeURIComponent(JSON.stringify(payload));
}

function getRoomNamesFromScheduleSnapshot(snapshot: Record<string, unknown> | null) {
  const direct = normalizeSettingsTextArray(snapshot?.room_names);
  if (direct.length) return direct;
  const rounds = Array.isArray(snapshot?.resolvedRounds) ? snapshot.resolvedRounds : [];
  return Array.from(
    new Set(
      rounds.flatMap((round) => {
        const roundRecord = round && typeof round === "object" ? round as Record<string, unknown> : {};
        const slots = Array.isArray(roundRecord.roomSlots) ? roundRecord.roomSlots : [];
        return slots.map((slot) => {
          const slotRecord = slot && typeof slot === "object" ? slot as Record<string, unknown> : {};
          return text(slotRecord.roomName);
        }).filter(Boolean);
      })
    )
  );
}

function getSettingsCompletedScheduleTruth(metadata: ReturnType<typeof parseEventMetadata>["training"]) {
  const completed = parseSettingsJsonObject(metadata.completed_schedule);
  if (!completed || text(completed.status).toLowerCase() !== "complete") return null;
  const snapshot = completed.snapshot && typeof completed.snapshot === "object"
    ? completed.snapshot as Record<string, unknown>
    : parseSettingsJsonObject(completed.snapshot);
  return {
    status: "complete",
    roomCount:
      parseSettingsNumber(completed.room_count, 0) ||
      parseSettingsNumber(snapshot?.scheduleRoomCount, 0) ||
      parseSettingsNumber(snapshot?.examRoomCount, 0),
    roomNames: normalizeSettingsTextArray(completed.room_names).length
      ? normalizeSettingsTextArray(completed.room_names)
      : getRoomNamesFromScheduleSnapshot(snapshot),
    learnerCount:
      parseSettingsNumber(completed.learner_count, 0) ||
      normalizeSettingsTextArray(snapshot?.scheduleLearnerRoster).length,
    studentsPerRoom:
      parseSettingsNumber(completed.students_per_room, 0) ||
      parseSettingsNumber(snapshot?.scheduleRoomCapacity, 0) ||
      parseSettingsNumber(snapshot?.roomCapacity, 0),
    sourceLabel: "From completed schedule",
  };
}

function getSettingsScheduleDraftTruth(metadata: ReturnType<typeof parseEventMetadata>["training"]) {
  const snapshot = parseSettingsJsonObject(metadata.schedule_builder_snapshot);
  if (!snapshot) return null;
  const roomCount =
    parseSettingsNumber(snapshot.scheduleRoomCount, 0) ||
    parseSettingsNumber(snapshot.examRoomCount, 0);
  const roomNames = getRoomNamesFromScheduleSnapshot(snapshot);
  const learnerCount =
    parseSettingsNumber(snapshot.scheduleLearnerCount, 0) ||
    normalizeSettingsTextArray(snapshot.scheduleLearnerRoster).length ||
    normalizeSettingsTextArray(snapshot.uploadedLearners).length;
  const studentsPerRoom =
    parseSettingsNumber(snapshot.scheduleRoomCapacity, 0) ||
    parseSettingsNumber(snapshot.roomCapacity, 0);
  if (!roomCount && !roomNames.length && !learnerCount && !studentsPerRoom) return null;
  return {
    status: text(snapshot.scheduleStatus || metadata.schedule_status) || "in_progress",
    roomCount,
    roomNames,
    learnerCount,
    studentsPerRoom,
    sourceLabel: "From saved schedule draft",
  };
}

function getSettingsScheduleTruth(event: EventEditState) {
  const metadata = parseEventMetadata(event.notes).training;
  const completed = getSettingsCompletedScheduleTruth(metadata);
  if (completed) return completed;
  const draft = getSettingsScheduleDraftTruth(metadata);
  if (draft) return draft;
  const metadataRoomCount = parseSettingsNumber(metadata.schedule_room_count, 0);
  const noteRoomCount = parseSettingsNumber(getFirstSettingsNoteLineValue(event.notes, ["Number of Rooms", "Rooms", "Room Count"]), 0);
  const roomCount = metadataRoomCount || noteRoomCount;
  const noteRoomNames = getSettingsNoteLineValues(event.notes, ["Room Names", "Rooms"])
    .filter((value) => !/^\d+$/.test(value))
    .flatMap((value) => normalizeSettingsTextArray(value));
  return {
    status: text(metadata.schedule_status),
    roomCount,
    roomNames: noteRoomNames,
    learnerCount: parseSettingsNumber(metadata.schedule_learner_count, 0),
    studentsPerRoom: parseSettingsNumber(metadata.schedule_room_capacity, 0),
    sourceLabel: roomCount || noteRoomNames.length ? "From event setup" : "Safe fallback",
  };
}

function getSettingsTrainingTruth(event: EventEditState) {
  const metadata = parseEventMetadata(event.notes).training;
  const virtualAccess = parseSettingsVirtualAccess(metadata.virtual_access);
  const legacyZoom = text(metadata.training_zoom_link) || text(metadata.zoom_url) || getFirstSettingsNoteLineValue(event.notes, ["Zoom", "Zoom Link", "Training Link", "Virtual Link"]);
  const trainingDate = text(metadata.training_date) || text(metadata.preferred_training_date) || text(metadata.imported_training_date);
  const trainingStartTime = text(metadata.training_start_time) || text(metadata.preferred_training_time);
  const trainingEndTime = text(metadata.training_end_time) || text(metadata.preferred_training_end_time);
  const importedTrainingTime = text(metadata.imported_training_time);
  const explicitTrainingRequired = text(metadata.training_required);
  const trainingRequired = explicitTrainingRequired
    ? parseSettingsBoolean(explicitTrainingRequired, false)
    : Boolean(trainingDate || trainingStartTime || importedTrainingTime || text(metadata.training_scheduling_status).toLowerCase().includes("scheduled"));
  const materialsReadyNote = getFirstSettingsNoteLineValue(event.notes, ["Materials Ready"]);
  const caseFileReadyNote = getFirstSettingsNoteLineValue(event.notes, ["Case File Ready"]);
  const doorSignReadyNote = getFirstSettingsNoteLineValue(event.notes, ["Door Sign Ready"]);
  return {
    trainingRequired,
    trainingDate,
    trainingStartTime,
    trainingEndTime,
    importedTrainingTime,
    trainingStatus: text(metadata.training_scheduling_status) || (trainingDate ? "Training Scheduled" : ""),
    trainingUrl: text(virtualAccess.training_url) || legacyZoom,
    eventUrl: text(virtualAccess.event_url) || text(metadata.zoom_url),
    trainingRecordingUrl: text(metadata.training_recording_url) || text(metadata.recording_url),
    recordingStatus: text(metadata.training_recording_status) || text(metadata.recording_status) || text(metadata.event_recording_status),
    caseFileReady: caseFileReadyNote ? parseSettingsBoolean(caseFileReadyNote, false) : Boolean(text(metadata.case_file_url) || text(metadata.case_file_name) || text(metadata.case_files)),
    doorSignReady: doorSignReadyNote ? parseSettingsBoolean(doorSignReadyNote, false) : Boolean(text(metadata.doorsign_url) || text(metadata.doorsign_file_url) || text(metadata.doorsign_file_name)),
    materialsReady: materialsReadyNote ? parseSettingsBoolean(materialsReadyNote, false) : Boolean(text(metadata.case_file_url) || text(metadata.case_files) || text(metadata.additional_materials) || text(metadata.supplemental_doc_url)),
    sourceLabel: "From training planning",
    virtualSourceLabel: virtualAccess.training_url || virtualAccess.event_url ? "From virtual access" : legacyZoom ? "From legacy Zoom fallback" : "Pending virtual access",
  };
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

function getDefaultRelatedEventKeyword(title?: string | null) {
  const raw = text(title);
  if (!raw) return "";

  const courseTokenMatch = raw.match(/\b[A-Z]{2,}\s*[-]?\s*(\d{3,4}[A-Z]?)\b/i);
  if (courseTokenMatch?.[1]) return courseTokenMatch[1];

  const numericMatch = raw.match(/\b(\d{3,4}[A-Z]?)\b/);
  if (numericMatch?.[1]) return numericMatch[1];

  const tokens = raw
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return tokens[0] || "";
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

function buildDefaultSettingsStudentInstructionsConfig(event: EventEditState) {
  const saved = getStudentInstructionsConfigFromMetadata(parseEventMetadata(event.notes).training);
  return normalizeStudentInstructionsConfig({
    ...saved,
    title: saved.title || event.name,
    zoomLink: saved.zoomLink,
  });
}

function buildDefaultSettingsFacultySimOpsInstructionsConfig(event: EventEditState) {
  const saved = getFacultySimOpsInstructionsConfigFromMetadata(parseEventMetadata(event.notes).training);
  return normalizeFacultySimOpsInstructionsConfig({
    ...DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_CONFIG,
    ...saved,
  });
}

function normalizeSettingsRole(value: unknown) {
  const role = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "platform_owner" || role === "super_admin") return "platform_owner";
  if (role === "org_admin" || role === "admin") return "org_admin";
  if (role === "sim_ops" || role === "sim_op") return "sim_ops";
  if (role === "faculty") return "faculty";
  if (role === "sp") return "sp";
  return "viewer";
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

function CollapsibleSettingsSection({
  id,
  title,
  detail,
  kicker = "Event setup",
  expanded,
  onToggle,
  children,
}: {
  id: SettingsSectionId;
  title: string;
  detail: string;
  kicker?: string;
  expanded: boolean;
  onToggle: (id: SettingsSectionId) => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className="rounded-[22px] border border-[var(--cfsp-border)] bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="cfsp-kicker">{kicker}</p>
            <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">{title}</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">{detail}</p>
          </div>
          <span className="mt-2 rounded-full border border-[var(--cfsp-border)] bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">
            {expanded ? "Collapse" : "Expand"}
          </span>
        </div>
      </button>
      {expanded ? <div className="mt-4 grid gap-3">{children}</div> : null}
    </section>
  );
}

const announcementAnchorOptions: Array<{ value: AnnouncementCueAnchor; label: string }> = [
  { value: "encounter_start", label: "Encounter start" },
  { value: "encounter_end", label: "Encounter end" },
  { value: "feedback_start", label: "Feedback start" },
  { value: "feedback_end", label: "Feedback end" },
  { value: "transition_start", label: "Transition start" },
  { value: "block_end", label: "Block end" },
  { value: "custom_time", label: "Custom time" },
];

function AnnouncementScheduleManager({
  eventId,
  eventNotes,
  sessions,
  canEdit,
  onNotesChange,
}: {
  eventId: string;
  eventNotes: string;
  sessions: EventSessionRow[];
  canEdit: boolean;
  onNotesChange: (nextNotes: string) => void;
}) {
  const [draft, setDraft] = useState<AnnouncementScheduleConfig>(() => parseAnnouncementScheduleFromNotes(eventNotes));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(parseAnnouncementScheduleFromNotes(eventNotes));
  }, [eventNotes]);

  const previewRound = useMemo(() => {
    const firstSession = sessions[0] || null;
    if (!firstSession?.start_time || !firstSession?.end_time) return null;
    return {
      key: "settings-preview-round",
      round: 1,
      start: firstSession.start_time,
      end: firstSession.end_time,
      subBlocks: [
        {
          label: "Encounter",
          start: firstSession.start_time,
          end: firstSession.end_time,
        },
      ],
    };
  }, [sessions]);
  const previewItems = useMemo(
    () => buildRoundAnnouncementCueTimeline(previewRound, null, draft),
    [draft, previewRound]
  );

  function updateCue(cueId: string, updates: Partial<AnnouncementScheduleCueConfig>) {
    setDraft((current) => ({
      ...current,
      cues: current.cues.map((cue) => (cue.id === cueId ? { ...cue, ...updates } : cue)),
    }));
    setMessage("");
  }

  function moveCue(cueId: string, delta: number) {
    setDraft((current) => {
      const cues = [...current.cues];
      const index = cues.findIndex((cue) => cue.id === cueId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= cues.length) return current;
      const [cue] = cues.splice(index, 1);
      cues.splice(nextIndex, 0, cue);
      return normalizeAnnouncementScheduleConfig({ ...current, cues });
    });
  }

  function addCue() {
    setDraft((current) =>
      normalizeAnnouncementScheduleConfig({
        ...current,
        cues: [
          ...current.cues,
          {
            id: `custom-cue-${Date.now()}`,
            title: "New Announcement Cue",
            announcementText: "Announcement text.",
            anchor: "encounter_start",
            offsetMinutes: 0,
            active: true,
            sortOrder: current.cues.length,
            appliesTo: "all_rounds",
          },
        ],
      })
    );
  }

  function resetVirDefaults() {
    setDraft(normalizeAnnouncementScheduleConfig({ version: 1, cues: getDefaultVirAnnouncementCues() }));
    setMessage("");
    setError("");
  }

  async function saveAnnouncementSchedule() {
    if (!eventId) {
      setError("Select an event before saving announcement settings.");
      return;
    }
    if (!canEdit) {
      setError("Admin or Sim Ops access is required to edit announcement settings.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");
    try {
      const normalized = normalizeAnnouncementScheduleConfig({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      const nextNotes = upsertAnnouncementScheduleInNotes(eventNotes, normalized);
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
        throw new Error(detail || "Could not save announcement schedule.");
      }
      setDraft(normalized);
      onNotesChange(nextNotes);
      setMessage("Announcement schedule saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save announcement schedule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--cfsp-border)] bg-slate-50 p-3">
        <div>
          <p className="cfsp-kicker">Schedule-linked cues</p>
          <p className="mt-1 text-sm font-bold text-[var(--cfsp-text-muted)]">
            These cue rules calculate against each round&apos;s completed schedule timing. Delivered/skipped/snoozed live state is stored separately.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addCue} disabled={saving || !canEdit} className="cfsp-btn cfsp-btn-secondary disabled:opacity-50">
            Add Announcement Cue
          </button>
          <button type="button" onClick={resetVirDefaults} disabled={saving || !canEdit} className="cfsp-btn cfsp-btn-secondary disabled:opacity-50">
            Reset VIR Defaults
          </button>
          <button type="button" onClick={() => void saveAnnouncementSchedule()} disabled={saving || !canEdit} className="cfsp-btn cfsp-btn-primary disabled:opacity-50">
            {saving ? "Saving..." : "Save Announcement Schedule"}
          </button>
        </div>
      </div>

      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}

      <div className="grid gap-3">
        {draft.cues.map((cue, index) => {
          const preview = previewItems.find((item) => item.cueId === cue.id);
          return (
            <section key={cue.id} className="rounded-2xl border border-[var(--cfsp-border)] bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="cfsp-kicker">Cue {index + 1}</p>
                  <p className="mt-1 text-sm font-black text-[var(--cfsp-text)]">{cue.title || "Untitled cue"}</p>
                  <p className="mt-1 text-xs font-bold text-[var(--cfsp-text-muted)]">
                    Preview: {preview ? `${preview.timeLabel} · ${preview.message}` : "Timing unavailable"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => moveCue(cue.id, -1)} disabled={saving || index === 0 || !canEdit} className="cfsp-btn cfsp-btn-secondary disabled:opacity-50">
                    Move Up
                  </button>
                  <button type="button" onClick={() => moveCue(cue.id, 1)} disabled={saving || index === draft.cues.length - 1 || !canEdit} className="cfsp-btn cfsp-btn-secondary disabled:opacity-50">
                    Move Down
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((current) => normalizeAnnouncementScheduleConfig({ ...current, cues: current.cues.filter((item) => item.id !== cue.id) }))}
                    disabled={saving || !canEdit}
                    className="cfsp-btn cfsp-btn-secondary disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Title" value={cue.title} onChange={(value) => updateCue(cue.id, { title: value })} />
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Anchor</span>
                  <select value={cue.anchor} onChange={(event) => updateCue(cue.id, { anchor: event.target.value as AnnouncementCueAnchor })} disabled={saving || !canEdit} className="cfsp-input">
                    {announcementAnchorOptions.map((option) => (
                      <option key={`anchor-${cue.id}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Offset minutes" value={String(cue.offsetMinutes)} onChange={(value) => updateCue(cue.id, { offsetMinutes: Number.parseInt(value, 10) || 0 })} />
                {cue.anchor === "custom_time" ? (
                  <Field label="Custom time" value={cue.customTime || ""} onChange={(value) => updateCue(cue.id, { customTime: value })} placeholder="09:15" />
                ) : null}
                <label className="grid gap-1 md:col-span-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Announcement text</span>
                  <textarea
                    value={cue.announcementText}
                    onChange={(event) => updateCue(cue.id, { announcementText: event.target.value })}
                    disabled={saving || !canEdit}
                    rows={3}
                    className="cfsp-input"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" checked={cue.active} onChange={(event) => updateCue(cue.id, { active: event.target.checked })} disabled={saving || !canEdit} />
                  Active cue
                </label>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function PushRelatedEventsSettingsPanel({
  eventId,
  eventName,
  canManage,
}: {
  eventId: string;
  eventName: string;
  canManage: boolean;
}) {
  const defaultKeyword = useMemo(() => getDefaultRelatedEventKeyword(eventName), [eventName]);
  const [expanded, setExpanded] = useState(false);
  const [keyword, setKeyword] = useState(defaultKeyword);
  const [mustInclude, setMustInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [excludeCurrent, setExcludeCurrent] = useState(true);
  const [copyOptions, setCopyOptions] = useState<RelatedCopyOption[]>([
    "assigned_sps",
    "training_materials",
    "zoom_recording",
    "case_doorsign",
  ]);
  const [matches, setMatches] = useState<RelatedEventPreview[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<PushRelatedSummary | null>(null);

  useEffect(() => {
    setKeyword((current) => current || defaultKeyword);
  }, [defaultKeyword]);

  if (!canManage) return null;

  async function previewRelatedEvents() {
    if (!eventId || !keyword.trim()) {
      setErrorMessage("Enter a keyword to preview related events.");
      setMatches([]);
      return;
    }

    setPreviewLoading(true);
    setErrorMessage("");
    setSummary(null);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/push-related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          keyword: keyword.trim(),
          mustInclude: mustInclude.trim(),
          exclude: exclude.trim(),
          excludeCurrent,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            events?: RelatedEventPreview[];
          }
        | null;

      if (!response.ok) {
        throw new Error(body?.error || "Could not preview related events.");
      }

      const nextMatches = Array.isArray(body?.events) ? body.events : [];
      setMatches(nextMatches);
      setSelectedTargetIds(nextMatches.filter((event) => event.exact_course_match).map((event) => event.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not preview related events.");
      setMatches([]);
      setSelectedTargetIds([]);
    } finally {
      setPreviewLoading(false);
    }
  }

  function toggleCopyOption(option: RelatedCopyOption) {
    setSummary(null);
    setErrorMessage("");
    setCopyOptions((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
  }

  function toggleTarget(eventId: string) {
    setSummary(null);
    setErrorMessage("");
    setSelectedTargetIds((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId]
    );
  }

  async function pushToRelatedEvents() {
    if (!eventId || !keyword.trim()) {
      setErrorMessage("Enter a keyword before pushing to related events.");
      return;
    }
    if (!matches.length) {
      setErrorMessage("Preview matching events before pushing selected info.");
      return;
    }
    if (!selectedTargetIds.length) {
      setErrorMessage("Check at least one target event before pushing.");
      return;
    }
    if (!copyOptions.length) {
      setErrorMessage("Select at least one thing to copy.");
      return;
    }

    setPushSaving(true);
    setErrorMessage("");
    setSummary(null);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/push-related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "push",
          keyword: keyword.trim(),
          mustInclude: mustInclude.trim(),
          exclude: exclude.trim(),
          excludeCurrent,
          targetEventIds: selectedTargetIds,
          copyOptions,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            summary?: PushRelatedSummary;
          }
        | null;

      if (!response.ok || !body?.summary) {
        throw new Error(body?.error || "Could not push selected info to related events.");
      }

      setSummary(body.summary);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not push selected info to related events.");
    } finally {
      setPushSaving(false);
    }
  }

  return (
    <section className="rounded-[18px] border border-[var(--cfsp-border)] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="cfsp-kicker">Related events</p>
          <h3 className="mt-1 text-lg font-black text-[var(--cfsp-text)]">Push to Related Events</h3>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">
            Copy selected structure/setup details from this event into matching related events.
          </p>
        </div>
        <button type="button" onClick={() => setExpanded((current) => !current)} className="cfsp-btn cfsp-btn-secondary">
          {expanded ? "Hide Related Push" : "Open Related Push"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Match keyword" value={keyword} onChange={setKeyword} placeholder={defaultKeyword || "421"} />
            <Field label="Must include" value={mustInclude} onChange={setMustInclude} placeholder="CTCN" />
            <Field label="Exclude" value={exclude} onChange={setExclude} placeholder="VIR" />
            <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
              <input type="checkbox" checked={excludeCurrent} onChange={(event) => setExcludeCurrent(event.target.checked)} />
              Exclude current event
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void previewRelatedEvents()} disabled={previewLoading} className="cfsp-btn cfsp-btn-secondary disabled:opacity-60">
              {previewLoading ? "Finding Matches..." : "Show Matching Events"}
            </button>
          </div>

          <div className="grid gap-2">
            <div className="cfsp-label">Copy These Items</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(relatedCopyOptionLabels) as RelatedCopyOption[]).map((option) => {
                const selected = copyOptions.includes(option);
                return (
                  <button
                    key={`settings-related-copy-${option}`}
                    type="button"
                    onClick={() => toggleCopyOption(option)}
                    className={selected ? "cfsp-btn cfsp-btn-primary" : "cfsp-btn cfsp-btn-secondary"}
                  >
                    {relatedCopyOptionLabels[option]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="cfsp-label">Matching Events {matches.length ? `(${matches.length})` : ""}</div>
            <div className="text-sm font-bold text-[var(--cfsp-text-muted)]">
              {matches.length} matching event{matches.length === 1 ? "" : "s"} found, {selectedTargetIds.length} selected
            </div>
            {matches.length ? (
              <div className="grid gap-2">
                {matches.map((match) => (
                  <label
                    key={`settings-related-match-${match.id}`}
                    className="grid cursor-pointer gap-1 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <input type="checkbox" checked={selectedTargetIds.includes(match.id)} onChange={() => toggleTarget(match.id)} />
                      <span className="font-black text-[var(--cfsp-text)]">{match.name || "Untitled Event"}</span>
                      {match.exact_course_match ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                          Exact course match
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs font-bold text-[var(--cfsp-text-muted)]">
                      {[match.status || "No status", match.date_text || "Date TBD", match.location || "Location TBD"].join(" · ")}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--cfsp-border)] bg-slate-50 px-3 py-4 text-sm font-bold text-[var(--cfsp-text-muted)]">
                {previewLoading ? "Looking for related events..." : "Preview matches to review which events will be updated."}
              </div>
            )}
          </div>

          {summary ? (
            <div className="grid gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
              <div>Push complete</div>
              <div>Updated events: {summary.updated_events.length}</div>
              {summary.copied_categories?.length ? (
                <div>{summary.copied_categories.map((category) => relatedCopyOptionLabels[category]).join(", ")} copied</div>
              ) : null}
              <div>SPs copied: {summary.sps_copied}</div>
              <div>Duplicates skipped: {summary.duplicates_skipped}</div>
              <div>Skipped events: {summary.skipped_events.length}</div>
              {summary.blank_source_fields?.length ? (
                <div>Blank source fields skipped: {summary.blank_source_fields.join(", ")}</div>
              ) : null}
            </div>
          ) : null}

          {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

          <button
            type="button"
            onClick={() => void pushToRelatedEvents()}
            disabled={pushSaving || matches.length === 0 || copyOptions.length === 0 || selectedTargetIds.length === 0}
            className="cfsp-btn cfsp-btn-primary justify-self-start disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pushSaving ? "Pushing..." : "Push Selected Info"}
          </button>
        </div>
      ) : null}
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
  const [selectedTaskId, setSelectedTaskId] = useState("");

  useEffect(() => {
    const loaded = getSessionChecklistConfig(eventNotes);
    setConfigDraft(loaded);
    setSelectedTaskId(loaded[0]?.taskId || "");
    setDirty(false);
  }, [eventNotes]);

  useEffect(() => {
    if (!configDraft.length) {
      setSelectedTaskId("");
      return;
    }
    if (!configDraft.some((task) => task.taskId === selectedTaskId)) {
      setSelectedTaskId(configDraft[0]?.taskId || "");
    }
  }, [configDraft, selectedTaskId]);

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
  const selectedTask = configDraft.find((task) => task.taskId === selectedTaskId) || null;
  const selectedTaskIndex = selectedTask ? configDraft.findIndex((task) => task.taskId === selectedTask.taskId) : -1;
  const selectedTaskPreview = selectedTask ? preview.tasks.find((row) => row.taskId === selectedTask.taskId) || null : null;
  const planningCount = configDraft.filter((task) => task.section === "planning").length;
  const dayOfCount = configDraft.filter((task) => task.section === "day_of").length;
  const activeCount = configDraft.filter((task) => task.active !== false).length;
  const requiredCount = configDraft.filter((task) => task.required !== false).length;

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
    let nextSelected = "";
    setConfigDraft((current) => {
      const currentIndex = current.findIndex((task) => task.taskId === taskId);
      const filtered = current.filter((task) => task.taskId !== taskId);
      nextSelected =
        filtered[Math.max(0, Math.min(currentIndex, filtered.length - 1))]?.taskId || "";
      return filtered.map((task, index) => ({ ...task, sortOrder: index }));
    });
    setSelectedTaskId(nextSelected);
    setDirty(true);
    setMessage("");
    setError("");
  }

  function addTask(section: SessionChecklistSection) {
    const nextId = `qa-task-${Date.now()}`;
    setConfigDraft((current) => {
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
    setSelectedTaskId(nextId);
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
    const defaults = getDefaultSessionChecklistConfig();
    setConfigDraft(defaults);
    setSelectedTaskId(defaults[0]?.taskId || "");
    setDirty(true);
    setMessage("");
    setError("");
  }

  return (
    <div className="grid gap-3">
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

      {message ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div> : null}
      {!canEdit ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          Read-only. Admin or Sim Ops access is required to edit checklist settings.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[var(--cfsp-border)] bg-slate-50 px-3 py-2 text-xs font-black text-[var(--cfsp-text-muted)]">Planning: <span className="text-[var(--cfsp-text)]">{planningCount}</span></div>
          <div className="rounded-xl border border-[var(--cfsp-border)] bg-slate-50 px-3 py-2 text-xs font-black text-[var(--cfsp-text-muted)]">Day-of: <span className="text-[var(--cfsp-text)]">{dayOfCount}</span></div>
          <div className="rounded-xl border border-[var(--cfsp-border)] bg-slate-50 px-3 py-2 text-xs font-black text-[var(--cfsp-text-muted)]">Active: <span className="text-[var(--cfsp-text)]">{activeCount}</span></div>
          <div className="rounded-xl border border-[var(--cfsp-border)] bg-slate-50 px-3 py-2 text-xs font-black text-[var(--cfsp-text-muted)]">Required: <span className="text-[var(--cfsp-text)]">{requiredCount}</span></div>
        </div>
        <label className="grid gap-1">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Select task to edit</span>
          <select
            value={selectedTaskId}
            onChange={(event) => setSelectedTaskId(event.target.value)}
            className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
          >
            {!configDraft.length ? <option value="">No tasks available</option> : null}
            <optgroup label="Planning">
              {configDraft.filter((task) => task.section === "planning").map((task) => (
                <option key={`selector-${task.taskId}`} value={task.taskId}>{task.label}</option>
              ))}
            </optgroup>
            <optgroup label="Day-of">
              {configDraft.filter((task) => task.section === "day_of").map((task) => (
                <option key={`selector-${task.taskId}`} value={task.taskId}>{task.label}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="grid gap-3 xl:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.15fr)]">
          <div className="grid gap-2 self-start">
            {configDraft.map((task) => {
              const resolvedTask = preview.tasks.find((row) => row.taskId === task.taskId);
              const selected = task.taskId === selectedTaskId;
              return (
                <button
                  key={`task-row-${task.taskId}`}
                  type="button"
                  onClick={() => setSelectedTaskId(task.taskId)}
                  className="rounded-xl border px-3 py-2 text-left transition"
                  style={{
                    borderColor: selected ? "rgba(20,91,150,0.48)" : "var(--cfsp-border)",
                    background: selected ? "linear-gradient(135deg, rgba(224,242,254,0.92), rgba(236,253,245,0.9))" : "#fff",
                  }}
                >
                  <div className="text-sm font-black text-[var(--cfsp-text)]">{task.label}</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--cfsp-text-muted)]">
                    {task.section === "planning" ? "Planning" : "Day-of"} · {task.active !== false ? "Active" : "Inactive"} · {task.required !== false ? "Required" : "Optional"}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">
                    {resolvedTask?.dueRuleLabel || "Due rule pending"} · {resolvedTask?.statusLabel || "Upcoming"}
                  </div>
                </button>
              );
            })}
            {!configDraft.length ? (
              <div className="rounded-xl border border-dashed border-[var(--cfsp-border)] bg-slate-50 px-3 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                No checklist tasks. Add a Planning or Day-of task to begin.
              </div>
            ) : null}
          </div>
          {selectedTask ? (
            <article className="rounded-2xl border border-[var(--cfsp-border)] bg-slate-50 p-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Task name" value={selectedTask.label} onChange={(value) => updateTask(selectedTask.taskId, { label: value })} />
                <Field label="Owner / role" value={selectedTask.owner} onChange={(value) => updateTask(selectedTask.taskId, { owner: value })} />
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Section</span>
                  <select
                    value={selectedTask.section}
                    onChange={(event) => updateTask(selectedTask.taskId, { section: event.target.value as SessionChecklistSection })}
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
                    value={selectedTask.dueAnchor}
                    onChange={(event) => updateTask(selectedTask.taskId, { dueAnchor: event.target.value as SessionChecklistDueAnchor })}
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
                    value={selectedTask.offsetValue}
                    onChange={(event) => updateTask(selectedTask.taskId, { offsetValue: Number(event.target.value || 0) })}
                    className="rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--cfsp-text)] outline-none transition focus:border-emerald-400"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--cfsp-text-muted)]">Offset unit</span>
                  <select
                    value={selectedTask.offsetUnit}
                    onChange={(event) => updateTask(selectedTask.taskId, { offsetUnit: event.target.value as SessionChecklistOffsetUnit })}
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
                    value={selectedTask.offsetDirection}
                    onChange={(event) => updateTask(selectedTask.taskId, { offsetDirection: event.target.value as SessionChecklistOffsetDirection })}
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
                    checked={selectedTask.active !== false}
                    onChange={(event) => updateTask(selectedTask.taskId, { active: event.target.checked })}
                  />
                  Active task
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-black text-[var(--cfsp-text)]">
                  <input
                    type="checkbox"
                    checked={selectedTask.required !== false}
                    onChange={(event) => updateTask(selectedTask.taskId, { required: event.target.checked })}
                  />
                  Required for readiness
                </label>
                <div className="lg:col-span-2">
                  <TextAreaField
                    label="Task notes"
                    value={selectedTask.notes}
                    onChange={(value) => updateTask(selectedTask.taskId, { notes: value })}
                    placeholder="Optional context for operators."
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--cfsp-text-muted)]">
                <span>Status preview: {selectedTaskPreview?.statusLabel || "Upcoming"}</span>
                <span>•</span>
                <span>{selectedTaskPreview?.dueRuleLabel || "Due rule pending"}</span>
                <span>•</span>
                <span>{selectedTaskPreview?.dueAtLabel || "Date needed"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => reorderTask(selectedTask.taskId, "up")} disabled={selectedTaskIndex <= 0 || !canEdit} className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  Move Up
                </button>
                <button type="button" onClick={() => reorderTask(selectedTask.taskId, "down")} disabled={selectedTaskIndex < 0 || selectedTaskIndex === configDraft.length - 1 || !canEdit} className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  Move Down
                </button>
                <button type="button" onClick={() => removeTask(selectedTask.taskId)} disabled={!canEdit} className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  Delete
                </button>
              </div>
            </article>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--cfsp-border)] bg-slate-50 p-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
              Select a task to edit.
            </div>
          )}
        </div>
      </div>
    </div>
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
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#466477]">
          Source: {source === "database" ? "Saved database templates" : "Built-in defaults"}
        </p>
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
    </div>
  );
}

type OrganizationCommunicationSettingsState = {
  default_sp_communication_mode: string;
  allow_sp_portal: boolean;
  allow_email_workflow: boolean;
  allow_microsoft_forms_workflow: boolean;
  allow_manual_workflow: boolean;
  default_ms_forms_url: string;
  default_reply_to_email: string;
  sp_onboarding_message: string;
};

const defaultCommunicationSettingsState: OrganizationCommunicationSettingsState = {
  default_sp_communication_mode: "hybrid",
  allow_sp_portal: true,
  allow_email_workflow: true,
  allow_microsoft_forms_workflow: true,
  allow_manual_workflow: true,
  default_ms_forms_url: "",
  default_reply_to_email: "",
  sp_onboarding_message: "",
};

const organizationCommunicationModeOptions = [
  { value: "hybrid", label: "Hybrid" },
  { value: "portal_only", label: "Portal only" },
  { value: "email_only", label: "Email only" },
  { value: "microsoft_forms", label: "Microsoft Forms" },
  { value: "manual", label: "Manual" },
];

function normalizeCommunicationSettingsPayload(payload: unknown): OrganizationCommunicationSettingsState {
  const source =
    payload && typeof payload === "object" && "settings" in payload
      ? (payload as { settings?: Record<string, unknown> }).settings
      : null;
  return {
    ...defaultCommunicationSettingsState,
    default_sp_communication_mode: text(source?.default_sp_communication_mode) || "hybrid",
    allow_sp_portal: typeof source?.allow_sp_portal === "boolean" ? source.allow_sp_portal : true,
    allow_email_workflow: typeof source?.allow_email_workflow === "boolean" ? source.allow_email_workflow : true,
    allow_microsoft_forms_workflow:
      typeof source?.allow_microsoft_forms_workflow === "boolean" ? source.allow_microsoft_forms_workflow : true,
    allow_manual_workflow: typeof source?.allow_manual_workflow === "boolean" ? source.allow_manual_workflow : true,
    default_ms_forms_url: text(source?.default_ms_forms_url),
    default_reply_to_email: text(source?.default_reply_to_email),
    sp_onboarding_message: text(source?.sp_onboarding_message),
  };
}

function SpCommunicationSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<OrganizationCommunicationSettingsState>(defaultCommunicationSettingsState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/organization/communication-settings", {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.ok === false) {
          throw new Error(text(payload?.message || payload?.error) || "Could not load SP communication settings.");
        }
        if (!cancelled) setSettings(normalizeCommunicationSettingsPayload(payload));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load SP communication settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof OrganizationCommunicationSettingsState>(
    key: K,
    value: OrganizationCommunicationSettingsState[K]
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  async function saveSettings() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/organization/communication-settings", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok === false) {
        throw new Error(text(payload?.message || payload?.error) || "Could not save SP communication settings.");
      }
      setSettings(normalizeCommunicationSettingsPayload(payload));
      setMessage("SP communication settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save SP communication settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="sp-communication-settings" className="grid gap-4">
      <div>
        <p className="cfsp-kicker">Hybrid adoption</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">
          Set the default communication posture for SP staffing while portal, email, Microsoft Forms, and manual workflows coexist.
        </p>
      </div>
      {loading ? <p className="text-sm font-bold text-[var(--cfsp-text-muted)]">Loading SP communication settings...</p> : null}
      {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="cfsp-label">Default mode</span>
          <select
            value={settings.default_sp_communication_mode}
            onChange={(event) => update("default_sp_communication_mode", event.target.value)}
            disabled={!canEdit || loading}
            className="cfsp-select disabled:cursor-not-allowed disabled:opacity-50"
          >
            {organizationCommunicationModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Default MS Forms URL"
          value={settings.default_ms_forms_url}
          onChange={(value) => update("default_ms_forms_url", value)}
          placeholder="https://forms.office.com/..."
        />
        <Field
          label="Reply-to email"
          value={settings.default_reply_to_email}
          onChange={(value) => update("default_reply_to_email", value)}
          placeholder="simulation@example.edu"
        />
        <div className="grid gap-2 rounded-xl border border-[var(--cfsp-border)] bg-white p-3">
          <span className="cfsp-label">Allowed workflows</span>
          {[
            ["allow_sp_portal", "SP Portal"],
            ["allow_email_workflow", "Email"],
            ["allow_microsoft_forms_workflow", "Microsoft Forms"],
            ["allow_manual_workflow", "Manual / phone"],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm font-black text-[var(--cfsp-text)]">
              <input
                type="checkbox"
                checked={Boolean(settings[key as keyof OrganizationCommunicationSettingsState])}
                onChange={(event) =>
                  update(
                    key as keyof OrganizationCommunicationSettingsState,
                    event.target.checked as OrganizationCommunicationSettingsState[keyof OrganizationCommunicationSettingsState]
                  )
                }
                disabled={!canEdit || loading}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <TextAreaField
        label="SP onboarding message"
        value={settings.sp_onboarding_message}
        onChange={(value) => update("sp_onboarding_message", value)}
        placeholder="Optional message coordinators can reuse when inviting SPs into the portal."
      />
      <div>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving || loading || !canEdit}
          className="cfsp-btn cfsp-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save SP Communication Settings"}
        </button>
      </div>
    </div>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const eventId = text(searchParams.get("eventId"));
  const eventHref = useMemo(() => (eventId ? `/events/${encodeURIComponent(eventId)}` : "/events"), [eventId]);
  const [expandedSections, setExpandedSections] = useState<Record<SettingsSectionId, boolean>>(() =>
    Object.fromEntries(SETTINGS_SECTION_IDS.map((id) => [id, false])) as Record<SettingsSectionId, boolean>
  );

  const [eventEdit, setEventEdit] = useState<EventEditState>(initialEvent);
  const [eventSessions, setEventSessions] = useState<EventSessionRow[]>([]);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [canManageUsersAccess, setCanManageUsersAccess] = useState(false);
  const [roleLabel, setRoleLabel] = useState("");
  const studentInstructionsConfig = useMemo(
    () => buildDefaultSettingsStudentInstructionsConfig(eventEdit),
    [eventEdit]
  );
  const facultySimOpsInstructionsConfig = useMemo(
    () => buildDefaultSettingsFacultySimOpsInstructionsConfig(eventEdit),
    [eventEdit]
  );
  const settingsScheduleTruth = useMemo(() => getSettingsScheduleTruth(eventEdit), [eventEdit]);
  const settingsTrainingTruth = useMemo(() => getSettingsTrainingTruth(eventEdit), [eventEdit]);
  const completedSchedulePresent = settingsScheduleTruth.sourceLabel === "From completed schedule";
  const [completedScheduleEditWarningAccepted, setCompletedScheduleEditWarningAccepted] = useState(false);

  useEffect(() => {
    function applyHashExpansion() {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, "").trim());
      const normalizedHash = hash === "sp-communication-settings" ? "sp-communication" : hash;
      const targetSection = SETTINGS_SECTION_IDS.find((sectionId) => sectionId === normalizedHash) || null;
      setExpandedSections((current) => {
        const next = { ...current };
        for (const sectionId of SETTINGS_SECTION_IDS) {
          next[sectionId] = sectionId === targetSection;
        }
        return next;
      });
    }

    applyHashExpansion();
    window.addEventListener("hashchange", applyHashExpansion);
    return () => {
      window.removeEventListener("hashchange", applyHashExpansion);
    };
  }, []);

  function toggleSection(sectionId: SettingsSectionId) {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      setSavedMessage("");
      setErrorMessage("");
      setLoading(Boolean(eventId));

      try {
        const meResponse = await fetch("/api/me", { cache: "no-store" });
        const mePayload = (await meResponse.json().catch(() => ({}))) as MeResponse;
        const role = text(mePayload.profile?.role).toLowerCase();
        const organizationRole = normalizeSettingsRole(
          mePayload.role || mePayload.profile?.organization_role || mePayload.profile?.role
        );
        const allowed = ["admin", "sim_op", "super_admin"].includes(role);
        const canManageUsers = organizationRole === "platform_owner" || organizationRole === "org_admin";

        if (!cancelled) {
          setRoleLabel(role || "unknown");
          setCanEdit(allowed);
          setCanManageUsersAccess(canManageUsers);
        }

        if (!eventId) {
          if (!cancelled) {
          setErrorMessage("Open Advanced Event Admin from a specific event so CFSP knows which event to manage.");
          }
          return;
        }

        const eventResponse = await fetch(`/api/events/${encodeURIComponent(eventId)}`, { cache: "no-store" });

        if (!eventResponse.ok) {
          throw new Error("Could not load this event.");
        }

        const eventPayload = await eventResponse.json();
        const event = extractEvent(eventPayload);

        if (!event) {
          throw new Error("Event data was not returned.");
        }

        if (!cancelled) {
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

  function updateInstructionNotes(trainingUpdates: Record<string, string>) {
    setEventEdit((current) => ({
      ...current,
      notes: upsertEventMetadata(current.notes, {
        training: trainingUpdates,
      }),
    }));
    setSavedMessage("");
  }

  function confirmScheduleStructureEdit() {
    if (!completedSchedulePresent || completedScheduleEditWarningAccepted) return true;
    const confirmed = window.confirm(
      "This event has a completed schedule. Changing room count, learner count, or timing may require schedule regeneration.\n\nContinue editing?"
    );
    if (confirmed) setCompletedScheduleEditWarningAccepted(true);
    return confirmed;
  }

  function updateTrainingMetadata(trainingUpdates: Record<string, string>) {
    setEventEdit((current) => ({
      ...current,
      notes: upsertEventMetadata(current.notes, {
        training: trainingUpdates,
      }),
    }));
    setSavedMessage("");
  }

  function updateScheduleMetadata(trainingUpdates: Record<string, string>) {
    if (!confirmScheduleStructureEdit()) return;
    updateTrainingMetadata(trainingUpdates);
  }

  function updateEventNoteLine(label: string, value: string, options?: { scheduleDefining?: boolean }) {
    if (options?.scheduleDefining && !confirmScheduleStructureEdit()) return;
    setEventEdit((current) => ({
      ...current,
      notes: upsertSettingsNoteLine(current.notes, label, value),
    }));
    setSavedMessage("");
  }

  function updateVirtualAccessField(field: "training_url" | "event_url", value: string) {
    const metadata = parseEventMetadata(eventEdit.notes).training;
    const current = parseSettingsVirtualAccess(metadata.virtual_access);
    const next = {
      ...current,
      [field]: value,
    };
    updateTrainingMetadata({
      virtual_access: stringifySettingsVirtualAccess(next),
      ...(field === "training_url" ? { training_zoom_link: text(value) } : {}),
      ...(field === "event_url" ? { zoom_url: text(value) } : {}),
    });
  }

  function updateStudentInstructionsConfig(
    partial: Partial<ReturnType<typeof normalizeStudentInstructionsConfig>>
  ) {
    const nextConfig = normalizeStudentInstructionsConfig({
      ...studentInstructionsConfig,
      ...partial,
    });
    updateInstructionNotes({
      student_instructions_config: serializeStudentInstructionsConfig(nextConfig),
    });
  }

  function resetStudentInstructionsTemplate() {
    const nextConfig = buildDefaultSettingsStudentInstructionsConfig({
      ...eventEdit,
      notes: upsertEventMetadata(eventEdit.notes, {
        training: { student_instructions_config: "" },
      }),
    });
    updateInstructionNotes({
      student_instructions_config: serializeStudentInstructionsConfig(nextConfig),
    });
  }

  function updateFacultySimOpsInstructionsConfig(
    partial: Partial<ReturnType<typeof normalizeFacultySimOpsInstructionsConfig>>
  ) {
    const nextConfig = normalizeFacultySimOpsInstructionsConfig({
      ...facultySimOpsInstructionsConfig,
      ...partial,
    });
    updateInstructionNotes({
      faculty_simops_instructions_config: serializeFacultySimOpsInstructionsConfig(nextConfig),
    });
  }

  function resetFacultySimOpsInstructionsTemplate() {
    updateInstructionNotes({
      faculty_simops_instructions_config: serializeFacultySimOpsInstructionsConfig(
        DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_CONFIG
      ),
    });
  }

  async function saveEvent() {
    setSavedMessage("");
    setErrorMessage("");

    if (!eventId) {
      setErrorMessage("No event is selected. Go back to the event and open Advanced Event Admin from there.");
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
      title="Advanced Event Admin"
      subtitle="Legacy/admin tools for this event. Use Event Settings for normal event setup."
    >
      <div className="grid gap-5">
        <section
          className="rounded-[24px] border p-5"
          style={{
            borderColor: "rgba(20, 91, 150, 0.18)",
            background: "radial-gradient(circle at 10% 0%, rgba(125, 211, 252, 0.2), transparent 32%), linear-gradient(135deg, rgba(247,253,255,0.98), rgba(236,253,245,0.86))",
          }}
        >
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black leading-6 text-amber-900">
            This is the advanced/admin event editor. For normal event setup, use Event Settings.
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="cfsp-kicker">Legacy/admin tools</p>
              <h1 className="mt-1 text-2xl font-black text-[#145b96]">
                Advanced Event Admin
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#466477]">
                Legacy/admin tools for this event. Use Event Settings for normal event setup.
              </p>
              {eventEdit.name ? <p className="mt-2 text-sm font-black text-[#145b96]">{eventEdit.name}</p> : null}
              {roleLabel ? <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#466477]">Current role: {roleLabel}</p> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={eventId ? `/events/${encodeURIComponent(eventId)}/edit` : "/events"}
                className="cfsp-btn cfsp-btn-primary"
              >
                Open Event Settings
              </Link>
              <Link href={eventHref} className="cfsp-btn cfsp-btn-secondary">
                {eventId ? "Back to Event" : "Open Events"}
              </Link>
              {canManageUsersAccess ? (
                <Link href="/settings/users" className="cfsp-btn cfsp-btn-secondary">
                  Users &amp; Access
                </Link>
              ) : null}
              <button
                type="button"
                onClick={saveEvent}
                disabled={loading || saving || !canEdit || !eventId}
                className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Advanced Admin Changes"}
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
          <div className="grid gap-5">
            <CollapsibleSettingsSection
              id="event-structure"
              title="Event Structure"
              detail="Duplicate this event, create a related follow-up simulation, or add another date/session."
              kicker="Admin structure"
              expanded={expandedSections["event-structure"]}
              onToggle={toggleSection}
            >
              <EventStructureActionsPanel
                eventId={eventId}
                eventName={eventEdit.name}
                eventLocation={eventEdit.location}
                eventVisibility={eventEdit.visibility}
                eventNotes={eventEdit.notes}
                sessions={eventSessions}
                canManage={canEdit}
                variant="settings"
                onDataChanged={async () => {
                  const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, { cache: "no-store" });
                  const eventPayload = await response.json();
                  const nextEvent = extractEvent(eventPayload);
                  if (nextEvent) {
                    setEventEdit(hydrateEvent(nextEvent));
                    setEventSessions(
                      Array.isArray((eventPayload as { sessions?: unknown }).sessions)
                        ? ((eventPayload as { sessions?: EventSessionRow[] }).sessions || [])
                        : []
                    );
                  }
                }}
              />
              <PushRelatedEventsSettingsPanel eventId={eventId} eventName={eventEdit.name} canManage={canEdit} />
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="announcement-schedule"
              title="Announcement Schedule"
              detail="Configure schedule-linked operational announcement cues used by Live Attendance, Schedule Builder exports, and event copies."
              kicker="Live operations"
              expanded={expandedSections["announcement-schedule"]}
              onToggle={toggleSection}
            >
              <AnnouncementScheduleManager
                eventId={eventId}
                eventNotes={eventEdit.notes}
                sessions={eventSessions}
                canEdit={canEdit}
                onNotesChange={(nextNotes) => setEventEdit((current) => ({ ...current, notes: nextNotes }))}
              />
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="email-templates"
              title="Email Templates"
              detail="Manage reusable CFSP plain-text templates with merge fields. SP recipient lists stay in Bcc when event drafts open."
              kicker="Communication Settings"
              expanded={expandedSections["email-templates"]}
              onToggle={toggleSection}
            >
              <EmailTemplatesManager canEdit={canEdit} event={eventEdit} sessions={eventSessions} />
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="sp-communication"
              title="SP Communication"
              detail="Set organization defaults for portal, email, Microsoft Forms, and manual SP workflows."
              kicker="Communication Settings"
              expanded={expandedSections["sp-communication"]}
              onToggle={toggleSection}
            >
              <SpCommunicationSettingsPanel canEdit={canEdit} />
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="instruction-templates"
              title="Instruction Templates"
              detail="Edit the saved Student Instructions and Faculty / SimOps Instructions content used by schedule packet exports for this event."
              kicker="Export Settings"
              expanded={expandedSections["instruction-templates"]}
              onToggle={toggleSection}
            >
              <div className="grid gap-4">
                <section className="rounded-2xl border border-[var(--cfsp-border)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="cfsp-kicker">Student Instructions Template</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">
                        These values feed the learner-facing instructions packet. Student exports continue to use only the Student Schedule and learner-visible details.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetStudentInstructionsTemplate}
                      disabled={!canEdit}
                      className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset Student Defaults
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Field label="Title / Header" value={studentInstructionsConfig.title} onChange={(value) => updateStudentInstructionsConfig({ title: value })} placeholder={eventEdit.name || "PROGRAM"} />
                    <Field label="Zoom Link / Access" value={studentInstructionsConfig.zoomLink} onChange={(value) => updateStudentInstructionsConfig({ zoomLink: value })} placeholder="https://drexel.zoom.us/..." />
                    <Field label="Join Offset Minutes" value={String(studentInstructionsConfig.joinOffsetMinutes)} onChange={(value) => updateStudentInstructionsConfig({ joinOffsetMinutes: Number.parseInt(value, 10) || 0 })} />
                    <Field label="Time Zone Note" value={studentInstructionsConfig.timeZoneNote} onChange={(value) => updateStudentInstructionsConfig({ timeZoneNote: value })} />
                    <Field label="Encounter Time Detail" value={studentInstructionsConfig.encounterTimeDetail} onChange={(value) => updateStudentInstructionsConfig({ encounterTimeDetail: value })} placeholder="Uses generated schedule duration when blank" />
                    <Field label="Feedback Time Detail" value={studentInstructionsConfig.feedbackTimeDetail} onChange={(value) => updateStudentInstructionsConfig({ feedbackTimeDetail: value })} placeholder="Uses generated schedule duration when blank" />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <TextAreaField label="Join Instructions" value={studentInstructionsConfig.joinInstructions} onChange={(value) => updateStudentInstructionsConfig({ joinInstructions: value })} />
                    <TextAreaField label="Waiting Room Note" value={studentInstructionsConfig.waitingRoomNote} onChange={(value) => updateStudentInstructionsConfig({ waitingRoomNote: value })} />
                    <TextAreaField label="Professional Video / Netiquette" value={studentInstructionsConfig.netiquetteInstructions} onChange={(value) => updateStudentInstructionsConfig({ netiquetteInstructions: value })} />
                    <TextAreaField label="Pre-Brief Instructions" value={studentInstructionsConfig.prebriefInstructions} onChange={(value) => updateStudentInstructionsConfig({ prebriefInstructions: value })} />
                    <TextAreaField label="Scenario-Specific Reminders" value={studentInstructionsConfig.scenarioReminders} onChange={(value) => updateStudentInstructionsConfig({ scenarioReminders: value })} placeholder="Optional" />
                    <TextAreaField label="Footer / Disclaimer" value={studentInstructionsConfig.footerNote} onChange={(value) => updateStudentInstructionsConfig({ footerNote: value })} />
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--cfsp-border)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="cfsp-kicker">Faculty / SimOps Instructions</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-[var(--cfsp-text-muted)]">
                        This template feeds the staff-facing packet. Faculty / SimOps exports use the Admin Schedule and may include admin-visible operational schedule details.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={resetFacultySimOpsInstructionsTemplate}
                      disabled={!canEdit}
                      className="cfsp-btn cfsp-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset Faculty / SimOps Defaults
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <TextAreaField
                      label="Faculty / SimOps Instructions Template"
                      value={facultySimOpsInstructionsConfig.template}
                      onChange={(value) => updateFacultySimOpsInstructionsConfig({ template: value })}
                    />
                    <TextAreaField
                      label="Footer / Disclaimer"
                      value={facultySimOpsInstructionsConfig.footerNote}
                      onChange={(value) => updateFacultySimOpsInstructionsConfig({ footerNote: value })}
                    />
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-[var(--cfsp-text-muted)]">
                    Use the main Save Advanced Admin Changes button above to persist instruction template edits for this event.
                  </p>
                </section>
              </div>
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="session-checklist"
              title="Session Checklist Settings"
              detail="Configure Planning and Day-of operational tasks that drive the QA board in Event Command Center."
              expanded={expandedSections["session-checklist"]}
              onToggle={toggleSection}
            >
              <SessionChecklistManager
                canEdit={canEdit}
                eventId={eventId}
                eventNotes={eventEdit.notes}
                eventDateText={eventEdit.dateText}
                sessions={eventSessions}
                onNotesChange={(nextNotes) => setEventEdit((current) => ({ ...current, notes: nextNotes }))}
              />
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="core-event-details"
              title="Advanced Core Event Record"
              detail="Legacy/admin edits to the event record. Use Event Settings for normal title, date, location, status, visibility, and SP need changes."
              expanded={expandedSections["core-event-details"]}
              onToggle={toggleSection}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Event name / title" value={eventEdit.name} onChange={(value) => update("name", value)} />
                <Field label="Date text" value={eventEdit.dateText} onChange={(value) => update("dateText", value)} placeholder="Example: 06/26/2026" />
                <Field label="Location" value={eventEdit.location} onChange={(value) => update("location", value)} />
                <Field label="SPs needed" value={eventEdit.spNeeded} onChange={(value) => update("spNeeded", value.replace(/[^0-9]/g, ""))} />
                <Field label="Status" value={eventEdit.status} onChange={(value) => update("status", value)} />
                <Field label="Visibility" value={eventEdit.visibility} onChange={(value) => update("visibility", value)} />
              </div>
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="operational-notes"
              title="Advanced Operational Notes"
              detail="Advanced/admin metadata used by command center parsing, staffing context, and operational reminders."
              expanded={expandedSections["operational-notes"]}
              onToggle={toggleSection}
            >
              <TextAreaField
                label="Advanced operational notes / metadata. Do not edit unless you know what this controls."
                value={eventEdit.notes}
                onChange={(value) => update("notes", value)}
                placeholder="Advanced metadata, operational reminders, ownership parsing, staffing context, support needs, etc."
              />
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="faculty-requests"
              title="Faculty Requests"
              detail="Track exactly what faculty requested for this event."
              expanded={expandedSections["faculty-requests"]}
              onToggle={toggleSection}
            >
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
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="staffing-requirements"
              title="Staffing Requirements"
              detail="Configure SP hiring and staffing needs for this event."
              expanded={expandedSections["staffing-requirements"]}
              onToggle={toggleSection}
            >
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
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="room-simulation-setup"
              title="Room & Simulation Setup"
              detail="Capture the room setup, sim equipment, moulage, and operational layout needs."
              expanded={expandedSections["room-simulation-setup"]}
              onToggle={toggleSection}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label="Room count"
                  value={settingsScheduleTruth.roomCount ? String(settingsScheduleTruth.roomCount) : ""}
                  onChange={(value) => updateScheduleMetadata({ schedule_room_count: value.replace(/[^0-9]/g, "") })}
                  placeholder="8"
                />
                <Field
                  label="Students per room"
                  value={settingsScheduleTruth.studentsPerRoom ? String(settingsScheduleTruth.studentsPerRoom) : ""}
                  onChange={(value) => updateScheduleMetadata({ schedule_room_capacity: value.replace(/[^0-9]/g, "") })}
                  placeholder="1"
                />
                <Field
                  label="Learner / student count"
                  value={settingsScheduleTruth.learnerCount ? String(settingsScheduleTruth.learnerCount) : ""}
                  onChange={(value) => updateScheduleMetadata({ schedule_learner_count: value.replace(/[^0-9]/g, "") })}
                  placeholder="Student count"
                />
                <Field
                  label="Schedule status"
                  value={settingsScheduleTruth.status || "Not started"}
                  onChange={(value) => updateTrainingMetadata({ schedule_status: value })}
                  placeholder="in_progress / complete"
                />
                <div className="md:col-span-2">
                  <TextAreaField
                    label="Room list / room names"
                    value={settingsScheduleTruth.roomNames.join("\n")}
                    onChange={(value) => updateEventNoteLine("Room Names", value, { scheduleDefining: true })}
                    placeholder="Exam 1&#10;Exam 2&#10;Exam 3"
                  />
                </div>
                <div className="md:col-span-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
                  Source: {settingsScheduleTruth.sourceLabel}
                  {completedSchedulePresent ? " - editing these fields will not overwrite the completed schedule unless you explicitly regenerate it from Event Setup later." : ""}
                </div>
                <Field label="Equipment needs" value={getFirstSettingsNoteLineValue(eventEdit.notes, ["Equipment Needs"])} onChange={(value) => updateEventNoteLine("Equipment Needs", value)} />
                <Field label="Simulator / manikin needs" value={getFirstSettingsNoteLineValue(eventEdit.notes, ["Simulator Needs", "Manikin Needs"])} onChange={(value) => updateEventNoteLine("Simulator Needs", value)} />
                <Field label="Task trainer needs" value={getFirstSettingsNoteLineValue(eventEdit.notes, ["Task Trainer Needs"])} onChange={(value) => updateEventNoteLine("Task Trainer Needs", value)} />
                <Field label="Moulage needs" value={getFirstSettingsNoteLineValue(eventEdit.notes, ["Moulage Needs"])} onChange={(value) => updateEventNoteLine("Moulage Needs", value)} />
              </div>
            </CollapsibleSettingsSection>

            <CollapsibleSettingsSection
              id="training-materials-tech"
              title="Training, Materials & Tech"
              detail="Readiness controls for training, prep materials, recording, Zoom, and SimulationIQ."
              expanded={expandedSections["training-materials-tech"]}
              onToggle={toggleSection}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label="Training date"
                  value={settingsTrainingTruth.trainingDate}
                  onChange={(value) => updateTrainingMetadata({ training_date: value, preferred_training_date: value })}
                  placeholder="2026-07-01"
                />
                <Field
                  label="Training status"
                  value={settingsTrainingTruth.trainingStatus || "Training TBD"}
                  onChange={(value) => updateTrainingMetadata({ training_scheduling_status: value })}
                  placeholder="Training Scheduled"
                />
                <Field
                  label="Training start time"
                  value={settingsTrainingTruth.trainingStartTime}
                  onChange={(value) => updateTrainingMetadata({ training_start_time: value, preferred_training_time: value })}
                  placeholder="10:00"
                />
                <Field
                  label="Training end time"
                  value={settingsTrainingTruth.trainingEndTime}
                  onChange={(value) => updateTrainingMetadata({ training_end_time: value, preferred_training_end_time: value })}
                  placeholder="11:00"
                />
                <Field
                  label="Training Zoom URL"
                  value={settingsTrainingTruth.trainingUrl}
                  onChange={(value) => updateVirtualAccessField("training_url", value)}
                  placeholder="https://drexel.zoom.us/..."
                />
                <Field
                  label="Event Zoom URL"
                  value={settingsTrainingTruth.eventUrl}
                  onChange={(value) => updateVirtualAccessField("event_url", value)}
                  placeholder="https://drexel.zoom.us/..."
                />
                <Field label="Training recording link" value={settingsTrainingTruth.trainingRecordingUrl} onChange={(value) => updateTrainingMetadata({ training_recording_url: value, recording_url: value })} />
                <Field label="SimulationIQ / recording status" value={settingsTrainingTruth.recordingStatus} onChange={(value) => updateTrainingMetadata({ training_recording_status: value, recording_status: value, event_recording_status: value })} />
                {settingsTrainingTruth.importedTrainingTime && !settingsTrainingTruth.trainingStartTime ? (
                  <div className="md:col-span-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
                    Imported training time: {settingsTrainingTruth.importedTrainingTime}
                  </div>
                ) : null}
                <div className="md:col-span-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800">
                  Source: {settingsTrainingTruth.sourceLabel} · Virtual access: {settingsTrainingTruth.virtualSourceLabel}
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input
                    type="checkbox"
                    checked={settingsTrainingTruth.trainingRequired}
                    onChange={(e) => updateTrainingMetadata({
                      training_required: e.target.checked ? "yes" : "no",
                      training_scheduling_status: e.target.checked && !settingsTrainingTruth.trainingStatus ? "Training Scheduled" : settingsTrainingTruth.trainingStatus,
                    })}
                  />
                  Training required
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" checked={settingsTrainingTruth.materialsReady} onChange={(e) => updateEventNoteLine("Materials Ready", e.target.checked ? "yes" : "no")} />
                  Materials ready
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" checked={settingsTrainingTruth.doorSignReady} onChange={(e) => updateEventNoteLine("Door Sign Ready", e.target.checked ? "yes" : "no")} />
                  Door sign ready
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-[var(--cfsp-border)] bg-white px-3 py-3 text-sm font-black text-[var(--cfsp-text)]">
                  <input type="checkbox" checked={settingsTrainingTruth.caseFileReady} onChange={(e) => updateEventNoteLine("Case File Ready", e.target.checked ? "yes" : "no")} />
                  Case file ready
                </label>
              </div>
            </CollapsibleSettingsSection>
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
