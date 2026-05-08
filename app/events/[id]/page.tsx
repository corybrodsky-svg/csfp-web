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
type AssignmentFilterStatus = "all" | "invited" | "confirmed" | "declined";
type SuggestedAssignmentFilter = "all" | "available" | "confirmed" | "needs_outreach" | "backup";

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

type TrainingMaterialKind = "case_file" | "doorsign" | "supplemental_doc";
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
};
type PollResponseMetadata = {
  responseStatus: string;
  responseNote: string;
  responseSubmittedAt: string;
};
type PollResponseStatus = "available" | "maybe" | "not_available" | "no_response";
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
      | "supplemental_doc_url";
    nameKey:
      | "case_file_name"
      | "doorsign_file_name"
      | "supplemental_doc_name";
    storagePathKey:
      | "case_file_storage_path"
      | "doorsign_storage_path"
      | "supplemental_doc_storage_path";
    uploadedAtKey:
      | "case_file_uploaded_at"
      | "doorsign_uploaded_at"
      | "supplemental_doc_uploaded_at";
    uploadedByKey:
      | "case_file_uploaded_by"
      | "doorsign_uploaded_by"
      | "supplemental_doc_uploaded_by";
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
};

const relatedCopyOptionLabels: Record<RelatedCopyOption, string> = {
  assigned_sps: "Assigned SPs",
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
  if (status === "backup") return "Tentative";
  return "Assigned";
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
  if (["doc", "docx"].includes(extension)) return "unsupported";
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

function getAssignmentStatusRank(status: AssignmentStatus) {
  if (status === "confirmed") return 0;
  if (status === "contacted") return 1;
  if (status === "invited") return 2;
  if (status === "backup") return 3;
  if (status === "declined") return 4;
  return 5;
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

function getCoverageWorkflowTone(needed: number, confirmedCount: number, assignedCount: number) {
  if (needed <= 0) {
    return {
      background: "rgba(168, 183, 204, 0.12)",
      border: "1px solid var(--cfsp-border)",
      color: "var(--cfsp-text-muted)",
      label: "No target set",
    };
  }

  if (confirmedCount >= needed) {
    return {
      background: "var(--cfsp-green-soft)",
      border: "1px solid rgba(44, 211, 173, 0.24)",
      color: "var(--cfsp-green)",
      label: "Fully staffed",
    };
  }

  if (assignedCount > 0) {
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

const POLL_METADATA_START = "[CFSP_POLL_METADATA]";
const POLL_METADATA_END = "[/CFSP_POLL_METADATA]";
const POLL_METADATA_KEYS: Array<keyof PollMetadata> = [
  "pollCreatedAt",
  "pollSentAt",
  "pollSelectedSpIds",
  "pollSelectedSpEmails",
  "pollStatus",
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
  const [candidateQuery, setCandidateQuery] = useState("");
  const [showCandidatePool, setShowCandidatePool] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [spanishOnly, setSpanishOnly] = useState(false);
  const [telehealthOnly, setTelehealthOnly] = useState(false);
  const [ptPreferredOnly, setPtPreferredOnly] = useState(false);
  const [availableForEventOnly, setAvailableForEventOnly] = useState(false);
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilterStatus>("all");
  const [suggestedAssignmentFilter, setSuggestedAssignmentFilter] = useState<SuggestedAssignmentFilter>("all");
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
  });
  const caseFileInputRef = useRef<HTMLInputElement | null>(null);
  const doorsignInputRef = useRef<HTMLInputElement | null>(null);
  const supplementalDocInputRef = useRef<HTMLInputElement | null>(null);
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

  const sortedAssignments = useMemo(
    () =>
      [...assignments].sort((a, b) => {
        const aStatus = getAssignmentStatus(a);
        const bStatus = getAssignmentStatus(b);
        const rankDiff = getAssignmentStatusRank(aStatus) - getAssignmentStatusRank(bStatus);
        if (rankDiff !== 0) return rankDiff;

        const aSp = a.sp_id ? spsById.get(a.sp_id) : undefined;
        const bSp = b.sp_id ? spsById.get(b.sp_id) : undefined;
        return getFullName(aSp || emptySpRow).localeCompare(getFullName(bSp || emptySpRow));
      }),
    [assignments, spsById]
  );

  const filteredAssignments = useMemo(() => {
    if (assignmentFilter === "all") return sortedAssignments;
    return sortedAssignments.filter((assignment) => getAssignmentStatus(assignment) === assignmentFilter);
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

  const recommendedSps = useMemo(
    () =>
      availableSps
        .filter((sp) => {
          const matchStatus = availabilityMatchBySpId.get(sp.id)?.status || "unknown";
          if (matchStatus === "available") return isActiveSp(sp);
          return matchStatus === "partial";
        })
        .slice(0, 5),
    [availabilityMatchBySpId, availableSps]
  );

  const confirmedCount = assignments.filter(
    (assignment) => getAssignmentStatus(assignment) === "confirmed"
  ).length;
  const assignmentCount = assignments.length;
  const unconfirmedCount = Math.max(assignments.length - confirmedCount, 0);
  const needed = Number(event?.sp_needed || 0);
  const shortage = Math.max(needed - confirmedCount, 0);
  const workflowTone = getCoverageWorkflowTone(needed, confirmedCount, assignmentCount);
  const eventMeta = classifyEventPresentation({
    name: event?.name,
    status: event?.status,
    notes: event?.notes,
    location: event?.location,
    visibility: event?.visibility,
    spNeeded: needed,
    assignmentCount,
    confirmedCount,
    isWorkshop: isSkillsWorkshopEvent(needed, assignmentCount, confirmedCount),
  });
  const badgeAppearance = getEventBadgeAppearance(eventMeta.primaryBadgeKind);
  const isWorkshop = eventMeta.isSkillsWorkshop;
  const explicitEventTypes = getExplicitEventTypes(eventEditor.notes);
  const activeEventTypes = (explicitEventTypes.length
    ? explicitEventTypes
    : eventMeta.activeEventTypes) as EditableEventType[];
  const activeEventTypeSet = new Set(activeEventTypes);
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
          message: assignmentCount > 0 ? "Roster assigned" : "SP target not set",
          background: "rgba(168, 183, 204, 0.12)",
          border: "1px solid var(--cfsp-border)",
          color: "var(--cfsp-text-muted)",
        }
      : shortage === 0
        ? {
            message: "Coverage complete",
            background: "#ecfdf3",
            border: "1px solid #86efac",
            color: "#166534",
          }
        : {
            message: `${shortage} SP${shortage === 1 ? "" : "s"} still needed`,
            background: shortage <= 2 ? "#fff7ed" : "#fff5f5",
            border: shortage <= 2 ? "1px solid #fed7aa" : "1px solid #fecaca",
            color: shortage <= 2 ? "#9a3412" : "#991b1b",
          };
  const coveragePercent =
    needed > 0 ? Math.min(100, Math.round((confirmedCount / needed) * 100)) : 0;
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
  const assignedCount = assignmentCount;
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
    }>();

    activePollSelectedSpIds.forEach((spId) => {
      const sp = spsById.get(String(spId));
      if (!sp) return;
      const assignment = assignmentsBySpId.get(String(sp.id)) || null;
      const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
      byId.set(String(sp.id), {
        sp,
        assignment,
        assignmentStatus,
        pollResponseStatus: getPollResponseStatus(assignment?.notes),
        availabilityMatch: availabilityMatchBySpId.get(sp.id)?.status || "unknown",
        isAssigned: Boolean(assignment),
        isConfirmed: assignment ? isAssignmentConfirmed(assignment) : false,
        isActive: isActiveSp(sp),
        isTelehealthReady: hasTelehealth(sp),
        hasPtPreferred: hasPtPreferred(sp),
      });
    });

    activePollSelectedSpEmails.forEach((email) => {
      const sp = spByEmail.get(normalizeEmail(email));
      if (!sp) return;
      if (byId.has(String(sp.id))) return;
      const assignment = assignmentsBySpId.get(String(sp.id)) || null;
      const assignmentStatus = assignment ? getAssignmentStatus(assignment) : null;
      byId.set(String(sp.id), {
        sp,
        assignment,
        assignmentStatus,
        pollResponseStatus: getPollResponseStatus(assignment?.notes),
        availabilityMatch: availabilityMatchBySpId.get(sp.id)?.status || "unknown",
        isAssigned: Boolean(assignment),
        isConfirmed: assignment ? isAssignmentConfirmed(assignment) : false,
        isActive: isActiveSp(sp),
        isTelehealthReady: hasTelehealth(sp),
        hasPtPreferred: hasPtPreferred(sp),
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
      return getFullName(a.sp).localeCompare(getFullName(b.sp));
    });
  }, [
    activePollSelectedSpEmails,
    activePollSelectedSpIds,
    assignmentsBySpId,
    availabilityMatchBySpId,
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
  const pollResponseRate = pollResponderEntries.length
    ? Math.round(((availablePollResponders.length + maybePollResponders.length + unavailablePollResponders.length) / pollResponderEntries.length) * 100)
    : 0;
  const coverageGap = Math.max(needed - confirmedCount, 0);
  const availableCoverageCount = availablePollResponders.filter(
    (entry) => entry.isActive && entry.pollResponseStatus === "available" && entry.assignmentStatus !== "declined"
  ).length;
  const coverageRiskTone =
    confirmedCount >= needed
      ? "green"
      : confirmedCount + availableCoverageCount >= needed
        ? "yellow"
        : "red";
  const staffingHealthLabel =
    coverageRiskTone === "green"
      ? "Coverage met"
      : coverageRiskTone === "yellow"
        ? `Short by ${coverageGap}`
        : `Understaffed by ${coverageGap}`;
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
  const topMatchAssignmentCount = useMemo(() => {
    if (coverageGap <= 0) return 0;
    return matchMakerTopMatches.filter(
      (entry) =>
        !entry.isAssigned &&
        entry.pollResponseStatus !== "not_available" &&
        entry.assignmentStatus !== "declined" &&
        entry.isActive
    ).length;
  }, [coverageGap, matchMakerTopMatches]);
  const pollResponseSummary = useMemo(() => {
    const selectedIds = Array.from(new Set(activePollSelectedSpIds.map((item) => item.trim()).filter(Boolean)));
    let availableCount = 0;
    let maybeCount = 0;
    let notAvailableCount = 0;
    let respondedCount = 0;

    selectedIds.forEach((spId) => {
      const assignment = assignmentsBySpId.get(spId);
      const response = parsePollResponseMetadata(assignment?.notes);
      const status = asText(response.responseStatus).toLowerCase();
      if (!status) return;
      respondedCount += 1;
      if (status === "available") availableCount += 1;
      else if (status === "maybe") maybeCount += 1;
      else if (status === "not_available") notAvailableCount += 1;
    });

    return {
      totalSelected: selectedIds.length,
      availableCount,
      maybeCount,
      notAvailableCount,
      noResponseCount: Math.max(0, selectedIds.length - respondedCount),
    };
  }, [activePollSelectedSpIds, assignmentsBySpId]);
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

  async function persistPollMetadata(partial: Partial<PollMetadata>, successMessage: string) {
    const nextNotes = upsertPollMetadata(eventEditor.notes, partial);
    return persistTrainingNotes(nextNotes, successMessage);
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
            label: "SPs assigned",
            autoComplete: noSpStaffingRequired || assignmentCount > 0,
            detail: noSpStaffingRequired ? "SP assignment workflow suppressed." : `${assignmentCount} SP assignment${assignmentCount === 1 ? "" : "s"} recorded.`,
          },
          {
            id: "sps_contacted",
            label: "SPs contacted",
            autoComplete: noSpStaffingRequired || assignments.some((assignment) => Boolean(assignment.last_contacted_at) || ["contacted", "confirmed", "declined"].includes(getAssignmentStatus(assignment))),
            detail: noSpStaffingRequired ? "No SP outreach required." : "Contact activity is tracked from assignment status or last-contacted timestamp.",
          },
          {
            id: "sp_confirmations_complete",
            label: "SP confirmations complete",
            autoComplete: noSpStaffingRequired || (needed > 0 && confirmedCount >= needed),
            detail: noSpStaffingRequired ? "No confirmations required." : `${confirmedCount} confirmed of ${needed} needed.`,
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
      assignmentCount,
      assignments,
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
          : `${confirmedCount} confirmed / ${assignmentCount} assigned`,
        complete: noSpStaffingRequired || (needed > 0 ? confirmedCount >= needed : assignmentCount > 0),
        detail: noSpStaffingRequired
          ? "No SP staffing required."
          : needed > 0
            ? `${Math.max(needed - confirmedCount, 0)} still open`
            : assignmentCount > 0
              ? "Roster assigned"
              : "No roster yet",
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
      assignmentCount,
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
    options?: { status?: AssignmentStatus; confirmed?: boolean }
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
        await saveAssignmentRequest("POST", {
          sp_id: spId,
          status: options?.status,
          confirmed: options?.confirmed,
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

      await persistTrainingNotes(nextNotes, `${fieldConfig.label} saved to training materials.`);
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

      await persistTrainingNotes(nextNotes, `${fieldConfig.label} removed.`);
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

  async function handleAddAssignment(spId = selectedSpId) {
    if (!id || !spId) return;

    setSaving(true);
    setAssigningSpId(spId);
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      await saveAssignmentRequest("POST", {
        sp_id: spId,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save assignment.");
      setAssigningSpId("");
      setSaving(false);
      return;
    }

    await refreshData();
    setRecentAssignedSpId(spId);
    showSuccessMessage("SP assigned");
    window.setTimeout(() => {
      setRecentAssignedSpId("");
    }, 2400);
    setAssigningSpId("");
    setSaving(false);
  }

  async function handleStatusChange(assignment: AssignmentRow, status: AssignmentStatus) {
    setSaving(true);
    setAssigningSpId("");
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveMessage("");
    setEventSaveError("");

    try {
      await saveAssignmentRequest("PATCH", {
        assignment_id: assignment.id,
        updates: {
          status,
          confirmed: status === "confirmed",
          last_contacted_at:
            status === "contacted" ? new Date().toISOString() : assignment.last_contacted_at,
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not update assignment.");
      setSaving(false);
      return;
    }

    await refreshData();
    showSuccessMessage(`Updated to ${assignmentStatusLabels[status]}.`);
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
      setEventSaveError("No assigned SP emails are available for an email draft.");
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
      `Draft opened for ${assignedBccEmails.length} assigned SP${assignedBccEmails.length === 1 ? "" : "s"}.`
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
      showSuccessMessage("All assigned SPs are already confirmed.");
      return;
    }

    setSaving(true);
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveError("");
    setEventSaveMessage("");

    try {
      for (const assignment of pendingAssignments) {
        await saveAssignmentRequest("PATCH", {
          assignment_id: assignment.id,
          updates: {
            status: "confirmed",
            confirmed: true,
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

  async function handleAddTopMatches() {
    const topIds = recommendedSps.slice(0, 3).map((sp) => sp.id);

    await assignMultipleSpIds(
      topIds,
      `Added ${topIds.length} top match${topIds.length === 1 ? "" : "es"}.`
    );
  }

  async function handleAssignAvailablePollResponders() {
    const ids = availablePollResponders
      .filter((entry) => !entry.isAssigned && entry.isActive)
      .map((entry) => entry.sp.id);

    await assignMultipleSpIds(
      ids,
      `Assigned ${ids.length} available responder${ids.length === 1 ? "" : "s"}.`
    );
  }

  async function handleAssignTopPollMatches() {
    const ids = matchMakerTopMatches
      .filter(
        (entry) =>
          !entry.isAssigned &&
          entry.isActive &&
          entry.pollResponseStatus !== "not_available" &&
          entry.assignmentStatus !== "declined"
      )
      .slice(0, coverageGap)
      .map((entry) => entry.sp.id);

    await assignMultipleSpIds(
      ids,
      `Assigned ${ids.length} top match${ids.length === 1 ? "" : "es"}.`
    );
  }

  async function handleBulkAssignmentStatusUpdate(
    assignmentsToUpdate: AssignmentRow[],
    status: AssignmentStatus,
    successMessage: string
  ) {
    if (!assignmentsToUpdate.length) {
      showSuccessMessage(successMessage);
      return;
    }

    setSaving(true);
    setAssignmentSuccessMessage("");
    setErrorMessage("");
    setEventSaveError("");
    setEventSaveMessage("");

    try {
      for (const assignment of assignmentsToUpdate) {
        await saveAssignmentRequest("PATCH", {
          assignment_id: assignment.id,
          updates: {
            status,
            confirmed: status === "confirmed",
          },
        });
      }
      await refreshData();
      showSuccessMessage(successMessage);
    } catch (error) {
      setEventSaveError(error instanceof Error ? error.message : "Could not update suggested assignments.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConvertAvailableToConfirmed() {
    const assignmentsToUpdate = availablePollResponders
      .filter((entry) => entry.assignment && !entry.isConfirmed && entry.assignmentStatus !== "declined")
      .map((entry) => entry.assignment)
      .filter((assignment): assignment is AssignmentRow => Boolean(assignment));

    await handleBulkAssignmentStatusUpdate(
      assignmentsToUpdate,
      "confirmed",
      assignmentsToUpdate.length
        ? `Confirmed ${assignmentsToUpdate.length} available responder${assignmentsToUpdate.length === 1 ? "" : "s"}.`
        : "No available assigned responders needed confirmation."
    );
  }

  async function handleMoveMaybeToBackup() {
    const assignmentsToUpdate = maybePollResponders
      .filter((entry) => entry.assignment && entry.assignmentStatus !== "backup" && entry.assignmentStatus !== "declined")
      .map((entry) => entry.assignment)
      .filter((assignment): assignment is AssignmentRow => Boolean(assignment));

    await handleBulkAssignmentStatusUpdate(
      assignmentsToUpdate,
      "backup",
      assignmentsToUpdate.length
        ? `Moved ${assignmentsToUpdate.length} maybe responder${assignmentsToUpdate.length === 1 ? "" : "s"} to backup.`
        : "No maybe responders needed a backup update."
    );
  }

  function handleClearSuggestedAssignments() {
    setSuggestedAssignmentFilter("all");
    showSuccessMessage("Suggested assignments reset.");
  }

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

        <div
          style={{
            marginTop: "10px",
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            alignItems: "start",
          }}
        >
          <div
            style={{
              border: "1px solid rgba(73, 168, 255, 0.24)",
              borderRadius: "18px",
              padding: "14px",
              background: "linear-gradient(180deg, rgba(17, 31, 48, 0.94) 0%, rgba(20, 43, 62, 0.9) 100%)",
            }}
          >
            <div style={{ ...statLabel, color: "#7ee7db" }}>Event Summary</div>
            <div style={{ ...detailGridStyle, marginTop: "8px", gap: "8px" }}>
              <div style={statCard}>
                <div style={statLabel}>Event Name</div>
                <div style={statValue}>{event.name || "Untitled Event"}</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>Status</div>
                <div style={statValue}>{event.status || "No status"}</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>Location</div>
                <div style={statValue}>{event.location || "Location TBD"}</div>
              </div>
              {!isTrainingMode ? (
                <>
                  <div style={statCard}>
                    <div style={statLabel}>SP Needed</div>
                    <div style={statValue}>{needed}</div>
                  </div>
                  <div style={statCard}>
                    <div style={statLabel}>Assigned</div>
                    <div style={{ ...statValue, color: "var(--cfsp-blue)" }}>{assignedCount}</div>
                  </div>
                  <div style={statCard}>
                    <div style={statLabel}>{isWorkshop ? "Workshop" : "Shortage"}</div>
                    <div
                      style={{
                        ...statValue,
                        color: isWorkshop ? "var(--cfsp-green)" : shortage > 0 ? "var(--cfsp-warning)" : "var(--cfsp-green)",
                      }}
                    >
                      {isWorkshop ? "Skills Workshop" : shortageCount}
                    </div>
                  </div>
                </>
              ) : (
                <div style={statCard}>
                  <div style={statLabel}>Assigned SPs</div>
                  <div style={statValue}>
                    {assignedCount} assigned / {confirmedCount} confirmed
                  </div>
                </div>
              )}
              <div style={statCard}>
                <div style={statLabel}>Date</div>
                <div style={statValue}>{sessionSummaryLabel}</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>Time</div>
                <div style={statValue}>{summaryTimeLabel}</div>
              </div>
            </div>

            {sessions.length ? (
            <div style={{ marginTop: "10px" }}>
              <div style={statLabel}>Sessions</div>
              {hiddenExtraBackendRounds > 0 ? (
                <div style={{ marginTop: "6px", color: "var(--cfsp-warning)", fontSize: "12px", fontWeight: 800 }}>
                  Extra backend room slots are hidden because learner capacity only requires {rotationRounds.length} rotation round{rotationRounds.length === 1 ? "" : "s"}.
                </div>
              ) : null}
              <div style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                {rotationRounds.map((round, index) => (
                  <div
                    key={round.key}
                    style={{
                      borderRadius: "18px",
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "rgba(15, 23, 42, 0.92)",
                      padding: "18px",
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.35rem",
                        fontWeight: 800,
                        color: "#f8fafc",
                      }}
                    >
                      Round {index + 1}
                    </div>

                    <div
                      style={{
                        color: "#cbd5e1",
                        fontSize: "1rem",
                        fontWeight: 600,
                      }}
                    >
                      {formatRotationRoundLabel(round, importedYearHint)}
                    </div>

                    <div
                      style={{
                        color: "#94a3b8",
                        fontSize: "0.95rem",
                      }}
                    >
                      {round.rooms.length} rooms
                    </div>
                  </div>
                ))}
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
              border: "1px solid rgba(61, 201, 184, 0.26)",
              borderRadius: "18px",
              padding: "14px",
              background: "linear-gradient(180deg, rgba(13, 37, 46, 0.96) 0%, rgba(12, 27, 41, 0.94) 100%)",
              boxShadow: "0 16px 32px rgba(8, 20, 34, 0.28)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ ...statLabel, color: "#7ee7db" }}>Faculty / Contact</div>
                <div style={{ marginTop: "4px", color: "#d6f6f2", fontSize: "18px", fontWeight: 900 }}>
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
                <span style={{ ...statLabel, color: "#93dbd3" }}>Faculty name</span>
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
                <span style={{ ...statLabel, color: "#93dbd3" }}>Program / course</span>
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
                <span style={{ ...statLabel, color: "#93dbd3" }}>Email</span>
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
                <span style={{ ...statLabel, color: "#93dbd3" }}>Phone</span>
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
                <span style={{ ...statLabel, color: "#93dbd3" }}>Sim team / event lead</span>
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
                <span style={{ ...statLabel, color: "#93dbd3" }}>Internal notes</span>
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
                    <div><strong>BCC:</strong> {assignedBccEmails.length ? assignedBccEmails.join(", ") : "No assigned SP emails found."}</div>
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
                  <h2 style={compactSectionTitleStyle}>Assigned SPs</h2>
                  <p style={compactSectionHintStyle}>
                    {assignedCount} assigned / {confirmedCount} confirmed
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
                    background: item.complete ? "rgba(44, 211, 173, 0.08)" : "rgba(255,255,255,0.66)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                    <div style={statLabel}>{item.label}</div>
                    <span
                      style={{
                        borderRadius: "999px",
                        padding: "4px 8px",
                        background: item.complete ? "var(--cfsp-green-soft)" : "var(--cfsp-warning-soft)",
                        color: item.complete ? "var(--cfsp-green)" : "var(--cfsp-warning)",
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
                                  background: complete ? "var(--cfsp-green-soft)" : "rgba(168, 183, 204, 0.12)",
                                  border: complete ? "1px solid rgba(44, 211, 173, 0.24)" : "1px solid var(--cfsp-border)",
                                  color: complete ? "var(--cfsp-green)" : "var(--cfsp-text-muted)",
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
                    background: item.complete ? "rgba(44, 211, 173, 0.08)" : "rgba(255,255,255,0.7)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                    <div style={statLabel}>{item.label}</div>
                    <span
                      style={{
                        borderRadius: "999px",
                        padding: "4px 8px",
                        background: item.complete ? "var(--cfsp-green-soft)" : "var(--cfsp-warning-soft)",
                        color: item.complete ? "var(--cfsp-green)" : "var(--cfsp-warning)",
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
                                  background: complete ? "var(--cfsp-green-soft)" : "rgba(168, 183, 204, 0.12)",
                                  border: complete ? "1px solid rgba(44, 211, 173, 0.24)" : "1px solid var(--cfsp-border)",
                                  color: complete ? "var(--cfsp-green)" : "var(--cfsp-text-muted)",
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
                  ? `${assignedCount} assigned SP${assignedCount === 1 ? "" : "s"} · Rotation schedule ${
                      rotationScheduleBuilt ? "built" : "not built"
                    }`
                  : isWorkshop
                  ? "No SP staffing required for this event"
                  : needed > 0
                    ? `${coveragePercent}% confirmed coverage`
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

      {!isTrainingMode ? (
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
                ? "Manage assigned SPs for the training, remove anyone who should not attend, and add more from the existing SP roster."
                : noSpStaffingRequired
                ? "This skills event does not require SP staffing."
                : staffingRelevant
                ? "Manage assigned SPs, update contact status, and confirm coverage without leaving the page."
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
                  {assignedCount} assigned / {confirmedCount} confirmed
                </div>
                <div style={{ color: "var(--cfsp-text-muted)", fontWeight: 800 }}>
                  {assignedBccEmails.length} assigned SP email{assignedBccEmails.length === 1 ? "" : "s"} ready
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
                  {unconfirmedCount} still need attention
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
              <div><strong>Recipients (BCC):</strong> {assignedBccEmails.length ? assignedBccEmails.join(", ") : "No assigned SP emails found."}</div>
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
            No assigned SPs match the current filter.
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

      {!isTrainingMode ? (
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
              onClick={() => void handleAddTopMatches()}
              disabled={saving || recommendedSps.length === 0}
              style={{
                ...buttonStyle,
                background: "var(--cfsp-surface)",
                color: "var(--cfsp-text)",
                border: "1px solid var(--cfsp-border)",
                opacity: saving || recommendedSps.length === 0 ? 0.65 : 1,
              }}
            >
              Add Top 3 Matches
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
                    {confirmedCount >= needed
                      ? "Coverage met"
                      : `Short by ${Math.max(needed - confirmedCount, 0)}`}
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
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => void handleAssignTopPollMatches()}
                        disabled={saving || topMatchAssignmentCount === 0}
                        style={{ ...buttonStyle, opacity: saving || topMatchAssignmentCount === 0 ? 0.65 : 1 }}
                      >
                        Assign Top Matches
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMoveMaybeToBackup()}
                        disabled={saving || maybePollResponders.filter((entry) => entry.assignment).length === 0}
                        style={{ ...buttonStyle, opacity: saving || maybePollResponders.filter((entry) => entry.assignment).length === 0 ? 0.65 : 1 }}
                      >
                        Move Maybes to Backup
                      </button>
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
                  onClick={() => void handleAssignAvailablePollResponders()}
                  disabled={saving || availablePollResponders.filter((entry) => !entry.isAssigned && entry.isActive).length === 0}
                  style={{ ...buttonStyle, opacity: saving || availablePollResponders.filter((entry) => !entry.isAssigned && entry.isActive).length === 0 ? 0.65 : 1 }}
                >
                  Assign Available SPs
                </button>
                <button
                  type="button"
                  onClick={() => void handleAssignTopPollMatches()}
                  disabled={saving || topMatchAssignmentCount === 0}
                  style={{ ...buttonStyle, opacity: saving || topMatchAssignmentCount === 0 ? 0.65 : 1 }}
                >
                  Assign Top Matches
                </button>
                <button
                  type="button"
                  onClick={() => void handleConvertAvailableToConfirmed()}
                  disabled={saving || availablePollResponders.filter((entry) => entry.assignment && !entry.isConfirmed).length === 0}
                  style={{ ...buttonStyle, opacity: saving || availablePollResponders.filter((entry) => entry.assignment && !entry.isConfirmed).length === 0 ? 0.65 : 1 }}
                >
                  Convert Available → Confirmed
                </button>
                <button
                  type="button"
                  onClick={() => void handleMoveMaybeToBackup()}
                  disabled={saving || maybePollResponders.filter((entry) => entry.assignment).length === 0}
                  style={{ ...buttonStyle, opacity: saving || maybePollResponders.filter((entry) => entry.assignment).length === 0 ? 0.65 : 1 }}
                >
                  Move Maybe → Backup
                </button>
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
{canManageAvailabilityPoll ? (
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
