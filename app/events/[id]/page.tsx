"use client";

import * as XLSX from "xlsx";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SiteShell from "../../components/SiteShell";
import {
  formatHumanDate,
  getImportedYearHint,
  normalizeLooseDateToIso,
} from "../../lib/eventDateUtils";
import {
  classifyEventPresentation,
  getEventBadgeAppearance,
  isSkillsWorkshopEvent,
  type EventDisplayType,
} from "../../lib/eventClassification";
import { formatDisplayTime, parseTimeToMinutes } from "../../lib/timeFormat";
import {
  editableEventTypeLabels,
  getExplicitEventTypes,
  upsertEventTypesInNotes,
  type EditableEventType,
} from "../../lib/eventTypeNotes";
import {
  getFacultyText,
  getSimStaffNames,
} from "../../lib/eventRoster";
import {
  parseTrainingEventMetadata,
  upsertTrainingEventMetadata,
  type TrainingEventMetadata,
} from "../../lib/trainingEventNotes";

type EventDetailRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed: number | null;
  visibility: string | null;
  location: string | null;
  notes: string | null;
  created_at: string | null;
};

type EventSessionRow = {
  id: string;
  event_id: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  room: string | null;
  created_at: string | null;
};
type RotationRound = {
  key: string;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  rooms: string[];
};
type SPRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  schedule_name?: string | null;
  working_email: string | null;
  email: string | null;
  phone: string | null;
  portrayal_age: string | null;
  race: string | null;
  sex: string | null;
  telehealth: string | null;
  pt_preferred: string | null;
  other_roles: string | null;
  speaks_spanish: string | boolean | null;
  notes: string | null;
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
  training_attended?: boolean | null;
  training_checked_in_at?: string | null;
};

type AvailabilityRow = {
  id?: string | number | null;
  sp_id?: string | number | null;
  date?: string | null;
  availability_date?: string | null;
  start_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
  availability_status?: string | null;
  available?: boolean | null;
  notes?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

type AssignmentStatus =
  | "invited"
  | "contacted"
  | "confirmed"
  | "declined"
  | "backup"
  | "no_show";

type ContactMethod = "call" | "text" | "email";
type AssignmentFilterStatus = "all" | "invited" | "confirmed" | "backup" | "declined";
type SuggestedAssignmentFilter = "all" | "available" | "confirmed" | "needs_outreach" | "backup";
type PollLocationFilter = "any" | "elkins_park" | "center_city" | "virtual";
type CommandCenterMode = "planning" | "live";
type RotationCompanionView = "announcements" | "student" | "sp" | "operations";
type LiveRoomStatusValue = "ready" | "in_session" | "delayed" | "empty" | "sp_missing" | "complete";
type AssignSpOptions = {
  status?: AssignmentStatus;
  confirmed?: boolean;
  notesBySpId?: Record<string, string>;
};
type AddAssignmentOptions = {
  status?: AssignmentStatus;
  confirmed?: boolean;
  notes?: string;
  successMessage?: string;
};

type AvailabilityMatchStatus =
  | "available"
  | "partial"
  | "none"
  | "unknown";

type AvailabilityMatchDetails = {
  status: AvailabilityMatchStatus;
  matchedSessions: number;
  totalSessions: number;
  reason: string;
};

type LiveRoomLocalState = {
  status?: LiveRoomStatusValue;
  delayMinutes?: number;
  issueNote?: string;
};

type CommandCenterData = {
  event: EventDetailRow | null;
  sessions: EventSessionRow[];
  sps: SPRow[];
  assignments: AssignmentRow[];
  availabilityRows: AvailabilityRow[];
  viewerRole?: "sp" | "sim_op" | "admin" | "super_admin" | "unknown";
  spPortal?: {
    sp_link_status?: string | null;
    assigned_sp_name?: string | null;
    faculty_name?: string | null;
    faculty_email?: string | null;
    faculty_phone?: string | null;
    program?: string | null;
    sim_contact?: string | null;
    zoom_url?: string | null;
    training_password?: string | null;
    recording_url?: string | null;
    session_dates?: string[] | null;
    materials?: Array<{ key: string; label: string; url: string; name?: string | null }>;
  } | null;
  errorMessage: string;
  sessionErrorMessage: string;
  availabilityErrorMessage: string;
  accessDenied: boolean;
  notFound: boolean;
};

type EventEditorState = {
  name: string;
  status: string;
  visibility: string;
  location: string;
  notes: string;
  sp_needed: string;
};

type SessionEditorState = {
  session_date: string;
  start_time: string;
  end_time: string;
};

type WorkflowGroupKey =
  | "planning"
  | "staffing"
  | "schedule"
  | "platform"
  | "day_of"
  | "wrap_up";

type TrainingImportResult = {
  eventTitle: string;
  matchedAssigned: string[];
  alreadyAssigned: string[];
  notFound: string[];
  facultyDetected: string[];
  importedAt: string;
  importedCount: number;
  confirmedCount: number;
  trainingDate: string;
  trainingTime: string;
  eventDatesDetected: string[];
  eventTimesDetected: string[];
};

type TrainingMaterialKind = "case_file" | "doorsign" | "supplemental_doc" | "staffing_doc";
type MaterialPreviewKind = "pdf" | "image" | "text" | "iframe" | "unsupported";
type MaterialPreviewState = {
  title: string;
  previewUrl: string;
  downloadUrl: string;
  openInNewTabUrl: string;
  fileName: string;
  kind: MaterialPreviewKind;
};
type PollMetadata = {
  pollCreatedAt: string;
  pollSentAt: string;
  pollSelectedSpIds: string;
  pollSelectedSpEmails: string;
  pollStatus: string;
  excludedSpIds: string;
  excludedSpEmails: string;
  importedPollResponses: string;
  pollImportCreatedAt: string;
  pollImportSource: string;
};
type PollResponseMetadata = {
  responseStatus: string;
  responseNote: string;
  responseSubmittedAt: string;
};
type PollResponseStatus = "available" | "maybe" | "not_available" | "no_response";
type ImportedPollMatchType = "email" | "name" | "unmatched";
type ImportedPollResponseRecord = {
  name: string;
  email: string;
  normalizedEmail: string;
  responseStatus: PollResponseStatus;
  responseLabel: string;
  responseSubmittedAt: string;
  responseNote: string;
  matchedSpId: string;
  matchedSpEmail: string;
  matchedSpName: string;
  matchType: ImportedPollMatchType;
  matchConfidence: number;
  rawAnswer: string;
};
type PollImportDebugInfo = {
  detectedHeaders: string[];
  matchedNameHeader: string;
  matchedEmailHeader: string;
  matchedSpIdHeader: string;
  matchedTrainingResponseHeader: string;
  matchedEventResponseHeader: string;
  matchedNotesHeader: string;
  matchedResponseHeaders: string[];
  sampleRows: Array<Record<string, string>>;
};
type PollMatchSort = "best_match" | "name" | "email_ready" | "recently_responded" | "assigned_last";
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

const emptySpRow: SPRow = {
  id: "",
  first_name: null,
  last_name: null,
  full_name: null,
  working_email: null,
  email: null,
  phone: null,
  portrayal_age: null,
  race: null,
  sex: null,
  telehealth: null,
  pt_preferred: null,
  other_roles: null,
  speaks_spanish: null,
  notes: null,
  status: null,
};

const cardStyle: React.CSSProperties = {
  background: "var(--cfsp-surface)",
  border: "1px solid var(--cfsp-border)",
  borderRadius: "20px",
  padding: "16px",
  boxShadow: "var(--cfsp-shadow)",
  marginBottom: "14px",
};

const statCard: React.CSSProperties = {
  border: "1px solid var(--cfsp-border)",
  borderRadius: "14px",
  padding: "11px 12px",
  background: "var(--cfsp-surface-muted)",
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "var(--cfsp-text-muted)",
  textTransform: "uppercase",
};

const statValue: React.CSSProperties = {
  fontSize: "17px",
  fontWeight: 800,
  color: "var(--cfsp-text)",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid var(--cfsp-blue)",
  borderRadius: "12px",
  background: "var(--cfsp-blue)",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
  padding: "10px 14px",
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "var(--cfsp-danger-soft)",
  color: "var(--cfsp-danger)",
  border: "1px solid var(--cfsp-danger-border)",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  border: "1px solid var(--cfsp-border-strong)",
  borderRadius: "12px",
  padding: "11px 12px",
  color: "var(--cfsp-text)",
  background: "var(--cfsp-surface)",
  fontWeight: 700,
};

const detailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "10px",
  marginTop: "10px",
};

const compactSectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--cfsp-text)",
  fontSize: "22px",
  lineHeight: 1.1,
};

const compactSectionHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "var(--cfsp-text-muted)",
  fontWeight: 700,
  fontSize: "13px",
};

const segmentedGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: "6px",
  padding: "4px",
  borderRadius: "999px",
  border: "1px solid var(--cfsp-border)",
  background: "var(--cfsp-surface-muted)",
};

const commandChipStyle: React.CSSProperties = {
  borderRadius: "999px",
  padding: "5px 10px",
  border: "1px solid rgba(61, 201, 184, 0.28)",
  background: "rgba(24, 48, 67, 0.72)",
  color: "#7ee7db",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const planningSuccessBackground = "linear-gradient(180deg, rgba(187, 247, 208, 0.94) 0%, rgba(134, 239, 172, 0.8) 100%)";
const planningSuccessCardBackground = "linear-gradient(180deg, rgba(220, 252, 231, 0.96) 0%, rgba(187, 247, 208, 0.82) 100%)";
const planningSuccessBorder = "1px solid rgba(4, 120, 87, 0.38)";
const planningSuccessText = "#064e3b";

const recordingStatusOptions = [
  { value: "not_recorded", label: "Not Recorded", active: false, tone: "#94a3b8", chip: "Disabled" },
  { value: "recorded", label: "Recorded", active: true, tone: "#ff6b6b", chip: "Recorded" },
  { value: "recording_planned", label: "Recording Planned", active: true, tone: "#49a8ff", chip: "Planned" },
  { value: "recording_pending", label: "Recording Pending", active: true, tone: "#f59e0b", chip: "Pending" },
  { value: "recording_not_allowed", label: "Recording Not Allowed", active: false, tone: "#ef4444", chip: "Not allowed" },
] as const;

type RecordingStatusValue = (typeof recordingStatusOptions)[number]["value"];

const assignmentStatuses: AssignmentStatus[] = [
  "invited",
  "contacted",
  "confirmed",
  "declined",
  "backup",
  "no_show",
];

const trainingMaterialFieldMap: Record<
  TrainingMaterialKind,
  {
    label: string;
    urlKey:
      | "case_file_url"
      | "doorsign_url"
      | "supplemental_doc_url"
      | "staffing_doc_url";
    nameKey:
      | "case_file_name"
      | "doorsign_file_name"
      | "supplemental_doc_name"
      | "staffing_doc_name";
    storagePathKey:
      | "case_file_storage_path"
      | "doorsign_storage_path"
      | "supplemental_doc_storage_path"
      | "staffing_doc_storage_path";
    uploadedAtKey:
      | "case_file_uploaded_at"
      | "doorsign_uploaded_at"
      | "supplemental_doc_uploaded_at"
      | "staffing_doc_uploaded_at";
    uploadedByKey:
      | "case_file_uploaded_by"
      | "doorsign_uploaded_by"
      | "supplemental_doc_uploaded_by"
      | "staffing_doc_uploaded_by";
  }
> = {
  case_file: {
    label: "Case File",
    urlKey: "case_file_url",
    nameKey: "case_file_name",
    storagePathKey: "case_file_storage_path",
    uploadedAtKey: "case_file_uploaded_at",
    uploadedByKey: "case_file_uploaded_by",
  },
  doorsign: {
    label: "Doorsign",
    urlKey: "doorsign_url",
    nameKey: "doorsign_file_name",
    storagePathKey: "doorsign_storage_path",
    uploadedAtKey: "doorsign_uploaded_at",
    uploadedByKey: "doorsign_uploaded_by",
  },
  supplemental_doc: {
    label: "Supplemental Doc",
    urlKey: "supplemental_doc_url",
    nameKey: "supplemental_doc_name",
    storagePathKey: "supplemental_doc_storage_path",
    uploadedAtKey: "supplemental_doc_uploaded_at",
    uploadedByKey: "supplemental_doc_uploaded_by",
  },
  staffing_doc: {
    label: "Staffing Doc",
    urlKey: "staffing_doc_url",
    nameKey: "staffing_doc_name",
    storagePathKey: "staffing_doc_storage_path",
    uploadedAtKey: "staffing_doc_uploaded_at",
    uploadedByKey: "staffing_doc_uploaded_by",
  },
};

const staffingDocumentAccept =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

const relatedCopyOptionLabels: Record<RelatedCopyOption, string> = {
  assigned_sps: "Selected SPs",
  training_materials: "Training metadata/materials",
  faculty: "Faculty",
  zoom_recording: "Zoom/recording info",
  sim_contact: "Sim contact",
  case_doorsign: "Case/doorsign",
};

const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  invited: "Invited",
  contacted: "Contacted",
  confirmed: "Confirmed",
  declined: "Declined",
  backup: "Backup",
  no_show: "No-show",
};

function isSelectedStaffingStatus(status: AssignmentStatus | null | undefined) {
  return status === "confirmed" || status === "backup";
}

function getPlanningStaffingPresenceLabel(status: AssignmentStatus | null | undefined) {
  if (status === "confirmed") return "Primary selected";
  if (status === "backup") return "Backup selected";
  if (status === "invited") return "Poll invite archive";
  if (status === "contacted") return "Contacted";
  if (status === "declined") return "Declined";
  if (status === "no_show") return "No-show";
  return "Not selected";
}

const assignmentStatusStyles: Record<AssignmentStatus, React.CSSProperties> = {
  invited: {
    background: "rgba(73, 168, 255, 0.16)",
    color: "var(--cfsp-blue)",
    border: "1px solid rgba(120, 180, 255, 0.26)",
  },
  contacted: {
    background: "var(--cfsp-warning-soft)",
    color: "var(--cfsp-warning)",
    border: "1px solid rgba(243, 187, 103, 0.24)",
  },
  confirmed: {
    background: "var(--cfsp-green-soft)",
    color: "var(--cfsp-green)",
    border: "1px solid rgba(44, 211, 173, 0.24)",
  },
  declined: {
    background: "var(--cfsp-danger-soft)",
    color: "var(--cfsp-danger)",
    border: "1px solid var(--cfsp-danger-border)",
  },
  backup: {
    background: "var(--cfsp-warning-soft)",
    color: "var(--cfsp-warning)",
    border: "1px solid rgba(243, 187, 103, 0.24)",
  },
  no_show: {
    background: "rgba(168, 183, 204, 0.12)",
    color: "var(--cfsp-text-muted)",
    border: "1px solid var(--cfsp-border)",
  },
};
const confirmationStyles = {
  confirmed: {
    background: "rgba(73, 168, 255, 0.18)",
    color: "#ffffff",
    border: "1px solid rgba(120, 180, 255, 0.28)",
  },
  pending: {
    background: "var(--cfsp-warning-soft)",
    color: "var(--cfsp-warning)",
    border: "1px solid rgba(243, 187, 103, 0.24)",
  },
} satisfies Record<"confirmed" | "pending", React.CSSProperties>;

const skillsWorkshopBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  padding: "6px 10px",
  background: "rgba(44, 211, 173, 0.14)",
  border: "1px solid rgba(44, 211, 173, 0.22)",
  color: "var(--cfsp-green)",
  fontWeight: 900,
  fontSize: "12px",
};

const availabilityMatchLabels: Record<AvailabilityMatchStatus, string> = {
  available: "Available",
  partial: "Partial",
  none: "Conflict",
  unknown: "Unknown",
};

const availabilityMatchStyles: Record<AvailabilityMatchStatus, React.CSSProperties> = {
  available: {
    background: "var(--cfsp-green-soft)",
    color: "var(--cfsp-green)",
    border: "1px solid rgba(44, 211, 173, 0.24)",
  },
  partial: {
    background: "var(--cfsp-warning-soft)",
    color: "var(--cfsp-warning)",
    border: "1px solid rgba(243, 187, 103, 0.24)",
  },
  none: {
    background: "var(--cfsp-danger-soft)",
    color: "var(--cfsp-danger)",
    border: "1px solid var(--cfsp-danger-border)",
  },
  unknown: {
    background: "rgba(168, 183, 204, 0.12)",
    color: "var(--cfsp-text-muted)",
    border: "1px solid var(--cfsp-border)",
  },
};

const liveRoomStatusAppearance: Record<
  LiveRoomStatusValue,
  { label: string; background: string; color: string; border: string }
> = {
  ready: {
    label: "Ready",
    background: "rgba(59, 130, 246, 0.14)",
    color: "#93c5fd",
    border: "1px solid rgba(96, 165, 250, 0.28)",
  },
  in_session: {
    label: "In Session",
    background: "rgba(44, 211, 173, 0.14)",
    color: "#86efac",
    border: "1px solid rgba(44, 211, 173, 0.24)",
  },
  delayed: {
    label: "Delayed",
    background: "rgba(243, 187, 103, 0.14)",
    color: "#fde68a",
    border: "1px solid rgba(243, 187, 103, 0.24)",
  },
  empty: {
    label: "Empty",
    background: "rgba(168, 183, 204, 0.12)",
    color: "#cbd5e1",
    border: "1px solid rgba(168, 183, 204, 0.22)",
  },
  sp_missing: {
    label: "SP Missing",
    background: "rgba(248, 113, 113, 0.14)",
    color: "#fecaca",
    border: "1px solid rgba(248, 113, 113, 0.24)",
  },
  complete: {
    label: "Complete",
    background: "rgba(45, 212, 191, 0.14)",
    color: "#99f6e4",
    border: "1px solid rgba(45, 212, 191, 0.24)",
  },
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--cfsp-border-strong)",
  borderRadius: "12px",
  padding: "10px 12px",
  color: "var(--cfsp-text)",
  background: "var(--cfsp-surface)",
  fontWeight: 700,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
  minHeight: "72px",
  resize: "vertical",
  boxSizing: "border-box",
  fontWeight: 600,
  lineHeight: 1.5,
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRecordingStatusValue(value: unknown): RecordingStatusValue | "" {
  const normalized = asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized) return "";
  if (normalized === "not_recorded" || normalized === "disabled") return "not_recorded";
  if (
    normalized === "recorded" ||
    normalized === "recording_enabled" ||
    normalized === "recording_live" ||
    normalized === "live_recording"
  ) {
    return "recorded";
  }
  if (normalized === "recording_planned" || normalized === "planned") return "recording_planned";
  if (normalized === "recording_pending" || normalized === "pending") return "recording_pending";
  if (normalized === "recording_not_allowed" || normalized === "not_allowed") return "recording_not_allowed";
  return "";
}

function getRecordingStatusOption(value: unknown) {
  const normalized = normalizeRecordingStatusValue(value);
  return normalized
    ? recordingStatusOptions.find((option) => option.value === normalized) || null
    : null;
}

function RecordingStatusIndicator({
  label,
  compact = false,
  hot = false,
  liveMode = false,
  planningMode = false,
}: {
  label: string;
  compact?: boolean;
  hot?: boolean;
  liveMode?: boolean;
  planningMode?: boolean;
}) {
  const className = [
    "cfsp-recording-indicator",
    compact ? "is-compact" : "",
    hot ? "is-hot" : "",
    liveMode ? "is-live" : "",
    planningMode ? "is-planning" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className} aria-label={`Recording status: ${label}`} title={`Recording status: ${label}`}>
      <span className="cfsp-recording-dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
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

function getEmailSource(sp: SPRow) {
  if (asText(sp.working_email)) return "sps.working_email";
  if (asText(sp.email)) return "sps.email";
  return "";
}

function sortSPs(a: SPRow, b: SPRow) {
  return getFullName(a).localeCompare(getFullName(b));
}

function getCandidateSearchText(sp: SPRow) {
  return [
    getFullName(sp),
    sp.schedule_name,
    getEmail(sp),
    sp.phone,
    sp.notes,
    sp.telehealth,
    sp.pt_preferred,
    sp.other_roles,
  ]
    .map(asText)
    .join(" ")
    .toLowerCase();
}

function isActiveSp(sp: SPRow) {
  const status = asText(sp.status).toLowerCase();
  return !status || status === "active";
}

function speaksSpanish(sp: SPRow) {
  const value = sp.speaks_spanish;
  return value === true || ["yes", "true", "y"].includes(asText(value).toLowerCase());
}

function hasTelehealth(sp: SPRow) {
  return Boolean(asText(sp.telehealth));
}

function hasPtPreferred(sp: SPRow) {
  const value = asText(sp.pt_preferred).toLowerCase();
  return Boolean(value) && !["no", "n", "false"].includes(value);
}

function getAssignmentStatus(assignment: AssignmentRow): AssignmentStatus {
  const rawStatus = asText(assignment.status) as AssignmentStatus;
  if (assignmentStatuses.includes(rawStatus)) return rawStatus;
  return assignment.confirmed === true ? "confirmed" : "invited";
}

function isAssignmentConfirmed(assignment: AssignmentRow) {
  return assignment.confirmed === true || getAssignmentStatus(assignment) === "confirmed";
}

function getCommandCenterAssignmentLabel(assignment: AssignmentRow) {
  const status = getAssignmentStatus(assignment);
  if (status === "confirmed") return "Confirmed";
  if (status === "declined" || status === "no_show") return "Declined";
  if (status === "backup") return "Backup";
  return "Contacted";
}

function getCommandCenterAssignmentTone(assignment: AssignmentRow): "confirmed" | "pending" {
  return isAssignmentConfirmed(assignment) ? "confirmed" : "pending";
}

function getEventTypeButtonStyle(type: EventDisplayType, active: boolean): React.CSSProperties {
  const palettes: Record<EventDisplayType, { background: string; border: string; color: string }> = {
    skills: {
      background: "var(--cfsp-skills-soft)",
      border: "var(--cfsp-skills-border)",
      color: "var(--cfsp-skills-text)",
    },
    sp: {
      background: "rgba(73, 168, 255, 0.14)",
      border: "rgba(120, 180, 255, 0.24)",
      color: "var(--cfsp-blue)",
    },
    hifi: {
      background: "rgba(141, 121, 255, 0.14)",
      border: "rgba(141, 121, 255, 0.24)",
      color: "#b9a7ff",
    },
    training: {
      background: "var(--cfsp-warning-soft)",
      border: "rgba(243, 187, 103, 0.24)",
      color: "var(--cfsp-warning)",
    },
    virtual: {
      background: "rgba(73, 168, 255, 0.14)",
      border: "rgba(120, 180, 255, 0.24)",
      color: "var(--cfsp-blue)",
    },
  };

  const palette = palettes[type];

  return {
    borderRadius: "999px",
    padding: "7px 12px",
    fontWeight: 900,
    fontSize: "12px",
    border: `1px solid ${active ? palette.border : "var(--cfsp-border)"}`,
    background: active ? palette.background : "var(--cfsp-surface)",
    color: active ? palette.color : "var(--cfsp-text-muted)",
    minWidth: "64px",
    textAlign: "center",
  };
}

function getFilenameFromUrl(value: string) {
  const text = asText(value);
  if (!text) return "";
  try {
    const pathname = new URL(text).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return text.split("/").filter(Boolean).pop() || text;
  }
}

function getFileExtension(value: string) {
  const fileName = getFilenameFromUrl(value).toLowerCase();
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "";
}

function getMaterialPreviewKind(fileName: string, url: string): MaterialPreviewKind {
  const extension = (getFileExtension(fileName) || getFileExtension(url)).toLowerCase();
  if (extension === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(extension)) return "image";
  if (["txt", "csv", "log", "json"].includes(extension)) return "text";
  if (["doc", "docx", "xls", "xlsx"].includes(extension)) return "unsupported";
  return "iframe";
}

function buildTrainingMaterialAssetUrls(args: {
  eventId: string;
  rawUrl: string;
  storagePath: string;
  fileName: string;
}) {
  const rawUrl = asText(args.rawUrl);
  const storagePath = asText(args.storagePath);
  const fileName = asText(args.fileName) || getFilenameFromUrl(rawUrl) || "training-material";

  if (!storagePath || !args.eventId) {
    return {
      previewUrl: rawUrl,
      downloadUrl: rawUrl,
      openInNewTabUrl: rawUrl,
      fileName,
    };
  }

  const baseParams = new URLSearchParams({
    eventId: args.eventId,
    path: storagePath,
    filename: fileName,
  });

  return {
    previewUrl: `/api/uploads/training-material?${baseParams.toString()}&mode=preview`,
    downloadUrl: `/api/uploads/training-material?${baseParams.toString()}&mode=download`,
    openInNewTabUrl: `/api/uploads/training-material?${baseParams.toString()}&mode=preview`,
    fileName,
  };
}

function getAvailabilitySpId(row: AvailabilityRow) {
  return asText(row.sp_id);
}

function getAvailabilityDate(row: AvailabilityRow) {
  return (
    asText(row.availability_date) ||
    asText(row.date) ||
    asText(row.start_date) ||
    "Date TBD"
  );
}

function normalizeDateValue(value?: string | null, fallbackYear?: number | null) {
  return normalizeLooseDateToIso(value, fallbackYear) || "";
}

function getAvailabilityStatus(row: AvailabilityRow) {
  if (typeof row.available === "boolean") {
    return row.available ? "Available" : "Unavailable";
  }

  return (
    asText(row.availability_status) ||
    asText(row.status) ||
    "Availability noted"
  );
}

function getAvailabilityState(row: AvailabilityRow) {
  if (typeof row.available === "boolean") {
    return row.available ? "available" : "unavailable";
  }
  const status = asText(row.availability_status || row.status).toLowerCase();
  if (!status) return "unknown";
  if (
    ["unavailable", "no", "false", "busy", "blocked"].includes(status) ||
    status.includes("unavailable")
  ) {
    return "unavailable";
  }
  if (["available", "yes", "true", "open"].includes(status)) return "available";
  if (status.includes("available") && !status.includes("unavailable")) return "available";
  return "unknown";
}

function getAvailabilityTime(row: AvailabilityRow) {
  const start = asText(row.start_time);
  const end = asText(row.end_time);
  if (start && end) return `${formatDisplayTime(start)} - ${formatDisplayTime(end)}`;
  return start || end ? formatDisplayTime(start || end) : "";
}

function getAvailabilityForSp(spId: string, availabilityRows: AvailabilityRow[]) {
  return availabilityRows
    .filter((row) => getAvailabilitySpId(row) === spId)
    .sort((a, b) => getAvailabilityDate(a).localeCompare(getAvailabilityDate(b)));
}

function formatAvailabilityRows(rows: AvailabilityRow[]) {
  if (!rows.length) return "No availability rows found.";

  return rows
    .slice(0, 3)
    .map((row) => {
      const time = getAvailabilityTime(row);
      const notes = asText(row.notes);
      return [
        getAvailabilityDate(row),
        getAvailabilityStatus(row),
        time,
        notes,
      ]
        .filter(Boolean)
        .join(" · ");
    })
    .join("\n");
}

function sessionMatchesAvailability(
  session: EventSessionRow,
  row: AvailabilityRow,
  fallbackYear?: number | null
) {
  const sessionDate = normalizeDateValue(session.session_date, fallbackYear);
  const availabilityDate = normalizeDateValue(getAvailabilityDate(row));
  if (!sessionDate || !availabilityDate || sessionDate !== availabilityDate) return false;

  const sessionStart = parseTimeToMinutes(session.start_time);
  const sessionEnd = parseTimeToMinutes(session.end_time);
  const availabilityStart = parseTimeToMinutes(asText(row.start_time));
  const availabilityEnd = parseTimeToMinutes(asText(row.end_time));

  if (
    sessionStart === null ||
    sessionEnd === null ||
    availabilityStart === null ||
    availabilityEnd === null
  ) {
    return true;
  }

  return availabilityStart < sessionEnd && availabilityEnd > sessionStart;
}

function getAvailabilityMatchDetails(
  eventSessions: EventSessionRow[],
  rows: AvailabilityRow[],
  fallbackYear?: number | null
): AvailabilityMatchDetails {
  if (!eventSessions.length || !rows.length) {
    return {
      status: "unknown",
      matchedSessions: 0,
      totalSessions: eventSessions.length,
      reason: "No structured availability match data",
    };
  }

  let matchedSessions = 0;
  let sawRelevantAvailability = false;
  let sawUnavailableConflict = false;

  eventSessions.forEach((session) => {
    const relevantRows = rows.filter((row) => sessionMatchesAvailability(session, row, fallbackYear));
    if (!relevantRows.length) return;

    sawRelevantAvailability = true;
    if (relevantRows.some((row) => getAvailabilityState(row) === "unavailable")) {
      sawUnavailableConflict = true;
    }
    const hasAvailableMatch = relevantRows.some(
      (row) => getAvailabilityState(row) === "available"
    );
    if (hasAvailableMatch) matchedSessions += 1;
  });

  if (matchedSessions === eventSessions.length) {
    return {
      status: "available",
      matchedSessions,
      totalSessions: eventSessions.length,
      reason: "Available for all sessions",
    };
  }

  if (matchedSessions > 0) {
    return {
      status: "partial",
      matchedSessions,
      totalSessions: eventSessions.length,
      reason: `Available for ${matchedSessions} of ${eventSessions.length} sessions`,
    };
  }

  if (sawRelevantAvailability || sawUnavailableConflict) {
    return {
      status: "none",
      matchedSessions,
      totalSessions: eventSessions.length,
      reason: "Conflict with session time",
    };
  }

  return {
    status: "unknown",
    matchedSessions,
    totalSessions: eventSessions.length,
    reason: "No matching availability rows",
  };
}

function getAvailabilityMatchRank(status: AvailabilityMatchStatus) {
  if (status === "available") return 0;
  if (status === "partial") return 1;
  if (status === "unknown") return 2;
  return 3;
}

function getCoverageWorkflowTone(needed: number, selectedCount: number, contactedCount: number) {
  if (needed <= 0) {
    return {
      background: "rgba(168, 183, 204, 0.12)",
      border: "1px solid var(--cfsp-border)",
      color: "var(--cfsp-text-muted)",
      label: "No target set",
    };
  }

  if (selectedCount >= needed) {
    return {
      background: planningSuccessBackground,
      border: planningSuccessBorder,
      color: planningSuccessText,
      label: "Fully staffed",
    };
  }

  if (selectedCount > 0 || contactedCount > 0) {
    return {
      background: "var(--cfsp-warning-soft)",
      border: "1px solid rgba(243, 187, 103, 0.24)",
      color: "var(--cfsp-warning)",
      label: "Partially staffed",
    };
  }

  return {
    background: "var(--cfsp-danger-soft)",
    border: "1px solid var(--cfsp-danger-border)",
    color: "var(--cfsp-danger)",
    label: "Needs attention",
  };
}

function getSpTagLabels(sp: SPRow) {
  const tags: string[] = [];
  if (hasTelehealth(sp)) tags.push("Telehealth");
  if (hasPtPreferred(sp)) tags.push("PT preferred");
  if (speaksSpanish(sp)) tags.push("Spanish");
  return tags;
}

function formatAttendanceTimestamp(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMinutesAsClockLabel(totalMinutes: number) {
  const normalized = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatMinuteRange(startMinutes: number, endMinutes: number) {
  return `${formatMinutesAsClockLabel(startMinutes)} - ${formatMinutesAsClockLabel(endMinutes)}`;
}

function formatRemainingMinutes(totalMinutes: number) {
  if (totalMinutes <= 0) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function parseDurationMinutes(value?: string | null) {
  const text = asText(value);
  if (!text) return 0;
  const matched = text.match(/(\d+)/);
  return matched ? Number(matched[1]) || 0 : 0;
}

function formatUploadedTimestamp(value?: string | null) {
  if (!value) return "Not uploaded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatSessionDate(value?: string | null, fallbackYear?: number | null) {
  return formatHumanDate(value, fallbackYear);
}

function formatEventDateText(value?: string | null, fallbackYear?: number | null) {
  return formatHumanDate(value, fallbackYear);
}

function parseIntegerNoteValue(notes: string | null | undefined, label: string) {
  const text = asText(notes);
  if (!text) return 0;
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escapedLabel}\\s*:\\s*(\\d+)\\b`, "im"));
  if (!match) return 0;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function parseNoteValue(notes: string | null | undefined, label: string) {
  const text = asText(notes);
  if (!text) return "";
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escapedLabel}\\s*:\\s*(.+)$`, "im"));
  return match ? match[1].trim() : "";
}

const POLL_METADATA_START = "[CFSP_POLL_METADATA]";
const POLL_METADATA_END = "[/CFSP_POLL_METADATA]";
const POLL_METADATA_KEYS: Array<keyof PollMetadata> = [
  "pollCreatedAt",
  "pollSentAt",
  "pollSelectedSpIds",
  "pollSelectedSpEmails",
  "pollStatus",
  "excludedSpIds",
  "excludedSpEmails",
  "importedPollResponses",
  "pollImportCreatedAt",
  "pollImportSource",
];
const POLL_RESPONSE_START = "[CFSP_POLL_RESPONSE]";
const POLL_RESPONSE_END = "[/CFSP_POLL_RESPONSE]";
const POLL_RESPONSE_KEYS: Array<keyof PollResponseMetadata> = [
  "responseStatus",
  "responseNote",
  "responseSubmittedAt",
];

function emptyPollMetadata(): PollMetadata {
  return {
    pollCreatedAt: "",
    pollSentAt: "",
    pollSelectedSpIds: "",
    pollSelectedSpEmails: "",
    pollStatus: "",
    excludedSpIds: "",
    excludedSpEmails: "",
    importedPollResponses: "",
    pollImportCreatedAt: "",
    pollImportSource: "",
  };
}

function getPollMetadataBlock(notes?: string | null) {
  const text = asText(notes);
  if (!text) return "";
  const startIndex = text.indexOf(POLL_METADATA_START);
  const endIndex = text.indexOf(POLL_METADATA_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return "";
  return text.slice(startIndex + POLL_METADATA_START.length, endIndex).trim();
}

function parsePollMetadata(notes?: string | null) {
  const metadata = emptyPollMetadata();
  const block = getPollMetadataBlock(notes);
  if (!block) return metadata;

  block.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (!match) return;
    const key = match[1] as keyof PollMetadata;
    if (!POLL_METADATA_KEYS.includes(key)) return;
    metadata[key] = match[2].trim();
  });

  return metadata;
}

function upsertPollMetadata(notes: string | null | undefined, partial: Partial<PollMetadata>) {
  const current = parsePollMetadata(notes);
  const next = {
    ...current,
    ...Object.fromEntries(
      Object.entries(partial).map(([key, value]) => [key, asText(value)])
    ),
  } as PollMetadata;

  const lines = POLL_METADATA_KEYS
    .map((key) => (next[key] ? `${key}: ${next[key]}` : ""))
    .filter(Boolean);

  const text = asText(notes);
  const withoutExisting = text.replace(
    new RegExp(`\\n?${POLL_METADATA_START}[\\s\\S]*?${POLL_METADATA_END}\\n?`, "g"),
    "\n"
  ).trim();

  if (!lines.length) return withoutExisting;

  const block = [POLL_METADATA_START, ...lines, POLL_METADATA_END].join("\n");
  return withoutExisting ? `${block}\n${withoutExisting}` : block;
}

function emptyPollResponseMetadata(): PollResponseMetadata {
  return {
    responseStatus: "",
    responseNote: "",
    responseSubmittedAt: "",
  };
}

function parsePollResponseMetadata(notes?: string | null) {
  const metadata = emptyPollResponseMetadata();
  const text = asText(notes);
  const match = text.match(
    new RegExp(`${POLL_RESPONSE_START}\\n?([\\s\\S]*?)\\n?${POLL_RESPONSE_END}`)
  );
  if (!match) return metadata;

  match[1].split(/\r?\n/).forEach((line) => {
    const lineMatch = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (!lineMatch) return;
    const key = lineMatch[1] as keyof PollResponseMetadata;
    if (!POLL_RESPONSE_KEYS.includes(key)) return;
    metadata[key] = lineMatch[2].trim();
  });

  return metadata;
}

function getPollResponseStatus(notes?: string | null): PollResponseStatus {
  const status = asText(parsePollResponseMetadata(notes).responseStatus).toLowerCase();
  if (status === "available") return "available";
  if (status === "maybe") return "maybe";
  if (status === "not_available") return "not_available";
  return "no_response";
}

function getPollResponseTimestamp(notes?: string | null) {
  return asText(parsePollResponseMetadata(notes).responseSubmittedAt);
}

function getEffectivePollResponseStatus(
  notes: string | null | undefined,
  imported?: ImportedPollResponseRecord | null
) {
  const inAppStatus = getPollResponseStatus(notes);
  if (!imported) return inAppStatus;

  const inAppTimestamp = Date.parse(getPollResponseTimestamp(notes) || "");
  const importedTimestamp = Date.parse(imported.responseSubmittedAt || "");

  if (Number.isNaN(inAppTimestamp) && Number.isNaN(importedTimestamp)) {
    return inAppStatus !== "no_response" ? inAppStatus : imported.responseStatus;
  }
  if (Number.isNaN(inAppTimestamp)) return imported.responseStatus;
  if (Number.isNaN(importedTimestamp)) return inAppStatus;
  return importedTimestamp >= inAppTimestamp ? imported.responseStatus : inAppStatus;
}

function encodeImportedPollResponses(entries: ImportedPollResponseRecord[]) {
  try {
    return encodeURIComponent(JSON.stringify(entries));
  } catch {
    return "";
  }
}

function parseImportedPollResponses(value?: string | null): ImportedPollResponseRecord[] {
  const text = asText(value);
  if (!text) return [] as ImportedPollResponseRecord[];
  try {
    const decoded = decodeURIComponent(text);
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry): ImportedPollResponseRecord => {
        const responseStatus = asText((entry as ImportedPollResponseRecord).responseStatus) as PollResponseStatus;
        return {
          name: asText((entry as ImportedPollResponseRecord).name),
          email: asText((entry as ImportedPollResponseRecord).email),
          normalizedEmail: normalizeEmail(asText((entry as ImportedPollResponseRecord).normalizedEmail || (entry as ImportedPollResponseRecord).email)),
          responseStatus:
            responseStatus === "available" || responseStatus === "maybe" || responseStatus === "not_available"
              ? responseStatus
              : "no_response",
          responseLabel: asText((entry as ImportedPollResponseRecord).responseLabel),
          responseSubmittedAt: asText((entry as ImportedPollResponseRecord).responseSubmittedAt),
          responseNote: asText((entry as ImportedPollResponseRecord).responseNote),
          matchedSpId: asText((entry as ImportedPollResponseRecord).matchedSpId),
          matchedSpEmail: asText((entry as ImportedPollResponseRecord).matchedSpEmail),
          matchedSpName: asText((entry as ImportedPollResponseRecord).matchedSpName),
          matchType:
            asText((entry as ImportedPollResponseRecord).matchType) === "email"
              ? "email"
              : asText((entry as ImportedPollResponseRecord).matchType) === "name"
                ? "name"
                : "unmatched",
          matchConfidence: Number((entry as ImportedPollResponseRecord).matchConfidence) || 0,
          rawAnswer: asText((entry as ImportedPollResponseRecord).rawAnswer),
        };
      })
      .filter((entry) => entry.name || entry.email || entry.matchedSpId);
  } catch {
    return [];
  }
}

function normalizeImportedResponseText(value: string) {
  return asText(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[“”"']+|[“”"'.!?]+$/g, "")
    .toLowerCase();
}

function responseContainsNotAvailable(value: string) {
  const normalized = normalizeImportedResponseText(value);
  return /\b(no|not available|unavailable|unable|cannot|can not|can't|decline|declined)\b/.test(normalized);
}

function responseContainsMaybe(value: string) {
  return /\b(maybe|need to discuss|depends|unsure|not sure|possibly|can discuss)\b/.test(normalizeImportedResponseText(value));
}

function responseIsAvailable(value: string) {
  return normalizeImportedResponseText(value) === "available";
}

function notesContainConcernText(value: string) {
  const normalized = normalizeImportedResponseText(value);
  if (!normalized) return false;
  return /\b(concern|conflict|maybe|depends|unsure|not sure|question|issue|problem|limited|limitation|partial|only|prefer|late|early|cannot|can't|unable|need to discuss)\b/.test(normalized);
}

function classifyImportedAvailabilityResponse(value: string) {
  const normalized = normalizeImportedResponseText(value);

  if (!normalized) return { status: "no_response" as const, label: "No clear response" };

  if (
    /\b(not available|unavailable|cannot|can not|can't|decline|declined|no,? not available|not attending|unable)\b/.test(normalized) ||
    normalized === "no"
  ) {
    return { status: "not_available" as const, label: "Not Available" };
  }

  if (
    /\b(maybe|need to discuss|depends|unsure|not sure|possibly|can discuss)\b/.test(normalized)
  ) {
    return { status: "maybe" as const, label: "Maybe / Need to discuss" };
  }

  if (
    /\b(available|yes|i am available|i'm available|can do|works for me|attend|attending)\b/.test(normalized) ||
    normalized === "available"
  ) {
    return { status: "available" as const, label: "Available" };
  }

  return { status: "no_response" as const, label: value || "No clear response" };
}

function classifyImportedPollResponsesByField({
  trainingResponse,
  eventResponse,
  notes,
}: {
  trainingResponse: string;
  eventResponse: string;
  notes: string;
}) {
  const training = normalizeImportedResponseText(trainingResponse);
  const event = normalizeImportedResponseText(eventResponse);
  const noteText = normalizeImportedResponseText(notes);

  if (responseContainsNotAvailable(training) || responseContainsNotAvailable(event)) {
    return { status: "not_available" as const, label: "Not Available" };
  }

  const trainingAvailable = responseIsAvailable(training);
  const eventAvailable = responseIsAvailable(event);
  const trainingMaybeOrMissing = !training || responseContainsMaybe(training);
  const eventMaybeOrMissing = !event || responseContainsMaybe(event);

  if (
    responseContainsMaybe(training) ||
    responseContainsMaybe(event) ||
    notesContainConcernText(noteText) ||
    (trainingAvailable && eventMaybeOrMissing) ||
    (eventAvailable && trainingMaybeOrMissing)
  ) {
    return { status: "maybe" as const, label: "Maybe / Need to discuss" };
  }

  if (trainingAvailable && eventAvailable) {
    return { status: "available" as const, label: "Available" };
  }

  return { status: "no_response" as const, label: "No clear response" };
}

function formatImportedPollAssignmentNote(note: string) {
  const cleaned = asText(note);
  return cleaned ? `Poll note: ${cleaned}` : "";
}

function normalizeAssignmentNoteForCompare(value: string) {
  return asText(value).toLowerCase().replace(/\s+/g, " ");
}

function mergeImportedPollNoteIntoAssignmentNotes(
  existingNotes: string | null | undefined,
  importedNote: string | null | undefined
) {
  const formattedPollNote = formatImportedPollAssignmentNote(asText(importedNote));
  const currentNotes = asText(existingNotes);
  if (!formattedPollNote) return currentNotes;
  if (!currentNotes) return formattedPollNote;

  const normalizedCurrent = normalizeAssignmentNoteForCompare(currentNotes);
  const normalizedRawNote = normalizeAssignmentNoteForCompare(importedNote || "");
  const normalizedFormattedNote = normalizeAssignmentNoteForCompare(formattedPollNote);
  if (
    normalizedCurrent.includes(normalizedFormattedNote) ||
    (normalizedRawNote && normalizedCurrent.includes(normalizedRawNote))
  ) {
    return currentNotes;
  }

  return `${currentNotes}\n\n${formattedPollNote}`;
}

function normalizeImportHeader(value: unknown) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getImportHeaderEntries(row: Record<string, unknown>) {
  return Object.entries(row).map(([key, value]) => ({
    key,
    normalizedKey: normalizeImportHeader(key),
    value: asText(value),
  }));
}

function getImportFieldValue(row: Record<string, unknown>, aliases: string[]) {
  const entries = getImportHeaderEntries(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeImportHeader(alias);
    const matched = entries.find((entry) => entry.normalizedKey === normalizedAlias);
    if (matched) return matched.value;
  }
  return "";
}

function getImportFieldValueFromHeader(row: Record<string, unknown>, header: string) {
  if (!header) return "";
  const matched = getImportHeaderEntries(row).find((entry) => entry.key === header);
  return matched?.value || "";
}

function scoreIdentityHeader(header: string, type: "name" | "email" | "sp_id", sampleValues: string[] = []) {
  const normalized = normalizeImportHeader(header);
  if (!normalized) return -1;

  if (type === "name") {
    if (/(^| )(start time|completion time|submit date|timestamp|duration|id|email)( |$)/.test(normalized)) return -1;
    if (/^(full name|enter your full name|responder full name)$/.test(normalized)) return 140;
    if (/^(respondent full name)$/.test(normalized)) return 135;
    if (/^(name)$/.test(normalized)) {
      return sampleValues.some((value) => Boolean(asText(value))) ? 20 : -1;
    }
    if (/^(respondent name|responder name)$/.test(normalized)) return 100;
    if (/(^| )(respondent|responder)( |$)/.test(normalized)) return 80;
    if (/(^| )full name( |$)/.test(normalized)) return 130;
    if (/(^| )name( |$)/.test(normalized)) return 70;
    return -1;
  }

  if (type === "email") {
    const hasUsableEmailValue = sampleValues.some((value) => {
      const text = asText(value).toLowerCase();
      return Boolean(text) && text !== "anonymous";
    });
    if (/^(enter your email address)$/.test(normalized)) return 140;
    if (/^(email address)$/.test(normalized)) return 135;
    if (/^(responder email|respondent email)$/.test(normalized)) return 130;
    if (/^(email|e mail)$/.test(normalized)) {
      return hasUsableEmailValue ? 20 : -1;
    }
    if (/(^| )email address( |$)/.test(normalized)) return 125;
    if (/(^| )(email|e mail)( |$)/.test(normalized)) return 80;
    return -1;
  }

  if (/^(sp id|spid|directory id|linked sp id|participant id|respondent id)$/.test(normalized)) return 100;
  if (/(^| )(sp id|directory id|participant id)( |$)/.test(normalized)) return 80;
  return -1;
}

function scoreResponseHeader(header: string, sampleValues: string[]) {
  const normalized = normalizeImportHeader(header);
  if (!normalized) return -1;
  if (/(^| )(start time|completion time|timestamp|email|name|respondent|responder|question|comments? only)( |$)/.test(normalized) && !/available|can you work|are you available|availability/.test(normalized)) {
    return -1;
  }

  let score = 0;
  if (/availability|are you available|can you work|can you attend|can you do|event|training/.test(normalized)) score += 18;
  if (/yes no maybe|available|not available|maybe/.test(normalized)) score += 22;

  const classifiedMatches = sampleValues.reduce((total, value) => {
    const status = classifyImportedAvailabilityResponse(value).status;
    return total + (status !== "no_response" ? 1 : 0);
  }, 0);
  score += classifiedMatches * 8;

  return score > 0 ? score : -1;
}

function scorePollAvailabilityHeader(header: string, type: "training" | "event") {
  const normalized = normalizeImportHeader(header);
  if (!normalized) return -1;
  if (/(^| )(start time|completion time|timestamp|email|name|respondent|responder|comments?|notes?|questions?)( |$)/.test(normalized)) {
    return -1;
  }

  let score = 0;
  if (new RegExp(`(^| )${type}( |$)`).test(normalized)) score += 60;
  if (/availability|available|not available|maybe|can you attend|can you work|can you do/.test(normalized)) score += 25;
  return score > 0 ? score : -1;
}

function scorePollNotesHeader(header: string) {
  const normalized = normalizeImportHeader(header);
  if (!normalized) return -1;
  if (/(^| )(email|name|respondent|responder|start time|completion time|timestamp)( |$)/.test(normalized)) return -1;
  if (/^do you have any questions concerns$/.test(normalized)) return 160;
  if (/^do you have any questions or concerns$/.test(normalized)) return 155;
  if (/(^| )questions concerns( |$)/.test(normalized)) return 145;
  if (/^(notes|comments|comment|questions|additional notes|anything else)$/.test(normalized)) return 100;
  if (/(^| )(notes?|comments?|questions?|anything else)( |$)/.test(normalized)) return 80;
  return -1;
}

function detectPollImportHeaders(rows: Array<Record<string, unknown>>): PollImportDebugInfo {
  const detectedHeaders = Array.from(
    new Set(
      rows.flatMap((row) => Object.keys(row).map((key) => asText(key)).filter(Boolean))
    )
  );

  const sampleRows = rows.slice(0, 3).map((row) => {
    const next: Record<string, string> = {};
    Object.entries(row).forEach(([key, value]) => {
      next[key] = asText(value);
    });
    return next;
  });

  const nameCandidates = detectedHeaders
    .map((header) => ({
      header,
      score: scoreIdentityHeader(
        header,
        "name",
        rows.map((row) => getImportFieldValueFromHeader(row, header))
      ),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const emailCandidates = detectedHeaders
    .map((header) => ({
      header,
      score: scoreIdentityHeader(
        header,
        "email",
        rows.map((row) => getImportFieldValueFromHeader(row, header))
      ),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const spIdCandidates = detectedHeaders
    .map((header) => ({ header, score: scoreIdentityHeader(header, "sp_id") }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  const responseCandidates = detectedHeaders
    .map((header) => ({
      header,
      score: scoreResponseHeader(
        header,
        rows.slice(0, 12).map((row) => getImportFieldValueFromHeader(row, header))
      ),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const trainingResponseCandidates = detectedHeaders
    .map((header) => ({ header, score: scorePollAvailabilityHeader(header, "training") }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const eventResponseCandidates = detectedHeaders
    .map((header) => ({ header, score: scorePollAvailabilityHeader(header, "event") }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const notesCandidates = detectedHeaders
    .map((header) => ({ header, score: scorePollNotesHeader(header) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  return {
    detectedHeaders,
    matchedNameHeader: nameCandidates[0]?.header || "",
    matchedEmailHeader: emailCandidates[0]?.header || "",
    matchedSpIdHeader: spIdCandidates[0]?.header || "",
    matchedTrainingResponseHeader: trainingResponseCandidates[0]?.header || "",
    matchedEventResponseHeader:
      eventResponseCandidates.find((entry) => entry.header !== trainingResponseCandidates[0]?.header)?.header || "",
    matchedNotesHeader: notesCandidates[0]?.header || "",
    matchedResponseHeaders: responseCandidates.slice(0, 3).map((entry) => entry.header),
    sampleRows,
  };
}

function parseImportedPollWorkbook(file: File) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
    if (!sheet) return [] as Array<Record<string, unknown>>;
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
  });
}

function buildRotationRounds(sessions: EventSessionRow[]): RotationRound[] {
  const rounds = new Map<string, RotationRound>();

  sessions.forEach((session) => {
    const key = [
      asText(session.session_date) || "date-tbd",
      asText(session.start_time) || "start-tbd",
      asText(session.end_time) || "end-tbd",
    ].join("|");

    const existing = rounds.get(key);
    const room = asText(session.room);

    if (existing) {
      if (room && !existing.rooms.includes(room)) existing.rooms.push(room);
      return;
    }

    rounds.set(key, {
      key,
      session_date: session.session_date,
      start_time: session.start_time,
      end_time: session.end_time,
      rooms: room ? [room] : [],
    });
  });

  return Array.from(rounds.values()).sort((a, b) => {
    const dateCompare = asText(a.session_date).localeCompare(asText(b.session_date));
    if (dateCompare !== 0) return dateCompare;
    return asText(a.start_time).localeCompare(asText(b.start_time));
  });
}

function capRotationRounds(rounds: RotationRound[], maxRounds: number) {
  if (maxRounds <= 0 || rounds.length <= maxRounds) return rounds;
  return rounds.slice(0, maxRounds);
}

function formatRotationRoundLabel(round: RotationRound, fallbackYear?: number | null) {
  const date = formatSessionDate(round.session_date, fallbackYear);
  const time =
    round.start_time && round.end_time
      ? `${formatDisplayTime(round.start_time)} - ${formatDisplayTime(round.end_time)}`
      : formatDisplayTime(round.start_time || round.end_time);

  const roomCount = round.rooms.length;
  const roomText = roomCount ? `${roomCount} room${roomCount === 1 ? "" : "s"}` : "Rooms TBD";

  return [date, time, roomText].filter(Boolean).join(" · ");
}

function getRoundCompanionAudience(label: string): RotationCompanionView[] {
  const normalized = asText(label).toLowerCase();
  if (normalized.includes("soap")) return ["student", "operations"];
  if (normalized.includes("checklist")) return ["sp", "operations"];
  if (normalized.includes("feedback") || normalized.includes("debrief")) return ["student", "sp", "operations"];
  if (normalized.includes("break") || normalized.includes("lunch") || normalized.includes("transition")) {
    return ["student", "sp", "operations"];
  }
  return ["operations"];
}
function toTimeInputValue(value?: string | null) {
  const trimmed = asText(value);
  if (!trimmed) return "";
  return trimmed.slice(0, 5);
}

function getSessionEditorState(
  sessions: EventSessionRow[],
  eventDateText?: string | null
): SessionEditorState {
  const primarySession = sessions[0];
  return {
    session_date:
      asText(primarySession?.session_date) ||
      normalizeLooseDateToIso(eventDateText) ||
      "",
    start_time: toTimeInputValue(primarySession?.start_time),
    end_time: toTimeInputValue(primarySession?.end_time),
  };
}

function toStoredTimeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
}

function buildMailtoHref(args: {
  to?: string;
  cc?: string[];
  bcc: string[];
  subject: string;
  body: string;
}) {
  const parts: string[] = [];
  if (args.cc?.length) parts.push(`cc=${encodeURIComponent(args.cc.join(","))}`);
  if (args.bcc.length) parts.push(`bcc=${encodeURIComponent(args.bcc.join(","))}`);
  parts.push(`subject=${encodeURIComponent(args.subject)}`);
  parts.push(`body=${encodeURIComponent(args.body)}`);
  return `mailto:${encodeURIComponent(args.to || "")}?${parts.join("&")}`;
}

function hasNotesLine(notes: string | null | undefined, pattern: RegExp) {
  return pattern.test(asText(notes));
}

async function parseApiError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function fetchCommandCenterData(eventId: string): Promise<CommandCenterData> {
  try {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`, {
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        event: null,
        sessions: [],
        sps: [],
        assignments: [],
        availabilityRows: [],
        errorMessage: body?.error || `Could not load event (${response.status}).`,
        sessionErrorMessage: "",
        availabilityErrorMessage: "",
        accessDenied: response.status === 403,
        notFound: response.status === 404,
      };
    }

    return {
      event: body?.event || null,
      sessions: Array.isArray(body?.sessions) ? body.sessions : [],
      sps: Array.isArray(body?.sps) ? [...body.sps].sort(sortSPs) : [],
      assignments: Array.isArray(body?.assignments) ? body.assignments : [],
      availabilityRows: Array.isArray(body?.availabilityRows) ? body.availabilityRows : [],
      viewerRole: body?.viewerRole || "unknown",
      spPortal: body?.spPortal || null,
      errorMessage: body?.errorMessage || "",
      sessionErrorMessage: body?.sessionErrorMessage || "",
      availabilityErrorMessage: body?.availabilityErrorMessage || "",
      accessDenied: false,
      notFound: false,
    };
  } catch (error) {
    return {
      event: null,
      sessions: [],
      sps: [],
      assignments: [],
      availabilityRows: [],
      errorMessage: error instanceof Error ? error.message : "Could not load event.",
      sessionErrorMessage: "",
      availabilityErrorMessage: "",
      accessDenied: false,
      notFound: false,
    };
  }
}

function getRouteId(params: ReturnType<typeof useParams>) {
  const raw = params?.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function normalizeEmail(value: string) {
  return asText(value).toLowerCase();
}

function normalizeLocationSignal(value: string) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLocationFitFromText(value: string): PollLocationFilter | "unknown" {
  const normalized = normalizeLocationSignal(value);
  if (!normalized) return "unknown";
  if (/\b(zoom|virtual|telehealth|online|remote|breakout)\b/.test(normalized)) return "virtual";
  if (/\b(elkins park|drexel elkins park|elkins|ep)\b/.test(normalized)) return "elkins_park";
  if (/\b(center city|centercity|cc)\b/.test(normalized)) return "center_city";
  return "unknown";
}

function normalizeMatchName(value: string) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWorkflowManualChecks(value?: string | null) {
  return Array.from(
    new Set(
      asText(value)
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function serializeWorkflowManualChecks(ids: string[]) {
  return Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean))).join("|");
}

function inferEventModalityLabel(eventTypeSet: Set<EditableEventType>, metadata: TrainingEventMetadata, event?: EventDetailRow | null) {
  const explicit = asText(metadata.modality).toLowerCase();
  if (explicit === "virtual") return "Virtual";
  if (explicit === "hybrid") return "Hybrid";
  if (explicit === "in_person" || explicit === "in-person" || explicit === "in person") return "In-person";

  const source = [event?.name, event?.location, event?.notes].map(asText).join(" ").toLowerCase();
  if (eventTypeSet.has("virtual") || /\b(virtual|vir|zoom|breakout)\b/.test(source)) return "Virtual";
  return "In-person";
}

function getMaterialStatusLabel(metadata: TrainingEventMetadata) {
  const materialsReady = [
    metadata.case_file_url,
    metadata.doorsign_url,
    metadata.supplemental_doc_url,
    metadata.case_name,
  ].some((value) => Boolean(asText(value)));
  return materialsReady ? "Ready" : "Needs materials";
}

function getEmailStatusLabel(metadata: TrainingEventMetadata) {
  const status = asText(metadata.email_status).toLowerCase();
  if (status === "sent") return "Sent";
  if (status === "draft_opened") return "Draft opened";
  return "Not started";
}

function getDefaultRelatedEventKeyword(title?: string | null) {
  const text = asText(title);
  if (!text) return "";

  const courseTokenMatch = text.match(/\b[A-Z]{2,}\s*[-]?\s*(\d{3,4}[A-Z]?)\b/i);
  if (courseTokenMatch?.[1]) return courseTokenMatch[1];

  const numericMatch = text.match(/\b(\d{3,4}[A-Z]?)\b/);
  if (numericMatch?.[1]) return numericMatch[1];

  const tokens = text
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  return tokens[0] || "";
}

function getSheetCellText(sheet: XLSX.WorkSheet, address: string) {
  return asText(sheet[address]?.v);
}

function parseTrainingImportWorkbook(file: File) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
    if (!sheet) {
      return {
        eventTitle: "",
        entries: [] as { email: string; name: string }[],
        facultyDetected: [] as string[],
        trainingDate: "",
        trainingTime: "",
        eventDatesDetected: [] as string[],
        eventTimesDetected: [] as string[],
      };
    }

    const eventTitle = getSheetCellText(sheet, "B1");
    const entries: { email: string; name: string }[] = [];
    const facultyDetected = new Set<string>();
    const trainingDate = getSheetCellText(sheet, "D14");
    const trainingTime = getSheetCellText(sheet, "D15");
    const eventDatesDetected: string[] = [];
    const eventTimesDetected: string[] = [];

    for (let row = 16; row <= 35; row += 1) {
      const email = getSheetCellText(sheet, `B${row}`);
      const name = getSheetCellText(sheet, `C${row}`);
      const faculty = getSheetCellText(sheet, `G${row}`);

      if (faculty) facultyDetected.add(faculty);
      if (!email && !name) continue;
      entries.push({ email, name });
    }

    ["E", "F", "G", "H", "I"].forEach((column) => {
      const dateValue = getSheetCellText(sheet, `${column}14`);
      const timeValue = getSheetCellText(sheet, `${column}15`);
      if (dateValue && timeValue) {
        eventDatesDetected.push(dateValue);
        eventTimesDetected.push(timeValue);
      }
    });

    return {
      eventTitle,
      entries,
      facultyDetected: Array.from(facultyDetected),
      trainingDate,
      trainingTime,
      eventDatesDetected,
      eventTimesDetected,
    };
  });
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = getRouteId(params);

  const [event, setEvent] = useState<EventDetailRow | null>(null);
  const [eventEditor, setEventEditor] = useState<EventEditorState>({
    name: "",
    status: "",
    visibility: "",
    location: "",
    notes: "",
    sp_needed: "",
  });
  const [sessionEditor, setSessionEditor] = useState<SessionEditorState>({
    session_date: "",
    start_time: "",
    end_time: "",
  });
  const [sessions, setSessions] = useState<EventSessionRow[]>([]);
  const [sps, setSps] = useState<SPRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>([]);
  const [selectedSpId, setSelectedSpId] = useState("");
  const [quickStaffingQuery, setQuickStaffingQuery] = useState("");
  const [quickStaffingSpId, setQuickStaffingSpId] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [showCandidatePool, setShowCandidatePool] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [spanishOnly, setSpanishOnly] = useState(false);
  const [telehealthOnly, setTelehealthOnly] = useState(false);
  const [ptPreferredOnly, setPtPreferredOnly] = useState(false);
  const [availableForEventOnly, setAvailableForEventOnly] = useState(false);
  const [staffingOverviewOpen, setStaffingOverviewOpen] = useState(true);
  const [spFinderMatchMakerOpen, setSpFinderMatchMakerOpen] = useState(false);
  const [showMatchMakerResults, setShowMatchMakerResults] = useState(false);
  const [matchMakerMode, setMatchMakerMode] = useState<"finder" | "poll" | "responders">("finder");
  const [candidateResultsLimit, setCandidateResultsLimit] = useState(10);
  const [selectedPollRosterLimit, setSelectedPollRosterLimit] = useState(10);
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilterStatus>("all");
  const [suggestedAssignmentFilter, setSuggestedAssignmentFilter] = useState<SuggestedAssignmentFilter>("all");
  const [commandCenterMode, setCommandCenterMode] = useState<CommandCenterMode>("planning");
  const [selectedRotationRoundKey, setSelectedRotationRoundKey] = useState("");
  const [roundCompanionView, setRoundCompanionView] = useState<RotationCompanionView>("announcements");
  const [roundAnnouncementDrafts, setRoundAnnouncementDrafts] = useState<Record<string, string>>({});
  const [hasTouchedRoundCompanion, setHasTouchedRoundCompanion] = useState(false);
  const [liveRoomStates, setLiveRoomStates] = useState<Record<string, LiveRoomLocalState>>({});
  const [liveDelayMinutes, setLiveDelayMinutes] = useState(0);
  const [livePausedAtMs, setLivePausedAtMs] = useState<number | null>(null);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  const [pollMatchLocationFilter, setPollMatchLocationFilter] = useState<PollLocationFilter>("any");
  const [pollMatchActiveOnly, setPollMatchActiveOnly] = useState(true);
  const [pollMatchEmailReadyOnly, setPollMatchEmailReadyOnly] = useState(true);
  const [pollMatchAvailableRespondersOnly, setPollMatchAvailableRespondersOnly] = useState(false);
  const [pollMatchNotSelectedOnly, setPollMatchNotSelectedOnly] = useState(true);
  const [pollMatchNotAssignedOnly, setPollMatchNotAssignedOnly] = useState(true);
  const [pollMatchNotExcludedOnly, setPollMatchNotExcludedOnly] = useState(true);
  const [pollMatchKeyword, setPollMatchKeyword] = useState("");
  const [pollMatchRoleKeyword, setPollMatchRoleKeyword] = useState("");
  const [pollMatchAgeKeyword, setPollMatchAgeKeyword] = useState("");
  const [pollMatchGenderFilter, setPollMatchGenderFilter] = useState("any");
  const [pollMatchRaceFilter, setPollMatchRaceFilter] = useState("any");
  const [pollMatchSpanishOnly, setPollMatchSpanishOnly] = useState(false);
  const [pollMatchTelehealthOnly, setPollMatchTelehealthOnly] = useState(false);
  const [pollMatchSort, setPollMatchSort] = useState<PollMatchSort>("best_match");
  const [pollImportSaving, setPollImportSaving] = useState(false);
  const [pollImportError, setPollImportError] = useState("");
  const [pollImportIgnoredUnmatched, setPollImportIgnoredUnmatched] = useState(false);
  const [pollImportDebugInfo, setPollImportDebugInfo] = useState<PollImportDebugInfo | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [assigningSpId, setAssigningSpId] = useState("");
  const [assignmentSuccessMessage, setAssignmentSuccessMessage] = useState("");
  const [recentAssignedSpId, setRecentAssignedSpId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [eventSaveMessage, setEventSaveMessage] = useState("");
  const [eventSaveError, setEventSaveError] = useState("");
  const [sessionErrorMessage, setSessionErrorMessage] = useState("");
  const [availabilityErrorMessage, setAvailabilityErrorMessage] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [viewerRole, setViewerRole] = useState<CommandCenterData["viewerRole"]>("unknown");
  const [spPortal, setSpPortal] = useState<NonNullable<CommandCenterData["spPortal"]> | null>(null);
  const [workflowChecks, setWorkflowChecks] = useState<Record<string, boolean>>({});
  const [me, setMe] = useState<{
    email: string;
    fullName: string;
    scheduleName: string;
  } | null>(null);
  const [showTrainingEmailDraft, setShowTrainingEmailDraft] = useState(false);
  const [showAllTrainingRoster, setShowAllTrainingRoster] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceSuccess, setAttendanceSuccess] = useState("");
  const [trainingImportResult, setTrainingImportResult] = useState<TrainingImportResult | null>(null);
  const [trainingImportError, setTrainingImportError] = useState("");
  const [trainingImporting, setTrainingImporting] = useState(false);
  const [showWorkflowAdvanced, setShowWorkflowAdvanced] = useState(false);
  const [materialPreview, setMaterialPreview] = useState<MaterialPreviewState | null>(null);
  const [materialPreviewLoading, setMaterialPreviewLoading] = useState(false);
  const [materialPreviewError, setMaterialPreviewError] = useState("");
  const [materialPreviewText, setMaterialPreviewText] = useState("");
  const [showRecordingGuideEditor, setShowRecordingGuideEditor] = useState(false);
  const [contactPanelSaving, setContactPanelSaving] = useState(false);
  const [contactPanelSavedAt, setContactPanelSavedAt] = useState("");
  const [showPushRelatedPanel, setShowPushRelatedPanel] = useState(false);
  const [relatedKeyword, setRelatedKeyword] = useState("");
  const [relatedMustInclude, setRelatedMustInclude] = useState("");
  const [relatedExclude, setRelatedExclude] = useState("");
  const [relatedExcludeCurrent, setRelatedExcludeCurrent] = useState(true);
  const [relatedCopyOptions, setRelatedCopyOptions] = useState<RelatedCopyOption[]>([
    "assigned_sps",
    "training_materials",
    "zoom_recording",
    "case_doorsign",
  ]);
  const [selectedPollSpIds, setSelectedPollSpIds] = useState<string[]>([]);
  const [pollSaving, setPollSaving] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const pollImportInputRef = useRef<HTMLInputElement | null>(null);

  const [relatedMatches, setRelatedMatches] = useState<RelatedEventPreview[]>([]);
  const [selectedRelatedTargetIds, setSelectedRelatedTargetIds] = useState<string[]>([]);
  const [relatedPreviewLoading, setRelatedPreviewLoading] = useState(false);
  const [relatedPushSaving, setRelatedPushSaving] = useState(false);
  const [relatedPushError, setRelatedPushError] = useState("");
  const [relatedPushSummary, setRelatedPushSummary] = useState<PushRelatedSummary | null>(null);
  const [trainingMaterialSaving, setTrainingMaterialSaving] = useState<
    Record<TrainingMaterialKind, boolean>
  >({
    case_file: false,
    doorsign: false,
    supplemental_doc: false,
    staffing_doc: false,
  });
  const caseFileInputRef = useRef<HTMLInputElement | null>(null);
  const doorsignInputRef = useRef<HTMLInputElement | null>(null);
  const supplementalDocInputRef = useRef<HTMLInputElement | null>(null);
  const staffingDocInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);

  const spsById = useMemo(() => {
    const next = new Map<string, SPRow>();
    sps.forEach((sp) => next.set(String(sp.id), sp));
    return next;
  }, [sps]);

  const spByEmail = useMemo(() => {
    const next = new Map<string, SPRow>();
    sps.forEach((sp) => {
      const emails = [sp.working_email, sp.email]
        .map((email) => normalizeEmail(asText(email)))
        .filter(Boolean);
      emails.forEach((email) => {
        if (!next.has(email)) next.set(email, sp);
      });
    });
    return next;
  }, [sps]);

  const spByNormalizedName = useMemo(() => {
    const next = new Map<string, SPRow>();
    sps.forEach((sp) => {
      const name = normalizeMatchName(getFullName(sp));
      if (name && !next.has(name)) next.set(name, sp);
    });
    return next;
  }, [sps]);

  const assignedSpIds = useMemo(
    () => new Set(assignments.map((assignment) => asText(assignment.sp_id)).filter(Boolean)),
    [assignments]
  );

  const hiredAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        const status = getAssignmentStatus(assignment);
        return isSelectedStaffingStatus(status);
      }),
    [assignments]
  );

  const pollInviteOnlyAssignments = useMemo(
    () =>
      assignments.filter((assignment) => {
        const status = getAssignmentStatus(assignment);
        return !isSelectedStaffingStatus(status);
      }),
    [assignments]
  );

  const sortedAssignments = useMemo(
    () =>
      [...hiredAssignments].sort((a, b) => {
        const aSp = a.sp_id ? spsById.get(a.sp_id) : undefined;
        const bSp = b.sp_id ? spsById.get(b.sp_id) : undefined;

        return getFullName(aSp || emptySpRow).localeCompare(
          getFullName(bSp || emptySpRow)
        );
      }),
    [hiredAssignments, spsById]
  );

  const filteredAssignments = useMemo(() => {
    if (assignmentFilter === "all") return sortedAssignments;

    return sortedAssignments.filter(
      (assignment) => getAssignmentStatus(assignment) === assignmentFilter
    );
  }, [assignmentFilter, sortedAssignments]);

  const attendedCount = useMemo(
    () => sortedAssignments.filter((assignment) => assignment.training_attended === true).length,
    [sortedAssignments]
  );
  const allAssignedCheckedIn = sortedAssignments.length > 0 && attendedCount === sortedAssignments.length;
  const trainingAttendanceFieldsMissing = useMemo(
    () =>
      sortedAssignments.length > 0 &&
      sortedAssignments.some(
        (assignment) =>
          !Object.prototype.hasOwnProperty.call(assignment, "training_attended") ||
          !Object.prototype.hasOwnProperty.call(assignment, "training_checked_in_at")
      ),
    [sortedAssignments]
  );
  const canManageTrainingAttendance =
    viewerRole === "admin" || viewerRole === "sim_op" || viewerRole === "super_admin";
  const canManageAvailabilityPoll = canManageTrainingAttendance;
  const canManageSpMatchMaker = canManageTrainingAttendance;
  const canManageRoundAnnouncements = canManageTrainingAttendance;
  const canRunLiveEventMode = canManageTrainingAttendance;
  const canDeleteEvent = viewerRole === "admin" || viewerRole === "super_admin";

  const assignmentsBySpId = useMemo(() => {
    const next = new Map<string, AssignmentRow>();
    assignments.forEach((assignment) => {
      const spId = asText(assignment.sp_id);
      if (spId) next.set(spId, assignment);
    });
    return next;
  }, [assignments]);

  const availabilityBySpId = useMemo(() => {
    const next = new Map<string, AvailabilityRow[]>();

    sps.forEach((sp) => {
      next.set(sp.id, getAvailabilityForSp(sp.id, availabilityRows));
    });

    return next;
  }, [availabilityRows, sps]);

  const availabilityMatchBySpId = useMemo(() => {
    const next = new Map<string, AvailabilityMatchDetails>();
    const fallbackYear = getImportedYearHint(event?.notes);

    sps.forEach((sp) => {
      next.set(
        sp.id,
        getAvailabilityMatchDetails(sessions, availabilityBySpId.get(sp.id) || [], fallbackYear)
      );
    });

    return next;
  }, [availabilityBySpId, event?.notes, sessions, sps]);

  const filteredCandidateSps = useMemo(
    () =>
      sps
        .filter((sp) => {
          const query = candidateQuery.trim().toLowerCase();
          const availabilityMatch = availabilityMatchBySpId.get(sp.id)?.status || "unknown";
          if (query && !getCandidateSearchText(sp).includes(query)) return false;
          if (activeOnly && !isActiveSp(sp)) return false;
          if (spanishOnly && !speaksSpanish(sp)) return false;
          if (telehealthOnly && !hasTelehealth(sp)) return false;
          if (ptPreferredOnly && !hasPtPreferred(sp)) return false;
          if (availableForEventOnly && !["available", "partial"].includes(availabilityMatch)) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aMatch = availabilityMatchBySpId.get(a.id)?.status || "unknown";
          const bMatch = availabilityMatchBySpId.get(b.id)?.status || "unknown";
          const rankDiff = getAvailabilityMatchRank(aMatch) - getAvailabilityMatchRank(bMatch);
          if (rankDiff !== 0) return rankDiff;
          return sortSPs(a, b);
        }),
    [
      activeOnly,
      availabilityMatchBySpId,
      availableForEventOnly,
      candidateQuery,
      ptPreferredOnly,
      spanishOnly,
      sps,
      telehealthOnly,
    ]
  );

  const availableSps = useMemo(
    () => filteredCandidateSps.filter((sp) => !assignedSpIds.has(String(sp.id))),
    [assignedSpIds, filteredCandidateSps]
  );

  const quickStaffingOptions = useMemo(() => {
    const query = quickStaffingQuery.trim().toLowerCase();
    return sps
      .filter((sp) => {
        if (assignedSpIds.has(String(sp.id))) return false;
        if (!query) return true;
        return getCandidateSearchText(sp).includes(query);
      })
      .sort(sortSPs)
      .slice(0, 30);
  }, [assignedSpIds, quickStaffingQuery, sps]);

  const pollMetadata = useMemo(() => parsePollMetadata(eventEditor.notes), [eventEditor.notes]);
  const pollSelectedSpIdsFromMetadata = useMemo(
    () =>
      pollMetadata.pollSelectedSpIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [pollMetadata.pollSelectedSpIds]
  );
  const pollSelectedSpEmailsFromMetadata = useMemo(
    () =>
      pollMetadata.pollSelectedSpEmails
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [pollMetadata.pollSelectedSpEmails]
  );
  const excludedPollSpIdsFromMetadata = useMemo(
    () =>
      pollMetadata.excludedSpIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [pollMetadata.excludedSpIds]
  );
  const excludedPollSpEmailsFromMetadata = useMemo(
    () =>
      pollMetadata.excludedSpEmails
        .split(",")
        .map((item) => normalizeEmail(item))
        .filter(Boolean),
    [pollMetadata.excludedSpEmails]
  );
  const importedPollResponses = useMemo(
    () => parseImportedPollResponses(pollMetadata.importedPollResponses),
    [pollMetadata.importedPollResponses]
  );
  const importedPollResponsesBySpId = useMemo(() => {
    const next = new Map<string, ImportedPollResponseRecord>();
    importedPollResponses.forEach((entry) => {
      if (!entry.matchedSpId) return;
      const current = next.get(entry.matchedSpId);
      if (!current) {
        next.set(entry.matchedSpId, entry);
        return;
      }
      const currentStamp = Date.parse(current.responseSubmittedAt || "");
      const nextStamp = Date.parse(entry.responseSubmittedAt || "");
      if (!Number.isNaN(nextStamp) && (Number.isNaN(currentStamp) || nextStamp >= currentStamp)) {
        next.set(entry.matchedSpId, entry);
      }
    });
    return next;
  }, [importedPollResponses]);
  const unmatchedImportedPollResponses = useMemo(
    () => importedPollResponses.filter((entry) => !entry.matchedSpId && entry.responseStatus !== "no_response"),
    [importedPollResponses]
  );
  const pollSelectedSps = useMemo(
    () =>
      Array.from(
        new Map(
          selectedPollSpIds
            .map((spId) => spsById.get(String(spId)))
            .filter((sp): sp is SPRow => Boolean(sp))
            .map((sp) => [String(sp.id), sp])
        ).values()
      ),
    [selectedPollSpIds, spsById]
  );
  const pollSelectedEmails = useMemo(
    () =>
      Array.from(
        new Set(
          pollSelectedSps
            .map((sp) => getEmail(sp))
            .filter(Boolean)
        )
      ),
    [pollSelectedSps]
  );
  const uniquePollGenderOptions = useMemo(
    () =>
      Array.from(
        new Set(
          availableSps
            .map((sp) => asText(sp.sex))
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [availableSps]
  );
  const uniquePollRaceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          availableSps
            .map((sp) => asText(sp.race))
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [availableSps]
  );
  const eventLocationFit = useMemo(() => {
    const detected = detectLocationFitFromText([event?.location, event?.notes].map(asText).join(" "));
    return detected === "unknown" ? "any" : detected;
  }, [event?.location, event?.notes]);
  const effectivePollLocationFilter =
    pollMatchLocationFilter === "any" && eventLocationFit !== "any"
      ? eventLocationFit
      : pollMatchLocationFilter;
  const pollMatchEntries = useMemo(() => {
    const keyword = pollMatchKeyword.trim().toLowerCase();
    const roleKeyword = pollMatchRoleKeyword.trim().toLowerCase();
    const ageKeyword = pollMatchAgeKeyword.trim().toLowerCase();
    const selectedIds = new Set(selectedPollSpIds.map((item) => String(item)));
    const excludedIds = new Set(excludedPollSpIdsFromMetadata.map((item) => String(item)));
    const excludedEmails = new Set(excludedPollSpEmailsFromMetadata.map((item) => normalizeEmail(item)));

    return availableSps
      .map((sp) => {
        const locationText = [
          sp.notes,
          sp.other_roles,
          sp.telehealth,
          event?.location,
        ]
          .map(asText)
          .join(" ");
        const detectedLocation = detectLocationFitFromText(locationText);
        const email = getEmail(sp);
        const assignment = assignmentsBySpId.get(sp.id) || null;
        const importedResponse = importedPollResponsesBySpId.get(sp.id) || null;
        const pollResponseStatus = getEffectivePollResponseStatus(assignment?.notes, importedResponse);
        const hasPriorResponse = pollResponseStatus !== "no_response";
        const locationMatched =
          effectivePollLocationFilter === "any"
            ? true
            : effectivePollLocationFilter === "virtual"
              ? hasTelehealth(sp) || detectedLocation === "virtual"
              : detectedLocation === effectivePollLocationFilter;
        const keywordMatched = !keyword || getCandidateSearchText(sp).includes(keyword);
        const roleFitMatched =
          !roleKeyword ||
          [sp.other_roles, sp.notes]
            .map(asText)
            .join(" ")
            .toLowerCase()
            .includes(roleKeyword);
        const ageFitMatched = !ageKeyword || asText(sp.portrayal_age).toLowerCase().includes(ageKeyword);
        const genderMatched =
          pollMatchGenderFilter === "any" ||
          asText(sp.sex).toLowerCase() === pollMatchGenderFilter.toLowerCase();
        const raceMatched =
          pollMatchRaceFilter === "any" ||
          asText(sp.race).toLowerCase() === pollMatchRaceFilter.toLowerCase();
        const emailReady = Boolean(email);
        const active = isActiveSp(sp);
        const roleMatch =
          Boolean(roleKeyword) &&
          [sp.other_roles, sp.notes, sp.telehealth]
            .map(asText)
            .join(" ")
            .toLowerCase()
            .includes(roleKeyword);
        const skillMatch = Boolean(keyword) && getCandidateSearchText(sp).includes(keyword);
        const genderFitUsed = pollMatchGenderFilter !== "any";
        const raceFitUsed = pollMatchRaceFilter !== "any";
        const ageFitUsed = Boolean(ageKeyword);
        const excluded = excludedIds.has(String(sp.id)) || (email ? excludedEmails.has(normalizeEmail(email)) : false);
        const chips = [
          importedResponse?.responseStatus === "available" ? "Imported Available" : "",
          importedResponse?.responseStatus === "maybe" ? "Imported Maybe" : "",
          importedResponse?.responseStatus === "not_available" ? "Imported Not Available" : "",
          importedResponse?.matchType === "email" ? "Email matched" : "",
          importedResponse?.matchType === "name" ? "Name matched" : "",
          effectivePollLocationFilter === "elkins_park" && locationMatched ? "Elkins Park fit" : "",
          effectivePollLocationFilter === "center_city" && locationMatched ? "Center City fit" : "",
          effectivePollLocationFilter === "virtual" && locationMatched ? "Virtual ready" : "",
          ageFitUsed && ageFitMatched ? "Age range fit" : "",
          genderFitUsed && genderMatched ? "Gender fit" : "",
          raceFitUsed && raceMatched ? "Role/case fit" : "",
          roleMatch ? "Role fit" : "",
          skillMatch ? "Skill match" : "",
          speaksSpanish(sp) && pollMatchSpanishOnly ? "Spanish" : "",
          emailReady ? "Email ready" : "",
          active ? "Active" : "",
          hasPriorResponse ? "Prior respondent" : "",
        ].filter(Boolean);
        const matchScore = (() => {
          let total = 0;
          if (locationMatched) total += 30;
          if (emailReady) total += 18;
          if (active) total += 16;
          if (hasPriorResponse) total += 14;
          if (importedResponse?.matchType === "email") total += 12;
          else if (importedResponse?.matchType === "name") total += 5;
          if (pollResponseStatus === "available") total += 20;
          else if (pollResponseStatus === "maybe") total += 10;
          else if (pollResponseStatus === "not_available") total -= 25;
          if (roleMatch) total += 8;
          if (skillMatch) total += 6;
          if (ageFitUsed && ageFitMatched) total += 6;
          if (genderFitUsed && genderMatched) total += 6;
          if (raceFitUsed && raceMatched) total += 4;
          if (hasTelehealth(sp) && effectivePollLocationFilter === "virtual") total += 12;
          total += Math.max(0, 6 - getAvailabilityMatchRank(availabilityMatchBySpId.get(sp.id)?.status || "unknown"));
          if (excluded) total -= 1000;
          if (selectedIds.has(String(sp.id))) total -= 120;
          if (assignment) total -= 100;
          return total;
        })();
        const matchLabel =
          matchScore >= 80 ? "Top fit" : matchScore >= 60 ? "Strong fit" : matchScore >= 40 ? "Possible fit" : "Review";

        return {
          sp,
          email,
          assignment,
          pollResponseStatus,
          hasPriorResponse,
          locationMatched,
          keywordMatched,
          emailReady,
          active,
          roleMatch,
          roleFitMatched,
          skillMatch,
          ageFitMatched,
          genderMatched,
          raceMatched,
          chips,
          matchScore,
          matchLabel,
          availabilityMatch: availabilityMatchBySpId.get(sp.id)?.status || "unknown",
          selected: selectedIds.has(String(sp.id)),
          excluded,
          importedResponse,
        };
      })
      .filter((entry) => {
        if (pollMatchActiveOnly && !entry.active) return false;
        if (pollMatchEmailReadyOnly && !entry.emailReady) return false;
        if (pollMatchAvailableRespondersOnly && entry.pollResponseStatus !== "available") return false;
        if (pollMatchSpanishOnly && !speaksSpanish(entry.sp)) return false;
        if (pollMatchTelehealthOnly && !hasTelehealth(entry.sp)) return false;
        if (pollMatchNotSelectedOnly && entry.selected) return false;
        if (pollMatchNotAssignedOnly && entry.assignment) return false;
        if (pollMatchNotExcludedOnly && entry.excluded) return false;
        if (effectivePollLocationFilter !== "any" && !entry.locationMatched) return false;
        if (!entry.keywordMatched) return false;
        if (!entry.roleFitMatched) return false;
        if (!entry.ageFitMatched) return false;
        if (!entry.genderMatched) return false;
        if (!entry.raceMatched) return false;
        return true;
      })
      .sort((a, b) => {
        if (pollMatchSort === "name") {
          return getFullName(a.sp).localeCompare(getFullName(b.sp));
        }
        if (pollMatchSort === "email_ready") {
          if (a.emailReady !== b.emailReady) return a.emailReady ? -1 : 1;
          return getFullName(a.sp).localeCompare(getFullName(b.sp));
        }
        if (pollMatchSort === "recently_responded") {
          if (a.hasPriorResponse !== b.hasPriorResponse) return a.hasPriorResponse ? -1 : 1;
          if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
          return getFullName(a.sp).localeCompare(getFullName(b.sp));
        }
        if (pollMatchSort === "assigned_last") {
          if (Boolean(a.assignment) !== Boolean(b.assignment)) return a.assignment ? 1 : -1;
          if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
          return getFullName(a.sp).localeCompare(getFullName(b.sp));
        }
        const scoreDiff = b.matchScore - a.matchScore;
        if (scoreDiff !== 0) return scoreDiff;
        return getFullName(a.sp).localeCompare(getFullName(b.sp));
      });
  }, [
    assignmentsBySpId,
    availabilityMatchBySpId,
    availableSps,
    excludedPollSpEmailsFromMetadata,
    excludedPollSpIdsFromMetadata,
    effectivePollLocationFilter,
    event?.location,
    importedPollResponsesBySpId,
    pollMatchActiveOnly,
    pollMatchAgeKeyword,
    pollMatchAvailableRespondersOnly,
    pollMatchEmailReadyOnly,
    pollMatchGenderFilter,
    pollMatchKeyword,
    pollMatchNotAssignedOnly,
    pollMatchNotExcludedOnly,
    pollMatchNotSelectedOnly,
    pollMatchRaceFilter,
    pollMatchRoleKeyword,
    pollMatchSpanishOnly,
    pollMatchSort,
    pollMatchTelehealthOnly,
    selectedPollSpIds,
  ]);
  const recommendedPollMatches = useMemo(
    () =>
      pollMatchEntries.filter((entry) => !entry.selected && !entry.excluded).slice(0, Math.max(Number(event?.sp_needed || 0), 6)),
    [event?.sp_needed, pollMatchEntries]
  );
  const importedPollResponseSummary = useMemo(() => {
    const availableCount = importedPollResponses.filter((entry) => entry.responseStatus === "available").length;
    const maybeCount = importedPollResponses.filter((entry) => entry.responseStatus === "maybe").length;
    const notAvailableCount = importedPollResponses.filter((entry) => entry.responseStatus === "not_available").length;
    return {
      availableCount,
      maybeCount,
      notAvailableCount,
      unmatchedCount: unmatchedImportedPollResponses.length,
      totalMatched: importedPollResponses.length - unmatchedImportedPollResponses.length,
    };
  }, [importedPollResponses, unmatchedImportedPollResponses.length]);
  const importedResponderEntries = useMemo(() => {
    const excludedIds = new Set(excludedPollSpIdsFromMetadata.map((item) => String(item)));
    const excludedEmails = new Set(excludedPollSpEmailsFromMetadata.map((item) => normalizeEmail(item)));
    const demographicFiltersActive =
      pollMatchGenderFilter !== "any" || pollMatchRaceFilter !== "any" || Boolean(pollMatchAgeKeyword.trim());

    return Array.from(importedPollResponsesBySpId.values())
      .map((importedResponse) => {
        const sp = spsById.get(importedResponse.matchedSpId);
        if (!sp) return null;
        const assignment = assignmentsBySpId.get(String(sp.id)) || null;
        const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
        const pollResponseStatus = getEffectivePollResponseStatus(assignment?.notes, importedResponse);
        const email = getEmail(sp);
        const emailReady = Boolean(email);
        const active = isActiveSp(sp);
        const locationText = [sp.notes, sp.other_roles, sp.telehealth, event?.location].map(asText).join(" ");
        const detectedLocation = detectLocationFitFromText(locationText);
        const locationMatched =
          effectivePollLocationFilter === "any"
            ? true
            : effectivePollLocationFilter === "virtual"
              ? hasTelehealth(sp) || detectedLocation === "virtual"
              : detectedLocation === effectivePollLocationFilter;
        const roleKeyword = pollMatchRoleKeyword.trim().toLowerCase();
        const roleMatch =
          !roleKeyword ||
          [sp.other_roles, sp.notes, sp.telehealth]
            .map(asText)
            .join(" ")
            .toLowerCase()
            .includes(roleKeyword);
        const keyword = pollMatchKeyword.trim().toLowerCase();
        const skillMatch = !keyword || getCandidateSearchText(sp).includes(keyword);
        const ageKeyword = pollMatchAgeKeyword.trim().toLowerCase();
        const ageFitMatched = !ageKeyword || asText(sp.portrayal_age).toLowerCase().includes(ageKeyword);
        const genderMatched =
          pollMatchGenderFilter === "any" ||
          asText(sp.sex).toLowerCase() === pollMatchGenderFilter.toLowerCase();
        const raceMatched =
          pollMatchRaceFilter === "any" ||
          asText(sp.race).toLowerCase() === pollMatchRaceFilter.toLowerCase();
        const excluded = excludedIds.has(String(sp.id)) || (email ? excludedEmails.has(normalizeEmail(email)) : false);
        const isAssigned = Boolean(assignment);
        const isConfirmed = assignment ? isAssignmentConfirmed(assignment) : false;
        const demographicPriority =
          demographicFiltersActive &&
          ageFitMatched &&
          genderMatched &&
          raceMatched;
        const score = (() => {
          let total = importedResponse.matchConfidence || 0;
          if (pollResponseStatus === "available") total += 38;
          else if (pollResponseStatus === "maybe") total += 20;
          else if (pollResponseStatus === "not_available") total -= 45;
          if (demographicPriority) total += 18;
          if (roleMatch) total += 14;
          if (locationMatched) total += 14;
          if (active) total += 12;
          if (emailReady) total += 10;
          if (hasTelehealth(sp)) total += 8;
          if (speaksSpanish(sp)) total += 8;
          if (isConfirmed) total += 12;
          else if (isAssigned) total += 6;
          if (excluded) total -= 1000;
          return total;
        })();
        const reasons = [
          pollResponseStatus === "available" ? "Imported Available" : "",
          pollResponseStatus === "maybe" ? "Imported Maybe" : "",
          pollResponseStatus === "not_available" ? "Imported Not Available" : "",
          importedResponse.matchType === "email" ? "Email matched" : importedResponse.matchType === "name" ? "Name matched" : "",
          locationMatched && effectivePollLocationFilter !== "any"
            ? effectivePollLocationFilter === "elkins_park"
              ? "Elkins Park fit"
              : effectivePollLocationFilter === "center_city"
                ? "Center City fit"
                : "Virtual ready"
            : "",
          roleKeyword && roleMatch ? "Role fit" : "",
          pollMatchAgeKeyword.trim() && ageFitMatched ? "Age range fit" : "",
          pollMatchGenderFilter !== "any" && genderMatched ? "Gender fit" : "",
          pollMatchRaceFilter !== "any" && raceMatched ? "Role fit" : "",
          keyword && skillMatch ? "Skill match" : "",
          speaksSpanish(sp) ? "Spanish" : "",
          hasTelehealth(sp) ? "Virtual ready" : "",
          active ? "Active" : "",
          emailReady ? "Email ready" : "",
          isAssigned ? "Existing event row" : "",
          isConfirmed ? "Already confirmed" : "",
          excluded ? "Excluded" : "",
        ].filter(Boolean);
        const group =
          pollResponseStatus === "not_available"
            ? "backup"
            : demographicPriority && pollResponseStatus !== "no_response"
              ? "demographic"
              : pollResponseStatus === "available"
                ? score >= 85
                  ? "best"
                  : "good"
                : pollResponseStatus === "maybe" || pollResponseStatus === "no_response"
                  ? "backup"
                  : "good";
        return {
          sp,
          assignment,
          assignmentStatus,
          pollResponseStatus,
          importedResponse,
          isAssigned,
          isConfirmed,
          isActive: active,
          emailReady,
          excluded,
          score,
          reasons,
          group,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => {
        const responseRank = { available: 0, maybe: 1, no_response: 2, not_available: 3 } satisfies Record<PollResponseStatus, number>;
        const responseCompare = responseRank[a.pollResponseStatus] - responseRank[b.pollResponseStatus];
        if (responseCompare !== 0) return responseCompare;
        const scoreCompare = b.score - a.score;
        if (scoreCompare !== 0) return scoreCompare;
        const confidenceCompare = (b.importedResponse.matchConfidence || 0) - (a.importedResponse.matchConfidence || 0);
        if (confidenceCompare !== 0) return confidenceCompare;
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.emailReady !== b.emailReady) return a.emailReady ? -1 : 1;
        return getFullName(a.sp).localeCompare(getFullName(b.sp));
      });
  }, [
    assignmentsBySpId,
    effectivePollLocationFilter,
    event?.location,
    excludedPollSpEmailsFromMetadata,
    excludedPollSpIdsFromMetadata,
    importedPollResponsesBySpId,
    pollMatchAgeKeyword,
    pollMatchGenderFilter,
    pollMatchKeyword,
    pollMatchRaceFilter,
    pollMatchRoleKeyword,
    spsById,
  ]);
  const confirmedCount = assignments.filter(
    (assignment) => getAssignmentStatus(assignment) === "confirmed"
  ).length;
  const backupCount = assignments.filter(
    (assignment) => getAssignmentStatus(assignment) === "backup"
  ).length;
  const staffedCount = confirmedCount + backupCount;
  const selectedStaffingCount = staffedCount;
  const contactedAssignmentCount = pollInviteOnlyAssignments.length;
  const needed = Number(event?.sp_needed || 0);
  const shortage = Math.max(needed - staffedCount, 0);
  const workflowTone = getCoverageWorkflowTone(needed, selectedStaffingCount, contactedAssignmentCount);
  const eventMeta = classifyEventPresentation({
    name: event?.name,
    status: event?.status,
    notes: event?.notes,
    location: event?.location,
    visibility: event?.visibility,
    spNeeded: needed,
    assignmentCount: hiredAssignments.length,
    confirmedCount: staffedCount,
    isWorkshop: isSkillsWorkshopEvent(needed, hiredAssignments.length, staffedCount),
  });
  const badgeAppearance = getEventBadgeAppearance(eventMeta.primaryBadgeKind);
  const isWorkshop = eventMeta.isSkillsWorkshop;
  const explicitEventTypes = getExplicitEventTypes(eventEditor.notes);
  const activeEventTypes = (explicitEventTypes.length
    ? explicitEventTypes
    : eventMeta.activeEventTypes) as EditableEventType[];
  const activeEventTypeSet = useMemo(() => new Set(activeEventTypes), [activeEventTypes]);
  const coverageStatus =
    isWorkshop
      ? {
          message: "Skills Workshop",
          background: "rgba(44, 211, 173, 0.14)",
          border: "1px solid rgba(44, 211, 173, 0.24)",
          color: "var(--cfsp-green)",
        }
      : needed <= 0
      ? {
          message: hiredAssignments.length > 0 ? "Roster selected" : "SP target not set",
          background: "rgba(168, 183, 204, 0.12)",
          border: "1px solid var(--cfsp-border)",
          color: "var(--cfsp-text-muted)",
        }
      : shortage === 0
        ? {
            message: "Coverage complete",
            background: planningSuccessBackground,
            border: planningSuccessBorder,
            color: planningSuccessText,
          }
        : {
            message: `${shortage} SP${shortage === 1 ? "" : "s"} still needed`,
            background: shortage <= 2 ? "#fff7ed" : "#fff5f5",
            border: shortage <= 2 ? "1px solid #fed7aa" : "1px solid #fecaca",
            color: shortage <= 2 ? "#9a3412" : "#991b1b",
          };
  const coveragePercent =
    needed > 0 ? Math.min(100, Math.round((staffedCount / needed) * 100)) : 0;
  const importedYearHint = getImportedYearHint(event?.notes);
  const metadataStudentCount = useMemo(
    () => parseIntegerNoteValue(event?.notes, "Student Count"),
    [event?.notes]
  );
  const metadataRoomCount = useMemo(
    () => parseIntegerNoteValue(event?.notes, "Rooms"),
    [event?.notes]
  );
  const metadataRotationRoundsNeeded = useMemo(
    () => parseIntegerNoteValue(event?.notes, "Rotation Rounds Needed"),
    [event?.notes]
  );
  const metadataGeneratedRotationRounds = useMemo(
    () => parseIntegerNoteValue(event?.notes, "Generated Rotation Rounds"),
    [event?.notes]
  );
  const relatedTrainingEventId = useMemo(
    () => parseNoteValue(event?.notes, "Related Training Event ID"),
    [event?.notes]
  );
  const relatedTrainingEventName = useMemo(
    () => parseNoteValue(event?.notes, "Related Training Event"),
    [event?.notes]
  );
  const allRotationRounds = useMemo(() => buildRotationRounds(sessions), [sessions]);
  const learnerCapacityRotationLimit =
    metadataStudentCount > 0 && metadataRoomCount > 0
      ? Math.ceil(metadataStudentCount / metadataRoomCount)
      : 0;
  const operationalRotationLimit =
    learnerCapacityRotationLimit ||
    metadataRotationRoundsNeeded ||
    metadataGeneratedRotationRounds ||
    0;
  const rotationRounds = useMemo(
    () => capRotationRounds(allRotationRounds, operationalRotationLimit),
    [allRotationRounds, operationalRotationLimit]
  );
  const hiddenExtraBackendRounds =
    operationalRotationLimit > 0 && allRotationRounds.length > rotationRounds.length
      ? allRotationRounds.length - rotationRounds.length
      : 0;
  const simStaffNames = useMemo(() => getSimStaffNames(event?.notes), [event?.notes]);
  const trainingMetadata = useMemo(
    () => parseTrainingEventMetadata(eventEditor.notes),
    [eventEditor.notes]
  );
  const persistedWorkflowChecks = useMemo(
    () => new Set(parseWorkflowManualChecks(trainingMetadata.workflow_manual_checks)),
    [trainingMetadata.workflow_manual_checks]
  );
  const fallbackFacultyText = useMemo(() => getFacultyText(eventEditor.notes), [eventEditor.notes]);
  const structuredDateLabel = sessions.length
    ? rotationRounds
        .map((round) =>
          [
            formatSessionDate(round.session_date, importedYearHint),
            round.start_time && round.end_time
              ? `${formatDisplayTime(round.start_time)} - ${formatDisplayTime(round.end_time)}`
              : formatDisplayTime(round.start_time || round.end_time),
            round.rooms.length
              ? `${round.rooms.length} room${round.rooms.length === 1 ? "" : "s"}`
              : event?.location || "Location TBD",
          ]
            .filter(Boolean)
            .join(" · ")
        )
        .join("; ")
    : "";
  const eventDateLabel = structuredDateLabel || formatEventDateText(event?.date_text, importedYearHint);
  const uniqueSessionDates = useMemo(
    () =>
      Array.from(
        new Set(
          rotationRounds
            .map((round) => formatSessionDate(round.session_date, importedYearHint))
            .filter(Boolean)
        )
      ),
    [importedYearHint, rotationRounds]
  );
const sessionSummaryLabel = useMemo(() => {
  if (!rotationRounds.length) return formatEventDateText(event?.date_text, importedYearHint);
  if (rotationRounds.length === 1) return formatSessionDate(rotationRounds[0]?.session_date, importedYearHint);
  if (uniqueSessionDates.length === 1) {
    return `${rotationRounds.length} rotation rounds on ${uniqueSessionDates[0]}`;
  }
  return `${rotationRounds.length} rotation rounds across ${uniqueSessionDates.join(", ")}`;
}, [event?.date_text, importedYearHint, rotationRounds, uniqueSessionDates]);

const summaryTimeLabel = useMemo(() => {
  if (!rotationRounds.length) return "Time TBD";
  if (rotationRounds.length === 1) {
    const round = rotationRounds[0];
    return round.start_time && round.end_time
      ? `${formatDisplayTime(round.start_time)} - ${formatDisplayTime(round.end_time)}`
      : formatDisplayTime(round.start_time || round.end_time);
  }

  const firstStart = rotationRounds[0]?.start_time;
  const lastEnd = rotationRounds[rotationRounds.length - 1]?.end_time;

  if (firstStart && lastEnd) {
    return `${formatDisplayTime(firstStart)} - ${formatDisplayTime(lastEnd)}`;
  }

  return "See rotation rounds below";
}, [rotationRounds]);
  const liveEventAnchorDateIso = useMemo(() => {
    if (!rotationRounds.length) return "";
    const todayIso = new Date().toISOString().slice(0, 10);
    const matchingToday = rotationRounds.find(
      (round) => normalizeLooseDateToIso(round.session_date, importedYearHint) === todayIso
    );
    if (matchingToday) {
      return normalizeLooseDateToIso(matchingToday.session_date, importedYearHint) || "";
    }
    return normalizeLooseDateToIso(rotationRounds[0]?.session_date, importedYearHint) || "";
  }, [importedYearHint, rotationRounds]);
  const liveFlowBlocks = useMemo(() => {
    if (!rotationRounds.length) return [] as Array<{
      key: string;
      label: string;
      detail: string;
      startMinutes: number;
      endMinutes: number;
      tone: "rotation" | "transition" | "break" | "support";
      roundNumber: number | null;
      rooms: string[];
    }>;

    const notesText = [event?.notes, eventEditor.notes].map(asText).join(" ").toLowerCase();
    const eventDayRounds = rotationRounds.filter((round) => {
      const iso = normalizeLooseDateToIso(round.session_date, importedYearHint);
      return liveEventAnchorDateIso ? iso === liveEventAnchorDateIso : true;
    });
    const blocks: Array<{
      key: string;
      label: string;
      detail: string;
      startMinutes: number;
      endMinutes: number;
      tone: "rotation" | "transition" | "break" | "support";
      roundNumber: number | null;
      rooms: string[];
    }> = [];

    eventDayRounds.forEach((round, index) => {
      const startMinutes = parseTimeToMinutes(round.start_time);
      const endMinutes = parseTimeToMinutes(round.end_time);
      if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return;

      blocks.push({
        key: `${round.key}-rotation`,
        label: `Rotation ${index + 1}`,
        detail: `${round.rooms.length} room${round.rooms.length === 1 ? "" : "s"} in use`,
        startMinutes,
        endMinutes,
        tone: "rotation",
        roundNumber: index + 1,
        rooms: round.rooms,
      });

      const nextRound = eventDayRounds[index + 1];
      const nextStartMinutes = parseTimeToMinutes(nextRound?.start_time);
      if (typeof nextStartMinutes === "number" && nextStartMinutes > endMinutes) {
        const gapMinutes = nextStartMinutes - endMinutes;
        const blockLabel =
          gapMinutes >= 40
            ? "Lunch"
            : /soap/i.test(notesText) && gapMinutes >= 10
              ? "SOAP Notes"
              : /checklist/i.test(notesText) && gapMinutes >= 5
                ? "Checklist"
                : gapMinutes >= 15
                  ? "Break"
                  : "Transition";
        blocks.push({
          key: `${round.key}-gap`,
          label: blockLabel,
          detail: `${gapMinutes} minutes`,
          startMinutes: endMinutes,
          endMinutes: nextStartMinutes,
          tone:
            blockLabel === "Transition"
              ? "transition"
              : blockLabel === "Break" || blockLabel === "Lunch"
                ? "break"
                : "support",
          roundNumber: null,
          rooms: [],
        });
      }
    });

    return blocks;
  }, [event?.notes, eventEditor.notes, importedYearHint, liveEventAnchorDateIso, rotationRounds]);
  const simulatedLiveMinutes = useMemo(() => {
    const baseMs = livePausedAtMs ?? liveNowMs;
    const simulated = new Date(baseMs - liveDelayMinutes * 60 * 1000);
    return simulated.getHours() * 60 + simulated.getMinutes();
  }, [liveDelayMinutes, liveNowMs, livePausedAtMs]);
  const currentLiveBlockIndex = liveFlowBlocks.findIndex(
    (block) =>
      simulatedLiveMinutes >= block.startMinutes && simulatedLiveMinutes < block.endMinutes
  );
  const currentLiveBlock =
    currentLiveBlockIndex >= 0
      ? liveFlowBlocks[currentLiveBlockIndex]
      : null;
  const nextLiveBlock =
    currentLiveBlockIndex >= 0
      ? liveFlowBlocks[currentLiveBlockIndex + 1] || null
      : liveFlowBlocks.find((block) => block.startMinutes > simulatedLiveMinutes) || null;
  const currentRotationRoundNumber =
    currentLiveBlock?.tone === "rotation" ? currentLiveBlock.roundNumber : null;
  const defaultSelectedRotationRoundKey = useMemo(() => {
    if (!rotationRounds.length) return "";
    if (
      currentRotationRoundNumber &&
      currentRotationRoundNumber > 0 &&
      currentRotationRoundNumber <= rotationRounds.length
    ) {
      return rotationRounds[currentRotationRoundNumber - 1]?.key || rotationRounds[0]?.key || "";
    }
    return rotationRounds[0]?.key || "";
  }, [currentRotationRoundNumber, rotationRounds]);
  const currentLiveAssignmentRows = useMemo(() => {
    if (!currentLiveBlock?.rooms.length) return [] as Array<{
      assignment: AssignmentRow;
      sp: SPRow;
      roomName: string;
    }>;
    return currentLiveBlock.rooms
      .map((roomName, index) => {
        const assignment = sortedAssignments[index];
        const sp = assignment?.sp_id ? spsById.get(assignment.sp_id) : undefined;
        if (!assignment || !sp) return null;
        return { assignment, sp, roomName };
      })
      .filter(Boolean) as Array<{ assignment: AssignmentRow; sp: SPRow; roomName: string }>;
  }, [currentLiveBlock, sortedAssignments, spsById]);
  const currentLiveRoomBoardRows = useMemo(() => {
    if (!currentLiveBlock?.rooms.length) {
      return [] as Array<{
        key: string;
        roomName: string;
        assignment: AssignmentRow | null;
        sp: SPRow | null;
        learnerLabel: string;
        defaultStatus: LiveRoomStatusValue;
        status: LiveRoomStatusValue;
        delayMinutes: number;
        issueNote: string;
        timeRemainingLabel: string;
        checkedAt: string;
      }>;
    }

    const remainingLabel = currentLiveBlock
      ? formatRemainingMinutes(Math.max(currentLiveBlock.endMinutes - simulatedLiveMinutes, 0))
      : "Timeline TBD";

    return currentLiveBlock.rooms.map((roomName, index) => {
      const assignment = sortedAssignments[index] || null;
      const sp = assignment?.sp_id ? spsById.get(assignment.sp_id) || null : null;
      const checkedAt = assignment ? formatAttendanceTimestamp(assignment.training_checked_in_at) : "";
      const liveKey = `${currentLiveBlock.key}|${roomName || `room-${index}`}`;
      const localState = liveRoomStates[liveKey] || {};
      const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
      const missingSp =
        Boolean(assignment) &&
        assignment?.training_attended !== true &&
        assignmentStatus !== "declined" &&
        assignmentStatus !== "no_show";
      const defaultStatus: LiveRoomStatusValue = !assignment
        ? "empty"
        : assignmentStatus === "no_show" || missingSp
          ? "sp_missing"
          : livePausedAtMs !== null
            ? "ready"
            : "in_session";
      const learnerLabel =
        metadataStudentCount > 0 && metadataRoomCount > 0
          ? `Learner ${Math.min(metadataStudentCount, currentRotationRoundNumber ? (currentRotationRoundNumber - 1) * metadataRoomCount + index + 1 : index + 1)}`
          : "Learner TBD";

      return {
        key: liveKey,
        roomName: roomName || `Room ${index + 1}`,
        assignment,
        sp,
        learnerLabel,
        defaultStatus,
        status: localState.status || defaultStatus,
        delayMinutes: localState.delayMinutes || 0,
        issueNote: localState.issueNote || "",
        timeRemainingLabel: remainingLabel,
        checkedAt,
      };
    });
  }, [
    currentLiveBlock,
    currentRotationRoundNumber,
    livePausedAtMs,
    liveRoomStates,
    metadataRoomCount,
    metadataStudentCount,
    simulatedLiveMinutes,
    sortedAssignments,
    spsById,
  ]);
  const liveRoomDelayedCount = currentLiveRoomBoardRows.filter((row) => row.status === "delayed" || row.delayMinutes > 0).length;
  const liveRoomMissingCount = currentLiveRoomBoardRows.filter((row) => row.status === "sp_missing").length;
  const liveRoomActiveCount = currentLiveRoomBoardRows.filter((row) => row.status === "in_session" || row.status === "ready").length;
  useEffect(() => {
    if (!rotationRounds.length) {
      setSelectedRotationRoundKey("");
      setHasTouchedRoundCompanion(false);
      return;
    }
    setSelectedRotationRoundKey((current) =>
      current && rotationRounds.some((round) => round.key === current) ? current : defaultSelectedRotationRoundKey
    );
  }, [defaultSelectedRotationRoundKey, rotationRounds]);
  const assignedEmailSources = useMemo(() => {
    return assignments
      .map((assignment) => {
        const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
        if (!sp) return null;

        const email = getEmail(sp);
        if (!email) return null;

        return {
          assignmentId: assignment.id,
          spName: getFullName(sp),
          email,
          source: getEmailSource(sp),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [assignments, spsById]);

  const bccEmails = useMemo(
    () => Array.from(new Set(assignedEmailSources.map((item) => item.email))),
    [assignedEmailSources]
  );
  const assignedEmailRecipients = useMemo(
    () =>
      sortedAssignments
        .map((assignment) => {
          const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
          if (!sp) return null;

          const email = getEmail(sp);
          if (!email) return null;

          return {
            assignment,
            sp,
            email,
          };
        })
        .filter(
          (
            item
          ): item is {
            assignment: AssignmentRow;
            sp: SPRow;
            email: string;
          } => Boolean(item)
        ),
    [sortedAssignments, spsById]
  );
  const assignedBccEmails = useMemo(
    () => Array.from(new Set(assignedEmailRecipients.map((item) => item.email))),
    [assignedEmailRecipients]
  );
  const shortageCount = isWorkshop ? 0 : shortage;
  const isTrainingMode = eventMeta.isTraining || activeEventTypeSet.has("training");
  const noSpStaffingRequired = activeEventTypeSet.has("skills") && !eventMeta.hasSpWorkflow;
  const staffingRelevant = eventMeta.hasSpWorkflow;
  const hasFaculty = hasNotesLine(event?.notes, /^(Course Faculty|Faculty)\s*:/im);
  const hasCase = hasNotesLine(event?.notes, /^Case\s*:/im);
  const hasTrainingScheduled = hasNotesLine(event?.notes, /^Training Date\s*:/im);
  const hasZoomReady = hasNotesLine(event?.notes, /^(Zoom|SimIQ)\s*:/im) || /zoom|simiq|online|virtual/i.test(asText(event?.notes));
  const hasRoomsBuilt = sessions.some((session) => Boolean(asText(session.room) || asText(session.location)));
  const rotationScheduleBuilt = ["built", "saved", "complete"].includes(
    asText(trainingMetadata.rotation_schedule_status).toLowerCase()
  );
  const trainingFacultyText = trainingMetadata.faculty_names || fallbackFacultyText;
  const facultyProgramText = trainingMetadata.faculty_program;
  const facultyEmailText = trainingMetadata.faculty_email;
  const facultyPhoneText = trainingMetadata.faculty_phone;
  const trainingSimContact =
    trainingMetadata.sim_contact || simStaffNames.join(", ") || "Sim Team Assigned";
  const materialsStatusLabel = getMaterialStatusLabel(trainingMetadata);
  const emailStatusLabel = getEmailStatusLabel(trainingMetadata);
  const facultyReadinessComplete = Boolean(
    trainingFacultyText || facultyEmailText || facultyPhoneText || trainingMetadata.sim_contact || hasFaculty
  );
  const facultyReadinessLabel = facultyReadinessComplete
    ? [trainingFacultyText || "Faculty recorded", facultyEmailText || facultyPhoneText || trainingMetadata.sim_contact]
        .filter(Boolean)
        .join(" · ")
    : "Needs contact";
  const outreachProgressLabel = assignments.some(
    (assignment) =>
      Boolean(assignment.last_contacted_at) || ["contacted", "confirmed", "declined"].includes(getAssignmentStatus(assignment))
  )
    ? "In progress"
    : emailStatusLabel === "Sent"
      ? "Sent"
      : emailStatusLabel === "Draft opened"
        ? "Draft opened"
        : "Not started";
  const selectedModalityLabel = inferEventModalityLabel(activeEventTypeSet, trainingMetadata, event);
  const trainingLocationModality =
    selectedModalityLabel === "Hybrid"
      ? event?.location
        ? `${event.location} · Hybrid`
        : "Hybrid"
      : selectedModalityLabel === "Virtual"
        ? event?.location
          ? `${event.location} · Virtual`
          : "Virtual"
        : event?.location || "Location TBD";
  const trainingMaterialCards = useMemo(
    () => [
      {
        kind: "case_file" as const,
        title: trainingMetadata.case_name || "Case File",
        hint: "Case materials for the training.",
      },
      {
        kind: "doorsign" as const,
        title: "Doorsign",
        hint: "Doorsign or room-facing asset.",
      },
      {
        kind: "supplemental_doc" as const,
        title: "Supplemental Doc",
        hint: "Optional prep doc, guide, or handout.",
      },
    ],
    [trainingMetadata.case_name]
  );
  const trainingCaseStatus =
    trainingMetadata.case_name || trainingMetadata.case_file_url || trainingMetadata.case_file_name
      ? "Ready"
      : "Needs case";
  const trainingRosterPreview = useMemo(
    () => (showAllTrainingRoster ? sortedAssignments : sortedAssignments.slice(0, 8)),
    [showAllTrainingRoster, sortedAssignments]
  );
  const pollStatusLabel = pollMetadata.pollStatus || "not_created";
  const pollStatusDisplayLabel =
    pollStatusLabel === "sent"
      ? "Sent"
      : pollStatusLabel === "draft_ready"
        ? "Draft ready"
        : "Not created";
  const pollEventDateTimeSummary = useMemo(() => {
    if (!rotationRounds.length) {
      const dateLabel = formatEventDateText(event?.date_text, importedYearHint);
      return dateLabel ? `${dateLabel} · Time TBD` : "Date/time TBD";
    }

    const grouped = new Map<string, { dateLabel: string; start: string; end: string }>();
    rotationRounds.forEach((round) => {
      const key = asText(round.session_date) || "date-tbd";
      const existing = grouped.get(key);
      const dateLabel = formatSessionDate(round.session_date, importedYearHint) || "Date TBD";
      const start = asText(round.start_time);
      const end = asText(round.end_time);
      const startMinutes = start ? parseTimeToMinutes(start) : null;
      const endMinutes = end ? parseTimeToMinutes(end) : null;

      if (!existing) {
        grouped.set(key, { dateLabel, start, end });
        return;
      }

      const existingStartMinutes = existing.start ? parseTimeToMinutes(existing.start) : null;
      const existingEndMinutes = existing.end ? parseTimeToMinutes(existing.end) : null;

      if (
        start &&
        (!existing.start ||
          typeof existingStartMinutes !== "number" ||
          (typeof startMinutes === "number" && startMinutes < existingStartMinutes))
      ) {
        existing.start = start;
      }
      if (
        end &&
        (!existing.end ||
          typeof existingEndMinutes !== "number" ||
          (typeof endMinutes === "number" && endMinutes > existingEndMinutes))
      ) {
        existing.end = end;
      }
    });

    return Array.from(grouped.values())
      .map((entry) => {
        const timeLabel =
          entry.start && entry.end
            ? `${formatDisplayTime(entry.start)} - ${formatDisplayTime(entry.end)}`
            : formatDisplayTime(entry.start || entry.end) || "Time TBD";
        return `${entry.dateLabel} · ${timeLabel}`;
      })
      .join("; ");
  }, [event?.date_text, importedYearHint, rotationRounds]);
  const pollTrainingSummary = useMemo(() => {
    const dateText = asText(trainingMetadata.imported_training_date);
    const timeText = asText(trainingMetadata.imported_training_time);
    if (!dateText && !timeText) return "Training details will be shared separately.";
    return [dateText, timeText].filter(Boolean).join(" · ");
  }, [trainingMetadata.imported_training_date, trainingMetadata.imported_training_time]);
  const pollLocationSummary = useMemo(() => {
    if (trainingMetadata.zoom_url || /zoom|virtual|telehealth|online/i.test(asText(event?.location))) {
      return "Online via Zoom";
    }
    return asText(event?.location) || "Location TBD";
  }, [event?.location, trainingMetadata.zoom_url]);
  const eventSummarySourceText = useMemo(
    () =>
      [event?.name, event?.location, event?.notes, eventEditor.notes, trainingMetadata.recording_url, trainingMetadata.zoom_url]
        .map(asText)
        .join(" ")
        .toLowerCase(),
    [
      event?.location,
      event?.name,
      event?.notes,
      eventEditor.notes,
      trainingMetadata.recording_url,
      trainingMetadata.zoom_url,
    ]
  );
  const inferredRecordingActive = useMemo(() => {
    const hasRecordingGuide = Boolean(asText(trainingMetadata.recording_url));
    const hasZoomRecording = /\bzoom\b/.test(eventSummarySourceText) && /\brecord/i.test(eventSummarySourceText);
    const hasSimCaptureRecording = /\bsim\s*capture\b|\bsimcapture\b/.test(eventSummarySourceText);
    return hasRecordingGuide || hasZoomRecording || hasSimCaptureRecording || /\brecording enabled\b|\brecorded\b/.test(eventSummarySourceText);
  }, [eventSummarySourceText, trainingMetadata.recording_url]);
  const hasSavedRecordingStatus = Boolean(normalizeRecordingStatusValue(trainingMetadata.recording_status));
  const recordingStatus = useMemo(() => {
    const savedRecordingStatus = getRecordingStatusOption(trainingMetadata.recording_status);
    if (savedRecordingStatus) return savedRecordingStatus;

    return getRecordingStatusOption("not_recorded") || recordingStatusOptions[0];
  }, [trainingMetadata.recording_status]);
  const recordingSupportActive = recordingStatus.active || (!hasSavedRecordingStatus && inferredRecordingActive);
  const recordingIndicatorActive = recordingStatus.active;
  const recordingIndicatorHot = recordingIndicatorActive && commandCenterMode === "live" && recordingStatus.value === "recorded";
  const recordingIndicatorLabel =
    recordingStatus.value === "recording_planned"
      ? "REC planned"
      : recordingStatus.value === "recording_pending"
        ? "REC pending"
        : "REC";
  const eventModalityChips = useMemo(() => {
    const chips = new Set<string>();
    chips.add(selectedModalityLabel);
    if (activeEventTypeSet.has("skills") || isWorkshop) chips.add("Skills");
    if (staffingRelevant) chips.add("SP Encounter");
    if (activeEventTypeSet.has("hifi")) chips.add("HiFi");
    if (/telehealth/.test(eventSummarySourceText)) chips.add("Telehealth");
    if ((metadataRoomCount || 0) > 1 || rotationRounds.length > 1) chips.add("Multi-Station");
    return Array.from(chips);
  }, [
    activeEventTypeSet,
    eventSummarySourceText,
    isWorkshop,
    metadataRoomCount,
    rotationRounds.length,
    selectedModalityLabel,
    staffingRelevant,
  ]);
  const simulationModalityChips = useMemo(() => {
    const chips: string[] = [];
    const addIf = (label: string, test: boolean) => {
      if (test && !chips.includes(label)) chips.push(label);
    };
    addIf("Formative", /\bformative\b/.test(eventSummarySourceText));
    addIf("Summative", /\bsummative\b/.test(eventSummarySourceText));
    addIf("OSCE", /\bosce\b/.test(eventSummarySourceText));
    addIf("IPE", /\bipe\b/.test(eventSummarySourceText));
    addIf("Training", isTrainingMode || /\btraining\b/.test(eventSummarySourceText));
    addIf("Mock Clinic", /\bmock clinic\b/.test(eventSummarySourceText));
    addIf("Assessment", /\bassessment\b/.test(eventSummarySourceText));
    addIf("Remediation", /\bremediation\b/.test(eventSummarySourceText));
    return chips.length ? chips : ["Operational Sim"];
  }, [eventSummarySourceText, isTrainingMode]);
  const operationalReadinessItems = useMemo(() => {
    const items = [
      { label: "Needs Staffing", active: staffingRelevant && selectedStaffingCount < Math.max(needed, 1) },
      { label: "Needs Faculty", active: !facultyReadinessComplete },
      { label: "Needs Materials", active: materialsStatusLabel !== "Ready" },
      { label: "Awaiting Schedule", active: !rotationRounds.length || summaryTimeLabel === "Time TBD" },
      { label: "Awaiting Rooms", active: !hasRoomsBuilt },
    ];
    return {
      primary: items.some((item) => item.active) ? items.find((item) => item.active)?.label || "Needs attention" : "Ready",
      items,
    };
  }, [
    facultyReadinessComplete,
    hasRoomsBuilt,
    materialsStatusLabel,
    needed,
    rotationRounds.length,
    selectedStaffingCount,
    staffingRelevant,
    summaryTimeLabel,
  ]);
  const communicationStatusItems = useMemo(
    () => [
      { label: "SP Poll Sent", active: asText(pollMetadata.pollStatus).toLowerCase() === "sent" },
      { label: "Hiring Email Sent", active: outreachProgressLabel === "Sent" || outreachProgressLabel === "In progress" },
      { label: "Faculty Confirmed", active: facultyReadinessComplete && Boolean(facultyEmailText || facultyPhoneText || trainingFacultyText) },
      { label: "Training Complete", active: Boolean(hasTrainingScheduled && trainingImportResult) || sortedAssignments.some((assignment) => assignment.training_attended) },
      { label: "Reminder Pending", active: asText(pollMetadata.pollStatus).toLowerCase() === "draft_ready" || outreachProgressLabel === "Draft opened" },
    ],
    [
      facultyEmailText,
      facultyPhoneText,
      facultyReadinessComplete,
      hasTrainingScheduled,
      outreachProgressLabel,
      pollMetadata.pollStatus,
      sortedAssignments,
      trainingFacultyText,
      trainingImportResult,
    ]
  );
  const materialsStatusItems = useMemo(
    () => [
      { label: "Case Uploaded", active: Boolean(trainingMetadata.case_file_url || trainingMetadata.case_name) },
      { label: "Door Signs Ready", active: Boolean(trainingMetadata.doorsign_url) },
      { label: "Zoom Ready", active: Boolean(trainingMetadata.zoom_url) || selectedModalityLabel === "Virtual" || selectedModalityLabel === "Hybrid" },
      { label: "AV Ready", active: /av ready|audio visual|av support/i.test(eventSummarySourceText) || Boolean(trainingMetadata.recording_url) },
      { label: "Recording Ready", active: recordingSupportActive },
    ],
    [
      eventSummarySourceText,
      recordingSupportActive,
      selectedModalityLabel,
      trainingMetadata.case_file_url,
      trainingMetadata.case_name,
      trainingMetadata.doorsign_url,
      trainingMetadata.recording_url,
      trainingMetadata.zoom_url,
    ]
  );
  const eventRiskLevel = useMemo(() => {
    let score = 0;
    if (staffingRelevant && shortageCount > 0) score += shortageCount > 2 ? 3 : 2;
    if (!facultyReadinessComplete) score += 2;
    if (!rotationRounds.length || summaryTimeLabel === "Time TBD") score += 2;
    if (!hasRoomsBuilt) score += 1;
    if (materialsStatusLabel !== "Ready") score += 2;
    if (score <= 1) return { label: "Stable", tone: "green", detail: "Operational plan is in good shape." };
    if (score <= 4) return { label: "Moderate Risk", tone: "yellow", detail: "A few planning dependencies still need follow-through." };
    return { label: "High Risk", tone: "red", detail: "Critical planning gaps could disrupt simulation flow." };
  }, [
    facultyReadinessComplete,
    hasRoomsBuilt,
    materialsStatusLabel,
    rotationRounds.length,
    shortageCount,
    staffingRelevant,
    summaryTimeLabel,
  ]);
  const liveSupportNeeds = useMemo(() => {
    const needs = [
      { label: "AV Support Required", active: /av|audio visual|projector|mic/.test(eventSummarySourceText) || Boolean(trainingMetadata.recording_url) },
      { label: "Sim Tech Required", active: activeEventTypeSet.has("hifi") || /sim tech|simcapture|recording/i.test(eventSummarySourceText) },
      { label: "Faculty Operator Needed", active: Boolean(facultyReadinessComplete && (activeEventTypeSet.has("hifi") || activeEventTypeSet.has("virtual"))) },
      { label: "SP Educator Needed", active: staffingRelevant && isTrainingMode },
      { label: "Recording Monitor Needed", active: recordingSupportActive },
    ];
    return needs.filter((item) => item.active);
  }, [
    activeEventTypeSet,
    eventSummarySourceText,
    facultyReadinessComplete,
    isTrainingMode,
    recordingSupportActive,
    staffingRelevant,
    trainingMetadata.recording_url,
  ]);
  const selectedRotationRoundIndex = useMemo(
    () => rotationRounds.findIndex((round) => round.key === selectedRotationRoundKey),
    [rotationRounds, selectedRotationRoundKey]
  );
  const activeSelectedRotationRoundIndex = selectedRotationRoundIndex >= 0 ? selectedRotationRoundIndex : 0;
  const selectedRotationRound =
    selectedRotationRoundIndex >= 0 ? rotationRounds[selectedRotationRoundIndex] : rotationRounds[0] || null;
  const selectedRoundAssignments = useMemo(() => {
    if (!selectedRotationRound) return [] as Array<{ roomName: string; assignment: AssignmentRow | null; sp: SPRow | null }>;
    const roomNames = selectedRotationRound.rooms.length ? selectedRotationRound.rooms : ["Room TBD"];
    return roomNames.map((roomName, index) => {
      const assignment = sortedAssignments[index] || null;
      const sp = assignment?.sp_id ? spsById.get(assignment.sp_id) || null : null;
      return { roomName, assignment, sp };
    });
  }, [selectedRotationRound, sortedAssignments, spsById]);
  const selectedRoundLearnerCount = useMemo(() => {
    if (!selectedRotationRound) return null;
    if (metadataStudentCount <= 0) return null;
    const roomCapacity = selectedRotationRound.rooms.length || metadataRoomCount || 0;
    if (roomCapacity <= 0) return null;
    const remaining = metadataStudentCount - activeSelectedRotationRoundIndex * roomCapacity;
    if (remaining <= 0) return 0;
    return Math.min(roomCapacity, remaining);
  }, [activeSelectedRotationRoundIndex, metadataRoomCount, metadataStudentCount, selectedRotationRound]);
  const selectedRoundEmptySlots = useMemo(() => {
    if (!selectedRotationRound) return null;
    if (selectedRoundLearnerCount === null) return null;
    const roomSlots = selectedRotationRound.rooms.length || metadataRoomCount || 0;
    if (roomSlots <= 0) return null;
    return Math.max(roomSlots - selectedRoundLearnerCount, 0);
  }, [metadataRoomCount, selectedRoundLearnerCount, selectedRotationRound]);
  const selectedRoundDayBlocks = useMemo(() => {
    if (!selectedRotationRound) return [] as Array<{ label: string; detail: string; audience: RotationCompanionView[] }>;
    return liveFlowBlocks
      .filter((block) => block.key.startsWith(`${selectedRotationRound.key}-`) && block.tone !== "rotation")
      .map((block) => ({
        label: block.label,
        detail: block.detail,
        audience: getRoundCompanionAudience(block.label),
      }));
  }, [liveFlowBlocks, selectedRotationRound]);
  const visibleSelectedRoundDayBlocks = useMemo(
    () =>
      selectedRoundDayBlocks.filter(
        (block) =>
          roundCompanionView === "operations" ||
          roundCompanionView === "announcements" ||
          block.audience.includes(roundCompanionView)
      ),
    [roundCompanionView, selectedRoundDayBlocks]
  );
  const feedbackMinutesFromMetadata = useMemo(
    () => parseIntegerNoteValue(eventEditor.notes || event?.notes, "Feedback / Break Length"),
    [event?.notes, eventEditor.notes]
  );
  const selectedRoundAnnouncementTimeline = useMemo(() => {
    if (!selectedRotationRound) {
      return [] as Array<{
        key: string;
        timeLabel: string;
        phaseLabel: string;
        announcement: string;
        detail?: string;
      }>;
    }

    const startMinutes = parseTimeToMinutes(selectedRotationRound.start_time);
    const encounterEndMinutes = parseTimeToMinutes(selectedRotationRound.end_time);
    if (startMinutes === null || encounterEndMinutes === null || encounterEndMinutes <= startMinutes) {
      return [] as Array<{
        key: string;
        timeLabel: string;
        phaseLabel: string;
        announcement: string;
        detail?: string;
      }>;
    }

    const nextRound = rotationRounds[activeSelectedRotationRoundIndex + 1] || null;
    const nextRoundStartMinutes = nextRound ? parseTimeToMinutes(nextRound.start_time) : null;
    const safeFeedbackMinutes = Math.max(feedbackMinutesFromMetadata, 0);
    const feedbackEndMinutes =
      safeFeedbackMinutes > 0
        ? nextRoundStartMinutes !== null
          ? Math.min(encounterEndMinutes + safeFeedbackMinutes, nextRoundStartMinutes)
          : encounterEndMinutes + safeFeedbackMinutes
        : encounterEndMinutes;

    const timeline: Array<{
      key: string;
      timeLabel: string;
      phaseLabel: string;
      announcement: string;
      detail?: string;
    }> = [
      {
        key: `${selectedRotationRound.key}-prepare`,
        timeLabel: formatMinutesAsClockLabel(Math.max(startMinutes - 1, 0)),
        phaseLabel: "Prepare",
        announcement: "SPs, please prepare.",
        detail: "1 minute before encounter start",
      },
      {
        key: `${selectedRotationRound.key}-start`,
        timeLabel: formatMinutesAsClockLabel(startMinutes),
        phaseLabel: "Start",
        announcement: "You may now begin your encounter.",
      },
    ];

    if (encounterEndMinutes - startMinutes >= 5) {
      timeline.push({
        key: `${selectedRotationRound.key}-warning`,
        timeLabel: formatMinutesAsClockLabel(encounterEndMinutes - 5),
        phaseLabel: "5-Min Warning",
        announcement: "You have 5 minutes remaining in your encounter.",
      });
    }

    timeline.push({
      key: `${selectedRotationRound.key}-feedback-start`,
      timeLabel: formatMinutesAsClockLabel(encounterEndMinutes),
      phaseLabel: "Feedback",
      announcement: "Encounter has ended. SPs, please begin feedback.",
      detail: safeFeedbackMinutes > 0 ? `${safeFeedbackMinutes} minute feedback window` : undefined,
    });

    if (safeFeedbackMinutes > 0 && feedbackEndMinutes > encounterEndMinutes) {
      timeline.push({
        key: `${selectedRotationRound.key}-session-end`,
        timeLabel: formatMinutesAsClockLabel(feedbackEndMinutes),
        phaseLabel: "Session End",
        announcement: "Your session has ended. Please leave the simulation.",
      });
    }

    let cursorMinutes = feedbackEndMinutes;
    visibleSelectedRoundDayBlocks.forEach((block, index) => {
      const blockMinutes = Math.max(parseDurationMinutes(block.detail), 0);
      const blockStart = cursorMinutes;
      const blockEnd = blockMinutes > 0 ? cursorMinutes + blockMinutes : cursorMinutes;
      const normalizedLabel = asText(block.label).toLowerCase();
      const phaseLabel = normalizedLabel.includes("checklist")
        ? "Checklist"
        : normalizedLabel.includes("soap")
          ? "SOAP Notes"
          : normalizedLabel.includes("feedback")
            ? "Feedback"
            : normalizedLabel.includes("debrief")
              ? "Debrief"
              : normalizedLabel.includes("break") || normalizedLabel.includes("lunch") || normalizedLabel.includes("transition")
                ? "Break/Transition"
                : block.label || "Day Block";
      timeline.push({
        key: `${selectedRotationRound.key}-block-${index}`,
        timeLabel:
          blockEnd > blockStart ? formatMinuteRange(blockStart, blockEnd) : formatMinutesAsClockLabel(blockStart),
        phaseLabel,
        announcement: block.label,
        detail: block.detail,
      });
      cursorMinutes = blockEnd;
    });

    if (nextRoundStartMinutes !== null && nextRoundStartMinutes > cursorMinutes) {
      timeline.push({
        key: `${selectedRotationRound.key}-transition`,
        timeLabel: formatMinuteRange(cursorMinutes, nextRoundStartMinutes),
        phaseLabel: "Break/Transition",
        announcement: "Turnaround / transition time.",
      });
      timeline.push({
        key: `${selectedRotationRound.key}-next-prepare`,
        timeLabel: formatMinutesAsClockLabel(Math.max(nextRoundStartMinutes - 1, 0)),
        phaseLabel: "Prepare",
        announcement: "SPs, please prepare.",
        detail: `Preparing for Round ${activeSelectedRotationRoundIndex + 2}`,
      });
    }

    return timeline;
  }, [
    activeSelectedRotationRoundIndex,
    feedbackMinutesFromMetadata,
    rotationRounds,
    selectedRotationRound,
    visibleSelectedRoundDayBlocks,
  ]);
  const selectedRoundOperationsNotes = useMemo(
    () =>
      [
        asText(trainingMetadata.training_notes),
        asText(trainingMetadata.contact_internal_notes),
        asText(parseNoteValue(event?.notes, "Operations Notes")),
        asText(parseNoteValue(event?.notes, "Operations Reminder")),
      ].filter(Boolean),
    [event?.notes, trainingMetadata.contact_internal_notes, trainingMetadata.training_notes]
  );
  const eventPollLink =
    typeof window !== "undefined" && id
      ? `${window.location.origin}/events/${encodeURIComponent(id)}/poll`
      : id
        ? `/events/${encodeURIComponent(id)}/poll`
        : "/events";
  const activePollSelectedSpIds = selectedPollSpIds.length
    ? selectedPollSpIds
    : pollSelectedSpIdsFromMetadata;
  const activePollSelectedSpEmails = pollSelectedEmails.length
    ? pollSelectedEmails
    : pollSelectedSpEmailsFromMetadata;
  const pollResponderEntries = useMemo(() => {
    const byId = new Map<string, {
      sp: SPRow;
      assignment: AssignmentRow | null;
      assignmentStatus: AssignmentStatus | null;
      pollResponseStatus: PollResponseStatus;
      availabilityMatch: AvailabilityMatchStatus;
      isAssigned: boolean;
      isConfirmed: boolean;
      isActive: boolean;
      isTelehealthReady: boolean;
      hasPtPreferred: boolean;
      importedResponse: ImportedPollResponseRecord | null;
      importedMatchConfidence: number;
    }>();

    activePollSelectedSpIds.forEach((spId) => {
      const sp = spsById.get(String(spId));
      if (!sp) return;
      const assignment = assignmentsBySpId.get(String(sp.id)) || null;
      const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
      const importedResponse = importedPollResponsesBySpId.get(String(sp.id)) || null;
      byId.set(String(sp.id), {
        sp,
        assignment,
        assignmentStatus,
        pollResponseStatus: getEffectivePollResponseStatus(assignment?.notes, importedResponse),
        availabilityMatch: availabilityMatchBySpId.get(sp.id)?.status || "unknown",
        isAssigned: Boolean(assignment),
        isConfirmed: assignment ? isAssignmentConfirmed(assignment) : false,
        isActive: isActiveSp(sp),
        isTelehealthReady: hasTelehealth(sp),
        hasPtPreferred: hasPtPreferred(sp),
        importedResponse,
        importedMatchConfidence: importedResponse?.matchConfidence || 0,
      });
    });

    activePollSelectedSpEmails.forEach((email) => {
      const sp = spByEmail.get(normalizeEmail(email));
      if (!sp) return;
      if (byId.has(String(sp.id))) return;
      const assignment = assignmentsBySpId.get(String(sp.id)) || null;
      const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
      const importedResponse = importedPollResponsesBySpId.get(String(sp.id)) || null;
      byId.set(String(sp.id), {
        sp,
        assignment,
        assignmentStatus,
        pollResponseStatus: getEffectivePollResponseStatus(assignment?.notes, importedResponse),
        availabilityMatch: availabilityMatchBySpId.get(sp.id)?.status || "unknown",
        isAssigned: Boolean(assignment),
        isConfirmed: assignment ? isAssignmentConfirmed(assignment) : false,
        isActive: isActiveSp(sp),
        isTelehealthReady: hasTelehealth(sp),
        hasPtPreferred: hasPtPreferred(sp),
        importedResponse,
        importedMatchConfidence: importedResponse?.matchConfidence || 0,
      });
    });

    importedPollResponsesBySpId.forEach((importedResponse) => {
      const sp = spsById.get(importedResponse.matchedSpId);
      if (!sp) return;
      if (byId.has(String(sp.id))) return;
      const assignment = assignmentsBySpId.get(String(sp.id)) || null;
      const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
      byId.set(String(sp.id), {
        sp,
        assignment,
        assignmentStatus,
        pollResponseStatus: getEffectivePollResponseStatus(assignment?.notes, importedResponse),
        availabilityMatch: availabilityMatchBySpId.get(sp.id)?.status || "unknown",
        isAssigned: Boolean(assignment),
        isConfirmed: assignment ? isAssignmentConfirmed(assignment) : false,
        isActive: isActiveSp(sp),
        isTelehealthReady: hasTelehealth(sp),
        hasPtPreferred: hasPtPreferred(sp),
        importedResponse,
        importedMatchConfidence: importedResponse.matchConfidence || 0,
      });
    });

    return Array.from(byId.values()).sort((a, b) => {
      const responseRank = { available: 0, maybe: 1, no_response: 2, not_available: 3 } satisfies Record<PollResponseStatus, number>;
      const assignmentRank = a.isConfirmed === b.isConfirmed ? 0 : a.isConfirmed ? -1 : 1;
      const responseCompare = responseRank[a.pollResponseStatus] - responseRank[b.pollResponseStatus];
      if (responseCompare !== 0) return responseCompare;
      if (assignmentRank !== 0) return assignmentRank;
      const availabilityCompare =
        getAvailabilityMatchRank(a.availabilityMatch) - getAvailabilityMatchRank(b.availabilityMatch);
      if (availabilityCompare !== 0) return availabilityCompare;
      const importedCompare = b.importedMatchConfidence - a.importedMatchConfidence;
      if (importedCompare !== 0) return importedCompare;
      return getFullName(a.sp).localeCompare(getFullName(b.sp));
    });
  }, [
    activePollSelectedSpEmails,
    activePollSelectedSpIds,
    assignmentsBySpId,
    availabilityMatchBySpId,
    importedPollResponsesBySpId,
    spByEmail,
    spsById,
  ]);
  const availablePollResponders = useMemo(
    () => pollResponderEntries.filter((entry) => entry.pollResponseStatus === "available"),
    [pollResponderEntries]
  );
  const maybePollResponders = useMemo(
    () => pollResponderEntries.filter((entry) => entry.pollResponseStatus === "maybe"),
    [pollResponderEntries]
  );
  const unavailablePollResponders = useMemo(
    () => pollResponderEntries.filter((entry) => entry.pollResponseStatus === "not_available"),
    [pollResponderEntries]
  );
  const noResponsePollResponders = useMemo(
    () => pollResponderEntries.filter((entry) => entry.pollResponseStatus === "no_response"),
    [pollResponderEntries]
  );
  const pollSelectedEntries = useMemo(
    () =>
      pollSelectedSps.map((sp) => ({
        sp,
        pollResponseStatus:
          pollResponderEntries.find((entry) => entry.sp.id === sp.id)?.pollResponseStatus || "no_response",
      })),
    [pollResponderEntries, pollSelectedSps]
  );
  const pollResponseRate = pollResponderEntries.length
    ? Math.round(((availablePollResponders.length + maybePollResponders.length + unavailablePollResponders.length) / pollResponderEntries.length) * 100)
    : 0;
  const coverageGap = Math.max(needed - staffedCount, 0);
  const availableCoverageCount = availablePollResponders.filter(
    (entry) => entry.isActive && entry.pollResponseStatus === "available" && entry.assignmentStatus !== "declined"
  ).length;
  const coverageRiskTone =
    needed <= 0 || selectedStaffingCount >= needed
      ? "green"
      : selectedStaffingCount + availableCoverageCount >= needed
        ? "yellow"
        : "red";
  const staffingHealthLabel =
    needed <= 0
      ? selectedStaffingCount > 0
        ? "Selected roster on file"
        : "No SP target set"
      : coverageRiskTone === "green"
        ? "Coverage met"
      : coverageRiskTone === "yellow"
        ? `Short by ${coverageGap}`
        : `Understaffed by ${coverageGap}`;
  const firstLiveRotationStartMinutes = liveFlowBlocks.find((block) => block.tone === "rotation")?.startMinutes ?? null;
  const checkedInAssignedCount = attendedCount;
  const missingAssignedCount = useMemo(
    () =>
      sortedAssignments.filter(
        (assignment) =>
          getAssignmentStatus(assignment) !== "declined" &&
          getAssignmentStatus(assignment) !== "no_show" &&
          assignment.training_attended !== true
      ).length,
    [sortedAssignments]
  );
  const lateAssignedCount = useMemo(() => {
    if (firstLiveRotationStartMinutes === null || simulatedLiveMinutes <= firstLiveRotationStartMinutes) {
      return 0;
    }
    return sortedAssignments.filter((assignment) => {
      const status = getAssignmentStatus(assignment);
      return status !== "declined" && status !== "no_show" && assignment.training_attended !== true;
    }).length;
  }, [firstLiveRotationStartMinutes, simulatedLiveMinutes, sortedAssignments]);
  const noShowAssignedCount = useMemo(() => {
    if (firstLiveRotationStartMinutes === null || simulatedLiveMinutes < firstLiveRotationStartMinutes + 15) {
      return 0;
    }
    return sortedAssignments.filter(
      (assignment) =>
        getAssignmentStatus(assignment) !== "declined" &&
        getAssignmentStatus(assignment) !== "no_show" &&
        assignment.training_attended !== true
    ).length;
  }, [firstLiveRotationStartMinutes, simulatedLiveMinutes, sortedAssignments]);
  const backupAvailableCount =
    sortedAssignments.filter((assignment) => getAssignmentStatus(assignment) === "backup").length +
    maybePollResponders.filter((entry) => !entry.isAssigned).length;
  const liveStaffingHealthTone =
    shortageCount <= 0 && missingAssignedCount === 0
      ? "green"
      : shortageCount <= 0 && backupAvailableCount > 0
        ? "yellow"
        : "red";
  const activeCoverageRiskRooms = useMemo(() => {
    if (!currentLiveBlock?.rooms?.length) return [] as string[];
    return currentLiveBlock.rooms.filter((roomName, index) => {
      const assignment = sortedAssignments[index];
      const status = assignment ? getAssignmentStatus(assignment) : null;
      return !assignment || status === "backup" || status === "declined" || status === "no_show";
    });
  }, [currentLiveBlock, sortedAssignments]);
  const liveAlerts = useMemo(() => {
    const alerts: Array<{ tone: "info" | "warning" | "danger"; message: string }> = [];
    if (nextLiveBlock) {
      const minutesUntil = nextLiveBlock.startMinutes - simulatedLiveMinutes;
      if (minutesUntil >= 0 && minutesUntil <= 5) {
        alerts.push({
          tone: nextLiveBlock.tone === "rotation" ? "warning" : "info",
          message: `${nextLiveBlock.label}${nextLiveBlock.roundNumber ? ` ${nextLiveBlock.roundNumber}` : ""} begins in ${minutesUntil} minute${minutesUntil === 1 ? "" : "s"}.`,
        });
      }
    }
    if (missingAssignedCount > 0) {
      alerts.push({
        tone: noShowAssignedCount > 0 ? "danger" : "warning",
        message:
          noShowAssignedCount > 0
            ? `${noShowAssignedCount} SP${noShowAssignedCount === 1 ? "" : "s"} now read as no-show.`
            : `${missingAssignedCount} SP${missingAssignedCount === 1 ? "" : "s"} not checked in yet.`,
      });
    }
    if (activeCoverageRiskRooms.length > 0) {
      alerts.push({
        tone: "danger",
        message: `Coverage risk in ${activeCoverageRiskRooms.join(", ")}.`,
      });
    }
    if (shortageCount > 0) {
      alerts.push({
        tone: liveStaffingHealthTone === "yellow" ? "warning" : "danger",
        message: `Staffing still short by ${shortageCount}.`,
      });
    }
    return alerts.slice(0, 4);
  }, [
    activeCoverageRiskRooms,
    liveStaffingHealthTone,
    missingAssignedCount,
    nextLiveBlock,
    noShowAssignedCount,
    shortageCount,
    simulatedLiveMinutes,
  ]);
  const needsOutreachCount = useMemo(
    () =>
      pollResponderEntries.filter(
        (entry) => !entry.isAssigned || entry.pollResponseStatus === "no_response"
      ).length,
    [pollResponderEntries]
  );
  const suggestedAssignmentRows = useMemo(() => {
    const rows = pollResponderEntries.filter((entry) => entry.pollResponseStatus !== "not_available");
    return rows.filter((entry) => {
      if (suggestedAssignmentFilter === "all") return true;
      if (suggestedAssignmentFilter === "available") return entry.pollResponseStatus === "available";
      if (suggestedAssignmentFilter === "confirmed") return entry.isConfirmed;
      if (suggestedAssignmentFilter === "needs_outreach") return !entry.isAssigned || entry.pollResponseStatus === "no_response";
      if (suggestedAssignmentFilter === "backup") return entry.pollResponseStatus === "maybe" || entry.assignmentStatus === "backup";
      return true;
    });
  }, [pollResponderEntries, suggestedAssignmentFilter]);
  const matchMakerRankedEntries = useMemo(() => {
    const rankByResponse = {
      available: 1,
      maybe: 2,
      no_response: 3,
      not_available: 4,
    } satisfies Record<PollResponseStatus, number>;

    return [...pollResponderEntries].sort((a, b) => {
      const priorityA = a.isConfirmed ? 0 : rankByResponse[a.pollResponseStatus];
      const priorityB = b.isConfirmed ? 0 : rankByResponse[b.pollResponseStatus];
      if (priorityA !== priorityB) return priorityA - priorityB;

      if (a.isAssigned !== b.isAssigned) return a.isAssigned ? -1 : 1;

      const availabilityCompare =
        getAvailabilityMatchRank(a.availabilityMatch) -
        getAvailabilityMatchRank(b.availabilityMatch);
      if (availabilityCompare !== 0) return availabilityCompare;

      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

      return getFullName(a.sp).localeCompare(getFullName(b.sp));
    });
  }, [pollResponderEntries]);
  const matchMakerTopMatches = useMemo(
    () =>
      matchMakerRankedEntries
        .filter(
          (entry) =>
            entry.assignmentStatus !== "declined" &&
            entry.pollResponseStatus !== "not_available"
        )
        .slice(0, Math.max(needed, 1)),
    [matchMakerRankedEntries, needed]
  );
  const matchMakerBackupMatches = useMemo(
    () =>
      matchMakerRankedEntries.filter(
        (entry) =>
          (entry.pollResponseStatus === "maybe" ||
            entry.pollResponseStatus === "no_response") &&
          entry.assignmentStatus !== "declined"
      ),
    [matchMakerRankedEntries]
  );
  const matchMakerAvoidList = useMemo(
    () =>
      matchMakerRankedEntries.filter(
        (entry) =>
          entry.pollResponseStatus === "not_available" ||
          entry.assignmentStatus === "declined"
      ),
    [matchMakerRankedEntries]
  );
  const pollResponseSummary = useMemo(() => {
    const selectedIds = Array.from(new Set(activePollSelectedSpIds.map((item) => item.trim()).filter(Boolean)));
    const availableCount = pollResponderEntries.filter((entry) => entry.pollResponseStatus === "available").length;
    const maybeCount = pollResponderEntries.filter((entry) => entry.pollResponseStatus === "maybe").length;
    const notAvailableCount = pollResponderEntries.filter((entry) => entry.pollResponseStatus === "not_available").length;
    const respondedCount = availableCount + maybeCount + notAvailableCount;
    return {
      totalSelected: selectedIds.length,
      availableCount,
      maybeCount,
      notAvailableCount,
      noResponseCount: Math.max(0, selectedIds.length - respondedCount),
    };
  }, [activePollSelectedSpIds, pollResponderEntries]);
  const defaultRelatedKeyword = useMemo(() => getDefaultRelatedEventKeyword(event?.name), [event?.name]);
  const facultyEmails = useMemo(() => {
    const matches = [trainingFacultyText, facultyEmailText]
      .join(" ")
      .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    return Array.from(new Set(matches.map((item) => item.trim())));
  }, [facultyEmailText, trainingFacultyText]);
  useEffect(() => {
    setSelectedPollSpIds(pollSelectedSpIdsFromMetadata);
  }, [pollSelectedSpIdsFromMetadata]);
  const trainingEmailSubject = `${event?.name || "Event"}: SP Training - ${eventDateLabel || "Date TBD"}`;
  const trainingEmailBody = [
    "SPs,",
    "",
    `In preparation for ${event?.name || "this"} Training, please review the following:`,
    "",
    `• Date: ${sessionSummaryLabel || "Date TBD"}`,
    `• Time: ${summaryTimeLabel || "Time TBD"}`,
    `• Zoom Link: ${trainingMetadata.zoom_url || "INPUT ZOOM LINK"}`,
    `• Password: ${trainingMetadata.training_password || "INPUT PASSWORD"}`,
    `• Case: ${trainingMetadata.case_name || "Name of CASE"}`,
    `• Sim Contact: ${trainingSimContact || "Sim Team Assigned"}`,
    "",
    "Thank you,",
    "",
    me?.fullName || me?.scheduleName || me?.email || "CFSP",
  ].join("\n");
  const trainingMailtoHref = buildMailtoHref({
    to: me?.email || "",
    cc: facultyEmails,
    bcc: assignedBccEmails,
    subject: trainingEmailSubject,
    body: trainingEmailBody,
  });
  function togglePollSp(spId: string) {
    setSelectedPollSpIds((current) =>
      current.includes(spId)
        ? current.filter((id) => id !== spId)
        : [...current, spId]
    );
  }

  function selectAllVisiblePollCandidates(candidateIds: string[]) {
    setSelectedPollSpIds(candidateIds);
  }

  function clearPollSelection() {
    setSelectedPollSpIds([]);
  }

  async function persistPollExclusions(spIds: string[], emails: string[], successMessage: string) {
    await persistPollMetadata(
      {
        excludedSpIds: Array.from(new Set(spIds.map((spId) => String(spId).trim()).filter(Boolean))).join(","),
        excludedSpEmails: Array.from(new Set(emails.map((email) => normalizeEmail(email)).filter(Boolean))).join(","),
      },
      successMessage
    );
  }

  function addPollSelection(spIds: string[], successMessage: string) {
    const normalized = Array.from(new Set(spIds.map((item) => String(item)).filter(Boolean)));
    if (!normalized.length) {
      setEventSaveError("No matching SPs are ready to add to this poll.");
      return;
    }
    setSelectedPollSpIds((current) => Array.from(new Set([...current, ...normalized])));
    showSuccessMessage(successMessage);
  }

  function handleAddRecommendedToPoll() {
    addPollSelection(
      recommendedPollMatches
        .filter((entry) => entry.emailReady)
        .slice(0, Math.max(needed || 0, 1))
        .map((entry) => entry.sp.id),
      "Recommended SPs added to poll."
    );
  }

  function handleAddAllFilteredToPoll() {
    addPollSelection(
      pollMatchEntries.filter((entry) => entry.emailReady && !entry.selected && !entry.excluded).map((entry) => entry.sp.id),
      "Filtered SPs added to poll."
    );
  }

  function handleSelectTopPollCandidates(count: number) {
    addPollSelection(
      pollMatchEntries
        .filter((entry) => entry.emailReady && !entry.selected && !entry.excluded)
        .slice(0, count)
        .map((entry) => entry.sp.id),
      `Selected top ${count} candidate${count === 1 ? "" : "s"} for polling.`
    );
  }

  function handleTogglePollCandidate(spId: string) {
    togglePollSp(spId);
  }

  async function handleExcludeSelectedPollCandidates() {
    const selectedEntries = pollMatchEntries.filter((entry) => entry.selected);
    if (!selectedEntries.length) {
      setEventSaveError("Select at least one poll candidate before excluding.");
      return;
    }
    const nextIds = [...excludedPollSpIdsFromMetadata, ...selectedEntries.map((entry) => entry.sp.id)];
    const nextEmails = [
      ...excludedPollSpEmailsFromMetadata,
      ...selectedEntries.map((entry) => entry.email || "").filter(Boolean),
    ];
    setSelectedPollSpIds((current) => current.filter((spId) => !selectedEntries.some((entry) => entry.sp.id === spId)));
    await persistPollExclusions(nextIds, nextEmails, "Selected poll candidates excluded.");
  }

  async function handleResetPollExclusions() {
    await persistPollExclusions([], [], "Poll exclusions cleared.");
  }

  function handleRemoveFromPoll(spId: string) {
    setSelectedPollSpIds((current) => current.filter((id) => id !== spId));
    showSuccessMessage("Removed from poll.");
  }

  async function persistPollMetadata(partial: Partial<PollMetadata>, successMessage: string) {
    const nextNotes = upsertPollMetadata(eventEditor.notes, partial);
    return persistTrainingNotes(nextNotes, successMessage);
  }

  function getImportedPollNoteForSpId(spId: string) {
    return asText(importedPollResponsesBySpId.get(String(spId))?.responseNote);
  }

  async function syncImportedPollNotesToExistingAssignments(entries: ImportedPollResponseRecord[]) {
    const noteUpdates = entries
      .map((entry) => {
        const assignment = entry.matchedSpId ? assignmentsBySpId.get(String(entry.matchedSpId)) : null;
        const nextNotes = assignment
          ? mergeImportedPollNoteIntoAssignmentNotes(assignment.notes, entry.responseNote)
          : "";
        return assignment && asText(entry.responseNote) && nextNotes !== asText(assignment.notes)
          ? { assignment, nextNotes }
          : null;
      })
      .filter((entry): entry is { assignment: AssignmentRow; nextNotes: string } => Boolean(entry));

    for (const update of noteUpdates) {
      await saveAssignmentRequest("PATCH", {
        assignment_id: update.assignment.id,
        updates: {
          notes: update.nextNotes || null,
        },
      });
    }

    return noteUpdates.length;
  }

  async function handlePollImportFile(file: File | null) {
    if (!file) return;

    setPollImportSaving(true);
    setPollImportError("");
    setPollImportDebugInfo(null);
    setEventSaveError("");
    setEventSaveMessage("");

    try {
      const rows = await parseImportedPollWorkbook(file);
      const debugInfo = detectPollImportHeaders(rows);
      setPollImportDebugInfo(debugInfo);
      console.log("CFSP Poll Import Headers:", debugInfo.detectedHeaders);
      console.log("CFSP Poll Import Detection:", debugInfo);

      const rawParsedResponses = rows
        .map((row) => {
          const name =
            getImportFieldValueFromHeader(row, debugInfo.matchedNameHeader) ||
            getImportFieldValue(row, ["Name", "Full Name", "Responder", "Respondent", "Respondent Name", "Responder Name"]);
          const email =
            getImportFieldValueFromHeader(row, debugInfo.matchedEmailHeader) ||
            getImportFieldValue(row, ["Email", "Email Address", "Respondent Email", "Responder Email"]);
          const linkedSpId =
            getImportFieldValueFromHeader(row, debugInfo.matchedSpIdHeader) ||
            getImportFieldValue(row, ["SP ID", "Directory ID", "Linked SP ID", "Participant ID"]);
          const notes = getImportFieldValue(row, [
            "Do you have any questions/concerns?",
            "Do you have any questions or concerns?",
            "Questions/Concerns",
            "Questions or concerns",
            "Notes",
            "Comments",
            "Comment",
            "Questions",
            "Additional Notes",
          ]);
          const timestamp = getImportFieldValue(row, ["Completion time", "Start time", "Timestamp", "Submitted At", "Submission Time"]);
          const trainingResponse =
            getImportFieldValueFromHeader(row, debugInfo.matchedTrainingResponseHeader) ||
            getImportFieldValue(row, ["Training", "Training Availability", "Training Response"]);
          const eventResponse =
            getImportFieldValueFromHeader(row, debugInfo.matchedEventResponseHeader) ||
            getImportFieldValue(row, ["Event", "Event Availability", "Event Response"]);
          const responseNotes = getImportFieldValueFromHeader(row, debugInfo.matchedNotesHeader) || notes;
          const fallbackAnswer = getImportFieldValue(row, [
            "Availability",
            "Available",
            "Are you available",
            "Can you work",
            "Can you attend",
            "Response",
            "Answer",
            "Status",
          ]);
          const rawAnswer = fallbackAnswer;
          const classified = classifyImportedPollResponsesByField({
            trainingResponse,
            eventResponse,
            notes: responseNotes,
          });
          const normalizedEmail = normalizeEmail(email);
          const normalizedName = normalizeMatchName(name);

          const linkedSp =
            linkedSpId && spsById.has(String(linkedSpId)) ? spsById.get(String(linkedSpId)) : undefined;
          const emailMatch =
            !linkedSp && normalizedEmail ? spByEmail.get(normalizedEmail) : undefined;
          const nameMatch =
            !linkedSp && !emailMatch && normalizedName ? spByNormalizedName.get(normalizedName) : undefined;

          const matchedSp = linkedSp || emailMatch || nameMatch;
          const matchedSpId = matchedSp ? String(matchedSp.id) : "";

          return {
            name,
            email,
            normalizedEmail,
            responseStatus: classified.status,
            responseLabel: classified.label,
            responseSubmittedAt: timestamp,
            responseNote: responseNotes,
            matchedSpId,
            matchedSpEmail: matchedSp ? getEmail(matchedSp) : "",
            matchedSpName: matchedSp ? getFullName(matchedSp) : "",
            matchType: matchedSp ? (linkedSp ? "email" : emailMatch ? "email" : nameMatch ? "name" : "unmatched") : "unmatched",
            matchConfidence: matchedSp ? (linkedSp ? 100 : emailMatch ? 100 : 65) : 0,
            rawAnswer,
          } satisfies ImportedPollResponseRecord;
        })
        .filter((entry) => entry.name || entry.email || entry.matchedSpId || entry.rawAnswer || entry.responseStatus !== "no_response");

      const parsedResponses = Array.from(
        new Map(
          rawParsedResponses
            .sort((a, b) => Date.parse(a.responseSubmittedAt || "") - Date.parse(b.responseSubmittedAt || ""))
            .map((entry, index) => [
              entry.matchedSpId ||
                entry.normalizedEmail ||
                normalizeMatchName(entry.name) ||
                entry.rawAnswer ||
                `row-${index}`,
              entry,
            ])
        ).values()
      );

      if (!parsedResponses.length) {
        throw new Error("No responder rows were found in that poll export.");
      }

      const assignmentNotesUpdated = await syncImportedPollNotesToExistingAssignments(parsedResponses);

      await persistPollMetadata(
        {
          importedPollResponses: encodeImportedPollResponses(parsedResponses),
          pollImportCreatedAt: new Date().toISOString(),
          pollImportSource: "Microsoft Forms",
        },
        `Imported ${parsedResponses.length} poll response${parsedResponses.length === 1 ? "" : "s"}.`
      );
      setPollImportIgnoredUnmatched(false);
      if (assignmentNotesUpdated > 0) {
        await refreshData();
      }
      if (pollImportInputRef.current) pollImportInputRef.current.value = "";
    } catch (error) {
      setPollImportError(error instanceof Error ? error.message : "Could not import poll responses.");
    } finally {
      setPollImportSaving(false);
    }
  }

  async function handleExcludeImportedResponder(spId: string, email?: string) {
    const nextIds = Array.from(new Set([...excludedPollSpIdsFromMetadata, String(spId)].filter(Boolean)));
    const nextEmails = Array.from(
      new Set([...excludedPollSpEmailsFromMetadata, normalizeEmail(email || "")].filter(Boolean))
    );
    await persistPollExclusions(nextIds, nextEmails, "Imported responder excluded from staffing suggestions.");
  }

  async function handleMarkImportedBackup(spId: string) {
    const existingAssignment = assignmentsBySpId.get(String(spId));
    if (existingAssignment) {
      await handleStatusChange(existingAssignment, "backup");
      return;
    }
    const pollNote = getImportedPollNoteForSpId(spId);
    await assignMultipleSpIds([spId], "Responder added as backup.", {
      status: "backup",
      confirmed: false,
      notesBySpId: pollNote ? { [String(spId)]: pollNote } : undefined,
    });
  }

  async function handleCreatePoll() {
    if (!selectedPollSpIds.length || !pollSelectedEmails.length) {
      setEventSaveError("Select at least one candidate SP with an email address to create a poll.");
      return;
    }

    setPollSaving(true);
    try {
      await persistPollMetadata(
        {
          pollCreatedAt: new Date().toISOString(),
          pollSentAt: pollMetadata.pollSentAt,
          pollSelectedSpIds: Array.from(new Set(selectedPollSpIds.map((spId) => String(spId).trim()).filter(Boolean))).join(","),
          pollSelectedSpEmails: Array.from(new Set(pollSelectedEmails.map((email) => normalizeEmail(email)).filter(Boolean))).join(","),
          pollStatus: "draft_ready",
        },
        "Availability poll created."
      );
    } finally {
      setPollSaving(false);
    }
  }

  const pollEmailSubject = `${event?.name || "Event"}: CFSP Availability Poll`;
  const pollEmailBody = `SPs,

We are checking availability for the following event:

Event:
${event?.name || "TBD"}

Date/Time:
${pollEventDateTimeSummary}

Training:
${pollTrainingSummary}

Location:
${pollLocationSummary}

Please submit your availability in CFSP using the link below:

${eventPollLink}

Use this link to view the poll. You'll be asked to log in or create an SP account before submitting your response.

Submitting availability does not guarantee assignment. We will follow up once staffing is finalized.

Thank you,
Cory`;

  const pollMailtoHref = buildMailtoHref({
    to: me?.email || "",
    cc: facultyEmails,
    bcc: pollSelectedEmails.length ? pollSelectedEmails : pollSelectedSpEmailsFromMetadata,
    subject: pollEmailSubject,
    body: pollEmailBody,
  });

  async function handleDraftPollingEmail() {
    if (!pollSelectedEmails.length && !pollSelectedSpEmailsFromMetadata.length) {
      setEventSaveError("Create a poll with selected SP emails before drafting the polling email.");
      return;
    }

    window.location.href = pollMailtoHref;

    if (selectedPollSpIds.length || pollSelectedEmails.length) {
      setPollSaving(true);
      try {
        await persistPollMetadata(
          {
            pollCreatedAt: pollMetadata.pollCreatedAt || new Date().toISOString(),
            pollSentAt: pollMetadata.pollSentAt,
            pollSelectedSpIds: Array.from(
              new Set((selectedPollSpIds.length ? selectedPollSpIds : pollSelectedSpIdsFromMetadata).map((spId) => String(spId).trim()).filter(Boolean))
            ).join(","),
            pollSelectedSpEmails: Array.from(
              new Set((pollSelectedEmails.length ? pollSelectedEmails : pollSelectedSpEmailsFromMetadata).map((email) => normalizeEmail(email)).filter(Boolean))
            ).join(","),
            pollStatus: "draft_ready",
          },
          "Polling email draft opened."
        );
      } finally {
        setPollSaving(false);
      }
    }
  }

  async function handleMarkPollSent() {
    if (!pollMetadata.pollCreatedAt && !selectedPollSpIds.length) {
      setEventSaveError("Create a poll before marking it sent.");
      return;
    }

    setPollSaving(true);
    try {
      await persistPollMetadata(
        {
          pollCreatedAt: pollMetadata.pollCreatedAt || new Date().toISOString(),
          pollSentAt: new Date().toISOString(),
          pollSelectedSpIds: Array.from(
            new Set((selectedPollSpIds.length ? selectedPollSpIds : pollSelectedSpIdsFromMetadata).map((spId) => String(spId).trim()).filter(Boolean))
          ).join(","),
          pollSelectedSpEmails: Array.from(
            new Set((pollSelectedEmails.length ? pollSelectedEmails : pollSelectedSpEmailsFromMetadata).map((email) => normalizeEmail(email)).filter(Boolean))
          ).join(","),
          pollStatus: "sent",
        },
        "Availability poll marked sent."
      );
    } finally {
      setPollSaving(false);
    }
  }
  const pollSelectedCount = selectedPollSpIds.length || pollSelectedSpIdsFromMetadata.length;
  const pollReadyEmailCount = pollSelectedEmails.length || pollSelectedSpEmailsFromMetadata.length;
  const pollCreatedLabel = formatUploadedTimestamp(pollMetadata.pollCreatedAt);
  const pollSentLabel = formatUploadedTimestamp(pollMetadata.pollSentAt);
  const workflowGroups = useMemo(
    () => [
      {
        key: "planning" as WorkflowGroupKey,
        title: "Planning",
        items: [
          {
            id: "event_details_confirmed",
            label: "Event details confirmed",
            autoComplete: Boolean(asText(event?.name) && asText(event?.status)),
            detail: "Event name and status are filled in.",
          },
          {
            id: "date_time_confirmed",
            label: "Date/time confirmed",
            autoComplete: Boolean(asText(event?.date_text) || sessions.length) && summaryTimeLabel !== "Time TBD",
            detail: "Event date and usable time information are on file.",
          },
          {
            id: "location_rooms_confirmed",
            label: "Location/rooms confirmed",
            autoComplete: Boolean(asText(event?.location) || hasRoomsBuilt),
            detail: "A site or room plan is listed for the event.",
          },
          {
            id: "faculty_confirmed",
            label: "Faculty/contact confirmed",
            autoComplete: hasFaculty,
            detail: hasFaculty ? "Faculty/contact details found in notes." : "Add Course Faculty or Faculty notes when ready.",
          },
          {
            id: "case_materials_confirmed",
            label: "Case/materials confirmed",
            autoComplete: hasCase,
            detail: hasCase ? "Case details found in notes." : "Case/materials are not clearly documented yet.",
          },
        ],
      },
      {
        key: "staffing" as WorkflowGroupKey,
        title: "SP Staffing",
        items: [
          {
            id: "sp_count_confirmed",
            label: "SP count confirmed",
            autoComplete: noSpStaffingRequired || needed > 0,
            detail: noSpStaffingRequired ? "No SP staffing required for this event." : `${needed} SP target on file.`,
          },
          {
            id: "sps_assigned",
            label: "SPs selected",
            autoComplete: noSpStaffingRequired || selectedStaffingCount > 0,
            detail: noSpStaffingRequired
              ? "SP staffing workflow suppressed."
              : `${selectedStaffingCount} selected for staffing (${confirmedCount} primary, ${backupCount} backup).`,
          },
          {
            id: "sps_contacted",
            label: "SPs contacted",
            autoComplete: noSpStaffingRequired || assignments.some((assignment) => Boolean(assignment.last_contacted_at) || ["contacted", "confirmed", "declined"].includes(getAssignmentStatus(assignment))),
            detail: noSpStaffingRequired
              ? "No SP outreach required."
              : contactedAssignmentCount
                ? `${contactedAssignmentCount} contacted or invite-only row${contactedAssignmentCount === 1 ? "" : "s"} not counted as staffing.`
                : "No contacted-only or invite-only rows are counted as staffing.",
          },
          {
            id: "sp_confirmations_complete",
            label: "SP staffing complete",
            autoComplete: noSpStaffingRequired || (needed > 0 && selectedStaffingCount >= needed),
            detail: noSpStaffingRequired
              ? "No confirmations required."
              : `${selectedStaffingCount} selected of ${needed} needed (${confirmedCount} primary, ${backupCount} backup).`,
          },
          {
            id: "sp_training_scheduled",
            label: "SP training scheduled",
            autoComplete: noSpStaffingRequired || hasTrainingScheduled,
            detail: hasTrainingScheduled ? "Training date is stored in notes." : "Add a Training Date note when scheduling prep.",
          },
          {
            id: "sp_training_completed",
            label: "SP training completed",
            autoComplete: false,
            detail: "Mark this locally when training has actually been completed.",
          },
        ],
      },
      {
        key: "schedule" as WorkflowGroupKey,
        title: "Schedule / Rooms",
        items: [
          {
            id: "student_schedule_built",
            label: "Student schedule imported or built",
            autoComplete: sessions.length > 0,
            detail: sessions.length ? `${sessions.length} structured session${sessions.length === 1 ? "" : "s"} loaded.` : "No structured sessions are built yet.",
          },
          {
            id: "room_schedule_built",
            label: "Room schedule built",
            autoComplete: hasRoomsBuilt,
            detail: hasRoomsBuilt ? "At least one session includes room or location details." : "No room assignments are structured yet.",
          },
          {
            id: "checklists_ready",
            label: "Checklists/forms ready",
            autoComplete: false,
            detail: "Use this once printed or digital evaluation materials are ready.",
          },
          {
            id: "soap_ready",
            label: "SOAP note workflow ready if applicable",
            autoComplete: /soap/i.test(asText(event?.notes)),
            detail: /soap/i.test(asText(event?.notes)) ? "SOAP note workflow appears in notes." : "Mark when SOAP workflow is confirmed for the event.",
          },
        ],
      },

      {
        key: "platform" as WorkflowGroupKey,
        title: "Simulation Platform",
        items: [
          {
            id: "zoom_ready",
            label: "Zoom/SimIQ link confirmed if virtual",
            autoComplete: !eventMeta.isVirtualSp || hasZoomReady,
            detail: !eventMeta.isVirtualSp ? "Not a virtual event." : hasZoomReady ? "Virtual platform details found in notes." : "Virtual logistics still need a Zoom / SimIQ note.",
          },
        ],
      },
      {
        key: "day_of" as WorkflowGroupKey,
        title: "Day-of Operations",
        items: [
          {
            id: "faculty_briefing_complete",
            label: "Faculty briefing complete",
            autoComplete: false,
            detail: "Manual check for the live faculty briefing step.",
          },
          {
            id: "setup_complete",
            label: "Day-of setup complete",
            autoComplete: false,
            detail: "Manual check for room, platform, and staffing setup.",
          },
          {
            id: "event_completed",
            label: "Event completed",
            autoComplete: /complete/i.test(asText(event?.status)),
            detail: /complete/i.test(asText(event?.status)) ? "Event status already indicates completion." : "Mark once the live event ends.",
          },
        ],
      },
      {
        key: "wrap_up" as WorkflowGroupKey,
        title: "Wrap-Up",
        items: [
          {
            id: "debrief_complete",
            label: "Debrief complete",
            autoComplete: false,
            detail: "Manual check for the post-event debrief step.",
          },
          {
            id: "breakdown_complete",
            label: "Breakdown/reset complete",
            autoComplete: false,
            detail: "Manual check for room or platform reset.",
          },
          {
            id: "follow_up_complete",
            label: "Post-event follow-up complete",
            autoComplete: false,
            detail: "Manual check for emails, notes, and post-event wrap-up.",
          },
        ],
      },
    ],
    [
      assignments,
      backupCount,
      contactedAssignmentCount,
      confirmedCount,
      event?.date_text,
      event?.location,
      event?.name,
      event?.notes,
      event?.status,
      eventMeta.isVirtualSp,
      hasCase,
      hasFaculty,
      hasRoomsBuilt,
      hasTrainingScheduled,
      hasZoomReady,
      needed,
      noSpStaffingRequired,
      selectedStaffingCount,
      sessions,
      summaryTimeLabel,
    ]
  );
  const workflowReportItems = useMemo(
    () => [
      {
        id: "staffing",
        label: "SP coverage",
        value: noSpStaffingRequired
          ? "Not required"
          : needed > 0
            ? `${selectedStaffingCount} selected / ${needed} needed`
            : `${selectedStaffingCount} selected`,
        complete: noSpStaffingRequired || (needed > 0 ? selectedStaffingCount >= needed : selectedStaffingCount > 0),
        detail: noSpStaffingRequired
          ? "No SP staffing required."
          : needed > 0
            ? selectedStaffingCount >= needed
              ? `${confirmedCount} confirmed primary / ${backupCount} backup`
              : `${Math.max(needed - selectedStaffingCount, 0)} selected staffing slot${Math.max(needed - selectedStaffingCount, 0) === 1 ? "" : "s"} open`
            : selectedStaffingCount > 0
              ? `${confirmedCount} confirmed primary / ${backupCount} backup`
              : contactedAssignmentCount > 0
                ? `${contactedAssignmentCount} contacted, none selected for staffing`
                : "No selected roster yet",
      },
      {
        id: "faculty",
        label: "Faculty readiness",
        value: facultyReadinessLabel,
        complete: facultyReadinessComplete,
        detail: facultyProgramText || trainingMetadata.sim_contact || "Add lead, faculty, or contact details",
      },
      {
        id: "materials",
        label: "Materials readiness",
        value: materialsStatusLabel,
        complete: materialsStatusLabel === "Ready",
        detail: trainingCaseStatus,
      },
      {
        id: "schedule",
        label: "Schedule readiness",
       value: rotationRounds.length
  ? `${rotationRounds.length} rotation round${rotationRounds.length === 1 ? "" : "s"} ready`
  : "Needs schedule",
       complete: Boolean((asText(event?.date_text) || rotationRounds.length) && summaryTimeLabel !== "Time TBD"),
detail: rotationRounds.length ? summaryTimeLabel : "Date/time still incomplete",
      },
      {
        id: "email",
        label: "Email / contact",
        value: outreachProgressLabel,
        complete: outreachProgressLabel === "Sent" || outreachProgressLabel === "In progress",
        detail:
          outreachProgressLabel === "In progress"
            ? "Contact activity is already logged."
            : outreachProgressLabel === "Sent"
              ? "Email action marked complete."
              : "No contact activity recorded yet.",
      },
    ],
    [
      backupCount,
      contactedAssignmentCount,
      confirmedCount,
      event?.date_text,
      facultyProgramText,
      facultyReadinessComplete,
      facultyReadinessLabel,
      materialsStatusLabel,
      needed,
      noSpStaffingRequired,
      outreachProgressLabel,
      rotationRounds.length,
      selectedStaffingCount,
      summaryTimeLabel,
      trainingCaseStatus,
      trainingMetadata.sim_contact,
    ]
  );
  const workflowPercent =
    workflowReportItems.length > 0
      ? Math.round(
          (workflowReportItems.filter((item) => item.complete).length / workflowReportItems.length) * 100
        )
      : 0;
  const emailSubject = `[CFSP] ${event?.name || "CFSP Event"} - ${eventDateLabel}`;
  const emailBody = [
    "Hello,",
    "",
    "We are reaching out regarding the following CFSP event:",
    "",
    `Event: ${event?.name || "TBD"}`,
    `Date: ${eventDateLabel || "TBD"}`,
    `Time: ${summaryTimeLabel || "TBD"}`,
    `Location: ${event?.location || "TBD"}`,
    "",
    "Please reply to confirm your availability and assignment status for this event.",
    "If you have any scheduling conflicts or questions, include them in your reply.",
    "",
    "Thank you,",
    "CFSP Simulation Operations",
  ].join("\n");
  const mailtoHref = buildMailtoHref({
    bcc: assignedBccEmails.length ? assignedBccEmails : bccEmails,
    subject: emailSubject,
    body: emailBody,
  });

  function clearActionFeedbackTimers() {
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
  }

  function showSuccessMessage(message: string, duration = 4200) {
    setErrorMessage("");
    setAssignmentSuccessMessage("");
    setEventSaveError("");
    setEventSaveMessage(message);
    clearActionFeedbackTimers();
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setEventSaveMessage("");
      feedbackTimeoutRef.current = null;
    }, duration);
  }

  async function refreshData() {
    if (!id) return;

    const result = await fetchCommandCenterData(id);
    setEvent(result.event);
    setEventEditor({
      name: result.event?.name || "",
      status: result.event?.status || "",
      visibility: result.event?.visibility || "",
      location: result.event?.location || "",
      notes: result.event?.notes || "",
      sp_needed:
        result.event?.sp_needed === null || result.event?.sp_needed === undefined
          ? ""
          : String(result.event.sp_needed),
    });
    setSessionEditor(getSessionEditorState(result.sessions, result.event?.date_text));
    setSessions(result.sessions);
    setSps(result.sps);
    setAssignments(result.assignments);
    setAvailabilityRows(result.availabilityRows);
    setViewerRole(result.viewerRole || "unknown");
    setSpPortal(result.spPortal || null);
    setErrorMessage(result.errorMessage);
    setSessionErrorMessage(result.sessionErrorMessage);
    setAvailabilityErrorMessage(result.availabilityErrorMessage);
    setAccessDenied(result.accessDenied);
    setNotFound(result.notFound);
    setSelectedSpId("");
  }

  async function saveAssignmentRequest(method: "POST" | "PATCH" | "DELETE", body: object) {
    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    return response.json().catch(() => null);
  }

  async function assignMultipleSpIds(
    spIds: string[],
    successLabel: string,
    options?: AssignSpOptions
  ) {
    if (!id || spIds.length === 0) return;

    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      for (const spId of spIds) {
        const importedPollNote = asText(options?.notesBySpId?.[String(spId)]);
        const assignmentNotes = mergeImportedPollNoteIntoAssignmentNotes("", importedPollNote);
        await saveAssignmentRequest("POST", {
          sp_id: spId,
          status: options?.status,
          confirmed: options?.confirmed,
          notes: assignmentNotes || undefined,
        });
      }

      await refreshData();
      showSuccessMessage(successLabel);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEventDetails() {
    if (!id) return;

    const nextSpNeeded = Number(eventEditor.sp_needed);
    const spNeeded =
      eventEditor.sp_needed.trim() === "" || Number.isNaN(nextSpNeeded)
        ? 0
        : Math.max(0, Math.round(nextSpNeeded));
    const trimmedSessionDate = sessionEditor.session_date.trim();
    const startTime = toStoredTimeValue(sessionEditor.start_time);
    const endTime = toStoredTimeValue(sessionEditor.end_time);

    setSaving(true);
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_updates: {
            name: eventEditor.name,
            status: eventEditor.status,
            visibility: eventEditor.visibility,
            location: eventEditor.location,
            notes: eventEditor.notes,
            sp_needed: spNeeded,
          },
          session_updates: {
            session_date: trimmedSessionDate || null,
            start_time: startTime,
            end_time: endTime,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      showSuccessMessage("Saved");
      await refreshData();
    } catch (error) {
      setEventSaveError(
        error instanceof Error ? error.message : "Could not save event details."
      );
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  async function handleDeleteEvent() {
    if (!id || !event) return;

    const eventTitle = event.name || "this event";
    const confirmed = window.confirm(
      `Delete "${eventTitle}"?\n\nThis will remove the event and its related sessions and SP assignments.`
    );
    if (!confirmed) return;

    setDeletingEvent(true);
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      router.push("/events");
      router.refresh();
    } catch (error) {
      setEventSaveError(error instanceof Error ? error.message : "Could not delete event.");
      setDeletingEvent(false);
    }
  }

  function handleSelectEventType(nextType: EditableEventType) {
    setEventSaveMessage("");
    setEventSaveError("");
    const nextTypes = activeEventTypes.includes(nextType)
      ? activeEventTypes.filter((type) => type !== nextType)
      : [...activeEventTypes, nextType];
    setEventEditor((current) => ({
      ...current,
      notes: upsertEventTypesInNotes(current.notes, nextTypes),
    }));
  }

  function handleTrainingMetadataChange(
    key: keyof TrainingEventMetadata,
    value: string
  ) {
    setEventSaveMessage("");
    setEventSaveError("");
    setEventEditor((current) => ({
      ...current,
      notes: upsertTrainingEventMetadata(current.notes, { [key]: value }),
    }));
  }

  async function persistTrainingNotes(nextNotes: string, successMessage: string) {
    if (!id) return false;

    setEventSaveMessage("");
    setEventSaveError("");

    const response = await fetch(`/api/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_updates: {
          notes: nextNotes,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(await parseApiError(response));
    }

    setEventEditor((current) => ({
      ...current,
      notes: nextNotes,
    }));
    setEvent((current) => (current ? { ...current, notes: nextNotes } : current));
    showSuccessMessage(successMessage);
    return true;
  }

  async function persistWorkflowChecks(nextChecks: Record<string, boolean>) {
    const selectedIds = Object.entries(nextChecks)
      .filter(([, complete]) => complete)
      .map(([workflowId]) => workflowId);
    const nextNotes = upsertTrainingEventMetadata(eventEditor.notes, {
      workflow_manual_checks: serializeWorkflowManualChecks(selectedIds),
    });
    const persisted = await persistTrainingNotes(nextNotes, "Workflow updated.");
    if (persisted) {
      setWorkflowChecks(nextChecks);
    }
    return persisted;
  }

  async function persistTrainingMetadataFields(
    partial: Partial<TrainingEventMetadata>,
    successMessage: string
  ) {
    const nextNotes = upsertTrainingEventMetadata(eventEditor.notes, partial);
    return persistTrainingNotes(nextNotes, successMessage);
  }

  async function saveFacultyContactFields(
    partial: Partial<TrainingEventMetadata>,
    successMessage = "Faculty/contact saved."
  ) {
    setContactPanelSaving(true);
    try {
      const persisted = await persistTrainingMetadataFields(partial, successMessage);
      if (persisted) {
        setContactPanelSavedAt(new Date().toISOString());
      }
      return persisted;
    } finally {
      setContactPanelSaving(false);
    }
  }

  async function saveFacultyContactField(
    key: keyof TrainingEventMetadata,
    value: string,
    successMessage = "Faculty/contact saved."
  ) {
    return saveFacultyContactFields({ [key]: value } as Partial<TrainingEventMetadata>, successMessage);
  }

  function openMaterialPreview(args: {
    title: string;
    rawUrl: string;
    storagePath?: string | null;
    fileName?: string | null;
  }) {
    const safeUrl = asText(args.rawUrl);
    if (!safeUrl) return;
    const assetUrls = buildTrainingMaterialAssetUrls({
      eventId: id,
      rawUrl: safeUrl,
      storagePath: asText(args.storagePath),
      fileName: asText(args.fileName) || getFilenameFromUrl(safeUrl),
    });
    setMaterialPreviewLoading(true);
    setMaterialPreviewError("");
    setMaterialPreviewText("");
    setMaterialPreview({
      title: args.title,
      previewUrl: assetUrls.previewUrl,
      downloadUrl: assetUrls.downloadUrl,
      openInNewTabUrl: assetUrls.openInNewTabUrl,
      fileName: assetUrls.fileName,
      kind: getMaterialPreviewKind(assetUrls.fileName, safeUrl),
    });
  }

  function setTrainingMaterialSavingState(kind: TrainingMaterialKind, savingState: boolean) {
    setTrainingMaterialSaving((current) => ({
      ...current,
      [kind]: savingState,
    }));
  }

  function openTrainingMaterialPicker(kind: TrainingMaterialKind) {
    const inputRef =
      kind === "case_file"
        ? caseFileInputRef
        : kind === "doorsign"
        ? doorsignInputRef
        : kind === "staffing_doc"
        ? staffingDocInputRef
        : supplementalDocInputRef;

    inputRef.current?.click();
  }

  async function handleTrainingMaterialUpload(kind: TrainingMaterialKind, file: File | null) {
    if (!file || !id) return;

    const fieldConfig = trainingMaterialFieldMap[kind];
    const replacePath = asText(trainingMetadata[fieldConfig.storagePathKey]);
    const formData = new FormData();
    formData.append("eventId", id);
    formData.append("kind", kind);
    formData.append("file", file);
    if (replacePath) {
      formData.append("replacePath", replacePath);
    }

    setTrainingMaterialSavingState(kind, true);
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      const response = await fetch("/api/uploads/training-material", {
        method: "POST",
        body: formData,
      });

      const body = (await response.json().catch(() => null)) as
        | {
            error?: string;
            material?: {
              filename?: string;
              uploaded_at?: string;
              uploaded_by?: string;
              storage_path?: string;
              url?: string;
            };
          }
        | null;

      if (!response.ok || !body?.material) {
        throw new Error(body?.error || `Could not upload ${fieldConfig.label.toLowerCase()}.`);
      }

      const nextNotes = upsertTrainingEventMetadata(eventEditor.notes, {
        [fieldConfig.urlKey]: asText(body.material.url),
        [fieldConfig.nameKey]: asText(body.material.filename),
        [fieldConfig.storagePathKey]: asText(body.material.storage_path),
        [fieldConfig.uploadedAtKey]: asText(body.material.uploaded_at),
        [fieldConfig.uploadedByKey]: asText(body.material.uploaded_by),
      });

      await persistTrainingNotes(
        nextNotes,
        kind === "staffing_doc" ? "Staffing doc uploaded." : `${fieldConfig.label} saved to training materials.`
      );
    } catch (error) {
      setEventSaveError(
        error instanceof Error
          ? error.message
          : `Could not upload ${fieldConfig.label.toLowerCase()}.`
      );
    } finally {
      setTrainingMaterialSavingState(kind, false);
    }
  }

  useEffect(() => {
    if (!materialPreview) return;
    const preview = materialPreview;

    if (preview.kind === "unsupported") {
      setMaterialPreviewLoading(false);
      setMaterialPreviewError("");
      setMaterialPreviewText("");
      return;
    }

    if (preview.kind !== "text") {
      setMaterialPreviewText("");
      return;
    }

    let cancelled = false;
    setMaterialPreviewLoading(true);
    setMaterialPreviewError("");
    setMaterialPreviewText("");

    async function loadTextPreview() {
      try {
        const response = await fetch(preview.previewUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }
        const text = await response.text();
        if (cancelled) return;
        setMaterialPreviewText(text);
        setMaterialPreviewLoading(false);
      } catch (error) {
        if (cancelled) return;
        setMaterialPreviewError(error instanceof Error ? error.message : "Could not preview this document.");
        setMaterialPreviewLoading(false);
      }
    }

    void loadTextPreview();
    return () => {
      cancelled = true;
    };
  }, [materialPreview]);

  useEffect(() => {
    if (!materialPreviewLoading || !materialPreview) return;
    if (!["pdf", "iframe"].includes(materialPreview.kind)) return;

    const timeout = window.setTimeout(() => {
      setMaterialPreviewLoading(false);
      setMaterialPreviewError(
        "This document did not render inline. The browser may be blocking embedded preview for this file."
      );
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [materialPreview, materialPreviewLoading]);

  async function handleRemoveTrainingMaterial(kind: TrainingMaterialKind) {
    if (!id) return;

    const fieldConfig = trainingMaterialFieldMap[kind];
    const storagePath = asText(trainingMetadata[fieldConfig.storagePathKey]);

    setTrainingMaterialSavingState(kind, true);
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      if (storagePath) {
        const response = await fetch("/api/uploads/training-material", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: id,
            path: storagePath,
          }),
        });

        if (!response.ok) {
          throw new Error(await parseApiError(response));
        }
      }

      const nextNotes = upsertTrainingEventMetadata(eventEditor.notes, {
        [fieldConfig.urlKey]: "",
        [fieldConfig.nameKey]: "",
        [fieldConfig.storagePathKey]: "",
        [fieldConfig.uploadedAtKey]: "",
        [fieldConfig.uploadedByKey]: "",
      });

      await persistTrainingNotes(
        nextNotes,
        kind === "staffing_doc" ? "Staffing doc removed." : `${fieldConfig.label} removed.`
      );
    } catch (error) {
      setEventSaveError(
        error instanceof Error
          ? error.message
          : `Could not remove ${fieldConfig.label.toLowerCase()}.`
      );
    } finally {
      setTrainingMaterialSavingState(kind, false);
    }
  }

  async function handleTrainingWorkbookImport(file: File | null) {
    if (!file || !id) return;

    setTrainingImportError("");
    setTrainingImportResult(null);
    setTrainingImporting(true);
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      const parsed = await parseTrainingImportWorkbook(file);
      const matchedAssigned: string[] = [];
      const alreadyAssigned: string[] = [];
      const notFound: string[] = [];
      const matchedSpIds: string[] = [];

      parsed.entries.forEach((entry) => {
        const byEmail = entry.email ? spByEmail.get(normalizeEmail(entry.email)) : undefined;
        const byName = entry.name ? spByNormalizedName.get(normalizeMatchName(entry.name)) : undefined;
        const match = byEmail || byName;

        if (!match) {
          notFound.push(entry.email || entry.name || "Unknown entry");
          return;
        }

        const label = `${getFullName(match)}${getEmail(match) ? ` (${getEmail(match)})` : ""}`;
        if (assignedSpIds.has(String(match.id)) || matchedSpIds.includes(String(match.id))) {
          alreadyAssigned.push(label);
          return;
        }

        matchedSpIds.push(String(match.id));
        matchedAssigned.push(label);
      });

      if (matchedSpIds.length) {
        await assignMultipleSpIds(
          matchedSpIds,
          `${matchedSpIds.length} SP${matchedSpIds.length === 1 ? "" : "s"} imported and confirmed.`,
          { status: "confirmed", confirmed: true }
        );
      }

      const importMetadataUpdate: Partial<TrainingEventMetadata> = {
        imported_event_info_at: new Date().toISOString(),
        imported_event_info_count: String(parsed.entries.length),
        imported_training_date: parsed.trainingDate,
        imported_training_time: parsed.trainingTime,
        imported_event_times: parsed.eventTimesDetected.join(" | "),
        imported_event_dates_count: String(parsed.eventDatesDetected.length),
      };

      if (parsed.facultyDetected.length && !trainingMetadata.faculty_names.trim()) {
        importMetadataUpdate.faculty_names = parsed.facultyDetected.join(", ");
      }

      await persistTrainingMetadataFields(importMetadataUpdate, "Event info imported.");

      setTrainingImportResult({
        eventTitle: parsed.eventTitle,
        matchedAssigned,
        alreadyAssigned,
        notFound,
        facultyDetected: parsed.facultyDetected,
        importedAt: new Date().toISOString(),
        importedCount: parsed.entries.length,
        confirmedCount: matchedAssigned.length,
        trainingDate: parsed.trainingDate,
        trainingTime: parsed.trainingTime,
        eventDatesDetected: parsed.eventDatesDetected,
        eventTimesDetected: parsed.eventTimesDetected,
      });
    } catch (error) {
      setTrainingImportError(
        error instanceof Error ? error.message : "Could not import SP Event Info workbook."
      );
    } finally {
      setTrainingImporting(false);
    }
  }

  async function handlePreviewRelatedEvents() {
    if (!id || !relatedKeyword.trim()) {
      setRelatedPushError("Enter a keyword to preview related events.");
      setRelatedMatches([]);
      return;
    }

    setRelatedPreviewLoading(true);
    setRelatedPushError("");
    setRelatedPushSummary(null);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(id)}/push-related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          keyword: relatedKeyword.trim(),
          mustInclude: relatedMustInclude.trim(),
          exclude: relatedExclude.trim(),
          excludeCurrent: relatedExcludeCurrent,
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

      const matches = Array.isArray(body?.events) ? body.events : [];
      setRelatedMatches(matches);
      setSelectedRelatedTargetIds(
        matches.filter((event) => event.exact_course_match).map((event) => event.id)
      );
    } catch (error) {
      setRelatedPushError(
        error instanceof Error ? error.message : "Could not preview related events."
      );
      setRelatedMatches([]);
    } finally {
      setRelatedPreviewLoading(false);
    }
  }

  function handleToggleRelatedCopyOption(option: RelatedCopyOption) {
    setRelatedPushSummary(null);
    setRelatedPushError("");
    setRelatedCopyOptions((current) =>
      current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
    );
  }

  function handleToggleRelatedTarget(eventId: string) {
    setRelatedPushSummary(null);
    setRelatedPushError("");
    setSelectedRelatedTargetIds((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId]
    );
  }

  async function handlePushToRelatedEvents() {
    if (!id || !relatedKeyword.trim()) {
      setRelatedPushError("Enter a keyword before pushing to related events.");
      return;
    }

    if (!relatedMatches.length) {
      setRelatedPushError("Preview matching events before pushing selected info.");
      return;
    }

    if (!selectedRelatedTargetIds.length) {
      setRelatedPushError("Check at least one target event before pushing.");
      return;
    }

    if (!relatedCopyOptions.length) {
      setRelatedPushError("Select at least one thing to copy.");
      return;
    }

    setRelatedPushSaving(true);
    setRelatedPushError("");
    setRelatedPushSummary(null);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(id)}/push-related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "push",
          keyword: relatedKeyword.trim(),
          mustInclude: relatedMustInclude.trim(),
          exclude: relatedExclude.trim(),
          excludeCurrent: relatedExcludeCurrent,
          targetEventIds: selectedRelatedTargetIds,
          copyOptions: relatedCopyOptions,
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

      setRelatedPushSummary(body.summary);
      showSuccessMessage("Pushed successfully");
      await handlePreviewRelatedEvents();
    } catch (error) {
      setRelatedPushError(
        error instanceof Error
          ? error.message
          : "Could not push selected info to related events."
      );
    } finally {
      setRelatedPushSaving(false);
    }
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
        setEventEditor({
          name: result.event?.name || "",
          status: result.event?.status || "",
          visibility: result.event?.visibility || "",
          location: result.event?.location || "",
          notes: result.event?.notes || "",
          sp_needed:
            result.event?.sp_needed === null || result.event?.sp_needed === undefined
              ? ""
              : String(result.event.sp_needed),
        });
        setSessionEditor(getSessionEditorState(result.sessions, result.event?.date_text));
        setSessions(result.sessions);
        setSps(result.sps);
        setAssignments(result.assignments);
        setAvailabilityRows(result.availabilityRows);
        setViewerRole(result.viewerRole || "unknown");
        setSpPortal(result.spPortal || null);
        setErrorMessage(result.errorMessage);
        setSessionErrorMessage(result.sessionErrorMessage);
        setAvailabilityErrorMessage(result.availabilityErrorMessage);
        setAccessDenied(result.accessDenied);
        setNotFound(result.notFound);
        setLoading(false);
      });
    };

    refresh();

    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;

        const body = (await response.json().catch(() => null)) as
          | {
              user?: { email?: string | null };
              profile?: {
                full_name?: string | null;
                schedule_name?: string | null;
                email?: string | null;
              } | null;
            }
          | null;

        if (cancelled || !body) return;
        setMe({
          email: asText(body.profile?.email) || asText(body.user?.email),
          fullName: asText(body.profile?.full_name),
          scheduleName: asText(body.profile?.schedule_name),
        });
      } catch {
        return;
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!defaultRelatedKeyword) return;
    setRelatedKeyword((current) => (current ? current : defaultRelatedKeyword));
  }, [defaultRelatedKeyword]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    persistedWorkflowChecks.forEach((id) => {
      next[id] = true;
    });
    setWorkflowChecks(next);
  }, [persistedWorkflowChecks]);

  useEffect(() => {
    return () => {
      clearActionFeedbackTimers();
    };
  }, []);

  useEffect(() => {
    if (!canRunLiveEventMode || commandCenterMode !== "live") return;
    const interval = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [canRunLiveEventMode, commandCenterMode]);

  function handlePauseLiveSchedule() {
    if (livePausedAtMs !== null) return;
    setLivePausedAtMs(Date.now());
    showSuccessMessage("Live schedule paused.");
  }

  function handleResumeLiveSchedule() {
    if (livePausedAtMs === null) return;
    const pauseDurationMinutes = Math.max(0, Math.round((Date.now() - livePausedAtMs) / 60000));
    setLiveDelayMinutes((current) => current + pauseDurationMinutes);
    setLivePausedAtMs(null);
    showSuccessMessage(
      pauseDurationMinutes > 0
        ? `Event resumed with ${pauseDurationMinutes} minute${pauseDurationMinutes === 1 ? "" : "s"} of delay.`
        : "Live event resumed."
    );
  }

  function handleAddLiveDelay(minutes = 5) {
    setLiveDelayMinutes((current) => current + minutes);
    showSuccessMessage(`Added ${minutes} minute${minutes === 1 ? "" : "s"} of operational delay.`);
  }

  function handleReplaceSpFromLiveMode() {
    setShowCandidatePool(true);
    showSuccessMessage("Candidate SP pool opened for replacement.");
  }

  async function handleAddAssignment(spId = selectedSpId, options?: AddAssignmentOptions) {
    if (!id || !spId) return;

    setSaving(true);
    setAssigningSpId(spId);
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      const importedPollNote = asText(options?.notes) || getImportedPollNoteForSpId(spId);
      const assignmentNotes = mergeImportedPollNoteIntoAssignmentNotes("", importedPollNote);
      await saveAssignmentRequest("POST", {
        sp_id: spId,
        status: options?.status,
        confirmed: options?.confirmed,
        notes: assignmentNotes || undefined,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save assignment.");
      setAssigningSpId("");
      setSaving(false);
      return;
    }

    await refreshData();
    setRecentAssignedSpId(spId);
    showSuccessMessage(options?.successMessage || "SP assigned");
    window.setTimeout(() => {
      setRecentAssignedSpId("");
    }, 2400);
    setAssigningSpId("");
    setSaving(false);
  }

  async function handleQuickStaffingAdd(status: "confirmed" | "backup") {
    if (!quickStaffingSpId) return;
    const sp = spsById.get(quickStaffingSpId);
    const pollNote = getImportedPollNoteForSpId(quickStaffingSpId);
    await assignMultipleSpIds(
      [quickStaffingSpId],
      `${sp ? getFullName(sp) : "SP"} added as ${status === "confirmed" ? "primary" : "backup"}.`,
      {
        status,
        confirmed: status === "confirmed",
        notesBySpId: pollNote ? { [quickStaffingSpId]: pollNote } : undefined,
      }
    );
    setQuickStaffingSpId("");
    setQuickStaffingQuery("");
  }

  async function handleStatusChange(assignment: AssignmentRow, status: AssignmentStatus) {
    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      const importedPollNote = getImportedPollNoteForSpId(asText(assignment.sp_id));
      const nextNotes = isSelectedStaffingStatus(status)
        ? mergeImportedPollNoteIntoAssignmentNotes(assignment.notes, importedPollNote)
        : asText(assignment.notes);
      const shouldUpdateNotes =
        isSelectedStaffingStatus(status) && asText(importedPollNote) && nextNotes !== asText(assignment.notes);
      await saveAssignmentRequest("PATCH", {
        assignment_id: assignment.id,
        updates: {
          status,
          confirmed: status === "confirmed",
          last_contacted_at:
            status === "contacted" ? new Date().toISOString() : assignment.last_contacted_at,
          ...(shouldUpdateNotes ? { notes: nextNotes || null } : {}),
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update assignment.");
      setSaving(false);
      return;
    }

    await refreshData();
    showSuccessMessage("Assignment updated.");
    setSaving(false);
  }

  async function handleAssignmentDetailsChange(
    assignment: AssignmentRow,
    updates: Partial<Pick<AssignmentRow, "notes" | "last_contacted_at" | "contact_method">>
  ) {
    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      await saveAssignmentRequest("PATCH", {
        assignment_id: assignment.id,
        updates,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update assignment details.");
      setSaving(false);
      return;
    }

    await refreshData();
    showSuccessMessage("Updated");
    setSaving(false);
  }

  async function handleRemoveAssignment(assignment: AssignmentRow) {
    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      await saveAssignmentRequest("DELETE", {
        assignment_id: assignment.id,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not remove assignment.");
      setSaving(false);
      return;
    }

    await refreshData();
    showSuccessMessage("Updated");
    setSaving(false);
  }

  async function handleOpenAvailabilityRequest() {
    if (!assignedBccEmails.length) {
      setEventSaveError("No selected staffing SP emails are available for an email draft.");
      return;
    }

    setEventSaveError("");
    await persistTrainingMetadataFields(
      {
        email_status: "draft_opened",
        email_draft_opened_at: new Date().toISOString(),
      },
      "Draft opened."
    );
    window.location.href = mailtoHref;
    showSuccessMessage(
      `Draft opened for ${assignedBccEmails.length} selected staffing SP${assignedBccEmails.length === 1 ? "" : "s"}.`
    );
  }

  async function handleToggleWorkflowCheck(itemId: string, complete: boolean) {
    const nextChecks = {
      ...workflowChecks,
      [itemId]: !complete,
    };
    if (!nextChecks[itemId]) {
      delete nextChecks[itemId];
    }
    try {
      await persistWorkflowChecks(nextChecks);
    } catch (error) {
      setEventSaveError(error instanceof Error ? error.message : "Could not update workflow.");
    }
  }

  async function handleConfirmAllAssignments() {
    const pendingAssignments = sortedAssignments.filter((assignment) => !isAssignmentConfirmed(assignment));
    if (!pendingAssignments.length) {
      showSuccessMessage("All selected SPs are already confirmed.");
      return;
    }

    setSaving(true);
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveError("");
    setEventSaveMessage("");

    try {
      for (const assignment of pendingAssignments) {
        const importedPollNote = getImportedPollNoteForSpId(asText(assignment.sp_id));
        const nextNotes = mergeImportedPollNoteIntoAssignmentNotes(assignment.notes, importedPollNote);
        const shouldUpdateNotes = asText(importedPollNote) && nextNotes !== asText(assignment.notes);
        await saveAssignmentRequest("PATCH", {
          assignment_id: assignment.id,
          updates: {
            status: "confirmed",
            confirmed: true,
            ...(shouldUpdateNotes ? { notes: nextNotes || null } : {}),
          },
        });
      }
      await refreshData();
      showSuccessMessage("SPs confirmed");
    } catch (error) {
      setEventSaveError(error instanceof Error ? error.message : "Could not confirm all SPs.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFillRemainingSpots() {
    const eligibleIds = availableSps
      .filter((sp) => {
        const status = availabilityMatchBySpId.get(sp.id)?.status || "unknown";
        return status === "available" || status === "partial";
      })
      .slice(0, Math.max(shortage, 0))
      .map((sp) => sp.id);

    await assignMultipleSpIds(
      eligibleIds,
      `Added ${eligibleIds.length} SP${eligibleIds.length === 1 ? "" : "s"}.`
    );
  }

  async function handleTrainingAttendanceToggle(assignment: AssignmentRow, checked: boolean) {
    setAttendanceSaving(true);
    setAttendanceError("");
    setAttendanceSuccess("");

    try {
      const body = await saveAssignmentRequest("PATCH", {
        assignment_id: assignment.id,
        updates: {
          training_attended: checked,
          training_checked_in_at: checked ? new Date().toISOString() : null,
        },
      });

      if (body?.assignment) {
        setAssignments((current) =>
          current.map((item) => (item.id === assignment.id ? { ...item, ...body.assignment } : item))
        );
      } else {
        await refreshData();
      }
      setAttendanceSuccess(checked ? "Attendance updated." : "Attendance cleared.");
    } catch (error) {
      setAttendanceError(error instanceof Error ? error.message : "Could not update training attendance.");
    } finally {
      setAttendanceSaving(false);
    }
  }

  async function handleBulkTrainingAttendance(action: "confirm_all" | "clear_all") {
    if (!sortedAssignments.length) return;

    setAttendanceSaving(true);
    setAttendanceError("");
    setAttendanceSuccess("");

    try {
      const body = await saveAssignmentRequest("PATCH", {
        attendance_action: action,
      });

      if (Array.isArray(body?.assignments)) {
        setAssignments(body.assignments);
      } else {
        await refreshData();
      }
      setAttendanceSuccess(action === "confirm_all" ? "All assigned SPs marked present." : "Training attendance cleared.");
    } catch (error) {
      setAttendanceError(error instanceof Error ? error.message : "Could not update training attendance.");
    } finally {
      setAttendanceSaving(false);
    }
  }

  function handleClearSuggestedAssignments() {
    setSuggestedAssignmentFilter("all");
    showSuccessMessage("Suggested assignments reset.");
  }

  function updateLiveRoomState(
    roomKey: string,
    updates: Partial<LiveRoomLocalState> | ((current: LiveRoomLocalState) => LiveRoomLocalState)
  ) {
    setLiveRoomStates((current) => {
      const nextValue =
        typeof updates === "function" ? updates(current[roomKey] || {}) : { ...(current[roomKey] || {}), ...updates };
      return {
        ...current,
        [roomKey]: nextValue,
      };
    });
  }

  function handleSetLiveRoomStatus(roomKey: string, status: LiveRoomStatusValue) {
    updateLiveRoomState(roomKey, { status });
  }

  function handleAddLiveRoomDelay(roomKey: string, minutes = 5) {
    updateLiveRoomState(roomKey, (current) => ({
      ...current,
      status: "delayed",
      delayMinutes: (current.delayMinutes || 0) + minutes,
    }));
  }

  function handleFlagLiveRoomIssue(roomKey: string) {
    updateLiveRoomState(roomKey, (current) => ({
      ...current,
      issueNote: current.issueNote || "Issue flagged",
    }));
  }

  function handleClearLiveRoomIssue(roomKey: string) {
    updateLiveRoomState(roomKey, (current) => ({
      ...current,
      issueNote: "",
    }));
  }

  const liveCommandCenterPanel =
    canRunLiveEventMode && commandCenterMode === "live" ? (
      <section
        style={{
          marginTop: "14px",
          border: "1px solid rgba(94, 234, 212, 0.32)",
          borderRadius: "22px",
          padding: "16px",
          background:
            "linear-gradient(180deg, rgba(5, 18, 31, 0.98) 0%, rgba(11, 33, 48, 0.98) 52%, rgba(10, 25, 39, 0.98) 100%)",
          boxShadow: "0 24px 48px rgba(4, 12, 24, 0.34)",
          display: "grid",
          gap: "14px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(rgba(126, 231, 219, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(126, 231, 219, 0.05) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            pointerEvents: "none",
            opacity: 0.35,
          }}
        />

        <div style={{ position: "relative", display: "grid", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ ...statLabel, color: "#7ee7db" }}>Live Event Mode</div>
              <div style={{ marginTop: "4px", color: "#f4fbff", fontSize: "24px", fontWeight: 900 }}>
                Event Command Station
              </div>
              <div style={{ marginTop: "6px", color: "#9ed9d1", fontSize: "13px", fontWeight: 700 }}>
                Run staffing, timing, and rotation flow from one operational view.
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {recordingIndicatorActive ? (
                <RecordingStatusIndicator
                  label={recordingIndicatorLabel}
                  compact
                  hot={recordingIndicatorHot}
                  liveMode
                />
              ) : null}
              <span
                style={{
                  borderRadius: "999px",
                  padding: "7px 12px",
                  background:
                    livePausedAtMs !== null
                      ? "rgba(243, 187, 103, 0.14)"
                      : "rgba(44, 211, 173, 0.14)",
                  border:
                    livePausedAtMs !== null
                      ? "1px solid rgba(243, 187, 103, 0.28)"
                      : "1px solid rgba(44, 211, 173, 0.26)",
                  color: livePausedAtMs !== null ? "var(--cfsp-warning)" : "var(--cfsp-green)",
                  fontWeight: 900,
                  fontSize: "12px",
                }}
              >
                {livePausedAtMs !== null ? "Paused" : "Go Live"}
              </span>
              {liveDelayMinutes > 0 ? (
                <span style={{ ...commandChipStyle, background: "rgba(73, 168, 255, 0.12)", color: "#7dd3fc" }}>
                  Delay +{liveDelayMinutes}m
                </span>
              ) : null}
            </div>
          </div>

	          <div
	            style={{
	              display: "grid",
	              gap: "10px",
	              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            }}
          >
            {[
              {
                label: "Current Rotation",
                value:
                  currentRotationRoundNumber !== null
                    ? `Round ${currentRotationRoundNumber}`
                    : currentLiveBlock?.label || "Stand by",
                tone: "#f4fbff",
              },
              {
                label: "Checked-in SPs",
                value: `${checkedInAssignedCount}/${sortedAssignments.length || 0}`,
                tone: "var(--cfsp-green)",
              },
              {
                label: "Missing SPs",
                value: String(missingAssignedCount),
                tone: missingAssignedCount > 0 ? "var(--cfsp-warning)" : "#d9f99d",
              },
              {
                label: "Backup Available",
                value: String(backupAvailableCount),
                tone: backupAvailableCount > 0 ? "#7dd3fc" : "var(--cfsp-text-muted)",
              },
              {
                label: "Coverage Health",
                value:
                  liveStaffingHealthTone === "green"
                    ? "Covered"
                    : liveStaffingHealthTone === "yellow"
                      ? "At risk"
                      : "Understaffed",
                tone:
                  liveStaffingHealthTone === "green"
                    ? "var(--cfsp-green)"
                    : liveStaffingHealthTone === "yellow"
                      ? "var(--cfsp-warning)"
                      : "var(--cfsp-danger)",
              },
              {
                label: "Live Clock",
                value: formatMinutesAsClockLabel(simulatedLiveMinutes),
                tone: "#f4fbff",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: "16px",
                  border: "1px solid rgba(126, 231, 219, 0.18)",
                  background: "rgba(11, 24, 38, 0.88)",
                  padding: "12px 14px",
                  display: "grid",
                  gap: "6px",
                }}
              >
                <div style={{ ...statLabel, color: "#89b7c4" }}>{item.label}</div>
                <div style={{ color: item.tone, fontSize: "20px", fontWeight: 900 }}>{item.value}</div>
              </div>
	            ))}
	          </div>

	          <section
	            style={{
	              borderRadius: "18px",
	              border: "1px solid rgba(73, 168, 255, 0.22)",
	              background: "rgba(9, 20, 33, 0.94)",
	              padding: "14px",
	              display: "grid",
	              gap: "12px",
	            }}
	          >
	            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
	              <div>
	                <div style={{ ...statLabel, color: "#7ee7db" }}>Live Room Status Board</div>
	                <div style={{ marginTop: "4px", color: "#f4fbff", fontSize: "20px", fontWeight: 900 }}>
	                  {currentRotationRoundNumber !== null ? `Round ${currentRotationRoundNumber}` : currentLiveBlock?.label || "Stand by"}
	                </div>
	                <div style={{ marginTop: "4px", color: "#9ed9d1", fontSize: "13px", fontWeight: 700 }}>
	                  Room-by-room simulation status for the active rotation.
	                </div>
	              </div>
	              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
	                <span style={{ ...commandChipStyle, background: "rgba(44, 211, 173, 0.14)", color: "#86efac" }}>
	                  {event?.name || "Untitled Event"}
	                </span>
	                <span
	                  style={{
	                    ...commandChipStyle,
	                    background: livePausedAtMs !== null ? "rgba(243, 187, 103, 0.14)" : "rgba(44, 211, 173, 0.14)",
	                    color: livePausedAtMs !== null ? "var(--cfsp-warning)" : "var(--cfsp-green)",
	                  }}
	                >
	                  {livePausedAtMs !== null ? "Paused" : "Live"}
	                </span>
	                <span style={{ ...commandChipStyle, background: "rgba(73, 168, 255, 0.12)", color: "#7dd3fc" }}>
	                  {liveRoomActiveCount} active
	                </span>
	                <span style={{ ...commandChipStyle, background: "rgba(243, 187, 103, 0.14)", color: "#fde68a" }}>
	                  {liveRoomDelayedCount} delayed
	                </span>
	                <span style={{ ...commandChipStyle, background: "rgba(248, 113, 113, 0.14)", color: "#fecaca" }}>
	                  {liveRoomMissingCount} missing SPs
	                </span>
	                {nextLiveBlock ? (
	                  <span style={{ ...commandChipStyle, background: "rgba(126, 231, 219, 0.14)", color: "#7ee7db" }}>
	                    Next: {nextLiveBlock.label}
	                  </span>
	                ) : null}
	              </div>
	            </div>

	            {currentLiveRoomBoardRows.length === 0 ? (
	              <div style={{ color: "#9bb4c0", fontWeight: 700 }}>
	                No live rooms are active yet. Build the schedule and assign SPs to populate the room wall.
	              </div>
	            ) : (
	              <div
	                style={{
	                  display: "grid",
	                  gap: "10px",
	                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
	                }}
	              >
	                {currentLiveRoomBoardRows.map((row) => {
	                  const statusAppearance = liveRoomStatusAppearance[row.status];
	                  const hasIssue = Boolean(row.issueNote);
	                  return (
	                    <div
	                      key={row.key}
	                      style={{
	                        borderRadius: "16px",
	                        border: statusAppearance.border,
	                        background: "rgba(13, 27, 42, 0.92)",
	                        padding: "12px 14px",
	                        display: "grid",
	                        gap: "10px",
	                        boxShadow: hasIssue ? "0 10px 24px rgba(248, 113, 113, 0.12)" : "none",
	                      }}
	                    >
	                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
	                        <div>
	                          <div style={{ color: "#f4fbff", fontWeight: 900, fontSize: "17px" }}>{row.roomName}</div>
	                          <div style={{ marginTop: "4px", color: "#9ed9d1", fontSize: "12px", fontWeight: 700 }}>
	                            {row.sp ? getFullName(row.sp) : "SP TBD"}
	                          </div>
	                        </div>
	                        <span
	                          style={{
	                            borderRadius: "999px",
	                            padding: "5px 9px",
	                            background: statusAppearance.background,
	                            color: statusAppearance.color,
	                            border: statusAppearance.border,
	                            fontSize: "11px",
	                            fontWeight: 900,
	                          }}
	                        >
	                          {statusAppearance.label}
	                        </span>
	                      </div>

	                      <div
	                        style={{
	                          display: "grid",
	                          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
	                          gap: "8px",
	                        }}
	                      >
	                        <div style={{ ...statCard, background: "rgba(255,255,255,0.04)" }}>
	                          <div style={{ ...statLabel, color: "#89b7c4" }}>Learner</div>
	                          <div style={{ color: "#f4fbff", fontWeight: 800, fontSize: "14px" }}>{row.learnerLabel}</div>
	                        </div>
	                        <div style={{ ...statCard, background: "rgba(255,255,255,0.04)" }}>
	                          <div style={{ ...statLabel, color: "#89b7c4" }}>Time Remaining</div>
	                          <div style={{ color: "#f4fbff", fontWeight: 800, fontSize: "14px" }}>{row.timeRemainingLabel}</div>
	                        </div>
	                        <div style={{ ...statCard, background: "rgba(255,255,255,0.04)" }}>
	                          <div style={{ ...statLabel, color: "#89b7c4" }}>Issue</div>
	                          <div style={{ color: hasIssue ? "#fecaca" : "#cbd5e1", fontWeight: 800, fontSize: "14px" }}>
	                            {hasIssue ? "Flagged" : "Clear"}
	                          </div>
	                        </div>
	                      </div>

	                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
	                        {row.checkedAt ? (
	                          <span style={{ ...commandChipStyle, background: "var(--cfsp-green-soft)", color: "var(--cfsp-green)" }}>
	                            Arrived {row.checkedAt}
	                          </span>
	                        ) : null}
	                        {row.delayMinutes > 0 ? (
	                          <span style={{ ...commandChipStyle, background: "rgba(243, 187, 103, 0.14)", color: "#fde68a" }}>
	                            Delay +{row.delayMinutes}m
	                          </span>
	                        ) : null}
	                        {hasIssue ? (
	                          <span style={{ ...commandChipStyle, background: "rgba(248, 113, 113, 0.14)", color: "#fecaca" }}>
	                            {row.issueNote}
	                          </span>
	                        ) : null}
	                      </div>
	                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
	                        <button type="button" onClick={() => handleSetLiveRoomStatus(row.key, "ready")} style={{ ...buttonStyle, padding: "7px 10px" }}>
	                          Mark Ready
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => handleSetLiveRoomStatus(row.key, "in_session")}
	                          style={{
	                            ...buttonStyle,
	                            padding: "7px 10px",
	                            background: "rgba(44, 211, 173, 0.14)",
	                            color: "#86efac",
	                            border: "1px solid rgba(44, 211, 173, 0.22)",
	                          }}
	                        >
	                          Start
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => handleSetLiveRoomStatus(row.key, "complete")}
	                          style={{
	                            ...buttonStyle,
	                            padding: "7px 10px",
	                            background: "rgba(45, 212, 191, 0.14)",
	                            color: "#99f6e4",
	                            border: "1px solid rgba(45, 212, 191, 0.22)",
	                          }}
	                        >
	                          Mark Complete
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => handleAddLiveRoomDelay(row.key)}
	                          style={{
	                            ...buttonStyle,
	                            padding: "7px 10px",
	                            background: "var(--cfsp-button-secondary-bg)",
	                            color: "var(--cfsp-button-secondary-text)",
	                            border: "1px solid var(--cfsp-button-secondary-border)",
	                          }}
	                        >
	                          Add Delay
	                        </button>
	                        <button
	                          type="button"
	                          onClick={() => handleFlagLiveRoomIssue(row.key)}
	                          style={{ ...dangerButtonStyle, padding: "7px 10px" }}
	                        >
	                          Flag Issue
	                        </button>
	                        {hasIssue ? (
	                          <button
	                            type="button"
	                            onClick={() => handleClearLiveRoomIssue(row.key)}
	                            style={{
	                              ...buttonStyle,
	                              padding: "7px 10px",
	                              background: "rgba(73, 168, 255, 0.12)",
	                              color: "#7dd3fc",
	                              border: "1px solid rgba(73, 168, 255, 0.24)",
	                            }}
	                          >
	                            Clear Issue
	                          </button>
	                        ) : null}
	                      </div>
	                    </div>
	                  );
	                })}
	              </div>
	            )}
	          </section>

	          <div
	            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)",
            }}
          >
            <section
              style={{
                borderRadius: "18px",
                border: "1px solid rgba(73, 168, 255, 0.22)",
                background: "rgba(9, 20, 33, 0.94)",
                padding: "14px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ ...statLabel, color: "#7ee7db" }}>Current Rotation</div>
                  <div style={{ marginTop: "4px", color: "#f4fbff", fontSize: "20px", fontWeight: 900 }}>
                    {currentLiveBlock?.label || "Awaiting first live block"}
                  </div>
                  <div style={{ marginTop: "4px", color: "#b8d7e3", fontWeight: 700 }}>
                    {currentLiveBlock
                      ? formatMinuteRange(currentLiveBlock.startMinutes, currentLiveBlock.endMinutes)
                      : summaryTimeLabel}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...statLabel, color: "#89b7c4" }}>Time Remaining</div>
                  <div style={{ marginTop: "4px", color: "#f4fbff", fontSize: "24px", fontWeight: 900 }}>
                    {currentLiveBlock
                      ? formatRemainingMinutes(
                          Math.max(currentLiveBlock.endMinutes - simulatedLiveMinutes, 0)
                        )
                      : liveFlowBlocks[0]
                        ? `${Math.max(liveFlowBlocks[0].startMinutes - simulatedLiveMinutes, 0)}m to start`
                        : "Timeline TBD"}
                  </div>
                  {nextLiveBlock ? (
                    <div style={{ marginTop: "4px", color: "#9ed9d1", fontSize: "13px", fontWeight: 700 }}>
                      Next: {nextLiveBlock.label} · {formatMinuteRange(nextLiveBlock.startMinutes, nextLiveBlock.endMinutes)}
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span style={commandChipStyle}>
                  {currentLiveBlock?.rooms.length || 0} room{currentLiveBlock?.rooms.length === 1 ? "" : "s"} in use
                </span>
                <span style={commandChipStyle}>{checkedInAssignedCount} checked in</span>
                {lateAssignedCount > 0 ? (
                  <span style={{ ...commandChipStyle, background: "rgba(243, 187, 103, 0.14)", color: "var(--cfsp-warning)" }}>
                    {lateAssignedCount} late
                  </span>
                ) : null}
                {noShowAssignedCount > 0 ? (
                  <span style={{ ...commandChipStyle, background: "rgba(248, 113, 113, 0.14)", color: "var(--cfsp-danger)" }}>
                    {noShowAssignedCount} no-show
                  </span>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {livePausedAtMs === null ? (
                  <button type="button" onClick={handlePauseLiveSchedule} style={{ ...buttonStyle, padding: "8px 12px" }}>
                    Pause schedule
                  </button>
                ) : (
                  <button type="button" onClick={handleResumeLiveSchedule} style={{ ...buttonStyle, padding: "8px 12px" }}>
                    Resume event
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleAddLiveDelay(5)}
                  style={{
                    ...buttonStyle,
                    padding: "8px 12px",
                    background: "var(--cfsp-button-secondary-bg)",
                    color: "var(--cfsp-button-secondary-text)",
                    border: "1px solid var(--cfsp-button-secondary-border)",
                  }}
                >
                  Add delay
                </button>
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                {currentLiveAssignmentRows.length === 0 ? (
                  <div style={{ color: "#9bb4c0", fontWeight: 700 }}>
                    No active rotation assignments mapped yet. Use the schedule and staffing tools below to complete the live board.
                  </div>
                ) : (
                  currentLiveAssignmentRows.map(({ assignment, sp, roomName }) => {
                    const checkedAt = formatAttendanceTimestamp(assignment.training_checked_in_at);
                    const status = getAssignmentStatus(assignment);
                    const isMissing = assignment.training_attended !== true && status !== "declined" && status !== "no_show";
                    const isLate =
                      firstLiveRotationStartMinutes !== null &&
                      simulatedLiveMinutes > firstLiveRotationStartMinutes &&
                      isMissing;
                    const isNoShow =
                      firstLiveRotationStartMinutes !== null &&
                      simulatedLiveMinutes >= firstLiveRotationStartMinutes + 15 &&
                      isMissing;
                    return (
                      <div
                        key={`live-assignment-${assignment.id}`}
                        style={{
                          borderRadius: "14px",
                          border: isNoShow
                            ? "1px solid rgba(248, 113, 113, 0.34)"
                            : isLate
                              ? "1px solid rgba(243, 187, 103, 0.3)"
                              : "1px solid rgba(126, 231, 219, 0.18)",
                          background: "rgba(13, 27, 42, 0.92)",
                          padding: "10px 12px",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: "#f4fbff", fontWeight: 900 }}>{roomName || "Room TBD"}</div>
                            <div style={{ marginTop: "4px", color: "#d6edf4", fontWeight: 800 }}>
                              {getFullName(sp)}
                            </div>
                            <div style={{ marginTop: "4px", color: "#89b7c4", fontSize: "13px", fontWeight: 700 }}>
                              {[getEmail(sp), sp.phone].filter(Boolean).join(" · ") || "No contact info"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                            <span
                              style={{
                                ...assignmentStatusStyles[status],
                                borderRadius: "999px",
                                padding: "5px 9px",
                                fontSize: "11px",
                                fontWeight: 900,
                              }}
                            >
                              {assignmentStatusLabels[status]}
                            </span>
                            {assignment.training_attended ? (
                              <span style={{ ...commandChipStyle, background: "var(--cfsp-green-soft)", color: "var(--cfsp-green)" }}>
                                Arrived {checkedAt || "checked in"}
                              </span>
                            ) : isNoShow ? (
                              <span style={{ ...commandChipStyle, background: "rgba(248, 113, 113, 0.14)", color: "var(--cfsp-danger)" }}>
                                No-show risk
                              </span>
                            ) : isLate ? (
                              <span style={{ ...commandChipStyle, background: "rgba(243, 187, 103, 0.14)", color: "var(--cfsp-warning)" }}>
                                Late
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => void handleTrainingAttendanceToggle(assignment, true)}
                            disabled={attendanceSaving || trainingAttendanceFieldsMissing || assignment.training_attended === true}
                            style={{ ...buttonStyle, padding: "7px 11px", opacity: attendanceSaving || trainingAttendanceFieldsMissing || assignment.training_attended === true ? 0.65 : 1 }}
                          >
                            Mark SP arrived
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(assignment, "no_show")}
                            disabled={saving}
                            style={{ ...dangerButtonStyle, padding: "7px 11px", opacity: saving ? 0.65 : 1 }}
                          >
                            Mark SP absent
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleStatusChange(assignment, "backup")}
                            disabled={saving}
                            style={{
                              ...buttonStyle,
                              padding: "7px 11px",
                              background: "var(--cfsp-button-secondary-bg)",
                              color: "var(--cfsp-button-secondary-text)",
                              border: "1px solid var(--cfsp-button-secondary-border)",
                              opacity: saving ? 0.65 : 1,
                            }}
                          >
                            Move SP to backup
                          </button>
                          <button
                            type="button"
                            onClick={handleReplaceSpFromLiveMode}
                            style={{
                              ...buttonStyle,
                              padding: "7px 11px",
                              background: "rgba(73, 168, 255, 0.12)",
                              color: "#7dd3fc",
                              border: "1px solid rgba(73, 168, 255, 0.24)",
                            }}
                          >
                            Replace SP
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section style={{ display: "grid", gap: "12px" }}>
              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid rgba(126, 231, 219, 0.18)",
                  background: "rgba(9, 20, 33, 0.94)",
                  padding: "14px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ ...statLabel, color: "#7ee7db" }}>Operational Alerts</div>
                {liveAlerts.length === 0 ? (
                  <div style={{ color: "#9bb4c0", fontWeight: 700 }}>
                    No live alerts. Timeline and staffing are stable right now.
                  </div>
                ) : (
                  liveAlerts.map((alert, index) => (
                    <div
                      key={`${alert.message}-${index}`}
                      style={{
                        borderRadius: "12px",
                        padding: "10px 12px",
                        border:
                          alert.tone === "danger"
                            ? "1px solid rgba(248, 113, 113, 0.28)"
                            : alert.tone === "warning"
                              ? "1px solid rgba(243, 187, 103, 0.28)"
                              : "1px solid rgba(73, 168, 255, 0.24)",
                        background:
                          alert.tone === "danger"
                            ? "rgba(127, 29, 29, 0.2)"
                            : alert.tone === "warning"
                              ? "rgba(120, 53, 15, 0.18)"
                              : "rgba(8, 47, 73, 0.2)",
                        color:
                          alert.tone === "danger"
                            ? "#fecaca"
                            : alert.tone === "warning"
                              ? "#fde68a"
                              : "#bfdbfe",
                        fontWeight: 800,
                        lineHeight: 1.45,
                      }}
                    >
                      {alert.message}
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid rgba(73, 168, 255, 0.22)",
                  background: "rgba(9, 20, 33, 0.94)",
                  padding: "14px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div style={{ ...statLabel, color: "#7ee7db" }}>Today&apos;s Flow</div>
                {liveFlowBlocks.length === 0 ? (
                  <div style={{ color: "#9bb4c0", fontWeight: 700 }}>
                    Build a schedule to unlock the live flow timeline.
                  </div>
                ) : (
                  liveFlowBlocks.map((block, index) => {
                    const isCurrent =
                      currentLiveBlock?.key === block.key ||
                      (currentLiveBlock === null && index === 0 && simulatedLiveMinutes < block.startMinutes);
                    const toneColor =
                      block.tone === "rotation"
                        ? "#7dd3fc"
                        : block.tone === "support"
                          ? "#a7f3d0"
                          : block.tone === "break"
                            ? "#fde68a"
                            : "#c4b5fd";
                    return (
                      <div
                        key={block.key}
                        style={{
                          borderRadius: "14px",
                          padding: "10px 12px",
                          border: isCurrent
                            ? "1px solid rgba(126, 231, 219, 0.3)"
                            : "1px solid rgba(148, 163, 184, 0.16)",
                          background: isCurrent ? "rgba(16, 44, 59, 0.92)" : "rgba(13, 27, 42, 0.82)",
                          boxShadow: isCurrent ? "0 0 0 1px rgba(126, 231, 219, 0.12)" : "none",
                          display: "grid",
                          gap: "4px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                          <div style={{ color: toneColor, fontWeight: 900 }}>
                            {block.label}
                            {block.roundNumber ? ` ${block.roundNumber}` : ""}
                          </div>
                          {isCurrent ? (
                            <span style={{ ...commandChipStyle, background: "rgba(126, 231, 219, 0.14)", color: "#7ee7db" }}>
                              Active now
                            </span>
                          ) : null}
                        </div>
                        <div style={{ color: "#d6edf4", fontWeight: 700 }}>
                          {formatMinuteRange(block.startMinutes, block.endMinutes)}
                        </div>
                        <div style={{ color: "#89b7c4", fontSize: "13px", fontWeight: 700 }}>{block.detail}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
    ) : null;

  const staffingWorkspacePalette = {
    surface: "linear-gradient(180deg, rgba(247, 251, 255, 0.98) 0%, rgba(238, 248, 250, 0.98) 50%, rgba(245, 247, 255, 0.99) 100%)",
    panel: "linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(241, 248, 251, 0.98) 100%)",
    panelSoft: "linear-gradient(180deg, rgba(248, 252, 255, 0.96) 0%, rgba(240, 247, 252, 0.98) 100%)",
    row: "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(242, 248, 252, 0.98) 100%)",
    subtle: "rgba(233, 242, 247, 0.72)",
    border: "rgba(128, 167, 182, 0.22)",
    borderStrong: "rgba(106, 180, 195, 0.26)",
    text: "#18364a",
    textStrong: "#0f2940",
    textMuted: "#597b8e",
    chip: "rgba(88, 187, 198, 0.12)",
    chipText: "#1b6e7d",
    chipBorder: "rgba(88, 187, 198, 0.22)",
    selectedBg: "rgba(135, 206, 235, 0.18)",
    selectedText: "#1d5f83",
    selectedBorder: "rgba(99, 181, 217, 0.24)",
    buttonBg: "linear-gradient(180deg, rgba(232, 247, 251, 0.98) 0%, rgba(219, 240, 246, 0.98) 100%)",
    buttonBorder: "rgba(110, 171, 191, 0.24)",
    dangerBg: "rgba(142, 28, 28, 0.16)",
    dangerBorder: "rgba(255, 95, 95, 0.42)",
    dangerText: "#ff6b6b",
  } as const;
  const staffingCommandSurfaceStyle: React.CSSProperties = {
    ...cardStyle,
    background: staffingWorkspacePalette.surface,
    border: `1px solid ${staffingWorkspacePalette.borderStrong}`,
    boxShadow: "0 18px 40px rgba(112, 148, 169, 0.14)",
    display: "grid",
    gap: "12px",
    overflow: "hidden",
    backdropFilter: "blur(12px)",
  };
  const staffingPanelStyle: React.CSSProperties = {
    border: `1px solid ${staffingWorkspacePalette.border}`,
    borderRadius: "18px",
    background: staffingWorkspacePalette.panel,
    boxShadow: "0 12px 24px rgba(110, 148, 169, 0.08), inset 0 1px 0 rgba(255,255,255,0.55)",
    padding: "12px 14px",
  };
  const staffingSummaryStyle: React.CSSProperties = {
    cursor: "pointer",
    color: staffingWorkspacePalette.textStrong,
    fontWeight: 900,
    letterSpacing: "0.01em",
  };
  const staffingMetricCardStyle: React.CSSProperties = {
    ...statCard,
    padding: "10px 12px",
    background: staffingWorkspacePalette.panelSoft,
    border: `1px solid ${staffingWorkspacePalette.border}`,
    boxShadow: "0 8px 18px rgba(110, 148, 169, 0.08)",
  };
  const staffingRowCardStyle: React.CSSProperties = {
    border: `1px solid ${staffingWorkspacePalette.border}`,
    borderRadius: "14px",
    padding: "10px 12px",
    background: staffingWorkspacePalette.row,
    display: "grid",
    gap: "8px",
    boxShadow: "0 8px 18px rgba(110, 148, 169, 0.08)",
  };
  const staffingEmptyStateStyle: React.CSSProperties = {
    border: `1px dashed ${staffingWorkspacePalette.borderStrong}`,
    borderRadius: "12px",
    padding: "10px 12px",
    background: staffingWorkspacePalette.subtle,
    color: staffingWorkspacePalette.textMuted,
    fontWeight: 700,
    fontSize: "13px",
  };
  const staffingSecondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: staffingWorkspacePalette.buttonBg,
    color: staffingWorkspacePalette.textStrong,
    border: `1px solid ${staffingWorkspacePalette.buttonBorder}`,
    boxShadow: "0 6px 14px rgba(110, 148, 169, 0.08)",
  };
  const staffingSelectedChipStyle: React.CSSProperties = {
    ...commandChipStyle,
    background: staffingWorkspacePalette.selectedBg,
    color: staffingWorkspacePalette.selectedText,
    border: `1px solid ${staffingWorkspacePalette.selectedBorder}`,
  };
  const staffingMutedTextStyle: React.CSSProperties = {
    color: staffingWorkspacePalette.textMuted,
    fontWeight: 700,
    fontSize: "13px",
  };
  const staffingDocUrl = asText(trainingMetadata.staffing_doc_url);
  const staffingDocName =
    asText(trainingMetadata.staffing_doc_name) ||
    getFilenameFromUrl(staffingDocUrl) ||
    "PDF, DOCX, XLSX, or CSV";
  const staffingDocStoragePath = asText(trainingMetadata.staffing_doc_storage_path);
  const staffingDocBusy = trainingMaterialSaving.staffing_doc;
  const isPlanningVisualMode = commandCenterMode === "planning";
  const commandCenterVisual = {
    shellBorder: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.2)" : "1px solid rgba(73, 168, 255, 0.24)",
    shellBackground: isPlanningVisualMode
      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(241, 249, 252, 0.98) 100%)"
      : "linear-gradient(180deg, rgba(17, 31, 48, 0.94) 0%, rgba(20, 43, 62, 0.9) 100%)",
    shellShadow: isPlanningVisualMode ? "0 14px 32px rgba(42, 112, 140, 0.08)" : "none",
    labelColor: isPlanningVisualMode ? "#247083" : "#7ee7db",
    headingColor: isPlanningVisualMode ? "#0f2940" : "#f4fbff",
    textColor: isPlanningVisualMode ? "#18364a" : "#f8fafc",
    mutedColor: isPlanningVisualMode ? "#597b8e" : "#9cc7d3",
    cardBackground: isPlanningVisualMode
      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 250, 252, 0.98) 100%)"
      : "linear-gradient(180deg, rgba(20, 37, 54, 0.94) 0%, rgba(21, 40, 58, 0.92) 100%)",
    cardBorder: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.18)" : "1px solid rgba(126, 231, 219, 0.12)",
    chipBackground: isPlanningVisualMode ? "rgba(219, 240, 246, 0.82)" : "rgba(125, 211, 252, 0.14)",
    chipText: isPlanningVisualMode ? "#1d5f83" : "#7dd3fc",
    activeSoftBackground: isPlanningVisualMode ? planningSuccessBackground : "rgba(126, 231, 219, 0.14)",
    activeSoftText: isPlanningVisualMode ? planningSuccessText : "#7ee7db",
    panelBackground: isPlanningVisualMode
      ? "linear-gradient(180deg, rgba(249, 253, 255, 0.98) 0%, rgba(237, 248, 251, 0.96) 100%)"
      : "linear-gradient(180deg, rgba(9, 26, 39, 0.98) 0%, rgba(12, 27, 41, 0.94) 100%)",
    panelBorder: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.2)" : "1px solid rgba(126, 231, 219, 0.24)",
    rowBackground: isPlanningVisualMode ? "rgba(255, 255, 255, 0.96)" : "rgba(255,255,255,0.04)",
    rowBorder: isPlanningVisualMode ? "1px solid rgba(128, 167, 182, 0.22)" : "1px solid rgba(148, 163, 184, 0.18)",
  } as const;

  const normalEventStaffingCommandCenter =
    !isTrainingMode ? (
      <section
        style={{
          ...staffingCommandSurfaceStyle,
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
            <h2 style={{ ...compactSectionTitleStyle, color: staffingWorkspacePalette.textStrong, letterSpacing: "0.01em" }}>Staffing Command Center</h2>
            <p style={{ ...compactSectionHintStyle, color: staffingWorkspacePalette.textMuted }}>
              Run coverage, polling, responder ranking, and selected-staffing operations from one compact workflow.
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ ...staffingSelectedChipStyle, background: "rgba(186, 230, 253, 0.28)", color: "#1d5f83" }}>{needed} needed</span>
            <span style={{ ...staffingSelectedChipStyle, background: planningSuccessBackground, color: planningSuccessText, border: planningSuccessBorder }}>
              {confirmedCount} confirmed
            </span>
            <span
              style={{
                ...staffingSelectedChipStyle,
                background:
                  coverageRiskTone === "green"
                    ? planningSuccessBackground
                    : coverageRiskTone === "yellow"
                      ? "rgba(253, 230, 138, 0.14)"
                      : "rgba(252, 165, 165, 0.14)",
                color:
                  coverageRiskTone === "green"
                    ? planningSuccessText
                    : coverageRiskTone === "yellow"
                      ? "#fde68a"
                      : staffingWorkspacePalette.dangerText,
                border:
                  coverageRiskTone === "green"
                    ? planningSuccessBorder
                    : coverageRiskTone === "yellow"
                      ? "1px solid rgba(253, 230, 138, 0.2)"
                      : `1px solid ${staffingWorkspacePalette.dangerBorder}`,
              }}
            >
              {staffingHealthLabel}
            </span>
          </div>
        </div>

        {!staffingRelevant ? (
          <div
            style={{
              ...statCard,
              background: "rgba(196, 181, 253, 0.12)",
              border: "1px solid rgba(196, 181, 253, 0.18)",
              color: "#ddd6fe",
            }}
          >
            <div style={{ ...statLabel, color: "#d8b4fe" }}>HiFi Operations</div>
            <div style={{ marginTop: "4px", fontWeight: 800 }}>
              This event is currently classified as HiFi. SP staffing stays available if needed, but no active SP coverage target is driving the workflow.
            </div>
          </div>
        ) : null}

        {noSpStaffingRequired ? (
          <div
            style={{
              border: planningSuccessBorder,
              borderRadius: "16px",
              padding: "14px 16px",
              background: planningSuccessCardBackground,
              color: planningSuccessText,
              fontWeight: 800,
            }}
          >
            No SP staffing required for this skills event.
          </div>
        ) : (
          <>
            {relatedTrainingEventId ? (
              <div
                style={{
                  borderRadius: "14px",
                  border: "1px solid rgba(125, 211, 252, 0.16)",
                  background: "rgba(125, 211, 252, 0.08)",
                  padding: "12px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Related Training Event</div>
                  <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>
                    {relatedTrainingEventName || "Open linked SP training event"}
                  </div>
                </div>
                <Link
                  href={`/events/${encodeURIComponent(relatedTrainingEventId)}`}
                  style={{ ...staffingSecondaryButtonStyle, display: "inline-flex", alignItems: "center", textDecoration: "none" }}
                >
                  Open Training Event
                </Link>
              </div>
            ) : null}

            <section
              style={{
                border: `1px solid ${staffingWorkspacePalette.borderStrong}`,
                borderRadius: "16px",
                padding: "12px 14px",
                background: "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(238, 248, 252, 0.96) 100%)",
                boxShadow: "0 10px 22px rgba(42, 112, 140, 0.08)",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ ...statLabel, color: staffingWorkspacePalette.textStrong }}>Quick Add SP</div>
                  <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "13px" }}>
                    Fast primary or backup staffing without opening the full finder.
                  </div>
                </div>
                <span style={{ ...staffingSelectedChipStyle, background: planningSuccessBackground, color: planningSuccessText, border: planningSuccessBorder }}>
                  {sps.length - assignedSpIds.size} addable
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <input
                  value={quickStaffingQuery}
                  onChange={(event) => {
                    setQuickStaffingQuery(event.target.value);
                    setQuickStaffingSpId("");
                  }}
                  placeholder="Search name, email, schedule, phone..."
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box", background: "#ffffff" }}
                />
                <select
                  value={quickStaffingSpId}
                  onChange={(event) => setQuickStaffingSpId(event.target.value)}
                  disabled={saving || quickStaffingOptions.length === 0}
                  style={{ ...selectStyle, width: "100%", maxWidth: "none", background: "#ffffff" }}
                >
                  <option value="">
                    {quickStaffingOptions.length === 0 ? "No addable SPs match" : "Select SP"}
                  </option>
                  {quickStaffingOptions.map((sp) => {
                    const email = getEmail(sp);
                    const scheduleName = asText(sp.schedule_name);
                    return (
                      <option key={`quick-add-${sp.id}`} value={sp.id}>
                        {[getFullName(sp), scheduleName, email, sp.phone].map(asText).filter(Boolean).join(" - ")}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() => void handleQuickStaffingAdd("confirmed")}
                  disabled={saving || !quickStaffingSpId}
                  style={{ ...buttonStyle, padding: "9px 12px", opacity: saving || !quickStaffingSpId ? 0.65 : 1, whiteSpace: "nowrap" }}
                >
                  Add Primary
                </button>
                <button
                  type="button"
                  onClick={() => void handleQuickStaffingAdd("backup")}
                  disabled={saving || !quickStaffingSpId}
                  style={{ ...staffingSecondaryButtonStyle, padding: "9px 12px", opacity: saving || !quickStaffingSpId ? 0.65 : 1, whiteSpace: "nowrap" }}
                >
                  Add Backup
                </button>
              </div>

              <input
                ref={staffingDocInputRef}
                type="file"
                accept={staffingDocumentAccept}
                onChange={(event) => {
                  void handleTrainingMaterialUpload("staffing_doc", event.target.files?.[0] || null);
                  event.currentTarget.value = "";
                }}
                style={{ display: "none" }}
              />
              <div
                style={{
                  border: `1px solid ${staffingWorkspacePalette.border}`,
                  borderRadius: "14px",
                  padding: "10px 12px",
                  background: "linear-gradient(135deg, rgba(236, 253, 245, 0.76) 0%, rgba(239, 248, 252, 0.94) 54%, rgba(255, 255, 255, 0.96) 100%)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...statLabel, color: staffingWorkspacePalette.textStrong }}>Upload Staffing Doc</div>
                  <div
                    style={{
                      marginTop: "4px",
                      color: staffingWorkspacePalette.textMuted,
                      fontWeight: 700,
                      fontSize: "12px",
                      lineHeight: 1.45,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {staffingDocUrl ? staffingDocName : "Quick utility for PDF, DOCX, XLSX, or CSV support materials."}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  {staffingDocUrl ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          openMaterialPreview({
                            title: "Staffing Doc",
                            rawUrl: staffingDocUrl,
                            storagePath: staffingDocStoragePath,
                            fileName: staffingDocName,
                          })
                        }
                        style={{ ...staffingSecondaryButtonStyle, padding: "7px 10px", fontSize: "12px" }}
                      >
                        Preview
                      </button>
                      <a
                        href={
                          buildTrainingMaterialAssetUrls({
                            eventId: id,
                            rawUrl: staffingDocUrl,
                            storagePath: staffingDocStoragePath,
                            fileName: staffingDocName,
                          }).downloadUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                        download={staffingDocName}
                        style={{
                          ...staffingSecondaryButtonStyle,
                          display: "inline-flex",
                          alignItems: "center",
                          textDecoration: "none",
                          padding: "7px 10px",
                          fontSize: "12px",
                        }}
                      >
                        Download
                      </a>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openTrainingMaterialPicker("staffing_doc")}
                    disabled={staffingDocBusy}
                    style={{
                      ...buttonStyle,
                      padding: "7px 10px",
                      fontSize: "12px",
                      boxShadow: "0 8px 16px rgba(14, 165, 233, 0.14)",
                      opacity: staffingDocBusy ? 0.65 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {staffingDocBusy ? "Uploading..." : staffingDocUrl ? "Replace" : "Upload Staffing Doc"}
                  </button>
                </div>
              </div>
            </section>

            <details
              open={staffingOverviewOpen}
              onToggle={(event) => setStaffingOverviewOpen(event.currentTarget.open)}
              style={staffingPanelStyle}
            >
              <summary style={staffingSummaryStyle}>
                Staffing Overview
              </summary>
              <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: "8px",
                  }}
                >
                  {[
                    { label: "Needed", value: needed, tone: "var(--cfsp-text)" },
                    { label: "Confirmed", value: confirmedCount, tone: "#047857" },
                    { label: "Backup", value: backupCount, tone: "#2563eb" },
                    { label: "Shortage", value: shortageCount, tone: shortageCount > 0 ? "var(--cfsp-danger)" : "var(--cfsp-text-muted)" },
                    { label: "Available", value: availablePollResponders.length, tone: "#047857" },
                    { label: "Maybe", value: maybePollResponders.length, tone: "var(--cfsp-warning)" },
                  ].map((item) => (
                    <div key={item.label} style={staffingMetricCardStyle}>
                      <div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>{item.label}</div>
                      <div style={{ ...statValue, color: item.tone }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(220px, 1fr) minmax(220px, 1fr)",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      borderRadius: "14px",
                      padding: "10px 12px",
                      background:
                        coverageRiskTone === "green"
                          ? planningSuccessCardBackground
                          : coverageRiskTone === "yellow"
                            ? "rgba(253, 230, 138, 0.14)"
                            : staffingWorkspacePalette.dangerBg,
                      border:
                        coverageRiskTone === "green"
                          ? planningSuccessBorder
                          : coverageRiskTone === "yellow"
                            ? "1px solid rgba(253, 230, 138, 0.2)"
                            : `1px solid ${staffingWorkspacePalette.dangerBorder}`,
                      color:
                        coverageRiskTone === "green"
                          ? planningSuccessText
                          : coverageRiskTone === "yellow"
                            ? "#fde68a"
                            : staffingWorkspacePalette.dangerText,
                    }}
                  >
                    <div style={{ ...statLabel, color: "inherit" }}>Coverage Health</div>
                    <div style={{ marginTop: "4px", fontSize: "17px", fontWeight: 900 }}>
                      {coverageRiskTone === "green" ? "Covered" : coverageRiskTone === "yellow" ? "At risk" : "Understaffed"}
                    </div>
                    <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "13px" }}>{staffingHealthLabel}</div>
                  </div>
                  <div style={staffingMetricCardStyle}>
                    <div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Operational Summary</div>
                    <div style={{ marginTop: "4px", color: coverageRiskTone === "green" ? planningSuccessText : staffingWorkspacePalette.textStrong, fontWeight: 800, fontSize: "13px" }}>
                      {coverageRiskTone === "green" ? staffingHealthLabel : `Short by ${Math.max(needed - selectedStaffingCount, 0)}`}
                    </div>
                    <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "12px" }}>
                      {maybePollResponders.length
                        ? `Backup coverage available from ${maybePollResponders.length} maybe responder${maybePollResponders.length === 1 ? "" : "s"}.`
                        : "No backup responses yet."}
                    </div>
                    <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "12px" }}>
                      Poll response rate: {pollResponseRate}%
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <div style={staffingMutedTextStyle}>
                    {selectedStaffingCount} selected · {confirmedCount} primary confirmed · {backupCount} backup · {assignedBccEmails.length} email{assignedBccEmails.length === 1 ? "" : "s"} ready
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <input
                      ref={pollImportInputRef}
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(event) => void handlePollImportFile(event.target.files?.[0] || null)}
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleConfirmAllAssignments()}
                      disabled={saving || sortedAssignments.length === 0}
                      style={{ ...buttonStyle, padding: "8px 11px", boxShadow: "0 8px 16px rgba(14, 165, 233, 0.16)", opacity: saving || sortedAssignments.length === 0 ? 0.65 : 1 }}
                    >
                      Confirm All Selected SPs
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenAvailabilityRequest()}
                      disabled={assignedBccEmails.length === 0}
                      style={{ ...buttonStyle, padding: "8px 11px", boxShadow: "0 8px 16px rgba(14, 165, 233, 0.16)", opacity: assignedBccEmails.length === 0 ? 0.65 : 1 }}
                    >
                      Draft Hiring Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEmailDraft((current) => !current)}
                      style={{
                        ...staffingSecondaryButtonStyle,
                        padding: "8px 11px",
                      }}
                    >
                      {showEmailDraft ? "Hide Email Preview" : "Show Email Preview"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCandidatePool((current) => !current)}
                      style={{ ...staffingSecondaryButtonStyle, padding: "8px 11px", opacity: saving ? 0.65 : 1 }}
                    >
                      {showCandidatePool ? "Hide Candidate SPs" : "Browse Candidate SPs"}
                    </button>
                    <button
                      type="button"
                      onClick={() => pollImportInputRef.current?.click()}
                      disabled={pollImportSaving}
                      style={{ ...staffingSecondaryButtonStyle, padding: "8px 11px", opacity: pollImportSaving ? 0.65 : 1 }}
                    >
                      {pollImportSaving ? "Uploading..." : "Upload Poll Results"}
                    </button>
                    <button
  type="button"
  onClick={() => {
    setPollImportDebugInfo(null);
    void persistPollMetadata(
      {
        importedPollResponses: "",
        pollImportCreatedAt: "",
        pollImportSource: "",
      },
      "Cleared imported poll results."
    );
  }}
  style={{
    ...dangerButtonStyle,
    padding: "8px 11px",
  }}
>
  Clear Poll Results
</button>
                  </div>
                </div>

                {pollImportError ? (
                  <div className="cfsp-alert cfsp-alert-error">{pollImportError}</div>
                ) : null}

                {importedPollResponses.length ? (
                  <div
                    style={{
                      ...staffingMetricCardStyle,
                      padding: "12px 14px",
                      border: importedPollResponseSummary.unmatchedCount > 0 ? `1px solid ${staffingWorkspacePalette.borderStrong}` : staffingMetricCardStyle.border,
                    }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Imported Poll Results</div>
                        <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textStrong, fontWeight: 800, fontSize: "13px" }}>
                          {pollMetadata.pollImportSource || "Microsoft Forms"} · {formatUploadedTimestamp(pollMetadata.pollImportCreatedAt)}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                        gap: "8px",
                        marginTop: "10px",
                      }}
                    >
                      <div style={staffingMetricCardStyle}><div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Available for Event</div><div style={{ ...statValue, color: "#0f766e" }}>{importedPollResponseSummary.availableCount}</div></div>
                      <div style={staffingMetricCardStyle}><div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Maybe / Backup</div><div style={{ ...statValue, color: "#b45309" }}>{importedPollResponseSummary.maybeCount}</div></div>
                      <div style={staffingMetricCardStyle}><div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Not Available</div><div style={{ ...statValue, color: staffingWorkspacePalette.dangerText }}>{importedPollResponseSummary.notAvailableCount}</div></div>
                      <div style={staffingMetricCardStyle}><div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>No Match Found</div><div style={{ ...statValue, color: staffingWorkspacePalette.textMuted }}>{importedPollResponseSummary.unmatchedCount}</div></div>
                    </div>

                    <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                      {[
                        {
                          label: "Available for Event",
                          items: importedResponderEntries.filter((entry) => entry.pollResponseStatus === "available"),
                        },
                        {
                          label: "Maybe / Backup",
                          items: importedResponderEntries.filter((entry) => entry.pollResponseStatus === "maybe"),
                        },
                      ].map((group) =>
                          group.items.length ? (
                            <div key={group.label} style={{ display: "grid", gap: "8px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ ...statLabel, color: staffingWorkspacePalette.textStrong }}>{group.label}</div>
                                <span style={staffingSelectedChipStyle}>{group.items.length}</span>
                              </div>

                              {group.items.map((entry) => {
                                const importedResponse = importedPollResponsesBySpId.get(String(entry.sp.id));
                                const note = importedResponse?.responseNote || "";
                                const responseSummary =
                                  importedResponse?.rawAnswer ||
                                  (entry.pollResponseStatus === "available"
                                    ? "Available"
                                    : entry.pollResponseStatus === "maybe"
                                      ? "Maybe / Need to discuss"
                                      : "No clear response");

                                return (
                                  <div key={`${group.label}-${entry.sp.id}`} style={staffingRowCardStyle}>
                                    <div style={{ display: "grid", gap: "4px" }}>
                                      <div style={{ color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>
                                        {getFullName(entry.sp)}
                                      </div>

                                      <div style={{ color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "12px" }}>
                                        {getEmail(entry.sp) || "No email provided"}
                                      </div>

                                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                                        <span style={staffingSelectedChipStyle}>{responseSummary}</span>
                                        <span style={staffingSelectedChipStyle}>
                                          {importedResponse?.matchType === "name" ? "Name matched" : "Email matched"}
                                        </span>
                                        {entry.assignmentStatus ? (
                                          <span style={staffingSelectedChipStyle}>
                                            {getPlanningStaffingPresenceLabel(entry.assignmentStatus)}
                                          </span>
                                        ) : null}
                                      </div>

                                      {note ? (
                                        <div style={{ marginTop: "6px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "12px" }}>
                                          Notes: {note}
                                        </div>
                                      ) : null}
                                    </div>

                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                                      {group.label === "Available for Event" ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              entry.assignment
                                                ? void handleStatusChange(entry.assignment, "confirmed")
                                                : void handleAddAssignment(entry.sp.id, {
                                                    status: "confirmed",
                                                    confirmed: true,
                                                    notes: entry.importedResponse?.responseNote,
                                                    successMessage: "Responder confirmed as primary.",
                                                  })
                                            }
                                            disabled={saving || entry.assignmentStatus === "confirmed"}
                                            style={{ ...buttonStyle, padding: "7px 10px", opacity: saving || entry.assignmentStatus === "confirmed" ? 0.65 : 1 }}
                                          >
                                            {entry.assignmentStatus === "confirmed" ? "Confirmed Primary" : "Confirm Primary"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handleMarkImportedBackup(entry.sp.id)}
                                            disabled={saving || entry.assignmentStatus === "backup"}
                                            style={{ ...staffingSecondaryButtonStyle, padding: "7px 10px", opacity: saving || entry.assignmentStatus === "backup" ? 0.65 : 1 }}
                                          >
                                            {entry.assignmentStatus === "backup" ? "Backup Confirmed" : "Confirm Backup"}
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => void handleMarkImportedBackup(entry.sp.id)}
                                          disabled={saving || entry.assignmentStatus === "backup"}
                                          style={{ ...staffingSecondaryButtonStyle, padding: "7px 10px", opacity: saving || entry.assignmentStatus === "backup" ? 0.65 : 1 }}
                                        >
                                          {entry.assignmentStatus === "backup" ? "Backup Confirmed" : "Move to Backup"}
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => void handleExcludeImportedResponder(entry.sp.id, getEmail(entry.sp))}
                                        style={{ ...dangerButtonStyle, padding: "7px 10px" }}
                                      >
                                        Ignore
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null
                        )}

                        {unmatchedImportedPollResponses.length && !pollImportIgnoredUnmatched ? (
                          <details
                            style={{
                              border: `1px solid ${staffingWorkspacePalette.border}`,
                              borderRadius: "12px",
                              padding: "10px 12px",
                              background: "rgba(247, 251, 255, 0.78)",
                            }}
                          >
                            <summary style={{ cursor: "pointer", color: staffingWorkspacePalette.textStrong, fontWeight: 800 }}>
                              No Match Found ({unmatchedImportedPollResponses.length})
                            </summary>
                            <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                              {unmatchedImportedPollResponses.map((entry, index) => (
                                <div key={`unmatched-import-${index}`} style={staffingRowCardStyle}>
                                  <div style={{ color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>
                                    {entry.name || "Unnamed responder"}
                                  </div>
                                  <div style={{ color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "12px" }}>
                                    {[entry.email || "No email provided", entry.responseLabel || "Unknown response"].join(" · ")}
                                  </div>
                                  {entry.rawAnswer ? (
                                    <div style={{ color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "12px" }}>
                                      Response: {entry.rawAnswer}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <button
                                  type="button"
                                  onClick={() => setPollImportIgnoredUnmatched(true)}
                                  style={{ ...staffingSecondaryButtonStyle, padding: "7px 10px" }}
                                >
                                  Ignore
                                </button>
                              </div>
                            </div>
                          </details>
                        ) : null}

                      {pollImportDebugInfo ? (
                        <details
                          style={{
                            border: "1px dashed rgba(125, 211, 252, 0.22)",
                            borderRadius: "12px",
                            padding: "10px 12px",
                            background: "rgba(238, 248, 252, 0.72)",
                          }}
                        >
                          <summary style={{ cursor: "pointer", color: staffingWorkspacePalette.textStrong, fontWeight: 800 }}>
                            Import Debug
                          </summary>
                          <div style={{ marginTop: "10px", display: "grid", gap: "8px", color: staffingWorkspacePalette.textMuted, fontSize: "12px", fontWeight: 700 }}>
                            <div>Detected headers: {pollImportDebugInfo.detectedHeaders.join(", ") || "None"}</div>
                            <div>Name header: {pollImportDebugInfo.matchedNameHeader || "Not detected"}</div>
                            <div>Email header: {pollImportDebugInfo.matchedEmailHeader || "Not detected"}</div>
                            <div>SP ID header: {pollImportDebugInfo.matchedSpIdHeader || "Not detected"}</div>
                            <div>Training response header: {pollImportDebugInfo.matchedTrainingResponseHeader || "Not detected"}</div>
                            <div>Event response header: {pollImportDebugInfo.matchedEventResponseHeader || "Not detected"}</div>
                            <div>Notes header: {pollImportDebugInfo.matchedNotesHeader || "Not detected"}</div>
                            <div>Response headers: {pollImportDebugInfo.matchedResponseHeaders.join(", ") || "Not detected"}</div>
                            {pollImportDebugInfo.sampleRows.length ? (
                              <pre
                                style={{
                                  margin: 0,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  color: staffingWorkspacePalette.textStrong,
                                  background: "rgba(255,255,255,0.82)",
                                  borderRadius: "10px",
                                  border: "1px solid rgba(125, 211, 252, 0.16)",
                                  padding: "10px 12px",
                                  fontSize: "11px",
                                }}
                              >
                                {JSON.stringify(pollImportDebugInfo.sampleRows, null, 2)}
                              </pre>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {showEmailDraft ? (
                  <div style={{ ...staffingMetricCardStyle, padding: "12px 14px" }}>
                    <div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Email Draft Preview</div>
                    <div style={{ marginTop: "8px", color: staffingWorkspacePalette.textStrong, lineHeight: 1.7 }}>
                      <div><strong>Recipients (BCC):</strong> {assignedBccEmails.length ? assignedBccEmails.join(", ") : "No selected staffing SP emails found."}</div>
                      <div style={{ marginTop: "8px" }}><strong>Subject:</strong> {emailSubject}</div>
                      <div style={{ marginTop: "8px", whiteSpace: "pre-wrap" }}><strong>Body:</strong>{"\n"}{emailBody}</div>
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { value: "all", label: `All (${sortedAssignments.length})` },
                    {
                      value: "confirmed",
                      label: `Primary (${sortedAssignments.filter((item) => getAssignmentStatus(item) === "confirmed").length})`,
                    },
                    {
                      value: "backup",
                      label: `Backup (${sortedAssignments.filter((item) => getAssignmentStatus(item) === "backup").length})`,
                    },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setAssignmentFilter(filter.value as AssignmentFilterStatus)}
                      style={{
                        ...buttonStyle,
                        background: assignmentFilter === filter.value ? "rgba(186, 230, 253, 0.28)" : staffingWorkspacePalette.buttonBg,
                        color: assignmentFilter === filter.value ? staffingWorkspacePalette.textStrong : staffingWorkspacePalette.textMuted,
                        border: assignmentFilter === filter.value ? "1px solid rgba(99, 181, 217, 0.28)" : `1px solid ${staffingWorkspacePalette.buttonBorder}`,
                        padding: "8px 12px",
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                {sortedAssignments.length === 0 ? (
                  <div
                    style={staffingEmptyStateStyle}
                  >
                    No selected staffing SPs yet.
                  </div>
                ) : filteredAssignments.length === 0 ? (
                  <div style={staffingEmptyStateStyle}>
                    No selected staffing SPs match the current filter.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {filteredAssignments.map((assignment) => {
                      const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
                      const status = getAssignmentStatus(assignment);
                      const email = sp ? getEmail(sp) : "";
                      const isConfirmed = status === "confirmed";
                      return (
                        <div
                          key={assignment.id}
                          style={staffingRowCardStyle}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1.5fr) minmax(150px, 190px) auto",
                              gap: "10px",
                              alignItems: "center",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>
                                {sp ? getFullName(sp) : "Unknown SP"}
                              </div>
                              <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "13px" }}>
                                {[email || assignment.sp_id || "No SP id", sp?.phone || ""].filter(Boolean).join(" · ")}
                              </div>
                              <div style={{ marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    ...commandChipStyle,
                                    background: email ? planningSuccessBackground : "rgba(248, 113, 113, 0.12)",
                                    color: email ? planningSuccessText : "#fecaca",
                                    border: email ? planningSuccessBorder : commandChipStyle.border,
                                  }}
                                >
                                  {email ? "Email ready" : "No email"}
                                </span>
                                <span
                                  style={{
                                    ...commandChipStyle,
                                    background: isConfirmed ? planningSuccessBackground : "rgba(73, 168, 255, 0.12)",
                                    color: isConfirmed ? planningSuccessText : "#bae6fd",
                                    border: isConfirmed ? planningSuccessBorder : commandChipStyle.border,
                                  }}
                                >
                                  {isConfirmed ? "Confirmed" : assignmentStatusLabels[status]}
                                </span>
                              </div>
                            </div>
                            <label style={{ display: "grid", gap: "6px", minWidth: 0 }}>
                              <span style={statLabel}>Status</span>
                              <select
                                value={status}
                                onChange={(e) => handleStatusChange(assignment, e.target.value as AssignmentStatus)}
                                disabled={saving}
                                style={{ ...selectStyle, width: "100%", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                              >
                                {assignmentStatuses.map((option) => (
                                  <option key={option} value={option}>
                                    {assignmentStatusLabels[option]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                onClick={() => void handleRemoveAssignment(assignment)}
                                disabled={saving}
                                style={{ ...dangerButtonStyle, opacity: saving ? 0.65 : 1, minWidth: "88px" }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                          <details
                            style={{
                              border: `1px solid ${staffingWorkspacePalette.border}`,
                              borderRadius: "12px",
                              background: "rgba(252, 254, 255, 0.94)",
                              padding: "8px 10px",
                            }}
                          >
                            <summary style={{ cursor: "pointer", color: staffingWorkspacePalette.textStrong, fontWeight: 800 }}>
                              Notes
                            </summary>
                            <div style={{ marginTop: "10px" }}>
                              <textarea
                                key={`${assignment.id}-${assignment.notes || ""}`}
                                defaultValue={assignment.notes || ""}
                                onBlur={(e) =>
                                  handleAssignmentDetailsChange(assignment, {
                                    notes: e.target.value.trim() || null,
                                  })
                                }
                                placeholder="Add optional notes..."
                                disabled={saving}
                                style={{ ...textareaStyle, minHeight: "76px" }}
                              />
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                )}

                {pollInviteOnlyAssignments.length > 0 ? (
                  <details
                    style={{
                      border: `1px solid ${staffingWorkspacePalette.border}`,
                      borderRadius: "14px",
                      padding: "10px 12px",
                      background: "rgba(241, 246, 250, 0.76)",
                    }}
                  >
                    <summary style={{ cursor: "pointer", color: staffingWorkspacePalette.textMuted, fontWeight: 800 }}>
                      View Poll Invite Archive ({pollInviteOnlyAssignments.length})
                    </summary>
                    <div style={{ marginTop: "8px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "12px", lineHeight: 1.6 }}>
                      These SPs were contacted for availability only. They are not counted as hired, confirmed, backup, or coverage unless manually confirmed later.
                    </div>
                    <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
                      {pollInviteOnlyAssignments.map((assignment) => {
                        const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
                        const email = sp ? getEmail(sp) : "";
                        const status = getAssignmentStatus(assignment);

                        return (
                          <div
                            key={`poll-archive-${assignment.id}`}
                            style={{
                              borderRadius: "12px",
                              border: `1px solid ${staffingWorkspacePalette.border}`,
                              padding: "10px 12px",
                              background: "rgba(250, 252, 255, 0.92)",
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1fr) auto",
                              gap: "8px",
                              alignItems: "center",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 800, color: staffingWorkspacePalette.textStrong }}>
                                {sp ? getFullName(sp) : "Unknown SP"}
                              </div>
                              <div style={{ marginTop: "3px", color: staffingWorkspacePalette.textMuted, fontSize: "13px", fontWeight: 700 }}>
                                {email || "No email"}
                              </div>
                              <div style={{ marginTop: "4px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    ...assignmentStatusStyles[status],
                                    borderRadius: "999px",
                                    padding: "4px 8px",
                                    fontSize: "11px",
                                    fontWeight: 900,
                                  }}
                                >
                                  {assignmentStatusLabels[status]}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(assignment, "confirmed")}
                                disabled={saving}
                                style={{ ...buttonStyle, padding: "6px 9px", fontSize: "12px", opacity: saving ? 0.65 : 1 }}
                              >
                                Mark Primary
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(assignment, "backup")}
                                disabled={saving}
                                style={{ ...staffingSecondaryButtonStyle, padding: "6px 9px", fontSize: "12px", opacity: saving ? 0.65 : 1 }}
                              >
                                Mark Backup
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleStatusChange(assignment, "declined")}
                                disabled={saving}
                                style={{ ...dangerButtonStyle, padding: "6px 9px", fontSize: "12px", opacity: saving ? 0.65 : 1 }}
                              >
                                Ignore
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ) : null}

                <div
                  style={{
                    border: `1px solid ${staffingWorkspacePalette.borderStrong}`,
                    borderRadius: "14px",
                    padding: "10px 12px",
                    background: "linear-gradient(180deg, rgba(238, 248, 252, 0.96) 0%, rgba(246, 250, 255, 0.98) 100%)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <div style={{ ...statLabel, color: staffingWorkspacePalette.textStrong }}>Candidate SP Pool</div>
                      <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "13px" }}>
                        Browse addable candidates only when you need more selected staffing coverage.
                      </div>
                    </div>
                  </div>

                  {showCandidatePool ? (
                    <div style={{ display: "grid", gap: "12px" }}>
                      <input
                        value={candidateQuery}
                        onChange={(event) => setCandidateQuery(event.target.value)}
                        placeholder="Search by name, email, phone, notes, roles, or preferences..."
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                      />
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {[
                          { label: "Active only", active: activeOnly, setActive: setActiveOnly },
                          { label: "Spanish-speaking", active: spanishOnly, setActive: setSpanishOnly },
                          { label: "Telehealth", active: telehealthOnly, setActive: setTelehealthOnly },
                          { label: "PT preferred", active: ptPreferredOnly, setActive: setPtPreferredOnly },
                          { label: "Available for event", active: availableForEventOnly, setActive: setAvailableForEventOnly },
                        ].map((filter) => (
                          <button
                            key={filter.label}
                            type="button"
                            onClick={() => filter.setActive((current) => !current)}
                            style={{
                              ...staffingSecondaryButtonStyle,
                              background: filter.active ? "rgba(186, 230, 253, 0.28)" : staffingWorkspacePalette.buttonBg,
                              color: filter.active ? staffingWorkspacePalette.textStrong : staffingWorkspacePalette.textMuted,
                              padding: "8px 12px",
                            }}
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                        <select
                          value={selectedSpId}
                          onChange={(e) => setSelectedSpId(e.target.value)}
                          style={{ ...selectStyle, background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                          disabled={saving || availableSps.length === 0}
                        >
                          <option value="">
                            {availableSps.length === 0 ? "No matching addable SPs" : "Quick select an SP"}
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
                          onClick={() => void handleAddAssignment()}
                          disabled={saving || !selectedSpId}
                          style={{ ...buttonStyle, boxShadow: "0 8px 16px rgba(14, 165, 233, 0.16)", opacity: saving || !selectedSpId ? 0.65 : 1 }}
                        >
                          {assigningSpId && assigningSpId === selectedSpId ? "Assigning..." : "Add Selected SP"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </details>

            <details
              open={spFinderMatchMakerOpen}
              onToggle={(event) => setSpFinderMatchMakerOpen(event.currentTarget.open)}
              style={staffingPanelStyle}
            >
              <summary style={staffingSummaryStyle}>
                SP Finder & Match Maker
              </summary>
              <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
                <div style={staffingMutedTextStyle}>
                  Match Maker helps narrow who to poll. It does not select SPs for staffing until you choose them.
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    { key: "finder", label: "Finder Mode" },
                    { key: "poll", label: "Poll Mode" },
                    { key: "responders", label: "Rank Responders Mode" },
                  ].map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => {
                        setMatchMakerMode(mode.key as "finder" | "poll" | "responders");
                        if (mode.key === "responders") setShowMatchMakerResults(true);
                      }}
                      style={{
                        ...staffingSecondaryButtonStyle,
                        background: matchMakerMode === mode.key ? "rgba(186, 230, 253, 0.28)" : staffingWorkspacePalette.buttonBg,
                        color: matchMakerMode === mode.key ? staffingWorkspacePalette.textStrong : staffingWorkspacePalette.textMuted,
                        border: matchMakerMode === mode.key ? "1px solid rgba(99, 181, 217, 0.28)" : `1px solid ${staffingWorkspacePalette.buttonBorder}`,
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {matchMakerMode === "finder" ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: "10px",
                      }}
                    >
                      <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                        <span style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Search</span>
                        <input
                          value={pollMatchKeyword}
                          onChange={(event) => setPollMatchKeyword(event.target.value)}
                          placeholder="Search SPs by name, email, notes, skills, role, campus..."
                          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Campus/location fit</span>
                        <select
                          value={pollMatchLocationFilter}
                          onChange={(event) => setPollMatchLocationFilter(event.target.value as PollLocationFilter)}
                          style={{ ...selectStyle, width: "100%", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                        >
                          <option value="any">Any location</option>
                          <option value="elkins_park">Elkins Park only</option>
                          <option value="center_city">Center City only</option>
                          <option value="virtual">Virtual/Telehealth only</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Role / patient fit</span>
                        <input
                          value={pollMatchRoleKeyword}
                          onChange={(event) => setPollMatchRoleKeyword(event.target.value)}
                          placeholder="Patient profile or role fit"
                          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Age range fit</span>
                        <input
                          value={pollMatchAgeKeyword}
                          onChange={(event) => setPollMatchAgeKeyword(event.target.value)}
                          placeholder="Adult, 40-50, teen..."
                          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Gender fit</span>
                        <select
                          value={pollMatchGenderFilter}
                          onChange={(event) => setPollMatchGenderFilter(event.target.value)}
                          style={{ ...selectStyle, width: "100%", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                        >
                          <option value="any">Any</option>
                          {uniquePollGenderOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Race / ethnicity fit</span>
                        <select
                          value={pollMatchRaceFilter}
                          onChange={(event) => setPollMatchRaceFilter(event.target.value)}
                          style={{ ...selectStyle, width: "100%", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                        >
                          <option value="any">Any</option>
                          {uniquePollRaceOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: "6px" }}>
                        <span style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Sort</span>
                        <select
                          value={pollMatchSort}
                          onChange={(event) => setPollMatchSort(event.target.value as PollMatchSort)}
                          style={{ ...selectStyle, width: "100%", background: "rgba(255, 255, 255, 0.96)", color: staffingWorkspacePalette.textStrong, border: `1px solid ${staffingWorkspacePalette.border}` }}
                        >
                          <option value="best_match">Best match</option>
                          <option value="name">Name A-Z</option>
                          <option value="email_ready">Email ready</option>
                          <option value="recently_responded">Recently responded</option>
                          <option value="assigned_last">Existing rows last</option>
                        </select>
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "end" }}>
                      {[
                        { label: "Active only", active: pollMatchActiveOnly, toggle: () => setPollMatchActiveOnly((current) => !current) },
                        { label: "Email ready only", active: pollMatchEmailReadyOnly, toggle: () => setPollMatchEmailReadyOnly((current) => !current) },
                        { label: "Available responders only", active: pollMatchAvailableRespondersOnly, toggle: () => setPollMatchAvailableRespondersOnly((current) => !current) },
                        { label: "Not already selected", active: pollMatchNotSelectedOnly, toggle: () => setPollMatchNotSelectedOnly((current) => !current) },
                        { label: "No existing event row", active: pollMatchNotAssignedOnly, toggle: () => setPollMatchNotAssignedOnly((current) => !current) },
                        { label: "Not excluded", active: pollMatchNotExcludedOnly, toggle: () => setPollMatchNotExcludedOnly((current) => !current) },
                        { label: "Spanish", active: pollMatchSpanishOnly, toggle: () => setPollMatchSpanishOnly((current) => !current) },
                        { label: "Virtual ready", active: pollMatchTelehealthOnly, toggle: () => setPollMatchTelehealthOnly((current) => !current) },
                      ].map((filter) => (
                        <button
                          key={filter.label}
                          type="button"
                          onClick={filter.toggle}
                          style={{
                            ...staffingSecondaryButtonStyle,
                            padding: "8px 12px",
                            background: filter.active ? "rgba(186, 230, 253, 0.28)" : staffingWorkspacePalette.buttonBg,
                            color: filter.active ? staffingWorkspacePalette.textStrong : staffingWorkspacePalette.textMuted,
                            border: filter.active ? "1px solid rgba(99, 181, 217, 0.28)" : `1px solid ${staffingWorkspacePalette.buttonBorder}`,
                          }}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleAddRecommendedToPoll}
                        disabled={recommendedPollMatches.filter((entry) => entry.emailReady).length === 0}
                        style={{ ...buttonStyle, boxShadow: "0 8px 16px rgba(14, 165, 233, 0.16)", opacity: recommendedPollMatches.filter((entry) => entry.emailReady).length === 0 ? 0.65 : 1 }}
                      >
                        Add Recommended to Poll
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTopPollCandidates(Math.max(needed, 1))}
                        disabled={pollMatchEntries.filter((entry) => entry.emailReady && !entry.selected && !entry.excluded).length === 0}
                        style={{ ...staffingSecondaryButtonStyle }}
                      >
                        Select Top Needed
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectTopPollCandidates(7)}
                        disabled={pollMatchEntries.filter((entry) => entry.emailReady && !entry.selected && !entry.excluded).length === 0}
                        style={{ ...staffingSecondaryButtonStyle }}
                      >
                        Select Top 7
                      </button>
                      <button
                        type="button"
                        onClick={handleAddAllFilteredToPoll}
                        disabled={pollMatchEntries.filter((entry) => entry.emailReady).length === 0}
                        style={{ ...staffingSecondaryButtonStyle, opacity: pollMatchEntries.filter((entry) => entry.emailReady).length === 0 ? 0.65 : 1 }}
                      >
                        Select All Filtered
                      </button>
                      <button
                        type="button"
                        onClick={clearPollSelection}
                        style={{ ...staffingSecondaryButtonStyle }}
                      >
                        Clear Selection
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExcludeSelectedPollCandidates()}
                        disabled={selectedPollSpIds.length === 0}
                        style={{ ...dangerButtonStyle, opacity: selectedPollSpIds.length === 0 ? 0.65 : 1 }}
                      >
                        Exclude Selected
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleResetPollExclusions()}
                        disabled={excludedPollSpIdsFromMetadata.length === 0 && excludedPollSpEmailsFromMetadata.length === 0}
                        style={{ ...staffingSecondaryButtonStyle, opacity: excludedPollSpIdsFromMetadata.length === 0 && excludedPollSpEmailsFromMetadata.length === 0 ? 0.65 : 1 }}
                      >
                        Reset Exclusions
                      </button>
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                      {pollMatchEntries.length ? (
                        pollMatchEntries.slice(0, candidateResultsLimit).map((entry) => (
                          <div
                            key={`poll-candidate-${entry.sp.id}`}
                            style={staffingRowCardStyle}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "auto minmax(0, 1.4fr) auto auto",
                                gap: "10px",
                                alignItems: "center",
                              }}
                            >
                              <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={entry.selected}
                                  onChange={() => handleTogglePollCandidate(entry.sp.id)}
                                  style={{ width: "16px", height: "16px", accentColor: "var(--cfsp-blue)" }}
                                />
                              </label>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>{getFullName(entry.sp)}</div>
                                <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "12px" }}>
                                  {entry.email || "No email on file"}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>{entry.matchLabel}</div>
                                <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontSize: "12px", fontWeight: 700 }}>
                                  Score {entry.matchScore}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {entry.selected ? <span style={staffingSelectedChipStyle}>Selected</span> : null}
                                {entry.excluded ? <span style={{ ...staffingSelectedChipStyle, background: "rgba(252, 165, 165, 0.14)", color: "#fecaca", border: "1px solid rgba(252, 165, 165, 0.18)" }}>Excluded</span> : null}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {entry.chips.map((chip) => (
                                <span
                                  key={`${entry.sp.id}-${chip}`}
                                  style={{
                                    borderRadius: "999px",
                                    padding: "4px 8px",
                                    fontSize: "11px",
                                    fontWeight: 900,
                                    background: staffingWorkspacePalette.chip,
                                    border: `1px solid ${staffingWorkspacePalette.chipBorder}`,
                                    color: staffingWorkspacePalette.chipText,
                                  }}
                                >
                                  {chip}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={staffingMutedTextStyle}>
                          No SPs match the current filters.
                        </div>
                      )}
                      {pollMatchEntries.length > 10 ? (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {candidateResultsLimit < pollMatchEntries.length ? (
                            <button
                              type="button"
                              onClick={() => setCandidateResultsLimit((current) => Math.min(current + 10, pollMatchEntries.length))}
                              style={{ ...staffingSecondaryButtonStyle }}
                            >
                              Load More
                            </button>
                          ) : null}
                          {candidateResultsLimit > 10 ? (
                            <button
                              type="button"
                              onClick={() => setCandidateResultsLimit(10)}
                              style={{ ...staffingSecondaryButtonStyle }}
                            >
                              Show Less
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {matchMakerMode === "poll" ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <div style={staffingMutedTextStyle}>
                        {pollSelectedCount} selected · {pollReadyEmailCount} email ready · {pollStatusDisplayLabel}
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" onClick={() => void handleCreatePoll()} disabled={pollSaving} style={{ ...buttonStyle, boxShadow: "0 8px 16px rgba(14, 165, 233, 0.16)", opacity: pollSaving ? 0.7 : 1 }}>
                          Create Poll
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDraftPollingEmail()}
                          disabled={pollSaving || pollSelectedCount === 0}
                          style={{ ...staffingSecondaryButtonStyle, opacity: pollSaving || pollSelectedCount === 0 ? 0.7 : 1 }}
                        >
                          Draft Polling Email
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMarkPollSent()}
                          disabled={pollSaving || pollSelectedCount === 0}
                          style={{ ...buttonStyle, background: planningSuccessBackground, color: planningSuccessText, border: planningSuccessBorder, boxShadow: "0 8px 16px rgba(16, 185, 129, 0.14)", opacity: pollSaving || pollSelectedCount === 0 ? 0.7 : 1 }}
                        >
                          Mark Poll Sent
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "10px",
                      }}
                    >
                      <div style={staffingMetricCardStyle}><div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Available</div><div style={{ ...statValue, color: "#0f766e" }}>{pollResponseSummary.availableCount}</div></div>
                      <div style={staffingMetricCardStyle}><div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Maybe</div><div style={{ ...statValue, color: "#b45309" }}>{pollResponseSummary.maybeCount}</div></div>
                      <div style={staffingMetricCardStyle}><div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>Not Available</div><div style={{ ...statValue, color: "#b91c1c" }}>{pollResponseSummary.notAvailableCount}</div></div>
                      <div style={staffingMetricCardStyle}><div style={{ ...statLabel, color: staffingWorkspacePalette.textMuted }}>No Response</div><div style={{ ...statValue, color: staffingWorkspacePalette.textMuted }}>{pollResponseSummary.noResponseCount}</div></div>
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                      {pollSelectedEntries.length ? (
                        pollSelectedEntries.slice(0, selectedPollRosterLimit).map((entry) => (
                          <div
                            key={`poll-selected-${entry.sp.id}`}
                            style={{ ...staffingRowCardStyle, display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}
                          >
                            <div>
                              <div style={{ color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>{getFullName(entry.sp)}</div>
                              <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontSize: "12px", fontWeight: 700 }}>
                                {entry.sp.working_email || entry.sp.email || "No email on file"}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                              <span style={staffingSelectedChipStyle}>
                                {entry.pollResponseStatus === "no_response"
                                  ? "No response"
                                  : entry.pollResponseStatus === "not_available"
                                    ? "Not available"
                                    : entry.pollResponseStatus === "available"
                                      ? "Available"
                                      : "Maybe"}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveFromPoll(entry.sp.id)}
                                style={{ ...dangerButtonStyle, padding: "7px 10px" }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={staffingMutedTextStyle}>
                          Select candidate SPs to start an in-app availability poll.
                        </div>
                      )}
                      {pollSelectedEntries.length > 10 ? (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {selectedPollRosterLimit < pollSelectedEntries.length ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPollRosterLimit((current) => Math.min(current + 10, pollSelectedEntries.length))}
                              style={{ ...staffingSecondaryButtonStyle }}
                            >
                              Load More
                            </button>
                          ) : null}
                          {selectedPollRosterLimit > 10 ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPollRosterLimit(10)}
                              style={{ ...staffingSecondaryButtonStyle }}
                            >
                              Show Less
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {matchMakerMode === "responders" ? (
                  !showMatchMakerResults && pollResponderEntries.length === 0 ? (
                    <div
                      style={{
                        borderRadius: "14px",
                      border: `1px dashed ${staffingWorkspacePalette.borderStrong}`,
                      background: "rgba(230, 245, 249, 0.82)",
                      padding: "14px",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>
                        Use Match Maker to find SPs to poll or rank poll responders.
                      </div>
                      <div style={{ marginTop: "4px", color: staffingWorkspacePalette.textMuted, fontWeight: 700, fontSize: "13px" }}>
                        Keep it optional until you want deterministic staffing suggestions.
                      </div>
                    </div>
                    <button type="button" onClick={() => setShowMatchMakerResults(true)} style={buttonStyle}>
                      Run Match Maker
                    </button>
                  </div>
                  ) : (
                  <>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleClearSuggestedAssignments}
                        style={{ ...staffingSecondaryButtonStyle }}
                      >
                        Clear Suggested Assignments
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {[
                        { value: "all", label: `All (${pollResponderEntries.length})` },
                        { value: "available", label: `Available only (${availablePollResponders.length})` },
                        { value: "confirmed", label: `Confirmed only (${availablePollResponders.filter((entry) => entry.isConfirmed).length})` },
                        { value: "needs_outreach", label: `Needs outreach (${needsOutreachCount})` },
                        { value: "backup", label: `Backup candidates (${maybePollResponders.length})` },
                      ].map((filter) => (
                        <button
                          key={filter.value}
                          type="button"
                          onClick={() => setSuggestedAssignmentFilter(filter.value as SuggestedAssignmentFilter)}
                          style={{
                            ...buttonStyle,
                            padding: "8px 12px",
                            background: suggestedAssignmentFilter === filter.value ? "rgba(186, 230, 253, 0.28)" : staffingWorkspacePalette.buttonBg,
                            color: suggestedAssignmentFilter === filter.value ? staffingWorkspacePalette.textStrong : staffingWorkspacePalette.textMuted,
                            border:
                              suggestedAssignmentFilter === filter.value
                                ? "1px solid rgba(99, 181, 217, 0.28)"
                                : `1px solid ${staffingWorkspacePalette.buttonBorder}`,
                          }}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                      {suggestedAssignmentRows.length === 0 ? (
                        <div style={staffingMutedTextStyle}>
                          No responders match this staffing filter yet.
                        </div>
                      ) : (
                        suggestedAssignmentRows.slice(0, 10).map((entry) => {
                          const responseTone =
                            entry.pollResponseStatus === "available"
                              ? { background: planningSuccessBackground, color: planningSuccessText, border: planningSuccessBorder }
                              : entry.pollResponseStatus === "maybe"
                                ? assignmentStatusStyles.backup
                                : entry.pollResponseStatus === "not_available"
                                  ? assignmentStatusStyles.declined
                                  : assignmentStatusStyles.invited;
                          return (
                            <div
                              key={entry.sp.id}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(0, 1.5fr) auto",
                                gap: "10px",
                                alignItems: "center",
                                borderRadius: "14px",
                                padding: "10px 12px",
                                background: staffingWorkspacePalette.row,
                                border: `1px solid ${staffingWorkspacePalette.border}`,
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ color: staffingWorkspacePalette.textStrong, fontWeight: 900 }}>{getFullName(entry.sp)}</div>
                                <div style={{ marginTop: "4px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                  <span style={{ ...responseTone, borderRadius: "999px", padding: "5px 8px", fontSize: "11px", fontWeight: 900 }}>
                                    {entry.pollResponseStatus === "not_available"
                                      ? "Not Available"
                                      : entry.pollResponseStatus === "no_response"
                                        ? "No Response"
                                        : entry.pollResponseStatus === "available"
                                          ? "Available"
                                          : "Maybe"}
                                  </span>
                                  <span
                                    style={{
                                      ...availabilityMatchStyles[entry.availabilityMatch],
                                      borderRadius: "999px",
                                      padding: "5px 8px",
                                      fontSize: "11px",
                                      fontWeight: 900,
                                    }}
                                  >
                                    {availabilityMatchLabels[entry.availabilityMatch]}
                                  </span>
                                  {entry.assignmentStatus ? (
                                    <span
                                      style={{
                                        ...assignmentStatusStyles[entry.assignmentStatus],
                                        borderRadius: "999px",
                                        padding: "5px 8px",
                                        fontSize: "11px",
                                        fontWeight: 900,
                                      }}
                                    >
                                      {getPlanningStaffingPresenceLabel(entry.assignmentStatus)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {!entry.isAssigned && entry.pollResponseStatus !== "not_available" ? (
                                <button
                                  type="button"
                                  onClick={() => void handleAddAssignment(entry.sp.id)}
                                  disabled={saving}
                                  style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
                                >
                                  {assigningSpId === entry.sp.id ? "Assigning..." : "Assign"}
                                </button>
                              ) : (
                                <span style={{ color: staffingWorkspacePalette.textMuted, fontWeight: 800, fontSize: "12px" }}>
                                  {entry.isAssigned ? getPlanningStaffingPresenceLabel(entry.assignmentStatus) : "Do not assign"}
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                  )
                ) : null}
              </div>
            </details>
          </>
        )}
      </section>
    ) : null;

  const trainingAttendancePanel =
    canManageTrainingAttendance ? (
      <section
        style={{
          marginTop: "12px",
          border: "1px solid var(--cfsp-border)",
          borderRadius: "16px",
          background: "var(--cfsp-surface-muted)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--cfsp-border)",
          }}
        >
          <div>
            <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>Training Attendance</div>
            <div
              style={{
                marginTop: "4px",
                color: allAssignedCheckedIn ? "var(--cfsp-green)" : "var(--cfsp-text-muted)",
                fontSize: "13px",
                fontWeight: 800,
              }}
            >
              {allAssignedCheckedIn
                ? "Everyone assigned to this event is checked in."
                : "Check off SPs as they arrive for training."}
            </div>
          </div>
          <span
            style={{
              borderRadius: "999px",
              padding: "6px 10px",
              background: allAssignedCheckedIn ? "var(--cfsp-green-soft)" : "rgba(168, 183, 204, 0.12)",
              border: allAssignedCheckedIn
                ? "1px solid rgba(44, 211, 173, 0.24)"
                : "1px solid var(--cfsp-border)",
              color: allAssignedCheckedIn ? "var(--cfsp-green)" : "var(--cfsp-text-muted)",
              fontSize: "12px",
              fontWeight: 900,
            }}
          >
            {attendedCount} / {sortedAssignments.length} checked in
          </span>
        </div>

        <div style={{ padding: "12px 16px 16px", display: "grid", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "8px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ color: "var(--cfsp-text-muted)", fontSize: "12px", fontWeight: 700 }}>
              Persisted per assigned SP and retained after refresh.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handleBulkTrainingAttendance("confirm_all")}
                disabled={attendanceSaving || trainingAttendanceFieldsMissing}
                style={{
                  ...buttonStyle,
                  padding: "8px 12px",
                  opacity: attendanceSaving || trainingAttendanceFieldsMissing ? 0.65 : 1,
                }}
              >
                Confirm all present
              </button>
              <button
                type="button"
                onClick={() => void handleBulkTrainingAttendance("clear_all")}
                disabled={attendanceSaving || trainingAttendanceFieldsMissing}
                style={{
                  ...dangerButtonStyle,
                  padding: "8px 12px",
                  opacity: attendanceSaving || trainingAttendanceFieldsMissing ? 0.65 : 1,
                }}
              >
                Clear attendance
              </button>
            </div>
          </div>

          {trainingAttendanceFieldsMissing ? (
            <div className="cfsp-alert cfsp-alert-error">
              Training attendance fields are missing from the event API response for one or more assigned SPs.
            </div>
          ) : null}
          {attendanceError ? (
            <div className="cfsp-alert cfsp-alert-error">{attendanceError}</div>
          ) : null}
          {attendanceSuccess ? (
            <div className="cfsp-alert cfsp-alert-info">{attendanceSuccess}</div>
          ) : null}
        </div>
      </section>
    ) : null;

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
          <p>{accessDenied ? "You do not have access to this event." : notFound ? "Event not found." : "Event not found."}</p>
          <Link href="/events" style={{ color: "#1d4ed8", fontWeight: 700 }}>
            Back to Events
          </Link>
        </div>
      </SiteShell>
    );
  }

  if (viewerRole === "sp") {
    const assignment = assignments[0] || null;
    const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
    const sessionSummary = rotationRounds.map((round, index) => {
      const dateLabel = round.session_date
        ? formatHumanDate(round.session_date, getImportedYearHint(event.date_text)) || round.session_date
        : "Date TBD";

      const timeLabel =
        round.start_time || round.end_time
          ? `${formatDisplayTime(round.start_time)}${round.end_time ? ` - ${formatDisplayTime(round.end_time)}` : ""}`
          : "Time TBD";

      return {
        key: round.key,
        dateLabel: `Round ${index + 1} · ${dateLabel}`,
        timeLabel,
        location: round.rooms.length
          ? `${round.rooms.length} room${round.rooms.length === 1 ? "" : "s"}`
          : event.location || "Rooms TBD",
      };
    });

    return (
      <SiteShell
        title="My Event Portal"
        subtitle="Review your assignment details, training access, materials, and communications without operational admin controls."
      >
        {errorMessage ? (
          <div className="cfsp-alert cfsp-alert-info">{errorMessage}</div>
        ) : null}

        {asText(spPortal?.sp_link_status).toLowerCase() !== "linked" ? (
          <div className="cfsp-alert cfsp-alert-info">
            Your SP account is awaiting directory matching. If anything looks missing, contact the simulation team.
          </div>
        ) : null}

        <section style={cardStyle}>
          <Link
            href="/events"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "var(--cfsp-blue)", fontWeight: 900, textDecoration: "none" }}
          >
            <span aria-hidden="true">←</span>
            <span>Back to My Events</span>
          </Link>

          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", marginTop: "14px" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "28px", color: "var(--cfsp-text)" }}>{event.name || "Assigned Event"}</h1>
              <div style={{ marginTop: "8px", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                <span className="cfsp-chip">{event.status || "Status pending"}</span>
                {assignmentStatus ? (
                  <span style={{ ...assignmentStatusStyles[assignmentStatus], borderRadius: "999px", padding: "6px 10px", fontSize: "12px", fontWeight: 900 }}>
                    {assignmentStatusLabels[assignmentStatus]}
                  </span>
                ) : null}
              </div>
            </div>
            <div style={{ display: "grid", gap: "6px", minWidth: "220px" }}>
              <div style={statLabel}>Assigned SP</div>
              <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                {spPortal?.assigned_sp_name || sps[0]?.full_name || me?.fullName || "SP account"}
              </div>
            </div>
          </div>
        </section>

        <section style={{ ...detailGridStyle, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div style={statCard}>
            <div style={statLabel}>Event dates</div>
            <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
              {sessionSummary.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>Date and time will appear here once published.</div>
              ) : (
                sessionSummary.map((entry) => (
                  <div key={entry.key} style={{ border: "1px solid var(--cfsp-border)", borderRadius: "12px", padding: "10px 12px", background: "var(--cfsp-surface)" }}>
                    <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>{entry.dateLabel}</div>
                    <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>{entry.timeLabel}</div>
                    <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>{entry.location}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Training access</div>
            <div style={{ marginTop: "8px", display: "grid", gap: "10px" }}>
              {spPortal?.zoom_url ? (
                <a href={spPortal.zoom_url} target="_blank" rel="noreferrer" className="cfsp-btn cfsp-btn-primary" style={{ textDecoration: "none", width: "fit-content" }}>
                  Open Zoom / Training Link
                </a>
              ) : (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>Zoom or virtual access has not been posted yet.</div>
              )}
              <div>
                <div style={statLabel}>Training password</div>
                <div style={{ marginTop: "4px", color: "var(--cfsp-text)", fontWeight: 900 }}>
                  {spPortal?.training_password || "Not posted"}
                </div>
              </div>
              {spPortal?.recording_url ? (
                <a href={spPortal.recording_url} target="_blank" rel="noreferrer" className="cfsp-btn cfsp-btn-secondary" style={{ textDecoration: "none", width: "fit-content" }}>
                  Open Recording Guide
                </a>
              ) : null}
            </div>
          </div>

          <div style={statCard}>
            <div style={statLabel}>Faculty / contacts</div>
            <div style={{ marginTop: "8px", display: "grid", gap: "8px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
              <div><strong style={{ color: "var(--cfsp-text)" }}>Faculty:</strong> {spPortal?.faculty_name || "Not posted"}</div>
              <div><strong style={{ color: "var(--cfsp-text)" }}>Program:</strong> {spPortal?.program || "Not posted"}</div>
              <div><strong style={{ color: "var(--cfsp-text)" }}>Email:</strong> {spPortal?.faculty_email || "Not posted"}</div>
              <div><strong style={{ color: "var(--cfsp-text)" }}>Phone:</strong> {spPortal?.faculty_phone || "Not posted"}</div>
              <div><strong style={{ color: "var(--cfsp-text)" }}>Sim team:</strong> {spPortal?.sim_contact || "Not posted"}</div>
            </div>
          </div>
        </section>

        <section style={cardStyle}>
          <div style={statLabel}>Training materials</div>
          <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
            {(spPortal?.materials || []).length === 0 ? (
              <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>Materials will appear here when they are shared with you.</div>
            ) : (
              (spPortal?.materials || []).map((material) => (
                <div key={material.key} style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center", border: "1px solid var(--cfsp-border)", borderRadius: "14px", padding: "12px 14px", background: "var(--cfsp-surface)" }}>
                  <div>
                    <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>{material.label}</div>
                    <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>{material.name || "Open file"}</div>
                  </div>
                  <a href={material.url} target="_blank" rel="noreferrer" className="cfsp-btn cfsp-btn-secondary" style={{ textDecoration: "none" }}>
                    Open
                  </a>
                </div>
              ))
            )}
          </div>
        </section>
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

      {sessionErrorMessage ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fed7aa",
            background: "#fff7ed",
            color: "#9a3412",
            fontWeight: 700,
          }}
        >
          Session warning: {sessionErrorMessage}. Falling back to event date text.
        </div>
      ) : null}

      {availabilityErrorMessage ? (
        <div
          style={{
            ...cardStyle,
            borderColor: "#fed7aa",
            background: "#fff7ed",
            color: "#9a3412",
            fontWeight: 700,
          }}
        >
          Availability warning: {availabilityErrorMessage}
        </div>
      ) : null}

      <details open style={cardStyle}>
        <summary style={{ cursor: "pointer", color: "var(--cfsp-text)", fontWeight: 900, fontSize: "20px" }}>
          {isTrainingMode ? "Training Command Center" : "Coverage Actions"}
        </summary>
        <div style={{ marginTop: "12px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <Link
              href="/events"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--cfsp-blue)",
                fontWeight: 900,
                textDecoration: "none",
              }}
            >
              <span aria-hidden="true">←</span>
              <span>Back to Events</span>
            </Link>

            <div style={segmentedGroupStyle} aria-label="Event type">
              <span style={getEventTypeButtonStyle("skills", activeEventTypeSet.has("skills"))}>Skills</span>
              <span style={getEventTypeButtonStyle("sp", activeEventTypeSet.has("sp"))}>SP</span>
              <span style={getEventTypeButtonStyle("hifi", activeEventTypeSet.has("hifi"))}>HiFi</span>
              <span style={getEventTypeButtonStyle("training", activeEventTypeSet.has("training"))}>Training</span>
              <span style={getEventTypeButtonStyle("virtual", activeEventTypeSet.has("virtual"))}>Virtual</span>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              <h1 style={{ margin: 0, fontSize: "28px", color: "var(--cfsp-text)", lineHeight: 1.05 }}>
                {event.name || "Untitled Event"}
              </h1>
              <span
                style={{
                  ...assignmentStatusStyles[
                    (event.status || "").toLowerCase() === "confirmed" ? "confirmed" : "invited"
                  ],
                  borderRadius: "999px",
                  padding: "6px 10px",
                  fontWeight: 900,
                  fontSize: "12px",
                }}
              >
                {event.status || "No status"}
              </span>
              <span
                style={{
                  borderRadius: "999px",
                  padding: "6px 10px",
                  background: coverageStatus.background,
                  border: coverageStatus.border,
                  color: coverageStatus.color,
                  fontWeight: 900,
                  fontSize: "12px",
                }}
              >
                {coverageStatus.message}
              </span>
              <span
                style={{
                  ...skillsWorkshopBadgeStyle,
                  background: badgeAppearance.background,
                  border: `1px solid ${badgeAppearance.border}`,
                  color: badgeAppearance.color,
                }}
              >
                {eventMeta.primaryBadgeLabel}
              </span>
              {!isTrainingMode ? (
                <Link
                  href={`/events/${encodeURIComponent(id)}/schedule-builder`}
                  style={{
                    ...buttonStyle,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  Build Schedule
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setShowPushRelatedPanel((current) => !current);
                  setRelatedPushError("");
                  setRelatedPushSummary(null);
                  if (showPushRelatedPanel) {
                    setSelectedRelatedTargetIds([]);
                  }
                }}
                style={{
                  ...buttonStyle,
                  background: "var(--cfsp-button-secondary-bg)",
                  color: "var(--cfsp-button-secondary-text)",
                  border: "1px solid var(--cfsp-button-secondary-border)",
                }}
              >
                Push to Related Events
              </button>
            </div>
          </div>
        </div>

        {showPushRelatedPanel ? (
          <div
            style={{
              marginTop: "12px",
              border: "1px solid var(--cfsp-border-strong)",
              borderRadius: "18px",
              padding: "16px",
              background: "var(--cfsp-surface-muted)",
              display: "grid",
              gap: "14px",
            }}
          >
            <div>
              <div style={{ color: "var(--cfsp-text)", fontWeight: 900, fontSize: "20px" }}>
                Push to Related Events
              </div>
              <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700, lineHeight: 1.5 }}>
                This will update multiple events. Existing data will not be deleted.
              </div>
              <div style={{ marginTop: "6px", color: "var(--cfsp-warning)", fontWeight: 800, lineHeight: 1.5 }}>
                Only checked events will be updated.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: "12px",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                alignItems: "end",
              }}
            >
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Match Keyword</span>
                <input
                  value={relatedKeyword}
                  onChange={(event) => setRelatedKeyword(event.target.value)}
                  placeholder={defaultRelatedKeyword || "421"}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Must Include</span>
                <input
                  value={relatedMustInclude}
                  onChange={(event) => setRelatedMustInclude(event.target.value)}
                  placeholder="CTCN"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Exclude</span>
                <input
                  value={relatedExclude}
                  onChange={(event) => setRelatedExclude(event.target.value)}
                  placeholder="VIR"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "var(--cfsp-text)",
                  fontWeight: 800,
                }}
              >
                <input
                  type="checkbox"
                  checked={relatedExcludeCurrent}
                  onChange={(event) => setRelatedExcludeCurrent(event.target.checked)}
                />
                Exclude current event
              </label>

              <button
                type="button"
                onClick={() => void handlePreviewRelatedEvents()}
                disabled={relatedPreviewLoading}
                style={{ ...buttonStyle, opacity: relatedPreviewLoading ? 0.65 : 1 }}
              >
                {relatedPreviewLoading ? "Finding Matches..." : "Show Matching Events"}
              </button>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={statLabel}>Copy These Items</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(Object.keys(relatedCopyOptionLabels) as RelatedCopyOption[]).map((option) => {
                  const selected = relatedCopyOptions.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleToggleRelatedCopyOption(option)}
                      style={{
                        ...buttonStyle,
                        background: selected ? "var(--cfsp-blue)" : "var(--cfsp-surface)",
                        color: selected ? "#ffffff" : "var(--cfsp-text)",
                        border: selected ? "1px solid var(--cfsp-blue)" : "1px solid var(--cfsp-border)",
                        padding: "8px 12px",
                      }}
                    >
                      {relatedCopyOptionLabels[option]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <div style={statLabel}>
                Matching Events {relatedMatches.length ? `(${relatedMatches.length})` : ""}
              </div>
              <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                {relatedMatches.length} matching event{relatedMatches.length === 1 ? "" : "s"} found, {selectedRelatedTargetIds.length} selected
              </div>
              {relatedMatches.length === 0 ? (
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  {relatedPreviewLoading
                    ? "Looking for related events..."
                    : "Preview matches to review which events will be updated."}
                </div>
              ) : (
                <div style={{ display: "grid", gap: "8px" }}>
                  {relatedMatches.map((match) => (
                    <div
                      key={match.id}
                      style={{
                        border: "1px solid var(--cfsp-border)",
                        borderRadius: "12px",
                        background: selectedRelatedTargetIds.includes(match.id)
                          ? "var(--cfsp-surface-muted)"
                          : "var(--cfsp-surface)",
                        padding: "12px 14px",
                      }}
                    >
                      <label
                        style={{
                          display: "grid",
                          gap: "6px",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
                          <input
                            type="checkbox"
                            checked={selectedRelatedTargetIds.includes(match.id)}
                            onChange={() => handleToggleRelatedTarget(match.id)}
                          />
                          <span style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                            {match.name || "Untitled Event"}
                          </span>
                          {match.exact_course_match ? (
                            <span
                              style={{
                                borderRadius: "999px",
                                padding: "4px 8px",
                                background: "rgba(44, 211, 173, 0.14)",
                                border: "1px solid rgba(44, 211, 173, 0.22)",
                                color: "var(--cfsp-green)",
                                fontSize: "12px",
                                fontWeight: 900,
                              }}
                            >
                              Exact course match
                            </span>
                          ) : null}
                        </span>
                      </label>
                      <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontSize: "13px", fontWeight: 700 }}>
                        {[match.status || "No status", match.date_text || "Date TBD", match.location || "Location TBD"].join(" · ")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {relatedPushSummary ? (
              <div
                style={{
                  border: "1px solid rgba(44, 211, 173, 0.24)",
                  borderRadius: "14px",
                  padding: "14px",
                  background: "var(--cfsp-green-soft)",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div style={{ color: "var(--cfsp-green)", fontWeight: 900 }}>Push complete</div>
                <div style={{ color: "var(--cfsp-green)", fontWeight: 900 }}>Pushed successfully</div>
                <div style={{ color: "var(--cfsp-green)", fontWeight: 700 }}>
                  Updated events: {relatedPushSummary.updated_events.length}
                </div>
                {relatedPushSummary.copied_categories?.length ? (
                  <div style={{ color: "var(--cfsp-green)", fontWeight: 700, lineHeight: 1.5 }}>
                    {relatedPushSummary.copied_categories.map((category) => relatedCopyOptionLabels[category]).join(", ")} copied
                  </div>
                ) : null}
                <div style={{ color: "var(--cfsp-green)", fontWeight: 700 }}>
                  SPs copied: {relatedPushSummary.sps_copied}
                </div>
                <div style={{ color: "var(--cfsp-warning)", fontWeight: 700 }}>
                  Duplicates skipped: {relatedPushSummary.duplicates_skipped}
                </div>
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  Skipped events: {relatedPushSummary.skipped_events.length}
                </div>
                {relatedPushSummary.blank_source_fields?.length ? (
                  <div style={{ color: "var(--cfsp-warning)", fontWeight: 700, lineHeight: 1.5 }}>
                    Blank source fields skipped: {relatedPushSummary.blank_source_fields.join(", ")}
                  </div>
                ) : null}
              </div>
            ) : null}

            {relatedPushError ? (
              <div className="cfsp-alert cfsp-alert-error">{relatedPushError}</div>
            ) : null}

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handlePushToRelatedEvents()}
                disabled={relatedPushSaving || relatedMatches.length === 0 || relatedCopyOptions.length === 0 || selectedRelatedTargetIds.length === 0}
                style={{
                  ...buttonStyle,
                  opacity:
                    relatedPushSaving || relatedMatches.length === 0 || relatedCopyOptions.length === 0 || selectedRelatedTargetIds.length === 0
                      ? 0.65
                      : 1,
                }}
              >
                {relatedPushSaving ? "Pushing..." : "Push Selected Info"}
              </button>
              <button
                type="button"
                onClick={() => setShowPushRelatedPanel(false)}
                style={{
                  ...buttonStyle,
                  background: "var(--cfsp-button-secondary-bg)",
                  color: "var(--cfsp-button-secondary-text)",
                  border: "1px solid var(--cfsp-button-secondary-border)",
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {canRunLiveEventMode ? (
          <section
            style={{
              marginTop: "12px",
              border: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.2)" : "1px solid rgba(126, 231, 219, 0.22)",
              borderRadius: "18px",
              padding: "12px 14px",
              background: isPlanningVisualMode
                ? "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(237, 248, 251, 0.96) 100%)"
                : "linear-gradient(180deg, rgba(11, 23, 37, 0.96) 0%, rgba(10, 19, 31, 0.94) 100%)",
              boxShadow: isPlanningVisualMode ? "0 12px 28px rgba(42, 112, 140, 0.08)" : "none",
              display: "grid",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ ...statLabel, color: commandCenterVisual.labelColor }}>Command Center Mode</div>
                <div style={{ marginTop: "4px", color: commandCenterVisual.headingColor, fontSize: "18px", fontWeight: 900 }}>
                  {commandCenterMode === "live" ? "Live Event Mode" : "Planning Mode"}
                </div>
                <div style={{ marginTop: "4px", color: commandCenterVisual.mutedColor, fontSize: "13px", fontWeight: 700 }}>
                  Switch between planning workflows and a real-time operations board.
                </div>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  padding: "6px",
                  borderRadius: "999px",
                  border: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.2)" : "1px solid rgba(126, 231, 219, 0.18)",
                  background: isPlanningVisualMode ? "rgba(230, 245, 249, 0.9)" : "rgba(5, 16, 29, 0.82)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setCommandCenterMode("planning")}
                  style={{
                    ...buttonStyle,
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background:
                      commandCenterMode === "planning" ? "var(--cfsp-blue)" : "transparent",
                    color: commandCenterMode === "planning" ? "#ffffff" : commandCenterVisual.mutedColor,
                    border:
                      commandCenterMode === "planning"
                        ? "1px solid var(--cfsp-blue)"
                        : isPlanningVisualMode
                          ? "1px solid rgba(99, 181, 217, 0.2)"
                          : "1px solid rgba(148, 163, 184, 0.2)",
                  }}
                >
                  Planning Mode
                </button>
                <button
                  type="button"
                  onClick={() => setCommandCenterMode("live")}
                  style={{
                    ...buttonStyle,
                    padding: "8px 12px",
                    borderRadius: "999px",
                    background:
                      commandCenterMode === "live" ? "rgba(44, 211, 173, 0.18)" : "transparent",
                    color: commandCenterMode === "live" ? "#7ee7db" : commandCenterVisual.mutedColor,
                    border:
                      commandCenterMode === "live"
                        ? "1px solid rgba(44, 211, 173, 0.28)"
                        : isPlanningVisualMode
                          ? "1px solid rgba(99, 181, 217, 0.2)"
                          : "1px solid rgba(148, 163, 184, 0.2)",
                  }}
                >
                  Live Event Mode
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {liveCommandCenterPanel}

        <div
          style={{
            marginTop: "10px",
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "minmax(0, 1fr)",
            alignItems: "start",
          }}
        >
          <div
            style={{
              border: commandCenterVisual.shellBorder,
              borderRadius: "18px",
              padding: "14px",
              background: commandCenterVisual.shellBackground,
              boxShadow: commandCenterVisual.shellShadow,
            }}
          >
            <div style={{ ...statLabel, color: commandCenterVisual.labelColor }}>Event Summary</div>
            <div style={{ marginTop: "10px", display: "grid", gap: "10px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                {[
                  {
                    label: "Event Name",
                    value: event.name || "Untitled Event",
                    chips: [selectedModalityLabel || event.status || "Operational event"].filter(Boolean),
                  },
                  {
                    label: "Date / Time",
                    value: sessionSummaryLabel,
                    subvalue: summaryTimeLabel,
                    chips: [rotationRounds.length ? `${rotationRounds.length} rounds` : "Schedule pending"].slice(0, 1),
                  },
                  {
                    label: "Location",
                    value: event.location || "Location TBD",
                    chips: [trainingLocationModality].filter(Boolean).slice(0, 1),
                  },
                  {
                    label: "Staffing",
                    value: isTrainingMode
                      ? `${selectedStaffingCount} selected / ${confirmedCount} confirmed`
                      : `${selectedStaffingCount}/${needed || 0} selected`,
                    chips: [staffingHealthLabel, shortageCount > 0 ? `${shortageCount} open` : "Covered"].slice(0, 2),
                  },
                  {
                    label: "Status",
                    value: event.status || "No status",
                    chips: activeEventTypes.slice(0, 2).map((type) => editableEventTypeLabels[type] || type),
                  },
                ]
                  .filter((card) => !isPlanningVisualMode || ["Event Name", "Date / Time", "Location", "Staffing"].includes(card.label))
                  .map((card) => (
                  <div
                    key={card.label}
                    style={{
                      ...statCard,
                      minHeight: isPlanningVisualMode ? "104px" : "132px",
                      display: "grid",
                      alignContent: "space-between",
                      gap: isPlanningVisualMode ? "8px" : "10px",
                      background: commandCenterVisual.cardBackground,
                      border: commandCenterVisual.cardBorder,
                      boxShadow: isPlanningVisualMode ? "0 8px 18px rgba(42, 112, 140, 0.06)" : "none",
                    }}
                  >
                    <div>
                      <div style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>{card.label}</div>
                      <div style={{ ...statValue, fontSize: "18px", lineHeight: 1.25, color: commandCenterVisual.textColor }}>{card.value}</div>
                      {"subvalue" in card && card.subvalue ? (
                        <div style={{ marginTop: "6px", color: commandCenterVisual.mutedColor, fontSize: "12px", fontWeight: 700 }}>{card.subvalue}</div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {(card.chips || []).slice(0, 3).map((chip: string) => {
                        const successChip = isPlanningVisualMode && /\b(covered|coverage met|ready|stable)\b/i.test(chip);
                        return (
                          <span
                            key={`${card.label}-${chip}`}
                            style={{
                              ...commandChipStyle,
                              background: successChip ? commandCenterVisual.activeSoftBackground : commandCenterVisual.chipBackground,
                              color: successChip ? commandCenterVisual.activeSoftText : commandCenterVisual.chipText,
                              border: successChip ? planningSuccessBorder : isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.18)" : commandChipStyle.border,
                            }}
                          >
                            {chip}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {!isPlanningVisualMode ? (
                <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                {[
                  {
                    label: "Recording",
                    value: recordingStatus.label,
                    chips: [recordingStatus.chip],
                    accent: recordingStatus.tone,
                    indicator: recordingIndicatorActive ? (
                      <RecordingStatusIndicator
                        label={recordingIndicatorLabel}
                        hot={recordingIndicatorHot}
                        liveMode={!isPlanningVisualMode}
                        planningMode={isPlanningVisualMode}
                      />
                    ) : null,
                  },
                  {
                    label: "Event Modality",
                    value: eventModalityChips[0] || "Operational event",
                    chips: eventModalityChips.slice(1, 4),
                    accent: "#7dd3fc",
                  },
                  {
                    label: "Simulation Type",
                    value: simulationModalityChips[0] || "Operational Sim",
                    chips: simulationModalityChips.slice(1, 4),
                    accent: "#c4b5fd",
                  },
                  {
                    label: "Readiness",
                    value: operationalReadinessItems.primary,
                    chips: operationalReadinessItems.items.filter((item) => item.active).slice(0, 3).map((item) => item.label),
                    accent: operationalReadinessItems.primary === "Ready" ? "#86efac" : "#fde68a",
                  },
                  {
                    label: "Risk Level",
                    value: eventRiskLevel.label,
                    chips: [eventRiskLevel.detail],
                    accent:
                      eventRiskLevel.tone === "green"
                        ? "#86efac"
                        : eventRiskLevel.tone === "yellow"
                          ? "#fde68a"
                          : "#ff7a7a",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    style={{
                      ...statCard,
                      minHeight: "132px",
                      display: "grid",
                      alignContent: "space-between",
                      gap: "10px",
                      background: "linear-gradient(180deg, rgba(20, 37, 54, 0.94) 0%, rgba(21, 40, 58, 0.92) 100%)",
                      border: `1px solid ${card.accent}24`,
                    }}
                  >
                    <div>
                      <div style={statLabel}>{card.label}</div>
                      <div style={{ ...statValue, fontSize: "18px", lineHeight: 1.25, color: card.accent }}>{card.value}</div>
                      {"indicator" in card && card.indicator ? (
                        <div style={{ marginTop: "8px" }}>{card.indicator}</div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {card.chips.slice(0, 3).map((chip) => (
                        <span
                          key={`${card.label}-${chip}`}
                          style={{
                            ...commandChipStyle,
                            background: `${card.accent}24`,
                            color: card.accent,
                            maxWidth: "100%",
                          }}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "10px",
                }}
              >
                {[
                  {
                    label: "Communication",
                    value:
                      communicationStatusItems.filter((item) => item.active).length > 0
                        ? `${communicationStatusItems.filter((item) => item.active).length} active`
                        : "No active sends",
                    chips: communicationStatusItems.filter((item) => item.active).slice(0, 3).map((item) => item.label),
                    accent: "#7dd3fc",
                  },
                  {
                    label: "Materials",
                    value:
                      materialsStatusItems.filter((item) => item.active).length >= 4
                        ? "Operationally ready"
                        : materialsStatusLabel,
                    chips: materialsStatusItems.filter((item) => item.active).slice(0, 3).map((item) => item.label),
                    accent: "#86efac",
                  },
                  {
                    label: "Live Support",
                    value: liveSupportNeeds.length ? `${liveSupportNeeds.length} support flags` : "No support flags",
                    chips: (liveSupportNeeds.length ? liveSupportNeeds : [{ label: "No extra live support flagged" }]).slice(0, 3).map((item) => item.label),
                    accent: "#fcd34d",
                    indicator: recordingIndicatorActive ? (
                      <RecordingStatusIndicator
                        label={recordingIndicatorLabel}
                        compact
                        hot={recordingIndicatorHot}
                        liveMode={!isPlanningVisualMode}
                        planningMode={isPlanningVisualMode}
                      />
                    ) : null,
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    style={{
                      ...statCard,
                      minHeight: "120px",
                      display: "grid",
                      alignContent: "space-between",
                      gap: "10px",
                      background: "linear-gradient(180deg, rgba(20, 37, 54, 0.94) 0%, rgba(21, 40, 58, 0.92) 100%)",
                      border: `1px solid ${card.accent}24`,
                    }}
                  >
                    <div>
                      <div style={statLabel}>{card.label}</div>
                      <div style={{ ...statValue, fontSize: "18px", lineHeight: 1.25 }}>{card.value}</div>
                      {"indicator" in card && card.indicator ? (
                        <div style={{ marginTop: "8px" }}>{card.indicator}</div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {card.chips.map((chip) => (
                        <span key={`${card.label}-${chip}`} style={{ ...commandChipStyle, background: `${card.accent}24`, color: card.accent }}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
                </>
              ) : null}
            </div>

            {sessions.length ? (
              <div style={{ marginTop: "10px" }}>
                <div
                  style={{
                    position: "sticky",
                    top: "10px",
                    zIndex: 2,
                    marginBottom: "10px",
                    borderRadius: "16px",
                    border: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.18)" : "1px solid rgba(126, 231, 219, 0.18)",
                    background: isPlanningVisualMode ? "rgba(255, 255, 255, 0.94)" : "rgba(6, 17, 29, 0.9)",
                    backdropFilter: isPlanningVisualMode ? "none" : "blur(10px)",
                    boxShadow: isPlanningVisualMode ? "0 10px 24px rgba(42, 112, 140, 0.08)" : "none",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ ...statLabel, color: commandCenterVisual.labelColor }}>
                      {isPlanningVisualMode ? "Rotation Plan" : "Rotation Command Surface"}
                    </div>
                    <div style={{ marginTop: "4px", color: commandCenterVisual.headingColor, fontWeight: 900, fontSize: "16px" }}>
                      {event.name || "Untitled Event"}
                    </div>
                    <div style={{ marginTop: "4px", color: commandCenterVisual.mutedColor, fontWeight: 700, fontSize: "12px" }}>
                      {[sessionSummaryLabel, summaryTimeLabel].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ ...commandChipStyle, background: commandCenterVisual.chipBackground, color: commandCenterVisual.chipText, border: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.18)" : commandChipStyle.border }}>
                      {selectedRotationRound ? `Selected Round ${activeSelectedRotationRoundIndex + 1}` : "No round selected"}
                    </span>
                    <span style={{ ...commandChipStyle, background: commandCenterVisual.activeSoftBackground, color: commandCenterVisual.activeSoftText, border: isPlanningVisualMode ? "1px solid rgba(44, 211, 173, 0.2)" : commandChipStyle.border }}>
                      {roundCompanionView === "announcements"
                        ? "Announcements"
                        : roundCompanionView === "student"
                        ? "Student Schedule"
                        : roundCompanionView === "sp"
                          ? "SP Schedule"
                          : "Operations View"}
                    </span>
                  </div>
                </div>
                {hiddenExtraBackendRounds > 0 ? (
                  <div style={{ marginTop: "6px", color: "var(--cfsp-warning)", fontSize: "12px", fontWeight: 800 }}>
                    Extra backend room slots are hidden because learner capacity only requires {rotationRounds.length} rotation round{rotationRounds.length === 1 ? "" : "s"}.
                  </div>
                ) : null}
                <div
                  style={{
                    display: "grid",
                    gap: "12px",
                    marginTop: "8px",
                    gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                    alignItems: "start",
                    width: "100%",
                  }}
                >
                  <div style={{ display: "grid", gap: "6px" }}>
                    {rotationRounds.map((round, index) => {
                      const selected = selectedRotationRound?.key === round.key;
                      const roundLearnerCount =
                        metadataStudentCount > 0
                          ? Math.max(
                              0,
                              Math.min(round.rooms.length || metadataRoomCount || 0, metadataStudentCount - index * (round.rooms.length || metadataRoomCount || 0))
                            )
                          : null;
                      return (
                        <button
                          key={round.key}
                          type="button"
                          onClick={() => {
                            setSelectedRotationRoundKey(round.key);
                            setHasTouchedRoundCompanion(true);
                          }}
                          onMouseEnter={() => {
                            setSelectedRotationRoundKey(round.key);
                            setHasTouchedRoundCompanion(true);
                          }}
                          onFocus={() => {
                            setSelectedRotationRoundKey(round.key);
                            setHasTouchedRoundCompanion(true);
                          }}
                          style={{
                            borderRadius: "18px",
                            border: selected
                              ? isPlanningVisualMode
                                ? "1px solid rgba(44, 211, 173, 0.32)"
                                : "1px solid rgba(126, 231, 219, 0.42)"
                              : isPlanningVisualMode
                                ? "1px solid rgba(128, 167, 182, 0.22)"
                                : "1px solid rgba(148, 163, 184, 0.22)",
                            background: selected
                              ? isPlanningVisualMode
                                ? "linear-gradient(180deg, rgba(236, 253, 245, 0.96) 0%, rgba(230, 245, 249, 0.96) 100%)"
                                : "rgba(12, 45, 60, 0.96)"
                              : isPlanningVisualMode
                                ? "rgba(255, 255, 255, 0.96)"
                                : "rgba(15, 23, 42, 0.92)",
                            boxShadow: selected
                              ? isPlanningVisualMode
                                ? "0 10px 22px rgba(42, 112, 140, 0.08)"
                                : "0 12px 28px rgba(16, 185, 129, 0.14)"
                              : "none",
                            padding: isPlanningVisualMode ? "13px 15px" : "16px 18px",
                            display: "grid",
                            gap: "8px",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                            <div
                              style={{
                                fontSize: "1.2rem",
                                fontWeight: 800,
                                color: commandCenterVisual.headingColor,
                              }}
                            >
                              Round {index + 1}
                            </div>
                            {selected ? (
                              <span style={{ ...commandChipStyle, background: commandCenterVisual.activeSoftBackground, color: commandCenterVisual.activeSoftText, border: isPlanningVisualMode ? "1px solid rgba(44, 211, 173, 0.2)" : commandChipStyle.border }}>
                                Active detail view
                              </span>
                            ) : null}
                          </div>

                          <div
                            style={{
                              color: commandCenterVisual.mutedColor,
                              fontSize: "0.98rem",
                              fontWeight: 600,
                            }}
                          >
                            {formatRotationRoundLabel(round, importedYearHint)}
                          </div>

                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ ...commandChipStyle, background: commandCenterVisual.chipBackground, color: commandCenterVisual.chipText, border: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.18)" : commandChipStyle.border }}>
                              {round.rooms.length} rooms
                            </span>
                            {roundLearnerCount !== null ? (
                              <span style={{ ...commandChipStyle, background: commandCenterVisual.activeSoftBackground, color: commandCenterVisual.activeSoftText, border: isPlanningVisualMode ? "1px solid rgba(44, 211, 173, 0.2)" : commandChipStyle.border }}>
                                {roundLearnerCount} learners
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <aside
                    style={{
                      borderRadius: "18px",
                      border: commandCenterVisual.panelBorder,
                      background: commandCenterVisual.panelBackground,
                      padding: isPlanningVisualMode ? "16px" : "18px",
                      display: "grid",
                      gap: "14px",
                      position: "sticky",
                      top: "74px",
                      minHeight: "100%",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <div style={{ ...statLabel, color: commandCenterVisual.labelColor }}>
                          {isPlanningVisualMode ? "Round Details" : "Round Operations"}
                        </div>
                        <div style={{ marginTop: "4px", color: commandCenterVisual.headingColor, fontSize: "18px", fontWeight: 900 }}>
                          {selectedRotationRound ? `Round ${activeSelectedRotationRoundIndex + 1}` : "No round selected"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {[
                          { value: "announcements", label: "Announcements" },
                          { value: "student", label: "Student Schedule" },
                          { value: "sp", label: "SP Schedule" },
                          { value: "operations", label: "Operations View" },
                        ].map((view) => (
                          <button
                            key={view.value}
                            type="button"
                            onClick={() => setRoundCompanionView(view.value as RotationCompanionView)}
                            style={{
                              ...buttonStyle,
                              padding: "7px 10px",
                              background: roundCompanionView === view.value
                                ? isPlanningVisualMode
                                  ? "rgba(209, 250, 229, 0.46)"
                                  : "rgba(126, 231, 219, 0.18)"
                                : isPlanningVisualMode
                                  ? "rgba(255, 255, 255, 0.84)"
                                  : "rgba(15, 23, 42, 0.62)",
                              color: roundCompanionView === view.value
                                ? isPlanningVisualMode
                                  ? "#0f766e"
                                  : "#d6f6f2"
                                : commandCenterVisual.mutedColor,
                              border:
                                roundCompanionView === view.value
                                  ? isPlanningVisualMode
                                    ? "1px solid rgba(44, 211, 173, 0.24)"
                                    : "1px solid rgba(126, 231, 219, 0.32)"
                                  : isPlanningVisualMode
                                    ? "1px solid rgba(128, 167, 182, 0.2)"
                                    : "1px solid rgba(148, 163, 184, 0.18)",
                            }}
                          >
                            {view.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!hasTouchedRoundCompanion ? (
                      <div style={{ color: commandCenterVisual.mutedColor, fontWeight: 700, fontSize: "13px" }}>
                        Select a rotation round to view operational details.
                      </div>
                    ) : null}

                    {selectedRotationRound ? (
                      <>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                            gap: "10px",
                          }}
                        >
                          <div style={{ ...statCard, background: commandCenterVisual.rowBackground, border: commandCenterVisual.rowBorder }}>
                            <div style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Time Range</div>
                            <div style={{ ...statValue, color: commandCenterVisual.textColor, fontSize: "16px" }}>
                              {selectedRotationRound.start_time && selectedRotationRound.end_time
                                ? `${formatDisplayTime(selectedRotationRound.start_time)} - ${formatDisplayTime(selectedRotationRound.end_time)}`
                                : formatDisplayTime(selectedRotationRound.start_time || selectedRotationRound.end_time) || "Time TBD"}
                            </div>
                          </div>
                          <div style={{ ...statCard, background: commandCenterVisual.rowBackground, border: commandCenterVisual.rowBorder }}>
                            <div style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Rooms in Use</div>
                            <div style={{ ...statValue, color: commandCenterVisual.textColor, fontSize: "16px" }}>
                              {selectedRotationRound.rooms.length || metadataRoomCount || 0}
                            </div>
                          </div>
                          {roundCompanionView !== "sp" && selectedRoundLearnerCount !== null ? (
                            <div style={{ ...statCard, background: commandCenterVisual.rowBackground, border: commandCenterVisual.rowBorder }}>
                              <div style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Learners</div>
                              <div style={{ ...statValue, color: commandCenterVisual.textColor, fontSize: "16px" }}>
                                {selectedRoundLearnerCount}
                              </div>
                            </div>
                          ) : null}
                          {roundCompanionView === "operations" && selectedRoundEmptySlots !== null ? (
                            <div style={{ ...statCard, background: commandCenterVisual.rowBackground, border: commandCenterVisual.rowBorder }}>
                              <div style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Empty Slots</div>
                              <div style={{ ...statValue, color: commandCenterVisual.textColor, fontSize: "16px" }}>
                                {selectedRoundEmptySlots}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div style={{ display: "grid", gap: "8px" }}>
                          <div style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>
                            {roundCompanionView === "announcements"
                              ? "Announcements"
                              : roundCompanionView === "student"
                              ? "Student Schedule"
                              : roundCompanionView === "sp"
                                ? "SP Schedule"
                                : "Operations View"}
                          </div>
                          <div style={{ color: commandCenterVisual.mutedColor, fontSize: "13px", fontWeight: 700 }}>
                            {roundCompanionView === "announcements"
                              ? "Operational calling script for this rotation with timed prompts and follow-up blocks."
                              : roundCompanionView === "student"
                              ? "Learner-facing timing and follow-up blocks for this rotation."
                              : roundCompanionView === "sp"
                                ? "SP-facing rooms, staffing, and attached support blocks for this rotation."
                                : "Operational room, staffing, and schedule support details for this rotation."}
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: "8px" }}>
                          <div style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>
                            {roundCompanionView === "announcements"
                              ? "Announcement Timeline"
                              : roundCompanionView === "student"
                                ? "Learner Blocks"
                                : roundCompanionView === "sp"
                                  ? "SP Assignments"
                                  : "Round Operations"}
                          </div>
                          {roundCompanionView === "announcements" ? (
                            selectedRoundAnnouncementTimeline.length ? (
                              <div style={{ display: "grid", gap: "10px" }}>
                                {selectedRoundAnnouncementTimeline.map((entry) => {
                                  const draftValue = roundAnnouncementDrafts[entry.key] ?? entry.announcement;
                                  return (
                                    <div
                                      key={entry.key}
                                      style={{
                                        borderRadius: "12px",
                                        border: commandCenterVisual.rowBorder,
                                        background: commandCenterVisual.rowBackground,
                                        padding: "12px 14px",
                                        display: "grid",
                                        gap: "8px",
                                      }}
                                    >
                                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                        <div style={{ color: commandCenterVisual.textColor, fontWeight: 900 }}>{entry.timeLabel}</div>
                                        <span style={{ ...commandChipStyle, background: "rgba(126, 231, 219, 0.14)", color: "#7ee7db" }}>
                                          {entry.phaseLabel}
                                        </span>
                                      </div>
                                      {canManageRoundAnnouncements ? (
                                        <textarea
                                          value={draftValue}
                                          onChange={(event) =>
                                            setRoundAnnouncementDrafts((current) => ({
                                              ...current,
                                              [entry.key]: event.target.value,
                                            }))
                                          }
                                          style={{ ...textareaStyle, minHeight: "64px" }}
                                        />
                                      ) : (
                                        <div style={{ color: commandCenterVisual.textColor, fontWeight: 800 }}>{draftValue}</div>
                                      )}
                                      {entry.detail ? (
                                        <div style={{ color: commandCenterVisual.mutedColor, fontSize: "12px", fontWeight: 700 }}>{entry.detail}</div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                                {canManageRoundAnnouncements ? (
                                  <div style={{ color: commandCenterVisual.mutedColor, fontSize: "12px", fontWeight: 700 }}>
                                    Announcement edits stay local for now and are ready for future event-level persistence.
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div style={{ color: commandCenterVisual.mutedColor, fontWeight: 700, fontSize: "13px" }}>
                                Announcement timing is not available until this round has valid start and end times.
                              </div>
                            )
                          ) : roundCompanionView === "student" ? (
                            visibleSelectedRoundDayBlocks.length ? (
                              visibleSelectedRoundDayBlocks.map((block) => (
                                <div key={`${selectedRotationRound.key}-${block.label}`} style={{ borderRadius: "12px", border: commandCenterVisual.rowBorder, background: commandCenterVisual.rowBackground, padding: "10px 12px" }}>
                                  <div style={{ color: commandCenterVisual.textColor, fontWeight: 800 }}>{block.label}</div>
                                  <div style={{ marginTop: "4px", color: commandCenterVisual.mutedColor, fontSize: "12px", fontWeight: 700 }}>{block.detail}</div>
                                </div>
                              ))
                            ) : (
                              <div style={{ color: commandCenterVisual.mutedColor, fontWeight: 700, fontSize: "13px" }}>
                                No learner-facing schedule blocks recorded for this round.
                              </div>
                            )
                          ) : roundCompanionView === "sp" ? (
                            <div style={{ display: "grid", gap: "8px" }}>
                              {selectedRoundAssignments.length ? selectedRoundAssignments.map((entry, index) => (
                                <div key={`${selectedRotationRound.key}-sp-${index}`} style={{ borderRadius: "12px", border: commandCenterVisual.rowBorder, background: commandCenterVisual.rowBackground, padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                  <div>
                                    <div style={{ color: commandCenterVisual.textColor, fontWeight: 800 }}>{entry.roomName || `Room ${index + 1}`}</div>
                                    <div style={{ marginTop: "4px", color: commandCenterVisual.mutedColor, fontSize: "12px", fontWeight: 700 }}>
                                      {entry.sp ? getFullName(entry.sp) : "SP TBD"}
                                    </div>
                                  </div>
                                  {entry.assignment ? (
                                    <span style={{ ...commandChipStyle, background: "rgba(73, 168, 255, 0.12)", color: "#7dd3fc" }}>
                                      {assignmentStatusLabels[getAssignmentStatus(entry.assignment)]}
                                    </span>
                                  ) : null}
                                </div>
                              )) : (
                                <div style={{ color: commandCenterVisual.mutedColor, fontWeight: 700, fontSize: "13px" }}>
                                  No SP roster is attached to this round yet.
                                </div>
                              )}
                              {visibleSelectedRoundDayBlocks.length ? (
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                  {visibleSelectedRoundDayBlocks.map((block) => (
                                    <span key={`${selectedRotationRound.key}-sp-chip-${block.label}`} style={{ ...commandChipStyle, background: "rgba(126, 231, 219, 0.14)", color: "#7ee7db" }}>
                                      {block.label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div style={{ display: "grid", gap: "8px" }}>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                {selectedRotationRound.rooms.length ? selectedRotationRound.rooms.map((roomName) => (
                                  <span key={`${selectedRotationRound.key}-${roomName}`} style={{ ...commandChipStyle, background: "rgba(73, 168, 255, 0.12)", color: "#7dd3fc" }}>
                                    {roomName}
                                  </span>
                                )) : (
                                  <span style={{ ...commandChipStyle, background: "rgba(148, 163, 184, 0.16)", color: "#cbd5e1" }}>
                                    Rooms TBD
                                  </span>
                                )}
                              </div>
                              {selectedRoundAssignments.length ? selectedRoundAssignments.map((entry, index) => (
                                <div key={`${selectedRotationRound.key}-ops-${index}`} style={{ borderRadius: "12px", border: commandCenterVisual.rowBorder, background: commandCenterVisual.rowBackground, padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                  <div>
                                    <div style={{ color: commandCenterVisual.textColor, fontWeight: 800 }}>{entry.roomName || `Room ${index + 1}`}</div>
                                    <div style={{ marginTop: "4px", color: commandCenterVisual.mutedColor, fontSize: "12px", fontWeight: 700 }}>
                                      {entry.sp ? getFullName(entry.sp) : "SP TBD"}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    {entry.assignment ? (
                                      <span style={{ ...commandChipStyle, background: "rgba(73, 168, 255, 0.12)", color: "#7dd3fc" }}>
                                        {assignmentStatusLabels[getAssignmentStatus(entry.assignment)]}
                                      </span>
                                    ) : null}
                                    {entry.sp && getEmail(entry.sp) ? (
                                      <span style={{ ...commandChipStyle, background: "rgba(44, 211, 173, 0.14)", color: "#86efac" }}>
                                        Email ready
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              )) : null}
                              {visibleSelectedRoundDayBlocks.length ? (
                                <div style={{ display: "grid", gap: "8px" }}>
                                  {visibleSelectedRoundDayBlocks.map((block) => (
                                    <div key={`${selectedRotationRound.key}-ops-block-${block.label}`} style={{ borderRadius: "12px", border: commandCenterVisual.rowBorder, background: commandCenterVisual.rowBackground, padding: "10px 12px" }}>
                                      <div style={{ color: commandCenterVisual.textColor, fontWeight: 800 }}>{block.label}</div>
                                      <div style={{ marginTop: "4px", color: commandCenterVisual.mutedColor, fontSize: "12px", fontWeight: 700 }}>{block.detail}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ color: commandCenterVisual.mutedColor, fontWeight: 700, fontSize: "13px" }}>
                                  No attached day blocks for this round.
                                </div>
                              )}
                              {selectedRoundOperationsNotes.length ? (
                                <div style={{ borderRadius: "12px", border: "1px solid rgba(243, 187, 103, 0.22)", background: "rgba(243, 187, 103, 0.08)", padding: "10px 12px" }}>
                                  <div style={{ color: commandCenterVisual.textColor, fontWeight: 800 }}>Operations reminders</div>
                                  <div style={{ marginTop: "6px", display: "grid", gap: "6px" }}>
                                    {selectedRoundOperationsNotes.slice(0, 3).map((note, index) => (
                                      <div key={`${selectedRotationRound.key}-ops-note-${index}`} style={{ color: "#f7d9a2", fontSize: "12px", fontWeight: 700 }}>
                                        {note}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: commandCenterVisual.mutedColor, fontWeight: 700, fontSize: "13px" }}>
                        Select a rotation round to view operational details.
                      </div>
                    )}
                  </aside>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: "10px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                No structured sessions yet. Fallback date text: {formatEventDateText(event.date_text, importedYearHint)}
              </div>
            )}
          </div>

          <section
            style={{
              border: isPlanningVisualMode ? "1px solid rgba(99, 181, 217, 0.18)" : "1px solid rgba(61, 201, 184, 0.26)",
              borderRadius: "18px",
              padding: "14px",
              background: isPlanningVisualMode
                ? "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(241, 249, 252, 0.98) 100%)"
                : "linear-gradient(180deg, rgba(13, 37, 46, 0.96) 0%, rgba(12, 27, 41, 0.94) 100%)",
              boxShadow: isPlanningVisualMode ? "0 12px 28px rgba(42, 112, 140, 0.08)" : "0 16px 32px rgba(8, 20, 34, 0.28)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ ...statLabel, color: commandCenterVisual.labelColor }}>Faculty / Contact</div>
                <div style={{ marginTop: "4px", color: commandCenterVisual.headingColor, fontSize: "18px", fontWeight: 900 }}>
                  {trainingFacultyText || "Add faculty contact"}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <span style={commandChipStyle}>
                  {contactPanelSaving
                    ? "Saving"
                    : contactPanelSavedAt
                      ? `Saved ${formatUploadedTimestamp(contactPanelSavedAt)}`
                      : facultyReadinessComplete
                        ? "Ready"
                        : "Needs setup"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void saveFacultyContactFields(
                      {
                        faculty_names: trainingMetadata.faculty_names,
                        faculty_program: trainingMetadata.faculty_program,
                        faculty_email: trainingMetadata.faculty_email,
                        faculty_phone: trainingMetadata.faculty_phone,
                        sim_contact: trainingMetadata.sim_contact,
                        contact_internal_notes: trainingMetadata.contact_internal_notes,
                      },
                      "Faculty/contact saved."
                    )
                  }
                  disabled={contactPanelSaving}
                  style={{ ...buttonStyle, padding: "8px 12px", opacity: contactPanelSaving ? 0.65 : 1 }}
                >
                  Save Contact Panel
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Faculty name</span>
                <input
                  value={trainingMetadata.faculty_names}
                  onChange={(event) => handleTrainingMetadataChange("faculty_names", event.target.value)}
                  onBlur={(event) => void saveFacultyContactField("faculty_names", event.target.value)}
                  disabled={contactPanelSaving}
                  placeholder={fallbackFacultyText || "Faculty name"}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Program / course</span>
                <input
                  value={trainingMetadata.faculty_program}
                  onChange={(event) => handleTrainingMetadataChange("faculty_program", event.target.value)}
                  onBlur={(event) => void saveFacultyContactField("faculty_program", event.target.value)}
                  disabled={contactPanelSaving}
                  placeholder="Program or course"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Email</span>
                <input
                  value={trainingMetadata.faculty_email}
                  onChange={(event) => handleTrainingMetadataChange("faculty_email", event.target.value)}
                  onBlur={(event) => void saveFacultyContactField("faculty_email", event.target.value)}
                  disabled={contactPanelSaving}
                  placeholder="name@school.edu"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Phone</span>
                <input
                  value={trainingMetadata.faculty_phone}
                  onChange={(event) => handleTrainingMetadataChange("faculty_phone", event.target.value)}
                  onBlur={(event) => void saveFacultyContactField("faculty_phone", event.target.value)}
                  disabled={contactPanelSaving}
                  placeholder="Phone"
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                <span style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Sim team / event lead</span>
                <input
                  value={trainingMetadata.sim_contact}
                  onChange={(event) => handleTrainingMetadataChange("sim_contact", event.target.value)}
                  onBlur={(event) => void saveFacultyContactField("sim_contact", event.target.value)}
                  disabled={contactPanelSaving}
                  placeholder={simStaffNames.join(", ") || "Sim lead or event lead"}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                <span style={{ ...statLabel, color: commandCenterVisual.mutedColor }}>Internal notes</span>
                <textarea
                  value={trainingMetadata.contact_internal_notes}
                  onChange={(event) => handleTrainingMetadataChange("contact_internal_notes", event.target.value)}
                  onBlur={(event) => void saveFacultyContactField("contact_internal_notes", event.target.value, "Faculty notes saved.")}
                  disabled={contactPanelSaving}
                  placeholder="Internal context, escalation notes, or faculty preferences..."
                  style={{ ...textareaStyle, minHeight: "84px" }}
                />
              </label>
            </div>
          </section>
        </div>
        </div>
      </details>

      {isTrainingMode ? (
        <div
          style={{
            display: "grid",
            gap: "16px",
            alignItems: "start",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
          <div style={{ display: "grid", gap: "14px", minWidth: 0 }}>
            <section style={{ ...cardStyle, background: "var(--cfsp-surface-muted)", borderColor: "var(--cfsp-border)" }}>
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
                  <h2 style={compactSectionTitleStyle}>Training Overview</h2>
                  <p style={compactSectionHintStyle}>
                    Keep prep details visible without scheduling detours or editor-heavy clutter.
                  </p>
                </div>
                <span style={commandChipStyle}>{facultyReadinessComplete ? "Prep ready" : "Prep in progress"}</span>
              </div>

              <div
                style={{
                  ...detailGridStyle,
                  marginTop: "14px",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                }}
              >
                <div style={statCard}>
                  <div style={statLabel}>Date</div>
                  <div style={{ ...statValue, fontSize: "15px" }}>{sessionSummaryLabel || "Date TBD"}</div>
                </div>
                <div style={statCard}>
                  <div style={statLabel}>Time</div>
                  <div style={{ ...statValue, fontSize: "15px" }}>{summaryTimeLabel || "Time TBD"}</div>
                </div>
                <div style={statCard}>
                  <div style={statLabel}>Location / Modality</div>
                  <div style={{ ...statValue, fontSize: "15px" }}>{trainingLocationModality}</div>
                </div>
                <div style={statCard}>
                  <div style={statLabel}>Zoom Status</div>
                  <div style={{ ...statValue, fontSize: "15px" }}>
                    {trainingMetadata.zoom_url ? "Ready" : eventMeta.isVirtualSp ? "Needs link" : "Optional"}
                  </div>
                </div>
                <div style={statCard}>
                  <div style={statLabel}>Faculty readiness</div>
                  <div style={{ ...statValue, fontSize: "15px" }}>{facultyReadinessComplete ? "Ready" : "Needs contact"}</div>
                </div>
                <div style={statCard}>
                  <div style={statLabel}>Materials</div>
                  <div style={{ ...statValue, fontSize: "15px" }}>{materialsStatusLabel}</div>
                </div>
                <div style={statCard}>
                  <div style={statLabel}>Contact progress</div>
                  <div style={{ ...statValue, fontSize: "15px" }}>{outreachProgressLabel}</div>
                </div>
              </div>
            </section>

            <section style={{ ...cardStyle, background: "var(--cfsp-surface)" }}>
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
                  <h2 style={compactSectionTitleStyle}>Training Materials</h2>
                  <p style={compactSectionHintStyle}>
                    Keep case docs, doorsigns, and recording details in one compact place.
                  </p>
                </div>
              </div>

              <div
                style={{
                  ...detailGridStyle,
                  marginTop: "14px",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                {trainingMaterialCards.map((material) => {
                  const fieldConfig = trainingMaterialFieldMap[material.kind];
                  const fileUrl = asText(trainingMetadata[fieldConfig.urlKey]);
                  const fileName = asText(trainingMetadata[fieldConfig.nameKey]);
                  const storagePath = asText(trainingMetadata[fieldConfig.storagePathKey]);
                  const isBusy = trainingMaterialSaving[material.kind];
                  const displayName =
                    material.kind === "case_file"
                      ? trainingMetadata.case_name || fileName || getFilenameFromUrl(fileUrl) || "No case attached"
                      : fileName || getFilenameFromUrl(fileUrl) || "No document attached";

                  return (
                    <div
                      key={material.kind}
                      style={{
                        border: "1px solid rgba(61, 201, 184, 0.16)",
                        borderRadius: "18px",
                        padding: "14px",
                        background: "linear-gradient(180deg, rgba(248, 251, 253, 0.98) 0%, rgba(238, 245, 251, 0.94) 100%)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ color: "var(--cfsp-text)", fontWeight: 900, fontSize: "16px" }}>{material.title}</div>
                          <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "13px", lineHeight: 1.45 }}>
                            {displayName}
                          </div>
                        </div>
                        <span style={commandChipStyle}>{fileUrl ? "Ready" : "Missing"}</span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                        <button
                          type="button"
                          onClick={() =>
                            openMaterialPreview({
                              title: material.title,
                              rawUrl: fileUrl,
                              storagePath,
                              fileName: displayName,
                            })
                          }
                          disabled={!fileUrl}
                          style={{ ...buttonStyle, padding: "8px 12px", opacity: fileUrl ? 1 : 0.55 }}
                        >
                          Preview
                        </button>
                        {fileUrl ? (
                          (() => {
                            const assetUrls = buildTrainingMaterialAssetUrls({
                              eventId: id,
                              rawUrl: fileUrl,
                              storagePath,
                              fileName: displayName,
                            });
                            return (
                              <a
                                href={assetUrls.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                download={assetUrls.fileName}
                                style={{
                                  ...buttonStyle,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  textDecoration: "none",
                                  padding: "8px 12px",
                                }}
                              >
                                Download
                              </a>
                            );
                          })()
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openTrainingMaterialPicker(material.kind)}
                          disabled={isBusy}
                          style={{ ...buttonStyle, padding: "8px 12px", opacity: isBusy ? 0.65 : 1 }}
                        >
                          {fileUrl ? "Replace" : "Add"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoveTrainingMaterial(material.kind)}
                          disabled={isBusy || (!fileUrl && !storagePath && !fileName)}
                          style={{
                            ...dangerButtonStyle,
                            padding: "8px 12px",
                            opacity: isBusy || (!fileUrl && !storagePath && !fileName) ? 0.65 : 1,
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{
                    border: "1px solid rgba(61, 201, 184, 0.16)",
                    borderRadius: "18px",
                    padding: "14px",
                    background: "linear-gradient(180deg, rgba(248, 251, 253, 0.98) 0%, rgba(238, 245, 251, 0.94) 100%)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ color: "var(--cfsp-text)", fontWeight: 900, fontSize: "16px" }}>Recording Guide</div>
                      <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "13px", lineHeight: 1.45 }}>
                        {trainingMetadata.recording_url ? getFilenameFromUrl(trainingMetadata.recording_url) || "Recording link ready" : "No recording guide linked"}
                      </div>
                    </div>
                    <span style={commandChipStyle}>{trainingMetadata.recording_url ? "Ready" : "Missing"}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
                    <button
                      type="button"
                      onClick={() =>
                        openMaterialPreview({
                          title: "Recording Guide",
                          rawUrl: trainingMetadata.recording_url,
                          fileName: getFilenameFromUrl(trainingMetadata.recording_url) || "recording-guide",
                        })
                      }
                      disabled={!trainingMetadata.recording_url}
                      style={{ ...buttonStyle, padding: "8px 12px", opacity: trainingMetadata.recording_url ? 1 : 0.55 }}
                    >
                      Preview
                    </button>
                    {trainingMetadata.recording_url ? (
                      <a
                        href={buildTrainingMaterialAssetUrls({
                          eventId: id,
                          rawUrl: trainingMetadata.recording_url,
                          storagePath: "",
                          fileName: getFilenameFromUrl(trainingMetadata.recording_url) || "recording-guide",
                        }).downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          ...buttonStyle,
                          display: "inline-flex",
                          alignItems: "center",
                          textDecoration: "none",
                          padding: "8px 12px",
                        }}
                      >
                        Download
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowRecordingGuideEditor((current) => !current)}
                      style={{ ...buttonStyle, padding: "8px 12px" }}
                    >
                      {showRecordingGuideEditor ? "Hide Replace" : "Replace"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void persistTrainingMetadataFields(
                          { recording_url: "", training_password: "" },
                          "Recording guide removed."
                        )
                      }
                      disabled={!trainingMetadata.recording_url && !trainingMetadata.training_password}
                      style={{
                        ...dangerButtonStyle,
                        padding: "8px 12px",
                        opacity: !trainingMetadata.recording_url && !trainingMetadata.training_password ? 0.55 : 1,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {showRecordingGuideEditor ? (
                    <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
                      <input
                        value={trainingMetadata.recording_url}
                        onChange={(event) => handleTrainingMetadataChange("recording_url", event.target.value)}
                        placeholder="Recording or guide URL"
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                      />
                      <input
                        value={trainingMetadata.training_password}
                        onChange={(event) => handleTrainingMetadataChange("training_password", event.target.value)}
                        placeholder="Password or access note"
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void persistTrainingMetadataFields(
                            {
                              recording_url: trainingMetadata.recording_url,
                              training_password: trainingMetadata.training_password,
                            },
                            "Recording guide updated."
                          )
                        }
                        style={{ ...buttonStyle, padding: "8px 12px", justifySelf: "start" }}
                      >
                        Save Recording Guide
                      </button>
                    </div>
                  ) : null}
                </div>

                <div style={{ ...statCard, background: "var(--cfsp-surface-muted)" }}>
                  <div style={statLabel}>Training Notes</div>
                  <div style={{ ...statValue, fontSize: "15px" }}>{trainingMetadata.training_notes || "No training notes added"}</div>
                </div>
              </div>

              <input
                ref={caseFileInputRef}
                type="file"
                onChange={(event) => {
                  void handleTrainingMaterialUpload("case_file", event.target.files?.[0] || null);
                  event.currentTarget.value = "";
                }}
                style={{ display: "none" }}
              />
              <input
                ref={doorsignInputRef}
                type="file"
                onChange={(event) => {
                  void handleTrainingMaterialUpload("doorsign", event.target.files?.[0] || null);
                  event.currentTarget.value = "";
                }}
                style={{ display: "none" }}
              />
              <input
                ref={supplementalDocInputRef}
                type="file"
                onChange={(event) => {
                  void handleTrainingMaterialUpload("supplemental_doc", event.target.files?.[0] || null);
                  event.currentTarget.value = "";
                }}
                style={{ display: "none" }}
              />
            </section>

            <details open={showTrainingEmailDraft} style={{ ...cardStyle, background: "var(--cfsp-surface)" }}>
              <summary style={{ cursor: "pointer", color: "var(--cfsp-text)", fontWeight: 900, fontSize: "20px" }}>
                Training Communication
              </summary>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  marginTop: "12px",
                }}
              >
                <div>
                  <h2 style={compactSectionTitleStyle}>Training Communication</h2>
                  <p style={compactSectionHintStyle}>
                    Preview the training email only when you need to draft or send it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTrainingEmailDraft((current) => !current)}
                  style={{ ...buttonStyle }}
                >
                  {showTrainingEmailDraft
                    ? "Hide SP Training Email"
                    : "Preview / Draft SP Training Email"}
                </button>
              </div>

              {showTrainingEmailDraft ? (
                <div
                  style={{
                    marginTop: "14px",
                    border: "1px solid var(--cfsp-border)",
                    borderRadius: "16px",
                    padding: "14px",
                    background: "var(--cfsp-surface-muted)",
                  }}
                >
                  <div style={statLabel}>Email Draft Preview</div>
                  <div style={{ marginTop: "10px", color: "var(--cfsp-text)", lineHeight: 1.7 }}>
                    <div><strong>From:</strong> {me?.email || "Current logged-in user"}</div>
                    <div><strong>To:</strong> {me?.email || "Current logged-in user"}</div>
                    <div><strong>CC:</strong> {facultyEmails.length ? facultyEmails.join(", ") : trainingFacultyText || "No faculty emails parsed yet"}</div>
                    <div><strong>BCC:</strong> {assignedBccEmails.length ? assignedBccEmails.join(", ") : "No selected staffing SP emails found."}</div>
                    <div style={{ marginTop: "8px" }}><strong>Subject:</strong> {trainingEmailSubject}</div>
                    <div style={{ marginTop: "8px", whiteSpace: "pre-wrap" }}><strong>Body:</strong>{"\n"}{trainingEmailBody}</div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                    <a
                      href={trainingMailtoHref}
                      style={{
                        ...buttonStyle,
                        display: "inline-flex",
                        alignItems: "center",
                        textDecoration: "none",
                      }}
                    >
                      Open Draft in Email
                    </a>
                  </div>
                </div>
              ) : null}
            </details>

            <details id="coverage-actions" style={cardStyle}>
              <summary style={{ cursor: "pointer", color: "var(--cfsp-text)", fontWeight: 900, fontSize: "20px" }}>
                Advanced Event Details
              </summary>
              <div style={{ marginTop: "12px", display: "grid", gap: "12px" }}>
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
                    <h2 style={compactSectionTitleStyle}>Advanced Event Details</h2>
                    <p style={compactSectionHintStyle}>
                      Keep this for deeper record edits and import tools after the primary prep panels are set.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveEventDetails()}
                    disabled={saving}
                    style={{ ...buttonStyle, opacity: saving ? 0.65 : 1, position: "sticky", top: "12px" }}
                  >
                    Save Event Details
                  </button>
                </div>

                <div style={{ ...detailGridStyle, marginTop: 0, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Name</span>
                    <input
                      value={eventEditor.name}
                      onChange={(event) => setEventEditor((current) => ({ ...current, name: event.target.value }))}
                      disabled={saving}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Status</span>
                    <input
                      value={eventEditor.status}
                      onChange={(event) => setEventEditor((current) => ({ ...current, status: event.target.value }))}
                      disabled={saving}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Visibility</span>
                    <input
                      value={eventEditor.visibility}
                      onChange={(event) => setEventEditor((current) => ({ ...current, visibility: event.target.value }))}
                      disabled={saving}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>SPs Needed</span>
                    <input
                      type="number"
                      min={0}
                      value={eventEditor.sp_needed}
                      onChange={(event) => setEventEditor((current) => ({ ...current, sp_needed: event.target.value }))}
                      disabled={saving}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <div style={{ display: "grid", gap: "8px", gridColumn: "1 / -1" }}>
                    <span style={statLabel}>Event Type / Category</span>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {(Object.keys(editableEventTypeLabels) as EditableEventType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleSelectEventType(type)}
                          disabled={saving}
                          style={{ ...getEventTypeButtonStyle(type, activeEventTypeSet.has(type)), cursor: "pointer" }}
                        >
                          {editableEventTypeLabels[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                    <span style={statLabel}>Location</span>
                    <input
                      value={eventEditor.location}
                      onChange={(event) => setEventEditor((current) => ({ ...current, location: event.target.value }))}
                      disabled={saving}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Session Date</span>
                    <input
                      type="date"
                      value={sessionEditor.session_date}
                      onChange={(event) =>
                        setSessionEditor((current) => ({ ...current, session_date: event.target.value }))
                      }
                      disabled={saving}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Start Time</span>
                    <input
                      type="time"
                      value={sessionEditor.start_time}
                      onChange={(event) =>
                        setSessionEditor((current) => ({ ...current, start_time: event.target.value }))
                      }
                      disabled={saving}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                    <span style={compactSectionHintStyle}>
                      Saves as {sessionEditor.start_time ? formatDisplayTime(toStoredTimeValue(sessionEditor.start_time) || "") : "AM/PM"}
                    </span>
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>End Time</span>
                    <input
                      type="time"
                      value={sessionEditor.end_time}
                      onChange={(event) =>
                        setSessionEditor((current) => ({ ...current, end_time: event.target.value }))
                      }
                      disabled={saving}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                    <span style={compactSectionHintStyle}>
                      Saves as {sessionEditor.end_time ? formatDisplayTime(toStoredTimeValue(sessionEditor.end_time) || "") : "AM/PM"}
                    </span>
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Zoom URL</span>
                    <input
                      value={trainingMetadata.zoom_url}
                      onChange={(event) => handleTrainingMetadataChange("zoom_url", event.target.value)}
                      disabled={saving}
                      placeholder="https://..."
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Zoom / Recording Password</span>
                    <input
                      value={trainingMetadata.training_password}
                      onChange={(event) => handleTrainingMetadataChange("training_password", event.target.value)}
                      disabled={saving}
                      placeholder="Password"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Recorded Training URL</span>
                    <input
                      value={trainingMetadata.recording_url}
                      onChange={(event) => handleTrainingMetadataChange("recording_url", event.target.value)}
                      disabled={saving}
                      placeholder="https://..."
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Recording Status</span>
                    <select
                      value={normalizeRecordingStatusValue(trainingMetadata.recording_status) || "not_recorded"}
                      onChange={(event) => handleTrainingMetadataChange("recording_status", event.target.value)}
                      disabled={saving}
                      style={{ ...selectStyle, width: "100%", maxWidth: "none", boxSizing: "border-box" }}
                    >
                      {recordingStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Case File URL</span>
                    <input
                      value={trainingMetadata.case_file_url}
                      onChange={(event) => handleTrainingMetadataChange("case_file_url", event.target.value)}
                      disabled={saving}
                      placeholder="Paste case link"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Doorsign URL</span>
                    <input
                      value={trainingMetadata.doorsign_url}
                      onChange={(event) => handleTrainingMetadataChange("doorsign_url", event.target.value)}
                      disabled={saving}
                      placeholder="Paste doorsign link"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Case Name</span>
                    <input
                      value={trainingMetadata.case_name}
                      onChange={(event) => handleTrainingMetadataChange("case_name", event.target.value)}
                      disabled={saving}
                      placeholder="Case title"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Supplemental Doc URL</span>
                    <input
                      value={trainingMetadata.supplemental_doc_url}
                      onChange={(event) => handleTrainingMetadataChange("supplemental_doc_url", event.target.value)}
                      disabled={saving}
                      placeholder="Paste doc link"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Faculty Assigned</span>
                    <input
                      value={trainingMetadata.faculty_names}
                      onChange={(event) => handleTrainingMetadataChange("faculty_names", event.target.value)}
                      disabled={saving}
                      placeholder={fallbackFacultyText || "Faculty names or emails"}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Sim Contact / Team</span>
                    <input
                      value={trainingMetadata.sim_contact}
                      onChange={(event) => handleTrainingMetadataChange("sim_contact", event.target.value)}
                      disabled={saving}
                      placeholder={simStaffNames.join(", ") || "Sim team assigned"}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                    <span style={statLabel}>Training Notes</span>
                    <textarea
                      value={trainingMetadata.training_notes}
                      onChange={(event) => handleTrainingMetadataChange("training_notes", event.target.value)}
                      disabled={saving}
                      placeholder="Add prep notes, reminders, or follow-up details..."
                      style={{ ...textareaStyle, minHeight: "88px" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                    <span style={statLabel}>Notes</span>
                    <textarea
                      value={eventEditor.notes}
                      onChange={(event) => setEventEditor((current) => ({ ...current, notes: event.target.value }))}
                      disabled={saving}
                      placeholder="Add operational notes, setup details, reporting instructions..."
                      style={{ ...textareaStyle, minHeight: "120px" }}
                    />
                  </label>
                </div>

                <details
                  style={{
                    border: "1px solid var(--cfsp-border)",
                    borderRadius: "14px",
                    padding: "12px",
                    background: "var(--cfsp-surface-muted)",
                  }}
                >
                  <summary style={{ cursor: "pointer", color: "var(--cfsp-text)", fontWeight: 800 }}>
                    Roster Import / Advanced Tools
                  </summary>
                  <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                    <div style={statLabel}>Upload SP Event Info</div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.xlsm"
                      disabled={trainingImporting || saving}
                      onChange={(event) => void handleTrainingWorkbookImport(event.target.files?.[0] || null)}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                    <div style={{ color: "var(--cfsp-text-muted)", fontSize: "12px", fontWeight: 700 }}>
                      Reads title from `B1`, SP emails from `B16:B35`, SP names from `C16:C35`, and faculty from column `G`.
                    </div>
                    {trainingImporting ? (
                      <div className="cfsp-alert cfsp-alert-info">Importing SP Event Info workbook...</div>
                    ) : null}
                    {trainingImportError ? (
                      <div className="cfsp-alert cfsp-alert-error">{trainingImportError}</div>
                    ) : null}
                    {trainingImportResult ? (
                      <div
                        style={{
                          border: "1px solid var(--cfsp-border)",
                          borderRadius: "12px",
                          background: "var(--cfsp-surface)",
                          padding: "12px 14px",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                          SP Event Info imported
                        </div>
                        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                          Workbook event: {trainingImportResult.eventTitle || "Untitled workbook event"}
                        </div>
                        <div style={{ color: "var(--cfsp-green)", fontWeight: 800 }}>
                          {trainingImportResult.confirmedCount} SP{trainingImportResult.confirmedCount === 1 ? "" : "s"} imported and confirmed
                        </div>
                        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                          Imported rows: {trainingImportResult.importedCount} · {formatUploadedTimestamp(trainingImportResult.importedAt)}
                        </div>
                        <div style={{ color: "var(--cfsp-green)", fontWeight: 800 }}>
                          Matched / assigned: {trainingImportResult.matchedAssigned.length}
                        </div>
                        <div style={{ color: "var(--cfsp-warning)", fontWeight: 800 }}>
                          Already assigned: {trainingImportResult.alreadyAssigned.length}
                        </div>
                        <div style={{ color: "var(--cfsp-danger)", fontWeight: 800 }}>
                          Not found: {trainingImportResult.notFound.length}
                        </div>
                        {trainingImportResult.facultyDetected.length ? (
                          <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                            Faculty detected: {trainingImportResult.facultyDetected.join(", ")}
                          </div>
                        ) : null}
                        {trainingImportResult.trainingDate || trainingImportResult.trainingTime ? (
                          <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                            Training date/time detected: {[trainingImportResult.trainingDate, trainingImportResult.trainingTime].filter(Boolean).join(" · ")}
                          </div>
                        ) : null}
                        {trainingImportResult.eventDatesDetected.length ? (
                          <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                            {trainingImportResult.eventDatesDetected.length} event date(s) detected
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>
            </details>
          </div>

          <aside style={{ display: "grid", gap: "14px", minWidth: 0, position: "sticky", top: "16px" }}>
            <section style={{ ...cardStyle, background: "var(--cfsp-surface-muted)", borderColor: "var(--cfsp-border-strong)", marginBottom: 0 }}>
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
                  <h2 style={compactSectionTitleStyle}>Selected SPs</h2>
                  <p style={compactSectionHintStyle}>
                    {selectedStaffingCount} selected / {confirmedCount} confirmed
                  </p>
                </div>
                <div
                  style={{
                    borderRadius: "999px",
                    padding: "8px 12px",
                    background: "rgba(73, 168, 255, 0.12)",
                    border: "1px solid rgba(120, 180, 255, 0.22)",
                    color: "var(--cfsp-blue)",
                    fontWeight: 900,
                    fontSize: "12px",
                  }}
                >
                  {assignedBccEmails.length} email{assignedBccEmails.length === 1 ? "" : "s"} ready
                </div>
              </div>

              {assignmentSuccessMessage ? (
                <div
                  style={{
                    marginTop: "12px",
                    borderRadius: "12px",
                    padding: "10px 12px",
                    background: "var(--cfsp-green-soft)",
                    border: "1px solid rgba(44, 211, 173, 0.22)",
                    color: "var(--cfsp-green)",
                    fontWeight: 800,
                  }}
                >
                  {assignmentSuccessMessage}
                </div>
              ) : null}

              {trainingAttendancePanel}

              <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
                <div style={statLabel}>Quick Select SP</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={selectedSpId}
                    onChange={(e) => setSelectedSpId(e.target.value)}
                    style={{ ...selectStyle, maxWidth: "100%", flex: "1 1 220px" }}
                    disabled={saving || availableSps.length === 0}
                  >
                    <option value="">
                      {availableSps.length === 0 ? "No matching unassigned SPs" : "Quick select an SP"}
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
                    onClick={() => void handleAddAssignment()}
                    disabled={saving || !selectedSpId}
                    style={{ ...buttonStyle, padding: "9px 12px", opacity: saving || !selectedSpId ? 0.65 : 1 }}
                  >
                    {assigningSpId && assigningSpId === selectedSpId ? "Assigning..." : "Add SP"}
                  </button>
                </div>
              </div>

              {trainingImportResult ? (
                <div
                  style={{
                    marginTop: "14px",
                    border: "1px solid rgba(44, 211, 173, 0.22)",
                    borderRadius: "14px",
                    padding: "12px",
                    background: "var(--cfsp-green-soft)",
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <div style={{ color: "var(--cfsp-green)", fontWeight: 900 }}>
                    SP Event Info imported
                  </div>
                  <div style={{ color: "var(--cfsp-green)", fontWeight: 700, fontSize: "13px" }}>
                    {trainingImportResult.importedCount} roster row{trainingImportResult.importedCount === 1 ? "" : "s"} · {formatUploadedTimestamp(trainingImportResult.importedAt)}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: "8px", marginTop: "14px" }}>
                {sortedAssignments.length === 0 ? (
                  <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                    No SPs assigned to this training yet.
                  </div>
                ) : (
                  trainingRosterPreview.map((assignment) => {
                    const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
                    const status = getAssignmentStatus(assignment);
                    const checkedAt = formatAttendanceTimestamp(assignment.training_checked_in_at);

                    return (
                      <div
                        key={`training-sidebar-${assignment.id}`}
                        style={{
                          border: "1px solid var(--cfsp-border)",
                          borderRadius: "12px",
                          background: "var(--cfsp-surface)",
                          padding: "10px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
                          <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                            {sp ? getFullName(sp) : "Unknown SP"}
                          </div>
                          <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontSize: "13px", fontWeight: 700 }}>
                            {sp ? getEmail(sp) || sp.phone || "No contact details" : assignment.sp_id || "No SP id"}
                          </div>
                          {canManageTrainingAttendance && assignment.training_attended && checkedAt ? (
                            <div style={{ marginTop: "4px", color: "var(--cfsp-green)", fontSize: "12px", fontWeight: 800 }}>
                              Checked in {checkedAt}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          {canManageTrainingAttendance ? (
                            <label
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                                borderRadius: "999px",
                                padding: "6px 10px",
                                background: assignment.training_attended ? "var(--cfsp-green-soft)" : "rgba(168, 183, 204, 0.12)",
                                border: assignment.training_attended
                                  ? "1px solid rgba(44, 211, 173, 0.24)"
                                  : "1px solid var(--cfsp-border)",
                                color: assignment.training_attended ? "var(--cfsp-green)" : "var(--cfsp-text-muted)",
                                fontSize: "12px",
                                fontWeight: 900,
                                cursor: attendanceSaving || trainingAttendanceFieldsMissing ? "not-allowed" : "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={assignment.training_attended === true}
                                disabled={attendanceSaving || trainingAttendanceFieldsMissing}
                                onChange={(event) => void handleTrainingAttendanceToggle(assignment, event.target.checked)}
                                style={{ width: "16px", height: "16px", accentColor: "var(--cfsp-green)" }}
                              />
                              Present
                            </label>
                          ) : null}
                          <span
                            style={{
                              ...assignmentStatusStyles[status],
                              borderRadius: "999px",
                              padding: "5px 8px",
                              fontSize: "11px",
                              fontWeight: 900,
                            }}
                          >
                            {assignmentStatusLabels[status]}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleRemoveAssignment(assignment)}
                            disabled={saving}
                            style={{ ...dangerButtonStyle, padding: "7px 10px", opacity: saving ? 0.65 : 1 }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {sortedAssignments.length > 8 ? (
                <button
                  type="button"
                  onClick={() => setShowAllTrainingRoster((current) => !current)}
                  style={{
                    ...buttonStyle,
                    marginTop: "12px",
                    background: "var(--cfsp-button-secondary-bg)",
                    color: "var(--cfsp-button-secondary-text)",
                    border: "1px solid var(--cfsp-button-secondary-border)",
                  }}
                >
                  {showAllTrainingRoster ? "Show fewer" : `Show all (${sortedAssignments.length})`}
                </button>
              ) : null}
            </section>
          </aside>
        </div>
      ) : null}

      {!isTrainingMode ? (
        <>
          <section
            className="xl:hidden"
            style={{
              ...cardStyle,
              background: "var(--cfsp-surface-muted)",
              borderColor: "rgba(120, 180, 255, 0.24)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h2 style={compactSectionTitleStyle}>Workflow Report</h2>
                <p style={compactSectionHintStyle}>Compact workflow status that stays out of the way.</p>
              </div>
              <div
                style={{
                  borderRadius: "999px",
                  padding: "8px 12px",
                  background: workflowTone.background,
                  border: workflowTone.border,
                  color: workflowTone.color,
                  fontWeight: 900,
                  fontSize: "13px",
                }}
              >
                {workflowPercent}% complete
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
              {workflowReportItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    flex: "1 1 170px",
                    minWidth: "150px",
                    borderRadius: "14px",
                    padding: "9px 11px",
                    border: "1px solid rgba(120, 180, 255, 0.18)",
                    background: item.complete ? planningSuccessCardBackground : "rgba(255,255,255,0.66)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                    <div style={statLabel}>{item.label}</div>
                    <span
                      style={{
                        borderRadius: "999px",
                        padding: "4px 8px",
                        background: item.complete ? planningSuccessBackground : "var(--cfsp-warning-soft)",
                        color: item.complete ? planningSuccessText : "var(--cfsp-warning)",
                        border: item.complete ? planningSuccessBorder : "1px solid rgba(243, 187, 103, 0.18)",
                        fontSize: "11px",
                        fontWeight: 900,
                      }}
                    >
                      {item.complete ? "Ready" : "Pending"}
                    </span>
                  </div>
                  <div style={{ marginTop: "5px", color: "var(--cfsp-text)", fontWeight: 900, fontSize: "13px" }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setShowWorkflowAdvanced((current) => !current)}
                style={{
                  ...buttonStyle,
                  background: "var(--cfsp-surface)",
                  color: "var(--cfsp-text)",
                  border: "1px solid var(--cfsp-border)",
                }}
              >
                {showWorkflowAdvanced ? "Hide Advanced Workflow" : "Advanced Workflow / Expand"}
              </button>
            </div>

            {showWorkflowAdvanced ? (
              <div style={{ display: "grid", gap: "14px", marginTop: "16px" }}>
                {workflowGroups.map((group) => (
                  <section
                    key={group.key}
                    style={{
                      border: "1px solid var(--cfsp-border)",
                      borderRadius: "14px",
                      background: "var(--cfsp-surface)",
                      padding: "14px",
                    }}
                  >
                    <div style={{ color: "var(--cfsp-text)", fontWeight: 900, fontSize: "16px" }}>{group.title}</div>
                    <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
                      {group.items.map((item) => {
                        const complete = item.autoComplete || workflowChecks[item.id];
                        const manualOnly = !item.autoComplete;
                        return (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              alignItems: "center",
                              flexWrap: "wrap",
                              border: "1px solid var(--cfsp-border)",
                              borderRadius: "12px",
                              background: "var(--cfsp-surface-muted)",
                              padding: "12px 14px",
                            }}
                          >
                            <div>
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>{item.label}</div>
                              <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontSize: "13px", fontWeight: 700 }}>
                                {item.detail}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span
                                style={{
                                  borderRadius: "999px",
                                  padding: "6px 10px",
                                  fontSize: "12px",
                                  fontWeight: 900,
                                  background: complete ? planningSuccessBackground : "rgba(168, 183, 204, 0.12)",
                                  border: complete ? planningSuccessBorder : "1px solid var(--cfsp-border)",
                                  color: complete ? planningSuccessText : "var(--cfsp-text-muted)",
                                }}
                              >
                                {complete ? "Complete" : item.autoComplete ? "Auto check pending" : "Manual check"}
                              </span>
                              {manualOnly ? (
                                <button
                                  type="button"
                                  onClick={() => void handleToggleWorkflowCheck(item.id, complete)}
                                  disabled={saving}
                                  style={{
                                    ...buttonStyle,
                                    background: complete ? "var(--cfsp-surface)" : "var(--cfsp-blue)",
                                    color: complete ? "var(--cfsp-text)" : "#ffffff",
                                    border: complete ? "1px solid var(--cfsp-border)" : buttonStyle.border,
                                    opacity: saving ? 0.65 : 1,
                                  }}
                                >
                                  {complete ? "Mark Pending" : "Mark Complete"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </section>

          <section
            className="hidden xl:block"
            style={{
              ...cardStyle,
              marginTop: "12px",
              background: "var(--cfsp-surface-muted)",
              borderColor: "rgba(120, 180, 255, 0.24)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <h2 style={compactSectionTitleStyle}>Workflow Report</h2>
                <p style={compactSectionHintStyle}>Compact workflow status that stays out of the way.</p>
              </div>
              <div
                style={{
                  borderRadius: "999px",
                  padding: "8px 12px",
                  background: workflowTone.background,
                  border: workflowTone.border,
                  color: workflowTone.color,
                  fontWeight: 900,
                  fontSize: "13px",
                }}
              >
                {workflowPercent}% complete
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
              {workflowReportItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    flex: "1 1 180px",
                    minWidth: "160px",
                    borderRadius: "14px",
                    padding: "9px 11px",
                    border: "1px solid rgba(120, 180, 255, 0.18)",
                    background: item.complete ? planningSuccessCardBackground : "rgba(255,255,255,0.7)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                    <div style={statLabel}>{item.label}</div>
                    <span
                      style={{
                        borderRadius: "999px",
                        padding: "4px 8px",
                        background: item.complete ? planningSuccessBackground : "var(--cfsp-warning-soft)",
                        color: item.complete ? planningSuccessText : "var(--cfsp-warning)",
                        border: item.complete ? planningSuccessBorder : "1px solid rgba(243, 187, 103, 0.18)",
                        fontSize: "11px",
                        fontWeight: 900,
                      }}
                    >
                      {item.complete ? "Ready" : "Pending"}
                    </span>
                  </div>
                  <div style={{ marginTop: "5px", color: "var(--cfsp-text)", fontWeight: 900, fontSize: "13px" }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setShowWorkflowAdvanced((current) => !current)}
                style={{
                  ...buttonStyle,
                  width: "100%",
                  background: "var(--cfsp-surface)",
                  color: "var(--cfsp-text)",
                  border: "1px solid var(--cfsp-border)",
                }}
              >
                {showWorkflowAdvanced ? "Hide Advanced Workflow" : "Advanced Workflow / Expand"}
              </button>
            </div>

            {showWorkflowAdvanced ? (
              <div style={{ display: "grid", gap: "14px", marginTop: "16px" }}>
                {workflowGroups.map((group) => (
                  <section
                    key={group.key}
                    style={{
                      border: "1px solid var(--cfsp-border)",
                      borderRadius: "14px",
                      background: "var(--cfsp-surface)",
                      padding: "14px",
                    }}
                  >
                    <div style={{ color: "var(--cfsp-text)", fontWeight: 900, fontSize: "16px" }}>{group.title}</div>
                    <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
                      {group.items.map((item) => {
                        const complete = item.autoComplete || workflowChecks[item.id];
                        const manualOnly = !item.autoComplete;
                        return (
                          <div
                            key={item.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "12px",
                              alignItems: "center",
                              flexWrap: "wrap",
                              border: "1px solid var(--cfsp-border)",
                              borderRadius: "12px",
                              background: "var(--cfsp-surface-muted)",
                              padding: "12px 14px",
                            }}
                          >
                            <div>
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>{item.label}</div>
                              <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontSize: "13px", fontWeight: 700 }}>
                                {item.detail}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span
                                style={{
                                  borderRadius: "999px",
                                  padding: "6px 10px",
                                  fontSize: "12px",
                                  fontWeight: 900,
                                  background: complete ? planningSuccessBackground : "rgba(168, 183, 204, 0.12)",
                                  border: complete ? planningSuccessBorder : "1px solid var(--cfsp-border)",
                                  color: complete ? planningSuccessText : "var(--cfsp-text-muted)",
                                }}
                              >
                                {complete ? "Complete" : item.autoComplete ? "Auto check pending" : "Manual check"}
                              </span>
                              {manualOnly ? (
                                <button
                                  type="button"
                                  onClick={() => void handleToggleWorkflowCheck(item.id, complete)}
                                  disabled={saving}
                                  style={{
                                    ...buttonStyle,
                                    background: complete ? "var(--cfsp-surface)" : "var(--cfsp-blue)",
                                    color: complete ? "var(--cfsp-text)" : "#ffffff",
                                    border: complete ? "1px solid var(--cfsp-border)" : buttonStyle.border,
                                    opacity: saving ? 0.65 : 1,
                                  }}
                                >
                                  {complete ? "Mark Pending" : "Mark Complete"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {eventSaveMessage ? (
        <div
          style={{
            ...cardStyle,
            borderRadius: "12px",
            border: "1px solid rgba(44, 211, 173, 0.24)",
            background: "var(--cfsp-green-soft)",
            color: "var(--cfsp-green)",
            padding: "10px 12px",
            fontWeight: 800,
          }}
        >
          {eventSaveMessage}
        </div>
      ) : null}

      {eventSaveError ? (
        <div
          style={{
            ...cardStyle,
            borderRadius: "12px",
            border: "1px solid var(--cfsp-danger-border)",
            background: "var(--cfsp-danger-soft)",
            color: "var(--cfsp-danger)",
            padding: "10px 12px",
            fontWeight: 800,
          }}
        >
          {eventSaveError}
        </div>
      ) : null}

      {!isTrainingMode ? (
      <details id="coverage-actions" style={cardStyle}>
        <summary style={{ cursor: "pointer", color: "var(--cfsp-text)", fontWeight: 900, fontSize: "20px" }}>
          Advanced Event Details
        </summary>
        <div style={{ marginTop: "12px" }}>
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
            <h2 style={compactSectionTitleStyle}>Advanced Event Details</h2>
            <p style={compactSectionHintStyle}>
              {isTrainingMode
                ? "Update core event details and training-specific prep metadata."
                : "Use this only for deeper record maintenance after the command-center panels are set."}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void saveEventDetails()}
            disabled={saving}
            style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
          >
            Save Event Details
          </button>
        </div>

        <div
          style={{
            ...detailGridStyle,
            gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.7fr)",
            alignItems: "start",
            marginTop: "10px",
          }}
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ ...statCard, background: coverageStatus.background, border: coverageStatus.border }}>
              <div style={statLabel}>{isTrainingMode ? "Training Status" : "Coverage Status"}</div>
              <div style={{ ...statValue, color: coverageStatus.color }}>
                {isTrainingMode ? "Training workflow active" : coverageStatus.message}
              </div>
              <div style={{ marginTop: "2px", color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                {isTrainingMode
                  ? `${selectedStaffingCount} selected SP${selectedStaffingCount === 1 ? "" : "s"} · Rotation schedule ${
                      rotationScheduleBuilt ? "built" : "not built"
                    }`
                  : isWorkshop
                  ? "No SP staffing required for this event"
                  : needed > 0
                    ? `${coveragePercent}% selected staffing coverage`
                    : "No SP target set"}
              </div>
            </div>

            <div style={{ ...detailGridStyle, marginTop: 0, gridTemplateColumns: "1fr 1fr" }}>
              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Name</span>
                <input
                  value={eventEditor.name}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, name: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Status</span>
                <input
                  value={eventEditor.status}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, status: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Visibility</span>
                <input
                  value={eventEditor.visibility}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, visibility: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>SPs Needed</span>
                <input
                  type="number"
                  min={0}
                  value={eventEditor.sp_needed}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, sp_needed: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <div style={{ display: "grid", gap: "8px", gridColumn: "1 / -1" }}>
                <span style={statLabel}>Event Type / Category</span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(Object.keys(editableEventTypeLabels) as EditableEventType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleSelectEventType(type)}
                      disabled={saving}
                      style={{
                        ...getEventTypeButtonStyle(type, activeEventTypeSet.has(type)),
                        cursor: "pointer",
                      }}
                    >
                      {editableEventTypeLabels[type]}
                    </button>
                  ))}
                </div>
                <div style={{ color: "var(--cfsp-text-muted)", fontSize: "12px", fontWeight: 700 }}>
                  Toggle one or more categories here, then save event details to keep badges and workflows aligned.
                </div>
              </div>

              <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                <span style={statLabel}>Location</span>
                <input
                  value={eventEditor.location}
                  onChange={(event) =>
                    setEventEditor((current) => ({ ...current, location: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Session Date</span>
                <input
                  type="date"
                  value={sessionEditor.session_date}
                  onChange={(event) =>
                    setSessionEditor((current) => ({ ...current, session_date: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Start Time</span>
                <input
                  type="time"
                  value={sessionEditor.start_time}
                  onChange={(event) =>
                    setSessionEditor((current) => ({ ...current, start_time: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
                <span style={compactSectionHintStyle}>
                  Saves as {sessionEditor.start_time ? formatDisplayTime(toStoredTimeValue(sessionEditor.start_time) || "") : "AM/PM"}
                </span>
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>End Time</span>
                <input
                  type="time"
                  value={sessionEditor.end_time}
                  onChange={(event) =>
                    setSessionEditor((current) => ({ ...current, end_time: event.target.value }))
                  }
                  disabled={saving}
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />
                <span style={compactSectionHintStyle}>
                  Saves as {sessionEditor.end_time ? formatDisplayTime(toStoredTimeValue(sessionEditor.end_time) || "") : "AM/PM"}
                </span>
              </label>

              <label style={{ display: "grid", gap: "6px" }}>
                <span style={statLabel}>Recording Status</span>
                <select
                  value={normalizeRecordingStatusValue(trainingMetadata.recording_status) || "not_recorded"}
                  onChange={(event) => handleTrainingMetadataChange("recording_status", event.target.value)}
                  disabled={saving}
                  style={{ ...selectStyle, width: "100%", maxWidth: "none", boxSizing: "border-box" }}
                >
                  {recordingStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {isTrainingMode ? (
                <>
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Zoom URL</span>
                    <input
                      value={trainingMetadata.zoom_url}
                      onChange={(event) => handleTrainingMetadataChange("zoom_url", event.target.value)}
                      disabled={saving}
                      placeholder="https://..."
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Zoom / Recording Password</span>
                    <input
                      value={trainingMetadata.training_password}
                      onChange={(event) => handleTrainingMetadataChange("training_password", event.target.value)}
                      disabled={saving}
                      placeholder="Password"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Recorded Training URL</span>
                    <input
                      value={trainingMetadata.recording_url}
                      onChange={(event) => handleTrainingMetadataChange("recording_url", event.target.value)}
                      disabled={saving}
                      placeholder="https://..."
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Case Name</span>
                    <input
                      value={trainingMetadata.case_name}
                      onChange={(event) => handleTrainingMetadataChange("case_name", event.target.value)}
                      disabled={saving}
                      placeholder="Case title"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Faculty Assigned</span>
                    <input
                      value={trainingMetadata.faculty_names}
                      onChange={(event) => handleTrainingMetadataChange("faculty_names", event.target.value)}
                      disabled={saving}
                      placeholder={fallbackFacultyText || "Faculty names or emails"}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Case File URL</span>
                    <input
                      value={trainingMetadata.case_file_url}
                      onChange={(event) => handleTrainingMetadataChange("case_file_url", event.target.value)}
                      disabled={saving}
                      placeholder="Paste case link"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Case File Selected</span>
                    <input
                      value={trainingMetadata.case_file_name}
                      readOnly
                      placeholder="No case file uploaded"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box", background: "var(--cfsp-surface-muted)" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Doorsign URL</span>
                    <input
                      value={trainingMetadata.doorsign_url}
                      onChange={(event) => handleTrainingMetadataChange("doorsign_url", event.target.value)}
                      disabled={saving}
                      placeholder="Paste doorsign link"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={statLabel}>Doorsign File Selected</span>
                    <input
                      value={trainingMetadata.doorsign_file_name}
                      readOnly
                      placeholder="No doorsign uploaded"
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box", background: "var(--cfsp-surface-muted)" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                    <span style={statLabel}>Sim Contact / Team</span>
                    <input
                      value={trainingMetadata.sim_contact}
                      onChange={(event) => handleTrainingMetadataChange("sim_contact", event.target.value)}
                      disabled={saving}
                      placeholder={simStaffNames.join(", ") || "Sim team assigned"}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
                    <span style={statLabel}>Training Notes</span>
                    <textarea
                      value={trainingMetadata.training_notes}
                      onChange={(event) => handleTrainingMetadataChange("training_notes", event.target.value)}
                      disabled={saving}
                      placeholder="Add prep notes, reminders, or follow-up details..."
                      style={{ ...textareaStyle, minHeight: "88px" }}
                    />
                  </label>
                </>
              ) : null}
            </div>
          </div>

          <details
            open
            style={{
              border: "1px solid var(--cfsp-border)",
              borderRadius: "14px",
              padding: "12px",
              background: "var(--cfsp-surface-muted)",
            }}
          >
            <summary style={{ cursor: "pointer", color: "var(--cfsp-text)", fontWeight: 800 }}>
              Notes
            </summary>
            <textarea
              value={eventEditor.notes}
              onChange={(event) =>
                setEventEditor((current) => ({ ...current, notes: event.target.value }))
              }
              disabled={saving}
              placeholder="Add operational notes, setup details, reporting instructions..."
              style={{ ...textareaStyle, marginTop: "10px" }}
            />
          </details>
        </div>
        </div>
      </details>
      ) : null}

      {normalEventStaffingCommandCenter}

      {false && !isTrainingMode ? (
      <div style={cardStyle}>
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
            <h2 style={compactSectionTitleStyle}>
              {isTrainingMode ? "SP Training Roster" : "Coverage Actions"}
            </h2>
            <p style={compactSectionHintStyle}>
              {isTrainingMode
                ? "Manage selected SPs for the training, remove anyone who should not attend, and add more from the existing SP roster."
                : noSpStaffingRequired
                ? "This skills event does not require SP staffing."
                : staffingRelevant
                ? "Manage selected SPs, update contact status, and confirm coverage without leaving the page."
                : "HiFi event. Staffing tools remain available if this event needs SP support."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            {isTrainingMode ? (
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  minWidth: "220px",
                  border: "1px solid var(--cfsp-border)",
                  borderRadius: "16px",
                  padding: "12px",
                  background: "var(--cfsp-surface-muted)",
                }}
              >
                <div style={{ color: "var(--cfsp-text)", fontWeight: 900, fontSize: "20px" }}>
                  {selectedStaffingCount} selected / {confirmedCount} confirmed
                </div>
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 800 }}>
                  {assignedBccEmails.length} selected staffing SP email{assignedBccEmails.length === 1 ? "" : "s"} ready
                </div>
              </div>
            ) : !noSpStaffingRequired && assignedBccEmails.length ? (
              <button
                type="button"
                onClick={() => void handleOpenAvailabilityRequest()}
                style={{
                  display: "inline-block",
                  background: "var(--cfsp-green)",
                  color: "#fff",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  fontWeight: 800,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Send Email
              </button>
            ) : !noSpStaffingRequired ? (
              <span
                style={{
                  display: "inline-block",
                  background: "rgba(168, 183, 204, 0.16)",
                  color: "var(--cfsp-text-muted)",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  fontWeight: 800,
                }}
              >
                No Assigned SP Emails
              </span>
            ) : null}
            {!isTrainingMode && !noSpStaffingRequired ? (
              <button
                type="button"
                onClick={() => void handleConfirmAllAssignments()}
                disabled={saving || sortedAssignments.length === 0}
                style={{ ...buttonStyle, opacity: saving || sortedAssignments.length === 0 ? 0.65 : 1 }}
              >
                Confirm All Assigned SPs
              </button>
            ) : null}
            {!isTrainingMode && !noSpStaffingRequired ? (
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  minWidth: "200px",
                  border: "1px solid var(--cfsp-border)",
                  borderRadius: "16px",
                  padding: "12px",
                  background: "var(--cfsp-surface-muted)",
                }}
              >
                <div style={{ color: "var(--cfsp-text)", fontWeight: 900, fontSize: "20px" }}>
                  {needed} SPs needed / {confirmedCount} confirmed
                </div>
                <div style={{ color: "var(--cfsp-warning)", fontWeight: 800 }}>
                  {Math.max(needed - selectedStaffingCount, 0)} selected staffing slot{Math.max(needed - selectedStaffingCount, 0) === 1 ? "" : "s"} still open
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {!staffingRelevant ? (
          <div
            style={{
              ...statCard,
              marginTop: "10px",
              background: "rgba(141, 121, 255, 0.14)",
              border: "1px solid rgba(141, 121, 255, 0.24)",
              color: "#c5b8ff",
            }}
          >
            <div style={statLabel}>HiFi Operations</div>
            <div style={{ marginTop: "4px", fontWeight: 800 }}>
              This event is currently classified as HiFi. SP staffing stays available if needed, but no active SP coverage target is driving the workflow.
            </div>
          </div>
        ) : null}

        {noSpStaffingRequired ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid rgba(44, 211, 173, 0.24)",
              borderRadius: "16px",
              padding: "16px",
              background: "rgba(44, 211, 173, 0.14)",
              color: "var(--cfsp-green)",
              fontWeight: 800,
            }}
          >
            No SP staffing required for this skills event.
          </div>
        ) : (
          <>
        {showEmailDraft ? (
          <div style={{ ...statCard, marginTop: "12px" }}>
            <div style={statLabel}>Email Draft Preview</div>
            <div style={{ marginTop: "8px", color: "var(--cfsp-text)", lineHeight: 1.7 }}>
              <div><strong>Recipients (BCC):</strong> {assignedBccEmails.length ? assignedBccEmails.join(", ") : "No selected staffing SP emails found."}</div>
              <div style={{ marginTop: "8px" }}><strong>Subject:</strong> {emailSubject}</div>
              <div style={{ marginTop: "8px", whiteSpace: "pre-wrap" }}><strong>Body:</strong>{"\n"}{emailBody}</div>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
          {[
            { value: "all", label: `All (${sortedAssignments.length})` },
            {
              value: "invited",
              label: `Invited (${sortedAssignments.filter((item) => getAssignmentStatus(item) === "invited").length})`,
            },
            {
              value: "confirmed",
              label: `Confirmed (${sortedAssignments.filter((item) => getAssignmentStatus(item) === "confirmed").length})`,
            },
            {
              value: "declined",
              label: `Declined (${sortedAssignments.filter((item) => getAssignmentStatus(item) === "declined").length})`,
            },
          ].map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setAssignmentFilter(filter.value as AssignmentFilterStatus)}
              style={{
                ...buttonStyle,
                background: assignmentFilter === filter.value ? "var(--cfsp-blue)" : "var(--cfsp-surface)",
                color: assignmentFilter === filter.value ? "#ffffff" : "var(--cfsp-text)",
                border: assignmentFilter === filter.value
                  ? "1px solid var(--cfsp-blue)"
                  : "1px solid var(--cfsp-border)",
                padding: "8px 12px",
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {trainingAttendancePanel}

        {assignments.length === 0 ? (
          <p style={{ color: "var(--cfsp-text-muted)", marginBottom: 0, marginTop: "14px" }}>
            No SPs assigned yet.
          </p>
        ) : filteredAssignments.length === 0 ? (
          <div
            style={{
              marginTop: "14px",
              border: "1px solid var(--cfsp-border)",
              borderRadius: "16px",
              padding: "16px",
              background: "var(--cfsp-surface-muted)",
              color: "var(--cfsp-text-muted)",
              fontWeight: 700,
            }}
          >
            No selected staffing SPs match the current filter.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "12px",
              marginTop: "12px",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            }}
          >
            {filteredAssignments.map((assignment) => {
              const sp = assignment.sp_id ? spsById.get(assignment.sp_id) : undefined;
              const status = getAssignmentStatus(assignment);
              const checkedAt = formatAttendanceTimestamp(assignment.training_checked_in_at);
              const email = sp ? getEmail(sp) : "";
              const isRecentlyAssigned = assignment.sp_id === recentAssignedSpId;

              return (
                <div
                  key={assignment.id}
                  style={{
                    border: "1px solid var(--cfsp-border)",
                    borderRadius: "16px",
                    padding: "12px 14px",
                    background: "var(--cfsp-surface)",
                    boxShadow: isRecentlyAssigned
                      ? "0 0 0 4px rgba(44, 211, 173, 0.18), 0 16px 34px rgba(0, 0, 0, 0.4)"
                      : "var(--cfsp-shadow)",
                    transform: isRecentlyAssigned ? "translateY(-2px)" : "translateY(0)",
                    transition: "box-shadow 180ms ease, transform 180ms ease",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gap: "10px",
                        gridTemplateColumns: "minmax(0, 1.4fr) minmax(150px, 220px) auto auto",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, color: "var(--cfsp-text)", fontSize: "18px" }}>
                          {sp ? getFullName(sp) : "Unknown SP"}
                        </h3>
                        <div style={{ marginTop: 6, color: "var(--cfsp-text-muted)", fontWeight: 700, lineHeight: 1.5 }}>
                          <div>{email || assignment.sp_id || "No SP id"}</div>
                          <div>{sp?.phone || "No phone on file"}</div>
                          {canManageTrainingAttendance && assignment.training_attended && checkedAt ? (
                            <div style={{ color: "var(--cfsp-green)", fontSize: "12px", fontWeight: 800 }}>
                              Checked in {checkedAt}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <label style={{ display: "grid", gap: "6px", minWidth: 0 }}>
                        <span style={statLabel}>Status</span>
                        <select
                          value={status}
                          onChange={(e) =>
                            handleStatusChange(assignment, e.target.value as AssignmentStatus)
                          }
                          disabled={saving}
                          style={{
                            ...selectStyle,
                            width: "100%",
                            maxWidth: "100%",
                            background: "var(--cfsp-surface)",
                          }}
                        >
                          {assignmentStatuses.map((option) => (
                            <option key={option} value={option}>
                              {assignmentStatusLabels[option]}
                            </option>
                          ))}
                        </select>
                      </label>

                      {canManageTrainingAttendance ? (
                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "fit-content",
                            borderRadius: "999px",
                            padding: "8px 12px",
                            background: assignment.training_attended ? "var(--cfsp-green-soft)" : "rgba(168, 183, 204, 0.12)",
                            border: assignment.training_attended
                              ? "1px solid rgba(44, 211, 173, 0.24)"
                              : "1px solid var(--cfsp-border)",
                            color: assignment.training_attended ? "var(--cfsp-green)" : "var(--cfsp-text-muted)",
                            fontSize: "12px",
                            fontWeight: 900,
                            cursor: attendanceSaving || trainingAttendanceFieldsMissing ? "not-allowed" : "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={assignment.training_attended === true}
                            disabled={attendanceSaving || trainingAttendanceFieldsMissing}
                            onChange={(event) => void handleTrainingAttendanceToggle(assignment, event.target.checked)}
                            style={{ width: "18px", height: "18px", accentColor: "var(--cfsp-green)" }}
                          />
                          Present
                        </label>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void handleRemoveAssignment(assignment)}
                        disabled={saving}
                        style={{
                          ...dangerButtonStyle,
                          opacity: saving ? 0.65 : 1,
                          minWidth: "96px",
                        }}
                      >
                        Remove
                      </button>
                    </div>

                    <details
                      style={{
                        border: "1px solid var(--cfsp-border)",
                        borderRadius: "14px",
                        background: "var(--cfsp-surface-muted)",
                        padding: "10px 12px",
                      }}
                    >
                      <summary style={{ cursor: "pointer", color: "var(--cfsp-text)", fontWeight: 800 }}>
                        Notes
                      </summary>
                      <div style={{ marginTop: "10px" }}>
                        <textarea
                          key={`${assignment.id}-${assignment.notes || ""}`}
                          defaultValue={assignment.notes || ""}
                          onBlur={(e) =>
                            handleAssignmentDetailsChange(assignment, {
                              notes: e.target.value.trim() || null,
                            })
                          }
                          placeholder="Add optional notes..."
                          disabled={saving}
                          style={{ ...textareaStyle, minHeight: "76px" }}
                        />
                      </div>
                    </details>
                  </div>

                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </div>
      ) : null}

      {false && !isTrainingMode ? (
      noSpStaffingRequired ? (
        <div
          style={{
            ...cardStyle,
            background: "rgba(44, 211, 173, 0.14)",
            borderColor: "rgba(44, 211, 173, 0.24)",
            color: "var(--cfsp-green)",
          }}
        >
          <h2 style={compactSectionTitleStyle}>SP Staffing</h2>
          <p style={{ ...compactSectionHintStyle, color: "var(--cfsp-green)" }}>
            No SP staffing required for this skills event.
          </p>
        </div>
      ) : (
      <div style={{ ...cardStyle, background: "var(--cfsp-surface-muted)", borderColor: "rgba(120, 180, 255, 0.24)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <h2 style={compactSectionTitleStyle}>Available / Suggested SPs</h2>
            <p style={compactSectionHintStyle}>
              {staffingRelevant
                ? "Review suggested SPs, check availability against event sessions, and assign from one place."
                : "Suggested-SP workflow stays available if HiFi staffing becomes relevant."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void handleFillRemainingSpots()}
              disabled={
                saving ||
                shortage <= 0 ||
                availableSps.filter((sp) => {
                  const status = availabilityMatchBySpId.get(sp.id)?.status || "unknown";
                  return status === "available" || status === "partial";
                }).length === 0
              }
              style={{ ...buttonStyle, opacity: saving || shortage <= 0 ? 0.65 : 1 }}
            >
              Fill Remaining Spots
            </button>
            <button
              type="button"
              onClick={() => setShowEmailDraft((current) => !current)}
              disabled={saving}
              style={{
                ...buttonStyle,
                background: "var(--cfsp-surface)",
                color: "var(--cfsp-text)",
                border: "1px solid rgba(120, 180, 255, 0.24)",
                opacity: saving ? 0.65 : 1,
              }}
            >
              {showEmailDraft ? "Hide Email Preview" : "Show Email Preview"}
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--cfsp-border)",
            borderRadius: "16px",
            padding: "14px",
            background: "var(--cfsp-surface)",
            display: "grid",
            gap: "10px",
            marginTop: "10px",
          }}
        >
          {assignmentSuccessMessage ? (
            <div
              style={{
                borderRadius: "14px",
                padding: "12px 14px",
                background: "var(--cfsp-green-soft)",
                border: "1px solid rgba(44, 211, 173, 0.24)",
                color: "var(--cfsp-green)",
                fontWeight: 900,
              }}
            >
              {assignmentSuccessMessage}
            </div>
          ) : null}

          <div
            style={{
              borderRadius: "14px",
              padding: "12px 14px",
              background: coverageStatus.background,
              border: coverageStatus.border,
              color: coverageStatus.color,
            }}
          >
            <div style={statLabel}>{activeEventTypeSet.has("hifi") ? "Operational Mode" : "Coverage Status"}</div>
            <div style={{ marginTop: "4px", fontSize: "18px", fontWeight: 900 }}>
              {activeEventTypeSet.has("hifi") && !staffingRelevant ? "HiFi event with no active SP staffing target" : coverageStatus.message}
            </div>
          </div>

          {staffingRelevant ? (
            <div style={{ ...statCard, display: "grid", gap: "12px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "10px",
                }}
              >
                {[
                  { label: "Needed", value: needed, tone: "var(--cfsp-text)" },
                  { label: "Confirmed", value: confirmedCount, tone: "var(--cfsp-green)" },
                  { label: "Available Responses", value: availablePollResponders.length, tone: "var(--cfsp-green)" },
                  { label: "Maybe", value: maybePollResponders.length, tone: "var(--cfsp-warning)" },
                  { label: "Unavailable", value: unavailablePollResponders.length, tone: "var(--cfsp-danger)" },
                  { label: "No Response", value: noResponsePollResponders.length, tone: "var(--cfsp-text-muted)" },
                ].map((item) => (
                  <div key={item.label} style={{ ...statCard, padding: "10px 12px", background: "var(--cfsp-surface)" }}>
                    <div style={statLabel}>{item.label}</div>
                    <div style={{ ...statValue, color: item.tone }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    borderRadius: "14px",
                    padding: "12px 14px",
                    background:
                      coverageRiskTone === "green"
                        ? "var(--cfsp-green-soft)"
                        : coverageRiskTone === "yellow"
                          ? "var(--cfsp-warning-soft)"
                          : "var(--cfsp-danger-soft)",
                    border:
                      coverageRiskTone === "green"
                        ? "1px solid rgba(44, 211, 173, 0.24)"
                        : coverageRiskTone === "yellow"
                          ? "1px solid rgba(243, 187, 103, 0.24)"
                          : "1px solid var(--cfsp-danger-border)",
                    color:
                      coverageRiskTone === "green"
                        ? "var(--cfsp-green)"
                        : coverageRiskTone === "yellow"
                          ? "var(--cfsp-warning)"
                          : "var(--cfsp-danger)",
                  }}
                >
                  <div style={statLabel}>Coverage Risk</div>
                  <div style={{ marginTop: "4px", fontSize: "18px", fontWeight: 900 }}>
                    {coverageRiskTone === "green" ? "Low" : coverageRiskTone === "yellow" ? "Medium" : "High"}
                  </div>
                  <div style={{ marginTop: "4px", fontWeight: 700 }}>{staffingHealthLabel}</div>
                </div>
                <div style={{ ...statCard, padding: "12px 14px", background: "var(--cfsp-surface)" }}>
                  <div style={statLabel}>Operational Staffing</div>
                  <div style={{ marginTop: "4px", color: "var(--cfsp-text)", fontWeight: 800 }}>
                    {selectedStaffingCount >= needed
                      ? "Coverage met"
                      : `Short by ${Math.max(needed - selectedStaffingCount, 0)}`}
                  </div>
                  <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                    {maybePollResponders.length
                      ? `Backup coverage available from ${maybePollResponders.length} maybe responder${maybePollResponders.length === 1 ? "" : "s"}.`
                      : "No backup responses yet."}
                  </div>
                  <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                    Poll response rate: {pollResponseRate}%
                  </div>
                </div>
              </div>

              {canManageAvailabilityPoll ? (
                <div
                  style={{
                    borderRadius: "14px",
                    padding: "12px 14px",
                    background: "var(--cfsp-surface)",
                    border: "1px solid rgba(73, 168, 255, 0.2)",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ ...statLabel, color: "var(--cfsp-blue)" }}>Find SPs to Poll</div>
                      <div style={{ marginTop: "4px", color: "var(--cfsp-text)", fontSize: "16px", fontWeight: 900 }}>
                        Recommended SPs to poll before staffing
                      </div>
                      <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                        Match candidates by location fit, contact readiness, activity, and existing response signals before sending the poll.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleAddRecommendedToPoll}
                        disabled={recommendedPollMatches.filter((entry) => entry.emailReady).length === 0}
                        style={{
                          ...buttonStyle,
                          opacity: recommendedPollMatches.filter((entry) => entry.emailReady).length === 0 ? 0.65 : 1,
                        }}
                      >
                        Add Recommended to Poll
                      </button>
                      <button
                        type="button"
                        onClick={handleAddAllFilteredToPoll}
                        disabled={pollMatchEntries.filter((entry) => entry.emailReady).length === 0}
                        style={{
                          ...buttonStyle,
                          background: "var(--cfsp-surface)",
                          color: "var(--cfsp-text)",
                          border: "1px solid var(--cfsp-border)",
                          opacity: pollMatchEntries.filter((entry) => entry.emailReady).length === 0 ? 0.65 : 1,
                        }}
                      >
                        Add All Filtered to Poll
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={statLabel}>Campus/location fit</span>
                      <select
                        value={pollMatchLocationFilter}
                        onChange={(event) => setPollMatchLocationFilter(event.target.value as PollLocationFilter)}
                        style={{ ...selectStyle, width: "100%" }}
                      >
                        <option value="any">Any location</option>
                        <option value="elkins_park">Elkins Park only</option>
                        <option value="center_city">Center City only</option>
                        <option value="virtual">Virtual/Telehealth only</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "6px" }}>
                      <span style={statLabel}>Keyword search</span>
                      <input
                        value={pollMatchKeyword}
                        onChange={(event) => setPollMatchKeyword(event.target.value)}
                        placeholder="Notes, skills, roles..."
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "end" }}>
                      {[
                        { label: "Active only", active: pollMatchActiveOnly, toggle: () => setPollMatchActiveOnly((current) => !current) },
                        { label: "Email ready only", active: pollMatchEmailReadyOnly, toggle: () => setPollMatchEmailReadyOnly((current) => !current) },
                        { label: "Available responders only", active: pollMatchAvailableRespondersOnly, toggle: () => setPollMatchAvailableRespondersOnly((current) => !current) },
                        { label: "Spanish", active: pollMatchSpanishOnly, toggle: () => setPollMatchSpanishOnly((current) => !current) },
                        { label: "Virtual ready", active: pollMatchTelehealthOnly, toggle: () => setPollMatchTelehealthOnly((current) => !current) },
                      ].map((filter) => (
                        <button
                          key={filter.label}
                          type="button"
                          onClick={filter.toggle}
                          style={{
                            ...buttonStyle,
                            padding: "8px 12px",
                            background: filter.active ? "var(--cfsp-blue)" : "var(--cfsp-surface)",
                            color: filter.active ? "#ffffff" : "var(--cfsp-text)",
                            border: filter.active ? "1px solid var(--cfsp-blue)" : "1px solid var(--cfsp-border)",
                          }}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        borderRadius: "12px",
                        border: "1px solid rgba(73, 168, 255, 0.18)",
                        background: "rgba(73, 168, 255, 0.06)",
                        padding: "12px",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                        Recommended SPs to Poll ({recommendedPollMatches.length})
                      </div>
                      {recommendedPollMatches.length ? (
                        recommendedPollMatches.map((entry) => (
                          <div
                            key={`poll-match-${entry.sp.id}`}
                            style={{
                              borderRadius: "12px",
                              border: "1px solid var(--cfsp-border)",
                              background: "var(--cfsp-surface)",
                              padding: "10px 12px",
                              display: "grid",
                              gap: "6px",
                            }}
                          >
                            <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                              {getFullName(entry.sp)}
                            </div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {entry.chips.length
                                ? entry.chips.map((chip) => (
                                    <span
                                      key={`${entry.sp.id}-${chip}`}
                                      style={{
                                        borderRadius: "999px",
                                        padding: "4px 8px",
                                        fontSize: "11px",
                                        fontWeight: 900,
                                        background: "rgba(73, 168, 255, 0.12)",
                                        border: "1px solid rgba(73, 168, 255, 0.22)",
                                        color: "var(--cfsp-blue)",
                                      }}
                                    >
                                      {chip}
                                    </span>
                                  ))
                                : (
                                  <span style={{ color: "var(--cfsp-text-muted)", fontSize: "12px", fontWeight: 700 }}>
                                    General candidate match
                                  </span>
                                )}
                            </div>
                            <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                              {entry.email || "No email on file"}
                              {entry.selected ? " · In current poll selection" : ""}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                          No SPs match the current pre-poll filters.
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        borderRadius: "12px",
                        border: "1px solid var(--cfsp-border)",
                        background: "var(--cfsp-surface)",
                        padding: "12px",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                        Filtered Candidate Pool ({pollMatchEntries.length})
                      </div>
                      <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                        Candidates update instantly from the filters above and feed directly into the poll selection.
                      </div>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {pollMatchEntries.slice(0, 8).map((entry) => (
                          <div
                            key={`poll-filter-${entry.sp.id}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(0, 1fr) auto",
                              gap: "8px",
                              alignItems: "center",
                              borderRadius: "12px",
                              border: "1px solid var(--cfsp-border)",
                              background: "var(--cfsp-surface-muted)",
                              padding: "10px 12px",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                                {getFullName(entry.sp)}
                              </div>
                              <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                                {entry.email || "No email on file"}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => addPollSelection([entry.sp.id], `${getFullName(entry.sp)} added to poll.`)}
                              disabled={!entry.emailReady}
                              style={{ ...buttonStyle, opacity: entry.emailReady ? 1 : 0.65 }}
                            >
                              {entry.selected ? "Selected" : "Add to Poll"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {canManageSpMatchMaker ? (
                <div
                  style={{
                    borderRadius: "14px",
                    padding: "12px 14px",
                    background: "var(--cfsp-surface)",
                    border: "1px solid rgba(61, 201, 184, 0.24)",
                    display: "grid",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ ...statLabel, color: "#7ee7db" }}>SP Match Maker</div>
                      <div style={{ marginTop: "4px", color: "var(--cfsp-text)", fontSize: "16px", fontWeight: 900 }}>
                        Ranked staffing recommendations
                      </div>
                      <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                        Confirmed responders rank first, followed by Available, Maybe, No response, and Avoid.
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {[
                      {
                        title: `Top Matches (${matchMakerTopMatches.length})`,
                        tone: "rgba(44, 211, 173, 0.14)",
                        border: "1px solid rgba(44, 211, 173, 0.24)",
                        rows: matchMakerTopMatches,
                        empty: "No top matches yet.",
                      },
                      {
                        title: `Backup Matches (${matchMakerBackupMatches.length})`,
                        tone: "rgba(243, 187, 103, 0.12)",
                        border: "1px solid rgba(243, 187, 103, 0.24)",
                        rows: matchMakerBackupMatches.slice(0, Math.max(needed, 4)),
                        empty: "No backup matches yet.",
                      },
                      {
                        title: `Avoid (${matchMakerAvoidList.length})`,
                        tone: "rgba(214, 69, 69, 0.08)",
                        border: "1px solid rgba(214, 69, 69, 0.2)",
                        rows: matchMakerAvoidList.slice(0, 6),
                        empty: "No avoid list entries.",
                      },
                    ].map((section) => (
                      <div
                        key={section.title}
                        style={{
                          borderRadius: "12px",
                          padding: "12px",
                          background: section.tone,
                          border: section.border,
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>{section.title}</div>
                        {section.rows.length ? (
                          section.rows.map((entry) => (
                            <div
                              key={`${section.title}-${entry.sp.id}`}
                              style={{
                                borderRadius: "12px",
                                border: "1px solid var(--cfsp-border)",
                                background: "var(--cfsp-surface)",
                                padding: "10px 12px",
                                display: "grid",
                                gap: "6px",
                              }}
                            >
                              <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>
                                {getFullName(entry.sp)}
                              </div>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                {entry.isConfirmed ? (
                                  <span
                                    style={{
                                      ...assignmentStatusStyles.confirmed,
                                      borderRadius: "999px",
                                      padding: "4px 8px",
                                      fontSize: "11px",
                                      fontWeight: 900,
                                    }}
                                  >
                                    Already confirmed
                                  </span>
                                ) : null}
                                <span
                                  style={{
                                    ...(entry.pollResponseStatus === "available"
                                      ? assignmentStatusStyles.confirmed
                                      : entry.pollResponseStatus === "maybe"
                                        ? assignmentStatusStyles.backup
                                        : entry.pollResponseStatus === "no_response"
                                          ? assignmentStatusStyles.invited
                                          : assignmentStatusStyles.declined),
                                    borderRadius: "999px",
                                    padding: "4px 8px",
                                    fontSize: "11px",
                                    fontWeight: 900,
                                  }}
                                >
                                  {entry.pollResponseStatus === "available"
                                    ? "Available"
                                    : entry.pollResponseStatus === "maybe"
                                      ? "Maybe"
                                      : entry.pollResponseStatus === "no_response"
                                        ? "No response"
                                        : "Not available"}
                                </span>
                                {getEmail(entry.sp) ? (
                                  <span
                                    style={{
                                      borderRadius: "999px",
                                      padding: "4px 8px",
                                      fontSize: "11px",
                                      fontWeight: 900,
                                      background: "rgba(73, 168, 255, 0.12)",
                                      border: "1px solid rgba(73, 168, 255, 0.24)",
                                      color: "var(--cfsp-blue)",
                                    }}
                                  >
                                    Email ready
                                  </span>
                                ) : null}
                                {entry.isAssigned ? (
                                  <span
                                    style={{
                                      borderRadius: "999px",
                                      padding: "4px 8px",
                                      fontSize: "11px",
                                      fontWeight: 900,
                                      background: "rgba(168, 183, 204, 0.12)",
                                      border: "1px solid var(--cfsp-border)",
                                      color: "var(--cfsp-text-muted)",
                                    }}
                                  >
                                    Already assigned
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                            {section.empty}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleClearSuggestedAssignments}
                  style={{
                    ...buttonStyle,
                    background: "var(--cfsp-surface)",
                    color: "var(--cfsp-text)",
                    border: "1px solid var(--cfsp-border)",
                  }}
                >
                  Clear Suggested Assignments
                </button>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { value: "all", label: `All (${pollResponderEntries.length})` },
                  { value: "available", label: `Available only (${availablePollResponders.length})` },
                  { value: "confirmed", label: `Confirmed only (${availablePollResponders.filter((entry) => entry.isConfirmed).length})` },
                  { value: "needs_outreach", label: `Needs outreach (${needsOutreachCount})` },
                  { value: "backup", label: `Backup candidates (${maybePollResponders.length})` },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setSuggestedAssignmentFilter(filter.value as SuggestedAssignmentFilter)}
                    style={{
                      ...buttonStyle,
                      padding: "8px 12px",
                      background: suggestedAssignmentFilter === filter.value ? "var(--cfsp-blue)" : "var(--cfsp-surface)",
                      color: suggestedAssignmentFilter === filter.value ? "#ffffff" : "var(--cfsp-text)",
                      border:
                        suggestedAssignmentFilter === filter.value
                          ? "1px solid var(--cfsp-blue)"
                          : "1px solid var(--cfsp-border)",
                    }}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "grid", gap: "8px" }}>
                {suggestedAssignmentRows.length === 0 ? (
                  <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                    No responders match this staffing filter yet.
                  </div>
                ) : (
                  suggestedAssignmentRows.slice(0, 10).map((entry) => {
                    const responseTone =
                      entry.pollResponseStatus === "available"
                        ? assignmentStatusStyles.confirmed
                        : entry.pollResponseStatus === "maybe"
                          ? assignmentStatusStyles.backup
                          : entry.pollResponseStatus === "not_available"
                            ? assignmentStatusStyles.declined
                            : assignmentStatusStyles.invited;
                    return (
                      <div
                        key={entry.sp.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1.5fr) auto",
                          gap: "10px",
                          alignItems: "center",
                          borderRadius: "14px",
                          padding: "10px 12px",
                          background: "var(--cfsp-surface)",
                          border: "1px solid var(--cfsp-border)",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: "var(--cfsp-text)", fontWeight: 900 }}>{getFullName(entry.sp)}</div>
                          <div style={{ marginTop: "4px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            <span style={{ ...responseTone, borderRadius: "999px", padding: "5px 8px", fontSize: "11px", fontWeight: 900 }}>
                              {entry.pollResponseStatus === "not_available"
                                ? "Not Available"
                                : entry.pollResponseStatus === "no_response"
                                  ? "No Response"
                                  : entry.pollResponseStatus === "available"
                                    ? "Available"
                                    : "Maybe"}
                            </span>
                            <span
                              style={{
                                ...availabilityMatchStyles[entry.availabilityMatch],
                                borderRadius: "999px",
                                padding: "5px 8px",
                                fontSize: "11px",
                                fontWeight: 900,
                              }}
                            >
                              {availabilityMatchLabels[entry.availabilityMatch]}
                            </span>
                            {entry.assignmentStatus ? (
                              <span
                                style={{
                                  ...assignmentStatusStyles[entry.assignmentStatus],
                                  borderRadius: "999px",
                                  padding: "5px 8px",
                                  fontSize: "11px",
                                  fontWeight: 900,
                                }}
                              >
                                {assignmentStatusLabels[entry.assignmentStatus]}
                              </span>
                            ) : null}
                          </div>
                          <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700, fontSize: "12px" }}>
                            {entry.isAssigned
                              ? entry.isConfirmed
                                ? "Already confirmed for this event."
                                : "Already assigned."
                              : entry.pollResponseStatus === "available"
                                ? "Ready to assign."
                                : entry.pollResponseStatus === "maybe"
                                  ? "Use as backup coverage."
                                  : "Needs outreach."}
                          </div>
                        </div>
                        {!entry.isAssigned && entry.pollResponseStatus !== "not_available" ? (
                          <button
                            type="button"
                            onClick={() => void handleAddAssignment(entry.sp.id)}
                            disabled={saving}
                            style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
                          >
                            {assigningSpId === entry.sp.id ? "Assigning..." : "Assign"}
                          </button>
                        ) : (
                          <span style={{ color: "var(--cfsp-text-muted)", fontWeight: 800, fontSize: "12px" }}>
                            {entry.isAssigned ? "Assigned" : "Do not assign"}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          <div
            style={{
              marginTop: "12px",
              border: "1px solid rgba(120, 180, 255, 0.24)",
              borderRadius: "16px",
              padding: "14px",
              background: "rgba(120, 180, 255, 0.08)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ ...statLabel, color: "var(--cfsp-text)" }}>Candidate SP Pool</div>
                <div style={{ marginTop: "4px", color: "var(--cfsp-text-muted)", fontWeight: 700 }}>
                  These SPs are not assigned yet. Browse the pool only when you need to add coverage.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCandidatePool((current) => !current)}
                style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
              >
                {showCandidatePool ? "Hide Candidate SPs" : "Browse Candidate SPs"}
              </button>
            </div>

            {showCandidatePool ? (
              <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
                <input
                  value={candidateQuery}
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  placeholder="Search by name, email, phone, notes, roles, or preferences..."
                  style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
                />

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {[
                    { label: "Active only", active: activeOnly, setActive: setActiveOnly },
                    { label: "Spanish-speaking", active: spanishOnly, setActive: setSpanishOnly },
                    { label: "Telehealth", active: telehealthOnly, setActive: setTelehealthOnly },
                    { label: "PT preferred", active: ptPreferredOnly, setActive: setPtPreferredOnly },
                    { label: "Available for event", active: availableForEventOnly, setActive: setAvailableForEventOnly },
                  ].map((filter) => (
                    <button
                      key={filter.label}
                      type="button"
                      onClick={() => filter.setActive((current) => !current)}
                      style={{
                        ...buttonStyle,
                        background: filter.active ? "var(--cfsp-blue)" : "var(--cfsp-surface)",
                        color: filter.active ? "#ffffff" : "var(--cfsp-text)",
                        padding: "8px 12px",
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={selectedSpId}
                    onChange={(e) => setSelectedSpId(e.target.value)}
                    style={selectStyle}
                    disabled={saving || availableSps.length === 0}
                  >
                    <option value="">
                      {availableSps.length === 0 ? "No matching unassigned SPs" : "Quick select an SP"}
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
                    onClick={() => void handleAddAssignment()}
                    disabled={saving || !selectedSpId}
                    style={{ ...buttonStyle, opacity: saving || !selectedSpId ? 0.65 : 1 }}
                  >
                    {assigningSpId && assigningSpId === selectedSpId ? "Assigning..." : "Add Selected SP"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

          {showCandidatePool ? (
          <div style={{ marginTop: "12px" }}>
          <div style={statLabel}>
            Available SP list · {availableSps.length} addable / {filteredCandidateSps.length} shown
          </div>
          <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
            {filteredCandidateSps.length === 0 ? (
              <div
                style={{
                  borderRadius: "12px",
                  padding: "12px 14px",
                  background: "rgba(255,255,255,0.72)",
                  color: "var(--cfsp-text-muted)",
                  fontWeight: 700,
                }}
              >
                No SPs match the current search and filters.
              </div>
            ) : (
              filteredCandidateSps.slice(0, 12).map((sp) => {
                const rows = availabilityBySpId.get(sp.id) || [];
                const availabilityMatch = availabilityMatchBySpId.get(sp.id) || {
                  status: "unknown" as AvailabilityMatchStatus,
                  matchedSessions: 0,
                  totalSessions: sessions.length,
                  reason: "No structured availability match data",
                };
                const assignment = assignmentsBySpId.get(sp.id);
                const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
                const demographics = [sp.portrayal_age, sp.race, sp.sex]
                  .map(asText)
                  .filter(Boolean)
                  .join(" / ");
                const roleDetails = [sp.telehealth, sp.pt_preferred, sp.other_roles]
                  .map(asText)
                  .filter(Boolean)
                  .join(" / ");

                return (
                  <div
                    key={sp.id}
                    style={{
                      ...statCard,
                      background:
                        availabilityMatch.status === "available"
                          ? "var(--cfsp-green-soft)"
                          : availabilityMatch.status === "none"
                            ? "rgba(168, 183, 204, 0.08)"
                            : "var(--cfsp-surface)",
                      border:
                        availabilityMatch.status === "available"
                          ? "1px solid rgba(44, 211, 173, 0.24)"
                          : availabilityMatch.status === "partial"
                            ? "1px solid rgba(243, 187, 103, 0.24)"
                            : availabilityMatch.status === "none"
                              ? "1px solid var(--cfsp-danger-border)"
                              : "1px solid var(--cfsp-border)",
                      opacity: availabilityMatch.status === "none" ? 0.75 : 1,
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
                        <div style={{ color: "var(--cfsp-text)", fontWeight: 900, fontSize: "18px" }}>
                          {getFullName(sp)}
                        </div>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                          {getSpTagLabels(sp).map((tag) => (
                            <span
                              key={`${sp.id}-tag-${tag}`}
                              style={{
                                borderRadius: "999px",
                                padding: "5px 8px",
                                background: "rgba(168, 183, 204, 0.12)",
                                border: "1px solid var(--cfsp-border)",
                                color: "var(--cfsp-text-muted)",
                                fontSize: "12px",
                                fontWeight: 800,
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div style={{ marginTop: "6px", color: "var(--cfsp-text)", lineHeight: 1.6 }}>
                          <div><strong>Email:</strong> {getEmail(sp) || "—"}</div>
                          <div><strong>Phone:</strong> {sp.phone || "—"}</div>
                          <div><strong>Portrayal / race / sex:</strong> {demographics || "—"}</div>
                          <div><strong>Roles / preferences:</strong> {roleDetails || "—"}</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                        <span
                          style={{
                            ...availabilityMatchStyles[availabilityMatch.status],
                            borderRadius: "999px",
                            padding: "8px 12px",
                            fontSize: "13px",
                            fontWeight: 900,
                            letterSpacing: "0.02em",
                          }}
                        >
                          {availabilityMatchLabels[availabilityMatch.status]}
                        </span>

                        {assignmentStatus ? (
                          <button
                            type="button"
                            disabled
                            style={{
                              ...(assignment ? confirmationStyles[getCommandCenterAssignmentTone(assignment)] : confirmationStyles.pending),
                              borderRadius: "999px",
                              padding: "7px 11px",
                              fontSize: "12px",
                              fontWeight: 900,
                              cursor: "not-allowed",
                              opacity: 0.85,
                            }}
                          >
                            {assignment
                              ? `Already ${getCommandCenterAssignmentLabel(assignment)}`
                              : "Already Assigned"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleAddAssignment(sp.id)}
                            disabled={saving || Boolean(assignmentStatus)}
                            style={{ ...buttonStyle, opacity: saving ? 0.65 : 1 }}
                          >
                            {assigningSpId === sp.id ? "Assigning..." : "Assign SP"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: "10px",
                        color:
                          availabilityMatch.status === "none"
                            ? "var(--cfsp-danger)"
                            : availabilityMatch.status === "available"
                              ? "var(--cfsp-green)"
                              : "var(--cfsp-text-muted)",
                        fontWeight: 800,
                      }}
                    >
                      Match reason: {availabilityMatch.reason}
                    </div>

                    <div style={{ marginTop: "10px", color: "var(--cfsp-text-muted)", whiteSpace: "pre-wrap" }}>
                      <strong>Availability rows:</strong> {formatAvailabilityRows(rows)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        ) : null}
      </div>
      )
      ) : null}
{false && canManageAvailabilityPoll ? (
  <div style={cardStyle}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "12px",
        marginBottom: "12px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2 style={compactSectionTitleStyle}>SP Availability Poll</h2>
        <p style={compactSectionHintStyle}>
          Select candidate SPs, draft the CFSP polling email, and track the poll without leaving the event.
        </p>
      </div>
      <div
        style={{
          borderRadius: "999px",
          padding: "7px 12px",
          fontSize: "12px",
          fontWeight: 900,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          background:
            pollStatusLabel === "sent"
              ? "rgba(44, 211, 173, 0.16)"
              : pollStatusLabel === "draft_ready"
                ? "rgba(47, 109, 229, 0.12)"
                : "rgba(168, 183, 204, 0.12)",
          color:
            pollStatusLabel === "sent"
              ? "var(--cfsp-green)"
              : pollStatusLabel === "draft_ready"
                ? "var(--cfsp-blue)"
                : "var(--cfsp-text-muted)",
          border:
            pollStatusLabel === "sent"
              ? "1px solid rgba(44, 211, 173, 0.28)"
              : pollStatusLabel === "draft_ready"
                ? "1px solid rgba(47, 109, 229, 0.2)"
                : "1px solid var(--cfsp-border)",
        }}
      >
        {pollStatusDisplayLabel}
      </div>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "10px",
        marginBottom: "14px",
      }}
    >
      <div style={statCard}>
        <div style={statLabel}>Selected SPs</div>
        <div style={statValue}>{pollSelectedCount}</div>
      </div>
      <div style={statCard}>
        <div style={statLabel}>Email Ready</div>
        <div style={statValue}>{pollReadyEmailCount}</div>
      </div>
      <div style={statCard}>
        <div style={statLabel}>Available</div>
        <div style={statValue}>{pollResponseSummary.availableCount}</div>
      </div>
      <div style={statCard}>
        <div style={statLabel}>Maybe</div>
        <div style={statValue}>{pollResponseSummary.maybeCount}</div>
      </div>
      <div style={statCard}>
        <div style={statLabel}>Not available</div>
        <div style={statValue}>{pollResponseSummary.notAvailableCount}</div>
      </div>
      <div style={statCard}>
        <div style={statLabel}>No response</div>
        <div style={statValue}>{pollResponseSummary.noResponseCount}</div>
      </div>
      <div style={statCard}>
        <div style={statLabel}>Created</div>
        <div style={{ ...statValue, fontSize: "14px" }}>{pollMetadata.pollCreatedAt ? pollCreatedLabel : "Not created"}</div>
      </div>
      <div style={statCard}>
        <div style={statLabel}>Sent</div>
        <div style={{ ...statValue, fontSize: "14px" }}>{pollMetadata.pollSentAt ? pollSentLabel : "Not sent"}</div>
      </div>
    </div>

    <div
      style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        marginBottom: "14px",
      }}
    >
      <button
        type="button"
        style={buttonStyle}
        onClick={() =>
          selectAllVisiblePollCandidates(
            filteredCandidateSps
              .filter((sp) => Boolean(getEmail(sp)))
              .map((sp) => String(sp.id))
          )
        }
        disabled={pollSaving || filteredCandidateSps.length === 0}
      >
        Select Visible SPs
      </button>
      <button
        type="button"
        style={{
          ...buttonStyle,
          background: "var(--cfsp-surface-muted)",
          color: "var(--cfsp-text)",
          border: "1px solid var(--cfsp-border)",
        }}
        onClick={clearPollSelection}
        disabled={pollSaving || pollSelectedCount === 0}
      >
        Clear Selection
      </button>
      <button
        type="button"
        style={{ ...buttonStyle, opacity: pollSaving ? 0.7 : 1 }}
        onClick={() => void handleCreatePoll()}
        disabled={pollSaving || !selectedPollSpIds.length || !pollSelectedEmails.length}
      >
        {pollSaving && pollStatusLabel !== "sent" ? "Saving..." : "Create Poll"}
      </button>
      <button
        type="button"
        style={{
          ...buttonStyle,
          background: "rgba(47, 109, 229, 0.12)",
          color: "var(--cfsp-blue)",
          border: "1px solid rgba(47, 109, 229, 0.22)",
        }}
        onClick={() => void handleDraftPollingEmail()}
        disabled={pollSaving || (!pollSelectedEmails.length && !pollSelectedSpEmailsFromMetadata.length)}
      >
        Draft Polling Email
      </button>
      <button
        type="button"
        style={{
          ...buttonStyle,
          background: "rgba(44, 211, 173, 0.14)",
          color: "var(--cfsp-green)",
          border: "1px solid rgba(44, 211, 173, 0.22)",
        }}
        onClick={() => void handleMarkPollSent()}
        disabled={
          pollSaving ||
          (!pollMetadata.pollCreatedAt && !selectedPollSpIds.length && !pollSelectedSpIdsFromMetadata.length)
        }
      >
        Mark Poll Sent
      </button>
    </div>

    <div
      style={{
        borderRadius: "14px",
        border: "1px solid var(--cfsp-border)",
        background: "var(--cfsp-surface-muted)",
        padding: "12px",
        marginBottom: "12px",
      }}
    >
      <div style={{ color: "var(--cfsp-text)", fontWeight: 800, marginBottom: "4px" }}>
        Draft email will BCC {pollReadyEmailCount} SP{pollReadyEmailCount === 1 ? "" : "s"}
      </div>
      <div style={{ color: "var(--cfsp-text-muted)", fontSize: "13px", lineHeight: 1.5 }}>
        Poll response link:{" "}
        <a href={eventPollLink} style={{ color: "var(--cfsp-blue)" }}>
          {eventPollLink}
        </a>
      </div>
    </div>

    <div style={statLabel}>
      Candidate SPs · {filteredCandidateSps.length} visible / {pollSelectedCount} selected
    </div>
    <div
      style={{
        maxHeight: "320px",
        overflowY: "auto",
        border: "1px solid var(--cfsp-border)",
        borderRadius: "14px",
        padding: "10px",
        background: "var(--cfsp-surface-muted)",
        marginTop: "8px",
      }}
    >
      {filteredCandidateSps.length === 0 ? (
        <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 700, padding: "6px 4px" }}>
          No candidate SPs match the current search and filters.
        </div>
      ) : (
        filteredCandidateSps.map((sp) => {
          const spId = String(sp.id);
          const checked = selectedPollSpIds.includes(spId);
          const email = getEmail(sp);

          return (
            <label
              key={spId}
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "12px",
                padding: "10px 6px",
                cursor: "pointer",
                borderBottom: "1px solid rgba(168, 183, 204, 0.16)",
              }}
            >
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePollSp(spId)}
                  disabled={!email}
                  style={{ marginTop: "2px" }}
                />
                <div>
                  <div style={{ fontWeight: 800, color: "var(--cfsp-text)" }}>{getFullName(sp)}</div>
                  <div style={{ fontSize: "12px", color: "var(--cfsp-text-muted)" }}>{email || "No email on file"}</div>
                </div>
              </div>
              {!email ? (
                <span
                  style={{
                    borderRadius: "999px",
                    padding: "5px 8px",
                    fontSize: "11px",
                    fontWeight: 800,
                    color: "var(--cfsp-warning)",
                    background: "rgba(243, 187, 103, 0.14)",
                    border: "1px solid rgba(243, 187, 103, 0.22)",
                  }}
                >
                  Email needed
                </span>
              ) : null}
            </label>
          );
        })
      )}
    </div>
  </div>
) : null}
      {canDeleteEvent ? (
        <section
          style={{
            ...cardStyle,
            border: "1px solid var(--cfsp-danger-border)",
            background: "var(--cfsp-danger-soft)",
          }}
        >
          <div style={{ display: "grid", gap: "10px" }}>
            <div>
              <div style={{ ...statLabel, color: "var(--cfsp-danger)" }}>Danger Zone</div>
              <h2 style={{ ...compactSectionTitleStyle, marginTop: "6px" }}>Delete Event</h2>
              <p style={{ ...compactSectionHintStyle, color: "var(--cfsp-text-muted)" }}>
                Permanently remove this event and its related sessions and SP assignments.
              </p>
            </div>
            <div style={{ color: "var(--cfsp-text)", fontWeight: 700 }}>
              Event: {event?.name || "Untitled event"}
            </div>
            <div>
              <button
                type="button"
                onClick={() => void handleDeleteEvent()}
                disabled={deletingEvent}
                style={{ ...dangerButtonStyle, opacity: deletingEvent ? 0.7 : 1 }}
              >
                {deletingEvent ? "Deleting..." : "Delete Event"}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {materialPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(3, 9, 17, 0.78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              width: "min(960px, 100%)",
              maxHeight: "calc(100vh - 48px)",
              borderRadius: "20px",
              overflow: "hidden",
              border: "1px solid rgba(61, 201, 184, 0.28)",
              background: "#0f2335",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.42)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                padding: "14px 16px",
                borderBottom: "1px solid rgba(120, 180, 255, 0.16)",
                background: "rgba(8, 20, 34, 0.88)",
              }}
            >
              <div>
                <div style={{ ...statLabel, color: "#7ee7db" }}>Preview</div>
                <div style={{ color: "#ffffff", fontWeight: 900, fontSize: "18px" }}>{materialPreview.title}</div>
                <div style={{ marginTop: "4px", color: "rgba(220, 239, 255, 0.68)", fontSize: "12px", fontWeight: 700 }}>
                  {materialPreview.fileName}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <a
                  href={materialPreview.openInNewTabUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...buttonStyle,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                    padding: "8px 12px",
                  }}
                >
                  Open in New Tab
                </a>
                <a
                  href={materialPreview.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  download={materialPreview.fileName}
                  style={{
                    ...buttonStyle,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                    padding: "8px 12px",
                  }}
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMaterialPreview(null);
                    setMaterialPreviewLoading(false);
                    setMaterialPreviewError("");
                    setMaterialPreviewText("");
                  }}
                  style={{
                    ...buttonStyle,
                    padding: "8px 12px",
                    background: "var(--cfsp-button-secondary-bg)",
                    color: "var(--cfsp-button-secondary-text)",
                    border: "1px solid var(--cfsp-button-secondary-border)",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div
              style={{
                minHeight: "min(72vh, 880px)",
                background: "#ffffff",
                position: "relative",
                display: "grid",
              }}
            >
              {materialPreview.kind === "unsupported" ? (
                <div
                  style={{
                    display: "grid",
                    gap: "12px",
                    alignContent: "center",
                    justifyItems: "start",
                    padding: "24px",
                    color: "#12314b",
                  }}
                >
                  <div style={{ fontSize: "18px", fontWeight: 900 }}>Inline preview is not supported for this document type.</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#50667c", lineHeight: 1.6 }}>
                    `.doc` and `.docx` files usually require a desktop app or browser plugin. Use `Open in New Tab` or `Download` instead.
                  </div>
                </div>
              ) : null}

              {materialPreview.kind === "text" ? (
                materialPreviewError ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      alignContent: "center",
                      padding: "24px",
                      color: "#12314b",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>Preview unavailable</div>
                    <div style={{ color: "#6a7d91", fontWeight: 700 }}>{materialPreviewError}</div>
                  </div>
                ) : materialPreviewLoading ? (
                  <div style={{ display: "grid", placeItems: "center", color: "#12314b", fontWeight: 800 }}>Loading preview...</div>
                ) : (
                  <pre
                    style={{
                      margin: 0,
                      padding: "20px",
                      whiteSpace: "pre-wrap",
                      overflow: "auto",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      color: "#12314b",
                      background: "#ffffff",
                    }}
                  >
                    {materialPreviewText || "This text file is empty."}
                  </pre>
                )
              ) : null}

              {materialPreview.kind === "image" ? (
                <>
                  {materialPreviewLoading ? (
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.84)", color: "#12314b", fontWeight: 800 }}>
                      Loading preview...
                    </div>
                  ) : null}
                  {materialPreviewError ? (
                    <div
                      style={{
                        display: "grid",
                        gap: "10px",
                        alignContent: "center",
                        padding: "24px",
                        color: "#12314b",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>Preview unavailable</div>
                      <div style={{ color: "#6a7d91", fontWeight: 700 }}>{materialPreviewError}</div>
                    </div>
                  ) : (
                    <Image
                      alt={materialPreview.title}
                      src={materialPreview.previewUrl}
                      width={1600}
                      height={1200}
                      unoptimized
                      onLoad={() => setMaterialPreviewLoading(false)}
                      onError={() => {
                        setMaterialPreviewLoading(false);
                        setMaterialPreviewError("The browser could not render this image preview.");
                      }}
                      style={{ width: "100%", height: "auto", maxHeight: "min(72vh, 880px)", objectFit: "contain", background: "#ffffff" }}
                    />
                  )}
                </>
              ) : null}

              {(materialPreview.kind === "pdf" || materialPreview.kind === "iframe") ? (
                <>
                  {materialPreviewLoading ? (
                    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.84)", color: "#12314b", fontWeight: 800, zIndex: 1 }}>
                      Loading preview...
                    </div>
                  ) : null}
                  {materialPreviewError ? (
                    <div
                      style={{
                        display: "grid",
                        gap: "10px",
                        alignContent: "center",
                        padding: "24px",
                        color: "#12314b",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>Inline preview unavailable</div>
                      <div style={{ color: "#6a7d91", fontWeight: 700, lineHeight: 1.6 }}>
                        {materialPreviewError}
                      </div>
                      <div style={{ color: "#6a7d91", fontWeight: 700, lineHeight: 1.6 }}>
                        If your browser blocks this preview, use `Open in New Tab` or `Download`.
                      </div>
                    </div>
                  ) : (
                    <iframe
                      title={materialPreview.title}
                      src={materialPreview.previewUrl}
                      onLoad={() => setMaterialPreviewLoading(false)}
                      onError={() => {
                        setMaterialPreviewLoading(false);
                        setMaterialPreviewError("The browser could not render this document inline.");
                      }}
                      style={{ width: "100%", height: "min(72vh, 880px)", border: "none", background: "#ffffff" }}
                    />
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </SiteShell>
  );
}
