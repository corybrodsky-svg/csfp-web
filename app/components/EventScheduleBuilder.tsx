"use client";

import * as XLSX from "xlsx";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { jsPDF as JsPDFClass } from "jspdf";
import { formatHumanDate, getImportedYearHint } from "../lib/eventDateUtils";
import { formatDisplayTimeFromMinutes } from "../lib/timeFormat";
import { parseEventMetadata, upsertEventMetadata } from "../lib/eventMetadata";
import { hasOversizedScheduleWorkflowMetadata, sanitizeScheduleWorkflowNotes } from "../lib/scheduleWorkflowNotes";
import { normalizeDisplayText, normalizeLearnerName, normalizeLearnerNames } from "../lib/learnerNames";
import { getRoomDisplayLabel, getRoomDisplayLabelFromIndex, getRoomTypeLabel } from "../lib/roomNaming";
import {
  buildRoundAnnouncementCueTimeline,
  parseAnnouncementScheduleFromNotes,
} from "../lib/announcementSchedule";
import {
  formatRoundRhythmBreakdown,
  getExpectedSchedulePreviewRoundCount,
  getSchedulePreviewRounds,
  type SchedulePreviewRound,
} from "../lib/schedulePreviewGuardrails";
import {
  getFacultySimOpsInstructionsConfigFromMetadata,
  getStudentInstructionsConfigFromMetadata,
  splitInstructionLines,
  type FacultySimOpsInstructionsConfig,
  type StudentInstructionsConfig,
} from "../lib/studentInstructionsConfig";
import {
  buildStudentListRequestDraft,
  buildStudentListRequestMailtoHref,
  extractStudentListFacultyEmails,
} from "../lib/studentListRequestEmail";

type EventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  sp_needed: number | null;
  notes: string | null;
  earliest_session_date?: string | null;
  earliest_session_start?: string | null;
  latest_session_end?: string | null;
  assigned_sp_names?: string[] | null;
  total_assignments?: number | null;
  confirmed_assignments?: number | null;
};

type EventsResponse = {
  events?: EventRow[];
  error?: string;
};

type ScheduleCompanionView = "announcements" | "student" | "sp" | "operations" | "attendance";
type ScheduleBuilderViewMode = "student" | "operations";
type SchedulePreviewFamily = "ticket" | "schedule";

type EventScheduleBuilderProps = {
  fixedEventId?: string;
  backHref?: string;
  backLabel?: string;
  expandedWorkspace?: boolean;
  initialRoundNumber?: number | null;
  initialRoundKey?: string;
  initialCompanionView?: ScheduleCompanionView | null;
  initialScheduleViewMode?: ScheduleBuilderViewMode | null;
  initialPreviewKind?: SchedulePreviewKind | null;
  previewFamily?: SchedulePreviewFamily | null;
  previewOnly?: boolean;
  autoDownload?: boolean;
  autoDownloadMode?: "schedule" | "student-instructions" | "faculty-simops-instructions";
  initialScheduleDay?: number | null;
};

const RESUME_WORK_STORAGE_KEY = "cfsp:command-module-resume:v1";
const MAX_RESUME_WORK_ITEMS = 8;

type DayBlockType =
  | "break"
  | "checklist"
  | "soap_notes"
  | "feedback"
  | "debrief"
  | "lunch"
  | "transition"
  | "custom";

type DayBlockPlacement =
  | "before_rotations"
  | "after_each_rotation"
  | "after_every_x_rotations"
  | "after_rotations"
  | "specific_time";

type DayBlockVisibility = "student" | "operations" | "both";

type ChecklistPlacement = "before_encounter" | "before_feedback" | "after_feedback";

type SchedulePreviewKind = "timeline" | "student" | "sp" | "operations" | "rotation" | "announcements";

type DayBlockConfig = {
  id: string;
  type: DayBlockType;
  label: string;
  durationMinutes: string;
  placement: DayBlockPlacement;
  placementInterval: string;
  specificTime: string;
  visibleTo: DayBlockVisibility;
};

type TimelineBlock = {
  label: string;
  start: number;
  end: number;
  detail?: string;
  tone: "setup" | "prebrief" | "rotation" | "wrap";
  prebriefType?: "student" | "faculty" | "sp";
  visibleTo?: DayBlockVisibility;
};

type RoundSubBlock = {
  label: string;
  start: number;
  end: number;
  visibleTo?: DayBlockVisibility;
};

type GeneratedRoomSlot = {
  roomName: string;
  roomType: "exam" | "flex";
  capacity: number;
  capacityLabel: string;
  caseLabel?: string;
  caseIndex?: number;
};

type ScheduleSlotActivityState = Pick<GeneratedRoomSlot, "roomType" | "capacity" | "caseLabel"> & {
  learnerLabels?: string[];
  roleId?: string;
  roleLabel?: string;
  stationStatus?: ScheduleStationStatus;
  isBackupStation?: boolean;
};

type ScheduleStationStatus = "active" | "backup" | "inactive";

function normalizeScheduleStationStatus(value: unknown): ScheduleStationStatus | "" {
  const normalized = normalizeDisplayText(value).toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "backup" || normalized === "standby") return "backup";
  if (normalized === "inactive" || normalized === "empty") return "inactive";
  return "";
}

function isActiveScheduleSlot(slot: ScheduleSlotActivityState, singleCaseMode: boolean) {
  const stationStatus = normalizeScheduleStationStatus(slot.stationStatus);
  if (stationStatus === "inactive" || stationStatus === "backup" || slot.isBackupStation) return false;
  if (stationStatus === "active") return true;
  if (slot.roomType !== "exam" || slot.capacity <= 0) return false;
  if (singleCaseMode) return true;
  return Boolean(normalizeDisplayText(slot.caseLabel) || (slot.learnerLabels?.length || 0));
}

function isExcludedFromStudentFacingSchedule(slot: Pick<ScheduleSlotActivityState, "stationStatus" | "isBackupStation">) {
  const stationStatus = normalizeScheduleStationStatus(slot.stationStatus);
  return stationStatus === "inactive" || stationStatus === "backup" || Boolean(slot.isBackupStation);
}

function hasExplicitStudentFacingRoomStatus(slot: Pick<ScheduleSlotActivityState, "stationStatus" | "isBackupStation">) {
  return !isExcludedFromStudentFacingSchedule(slot) && normalizeScheduleStationStatus(slot.stationStatus) === "active";
}

function shouldIncludeStudentFacingScheduleSlot(slot: ScheduleSlotActivityState) {
  if (isExcludedFromStudentFacingSchedule(slot)) return false;
  if (hasExplicitStudentFacingRoomStatus(slot)) return true;
  return normalizeLearnerNames(slot.learnerLabels || []).length > 0;
}

function hasStudentFacingCaseStationIdentity(slot: ScheduleSlotActivityState) {
  if (isExcludedFromStudentFacingSchedule(slot)) return false;
  return Boolean(
    normalizeDisplayText(slot.caseLabel) ||
      normalizeDisplayText(slot.roleId) ||
      normalizeDisplayText(slot.roleLabel) ||
      hasExplicitStudentFacingRoomStatus(slot)
  );
}

type GeneratedRound = {
  round: number;
  start: number;
  end: number;
  roomSlots: GeneratedRoomSlot[];
  subBlocks: RoundSubBlock[];
};

type RoundGenerationValidation = {
  generated: boolean;
  expectedRounds: number;
  generatedRounds: number;
  generatedMinutes: number;
  computedEndMinutes: number;
  stoppedByWindow: boolean;
  stoppedByRoundLimit: boolean;
  invalid: boolean;
  reason: string;
  lastRoundEnd: number;
};

type ScheduledRoomSlot = GeneratedRoomSlot & {
  learnerLabels: string[];
  learnerIndexes: number[];
  assignedSpIndex?: number;
  assignedSpName?: string;
  caseLabel?: string;
  caseIndex?: number;
  backupSpName?: string;
  roleId?: string;
  roleLabel?: string;
  notes?: string;
  stationStatus?: ScheduleStationStatus;
  isBackupStation?: boolean;
};

type ScheduledRound = Omit<GeneratedRound, "roomSlots"> & {
  roomSlots: ScheduledRoomSlot[];
};

type PreviewRoomColumn = {
  slotIndex: number;
  roomName: string;
  displayRoomName: string;
  roomType: GeneratedRoomSlot["roomType"];
  capacityLabel: string;
};

type ScheduleCaseDefinition = {
  id: string;
  name: string;
  documentName?: string;
  hasDocument?: boolean;
  encounterMinutes?: number;
  checklistMinutes?: number;
  feedbackMinutes?: number;
  roomAssignment?: string;
  notes?: string;
  active: boolean;
};

type ScheduleGridPreviewRow =
  | {
      key: string;
      kind: "wide";
      start: number;
      end: number;
      block: TimelineBlock;
    }
  | {
      key: string;
      kind: "round";
      start: number;
      end: number;
      round: ScheduledRound;
    };

type ScheduleBuilderDraft = {
  builderMode: "simple" | "advanced";
  scheduleViewMode: "student" | "operations";
  selectedEventId: string;
  learnerFileName: string;
  originalUploadedLearners: string[];
  uploadedLearners: string[];
  startTime: string;
  staffArrivalTime: string;
  spArrivalTime: string;
  facultyArrivalTime: string;
  roomSetupMinutes: string;
  studentPrebriefMinutes: string;
  spPrebriefMinutes: string;
  facultyPrebriefMinutes: string;
  sessionLengthMinutes: string;
  roundCount: string;
  examRoomCount: string;
  flexRoomCount: string;
  roomCapacity: string;
  maxPairsPerFlexRoom: string;
  encounterMinutes: string;
  postEncounterBlock: "checklist" | "break" | "other";
  postEncounterMinutes: string;
  dayBlocks: DayBlockConfig[];
  manualRoundOverride: boolean;
  checklistEnabled: boolean;
  checklistMinutes: string;
  checklistPlacement: ChecklistPlacement;
  soapMinutes: string;
  feedbackMinutes: string;
  transitionMinutes: string;
  includeChecklist: boolean;
  includeSoap: boolean;
  includeFeedback: boolean;
  includeDebrief: boolean;
  includeBreakdown: boolean;
  debriefMinutes: string;
  breakdownMinutes: string;
  multipleCasesEnabled?: boolean;
  scheduleCaseDefinitions?: ScheduleCaseDefinition[];
  snapshotVersion?: number;
  scheduleStatus?: "complete" | "in_progress";
  scheduleRoundCount?: number;
  scheduleRoomCount?: number;
  scheduleRoomCapacity?: number;
  scheduleLearnerRoster?: string[];
  scheduleActiveCaseCount?: number;
  scheduleFlexRoomCount?: number;
  caseRotationRequired?: boolean;
  eventDate?: string;
  scheduleStructureSignature?: string;
  resolvedRounds?: PersistedScheduleBuilderRound[];
  savedAt?: string | null;
};

type PersistedScheduleBuilderRoomSlot = {
  roomName: string;
  learnerLabels: string[];
  assignedSpName?: string;
  backupSpName?: string;
  caseLabel?: string;
  roleId?: string;
  roleLabel?: string;
  notes?: string;
  stationStatus?: ScheduleStationStatus;
  isBackupStation?: boolean;
  roomType?: GeneratedRoomSlot["roomType"];
  capacity?: number;
};

type PersistedScheduleBuilderRound = {
  round: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  roomSlots: PersistedScheduleBuilderRoomSlot[];
};

type PersistedScheduleBuilderSnapshot = ScheduleBuilderDraft & {
  snapshotVersion: 2;
  scheduleStatus: "complete" | "in_progress";
  scheduleRoundCount: number;
  scheduleRoomCount: number;
  scheduleRoomCapacity: number;
  scheduleLearnerRoster: string[];
  multipleCasesEnabled: boolean;
  scheduleCaseDefinitions: ScheduleCaseDefinition[];
  scheduleActiveCaseCount: number;
  scheduleFlexRoomCount: number;
  caseRotationRequired: boolean;
  eventDate: string;
  scheduleStructureSignature: string;
  resolvedRounds: PersistedScheduleBuilderRound[];
};

type CompletedScheduleMetadataPayload = {
  status: "complete" | "in_progress";
  source: "schedule_builder";
  completed_at: string;
  completed_by?: string;
  learner_count: number;
  room_count: number;
  students_per_room: number;
  rounds_count: number;
  timing: {
    start_time: string;
    end_time: string;
    encounter_minutes: number;
    feedback_minutes: number;
    transition_minutes: number;
    checklist_minutes: number;
    prebrief_minutes: number;
    round_target_minutes: number;
  };
  room_names: string[];
  snapshot: PersistedScheduleBuilderSnapshot;
};

type ScheduleRoomAdjustmentSlot = {
  slotIndex: number;
  learnerLabels: string[];
  manualOverride?: boolean;
  source?: string;
  roomName?: string;
  spName?: string;
  backupSpName?: string;
  caseLabel?: string;
  roleId?: string;
  roleLabel?: string;
  notes?: string;
  stationStatus?: ScheduleStationStatus;
  isBackupStation?: boolean;
};

const CONFIRMED_SCHEDULE_OVERRIDE_SOURCE = "confirmed-schedule-override";

type ParsedScheduleRoomAdjustments = {
  roundsByNumber: Map<number, ScheduleRoomAdjustmentSlot[]>;
  slotKey: (roundNumber: number, slotIndex: number) => string;
};

type BuilderMeResponse = {
  user?: {
    email?: string | null;
  };
  profile?: {
    full_name?: string | null;
    schedule_name?: string | null;
    email?: string | null;
  } | null;
};

type SaveState = "saved" | "saving" | "unsaved" | "error";

type BuilderTimeSource =
  | "event_sessions"
  | "completed_snapshot"
  | "saved_draft"
  | "event_setup"
  | "imported_metadata"
  | "default"
  | "edited";

type BuilderTimePrefill = {
  source: BuilderTimeSource;
  label: string;
  startTime: string;
  endTime: string;
  sessionLengthMinutes: string;
};

function getScheduleStartTimeSourceLabel(source: BuilderTimeSource) {
  if (source === "saved_draft" || source === "completed_snapshot") return "builder metadata";
  if (source === "event_setup") return "event setup";
  if (source === "event_sessions") return "event session";
  return "fallback default";
}

type ScheduleSetupTruth = {
  eventTitle: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  studentCount: number;
  roomCount: number;
  roomNames: string[];
  studentsPerRoom: number;
  numberOfCases: number;
  encounterMinutes: number;
  feedbackMinutes: number;
  transitionMinutes: number;
  checklistMinutes: number;
  prebriefMinutes: number;
  hasBreak: boolean;
  breakStartTime: string;
  breakEndTime: string;
  primarySpTarget: number;
  backupSpTarget: number;
  roundsNeeded: number;
  hasEventSetupValues: boolean;
  sourceLabel: string;
};

const DEFAULT_SCHEDULE_BUILDER_DRAFT: ScheduleBuilderDraft = {
  builderMode: "simple",
  scheduleViewMode: "student",
  selectedEventId: "",
  learnerFileName: "",
  originalUploadedLearners: [],
  uploadedLearners: [],
  startTime: "08:00",
  staffArrivalTime: "",
  spArrivalTime: "",
  facultyArrivalTime: "",
  roomSetupMinutes: "0",
  studentPrebriefMinutes: "0",
  spPrebriefMinutes: "0",
  facultyPrebriefMinutes: "0",
  sessionLengthMinutes: "0",
  roundCount: "4",
  examRoomCount: "4",
  flexRoomCount: "1",
  roomCapacity: "1",
  maxPairsPerFlexRoom: "3",
  encounterMinutes: "20",
  postEncounterBlock: "checklist",
  postEncounterMinutes: "10",
  dayBlocks: [],
  manualRoundOverride: false,
  checklistEnabled: false,
  checklistMinutes: "0",
  checklistPlacement: "before_encounter",
  soapMinutes: "10",
  feedbackMinutes: "5",
  transitionMinutes: "5",
  includeChecklist: true,
  includeSoap: false,
  includeFeedback: true,
  includeDebrief: false,
  includeBreakdown: false,
  debriefMinutes: "0",
  breakdownMinutes: "0",
  savedAt: null,
};

const schedulePreviewKindOptions: Array<{ value: SchedulePreviewKind; label: string }> = [
  { value: "student", label: "Student Schedule" },
  { value: "timeline", label: "Faculty Schedule" },
  { value: "sp", label: "SP Schedule" },
  { value: "operations", label: "Admin Schedule" },
  { value: "announcements", label: "Announcement Schedule" },
];

function getPreviewFamilyForKind(kind: SchedulePreviewKind, preferredFamily?: SchedulePreviewFamily | null) {
  if (preferredFamily) return preferredFamily;
  return kind === "timeline" ? "ticket" : "schedule";
}

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function serializeScheduleLearnerRosterMetadata(learners: string[]) {
  const roster = normalizeLearnerNames(learners);
  return roster.length ? encodeURIComponent(JSON.stringify(roster)) : "";
}

function parseScheduleLearnerRosterMetadata(value: unknown) {
  const text = asText(value);
  if (!text) return [] as string[];
  const candidates = [text];
  try {
    candidates.unshift(decodeURIComponent(text));
  } catch {
    // Metadata may already be plain JSON or newline text.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return normalizeLearnerNames(parsed);
    } catch {
      // Try the next representation.
    }
  }

  return normalizeLearnerNames(text.split(/\r?\n|,/g));
}

function getBuilderUserLabel(me: BuilderMeResponse | null) {
  return (
    normalizeDisplayText(me?.profile?.full_name) ||
    normalizeDisplayText(me?.profile?.schedule_name) ||
    normalizeDisplayText(me?.profile?.email) ||
    normalizeDisplayText(me?.user?.email)
  );
}

function makeDayBlockId() {
  return `day-block-${Math.random().toString(36).slice(2, 10)}`;
}

function getDayBlockTypeLabel(type: DayBlockType) {
  if (type === "soap_notes") return "SOAP Notes";
  if (type === "custom") return "Custom";
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDefaultDayBlockLabel(type: DayBlockType) {
  if (type === "soap_notes") return "SOAP Notes";
  if (type === "transition") return "Transition";
  if (type === "custom") return "Custom Block";
  return getDayBlockTypeLabel(type);
}

function getDayBlockTone(type: DayBlockType): TimelineBlock["tone"] {
  if (type === "checklist" || type === "soap_notes" || type === "feedback") return "rotation";
  if (type === "transition") return "prebrief";
  return "wrap";
}

function isDayBlockVisibleToView(visibleTo: DayBlockVisibility, viewMode: "student" | "operations") {
  return visibleTo === "both" || visibleTo === viewMode;
}

function createDayBlock(partial?: Partial<DayBlockConfig>): DayBlockConfig {
  const type = partial?.type || "break";
  return {
    id: partial?.id || makeDayBlockId(),
    type,
    label: partial?.label || getDefaultDayBlockLabel(type),
    durationMinutes: partial?.durationMinutes || "10",
    placement: partial?.placement || "after_each_rotation",
    placementInterval: partial?.placementInterval || "2",
    specificTime: partial?.specificTime || "",
    visibleTo: partial?.visibleTo || "both",
  };
}

function parseNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function parseBooleanFlag(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = asText(value).toLowerCase();
  if (text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return fallback;
}

function getNoteLineValues(notes: string | null | undefined, labels: string[]) {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  return asText(notes)
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (!match) return "";
      const label = asText(match[1]).toLowerCase();
      if (!normalizedLabels.includes(label)) return "";
      return asText(match[2]);
    })
    .filter(Boolean);
}

function getFirstNoteLineValue(notes: string | null | undefined, labels: string[]) {
  return getNoteLineValues(notes, labels)[0] || "";
}

function getFirstNoteNumber(notes: string | null | undefined, labels: string[]) {
  const values = getNoteLineValues(notes, labels);
  for (const value of values) {
    const match = value.match(/\d+/);
    if (!match) continue;
    const parsed = parseNumber(match[0], 0);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function toScheduleInputTime(value: unknown) {
  const parsed = parseClockTextToMinutes(asText(value));
  return parsed !== null ? minutesToInputTime(parsed) : "";
}

function parseScheduleRoomNames(notes: string | null | undefined, roomCount: number) {
  const roomLines = getNoteLineValues(notes, ["Room Names", "Rooms"])
    .filter((value) => !/^\d+\s*$/.test(value))
    .flatMap((value) => value.split(/\s*,\s*|\s*\|\s*|\r?\n/))
    .map(normalizeDisplayText)
    .filter(Boolean);
  const uniqueNames = Array.from(new Set(roomLines));
  if (uniqueNames.length) return uniqueNames.slice(0, Math.max(uniqueNames.length, roomCount));
  return Array.from({ length: Math.max(roomCount, 0) }, (_, index) => `Exam ${index + 1}`);
}

function buildGeneratedLearnerNames(count: number) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => `Learner ${index + 1}`);
}

function isGeneratedLearnerName(value: string) {
  return /^learner\s+\d+$/i.test(normalizeDisplayText(value));
}

function countRealLearnerNames(learners: string[]) {
  const normalized = normalizeLearnerNames(learners);
  if (!normalized.length) return 0;
  return normalized.every(isGeneratedLearnerName) ? 0 : normalized.length;
}

function hasExplicitLearnerRoster(learners: string[]) {
  return countRealLearnerNames(normalizeLearnerNames(learners)) > 0;
}

function normalizeChecklistPlacement(value: unknown): ChecklistPlacement {
  const text = asText(value).toLowerCase();
  if (text === "before_feedback" || text === "after_feedback") return text;
  return "before_encounter";
}

function stableScheduleSignatureValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableScheduleSignatureValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stableScheduleSignatureValue(entry)])
  );
}

function buildScheduleStructureSignature(value: Record<string, unknown>) {
  try {
    return JSON.stringify(stableScheduleSignatureValue(value));
  } catch {
    return "";
  }
}

const DEFAULT_ENCOUNTER_MINUTES = parseNumber(DEFAULT_SCHEDULE_BUILDER_DRAFT.encounterMinutes, 20);
const MINUTES_PER_DAY = 24 * 60;
const MAX_OPERATIONAL_ROUND_MINUTES = 120;
const MAX_RECURRING_BLOCK_MINUTES = 90;
const MAX_IMPORTED_ROUND_TARGET_MINUTES = 90;

function sanitizeRecurringBlockMinutes(value: string) {
  const parsed = parseNumber(value, 0);
  return parsed > MAX_RECURRING_BLOCK_MINUTES ? 0 : parsed;
}

function sanitizeEncounterMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_OPERATIONAL_ROUND_MINUTES) {
    return DEFAULT_ENCOUNTER_MINUTES;
  }
  return Math.max(1, Math.floor(value));
}

function sanitizeSavedRoundTargetMinutes(value?: string | null) {
  const parsed = parseNumber(asText(value), 0);
  return parsed > 0 && parsed <= MAX_IMPORTED_ROUND_TARGET_MINUTES ? String(parsed) : "0";
}

function toMinutes(value: string) {
  const [hoursText, minutesText] = asText(value).split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeEndMinutesForRange(startMinutes: number | null, endMinutes: number | null) {
  if (startMinutes === null || endMinutes === null) return null;
  return endMinutes < startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
}

function normalizeClockMinutesForSchedule(
  minutes: number | null,
  windowStartMinutes: number,
  normalizedWindowEndMinutes: number | null
) {
  if (minutes === null || normalizedWindowEndMinutes === null) return minutes;
  if (normalizedWindowEndMinutes <= windowStartMinutes || normalizedWindowEndMinutes < MINUTES_PER_DAY) {
    return minutes;
  }

  const clockMinutes = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const windowStartClock = ((windowStartMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const nextDayCandidate =
    (Math.floor(windowStartMinutes / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY + clockMinutes;

  if (
    minutes < windowStartMinutes &&
    clockMinutes < windowStartClock &&
    (nextDayCandidate <= normalizedWindowEndMinutes || clockMinutes < 8 * 60)
  ) {
    return nextDayCandidate;
  }

  return minutes;
}

function parseClockTextToMinutes(value: string) {
  const text = asText(value);
  if (!text) return null;

  const normalized = text.replace(/\./g, "").trim();
  const twelveHourMatch = normalized.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([ap]m)$/i);
  if (twelveHourMatch) {
    const hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2] || "0");
    const meridiem = twelveHourMatch[3].toLowerCase();
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return null;
    }
    const normalizedHours = hours % 12 + (meridiem === "pm" ? 12 : 0);
    return normalizedHours * 60 + minutes;
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }
    return hours * 60 + minutes;
  }

  return null;
}

function minutesToInputTime(totalMinutes: number) {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function extractTimeRange(value: string) {
  const matches = value.match(/\b\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:AM|PM)?\b/gi) || [];
  const meridiemHints = matches
    .map((match) => asText(match.match(/([ap]m)$/i)?.[1]).toLowerCase())
    .filter(Boolean);
  const inferredMeridiem = meridiemHints[meridiemHints.length - 1] || "";
  const parseRangeToken = (token: string, index: number) => {
    const text = asText(token);
    const hasMeridiem = /[ap]m$/i.test(text);
    const hasColon = /:/.test(text);
    if (hasMeridiem) return parseClockTextToMinutes(text);
    if (hasColon) {
      const parsed = parseClockTextToMinutes(text);
      if (!inferredMeridiem || !matches[1]) return parsed;
      const endMinutes = parseClockTextToMinutes(matches[1]);
      const inferredCandidate = parseClockTextToMinutes(`${text} ${inferredMeridiem}`);
      if (endMinutes === null || inferredCandidate === null) return parsed;
      if (index === 0 && inferredMeridiem === "pm") {
        const amCandidate = parseClockTextToMinutes(`${text} am`);
        if (inferredCandidate >= endMinutes && amCandidate !== null && amCandidate < endMinutes) {
          return amCandidate;
        }
        return inferredCandidate;
      }
      if (index === 0 && inferredMeridiem === "am" && parsed !== null && parsed > endMinutes) {
        const pmCandidate = parseClockTextToMinutes(`${text} pm`);
        if (pmCandidate !== null && pmCandidate > endMinutes) return pmCandidate;
      }
      return inferredCandidate;
    }
    if (!inferredMeridiem) return null;
    const parsedWithInferred = parseClockTextToMinutes(`${text} ${inferredMeridiem}`);
    if (index === 0 && inferredMeridiem === "pm" && matches[1]) {
      const endMinutes = parseClockTextToMinutes(matches[1]);
      const amCandidate = parseClockTextToMinutes(`${text} am`);
      if (
        parsedWithInferred !== null &&
        endMinutes !== null &&
        parsedWithInferred >= endMinutes &&
        amCandidate !== null &&
        amCandidate < endMinutes
      ) {
        return amCandidate;
      }
    }
    if (index === 0 && inferredMeridiem === "am" && matches[1]) {
      const endMinutes = parseClockTextToMinutes(matches[1]);
      const pmCandidate = parseClockTextToMinutes(`${text} pm`);
      if (
        parsedWithInferred !== null &&
        endMinutes !== null &&
        parsedWithInferred > endMinutes &&
        pmCandidate !== null &&
        pmCandidate > endMinutes
      ) {
        return pmCandidate;
      }
    }
    return parsedWithInferred;
  };
  const parsed = matches
    .map(parseRangeToken)
    .filter((item): item is number => item !== null);

  if (!parsed.length) return { startMinutes: null, endMinutes: null };

  return {
    startMinutes: parsed[0] ?? null,
    endMinutes: parsed[1] ?? null,
  };
}

function normalizeDayBlockType(value: unknown): DayBlockType {
  const text = asText(value).toLowerCase();
  if (
    text === "break" ||
    text === "checklist" ||
    text === "feedback" ||
    text === "debrief" ||
    text === "lunch" ||
    text === "transition" ||
    text === "custom"
  ) {
    return text;
  }
  if (text === "soap notes" || text === "soap_note" || text === "soap") return "soap_notes";
  return "break";
}

function normalizeDayBlockPlacement(value: unknown): DayBlockPlacement {
  const text = asText(value).toLowerCase();
  if (
    text === "before_rotations" ||
    text === "after_each_rotation" ||
    text === "after_every_x_rotations" ||
    text === "after_rotations" ||
    text === "specific_time"
  ) {
    return text;
  }
  return "after_each_rotation";
}

function normalizeDayBlockVisibility(value: unknown): DayBlockVisibility {
  const text = asText(value).toLowerCase();
  if (text === "student" || text === "operations" || text === "both") return text;
  return "both";
}

function normalizeDayBlocks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item && typeof item === "object" ? (item as Partial<DayBlockConfig>) : {};
      const type = normalizeDayBlockType(record.type);
      return createDayBlock({
        id: asText(record.id) || undefined,
        type,
        label: asText(record.label) || getDefaultDayBlockLabel(type),
        durationMinutes: asText(record.durationMinutes) || "0",
        placement: normalizeDayBlockPlacement(record.placement),
        placementInterval: asText(record.placementInterval) || "2",
        specificTime: asText(record.specificTime),
        visibleTo: normalizeDayBlockVisibility(record.visibleTo),
      });
    })
    .filter((block) => asText(block.durationMinutes) !== "");
}

function buildLegacyDayBlocks(parsed: Partial<ScheduleBuilderDraft>) {
  const blocks: DayBlockConfig[] = [];
  const builderMode = parsed.builderMode === "advanced" ? "advanced" : "simple";
  const postEncounterMinutes = asText(parsed.postEncounterMinutes) || DEFAULT_SCHEDULE_BUILDER_DRAFT.postEncounterMinutes;
  const postEncounterBlock = parsed.postEncounterBlock === "break" ? "break" : parsed.postEncounterBlock === "other" ? "custom" : "checklist";

  if (builderMode === "simple") {
    blocks.push(
      createDayBlock({
        type: postEncounterBlock,
        label:
          postEncounterBlock === "custom"
            ? "Custom Block"
            : getDefaultDayBlockLabel(postEncounterBlock),
        durationMinutes: postEncounterMinutes,
        placement: "after_each_rotation",
      })
    );
    return blocks;
  }

  if (parsed.includeChecklist && parseNumber(asText(parsed.checklistMinutes), 0) > 0) {
    blocks.push(
      createDayBlock({
        type: "checklist",
        label: "Checklist",
        durationMinutes: asText(parsed.checklistMinutes),
        placement: "after_each_rotation",
      })
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(parsed, "includeSoap") &&
    parsed.includeSoap &&
    parseNumber(asText(parsed.soapMinutes), 0) > 0
  ) {
    blocks.push(
      createDayBlock({
        type: "soap_notes",
        label: "SOAP Notes",
        durationMinutes: asText(parsed.soapMinutes),
        placement: "after_each_rotation",
      })
    );
  }
  if (parsed.includeDebrief && parseNumber(asText(parsed.debriefMinutes), 0) > 0) {
    blocks.push(
      createDayBlock({
        type: "debrief",
        label: "Debrief",
        durationMinutes: asText(parsed.debriefMinutes),
        placement: "after_rotations",
      })
    );
  }
  if (parsed.includeBreakdown && parseNumber(asText(parsed.breakdownMinutes), 0) > 0) {
    blocks.push(
      createDayBlock({
        type: "custom",
        label: "Room Reset / Breakdown",
        durationMinutes: asText(parsed.breakdownMinutes),
        placement: "after_rotations",
        visibleTo: "operations",
      })
    );
  }
  return blocks.length ? blocks : DEFAULT_SCHEDULE_BUILDER_DRAFT.dayBlocks.map((block) => ({ ...block }));
}

function buildScheduleSetupTruth(event: EventRow | null): ScheduleSetupTruth {
  const metadata = parseEventMetadata(event?.notes).training;
  const notes = event?.notes || "";
  const noteStudentCount = getFirstNoteNumber(notes, ["Student Count", "Learner Count"]);
  const noteRoomCount = getFirstNoteNumber(notes, ["Number of Rooms", "Rooms"]);
  const noteEncounterMinutes = getFirstNoteNumber(notes, ["Encounter Length (minutes)", "Session Length"]);
  const noteFeedbackMinutes = getFirstNoteNumber(notes, ["Feedback / Transition Length (minutes)", "Feedback / Break Length"]);
  const noteTransitionMinutes = getFirstNoteNumber(notes, ["Transition Length (minutes)", "Transition Length"]);
  const studentCount =
    noteStudentCount ||
    parseNumber(metadata.schedule_learner_count, 0);
  const roomCount =
    noteRoomCount ||
    parseNumber(metadata.schedule_room_count, 0) ||
    Math.max(0, parseNumber(event?.sp_needed, 0));
  const studentsPerRoom = parseNumber(metadata.schedule_room_capacity, 0) || 1;
  const numberOfCases =
    parseNumber(metadata.case_count, 0) ||
    getFirstNoteNumber(notes, ["Number of Cases"]) ||
    1;
  const encounterMinutes =
    noteEncounterMinutes ||
    parseNumber(metadata.schedule_encounter_minutes, 0);
  const feedbackMinutes =
    noteFeedbackMinutes ||
    parseNumber(metadata.schedule_feedback_minutes, 0);
  const transitionMinutes =
    noteTransitionMinutes ||
    parseNumber(metadata.schedule_transition_minutes, 0);
  const checklistMinutes = parseNumber(metadata.schedule_checklist_minutes, 0);
  const prebriefRequired = /^(yes|true|1)$/i.test(asText(getFirstNoteLineValue(notes, ["Pre-briefing Required"])));
  const prebriefMinutes =
    parseNumber(metadata.schedule_faculty_prebrief_minutes, 0) ||
    (prebriefRequired ? getFirstNoteNumber(notes, ["Pre-briefing Length"]) || 15 : 0);
  const startTime =
    toScheduleInputTime(event?.earliest_session_start) ||
    toScheduleInputTime(metadata.event_start_time) ||
    toScheduleInputTime(metadata.training_start_time) ||
    toScheduleInputTime(getFirstNoteLineValue(notes, ["Start Time"]));
  const endTime =
    toScheduleInputTime(event?.latest_session_end) ||
    toScheduleInputTime(metadata.event_end_time) ||
    toScheduleInputTime(metadata.training_end_time) ||
    toScheduleInputTime(getFirstNoteLineValue(notes, ["End Time"]));
  const normalizedRoomCount = Math.max(roomCount, 0);
  const roomNames = parseScheduleRoomNames(notes, normalizedRoomCount);
  const backupRequired =
    asText(metadata.backups_required).toLowerCase() ||
    asText(getFirstNoteLineValue(notes, ["Backups Required", "Backups?"])).toLowerCase();
  const noteBackupCount = getFirstNoteNumber(notes, ["Backup SP Count", "Backup Count", "Backups Required"]);
  const backupsAreRequired =
    backupRequired === "yes" ||
    backupRequired === "true" ||
    backupRequired === "1" ||
    noteBackupCount > 0;
  const backupSpTarget =
    backupsAreRequired
      ? noteBackupCount || parseNumber(metadata.backup_count, 0) || 1
      : 0;
  const primarySpTarget = Math.max(parseNumber(event?.sp_needed, 0), normalizedRoomCount);
  const perRoundCapacity = Math.max(normalizedRoomCount * Math.max(studentsPerRoom, 1), 0);
  const learnerRounds = studentCount > 0 && perRoundCapacity > 0 ? Math.ceil(studentCount / perRoundCapacity) : 0;
  const derivedRoundsNeeded = Math.max(learnerRounds, numberOfCases > 1 ? numberOfCases : 0, 0);
  const roundsNeeded =
    derivedRoundsNeeded ||
    parseNumber(metadata.schedule_round_count, 0) ||
    1;
  const breakText = getFirstNoteLineValue(notes, ["Schedule Break / Block"]);

  return {
    eventTitle: normalizeDisplayText(event?.name),
    eventDate: normalizeDisplayText(event?.earliest_session_date || event?.date_text),
    startTime,
    endTime,
    studentCount,
    roomCount: normalizedRoomCount,
    roomNames,
    studentsPerRoom,
    numberOfCases,
    encounterMinutes,
    feedbackMinutes,
    transitionMinutes,
    checklistMinutes,
    prebriefMinutes,
    hasBreak: Boolean(breakText),
    breakStartTime: "",
    breakEndTime: "",
    primarySpTarget,
    backupSpTarget,
    roundsNeeded,
    hasEventSetupValues: Boolean(
      studentCount ||
        normalizedRoomCount ||
        startTime ||
        endTime ||
        encounterMinutes ||
        feedbackMinutes ||
        transitionMinutes ||
        checklistMinutes ||
        prebriefMinutes ||
        numberOfCases > 1
    ),
    sourceLabel: "Event Setup",
  };
}

function buildScheduleDraftFromSetupTruth(truth: ScheduleSetupTruth): ScheduleBuilderDraft | null {
  if (!truth.hasEventSetupValues) return null;
  const generatedRoomNames = truth.roomNames.length ? truth.roomNames : parseScheduleRoomNames("", truth.roomCount);
  const scheduleCaseDefinitions: ScheduleCaseDefinition[] = Array.from(
    { length: Math.max(truth.numberOfCases, 1) },
    (_, index) => ({
      id: `event-setup-case-${index + 1}`,
      name: truth.numberOfCases > 1 ? `Case ${index + 1}` : "Case 1",
      roomAssignment: generatedRoomNames[index] || `Exam ${index + 1}`,
      active: true,
    })
  );

  return {
    ...DEFAULT_SCHEDULE_BUILDER_DRAFT,
    startTime: truth.startTime || DEFAULT_SCHEDULE_BUILDER_DRAFT.startTime,
    learnerFileName: truth.studentCount > 0 ? "Generated from Event Setup student count" : "",
    originalUploadedLearners: [],
    uploadedLearners: [],
    examRoomCount: truth.roomCount ? String(truth.roomCount) : DEFAULT_SCHEDULE_BUILDER_DRAFT.examRoomCount,
    roundCount: truth.roundsNeeded ? String(truth.roundsNeeded) : DEFAULT_SCHEDULE_BUILDER_DRAFT.roundCount,
    roomCapacity: truth.studentsPerRoom ? String(truth.studentsPerRoom) : DEFAULT_SCHEDULE_BUILDER_DRAFT.roomCapacity,
    flexRoomCount: "0",
    encounterMinutes: truth.encounterMinutes ? String(truth.encounterMinutes) : DEFAULT_SCHEDULE_BUILDER_DRAFT.encounterMinutes,
    checklistEnabled: truth.checklistMinutes > 0,
    checklistMinutes: truth.checklistMinutes ? String(truth.checklistMinutes) : "0",
    feedbackMinutes: truth.feedbackMinutes ? String(truth.feedbackMinutes) : "0",
    transitionMinutes: truth.transitionMinutes ? String(truth.transitionMinutes) : "0",
    facultyPrebriefMinutes: truth.prebriefMinutes ? String(truth.prebriefMinutes) : DEFAULT_SCHEDULE_BUILDER_DRAFT.facultyPrebriefMinutes,
    multipleCasesEnabled: truth.numberOfCases > 1,
    scheduleCaseDefinitions,
    scheduleStatus: "in_progress",
    scheduleRoundCount: truth.roundsNeeded,
    scheduleRoomCount: truth.roomCount,
    scheduleRoomCapacity: truth.studentsPerRoom,
    scheduleLearnerRoster: truth.studentCount > 0 ? buildGeneratedLearnerNames(truth.studentCount) : [],
    scheduleActiveCaseCount: Math.max(truth.numberOfCases, 1),
    scheduleFlexRoomCount: 0,
    caseRotationRequired: truth.numberOfCases > 1,
    eventDate: truth.eventDate,
    savedAt: null,
  };
}

function buildTimePrefill(event: EventRow | null, savedDraft: ScheduleBuilderDraft | null, setupTruth?: ScheduleSetupTruth | null): BuilderTimePrefill {
  const defaultPrefill: BuilderTimePrefill = {
    source: "default",
    label: "Using default time",
    startTime: DEFAULT_SCHEDULE_BUILDER_DRAFT.startTime,
    endTime: "",
    sessionLengthMinutes: "0",
  };

  if (savedDraft?.startTime) {
    return {
      source: "saved_draft",
      label: "Using saved builder draft",
      startTime: savedDraft.startTime,
      endTime: "",
      sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(savedDraft.sessionLengthMinutes),
    };
  }

  if (!event) return defaultPrefill;

  const eventStartMinutes = parseClockTextToMinutes(asText(event.earliest_session_start));
  const eventEndMinutes = parseClockTextToMinutes(asText(event.latest_session_end));
  if (eventStartMinutes !== null) {
    return {
      source: "event_sessions",
      label: "Using event session time",
      startTime: minutesToInputTime(eventStartMinutes),
      endTime: eventEndMinutes !== null ? minutesToInputTime(eventEndMinutes) : "",
      sessionLengthMinutes: "0",
    };
  }

  const metadata = parseEventMetadata(event.notes).training;
  const importedEventTimeText =
    asText(metadata.imported_event_times).split(/\s*\|\s*/).find(Boolean) || "";
  const importedEventRange = extractTimeRange(importedEventTimeText);
  if (importedEventRange.startMinutes !== null) {
    return {
      source: "imported_metadata",
      label: "Using imported SP Event Info time",
      startTime: minutesToInputTime(importedEventRange.startMinutes),
      endTime:
        importedEventRange.endMinutes !== null ? minutesToInputTime(importedEventRange.endMinutes) : "",
      sessionLengthMinutes: "0",
    };
  }

  if (setupTruth?.startTime) {
    return {
      source: "event_setup",
      label: "Using Event Setup",
      startTime: setupTruth.startTime,
      endTime: setupTruth.endTime,
      sessionLengthMinutes: "0",
    };
  }

  return defaultPrefill;
}

function hasPhysicalEventLocation(value?: string | null) {
  const text = asText(value).toLowerCase();
  if (!text) return false;
  if (/\b(virtual|telehealth|breakout|online|remote)\b/.test(text)) return false;
  return /\b(campus|center|centre|building|room|suite|lab|hospital|clinic|hall|floor|site|onsite|on-site|in person|in-person|elkins park)\b/.test(text);
}

function toDisplayTime(totalMinutes: number) {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function getMinuteDayOffset(totalMinutes: number) {
  return Math.floor(Math.max(0, Math.floor(totalMinutes)) / MINUTES_PER_DAY);
}

function formatDayOffset(offset: number) {
  return offset > 0 ? ` (+${offset} day${offset === 1 ? "" : "s"})` : "";
}

function formatTimeWithDayOffset(totalMinutes: number) {
  return `${toDisplayTime(totalMinutes)}${formatDayOffset(getMinuteDayOffset(totalMinutes))}`;
}

function formatRange(start: number, end: number) {
  const startOffset = getMinuteDayOffset(start);
  const endOffset = getMinuteDayOffset(end);
  if (startOffset === endOffset) {
    return `${toDisplayTime(start)} - ${toDisplayTime(end)}${formatDayOffset(endOffset)}`;
  }
  return `${toDisplayTime(start)}${formatDayOffset(startOffset)} - ${toDisplayTime(end)}${formatDayOffset(endOffset)}`;
}

function formatReferenceEndDetail(startMinutes: number | null, endMinutes: number | null) {
  const normalizedEndMinutes = normalizeEndMinutesForRange(startMinutes, endMinutes);
  if (startMinutes === null || normalizedEndMinutes === null) return "";
  const durationMinutes = Math.max(normalizedEndMinutes - startMinutes, 0);
  return `Reference event end: ${formatTimeWithDayOffset(normalizedEndMinutes)} • ${durationMinutes} min window`;
}

function getPreviewDocumentParts(html: string) {
  const styleMatches = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi));
  const styles = styleMatches.map((match) => match[1]).join("\n");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return {
    styles,
    body: bodyMatch?.[1] || html,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(downloadUrl);
}

function csvCell(value: unknown) {
  const text = asText(value).replace(/\r?\n/g, " ");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: unknown[][]) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

type StyledPdfRenderContext = {
  html: string;
  printView: "student" | "operations" | "student-instructions" | "faculty-simops-instructions";
};

type CompactSchedulePrintKind = "student" | "operations";

type StudentInstructionsExportContext = {
  event: EventRow | null;
  programLabel?: string;
  dateLabel?: string;
  zoomLink?: string;
  locationLabel?: string;
  instructionsConfig?: StudentInstructionsConfig;
  encounterMinutes?: number | null;
  feedbackMinutes?: number | null;
  firstEncounterStartMinutes?: number | null;
  studentScheduleRounds?: ScheduledRound[];
  studentScheduleSourceRounds?: ScheduledRound[];
  roomColumns?: PreviewRoomColumn[];
  roomContext?: Parameters<typeof getRoomDisplayLabel>[2];
};

type FacultySimOpsInstructionsExportContext = {
  event: EventRow | null;
  programLabel?: string;
  dateLabel?: string;
  locationLabel?: string;
  instructionsConfig?: FacultySimOpsInstructionsConfig;
  arrivalTimeLabel?: string;
  firstEncounterTimeLabel?: string;
  roundCount?: number;
  roomCount?: number;
  encounterMinutes?: number | null;
  checklistMinutes?: number | null;
  feedbackMinutes?: number | null;
  transitionMinutes?: number | null;
  adminScheduleHtml?: string;
};

type StudentInstructionsScheduleCell = {
  key: string;
  roomLabel: string;
  studentLabels: string[];
};

type StudentInstructionsScheduleBlock = {
  key: string;
  title: string;
  detail: string;
  cells: StudentInstructionsScheduleCell[];
};

type StudentInstructionsScheduleCellSeed = {
  roomLabel: string;
  studentLabels: string[];
};

type StudentInstructionsHtmlBuildResult = {
  html: string;
  ready: boolean;
  reason: string;
  cause?: unknown;
};

type PdfExportPageManifest = {
  page: HTMLElement;
  roundCount: number;
  sourceIndexes: number[];
};

type PdfExportPages = {
  pages: PdfExportPageManifest[];
  contentWidth: number;
  contentHeight: number;
  root: HTMLElement;
};

const STUDENT_INSTRUCTIONS_EXPORT_ERROR_MESSAGE = "Could not generate Student Instructions. Please try again.";
const FACULTY_SIMOPS_INSTRUCTIONS_EXPORT_ERROR_MESSAGE =
  "Could not generate Faculty / SimOps Instructions. Please try again.";
const PRINT_PREVIEW_URL_REVOKE_DELAY_MS = 60_000;

function isLikelyVirtualAccessUrl(value: string) {
  const normalized = normalizeDisplayText(value);
  if (!normalized) return false;
  return (
    /^https?:\/\//i.test(normalized) ||
    /\bzoom\.us\b/i.test(normalized) ||
    /\bteams\.microsoft\.com\b/i.test(normalized)
  );
}

function normalizeAccessLink(value: string) {
  return normalizeDisplayText(value).replace(/\/+$/, "").toLowerCase();
}

function hasRenderablePrintHtml(value: string) {
  const html = asText(value);
  if (!html) return false;
  return /<\s*(html|body|section|article|table|div)\b/i.test(html);
}

function validateStudentInstructionsPrintHtml(value: string): { ready: boolean; reason: string } {
  const html = asText(value);
  if (!html) {
    return { ready: false, reason: "Could not generate Student Instructions PDF. No printable packet content was created." };
  }
  if (!hasRenderablePrintHtml(html)) {
    return { ready: false, reason: "Could not generate Student Instructions PDF. Printable packet markup is missing." };
  }
  if (typeof DOMParser === "undefined") {
    const hasRequiredMarkup =
      /\bcfsp-schedule-export\b/.test(html) &&
      /\bstudent-instructions-document\b/.test(html) &&
      /\bstudent-packet-page-section\b/.test(html);
    return hasRequiredMarkup
      ? { ready: true, reason: "" }
      : { ready: false, reason: "Could not generate Student Instructions PDF. Printable packet sections are incomplete." };
  }
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const hasExportRoot = Boolean(parsed.querySelector(".cfsp-schedule-export"));
    const hasPacketShell = Boolean(parsed.querySelector(".student-instructions-document"));
    const hasPacketSection = Boolean(parsed.querySelector(".student-packet-page-section"));
    if (!hasExportRoot || !hasPacketShell || !hasPacketSection) {
      return {
        ready: false,
        reason: "Could not generate Student Instructions PDF. Printable packet sections are incomplete.",
      };
    }
    return { ready: true, reason: "" };
  } catch {
    return { ready: false, reason: "Could not generate Student Instructions PDF. Printable packet could not be parsed." };
  }
}

function getErrorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  return asText(error) || "Unknown error";
}

function addPrintOnLoadScript(html: string, logLabel: string) {
  const escapedLogLabel = logLabel.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
        <script>
          (() => {
            const printAfterLoad = () => {
              window.setTimeout(() => {
                try {
                  window.focus();
                  window.print();
                } catch (error) {
                  console.error("${escapedLogLabel}", error);
                }
              }, 250);
            };
            if (document.readyState === "complete") {
              printAfterLoad();
            } else {
              window.addEventListener("load", printAfterLoad, { once: true });
            }
          })();
        </script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${script}\n      </body>`) : `${html}${script}`;
}

function openPrintableHtmlBlob(html: string, options?: { printOnLoad?: boolean; logLabel?: string }) {
  if (typeof window === "undefined") return false;
  const printableHtml = options?.printOnLoad
    ? addPrintOnLoadScript(html, options.logLabel || "[schedule-export] Could not open print dialog.")
    : html;
  if (!hasRenderablePrintHtml(printableHtml)) {
    console.error("[schedule-export] Printable HTML was missing or invalid before opening preview.");
    return false;
  }

  let url = "";
  try {
    const blob = new Blob([printableHtml], { type: "text/html;charset=utf-8" });
    url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), PRINT_PREVIEW_URL_REVOKE_DELAY_MS);
    return true;
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    console.error("[schedule-export] Could not open printable HTML preview.", error);
    return false;
  }
}

function resolveStudentInstructionsAccessDetails(args: {
  configAccess?: string | null;
  contextAccess?: string | null;
  contextLocation?: string | null;
  eventLocation?: string | null;
  excludedAccessLinks?: string[];
}) {
  const excluded = new Set(
    (args.excludedAccessLinks || [])
      .map((value) => normalizeAccessLink(asText(value)))
      .filter(Boolean)
  );
  const candidates = [
    normalizeDisplayText(args.configAccess),
    normalizeDisplayText(args.contextAccess),
    normalizeDisplayText(args.contextLocation),
    normalizeDisplayText(args.eventLocation),
  ].filter((value) => Boolean(value) && !excluded.has(normalizeAccessLink(value)));

  const zoomLink = candidates.find((value) => isLikelyVirtualAccessUrl(value)) || "";
  const location = candidates.find((value) => !isLikelyVirtualAccessUrl(value)) || "";

  return {
    zoomLink,
    location,
  };
}

type StyledPdfDocument = {
  addImage: JsPDFClass["addImage"];
  addPage?: JsPDFClass["addPage"];
  output: JsPDFClass["output"];
};

function isCanvasTaintError(error: unknown) {
  if (error instanceof Error) {
    return /tainted|toDataURL|cross-origin|SecurityError/i.test(error.message);
  }
  return false;
}

function waitAnimationFrames(count = 2) {
  return new Promise<void>((resolve) => {
    let remaining = Math.max(1, count);
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function waitMilliseconds(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), ms);
  });
}

async function waitForSchedulePdfAssets(root: HTMLElement) {
  try {
    await document.fonts?.ready;
  } catch {
    console.warn("[styled-pdf] Font readiness check failed; continuing with export render.");
  }
  const images = Array.from(root.querySelectorAll("img"));
  if (images.length) {
    await Promise.all(
      images.map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener(
                "error",
                () => {
                  console.warn("[styled-pdf] Image failed to load during PDF export.");
                  resolve();
                },
                { once: true }
              );
            })
      )
    );
  }
  await waitAnimationFrames(2);
  await waitMilliseconds(80);
}

function ensurePdfExportNodeVisible(node: HTMLElement, widthPx: number) {
  node.style.display = "block";
  node.style.visibility = "visible";
  node.style.opacity = "1";
  node.style.position = "relative";
  node.style.left = "0";
  node.style.top = "0";
  node.style.maxWidth = `${widthPx}px`;
  node.style.width = `${widthPx}px`;
  node.style.background = "#fff";
  node.style.color = "";
  node.style.margin = "0";
  node.style.padding = "0";
  node.style.boxSizing = "border-box";
}

function getRenderHeight(node: HTMLElement) {
  const height = Math.max(
    Math.ceil(node.getBoundingClientRect().height),
    node.offsetHeight,
    node.scrollHeight,
    node.clientHeight,
    0
  );
  return Number.isFinite(height) ? height : 0;
}

async function buildSchedulePdfPages(
  html: string,
  pageWidth: number,
  pageHeight: number,
  sidePadding: number
): Promise<PdfExportPages> {
  if (!html) {
    throw new Error("Could not find printable schedule sections to render.");
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const printRoot = parsed.querySelector(".cfsp-schedule-export");
  const compactShell = parsed.querySelector(".compact-print-shell");
  if (!printRoot || !compactShell) {
    throw new Error("Could not find printable schedule sections to render.");
  }

  const printableHeader = compactShell.querySelector(".compact-print-header") as HTMLElement | null;
  const compactGrid = compactShell.querySelector(".compact-print-grid") as HTMLElement | null;
  const sourceGridTable = compactGrid?.querySelector("table.schedule-grid-table") as HTMLTableElement | null;
  const sourceTbodyGroups = sourceGridTable
    ? (Array.from(sourceGridTable.querySelectorAll("tbody.round-grid-group")) as HTMLTableSectionElement[])
    : [];
  if (!sourceGridTable || !sourceTbodyGroups.length) {
    throw new Error("Could not find any printable rounds for PDF sectioning.");
  }

  const contentWidth = Math.max(560, Math.floor(pageWidth - sidePadding * 2));
  const contentHeight = Math.max(1, Math.floor(pageHeight - sidePadding * 2));

  const printableStyles = Array.from(parsed.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .filter(Boolean)
    .join("\n");

  const exportRoot = document.createElement("div");
  exportRoot.className = "cfsp-pdf-export-root";
  exportRoot.style.position = "fixed";
  exportRoot.style.left = "-100000px";
  exportRoot.style.top = "0";
  exportRoot.style.width = `${pageWidth}px`;
  exportRoot.style.background = "#fff";
  exportRoot.style.opacity = "1";
  exportRoot.style.pointerEvents = "none";
  exportRoot.style.visibility = "visible";
  exportRoot.style.overflow = "visible";
  exportRoot.style.color = "#14304f";

  const pdfStyles = `
    ${printableStyles}
    .cfsp-pdf-page,
    .cfsp-pdf-round,
    .cfsp-pdf-header,
    .cfsp-pdf-page .compact-print-header,
    .cfsp-pdf-page .schedule-grid-table,
    .cfsp-pdf-page .round-grid-group,
    .cfsp-pdf-page .round-grid-row,
    .cfsp-pdf-page .room-row,
    .cfsp-pdf-page .room-grid,
    .cfsp-pdf-page .schedule-room-cell,
    .cfsp-pdf-page .schedule-room-card,
    .cfsp-pdf-page .timeline-segment,
    .cfsp-pdf-page .rhythm-strip,
    .cfsp-pdf-page .wide-band,
    .cfsp-pdf-page .divider-band,
    .cfsp-pdf-page .event-meta-card,
    .cfsp-pdf-page .round-section {
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    .cfsp-pdf-page {
      position: relative;
      width: ${contentWidth}px;
      max-width: ${contentWidth}px;
      min-width: ${contentWidth}px;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      background: #fff;
      overflow: visible;
      display: block;
    }
    .cfsp-pdf-round {
      display: block;
      width: 100%;
      max-width: 100%;
      margin: 0 0 3px 0;
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    .cfsp-pdf-header {
      display: block;
      width: 100%;
      max-width: 100%;
    }
    .cfsp-pdf-page .schedule-grid-table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse;
      border-spacing: 0 !important;
      overflow: visible !important;
      max-height: none !important;
    }
    .cfsp-pdf-page .round-grid-group,
    .cfsp-pdf-page .round-grid-row,
    .cfsp-pdf-page .schedule-room-row,
    .cfsp-pdf-page .wide-band {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  `;

  const styleNode = document.createElement("style");
  styleNode.textContent = pdfStyles;
  exportRoot.appendChild(styleNode);

  const measureRoot = document.createElement("div");
  measureRoot.className = "cfsp-pdf-measure-root";
  measureRoot.style.position = "relative";
  measureRoot.style.left = "0";
  measureRoot.style.top = "0";
  measureRoot.style.width = `${contentWidth}px`;
  measureRoot.style.maxWidth = `${contentWidth}px`;
  measureRoot.style.margin = "0";
  measureRoot.style.padding = "0";
  measureRoot.style.background = "#fff";
  measureRoot.style.visibility = "visible";
  measureRoot.style.opacity = "1";
  measureRoot.style.pointerEvents = "none";
  exportRoot.appendChild(measureRoot);
  document.body.appendChild(exportRoot);
  try {
    await waitForSchedulePdfAssets(exportRoot);
  } catch {
    console.warn("[styled-pdf] PDF section measurement layout wait failed; continuing with current DOM layout.");
  }

  type PdfSectionCandidate = {
    node: HTMLElement;
    height: number;
    index: number;
  };

  const allCandidates: PdfSectionCandidate[] = [];
  const createPage = () => {
    const page = document.createElement("div");
    page.className = "cfsp-pdf-page";
    page.style.width = `${contentWidth}px`;
    page.style.maxWidth = `${contentWidth}px`;
    page.style.minWidth = `${contentWidth}px`;
    page.style.background = "#fff";
    page.style.boxSizing = "border-box";
    page.style.position = "relative";
    page.style.left = "0";
    page.style.top = "0";
    page.style.margin = "0";
    page.style.padding = "0";
    return page;
  };

  const createRoundShell = (groupNode: HTMLTableSectionElement, index: number) => {
    const roundShell = document.createElement("section");
    roundShell.className = "cfsp-pdf-round";
    ensurePdfExportNodeVisible(roundShell, contentWidth);
    roundShell.dataset.roundIndex = String(index);
    roundShell.setAttribute("data-source-round", String(index));

    const tableClone = document.createElement("table");
    tableClone.className = sourceGridTable.className || "schedule-grid-table";
    const colgroup = sourceGridTable.querySelector("colgroup")?.cloneNode(true);
    const tableHead = sourceGridTable.querySelector("thead")?.cloneNode(true);
    if (colgroup) tableClone.appendChild(colgroup);
    if (tableHead) tableClone.appendChild(tableHead);
    tableClone.appendChild(groupNode.cloneNode(true));
    roundShell.appendChild(tableClone);
    return roundShell;
  };

  sourceTbodyGroups.forEach((group, index) => {
    allCandidates.push({ node: createRoundShell(group, index), height: 0, index });
  });

  const headerClone = printableHeader ? (printableHeader.cloneNode(true) as HTMLElement) : null;
  if (headerClone) {
    ensurePdfExportNodeVisible(headerClone, contentWidth);
    headerClone.classList.add("cfsp-pdf-header");
  }

  const measuredSections: PdfSectionCandidate[] = [];
  allCandidates.forEach((roundRow) => {
    ensurePdfExportNodeVisible(roundRow.node, contentWidth);
    measureRoot.appendChild(roundRow.node);
    const roundHeight = getRenderHeight(roundRow.node);
    measureRoot.removeChild(roundRow.node);

    const hasVisualHeight =
      roundHeight > 0 || roundRow.node.offsetHeight > 0 || roundRow.node.scrollHeight > 0 || roundRow.node.getBoundingClientRect().height > 0;
    if (hasVisualHeight || Boolean(roundRow.node.textContent?.trim())) {
      roundRow.height = Math.max(1, roundHeight);
      measuredSections.push(roundRow);
    } else {
      console.warn(
        `[styled-pdf] Skipping empty schedule section ${roundRow.index}; no layout height and no text content.`
      );
    }
  });

  let measuredHeaderHeight = 0;
  if (headerClone) {
    measureRoot.appendChild(headerClone);
    measuredHeaderHeight = Math.max(1, getRenderHeight(headerClone));
    headerClone.dataset.measuredHeight = String(measuredHeaderHeight);
    measureRoot.removeChild(headerClone);
  }
  measureRoot.remove();

  if (!measuredSections.length) {
    const noContentError = new Error("No printable schedule sections contain measurable content.");
    console.error("[styled-pdf]", noContentError.message);
    exportRoot.remove();
    throw noContentError;
  }

  const pages: PdfExportPageManifest[] = [];
  let currentPage = createPage();
  let currentHeight = 0;
  let headerPlaced = false;
  let currentRoundCount = 0;
  const pageContentSpacing = 3;

  const pushCurrentPage = () => {
    if (!currentPage.childElementCount) return;
    pages.push({
      page: currentPage,
      roundCount: currentPage.querySelectorAll(".cfsp-pdf-round").length,
      sourceIndexes: Array.from(currentPage.querySelectorAll(".cfsp-pdf-round")).map(
        (roundNode) => Number((roundNode as HTMLElement).dataset.roundIndex || "-1")
      ),
    });
    currentPage = createPage();
    currentHeight = 0;
    headerPlaced = false;
    currentRoundCount = 0;
  };

  const addHeader = () => {
    if (!headerClone || headerPlaced) return;
    const headerInstance = headerClone.cloneNode(true) as HTMLElement;
    ensurePdfExportNodeVisible(headerInstance, contentWidth);
    currentPage.appendChild(headerInstance);
    currentHeight += measuredHeaderHeight;
    headerPlaced = true;
  };

  const addRoundToPage = (roundRow: PdfSectionCandidate) => {
    if (currentRoundCount > 0) currentHeight += pageContentSpacing;
    currentPage.appendChild(roundRow.node);
    currentHeight += roundRow.height;
    currentRoundCount += 1;
  };

  addHeader();
  for (const roundRow of measuredSections) {
    const roundHeight = Math.max(1, roundRow.height);
    const maxHeightForCurrent = contentHeight - (headerPlaced ? measuredHeaderHeight : 0);
    if (roundHeight > maxHeightForCurrent) {
      console.warn(
        `[styled-pdf] Section ${roundRow.index} exceeds page capacity by ${
          roundHeight - Math.max(0, maxHeightForCurrent)
        }px; exporting as dedicated full-page section.`
      );
      if (currentRoundCount > 0) {
        pushCurrentPage();
        addHeader();
      }
      const singlePage = createPage();
      if (headerPlaced && headerClone) {
        const headerInstance = headerClone.cloneNode(true) as HTMLElement;
        ensurePdfExportNodeVisible(headerInstance, contentWidth);
        singlePage.appendChild(headerInstance);
      }
      singlePage.appendChild(roundRow.node);
      pages.push({
        page: singlePage,
        roundCount: 1,
        sourceIndexes: [roundRow.index],
      });
      continue;
    }

    const needsNewPage =
      currentHeight > 0 && (currentHeight + roundHeight + (currentRoundCount > 0 ? pageContentSpacing : 0) > contentHeight);
    if (needsNewPage) {
      pushCurrentPage();
      addHeader();
    }

    addRoundToPage(roundRow);
  }

  if (currentRoundCount > 0 || (headerPlaced && currentHeight > 0)) {
    pages.push({
      page: currentPage,
      roundCount: currentPage.querySelectorAll(".cfsp-pdf-round").length,
      sourceIndexes: Array.from(currentPage.querySelectorAll(".cfsp-pdf-round")).map(
        (roundNode) => Number((roundNode as HTMLElement).dataset.roundIndex || "-1")
      ),
    });
  }

  if (!pages.length) {
    const fallbackPage = createPage();
    const fallbackText = document.createElement("div");
    fallbackText.textContent = "No schedule content available for export.";
    fallbackText.style.padding = "16px";
    fallbackPage.appendChild(fallbackText);
    pages.push({ page: fallbackPage, roundCount: 0, sourceIndexes: [] });
  }

  pages.forEach((pageEntry, index) => {
    exportRoot.appendChild(pageEntry.page);
    pageEntry.page.dataset.pageIndex = String(index);
  });

  return {
    pages,
    contentWidth,
    contentHeight,
    root: exportRoot,
  };
}

async function buildFacultySimOpsInstructionsPdfPages(
  html: string,
  pageWidth: number,
  pageHeight: number,
  sidePadding: number
): Promise<PdfExportPages> {
  if (!html) {
    throw new Error("Could not find printable Faculty / SimOps instructions to render.");
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const printRoot = parsed.querySelector(".cfsp-schedule-export");
  const compactShell = parsed.querySelector(".faculty-simops-instructions-document");
  const instructionsPage = compactShell?.querySelector(".faculty-simops-front-page") as HTMLElement | null;
  const schedulePage = compactShell?.querySelector(".faculty-simops-schedule-page") as HTMLElement | null;
  if (!printRoot || !compactShell || !instructionsPage || !schedulePage) {
    throw new Error("Could not find printable Faculty / SimOps instruction pages.");
  }

  const contentWidth = Math.max(560, Math.floor(pageWidth - sidePadding * 2));
  const contentHeight = Math.max(1, Math.floor(pageHeight - sidePadding * 2));
  const printableStyles = Array.from(parsed.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .filter(Boolean)
    .join("\n");

  const exportRoot = document.createElement("div");
  exportRoot.className = "cfsp-pdf-export-root cfsp-faculty-simops-pdf-root";
  exportRoot.style.position = "fixed";
  exportRoot.style.left = "-100000px";
  exportRoot.style.top = "0";
  exportRoot.style.width = `${pageWidth}px`;
  exportRoot.style.background = "#fff";
  exportRoot.style.opacity = "1";
  exportRoot.style.pointerEvents = "none";
  exportRoot.style.visibility = "visible";
  exportRoot.style.overflow = "visible";
  exportRoot.style.color = "#14304f";

  const styleNode = document.createElement("style");
  styleNode.textContent = `
    ${printableStyles}
    .cfsp-pdf-page {
      position: relative;
      width: ${contentWidth}px;
      max-width: ${contentWidth}px;
      min-width: ${contentWidth}px;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      background: #fff;
      overflow: visible;
      display: block;
    }
    .cfsp-pdf-page > * {
      width: 100%;
      max-width: 100%;
    }
  `;
  exportRoot.appendChild(styleNode);

  const createPage = (source: HTMLElement, index: number) => {
    const page = document.createElement("div");
    page.className = `cfsp-pdf-page ${index === 0 ? "faculty-simops-front-pdf-page" : "faculty-simops-schedule-pdf-page"}`;
    page.style.width = `${contentWidth}px`;
    page.style.maxWidth = `${contentWidth}px`;
    page.style.minWidth = `${contentWidth}px`;
    page.style.background = "#fff";
    page.style.boxSizing = "border-box";
    page.style.position = "relative";
    page.style.left = "0";
    page.style.top = "0";
    page.style.margin = "0";
    page.style.padding = "0";
    const clone = source.cloneNode(true) as HTMLElement;
    ensurePdfExportNodeVisible(clone, contentWidth);
    page.appendChild(clone);
    page.dataset.pageIndex = String(index);
    exportRoot.appendChild(page);
    return page;
  };

  const pages: PdfExportPageManifest[] = [
    { page: createPage(instructionsPage, 0), roundCount: 0, sourceIndexes: [] },
    { page: createPage(schedulePage, 1), roundCount: schedulePage.querySelectorAll(".round-grid-group").length, sourceIndexes: [] },
  ];

  return {
    pages,
    contentWidth,
    contentHeight,
    root: exportRoot,
  };
}

async function buildStudentInstructionsPdfPages(
  html: string,
  pageWidth: number,
  pageHeight: number,
  sidePadding: number
): Promise<PdfExportPages> {
  if (!html) {
    throw new Error("Could not find printable student instructions to render.");
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const printRoot = parsed.querySelector(".cfsp-schedule-export");
  const compactShell = parsed.querySelector(".compact-print-shell");
  if (!printRoot || !compactShell) {
    throw new Error("Could not find printable student instructions to render.");
  }

  const printableStyles = Array.from(parsed.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .filter(Boolean)
    .join("\n");
  const header = compactShell.querySelector(".student-instructions-header") as HTMLElement | null;
  const footer = compactShell.querySelector(".student-instructions-footer") as HTMLElement | null;
  const sourceSections = Array.from(compactShell.querySelectorAll(".student-packet-page-section")) as HTMLElement[];
  if (!sourceSections.length) {
    throw new Error("Could not find printable student instruction sections.");
  }

  const contentWidth = Math.max(1, Math.floor(pageWidth - sidePadding * 2));
  const contentHeight = Math.max(1, Math.floor(pageHeight - sidePadding * 2));
  const exportRoot = document.createElement("div");
  exportRoot.className = "cfsp-pdf-export-root cfsp-student-instructions-pdf-root";
  exportRoot.style.position = "fixed";
  exportRoot.style.left = "-100000px";
  exportRoot.style.top = "0";
  exportRoot.style.width = `${pageWidth}px`;
  exportRoot.style.background = "#fff";
  exportRoot.style.opacity = "1";
  exportRoot.style.pointerEvents = "none";
  exportRoot.style.visibility = "visible";
  exportRoot.style.overflow = "visible";
  exportRoot.style.color = "#14304f";

  const styleNode = document.createElement("style");
  styleNode.textContent = `
    ${printableStyles}
    .cfsp-pdf-page {
      position: relative;
      width: ${contentWidth}px;
      max-width: ${contentWidth}px;
      min-width: ${contentWidth}px;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      background: #fff;
      overflow: visible;
      display: grid;
      gap: 9px;
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    .cfsp-pdf-measure-root.student-instructions-document,
    .cfsp-pdf-page.student-instructions-front-page {
      box-sizing: border-box !important;
      padding: 0 !important;
      margin: 0 !important;
      width: ${contentWidth}px !important;
      max-width: ${contentWidth}px !important;
      min-width: ${contentWidth}px !important;
      overflow: visible !important;
      white-space: normal !important;
      overflow-wrap: break-word !important;
      word-break: normal !important;
      text-overflow: unset !important;
    }
    .cfsp-pdf-section,
    .cfsp-pdf-footer {
      display: block;
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: visible !important;
      white-space: normal !important;
      overflow-wrap: break-word !important;
      word-break: normal !important;
      text-overflow: unset !important;
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
    .cfsp-pdf-section *,
    .cfsp-pdf-section p,
    .cfsp-pdf-section li,
    .cfsp-pdf-section a,
    .cfsp-pdf-footer,
    .cfsp-pdf-header {
      max-width: 100% !important;
      min-width: 0 !important;
      overflow: visible !important;
      white-space: normal !important;
      overflow-wrap: break-word !important;
      word-break: normal !important;
      text-overflow: unset !important;
    }
    .cfsp-pdf-header {
      display: grid;
      width: 100%;
      max-width: 100%;
      gap: 4px;
      break-inside: avoid;
      page-break-inside: avoid;
      -webkit-column-break-inside: avoid;
    }
  `;
  exportRoot.appendChild(styleNode);

  const measureRoot = document.createElement("div");
  measureRoot.className = "cfsp-pdf-measure-root student-instructions-document";
  measureRoot.style.position = "relative";
  measureRoot.style.left = "0";
  measureRoot.style.top = "0";
  measureRoot.style.width = `${contentWidth}px`;
  measureRoot.style.maxWidth = `${contentWidth}px`;
  measureRoot.style.margin = "0";
  measureRoot.style.padding = "0";
  measureRoot.style.setProperty("padding", "0", "important");
  measureRoot.style.background = "#fff";
  measureRoot.style.visibility = "visible";
  measureRoot.style.opacity = "1";
  measureRoot.style.pointerEvents = "none";
  measureRoot.style.display = "grid";
  measureRoot.style.gap = "9px";
  exportRoot.appendChild(measureRoot);
  document.body.appendChild(exportRoot);

  try {
    await waitForSchedulePdfAssets(exportRoot);
  } catch {
    console.warn("[styled-pdf] Student instructions layout wait failed; continuing with current DOM layout.");
  }

  let currentPageKind: "front" | "schedule" = "front";

  const createPage = (kind: "front" | "schedule") => {
    const page = document.createElement("div");
    page.className = `cfsp-pdf-page student-instructions-document ${
      kind === "front" ? "student-instructions-front-page" : "student-instructions-schedule-page"
    }`;
    page.style.width = `${contentWidth}px`;
    page.style.maxWidth = `${contentWidth}px`;
    page.style.minWidth = `${contentWidth}px`;
    page.style.background = "#fff";
    page.style.boxSizing = "border-box";
    page.style.position = "relative";
    page.style.left = "0";
    page.style.top = "0";
    page.style.margin = "0";
    page.style.padding = "0";
    if (kind === "front") {
      page.style.setProperty("padding", "0", "important");
    }
    page.style.display = "grid";
    page.style.gap = "9px";
    return page;
  };

  const measuredSections = sourceSections.map((section, index) => {
    const sectionClone = section.cloneNode(true) as HTMLElement;
    ensurePdfExportNodeVisible(sectionClone, contentWidth);
    sectionClone.style.display = "grid";
    sectionClone.style.gap = "7px";
    sectionClone.classList.add("cfsp-pdf-section");
    sectionClone.dataset.sectionIndex = String(index);
    measureRoot.appendChild(sectionClone);
    const height = Math.max(1, getRenderHeight(sectionClone));
    measureRoot.removeChild(sectionClone);
    return { node: sectionClone, height, index };
  });

  const headerClone = header ? (header.cloneNode(true) as HTMLElement) : null;
  let headerHeight = 0;
  if (headerClone) {
    ensurePdfExportNodeVisible(headerClone, contentWidth);
    headerClone.classList.add("cfsp-pdf-header");
    measureRoot.appendChild(headerClone);
    headerHeight = Math.max(1, getRenderHeight(headerClone));
    measureRoot.removeChild(headerClone);
  }

  const footerClone = footer ? (footer.cloneNode(true) as HTMLElement) : null;
  let footerHeight = 0;
  if (footerClone) {
    ensurePdfExportNodeVisible(footerClone, contentWidth);
    footerClone.classList.add("cfsp-pdf-footer");
    measureRoot.appendChild(footerClone);
    footerHeight = Math.max(1, getRenderHeight(footerClone));
    measureRoot.removeChild(footerClone);
  }
  measureRoot.remove();

  const pages: PdfExportPageManifest[] = [];
  let currentPage = createPage(currentPageKind);
  let currentHeight = 0;
  let currentSectionCount = 0;
  const pageContentSpacing = 9;

  const pushCurrentPage = () => {
    if (!currentPage.childElementCount) return;
    pages.push({
      page: currentPage,
      roundCount: currentPage.querySelectorAll(".cfsp-pdf-section").length,
      sourceIndexes: Array.from(currentPage.querySelectorAll(".cfsp-pdf-section")).map(
        (sectionNode) => Number((sectionNode as HTMLElement).dataset.sectionIndex || "-1")
      ),
    });
    currentPage = createPage(currentPageKind);
    currentHeight = 0;
    currentSectionCount = 0;
  };

  if (headerClone) {
    const headerInstance = headerClone.cloneNode(true) as HTMLElement;
    ensurePdfExportNodeVisible(headerInstance, contentWidth);
    currentPage.appendChild(headerInstance);
    currentHeight += headerHeight;
  }

  measuredSections.forEach((section) => {
    const startsStudentSchedule = section.node.dataset.packetSection === "student-schedule-start";
    if (startsStudentSchedule) {
      currentPageKind = "schedule";
    }
    if (startsStudentSchedule && currentSectionCount > 0) {
      pushCurrentPage();
      currentPage = createPage(currentPageKind);
    }
    const spacing = currentSectionCount > 0 || currentHeight > 0 ? pageContentSpacing : 0;
    const needsNewPage = currentSectionCount > 0 && currentHeight + spacing + section.height > contentHeight;
    if (needsNewPage) {
      pushCurrentPage();
    }
    if (currentSectionCount > 0 || currentHeight > 0) currentHeight += pageContentSpacing;
    currentPage.appendChild(section.node);
    currentHeight += section.height;
    currentSectionCount += 1;
  });

  if (footerClone) {
    const footerNeedsNewPage = currentSectionCount > 0 && currentHeight + pageContentSpacing + footerHeight > contentHeight;
    if (footerNeedsNewPage) {
      pushCurrentPage();
    }
    if (currentSectionCount > 0 || currentHeight > 0) currentHeight += pageContentSpacing;
    const footerInstance = footerClone.cloneNode(true) as HTMLElement;
    ensurePdfExportNodeVisible(footerInstance, contentWidth);
    currentPage.appendChild(footerInstance);
    currentHeight += footerHeight;
  }

  pushCurrentPage();

  if (!pages.length) {
    const fallbackPage = createPage("front");
    const fallbackText = document.createElement("div");
    fallbackText.textContent = "No student instructions content available for export.";
    fallbackText.style.padding = "16px";
    fallbackPage.appendChild(fallbackText);
    pages.push({ page: fallbackPage, roundCount: 0, sourceIndexes: [] });
  }

  pages.forEach((pageEntry, index) => {
    exportRoot.appendChild(pageEntry.page);
    pageEntry.page.dataset.pageIndex = String(index);
  });

  return {
    pages,
    contentWidth,
    contentHeight,
    root: exportRoot,
  };
}

function isRenderedCanvasBlank(canvas: HTMLCanvasElement) {
  if (!canvas.width || !canvas.height) return true;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const stride = Math.max(1, Math.floor(Math.max(canvas.width, canvas.height) / 160));
  let index = 3;
  let sampleCount = 0;
  let nonBlankCount = 0;
  for (let y = 0; y < canvas.height; y += stride) {
    for (let x = 0; x < canvas.width; x += stride) {
      index = (y * canvas.width + x) * 4;
      const alpha = data[index + 3];
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      sampleCount += 1;
      if (alpha > 0 && !(red === 255 && green === 255 && blue === 255)) {
        nonBlankCount += 1;
        break;
      }
    }
    if (nonBlankCount) break;
  }
  return sampleCount > 0 ? nonBlankCount === 0 : true;
}

async function renderPdfCanvasWithRetry(
  html2canvas: (
    element: HTMLElement,
    options?: {
      scale?: number;
      useCORS?: boolean;
      allowTaint?: boolean;
      logging?: boolean;
      backgroundColor?: string;
      width?: number;
      windowWidth?: number;
    }
  ) => Promise<HTMLCanvasElement>,
  pageNode: HTMLElement,
  contentWidth: number,
  pageLabel: string
) {
  const canvasAttempts = [
    { scale: 2, width: contentWidth, windowWidth: contentWidth, name: "primary" },
    { scale: 2.5, width: contentWidth, windowWidth: contentWidth, name: "retry" },
  ];
  let lastError: unknown = null;
  for (let attemptIndex = 0; attemptIndex < canvasAttempts.length; attemptIndex += 1) {
    const attempt = canvasAttempts[attemptIndex];
    try {
      const canvas = await html2canvas(pageNode, {
        scale: attempt.scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: "#ffffff",
        width: attempt.width,
        windowWidth: attempt.windowWidth,
      });

      if (isRenderedCanvasBlank(canvas)) {
        const warn = `[styled-pdf] ${pageLabel} rendered blank on ${attempt.name} attempt (${canvas.width}x${canvas.height}).`;
        if (attemptIndex + 1 < canvasAttempts.length) {
          console.warn(warn);
          await waitAnimationFrames(2);
          continue;
        }
        throw new Error(warn);
      }

      return canvas;
    } catch (error) {
      lastError = error;
      if (attemptIndex + 1 < canvasAttempts.length) {
        console.warn(`[styled-pdf] ${pageLabel} html2canvas failed on ${attempt.name} attempt. Retrying.`);
        await waitAnimationFrames(2);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Could not render ${pageLabel}.`);
}

async function createFallbackStyledPdfBlob(
  htmlSource: string,
  pdfDoc: StyledPdfDocument,
  contentWidth: number,
  contentHeight: number,
  pdfSidePadding: number,
  html2canvas: (
    element: HTMLElement,
    options?: {
      scale?: number;
      useCORS?: boolean;
      allowTaint?: boolean;
      logging?: boolean;
      backgroundColor?: string;
      width?: number;
      windowWidth?: number;
    }
  ) => Promise<HTMLCanvasElement>
) {
  console.warn("[styled-pdf] Falling back to full-document render mode.");
  const parsed = new DOMParser().parseFromString(htmlSource, "text/html");
  const fullExport = parsed.querySelector(".cfsp-schedule-export");
  if (!fullExport) {
    throw new Error("Could not find a printable document root for fallback PDF export.");
  }

  const fallbackRoot = document.createElement("div");
  fallbackRoot.className = "cfsp-pdf-fallback-root";
  fallbackRoot.style.position = "fixed";
  fallbackRoot.style.left = "-100000px";
  fallbackRoot.style.top = "0";
  fallbackRoot.style.width = `${contentWidth}px`;
  fallbackRoot.style.background = "#fff";
  fallbackRoot.style.opacity = "1";
  fallbackRoot.style.pointerEvents = "none";
  fallbackRoot.style.visibility = "visible";
  fallbackRoot.style.overflow = "visible";
  const styles = Array.from(parsed.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .filter(Boolean)
    .join("\n");

  const styleNode = document.createElement("style");
  styleNode.textContent = styles;
  fallbackRoot.appendChild(styleNode);
  const content = fullExport.cloneNode(true) as HTMLElement;
  ensurePdfExportNodeVisible(content, contentWidth);
  fallbackRoot.appendChild(content);
  document.body.appendChild(fallbackRoot);

  try {
    await waitForSchedulePdfAssets(fallbackRoot);
    const canvas = await renderPdfCanvasWithRetry(html2canvas, content, contentWidth, "Fallback document");

    const imageWidth = Math.max(1, canvas.width);
    const imageHeight = Math.max(1, canvas.height);
    const contentScaleToPage = Math.min(1, contentWidth / imageWidth, contentHeight / imageHeight);
    const targetWidth = Math.max(1, Math.floor(imageWidth * contentScaleToPage));
    const targetHeight = Math.max(1, Math.floor(imageHeight * contentScaleToPage));
    const xOffset = pdfSidePadding + Math.floor((contentWidth - targetWidth) / 2);
    const yOffset = pdfSidePadding + Math.floor((contentHeight - targetHeight) / 2);

    if (imageHeight > contentHeight) {
      console.warn(
        "[styled-pdf] Fallback render had content taller than a printable page and was scaled down to fit in a single page."
      );
    }

    pdfDoc.addImage(
      canvas,
      "PNG",
      xOffset,
      yOffset,
      targetWidth,
      targetHeight,
      undefined,
      "FAST"
    );

    const finalBlob = pdfDoc.output("blob") as Blob;
    if (!finalBlob || finalBlob.size <= 0) {
      throw new Error("Styled PDF output was empty.");
    }
    return finalBlob;
  } finally {
    fallbackRoot.remove();
  }
}

async function createStyledSchedulePdfBlob(context: StyledPdfRenderContext) {
  const { html, printView } = context;
  const { jsPDF } = await import("jspdf");
  const html2canvasModule = await import("html2canvas");
  const html2canvas = (
    (html2canvasModule as unknown as { default?: (element: HTMLElement, options?: unknown) => Promise<HTMLCanvasElement> }).default ||
    (html2canvasModule as unknown as (element: HTMLElement, options?: unknown) => Promise<HTMLCanvasElement>)
  );
  const htmlSource = html;
  if (typeof window === "undefined") {
    throw new Error("PDF export is not available in this environment.");
  }

  const isStudentInstructions = printView === "student-instructions";
  const isFacultySimOpsInstructions = printView === "faculty-simops-instructions";
  const scheduleDoc = new jsPDF({
    orientation: isStudentInstructions ? "portrait" : "landscape",
    unit: "px",
    format: "a4",
    hotfixes: ["px_scaling"],
  });
  const pageWidth = scheduleDoc.internal.pageSize.getWidth();
  const pageHeight = scheduleDoc.internal.pageSize.getHeight();
  const pdfSidePadding = 8;
  const contentWidth = isStudentInstructions
    ? Math.max(1, Math.floor(pageWidth - pdfSidePadding * 2))
    : Math.max(560, Math.floor(pageWidth - pdfSidePadding * 2));
  const contentHeight = Math.max(1, Math.floor(pageHeight - pdfSidePadding * 2));
  let pagesResult: PdfExportPages | null = null;
  if (isStudentInstructions) {
    try {
      pagesResult = await buildStudentInstructionsPdfPages(htmlSource, pageWidth, pageHeight, pdfSidePadding);
    } catch (error) {
      console.error("[styled-pdf] Student instructions PDF page build failed; attempting fallback export.", error);
    }
  } else if (isFacultySimOpsInstructions) {
    try {
      pagesResult = await buildFacultySimOpsInstructionsPdfPages(htmlSource, pageWidth, pageHeight, pdfSidePadding);
    } catch (error) {
      console.error("[styled-pdf] Faculty / SimOps instructions PDF page build failed; attempting fallback export.", error);
    }
  } else {
    try {
      pagesResult = await buildSchedulePdfPages(htmlSource, pageWidth, pageHeight, pdfSidePadding);
    } catch (error) {
      console.error("[styled-pdf] Sectioned PDF page build failed; attempting fallback export.", error);
    }
  }

  if (!pagesResult) {
    return createFallbackStyledPdfBlob(htmlSource, scheduleDoc, contentWidth, contentHeight, pdfSidePadding, html2canvas);
  }

  const { pages, contentWidth: measuredWidth, contentHeight: measuredHeight, root } = pagesResult;
  const pageWidthForRender = Math.max(1, measuredWidth);
  const pageHeightForRender = Math.max(1, measuredHeight);

  const cleanup = () => {
    root.remove();
  };

  try {
    await waitForSchedulePdfAssets(root);

    const pageCount = pages.length;
    if (!pageCount) {
      console.warn("[styled-pdf] No section pages produced; falling back to full-document render.");
      return createFallbackStyledPdfBlob(htmlSource, scheduleDoc, pageWidthForRender, pageHeightForRender, pdfSidePadding, html2canvas);
    }

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      if (pageIndex > 0) {
        scheduleDoc.addPage();
      }

      const pageNode = pages[pageIndex].page;
      const pageImage = await renderPdfCanvasWithRetry(html2canvas, pageNode, pageWidthForRender, `Page ${pageIndex + 1}`);
      const imageWidth = pageImage.width;
      const imageHeight = pageImage.height;
      const baseScaledHeight = (pageWidthForRender * imageHeight) / Math.max(1, imageWidth);
      const renderScale = baseScaledHeight > pageHeightForRender ? pageHeightForRender / baseScaledHeight : 1;
      const targetWidth = Math.max(1, Math.floor(contentWidth * renderScale));
      const targetHeight = Math.max(1, Math.floor(baseScaledHeight * renderScale));
      const xOffset = pdfSidePadding + Math.floor((contentWidth - targetWidth) / 2);
      const yOffset = isStudentInstructions
        ? pdfSidePadding
        : pdfSidePadding + Math.floor((contentHeight - targetHeight) / 2);
      if (renderScale < 1) {
        console.warn(
          `[styled-pdf] Page ${pageIndex + 1} exceeded printable area and was scaled to ${Math.round(renderScale * 100)}%.`
        );
      }
      scheduleDoc.addImage(pageImage, "PNG", xOffset, yOffset, targetWidth, targetHeight, undefined, "FAST");
      if (targetHeight > contentHeight) {
        console.warn(`[styled-pdf] Page ${pageIndex + 1} still exceeds printable height; output clipping may occur.`);
      }
    }

    const finalBlob = scheduleDoc.output("blob") as Blob;
    if (!finalBlob || finalBlob.size <= 0) {
      throw new Error("Styled PDF output was empty.");
    }
    return finalBlob;
  } catch (error) {
    if (isCanvasTaintError(error)) {
      throw new Error("Direct PDF rendering blocked by browser CORS/canvas safety. Check image and asset access policies.");
    }
    console.error("[styled-pdf] Section-based PDF render failed; attempting fallback export.", error);
    return createFallbackStyledPdfBlob(htmlSource, scheduleDoc, pageWidthForRender, pageHeightForRender, pdfSidePadding, html2canvas);
  } finally {
    cleanup();
  }
}

function buildCompactScheduleExportHtml(previewHtml: string, printView: CompactSchedulePrintKind) {
  if (!previewHtml) return "";
  const printTitle = printView === "student" ? "Student Schedule PDF" : "Admin Schedule PDF";
  const sourceTitle = previewHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || printTitle;
  const resolvedTitle = printView === "operations" ? "Day Rhythm" : sourceTitle;
  const metadataCards = Array.from(
    previewHtml.matchAll(
      /<div class="event-meta-card">\s*<div class="event-meta-label">([\s\S]*?)<\/div>\s*<div class="event-meta-value">([\s\S]*?)<\/div>\s*<\/div>/gi
    )
  );
  const scheduleGridTable = previewHtml.match(/<table class="[^"]*\bschedule-grid-table\b[^"]*"[^>]*>[\s\S]*?<\/table>/i)?.[0] || "";
  const roomColumnCount =
    Array.from(previewHtml.matchAll(/<th class="room-column-header"/g)).length ||
    Math.max((previewHtml.match(/<th>/g) || []).length - 2, 1);
  const denseRoomMode = roomColumnCount >= 7;
  const fixedIndexColumnPercent = denseRoomMode ? 4.6 : roomColumnCount >= 6 ? 5.2 : 6.2;
  const fixedTimeColumnPercent = denseRoomMode ? 8.6 : roomColumnCount >= 6 ? 9.8 : 11.2;
  const fixedRoomColumnPercent = Math.max(
    denseRoomMode ? 6 : 8,
    (100 - fixedIndexColumnPercent - fixedTimeColumnPercent) / Math.max(roomColumnCount, 1)
  );
  const compactFontSize = denseRoomMode ? 5.8 : roomColumnCount >= 6 ? 6.8 : roomColumnCount >= 5 ? 7.5 : 8.8;
  const compactCardPadding = denseRoomMode ? 1 : roomColumnCount >= 6 ? 2 : 3;
  const compactGridGap = denseRoomMode ? 0 : roomColumnCount >= 6 ? 1 : 2;
  const compactShellPadding = denseRoomMode ? "0.55mm" : "1.2mm";
  const compactPreviewPadding = denseRoomMode ? "0.55mm" : "1.2mm";
  const compactPageMargin = denseRoomMode ? "0.08in" : "0.12in";
  const tableClassName = [
    "schedule-grid-table",
    denseRoomMode ? "schedule-grid--dense" : "",
    `schedule-grid--rooms-${roomColumnCount}`,
  ]
    .filter(Boolean)
    .join(" ");
  const scheduleGridTableWithColumns = scheduleGridTable
    ? scheduleGridTable.replace(
        /<table class="[^"]*\bschedule-grid-table\b[^"]*"[^>]*>/i,
        `<table class="${tableClassName}" data-room-count="${roomColumnCount}"><colgroup><col style="width:${fixedIndexColumnPercent}%"><col style="width:${fixedTimeColumnPercent}%">${Array.from(
          { length: roomColumnCount },
          () => `<col style="width:${fixedRoomColumnPercent}%">`
        ).join("")}</colgroup>`
      )
    : "";
  const compactModeStyle = [
    ":root { color-scheme: light; }",
    "html, body { margin: 0; width: 100%; max-width: 100%; overflow: visible; }",
    "body {",
    `  font-size: ${compactFontSize}px;`,
    "  background: #fff;",
    "  print-color-adjust: exact;",
    "  -webkit-print-color-adjust: exact;",
    "  box-sizing: border-box;",
    "}",
    "*, *::before, *::after { box-sizing: border-box; }",
    ".cfsp-schedule-export {",
    "  padding: 0 !important;",
    "  margin: 0 !important;",
    "  transform: none !important;",
    "  overflow: visible !important;",
    "  width: 100% !important;",
    "  max-width: 100% !important;",
    "}",
    ".cfsp-schedule-export .preview-shell { gap: 5px; width: 100%; max-width: 100%; overflow: visible; }",
    ".cfsp-schedule-export .compact-print-shell {",
    "  display: grid;",
    "  gap: 4px;",
    "  width: 100% !important;",
    "  max-width: 100% !important;",
    "  min-width: 0 !important;",
    `  padding: ${compactShellPadding};`,
    "  box-sizing: border-box;",
    "  overflow: visible !important;",
    "}",
    ".cfsp-schedule-export .compact-print-header {",
    "  display: flex;",
    "  align-items: flex-start;",
    "  justify-content: space-between;",
    "  gap: 6px;",
    "  border-bottom: 1px solid #dce6ee;",
    "  padding-bottom: 3px;",
    "}",
    ".cfsp-schedule-export .compact-print-title {",
    "  margin: 0;",
    "  color: #14304f;",
    "  font-size: 15px;",
    "  line-height: 1;",
    "  font-weight: 900;",
    "}",
    ".cfsp-schedule-export .compact-print-subtitle {",
    "  color: #5e7388;",
    "  font-size: 7.5px;",
    "  font-weight: 800;",
    "  text-transform: uppercase;",
    "  letter-spacing: 0.03em;",
    "}",
    ".cfsp-schedule-export .compact-print-meta {",
    "  display: grid;",
    "  grid-template-columns: repeat(4, minmax(0, 1fr));",
    "  gap: 3px;",
    "}",
    ".cfsp-schedule-export .compact-print-meta-card {",
    "  border: 1px solid #dce6ee;",
    "  border-radius: 4px;",
    "  padding: 2px 3px;",
    "  background: #f8fbfd;",
    "  min-width: 0;",
    "}",
    ".cfsp-schedule-export .compact-print-meta-label {",
    "  color: #5e7388;",
    "  font-size: 5.8px;",
    "  font-weight: 800;",
    "  text-transform: uppercase;",
    "  letter-spacing: 0.02em;",
    "}",
    ".cfsp-schedule-export .compact-print-meta-value {",
    "  color: #14304f;",
    "  font-size: 7.4px;",
    "  font-weight: 800;",
    "  line-height: 1.08;",
    "  overflow-wrap: anywhere;",
    "}",
    ".cfsp-schedule-export .compact-print-grid {",
    "  width: 100% !important;",
    "  max-width: 100% !important;",
    "  min-width: 0 !important;",
    "  overflow: visible !important;",
    "}",
    ".cfsp-schedule-export .preview-shell,",
    ".cfsp-schedule-export .round-section,",
    ".cfsp-schedule-export .schedule-grid-shell {",
    "  max-width: 100% !important;",
    "  box-sizing: border-box;",
    "}",
    ".cfsp-schedule-export .preview-header { gap: 3px; }",
    ".cfsp-schedule-export h1 { margin: 0; font-size: 15px; }",
    ".cfsp-schedule-export .meta,",
    ".cfsp-schedule-export .event-meta-label,",
    ".cfsp-schedule-export .detail-label,",
    ".cfsp-schedule-export .round-kicker {",
    "  font-size: 9px;",
    "  letter-spacing: 0.03em;",
    "}",
    ".cfsp-schedule-export .event-meta,",
    ".cfsp-schedule-export .round-section,",
    ".cfsp-schedule-export .rhythm-row,",
    ".cfsp-schedule-export .room-row,",
    ".cfsp-schedule-export .schedule-room-card,",
    ".cfsp-schedule-export .wide-band,",
    ".cfsp-schedule-export .divider-band {",
    "  border-radius: 8px;",
    "  page-break-inside: avoid;",
    "  break-inside: avoid;",
    "}",
    ".cfsp-schedule-export .event-meta-card,",
    ".cfsp-schedule-export .round-section { padding: 5px 6px; }",
    `.cfsp-schedule-export .event-meta { gap: ${denseRoomMode ? "3px" : "4px"}; grid-template-columns: repeat(auto-fit, minmax(${denseRoomMode ? "96px" : "112px"}, 1fr)); }`,
    ".cfsp-schedule-export .event-meta-value,",
    ".cfsp-schedule-export .detail-value,",
    ".cfsp-schedule-export .timeline-segment-title,",
    ".cfsp-schedule-export .timeline-segment-detail,",
    ".cfsp-schedule-export .rhythm-row-summary,",
    ".cfsp-schedule-export .schedule-room-card .detail-value {",
    "  font-size: 10px;",
    "  line-height: 1.2;",
    "}",
    ".cfsp-schedule-export .round-section { gap: 4px; }",
    ".cfsp-schedule-export .round-header { gap: 6px; }",
    ".cfsp-schedule-export h2 { margin: 0; font-size: 12px; }",
    ".cfsp-schedule-export .timeline-rail,",
    ".cfsp-schedule-export .rhythm-strip,",
    ".cfsp-schedule-export .divider-stack,",
    ".cfsp-schedule-export .room-grid {",
    `  gap: ${compactGridGap}px;`,
    "}",
    ".cfsp-schedule-export .timeline-segment,",
    ".cfsp-schedule-export .rhythm-chip,",
    ".cfsp-schedule-export .divider-band,",
    ".cfsp-schedule-export .room-row {",
    "  padding: 3px 5px;",
    "  min-width: 0;",
    "  border-radius: 8px;",
    "}",
    ".cfsp-schedule-export .timeline-segment-title { font-size: 10px; }",
    ".cfsp-schedule-export .timeline-segment-detail,",
    ".cfsp-schedule-export .rhythm-chip small,",
    ".cfsp-schedule-export .wide-band-meta,",
    ".cfsp-schedule-export .wide-band-note,",
    ".cfsp-schedule-export .room-capacity,",
    ".cfsp-schedule-export .room-row-detail,",
    ".cfsp-schedule-export .wide-band-title {",
    "  font-size: 8px;",
    "}",
    ".cfsp-schedule-export .schedule-grid-shell,",
    ".cfsp-schedule-export .compact-print-grid,",
    ".cfsp-schedule-export .compact-print-shell,",
    ".cfsp-schedule-export .cfsp-pdf-page {",
    "  border: none;",
    "  overflow: visible !important;",
    "  width: 100% !important;",
    "  max-width: 100% !important;",
    "  max-height: none !important;",
    "  break-inside: avoid !important;",
    "  page-break-inside: avoid !important;",
    "  -webkit-column-break-inside: avoid;",
    "  break-before: auto;",
    "}",
    ".cfsp-schedule-export .schedule-grid-table {",
    "  width: 100% !important;",
    "  min-width: 0 !important;",
    "  max-width: 100% !important;",
    "  table-layout: fixed !important;",
    "  border-collapse: collapse;",
    "  border-spacing: 0 !important;",
    "}",
    ".cfsp-schedule-export .round-grid-group {",
    "  display: table-row-group !important;",
    "  break-inside: avoid !important;",
    "  page-break-inside: avoid !important;",
    "}",
    ".cfsp-schedule-export .schedule-grid-table col { min-width: 0 !important; }",
    ".cfsp-schedule-export .round-section,",
    ".cfsp-schedule-export .round-grid-row,",
    ".cfsp-schedule-export .round-grid-group,",
    ".cfsp-schedule-export .room-row,",
    ".cfsp-schedule-export .schedule-room-cell,",
    ".cfsp-schedule-export .schedule-room-card,",
    ".cfsp-schedule-export .schedule-grid-shell,",
    ".cfsp-schedule-export .schedule-grid-table,",
    ".cfsp-schedule-export .cfsp-pdf-round,",
    ".cfsp-schedule-export .cfsp-pdf-header,",
    ".cfsp-schedule-export .wide-band,",
    ".cfsp-schedule-export .divider-band {",
    "  break-inside: avoid !important;",
    "  page-break-inside: avoid !important;",
    "  -webkit-column-break-inside: avoid;",
    "}",
    ".cfsp-schedule-export .schedule-grid-table th,",
    ".cfsp-schedule-export .schedule-grid-table td {",
    `  padding: ${denseRoomMode ? "1px 2px" : roomColumnCount >= 6 ? "2px 3px" : "3px 4px"};`,
    `  font-size: ${compactFontSize}px;`,
    "  line-height: 1.08;",
    "  vertical-align: top;",
    "  overflow: hidden;",
    "  overflow-wrap: anywhere;",
    "  word-break: break-word;",
    "  box-sizing: border-box;",
    "}",
    ".cfsp-schedule-export .schedule-grid-table th {",
    `  font-size: ${Math.max(compactFontSize - 1.2, 6.5)}px;`,
    "  white-space: normal;",
    "}",
    `.cfsp-schedule-export .round-index-column { width: ${fixedIndexColumnPercent}% !important; }`,
    `.cfsp-schedule-export .round-time-column { width: ${fixedTimeColumnPercent}% !important; }`,
    `.cfsp-schedule-export .room-assignment-column { width: ${fixedRoomColumnPercent}% !important; }`,
    `.cfsp-schedule-export .round-index-cell { width: ${fixedIndexColumnPercent}% !important; }`,
    `.cfsp-schedule-export .round-time-cell { width: ${fixedTimeColumnPercent}% !important; }`,
    ".cfsp-schedule-export .schedule-room-cell,",
    ".cfsp-schedule-export .room-column-header {",
    "  min-width: 0 !important;",
    `  width: ${fixedRoomColumnPercent}% !important;`,
    "  max-width: none !important;",
    "}",
    ".cfsp-schedule-export .round-index,",
    ".cfsp-schedule-export .round-time,",
    ".cfsp-schedule-export .round-time-summary,",
    ".cfsp-schedule-export .room-name {",
    `  font-size: ${compactFontSize}px;`,
    "  line-height: 1.08;",
    "}",
    ".cfsp-schedule-export .round-time-summary { margin-top: 2px !important; }",
    ".cfsp-schedule-export .schedule-room-card {",
    `  gap: ${compactGridGap}px;`,
    `  padding: ${compactCardPadding}px !important;`,
    `  border-radius: ${denseRoomMode ? "4px" : "5px"} !important;`,
    "  min-width: 0 !important;",
    "  box-shadow: none !important;",
    "}",
    ".cfsp-schedule-export .schedule-room-card .detail-label {",
    `  font-size: ${Math.max(compactFontSize - 2, 5.8)}px;`,
    "  letter-spacing: 0.02em;",
    "}",
    ".cfsp-schedule-export .schedule-room-card .detail-value {",
    `  font-size: ${compactFontSize}px;`,
    "  margin-top: 1px;",
    "  line-height: 1.08;",
    "}",
    ".cfsp-schedule-export .schedule-grid-table.schedule-grid--dense .schedule-room-card > div {",
    "  margin: 0 !important;",
    "}",
    ".cfsp-schedule-export .schedule-grid-table.schedule-grid--dense .detail-label,",
    ".cfsp-schedule-export .schedule-grid-table.schedule-grid--dense .detail-value {",
    "  overflow-wrap: anywhere;",
    "  word-break: break-word;",
    "}",
    ".cfsp-schedule-export .round-grid-row {",
    "  break-inside: avoid;",
    "  page-break-inside: avoid;",
    "}",
    ".cfsp-schedule-export .empty-state {",
    "  padding: 7px;",
    "  border-radius: 8px;",
    "  font-size: 10px;",
    "}",
    ".cfsp-schedule-export .cfsp-schedule-no-print,",
    ".cfsp-schedule-export .cfsp-schedule-viewer-toolbar,",
    ".cfsp-schedule-export .cfsp-schedule-actions-menu,",
    ".cfsp-schedule-export .cfsp-schedule-export-no-print,",
    ".cfsp-schedule-export .schedule-rhythm-section,",
    ".cfsp-schedule-export .rhythm-row,",
    ".cfsp-schedule-export .divider-stack,",
    ".cfsp-schedule-viewer-toolbar,",
    ".cfsp-schedule-actions-menu {",
    "  display: none !important;",
    "}",
    ".cfsp-schedule-export .schedule-grid-table thead { display: table-header-group; }",
    ".cfsp-schedule-export .schedule-grid-table tfoot { display: table-footer-group; }",
    ".cfsp-schedule-export .schedule-grid-table tr,",
    ".cfsp-schedule-export .schedule-grid-table td,",
    ".cfsp-schedule-export .schedule-grid-table th,",
    ".cfsp-schedule-export .schedule-grid-table tbody,",
    ".cfsp-schedule-export .round-grid-group,",
    ".cfsp-schedule-export .round-grid-row,",
    ".cfsp-schedule-export .schedule-room-cell,",
    ".cfsp-schedule-export .schedule-room-card {",
    "  break-inside: avoid !important;",
    "  page-break-inside: avoid !important;",
    "}",
    `.cfsp-schedule-export .preview-shell { padding: ${compactPreviewPadding}; }`,
    "@page {",
    "  size: landscape;",
    `  margin: ${compactPageMargin};`,
    "}",
    "@media print {",
    "  html, body { background: #fff !important; }",
    "  .cfsp-schedule-export { background: #fff !important; }",
    "  .cfsp-schedule-export .compact-print-grid,",
    "  .cfsp-schedule-export .schedule-grid-table,",
    "  .cfsp-schedule-export .schedule-grid-table thead,",
    "  .cfsp-schedule-export .round-grid-group,",
    "  .cfsp-schedule-export .wide-row,",
    "  .cfsp-schedule-export .wide-band,",
    "  .cfsp-schedule-export .round-grid-row,",
    "  .cfsp-schedule-export .schedule-grid-table tr,",
    "  .cfsp-schedule-export .schedule-grid-table td,",
    "  .cfsp-schedule-export .schedule-room-cell,",
    "  .event-meta-card,",
    "  .schedule-room-card,",
    "  .wide-band {",
    "    break-inside: avoid;",
    "    page-break-inside: avoid;",
    "  }",
    "  .rhythm-row { break-inside: auto !important; page-break-inside: auto !important; }",
    "  .cfsp-schedule-export .schedule-grid-table th,",
    "  .cfsp-schedule-export .schedule-grid-table td {",
    "    page-break-before: auto !important;",
    "  }",
    "  .cfsp-schedule-export .compact-print-shell {",
    "    break-inside: auto !important;",
    "  }",
    "}",
    "",
  ].join("\n");

  const compactMetaHtml = metadataCards.length
    ? `<div class="compact-print-meta">${metadataCards
        .slice(0, 4)
        .map(
          (match) => `
            <div class="compact-print-meta-card">
              <div class="compact-print-meta-label">${match[1]}</div>
              <div class="compact-print-meta-value">${match[2]}</div>
            </div>
          `
        )
        .join("")}</div>`
    : "";
  const compactGridHtml = scheduleGridTableWithColumns
    ? `<div class="schedule-grid-shell compact-print-grid">${scheduleGridTableWithColumns}</div>`
    : `<div class="empty-state">No rotation schedule has been generated yet.</div>`;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charSet="UTF-8" />
        <title>${printTitle}</title>
        <style>${compactModeStyle}</style>
      </head>
      <body class="cfsp-schedule-export">
        <main class="compact-print-shell">
          <header class="compact-print-header">
            <div>
              <h1 class="compact-print-title">${resolvedTitle}</h1>
              <div class="compact-print-subtitle">${
                printView === "student" ? "Student view" : "A compact operational rail for pacing, transitions, and major pauses."
              }</div>
            </div>
            ${compactMetaHtml}
          </header>
          ${compactGridHtml}
        </main>
      </body>
    </html>
  `;
}

function formatStudentInstructionsMinutes(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return "";
  const rounded = Math.floor(minutes);
  return `${rounded} minute${rounded === 1 ? "" : "s"}`;
}

function getStudentInstructionsJoinOffsetMinutes(config?: StudentInstructionsConfig) {
  const rawConfig = (config || {}) as Record<string, unknown>;
  const rawOffset =
    rawConfig.joinOffsetMinutes ??
    rawConfig.joinOffset ??
    rawConfig.joinLeadMinutes ??
    rawConfig.joinBeforeMinutes;
  const parsed = typeof rawOffset === "number" ? rawOffset : Number(normalizeDisplayText(rawOffset));
  if (!Number.isFinite(parsed) || parsed < 0) return 15;
  return Math.max(0, Math.floor(parsed));
}

function buildVirStyleStudentScheduleBlocks(args: {
  rounds: ScheduledRound[];
  sourceRounds?: ScheduledRound[];
  roomColumns?: PreviewRoomColumn[];
  roomContext?: Parameters<typeof getRoomDisplayLabel>[2];
}) {
  const { rounds, sourceRounds = [], roomColumns = [], roomContext = {} } = args;
  const blocks: StudentInstructionsScheduleBlock[] = [];

  rounds.forEach((round) => {
    const sourceRound = sourceRounds.find((candidate) => candidate.round === round.round) || null;
    const start = round.start;
    const startLabel = toDisplayTime(start);
    const timing = buildStudentScheduleTiming(start);
    const title = startLabel ? `${startLabel} Encounter` : `Round ${round.round}`;
    const detail = `Round ${round.round} • ${formatStudentScheduleEncounterLine(timing)}`;
    const effectiveColumns =
      roomColumns.length > 0
        ? roomColumns
        : round.roomSlots.map((slot, roomIndex) => ({
            slotIndex: roomIndex,
            roomName: slot.roomName,
            displayRoomName: formatRoomName(slot.roomName, slot.roomType, roomIndex + 1, roomContext),
            roomType: slot.roomType,
            capacityLabel: slot.capacityLabel,
          }));
    const cellSeeds: StudentInstructionsScheduleCellSeed[] = effectiveColumns.map((roomColumn, roomIndex) => {
      // IMPORTANT REGRESSION GUARD:
      // Schedule Viewer is known-good and must not be changed for this fix.
      // Student Instructions export must render learner labels in the exact room cells from the
      // completed schedule snapshot. Resolve room slots by stable slot index from source rounds first,
      // and never rebuild room placement from counts or inferred learner ordering.
      const slotIndex = roomColumn.slotIndex;
      const sourceSlot = sourceRound?.roomSlots[slotIndex];
      const roundSlotByIndex = round.roomSlots[slotIndex];
      const roundSlotByRoomName = round.roomSlots.find((slot) => normalizeDisplayText(slot.roomName) === normalizeDisplayText(roomColumn.roomName));
      const slot = sourceSlot || roundSlotByIndex || roundSlotByRoomName || null;
      const roomLabel = slot
        ? formatRoomName(
            slot.roomName,
            slot.roomType,
            slotIndex + 1,
            roomContext
          )
        : normalizeDisplayText(roomColumn.displayRoomName) || `Breakout Room ${roomIndex + 1}`;
      return {
        roomLabel,
        studentLabels: normalizeLearnerNames(slot?.learnerLabels || []),
      };
    });

    // PDF-only safeguard:
    // If schedule data arrives collapsed into one populated slot with N labels and N room columns,
    // spread labels one-per-room to avoid a vertical learner-axis print artifact.
    const populatedCells = cellSeeds.filter((cell) => cell.studentLabels.length > 0);
    const collapsedLabels = populatedCells.length === 1 ? populatedCells[0].studentLabels : [];
    const shouldRecoverCollapsedRoomAxis =
      populatedCells.length === 1 && collapsedLabels.length === cellSeeds.length && cellSeeds.length > 1;
    const normalizedSeeds = shouldRecoverCollapsedRoomAxis
      ? cellSeeds.map((cell, index) => ({
          roomLabel: cell.roomLabel,
          studentLabels: collapsedLabels[index] ? [collapsedLabels[index]] : [],
        }))
      : cellSeeds;

    const cells: StudentInstructionsScheduleCell[] = normalizedSeeds.map((seed, roomIndex) => ({
      key: `round-${round.round}-room-${roomIndex}`,
      roomLabel: seed.roomLabel,
      studentLabels: seed.studentLabels,
    }));

    blocks.push({
      key: `round-${round.round}`,
      title,
      detail,
      cells,
    });
  });

  return blocks;
}

function buildStudentPacketSimpleScheduleHtml(blocks: StudentInstructionsScheduleBlock[]) {
  if (!blocks.length) {
    return `
      <section class="student-packet-page-section instructions-section student-schedule-section student-schedule-section-first" data-packet-section="student-schedule-start">
        <div class="student-schedule-heading">
          <div>
            <h3>Student Schedule</h3>
            <p>Find your encounter time and assigned breakout room below.</p>
          </div>
        </div>
        <div class="student-schedule-empty">No student schedule has been generated yet.</div>
      </section>
    `;
  }

  const intro = `
    <section class="student-packet-page-section instructions-section student-schedule-section student-schedule-section-first" data-packet-section="student-schedule-start">
      <div class="student-schedule-heading">
        <div>
          <h3>Student Schedule</h3>
          <p>Find your encounter time and assigned room below.</p>
        </div>
      </div>
    </section>
  `;

  return `${intro}${blocks
    .map((block) => {
      const roomCount = Math.max(block.cells.length, 1);
      return `
        <section class="student-packet-page-section student-schedule-section student-packet-round-simple${roomCount >= 7 ? " student-packet-round-simple-dense" : ""}" data-packet-section="student-schedule-round">
          <div class="student-packet-round-header">
            <strong>${escapeHtml(block.title)}</strong>
            <span>${escapeHtml(block.detail)}</span>
          </div>
          <div class="student-packet-room-row" style="--room-count: ${roomCount};">
            ${block.cells
              .map(
                (cell) => `
                  <div class="student-packet-room-card${cell.studentLabels.length ? "" : " student-packet-room-card-empty"}">
                    <div class="student-packet-room-name">${escapeHtml(cell.roomLabel)}</div>
                    <div class="student-packet-room-learners">
                      ${
                        cell.studentLabels.length
                          ? cell.studentLabels.map((student) => `<div>${escapeHtml(student)}</div>`).join("")
                          : `<div>No student assigned</div>`
                      }
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("")}`;
}

function normalizeStudentInstructionsProgramLabel(value: unknown) {
  return normalizeDisplayText(value)
    .replace(/\s+Standardized Patient\s*\(SP\)\s*Simulation Cases\s*$/i, "")
    .trim();
}

function isGenericStudentInstructionsProgramLabel(value: string) {
  const normalized = normalizeStudentInstructionsProgramLabel(value)
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase();
  return normalized === "PROGRAM";
}

type InstructionTemplateSection = {
  heading: string;
  paragraphs: string[];
  bullets: string[];
};

function parseInstructionTemplateSections(template: string) {
  const lines = template.split(/\r?\n/).map((line) => line.trimEnd());

  if (!lines.some((line) => line.trim())) return [] as InstructionTemplateSection[];

  const sections: InstructionTemplateSection[] = [];
  let current: InstructionTemplateSection | null = null;

  const ensureCurrent = () => {
    if (!current) {
      current = { heading: "", paragraphs: [], bullets: [] };
      sections.push(current);
    }
    return current;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      const active = current;
      if (active && (active.paragraphs.length || active.bullets.length)) active.paragraphs.push("");
      return;
    }

    const markdownHeading = line.match(/^#{1,4}\s+(.+)$/);
    if (markdownHeading || /^[^:*]+:\s*$/.test(line)) {
      const headingText = (markdownHeading?.[1] || line).replace(/:\s*$/, "");
      current = { heading: headingText.replace(/\*\*/g, "").trim(), paragraphs: [], bullets: [] };
      sections.push(current);
      return;
    }

    const bulletMatch = line.match(/^(?:[-*]\s+)(.+)$/);
    if (bulletMatch) {
      ensureCurrent().bullets.push(bulletMatch[1].trim().replace(/\*\*/g, ""));
      return;
    }

    ensureCurrent().paragraphs.push(line.replace(/\*\*/g, ""));
  });

  return sections;
}

function buildInstructionTemplateSectionsHtml(template: string, emptyLabel: string) {
  const sections = parseInstructionTemplateSections(template);
  if (!sections.length) {
    return `<div class="faculty-instructions-empty">${escapeHtml(emptyLabel)}</div>`;
  }

  return sections
    .map((section) => {
      const heading = normalizeDisplayText(section.heading);
      const paragraphsHtml = section.paragraphs
        .map((paragraph) => (paragraph ? `<p>${escapeHtml(paragraph)}</p>` : `<div class="faculty-instruction-spacer"></div>`))
        .join("");
      const bulletsHtml = section.bullets.length
        ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
        : "";
      return `
        <section class="faculty-instruction-card">
          ${heading ? `<h3>${escapeHtml(heading)}</h3>` : ""}
          ${paragraphsHtml}
          ${bulletsHtml}
        </section>
      `;
    })
    .join("");
}

function buildFacultySimOpsScheduleBodyHtml(scheduleBody: string) {
  if (!scheduleBody) return '<div class="empty-state">No Admin Schedule has been generated yet.</div>';
  const parsed = new DOMParser().parseFromString(`<main>${scheduleBody}</main>`, "text/html");
  const root = parsed.querySelector("main");
  if (!root) return scheduleBody;

  root.querySelectorAll(".compact-print-header, .preview-header, .event-meta, .schedule-rhythm-section, .divider-stack").forEach((node) => node.remove());
  root.querySelectorAll(".schedule-room-card").forEach((card) => {
    const details = Array.from(card.querySelectorAll("div"));
    details.forEach((detail) => {
      const label = normalizeDisplayText(detail.querySelector(".detail-label")?.textContent);
      const value = normalizeDisplayText(detail.querySelector(".detail-value")?.textContent);
      if (!label || !value || /^seat$/i.test(label)) {
        detail.remove();
        return;
      }
      if (/^learner$/i.test(label)) {
        detail.innerHTML = `<span class="faculty-schedule-learner">${escapeHtml(value)}</span>`;
        return;
      }
      if (/^sp$/i.test(label)) {
        detail.innerHTML = `<span class="faculty-schedule-secondary">SP: ${escapeHtml(value)}</span>`;
        return;
      }
      detail.innerHTML = `<span class="faculty-schedule-secondary">${escapeHtml(label)}: ${escapeHtml(value)}</span>`;
    });
  });

  return root.innerHTML;
}

function buildFacultySimOpsInstructionsExportHtml(context: FacultySimOpsInstructionsExportContext) {
  const {
    event,
    programLabel,
    dateLabel,
    locationLabel,
    instructionsConfig,
    arrivalTimeLabel,
    firstEncounterTimeLabel,
    roundCount,
    roomCount,
    encounterMinutes,
    checklistMinutes,
    feedbackMinutes,
    transitionMinutes,
    adminScheduleHtml,
  } = context;

  const eventProgramLabel = [programLabel, event?.name]
    .map((value) => normalizeDisplayText(value))
    .find(Boolean) || "CFSP Event";
  const resolvedDateLabel = normalizeDisplayText(dateLabel) || "Not set";
  const resolvedLocation = normalizeDisplayText(locationLabel || event?.location) || "Not set";
  const generatedTimestamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const instructionTemplate = normalizeDisplayText(instructionsConfig?.template);
  const footerNote =
    normalizeDisplayText(instructionsConfig?.footerNote) ||
    "This document is intended for faculty, SimOps, and event staff. It includes operational scheduling details for event management.";
  const summaryItems = [
    { label: "Event date", value: resolvedDateLabel },
    { label: "Arrival / check-in", value: normalizeDisplayText(arrivalTimeLabel) || "Not set" },
    { label: "First encounter", value: normalizeDisplayText(firstEncounterTimeLabel) || "Not set" },
    { label: "Location", value: resolvedLocation },
    { label: "Rounds", value: roundCount && roundCount > 0 ? String(roundCount) : "Not set" },
    { label: "Rooms", value: roomCount && roomCount > 0 ? String(roomCount) : "Not set" },
    { label: "Encounter duration", value: encounterMinutes && encounterMinutes > 0 ? `${Math.floor(encounterMinutes)} min` : "Not set" },
    {
      label: "Feedback / transition",
      value:
        [feedbackMinutes, transitionMinutes]
          .map((value) => (value && value > 0 ? `${Math.floor(value)} min` : ""))
          .filter(Boolean)
          .join(" + ") || "Not set",
    },
    {
      label: "Checklist cadence",
      value: checklistMinutes && checklistMinutes > 0 ? `${Math.floor(checklistMinutes)} min` : "Not set",
    },
  ];
  const scheduleParts = getPreviewDocumentParts(adminScheduleHtml || "");
  const scheduleStyles = scheduleParts.styles || "";
  const scheduleBody = buildFacultySimOpsScheduleBodyHtml(
    scheduleParts.body || '<div class="empty-state">No Admin Schedule has been generated yet.</div>'
  );
  const directionsHtml = buildInstructionTemplateSectionsHtml(
    instructionTemplate,
    "Add Faculty / SimOps instructions in Event Settings before exporting this packet."
  );

  return `
    <!doctype html>
    <html>
      <head>
        <meta charSet="UTF-8" />
        <title>Faculty / SimOps Event Instructions</title>
        <style>
          :root { color-scheme: light; }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #102a43;
            font-family: Arial, Helvetica, sans-serif;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          *, *::before, *::after { box-sizing: border-box; }
          .cfsp-schedule-export {
            width: 100%;
            max-width: 100%;
            background: #ffffff;
          }
          .compact-print-shell.faculty-simops-instructions-document {
            display: grid;
            gap: 0;
            padding: 0;
            background: #ffffff;
          }
          .faculty-simops-front-page,
          .faculty-simops-schedule-page {
            display: grid;
            gap: 8px;
            padding: 10px 12px;
            background: #ffffff;
          }
          .faculty-simops-schedule-page {
            gap: 6px;
          }
          .compact-print-header.faculty-simops-header {
            display: grid !important;
            gap: 8px !important;
            align-items: start !important;
            border-bottom: none !important;
            padding-bottom: 0 !important;
          }
          .faculty-simops-brand {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            align-items: flex-start;
            border: 1px solid #d8e4ef;
            border-radius: 8px;
            padding: 9px 11px;
            background: #f7fbff;
          }
          .faculty-simops-kicker {
            color: #145b96;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .faculty-simops-brand h1 {
            margin: 4px 0 0 0;
            color: #102a43;
            font-size: 20px;
            line-height: 1.12;
            font-weight: 900;
          }
          .faculty-simops-brand p {
            margin: 6px 0 0 0;
            color: #486581;
            font-size: 10px;
            line-height: 1.45;
            font-weight: 700;
            max-width: 820px;
          }
          .faculty-simops-stamp {
            min-width: 180px;
            display: grid;
            gap: 4px;
            text-align: right;
          }
          .faculty-simops-stamp-label {
            color: #829ab1;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .faculty-simops-stamp-value {
            color: #102a43;
            font-size: 12px;
            font-weight: 800;
            line-height: 1.3;
          }
          .faculty-summary-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 5px;
          }
          .faculty-summary-card {
            border: 1px solid #d8e4ef;
            border-radius: 6px;
            padding: 5px 7px;
            background: #f8fbfe;
            min-height: 42px;
          }
          .faculty-summary-label {
            color: #627d98;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .faculty-summary-value {
            margin-top: 5px;
            color: #102a43;
            font-size: 11px;
            font-weight: 900;
            line-height: 1.25;
            overflow-wrap: anywhere;
          }
          .faculty-instructions-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
          }
          .faculty-instruction-card {
            border: 1px solid #d8e4ef;
            border-radius: 8px;
            padding: 7px 8px;
            background: #ffffff;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .faculty-instruction-card h3 {
            margin: 0 0 6px 0;
            color: #145b96;
            font-size: 11px;
            font-weight: 900;
            line-height: 1.2;
          }
          .faculty-instruction-card p,
          .faculty-instruction-card li {
            margin: 0;
            color: #243b53;
            font-size: 9.5px;
            line-height: 1.35;
            font-weight: 700;
          }
          .faculty-instruction-card p + p { margin-top: 4px; }
          .faculty-instruction-spacer { height: 5px; }
          .faculty-instruction-card ul {
            margin: 4px 0 0 0;
            padding-left: 13px;
            display: grid;
            gap: 2px;
          }
          .faculty-instructions-empty {
            border: 1px dashed #cbd8e6;
            border-radius: 12px;
            padding: 10px 12px;
            color: #627d98;
            font-size: 11px;
            font-weight: 700;
          }
          .faculty-footer-note {
            border: 1px solid #d8e4ef;
            border-radius: 6px;
            padding: 6px 8px;
            background: #f8fbfe;
            color: #486581;
            font-size: 9px;
            font-weight: 800;
            line-height: 1.4;
          }
          .faculty-schedule-shell {
            border: none;
            border-radius: 0;
            padding: 0;
            background: #ffffff;
          }
          .faculty-schedule-heading {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            align-items: baseline;
            margin-bottom: 4px;
            border-bottom: 1px solid #d8e4ef;
            padding-bottom: 4px;
          }
          .faculty-schedule-heading h2 {
            margin: 0;
            color: #102a43;
            font-size: 12px;
            font-weight: 900;
          }
          .faculty-schedule-heading p {
            margin: 0;
            color: #627d98;
            font-size: 8px;
            font-weight: 800;
          }
          ${scheduleStyles}
          .faculty-schedule-shell .compact-print-shell {
            padding: 0 !important;
            gap: 0 !important;
          }
          .faculty-schedule-shell .compact-print-header {
            display: none !important;
          }
          .faculty-schedule-shell .compact-print-grid {
            margin-top: 0 !important;
          }
          .faculty-schedule-shell .preview-shell,
          .faculty-schedule-shell .round-section {
            padding: 0 !important;
            border: none !important;
            gap: 0 !important;
            background: #ffffff !important;
          }
          .faculty-schedule-shell .schedule-grid-table th,
          .faculty-schedule-shell .schedule-grid-table td {
            padding: 2px 3px !important;
            font-size: 6.5px !important;
            line-height: 1.12 !important;
          }
          .faculty-schedule-shell .schedule-room-card {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            gap: 1px !important;
          }
          .faculty-schedule-learner {
            display: block;
            color: #102a43;
            font-size: 7px;
            font-weight: 900;
            line-height: 1.12;
          }
          .faculty-schedule-secondary {
            display: block;
            color: #486581;
            font-size: 6px;
            font-weight: 800;
            line-height: 1.12;
          }
          .faculty-schedule-shell .round-time-summary {
            display: none !important;
          }
          .faculty-schedule-shell .wide-band {
            border-radius: 4px !important;
            padding: 2px 4px !important;
          }
          @page {
            size: landscape;
            margin: 0.28in;
          }
          @media print {
            html, body { background: #ffffff !important; }
            .faculty-simops-brand,
            .faculty-summary-card,
            .faculty-instruction-card,
            .faculty-footer-note,
            .faculty-schedule-shell {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <main class="cfsp-schedule-export">
          <article class="compact-print-shell faculty-simops-instructions-document">
            <section class="faculty-simops-front-page">
              <header class="compact-print-header faculty-simops-header">
                <section class="faculty-simops-brand">
                  <div>
                    <div class="faculty-simops-kicker">Conflict-Free SP</div>
                    <h1>Faculty / SimOps Instructions</h1>
                    <p>${escapeHtml(
                      "Operational instructions for faculty, SimOps, and event staff running the event."
                    )}</p>
                  </div>
                  <div class="faculty-simops-stamp">
                    <div>
                      <div class="faculty-simops-stamp-label">Event</div>
                      <div class="faculty-simops-stamp-value">${escapeHtml(eventProgramLabel)}</div>
                    </div>
                    <div>
                      <div class="faculty-simops-stamp-label">Generated</div>
                      <div class="faculty-simops-stamp-value">${escapeHtml(generatedTimestamp)}</div>
                    </div>
                  </div>
                </section>
                <section class="faculty-summary-grid">
                  ${summaryItems
                    .map(
                      (item) => `
                        <div class="faculty-summary-card">
                          <div class="faculty-summary-label">${escapeHtml(item.label)}</div>
                          <div class="faculty-summary-value">${escapeHtml(item.value)}</div>
                        </div>
                      `
                    )
                    .join("")}
                </section>
                <section class="faculty-instructions-grid">
                  ${directionsHtml}
                </section>
                <div class="faculty-footer-note">${escapeHtml(footerNote)}</div>
              </header>
            </section>

            <section class="faculty-simops-schedule-page">
              <section class="faculty-schedule-shell">
                <div class="faculty-schedule-heading">
                  <h2>${escapeHtml(`${eventProgramLabel} · Faculty / SimOps Admin Schedule · ${resolvedDateLabel}`)}</h2>
                  <p>Operational source of truth for rooms, SPs, cases, pacing, and round flow.</p>
                </div>
                ${scheduleBody}
              </section>
            </section>
          </article>
        </main>
      </body>
    </html>
  `;
}

function buildStudentInstructionsExportHtml(context: StudentInstructionsExportContext) {
  const {
    event,
    instructionsConfig,
    encounterMinutes,
    feedbackMinutes,
    firstEncounterStartMinutes,
    studentScheduleRounds = [],
    roomColumns = [],
    roomContext,
  } = context;
  const eventProgramLabel = [context.programLabel, event?.name]
    .map(normalizeStudentInstructionsProgramLabel)
    .find((label) => label && !isGenericStudentInstructionsProgramLabel(label));
  const savedProgramLabel = normalizeStudentInstructionsProgramLabel(instructionsConfig?.title);
  const programLabel =
    eventProgramLabel ||
    (!isGenericStudentInstructionsProgramLabel(savedProgramLabel) ? savedProgramLabel : "") ||
    "PROGRAM";
  const dateLabel = normalizeDisplayText(context.dateLabel);
  const trainingMetadata = parseEventMetadata(context.event?.notes).training;
  const trainingAccessLinks = [trainingMetadata.zoom_url, trainingMetadata.training_zoom_link]
    .map((value) => asText(value))
    .filter(Boolean);
  const accessDetails = resolveStudentInstructionsAccessDetails({
    configAccess: instructionsConfig?.zoomLink,
    contextAccess: context.zoomLink,
    contextLocation: context.locationLabel,
    eventLocation: context.event?.location,
    excludedAccessLinks: trainingAccessLinks,
  });
  const zoomLink = accessDetails.zoomLink;
  const locationLabel = accessDetails.location;
  const hasVirtualAccess = Boolean(zoomLink);
  const hasPhysicalLocation = Boolean(locationLabel);
  const accessMode = hasVirtualAccess && !hasPhysicalLocation
    ? "virtual"
    : !hasVirtualAccess && hasPhysicalLocation
      ? "in_person"
      : "hybrid";
  const encounterLabel = normalizeDisplayText(instructionsConfig?.encounterTimeDetail) || formatStudentInstructionsMinutes(encounterMinutes);
  const feedbackLabel = normalizeDisplayText(instructionsConfig?.feedbackTimeDetail) || formatStudentInstructionsMinutes(feedbackMinutes);
  const announcementScheduleConfig = parseAnnouncementScheduleFromNotes(context.event?.notes);
  const studentPacketAnnouncementFlow = studentScheduleRounds[0]
    ? buildRoundAnnouncementCueTimeline(studentScheduleRounds[0], studentScheduleRounds[1] || null, announcementScheduleConfig, {
        formatTime: (minutes) => formatDisplayTimeFromMinutes(minutes),
      }).slice(0, 6)
    : [];
  const joinOffsetMinutes = getStudentInstructionsJoinOffsetMinutes(instructionsConfig);
  const arrivalOffsetMinutes = joinOffsetMinutes > 0 ? joinOffsetMinutes : 15;
  const hasFirstEncounterStart =
    typeof firstEncounterStartMinutes === "number" && Number.isFinite(firstEncounterStartMinutes);
  const firstEncounterStartMinuteValue = hasFirstEncounterStart ? Math.floor(firstEncounterStartMinutes) : null;
  const joinByMinuteValue =
    firstEncounterStartMinuteValue === null ? null : firstEncounterStartMinuteValue - arrivalOffsetMinutes;
  const firstEncounterLabel = firstEncounterStartMinuteValue === null ? "" : toDisplayTime(firstEncounterStartMinuteValue);
  const joinTimeLabel = joinByMinuteValue === null ? "" : toDisplayTime(joinByMinuteValue);
  const arrivalVerb = accessMode === "virtual" ? "join" : accessMode === "in_person" ? "arrive" : "arrive/check in";
  const arrivalInstruction = hasFirstEncounterStart && firstEncounterLabel && joinTimeLabel
    ? `The first encounter begins at ${firstEncounterLabel}. Please ${arrivalVerb} by ${joinTimeLabel} for pre-brief.`
    : `Please ${arrivalVerb} at least ${arrivalOffsetMinutes} minutes before your first scheduled encounter for pre-brief.`;
  const customJoinInstructions = normalizeDisplayText(instructionsConfig?.joinInstructions);
  const supplementalJoinInstruction =
    customJoinInstructions && !/students?\s+join\s+zoom/i.test(customJoinInstructions)
      ? customJoinInstructions
      : "";
  const waitingRoomNote = normalizeDisplayText(instructionsConfig?.waitingRoomNote);
  const timeZoneNote = normalizeDisplayText(instructionsConfig?.timeZoneNote);
  const netiquetteLines = splitInstructionLines(instructionsConfig?.netiquetteInstructions || "");
  const prebriefLines = splitInstructionLines(instructionsConfig?.prebriefInstructions || "");
  const scenarioReminderLines = splitInstructionLines(instructionsConfig?.scenarioReminders || "");
  const footerNote = normalizeDisplayText(instructionsConfig?.footerNote);
  const timingRows: Array<[string, string]> = [
    ["Encounter Time:", encounterLabel],
    ["Feedback Time:", feedbackLabel],
  ];
  if (firstEncounterLabel) {
    timingRows.push(["First scheduled encounter:", firstEncounterLabel]);
  }
  if (joinTimeLabel) {
    timingRows.push(["Arrival / check-in:", joinTimeLabel]);
  }
  const accessRows: string[] = [];
  if (locationLabel) {
    accessRows.push(`<p>Location: ${escapeHtml(locationLabel)}</p>`);
  }
  if (zoomLink) {
    const zoomHref = /^https?:\/\//i.test(zoomLink) ? zoomLink : `https://${zoomLink}`;
    accessRows.push(`<p>Zoom link: <a href="${escapeHtml(zoomHref)}">${escapeHtml(zoomLink)}</a></p>`);
  }
  if (!accessRows.length) {
    accessRows.push("<p>Location: Provided separately.</p>");
  }
  const summaryStripItems: Array<{ label: string; value: string }> = [
    { label: "Date", value: dateLabel || "TBD" },
    { label: "Arrival / Check-in", value: joinTimeLabel || "TBD" },
    { label: "First Encounter", value: firstEncounterLabel || "TBD" },
    { label: "Location", value: locationLabel || (hasVirtualAccess ? "Virtual encounter access provided below" : "Provided separately") },
    { label: "Rounds", value: studentScheduleRounds.length ? String(studentScheduleRounds.length) : "TBD" },
    { label: "Rooms", value: roomColumns.length ? String(roomColumns.length) : "TBD" },
  ];
  const scheduleBlocks = buildVirStyleStudentScheduleBlocks({
    rounds: studentScheduleRounds,
    sourceRounds: context.studentScheduleSourceRounds || [],
    roomColumns,
    roomContext,
  });
  const simpleScheduleHtml = buildStudentPacketSimpleScheduleHtml(scheduleBlocks);

  return `
    <!doctype html>
    <html>
      <head>
        <meta charSet="UTF-8" />
        <title>Student Instructions Document</title>
        <style>
          :root { color-scheme: light; }
          html, body { margin: 0; width: 100%; background: #ffffff; }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #172f49;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          *, *::before, *::after { box-sizing: border-box; }
          .cfsp-schedule-export {
            width: 100%;
            max-width: 100%;
            margin: 0;
            background: #ffffff;
          }

          /* Force Student Instructions packet to start at the top of page 1 */
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          .cfsp-pdf-page,
          .cfsp-pdf-page-content,
          .cfsp-pdf-section,
          .cfsp-pdf-header,
          .student-instructions-document {
            justify-content: flex-start !important;
            align-content: flex-start !important;
            align-items: stretch !important;
            vertical-align: top !important;
          }
          .cfsp-pdf-page {
            padding-top: 0 !important;
          }
          .cfsp-pdf-page-content {
            padding-top: 0 !important;
            margin-top: 0 !important;
          }
          .student-instructions-document {
            margin-top: 0 !important;
            padding-top: 0 !important;
            transform: none !important;
          }
          .student-instructions-header {
            margin-top: 0 !important;
            padding-top: 0 !important;
          }

          .student-instructions-document {
            display: grid;
            gap: 14px;
            padding: 0 40px 30px;
            background: #ffffff;
          }
          .student-instructions-header {
            display: grid;
            gap: 6px;
            padding-bottom: 0;
          }
          .student-instructions-header h1 {
            margin: 0;
            color: #102a43;
            font-size: 25px;
            line-height: 1.15;
            font-weight: 900;
          }
          .student-instructions-date {
            display: flex;
            gap: 8px;
            align-items: baseline;
            color: #17304f;
            font-size: 14px;
            font-weight: 800;
          }
          .student-instructions-date span:last-child {
            min-width: 180px;
            border-bottom: 1px solid #aab8c5;
            min-height: 18px;
          }
          .student-instructions-subtitle {
            display: block;
            margin: 8px 0 0 0;
            padding-bottom: 7px;
            border-bottom: 0;
color: #17304f;
            font-size: 18px;
            line-height: 1.2;
            font-weight: 900;
          }

          .student-instructions-document {
            display: grid !important;
            gap: 9px !important;
            padding: 0 34px 22px !important;
            margin: 0 !important;
            background: #ffffff !important;
            align-content: start !important;
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            overflow: visible !important;
          }
          .student-instructions-header {
            display: grid !important;
            gap: 4px !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-bottom: 0 !important;
            align-content: start !important;
          }
          .student-instructions-header h1 {
            margin: 0 !important;
            padding: 0 !important;
            line-height: 1.08 !important;
          }
          .student-instructions-date {
            margin: 0 !important;
            padding: 0 !important;
            line-height: 1.15 !important;
          }
          .student-instructions-subtitle {
            position: relative !important;
            display: block !important;
            margin: 3px 0 5px 0 !important;
            padding: 0 0 6px 0 !important;
            border: 0 !important;
            border-bottom: 0 !important;
            text-decoration: none !important;
            color: #17304f !important;
            font-size: 18px !important;
            line-height: 1.2 !important;
            font-weight: 900 !important;
          }
          .student-instructions-subtitle::after {
            content: "" !important;
            display: block !important;
            width: 100% !important;
            height: 2px !important;
            margin-top: 5px !important;
            background: #17304f !important;
          }
          .student-instructions-subtitle *,
          .student-instructions-subtitle span {
            text-decoration: none !important;
            border: 0 !important;
          }

          .instructions-section {
            display: grid;
            gap: 7px;
            border: 1px solid #d7e1ea;
            border-radius: 8px;
            padding: 10px 12px;
            background: #fbfdff;
            width: 100%;
            max-width: 100%;
            min-width: 0;
            overflow: visible;
            white-space: normal;
            overflow-wrap: break-word;
            word-break: normal;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .instructions-section h3 {
            margin: 0;
            color: #14304f;
            font-size: 15px;
            line-height: 1.2;
            font-weight: 900;
          }
          .instructions-section p {
            margin: 0;
            color: #29445f;
            font-size: 12.5px;
            line-height: 1.38;
            max-width: 100%;
            min-width: 0;
            overflow: visible;
            white-space: normal;
            overflow-wrap: break-word;
            word-break: normal;
          }
          .instructions-list {
            margin: 0;
            padding-left: 19px;
            color: #29445f;
            font-size: 12.5px;
            line-height: 1.34;
            max-width: 100%;
            min-width: 0;
            overflow: visible;
            white-space: normal;
            overflow-wrap: break-word;
            word-break: normal;
          }
          .instructions-list li {
            margin: 2px 0;
            max-width: 100%;
            overflow: visible;
            white-space: normal;
            overflow-wrap: break-word;
            word-break: normal;
          }
          .timing-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
          .timing-item {
            border: 1px solid #d7e1ea;
            border-radius: 8px;
            padding: 8px 10px;
            background: #ffffff;
            min-height: 50px;
          }
          .timing-label {
            color: #60768b;
            font-size: 10.5px;
            font-weight: 900;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .timing-value {
            margin-top: 5px;
            color: #14304f;
            font-size: 14px;
            font-weight: 900;
            line-height: 1.25;
          }
          .announcement-flow-panel {
            display: grid;
            gap: 8px;
            width: 100%;
            max-width: 100%;
            overflow: visible;
          }
          .announcement-flow-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px 7px;
            width: 100%;
            max-width: 100%;
            overflow: visible;
          }
          .announcement-flow-item {
            min-width: 0;
            border: 1px solid #d7e1ea;
            border-radius: 8px;
            padding: 5px 7px;
            background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
            min-height: 40px;
            display: grid;
            gap: 3px;
            align-content: start;
            overflow: visible;
            white-space: normal;
            overflow-wrap: break-word;
          }
          .announcement-flow-offset {
            color: #12617f;
            font-size: 9.5px;
            font-weight: 900;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            white-space: normal;
            overflow-wrap: break-word;
          }
          .announcement-flow-text {
            color: #14304f;
            font-size: 10.8px;
            font-weight: 800;
            line-height: 1.18;
            white-space: normal;
            overflow-wrap: break-word;
          }
          .student-schedule-heading {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: baseline;
            border-bottom: 1px solid #d7e1ea;
            padding-bottom: 8px;
          }
          .student-schedule-heading p {
            margin: 4px 0 0 0;
            color: #60768b;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.35;
          }

          /* Student Instructions schedule: prevent clipped learner names */
          .student-schedule-grid,
          .student-instructions-schedule-grid,
          .student-schedule-encounter-grid,
          .vir-student-schedule-grid {
            width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            overflow: visible !important;
          }
          .student-schedule-grid th,
          .student-schedule-grid td,
          .student-instructions-schedule-grid th,
          .student-instructions-schedule-grid td,
          .student-schedule-encounter-grid th,
          .student-schedule-encounter-grid td,
          .vir-student-schedule-grid th,
          .vir-student-schedule-grid td {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: unset !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            line-height: 1.18 !important;
          }
          .student-schedule-student,
          .student-name-cell,
          .student-schedule-learner,
          .vir-student-name {
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: unset !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
            min-height: 30px !important;
          }

          .student-schedule-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .student-schedule-section-first {
            break-before: page;
            page-break-before: always;
          }
          .student-schedule-block-section {
            padding: 0;
            border: none;
            background: transparent;
            display: block;
          }
          .vir-schedule-block {
            width: 100%;
            border: 1px solid #aebccb;
            border-radius: 8px;
            overflow: hidden;
            background: #ffffff;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .vir-encounter-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 8px 11px;
            background: #132b45;
            color: #ffffff;
          }
          .vir-encounter-title span {
            font-size: 14px;
            line-height: 1.15;
            font-weight: 950;
          }
          .vir-encounter-title small {
            color: #dbe7f2;
            font-size: 10.5px;
            line-height: 1.2;
            font-weight: 850;
            text-align: right;
          }
          .vir-room-table {
            width: 100%;
            max-width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            background: #ffffff;
            border-top: 1px solid #aebccb;
          }
          .vir-room-table-col {
            width: auto;
            min-width: 0;
          }
          .vir-room-header {
            min-width: 0;
            min-height: 34px;
            padding: 7px 7px;
            border-bottom: 1px solid #aebccb;
            border-right: 1px solid #c3cfda;
            background: #e8eef5;
            color: #24445f;
            font-size: 10px;
            line-height: 1.15;
            font-weight: 950;
            text-align: center;
            white-space: normal;
            overflow: visible;
            text-overflow: unset;
            overflow-wrap: anywhere;
          }
          .vir-room-table thead th:last-child,
          .vir-room-table tbody td:last-child { border-right: none; }
          .vir-student-cell {
            min-width: 0;
            min-height: 34px;
            padding: 7px 6px;
            border-right: 1px solid #d5e0e8;
            background: #f8fffb;
            color: #12324d;
            text-align: center;
            display: grid;
            align-content: center;
            gap: 3px;
            white-space: normal;
            overflow: visible;
            text-overflow: unset;
            overflow-wrap: anywhere;
            vertical-align: middle;
          }
          .vir-student-cell-empty {
            background: #fbf3e6;
            color: #8a6741;
          }
          .vir-student-name {
            font-size: 10.8px;
            line-height: 1.18;
            font-weight: 950;
            white-space: normal;
            overflow: visible;
            text-overflow: unset;
            overflow-wrap: anywhere;
          }
          .vir-room-table-dense .vir-room-header {
            padding: 6px 5px;
            font-size: 9px;
            line-height: 1.1;
          }
          .vir-room-table-dense .vir-student-cell {
            min-height: 30px;
            padding: 6px 5px;
            gap: 2px;
          }
          .vir-room-table-dense .vir-student-name {
            font-size: 9.4px;
            line-height: 1.12;
          }
          .vir-room-table-dense .vir-no-student {
            font-size: 8.8px;
          }
          .vir-no-student {
            font-size: 9.5px;
            line-height: 1.15;
            font-weight: 800;
            opacity: 0.78;
          }
          .student-packet-round-simple {
            display: grid;
            gap: 0;
            width: 100%;
            border: 1px solid #c3d2e1;
            border-radius: 10px;
            background: #ffffff;
            overflow: hidden;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .student-packet-round-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 7px 10px;
            background: linear-gradient(90deg, #113255 0%, #1d4872 100%);
            color: #ffffff;
          }
          .student-packet-round-header strong {
            font-size: 13px;
            line-height: 1.15;
            font-weight: 950;
          }
          .student-packet-round-header span {
            color: #dbe7f2;
            font-size: 10.5px;
            line-height: 1.2;
            font-weight: 850;
            text-align: right;
          }
          .student-packet-room-row {
            display: grid;
            grid-template-columns: repeat(var(--room-count), minmax(0, 1fr));
            width: 100%;
            background: #ffffff;
          }
          .student-packet-room-card {
            min-width: 0;
            min-height: 58px;
            display: grid;
            grid-template-rows: auto 1fr;
            border-right: 1px solid #d5e0e8;
            background: #f8fbff;
          }
          .student-packet-room-card:last-child {
            border-right: none;
          }
          .student-packet-room-name {
            min-height: 28px;
            display: grid;
            place-items: center;
            padding: 5px 5px;
            border-bottom: 1px solid #c3d2e1;
            background: #eaf2fa;
            color: #23435f;
            font-size: 9.8px;
            line-height: 1.1;
            font-weight: 950;
            text-align: center;
            overflow-wrap: anywhere;
          }
          .student-packet-room-learners {
            display: grid;
            align-content: center;
            gap: 2px;
            min-width: 0;
            padding: 7px 5px;
            color: #12324b;
            font-size: 10.3px;
            line-height: 1.14;
            font-weight: 950;
            text-align: center;
            overflow-wrap: anywhere;
          }
          .student-packet-room-card-empty {
            background: #fff8ed;
          }
          .student-packet-room-card-empty .student-packet-room-learners {
            color: #8a6741;
            font-size: 9px;
            font-weight: 850;
          }
          .student-packet-round-simple-dense .student-packet-room-card {
            min-height: 50px;
          }
          .student-packet-round-simple-dense .student-packet-room-name {
            min-height: 24px;
            padding: 4px;
            font-size: 8.6px;
          }
          .student-packet-round-simple-dense .student-packet-room-learners {
            padding: 5px 4px;
            font-size: 8.9px;
            line-height: 1.08;
          }
          .student-packet-round-simple-dense .student-packet-room-card-empty .student-packet-room-learners {
            font-size: 8px;
          }
          .student-schedule-empty {
            color: #60768b;
            font-size: 12.5px;
            font-weight: 700;
            line-height: 1.45;
          }
          .student-instructions-footer {
            color: #60768b;
            font-size: 10.5px;
            line-height: 1.4;
            border-top: 1px solid #d7e1ea;
            padding-top: 8px;
          }
          /* Modern packet visual refresh */
          .student-instructions-document {
            --si-bg: #f4f8fc;
            --si-card: #ffffff;
            --si-border: #d8e4ef;
            --si-ink: #0f2740;
            --si-muted: #4f6b84;
            --si-accent: #145b96;
            --si-accent-soft: #e9f2fb;
            gap: 12px !important;
            padding: 10px 26px 20px !important;
            background: radial-gradient(circle at top right, #eaf4ff 0%, #f8fbff 40%, #ffffff 85%) !important;
          }
          .student-instructions-header {
            border: 1px solid var(--si-border);
            border-radius: 14px;
            padding: 12px 14px !important;
            background: linear-gradient(135deg, #ffffff 0%, #f3f8fe 100%);
            box-shadow: 0 6px 18px rgba(15, 39, 64, 0.06);
            gap: 6px !important;
          }
          .student-instructions-header h1 {
            color: var(--si-ink) !important;
            font-size: 23px !important;
            letter-spacing: 0.01em;
          }
          .student-instructions-date {
            color: var(--si-muted) !important;
            font-size: 12px !important;
            font-weight: 800;
          }
          .student-instructions-date span:last-child {
            border-bottom: 1px solid #b7c9dc;
          }
          .student-instructions-subtitle {
            margin-top: 1px !important;
            color: var(--si-accent) !important;
            font-size: 16px !important;
            font-weight: 900 !important;
            padding-bottom: 0 !important;
          }
          .student-instructions-subtitle::after {
            height: 1px !important;
            margin-top: 6px !important;
            background: linear-gradient(90deg, var(--si-accent) 0%, rgba(20, 91, 150, 0.1) 100%) !important;
          }
          .instructions-section {
            border: 1px solid var(--si-border) !important;
            border-radius: 12px !important;
            padding: 11px 12px !important;
            background: var(--si-card) !important;
            box-shadow: 0 2px 10px rgba(15, 39, 64, 0.04);
            gap: 6px !important;
          }
          .instructions-section h3 {
            color: var(--si-accent) !important;
            font-size: 14px !important;
            letter-spacing: 0.01em;
          }
          .instructions-section p,
          .instructions-list {
            color: var(--si-ink) !important;
            font-size: 12px !important;
            line-height: 1.45 !important;
          }
          .student-ops-strip {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px;
          }
          .student-ops-item {
            border: 1px solid var(--si-border);
            border-radius: 10px;
            background: var(--si-accent-soft);
            padding: 7px 8px;
            min-height: 44px;
            display: grid;
            align-content: start;
            gap: 2px;
          }
          .student-ops-label {
            color: var(--si-muted);
            font-size: 9.5px;
            font-weight: 900;
            letter-spacing: 0.05em;
            text-transform: uppercase;
          }
          .student-ops-value {
            color: var(--si-ink);
            font-size: 11.5px;
            font-weight: 850;
            line-height: 1.2;
            overflow-wrap: anywhere;
          }
          .timing-grid {
            gap: 7px !important;
          }
          .timing-item {
            border: 1px solid var(--si-border) !important;
            border-radius: 10px !important;
            background: var(--si-accent-soft) !important;
            padding: 8px 9px !important;
            min-height: 48px !important;
          }
          .timing-label {
            color: var(--si-muted) !important;
            letter-spacing: 0.05em !important;
          }
          .timing-value {
            color: var(--si-ink) !important;
            font-size: 13px !important;
            margin-top: 4px !important;
          }
          .vir-schedule-block {
            border-radius: 10px !important;
            border-color: #c3d2e1 !important;
            box-shadow: 0 2px 8px rgba(15, 39, 64, 0.05);
          }
          .vir-encounter-title {
            background: linear-gradient(90deg, #113255 0%, #1d4872 100%) !important;
            padding: 7px 10px !important;
          }
          .vir-encounter-title span {
            font-size: 13px !important;
          }
          .vir-room-header {
            background: #eaf2fa !important;
            color: #23435f !important;
            font-size: 9.8px !important;
          }
          .vir-student-cell {
            background: #f8fbff !important;
            min-height: 50px !important;
          }
          .vir-student-name {
            font-size: 10.3px !important;
            color: #12324b !important;
          }
          .vir-room-table-dense .vir-room-header {
            font-size: 8.8px !important;
          }
          .vir-room-table-dense .vir-student-name {
            font-size: 9.1px !important;
          }
          .student-instructions-footer {
            border-top-color: var(--si-border) !important;
            color: var(--si-muted) !important;
            font-size: 10px !important;
          }
          a { color: #0f5f9f; text-decoration: none; overflow-wrap: anywhere; }
          @page { size: A4 portrait; margin: 0.35in; }
          @media print {
            html, body { background: #ffffff !important; }
            .student-ops-strip,
            .student-ops-item,
            .instructions-section,
            .timing-item,
            .student-packet-page-section,
            .student-packet-round-simple,
            .student-packet-room-card,
            .vir-schedule-block {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <main class="cfsp-schedule-export student-instructions-export">
          <article class="compact-print-shell student-instructions-document">
            <header class="student-instructions-header">
              <h1>${escapeHtml(programLabel)} Standardized Patient (SP) Simulation Cases</h1>
              <div class="student-instructions-date">
                <span>DATE:</span>
                <span>${dateLabel ? escapeHtml(dateLabel) : "&nbsp;"}</span>
              </div>
              <h2 class="student-instructions-subtitle">Student Instructions:</h2>
            </header>

            <section class="student-packet-page-section instructions-section">
              <div class="student-ops-strip">
                ${summaryStripItems
                  .map(
                    (item) => `
                      <div class="student-ops-item">
                        <div class="student-ops-label">${escapeHtml(item.label)}</div>
                        <div class="student-ops-value">${escapeHtml(item.value)}</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </section>

            <section class="student-packet-page-section instructions-section">
              <h3>Before Your Encounter</h3>
              <p>${escapeHtml(arrivalInstruction)}</p>
              ${supplementalJoinInstruction ? `<p>${escapeHtml(supplementalJoinInstruction)}</p>` : ""}
              ${accessRows.join("\n")}
              ${waitingRoomNote ? `<p>${escapeHtml(waitingRoomNote)}</p>` : ""}
              ${timeZoneNote ? `<p>${escapeHtml(timeZoneNote)}</p>` : ""}
            </section>

            <section class="student-packet-page-section instructions-section">
              <h3>Professional Video and Netiquette</h3>
              <ul class="instructions-list">
                ${netiquetteLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
              </ul>
            </section>

            <section class="student-packet-page-section instructions-section">
              <h3>Pre-Brief</h3>
              <ul class="instructions-list">
                ${prebriefLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
              </ul>
            </section>

            ${
              scenarioReminderLines.length
                ? `
                  <section class="student-packet-page-section instructions-section">
                    <h3>Scenario-Specific Reminders</h3>
                    <ul class="instructions-list">
                      ${scenarioReminderLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
                    </ul>
                  </section>
                `
                : ""
            }

            <section class="student-packet-page-section instructions-section">
              <h3>Session Timing</h3>
              <div class="timing-grid">
                ${
                  timingRows.length
                    ? timingRows
                        .map(
                          ([label, value]) => `
                            <div class="timing-item">
                              <div class="timing-label">${escapeHtml(label)}</div>
                              <div class="timing-value">${escapeHtml(value)}</div>
                            </div>
                          `
                        )
                        .join("")
                    : `
                      <div class="timing-item">
                        <div class="timing-label">Encounter Time:</div>
                        <div class="timing-value">&nbsp;</div>
                      </div>
                      <div class="timing-item">
                        <div class="timing-label">Feedback Time:</div>
                        <div class="timing-value">&nbsp;</div>
                      </div>
                    `
                }
              </div>
            </section>

            <section class="student-packet-page-section instructions-section announcement-flow-panel">
              <h3>Announcement Flow</h3>
              <div class="announcement-flow-grid">
                ${
                  studentPacketAnnouncementFlow.length
                    ? studentPacketAnnouncementFlow
                        .map(
                          (cue) => `
                            <div class="announcement-flow-item">
                              <div class="announcement-flow-offset">${escapeHtml(cue.timeLabel)}</div>
                              <div class="announcement-flow-text">${escapeHtml(cue.message)}</div>
                            </div>
                          `
                        )
                        .join("")
                    : `<div class="announcement-flow-item"><div class="announcement-flow-offset">Timing unavailable</div><div class="announcement-flow-text">Complete the schedule to calculate announcement cues.</div></div>`
                }
              </div>
            </section>

            ${
              simpleScheduleHtml
            }

            <footer class="student-instructions-footer">
              ${escapeHtml(footerNote)}
            </footer>
          </article>
        </main>
      </body>
    </html>
  `;
}

function formatEventDate(event: EventRow) {
  const dateSource = event.earliest_session_date || event.date_text;
  if (!dateSource) return "Date TBD";
  return formatHumanDate(dateSource, getImportedYearHint(event.notes)) || dateSource;
}

function formatStudentListRequestTime(value: unknown) {
  const parsed = parseClockTextToMinutes(asText(value));
  return parsed !== null ? formatTimeWithDayOffset(parsed) : asText(value);
}

function getAssignedNames(event: EventRow) {
  return normalizeLearnerNames(event.assigned_sp_names || []);
}

function getUniqueAssignedSpIndexPool(assignedSpNames: string[]) {
  const seen = new Set<string>();
  return assignedSpNames.reduce<number[]>((indexes, name, index) => {
    const key = normalizeDisplayText(name).toLowerCase();
    if (!key || seen.has(key)) return indexes;
    seen.add(key);
    indexes.push(index);
    return indexes;
  }, []);
}

function assignUniquePrimarySpIndexes(
  rounds: ScheduledRound[],
  assignedSpNames: string[],
  singleCaseMode = true
) {
  const uniqueSpIndexes = getUniqueAssignedSpIndexPool(assignedSpNames);
  return rounds.map((round) => {
    let activeRoomCursor = 0;
    return {
      ...round,
      roomSlots: round.roomSlots.map((slot) => {
        const isActiveRoom = isActiveScheduleSlot(slot, singleCaseMode);
        if (!isActiveRoom) return { ...slot, assignedSpIndex: undefined };
        const assignedSpIndex = uniqueSpIndexes[activeRoomCursor];
        activeRoomCursor += 1;
        return {
          ...slot,
          assignedSpIndex: typeof assignedSpIndex === "number" ? assignedSpIndex : undefined,
          assignedSpName: typeof assignedSpIndex === "number" ? normalizeDisplayText(assignedSpNames[assignedSpIndex]) : "",
        };
      }),
    };
  });
}

function applyScheduleDisplaySpFallback(
  rounds: ScheduledRound[],
  assignedSpNames: string[],
  singleCaseMode = true
) {
  const uniqueSpIndexes = getUniqueAssignedSpIndexPool(assignedSpNames);
  if (!uniqueSpIndexes.length) return rounds;

  return rounds.map((round) => {
    let activeRoomCursor = 0;
    return {
      ...round,
      roomSlots: round.roomSlots.map((slot) => {
        const isActiveRoom = isActiveScheduleSlot(slot, singleCaseMode);
        if (!isActiveRoom) return slot;
        const existingName = normalizeDisplayText(slot.assignedSpName);
        if (existingName) {
          activeRoomCursor += 1;
          return slot;
        }
        const explicitIndex = typeof slot.assignedSpIndex === "number" ? slot.assignedSpIndex : undefined;
        const fallbackIndex = typeof explicitIndex === "number" ? explicitIndex : uniqueSpIndexes[activeRoomCursor];
        activeRoomCursor += 1;
        const fallbackName = typeof fallbackIndex === "number" ? normalizeDisplayText(assignedSpNames[fallbackIndex]) : "";
        if (!fallbackName) return slot;
        return {
          ...slot,
          assignedSpIndex: typeof explicitIndex === "number" ? explicitIndex : fallbackIndex,
          assignedSpName: fallbackName,
        };
      }),
    };
  });
}

function getCaseLabelFromBuilderEvent(event: EventRow | null, caseName?: string | null) {
  const explicit = normalizeDisplayText(caseName);
  if (explicit) return explicit;

  const noteMatch = normalizeDisplayText(event?.notes).match(/(?:^|\n)(?:Case|Case Name|Station Case)\s*:\s*(.+?)(?:\n|$)/i);
  const noteValue = normalizeDisplayText(noteMatch?.[1]);
  if (noteValue) return noteValue;

  const parsedTraining = parseEventMetadata(event?.notes).training;
  const caseFileLabel =
    normalizeDisplayText(parsedTraining.case_name) ||
    normalizeDisplayText(parsedTraining.case_file_url).split("/").pop()?.replace(/\.[^.]+$/, "") ||
    "";
  return caseFileLabel;
}

function getScheduleNoteValue(notes: string | null | undefined, labels: string[]) {
  const text = asText(notes);
  if (!text) return "";
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*([^\\n]+)`, "i"));
    if (match?.[1]) return normalizeDisplayText(match[1]);
  }
  return "";
}

function getStudentInstructionsZoomLinkFromBuilderEvent(event: EventRow | null) {
  const notes = asText(event?.notes);
  const explicitStudentFacingLink = getScheduleNoteValue(notes, [
    "Student Zoom Link",
    "Student Access Link",
    "Student Virtual Access",
    "Student Encounter Zoom",
    "Encounter Zoom Link",
    "Encounter Access Link",
    "Learner Zoom Link",
    "Learner Access Link",
    "Student Virtual Link",
    "Virtual Access (Students)",
  ]);
  if (isLikelyVirtualAccessUrl(explicitStudentFacingLink)) return explicitStudentFacingLink;

  const eventLocation = asText(event?.location);
  return isLikelyVirtualAccessUrl(eventLocation) ? eventLocation : "";
}

function getLocationAccessFromBuilderEvent(event: EventRow | null) {
  const metadata = parseEventMetadata(event?.notes).training;
  const sourceText = [event?.name, event?.location, event?.status, event?.notes]
    .map((value) => asText(value))
    .join(" ")
    .toLowerCase();
  const isVirtual =
    asText(metadata.modality).toLowerCase() === "virtual" ||
    /\b(virtual|vir|telehealth|breakout|online|remote|zoom|simiq)\b/.test(sourceText);
  const link =
    asText(metadata.zoom_url) ||
    asText(metadata.training_zoom_link) ||
    getScheduleNoteValue(event?.notes, ["Virtual Access", "Virtual Access / Zoom", "Zoom", "Zoom Link", "SimIQ", "Virtual Link"]);
  const physicalLocation = asText(event?.location);

  return {
    isVirtual,
    modeLabel: isVirtual ? "Virtual Access" : "In-person Location",
    label: isVirtual ? link || "Zoom link pending" : physicalLocation || "Location pending",
  };
}

function normalizeScheduleCaseDefinitions(raw: unknown, fallbackCaseName = "") {
  const cases: ScheduleCaseDefinition[] = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry, index) => {
      const record = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const name = asText(record.name) || asText(record.title) || `Case ${index + 1}`;
      const documentName = asText(record.documentName || record.fileName || record.file_name || record.name);
      cases.push({
        id: asText(record.id) || `${name}-${index}`,
        name,
        documentName,
        hasDocument: Boolean(
          parseBooleanFlag(record.hasDocument, false) ||
            asText(record.url) ||
            asText(record.storagePath || record.storage_path)
        ),
        encounterMinutes: parseNumber(asText(record.encounterMinutes || record.encounter_minutes), 0) || undefined,
        checklistMinutes: parseNumber(asText(record.checklistMinutes || record.checklist_minutes), 0) || undefined,
        feedbackMinutes: parseNumber(asText(record.feedbackMinutes || record.feedback_minutes), 0) || undefined,
        roomAssignment: asText(record.roomAssignment || record.room_assignment),
        notes: asText(record.notes),
        active: asText(record.status).toLowerCase() !== "inactive" && record.active !== false,
      });
    });
  }

  if (!cases.length && asText(fallbackCaseName)) {
    cases.push({
      id: "legacy-case",
      name: asText(fallbackCaseName),
      active: true,
    });
  }

  return cases;
}

function parseScheduleCaseDefinitions(raw: string | null | undefined, fallbackCaseName = "") {
  const text = asText(raw);
  if (!text) return normalizeScheduleCaseDefinitions([], fallbackCaseName);

  try {
    const parsed = JSON.parse(text);
    return normalizeScheduleCaseDefinitions(parsed, fallbackCaseName);
  } catch {
    // Ignore malformed case metadata and fall back to the legacy single case label.
    return normalizeScheduleCaseDefinitions([], fallbackCaseName);
  }
}

function serializeScheduleCaseDefinitions(cases: ScheduleCaseDefinition[]) {
  return JSON.stringify(
    cases.map((caseDef, index) => ({
      id: caseDef.id || `case-${index + 1}`,
      name: caseDef.name || `Case ${index + 1}`,
      documentName: caseDef.documentName || "",
      hasDocument: Boolean(caseDef.hasDocument),
      encounterMinutes: caseDef.encounterMinutes ? String(caseDef.encounterMinutes) : "",
      checklistMinutes: caseDef.checklistMinutes ? String(caseDef.checklistMinutes) : "",
      feedbackMinutes: caseDef.feedbackMinutes ? String(caseDef.feedbackMinutes) : "",
      roomAssignment: caseDef.roomAssignment || "",
      notes: caseDef.notes || "",
      status: caseDef.active ? "active" : "inactive",
    }))
  );
}

function getToneStyles(tone: TimelineBlock["tone"]) {
  if (tone === "setup") return { background: "#edf5fb", border: "#c7dcee", color: "#165a96" };
  if (tone === "prebrief") return { background: "#eefbf6", border: "#bfe4d6", color: "#196b57" };
  if (tone === "wrap") return { background: "#fff6e8", border: "#f1d1a7", color: "#a86411" };
  return { background: "#f4f7fb", border: "#d6e0e8", color: "#4f677d" };
}

function formatOperationalList(items: string[]) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function getBlockDurationMinutes(start: number, end: number) {
  return Math.max(end - start, 0);
}

function formatDurationCompact(minutes: number) {
  return `${minutes}m`;
}

function isFillerTimingLabel(label: string) {
  return /\b(open buffer|remaining scheduled time|remaining time|unused time|filler)\b/i.test(asText(label));
}

function getFlowRhythmSegmentStyles(label: string) {
  const normalized = asText(label).toLowerCase();

  if (normalized.includes("encounter")) {
    return {
      background: "linear-gradient(135deg, rgba(31, 116, 255, 0.14) 0%, rgba(125, 211, 252, 0.2) 100%)",
      borderColor: "rgba(59, 130, 246, 0.26)",
      color: "#0f4c81",
    };
  }
  if (normalized.includes("checklist") || normalized.includes("soap")) {
    return {
      background: "linear-gradient(135deg, rgba(20, 184, 166, 0.14) 0%, rgba(153, 246, 228, 0.2) 100%)",
      borderColor: "rgba(20, 184, 166, 0.24)",
      color: "#0f766e",
    };
  }
  if (normalized.includes("feedback")) {
    return {
      background: "linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(221, 214, 254, 0.22) 100%)",
      borderColor: "rgba(168, 85, 247, 0.24)",
      color: "#6d28d9",
    };
  }
  if (normalized.includes("break") || normalized.includes("lunch")) {
    return {
      background: "linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(254, 240, 138, 0.22) 100%)",
      borderColor: "rgba(245, 158, 11, 0.24)",
      color: "#b45309",
    };
  }
  if (normalized.includes("transition")) {
    return {
      background: "linear-gradient(135deg, rgba(148, 163, 184, 0.12) 0%, rgba(226, 232, 240, 0.24) 100%)",
      borderColor: "rgba(100, 116, 139, 0.22)",
      color: "#475569",
    };
  }

  return {
    background: "linear-gradient(135deg, rgba(226, 232, 240, 0.35) 0%, rgba(248, 250, 252, 0.9) 100%)",
    borderColor: "rgba(148, 163, 184, 0.22)",
    color: "#4f677d",
  };
}

function getFlowRhythmSummary(round: ScheduledRound) {
  return formatRoundRhythmBreakdown({
    subBlocks: round.subBlocks.filter((subBlock) => !isMajorScheduleDividerBlock(subBlock) && !isFillerTimingLabel(subBlock.label)),
  });
}

function isRoundTimelineLabel(label: string) {
  return /^rotation round \d+$/i.test(asText(label));
}

function isRoundSpecificTimelineBlock(block: TimelineBlock) {
  return isRoundTimelineLabel(block.label) || /^round \d+$/i.test(asText(block.detail));
}

function isMajorScheduleDividerLabel(label: string) {
  const normalized = asText(label).toLowerCase();
  return /prebrief|debrief|lunch/.test(normalized);
}

function isMajorScheduleDividerBlock(block: { label: string; start: number; end: number }) {
  if (isMajorScheduleDividerLabel(block.label)) return true;
  const normalized = asText(block.label).toLowerCase();
  const durationMinutes = getBlockDurationMinutes(block.start, block.end);
  if (/\bbreak\b/.test(normalized) && durationMinutes >= 15) return true;
  return false;
}

function isPrimaryScheduleWideTimelineBlock(block: TimelineBlock) {
  if (isMajorScheduleDividerBlock(block)) return true;
  if (isRoundSpecificTimelineBlock(block)) return false;
  return false;
}

function buildStudentFacingRoomSlotIndexes(rounds: ScheduledRound[]) {
  const occupiedSlotIndexes = new Set<number>();
  const caseStationSlotCounts = new Map<number, number>();

  rounds.forEach((round) => {
    round.roomSlots.forEach((slot, slotIndex) => {
      if (hasStudentFacingCaseStationIdentity(slot)) {
        caseStationSlotCounts.set(slotIndex, (caseStationSlotCounts.get(slotIndex) || 0) + 1);
      }
      if (shouldIncludeStudentFacingScheduleSlot(slot)) {
        occupiedSlotIndexes.add(slotIndex);
      }
    });
  });

  // IMPORTANT REGRESSION GUARD:
  // When a schedule is marked complete, never rebuild student/admin/live schedule structure from room count,
  // learner count, or capacity fallback. The user's completed schedule snapshot is authoritative. Multi-case
  // rotations must preserve all active case stations, including empty stations, because empty stations can be
  // intentional in a rotation with fewer learner groups than cases.
  const stableCaseStationSlotIndexes = new Set<number>();
  const minimumStationRounds = rounds.length > 1 ? 2 : 1;
  caseStationSlotCounts.forEach((count, slotIndex) => {
    if (count >= minimumStationRounds || occupiedSlotIndexes.has(slotIndex)) {
      stableCaseStationSlotIndexes.add(slotIndex);
    }
  });

  const slotIndexes = stableCaseStationSlotIndexes.size > 1 ? stableCaseStationSlotIndexes : occupiedSlotIndexes;
  return Array.from(slotIndexes).sort((a, b) => a - b);
}

function buildStudentFacingScheduledRounds(rounds: ScheduledRound[], roomSlotIndexes: number[]) {
  const slotTemplates = new Map<number, ScheduledRoomSlot>();
  roomSlotIndexes.forEach((slotIndex) => {
    const template =
      rounds
        .map((round) => round.roomSlots[slotIndex])
        .find((slot): slot is ScheduledRoomSlot => Boolean(slot) && hasStudentFacingCaseStationIdentity(slot)) ||
      rounds
        .map((round) => round.roomSlots[slotIndex])
        .find((slot): slot is ScheduledRoomSlot => Boolean(slot) && shouldIncludeStudentFacingScheduleSlot(slot)) ||
      rounds
        .map((round) => round.roomSlots[slotIndex])
        .find((slot): slot is ScheduledRoomSlot => Boolean(slot));
    if (template) slotTemplates.set(slotIndex, template);
  });

  return rounds.map((round) => ({
    ...round,
    roomSlots: roomSlotIndexes
      .map((slotIndex) => {
        const currentSlot = round.roomSlots[slotIndex];
        if (currentSlot && !isExcludedFromStudentFacingSchedule(currentSlot)) {
          return currentSlot;
        }
        const templateSlot = slotTemplates.get(slotIndex);
        if (!templateSlot) return null;
        return {
          ...templateSlot,
          learnerLabels: [],
          learnerIndexes: [],
          assignedSpIndex: undefined,
          assignedSpName: "",
          backupSpName: "",
          roleId: "",
          roleLabel: "",
          notes: "",
          stationStatus: hasExplicitStudentFacingRoomStatus(templateSlot) ? "active" : templateSlot.stationStatus,
          isBackupStation: false,
        };
      })
      .filter((slot): slot is ScheduledRoomSlot => Boolean(slot)),
    subBlocks: round.subBlocks.filter((block) =>
      isDayBlockVisibleToView(block.visibleTo || "both", "student") && !isFillerTimingLabel(block.label)
    ),
  }));
}

function filterRoundsForView(
  rounds: ScheduledRound[],
  viewMode: ScheduleBuilderViewMode,
  options?: { studentRoomSlotIndexes?: number[] }
) {
  if (viewMode === "student") {
    const studentRoomSlotIndexes = options?.studentRoomSlotIndexes || [];
    return buildStudentFacingScheduledRounds(rounds, studentRoomSlotIndexes);
  }

  return rounds.map((round) => ({
    ...round,
    roomSlots: round.roomSlots,
    subBlocks: round.subBlocks.filter((block) =>
      isDayBlockVisibleToView(block.visibleTo || "both", viewMode) && !isFillerTimingLabel(block.label)
    ),
  }));
}

function alignStudentRoundTimingWithAuthoritativeRounds(
  studentRounds: ScheduledRound[],
  authoritativeRounds: ScheduledRound[]
) {
  const authoritativeByRound = new Map(authoritativeRounds.map((round) => [round.round, round]));
  let foundMismatch = false;
  const alignedRounds = studentRounds.map((round) => {
    const authoritativeRound = authoritativeByRound.get(round.round);
    if (!authoritativeRound) return round;
    if (round.start === authoritativeRound.start && round.end === authoritativeRound.end) return round;
    foundMismatch = true;
    return {
      ...round,
      start: authoritativeRound.start,
      end: authoritativeRound.end,
    };
  });

  if (foundMismatch && process.env.NODE_ENV !== "production") {
    console.warn("[schedule-builder] Student/Admin round timing diverged; using authoritative Admin timing.");
  }

  return alignedRounds;
}

function alignStudentRoundsToAuthoritativeGridRows(
  studentRounds: ScheduledRound[],
  authoritativeRows: ScheduleGridPreviewRow[]
) {
  const authoritativeRoundRowByNumber = new Map<number, Extract<ScheduleGridPreviewRow, { kind: "round" }>>();
  authoritativeRows.forEach((row) => {
    if (row.kind === "round") authoritativeRoundRowByNumber.set(row.round.round, row);
  });

  return studentRounds.map((round) => {
    const authoritativeRow = authoritativeRoundRowByNumber.get(round.round);
    if (!authoritativeRow) return round;
    return {
      ...round,
      start: authoritativeRow.round.start,
      end: authoritativeRow.round.end,
    };
  });
}

function filterTimelineForView(timeline: TimelineBlock[], viewMode: ScheduleBuilderViewMode) {
  return timeline.filter((block) => isDayBlockVisibleToView(block.visibleTo || "both", viewMode) && !isFillerTimingLabel(block.label));
}

function buildScheduleGridPreviewRows(rounds: ScheduledRound[], timeline: TimelineBlock[]): ScheduleGridPreviewRow[] {
  const roundRows: ScheduleGridPreviewRow[] = rounds.map((round) => ({
    key: `round-row-${round.round}`,
    kind: "round",
    start: round.start,
    end: round.end,
    round,
  }));
  const wideRows: ScheduleGridPreviewRow[] = timeline
    .filter((block) => isPrimaryScheduleWideTimelineBlock(block))
    .map((block) => ({
      key: `wide-row-${block.label}-${block.start}-${block.end}`,
      kind: "wide",
      start: block.start,
      end: block.end,
      block,
    }));

  return [...wideRows, ...roundRows].sort((a, b) => a.start - b.start || a.end - b.end);
}

function isStudentFacingWidePrebriefBlock(block: TimelineBlock) {
  if (block.tone !== "prebrief") return false;
  if (block.prebriefType) {
    return block.prebriefType === "faculty";
  }

  const label = asText(block.label).toLowerCase();
  return label.includes("faculty prebrief");
}

function getScheduleWidePrebriefLabel(block: TimelineBlock) {
  if (block.prebriefType) {
    return `${block.prebriefType === "faculty" ? "Faculty" : block.prebriefType === "sp" ? "SP" : "Student"} Prebrief`;
  }
  return "Pre-brief";
}

type StudentScheduleTimingConfig = {
  prebriefMinutes: number;
  encounterMinutes: number;
  feedbackMinutes: number;
  cadenceMinutes: number;
};

type StudentScheduleTiming = StudentScheduleTimingConfig & {
  prebriefStart: number;
  encounterStart: number;
  feedbackStart: number;
};

function normalizeStudentScheduleMinutes(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function normalizeStudentScheduleTimingConfig(config?: Partial<StudentScheduleTimingConfig>): StudentScheduleTimingConfig {
  const encounterMinutes = normalizeStudentScheduleMinutes(config?.encounterMinutes, 20);
  const feedbackMinutes = normalizeStudentScheduleMinutes(config?.feedbackMinutes, 5);
  return {
    prebriefMinutes: normalizeStudentScheduleMinutes(config?.prebriefMinutes, 0),
    encounterMinutes,
    feedbackMinutes,
    cadenceMinutes: normalizeStudentScheduleMinutes(config?.cadenceMinutes, encounterMinutes + 10 + feedbackMinutes + 5),
  };
}

function buildStudentScheduleTiming(
  authoritativeStart: number,
  config?: Partial<StudentScheduleTimingConfig>
): StudentScheduleTiming {
  const normalizedConfig = normalizeStudentScheduleTimingConfig(config);
  return {
    ...normalizedConfig,
    prebriefStart: authoritativeStart - normalizedConfig.prebriefMinutes,
    encounterStart: authoritativeStart,
    feedbackStart: authoritativeStart + normalizedConfig.encounterMinutes,
  };
}

function formatStudentScheduleMinuteLabel(minutes: number) {
  const rounded = Math.max(Math.floor(minutes), 0);
  return `${rounded} min`;
}

function formatStudentScheduleTimingLines(timing: StudentScheduleTiming) {
  const lines: string[] = [];
  if (timing.prebriefMinutes > 0) {
    lines.push(`Pre-brief: ${toDisplayTime(timing.prebriefStart)}`);
  }
  lines.push(
    `Encounter: ${toDisplayTime(timing.encounterStart)} · ${formatStudentScheduleMinuteLabel(timing.encounterMinutes)}`,
    `Feedback: ${toDisplayTime(timing.feedbackStart)} · ${formatStudentScheduleMinuteLabel(timing.feedbackMinutes)}`,
  );
  return lines;
}

function formatStudentScheduleEncounterLine(timing: StudentScheduleTiming) {
  return `Encounter: ${toDisplayTime(timing.encounterStart)} · ${formatStudentScheduleMinuteLabel(timing.encounterMinutes)}`;
}

function formatStudentScheduleTimingSummary(timing: StudentScheduleTiming) {
  return formatStudentScheduleTimingLines(timing).join("; ");
}

function advanceStudentScheduleStartThroughWideRows(
  candidateStart: number,
  wideRows: Array<Extract<ScheduleGridPreviewRow, { kind: "wide" }>>
) {
  let nextStart = candidateStart;
  let adjusted = true;
  while (adjusted) {
    adjusted = false;
    for (const row of wideRows) {
      if (row.start <= nextStart && row.end > nextStart) {
        nextStart = row.end;
        adjusted = true;
      }
    }
  }
  return nextStart;
}

function buildStudentAuthoritativeRoundStartMap(
  authoritativeRows: ScheduleGridPreviewRow[],
  cadenceMinutes: number
) {
  const roundRows = authoritativeRows
    .filter((row): row is Extract<ScheduleGridPreviewRow, { kind: "round" }> => row.kind === "round")
    .sort((a, b) => a.round.round - b.round.round);
  const wideRows = authoritativeRows
    .filter((row): row is Extract<ScheduleGridPreviewRow, { kind: "wide" }> => row.kind === "wide")
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const startByRound = new Map<number, number>();
  const normalizedCadence = normalizeStudentScheduleMinutes(cadenceMinutes, 40);
  let previousStart: number | null = null;

  roundRows.forEach((row) => {
    const rawStart = row.round.start;
    if (previousStart === null) {
      startByRound.set(row.round.round, rawStart);
      previousStart = rawStart;
      return;
    }

    const fallbackStart = advanceStudentScheduleStartThroughWideRows(previousStart + normalizedCadence, wideRows);
    const rawGap = rawStart - previousStart;
    const resolvedStart = Number.isFinite(rawStart) && rawGap >= normalizedCadence ? rawStart : fallbackStart;
    startByRound.set(row.round.round, resolvedStart);
    previousStart = resolvedStart;
  });

  return startByRound;
}

function formatStudentPrebriefStart(block: TimelineBlock) {
  const durationMinutes = Math.max(getBlockDurationMinutes(block.start, block.end), 1);
  return `Pre-brief: ${toDisplayTime(block.start)} · ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"}`;
}

function buildStudentScheduleGridRowsFromAuthoritativeRows(
  authoritativeRows: ScheduleGridPreviewRow[],
  studentRounds: ScheduledRound[]
): ScheduleGridPreviewRow[] {
  const studentRoundByNumber = new Map(studentRounds.map((round) => [round.round, round]));
  let foundMismatch = false;
  const rows = authoritativeRows.flatMap((row): ScheduleGridPreviewRow[] => {
    if (row.kind !== "round") return isStudentFacingWidePrebriefBlock(row.block) ? [row] : [];
    const studentRound = studentRoundByNumber.get(row.round.round) || row.round;
    const alignedRound =
      studentRound.start === row.round.start && studentRound.end === row.round.end
        ? studentRound
        : {
            ...studentRound,
            start: row.round.start,
            end: row.round.end,
          };

    if (studentRound.start !== row.round.start || studentRound.end !== row.round.end) {
      foundMismatch = true;
    }

    return [{
      ...row,
      start: row.start,
      end: row.end,
      round: alignedRound,
    }];
  });

  if (foundMismatch && process.env.NODE_ENV !== "production") {
    console.warn("[schedule-builder] Student/Admin grid timing diverged; using authoritative Admin timing.");
  }

  return rows;
}

function formatRoomName(
  roomName: string,
  roomType: "exam" | "flex",
  roomNumber: number,
  roomContext: Parameters<typeof getRoomDisplayLabel>[2]
) {
  const resolvedHint = roomType === "exam" ? "exam" : "flex";
  return getRoomDisplayLabel(roomName, roomNumber, roomContext, resolvedHint);
}

function buildPreviewRoomColumns(
  rounds: ScheduledRound[],
  roomContext: Parameters<typeof getRoomDisplayLabel>[2],
  roomSlotIndexes?: number[]
): PreviewRoomColumn[] {
  const resolvedSlotIndexes =
    roomSlotIndexes && roomSlotIndexes.length
      ? roomSlotIndexes
      : (rounds[0]?.roomSlots || []).map((_, slotIndex) => slotIndex);

  return resolvedSlotIndexes
    .map((slotIndex) => {
      const slot = rounds
        .map((round) => round.roomSlots[slotIndex])
        .find((candidate): candidate is ScheduledRoomSlot => Boolean(candidate));
      if (!slot) return null;
      return {
        slotIndex,
        roomName: slot.roomName,
        displayRoomName: getRoomDisplayLabel(
          slot.roomName,
          slotIndex + 1,
          roomContext,
          slot.roomType === "exam" ? "exam" : "flex"
        ),
        roomType: slot.roomType,
        capacityLabel: slot.capacityLabel,
      };
    })
    .filter((column): column is PreviewRoomColumn => Boolean(column));
}

type ScheduleTimingVisibility = "all" | DayBlockVisibility;

function shouldTimingBlockApply(block: DayBlockConfig, visibility: ScheduleTimingVisibility) {
  if (visibility === "all") return true;
  if (visibility === "student") return block.visibleTo === "student" || block.visibleTo === "both";
  return block.visibleTo === "operations" || block.visibleTo === "both";
}

function calculateRoundTimingsWithBlocks(args: {
  startMinutes: number;
  rounds: number;
  sessionLengthMinutes: number;
  examRoomCount: number;
  roomNames?: string[];
  examRoomCapacity: number;
  flexRoomCount: number;
  maxPairsPerFlexRoom: number;
  cases?: ScheduleCaseDefinition[];
  encounterMinutes: number;
  checklistMinutes?: number;
  checklistPlacement?: ChecklistPlacement;
  feedbackMinutes?: number;
  transitionMinutes?: number;
  facultyPrebriefMinutes?: string | number;
  dayBlocks: DayBlockConfig[];
  timingVisibility?: ScheduleTimingVisibility;
  referenceEndMinutes?: number | null;
  roundTargetMinutes?: number;
}) {
  const checklistMinutes = Math.max(0, Math.floor(args.checklistMinutes || 0));
  const checklistPlacement = normalizeChecklistPlacement(args.checklistPlacement);
  const feedbackMinutes = Math.max(0, Math.floor(args.feedbackMinutes || 0));
  const transitionMinutes = Math.max(0, Math.floor(args.transitionMinutes || 0));
  const recurringBlocks = args.dayBlocks.filter((block) => {
    const duration = sanitizeRecurringBlockMinutes(block.durationMinutes);
    if ((checklistMinutes > 0 || feedbackMinutes > 0 || transitionMinutes > 0) && block.placement === "after_each_rotation") {
      if (checklistMinutes > 0 && block.type === "checklist") return false;
      if ((feedbackMinutes > 0 || transitionMinutes > 0) && (block.type === "feedback" || block.type === "transition")) return false;
    }
    return (
      duration > 0 &&
      (block.placement === "after_each_rotation" || block.placement === "after_every_x_rotations") &&
      shouldTimingBlockApply(block, args.timingVisibility || "all")
    );
  });
  const configuredLengthValues: number[] = [];

  const rounds: GeneratedRound[] = [];
  let roundStart = args.startMinutes;
  const validation: RoundGenerationValidation = {
    generated: false,
    expectedRounds: Math.max(args.rounds, 0),
    generatedRounds: 0,
    generatedMinutes: 0,
    computedEndMinutes: 0,
    stoppedByWindow: false,
    stoppedByRoundLimit: false,
    invalid: false,
    reason: "",
    lastRoundEnd: args.startMinutes,
  };

  for (let roundIndex = 0; roundIndex < validation.expectedRounds; roundIndex += 1) {
    const roundNumber = roundIndex + 1;
    const subBlocks: RoundSubBlock[] = [];
    let current = roundStart;
    const pushChecklistBlock = () => {
      if (checklistMinutes <= 0) return;
      subBlocks.push({
        label: "Checklist",
        start: current,
        end: current + checklistMinutes,
        visibleTo: "both",
      });
      current += checklistMinutes;
    };

    if (checklistPlacement === "before_encounter") {
      pushChecklistBlock();
    }

    const encounterEnd = current + sanitizeEncounterMinutes(args.encounterMinutes);
    subBlocks.push({
      label: "Encounter",
      start: current,
      end: encounterEnd,
      visibleTo: "both",
    });
    current = encounterEnd;

    if (checklistPlacement === "before_feedback") {
      pushChecklistBlock();
    }

    if (feedbackMinutes > 0) {
      subBlocks.push({
        label: "Feedback",
        start: current,
        end: current + feedbackMinutes,
        visibleTo: "both",
      });
      current += feedbackMinutes;
    }

    if (checklistPlacement === "after_feedback") {
      pushChecklistBlock();
    }

    if (transitionMinutes > 0) {
      subBlocks.push({
        label: "Transition",
        start: current,
        end: current + transitionMinutes,
        visibleTo: "both",
      });
      current += transitionMinutes;
    }

    recurringBlocks.forEach((block) => {
      const minutes = sanitizeRecurringBlockMinutes(block.durationMinutes);
      if (!minutes) return;
      if (block.placement === "after_every_x_rotations") {
        const interval = Math.max(1, parseNumber(block.placementInterval, 2));
        if (roundNumber % interval !== 0) return;
      }
      const label = asText(block.label) || getDefaultDayBlockLabel(block.type);
      subBlocks.push({
        label,
        start: current,
        end: current + minutes,
        visibleTo: block.visibleTo,
      });
      current += minutes;
    });

    const configuredRoundLength = current - roundStart;
    configuredLengthValues.push(configuredRoundLength);
    const manualRoundTarget =
      args.roundTargetMinutes && args.roundTargetMinutes <= MAX_IMPORTED_ROUND_TARGET_MINUTES
        ? args.roundTargetMinutes
        : 0;
    const roundTargetLength = Math.max(configuredRoundLength, manualRoundTarget, 1);
    const candidateRoundEnd = roundStart + roundTargetLength;
    if (args.referenceEndMinutes !== null && args.referenceEndMinutes !== undefined && candidateRoundEnd > args.referenceEndMinutes) {
      validation.stoppedByWindow = true;
      validation.reason = `Cannot fit round ${roundNumber} inside event end window (${formatTimeWithDayOffset(candidateRoundEnd)} > ${formatTimeWithDayOffset(args.referenceEndMinutes)}).`;
    }

    const activeCases = (args.cases || []).filter((caseDef) => caseDef.active);
    const examSlots: GeneratedRoomSlot[] = Array.from({ length: args.examRoomCount }, (_, index) => {
      const caseIndex = activeCases.length ? (index + roundIndex) % activeCases.length : -1;
      const caseDef = caseIndex >= 0 ? activeCases[caseIndex] : null;
      const roomName = normalizeDisplayText(args.roomNames?.[index]) || normalizeDisplayText(caseDef?.roomAssignment) || `Exam ${index + 1}`;
      return {
        roomName,
        roomType: "exam",
        capacity: args.examRoomCapacity,
        capacityLabel: `${args.examRoomCapacity} learner${args.examRoomCapacity === 1 ? "" : "s"}`,
        caseLabel: caseDef?.name,
        caseIndex: caseDef ? caseIndex : undefined,
      };
    });

    const flexSlots: GeneratedRoomSlot[] = Array.from({ length: args.flexRoomCount }, (_, index) => ({
      roomName: `Flex ${index + 1}`,
      roomType: "flex",
      capacity: args.maxPairsPerFlexRoom,
      capacityLabel: `Up to ${args.maxPairsPerFlexRoom} learners`,
    }));

    rounds.push({
      round: roundNumber,
      start: roundStart,
      end: candidateRoundEnd,
      roomSlots: [...examSlots, ...flexSlots],
      subBlocks,
    });

    roundStart = candidateRoundEnd;
    validation.generatedRounds += 1;
  }

  if (validation.generatedRounds < validation.expectedRounds && validation.expectedRounds > 0 && !validation.invalid) {
    validation.stoppedByRoundLimit = true;
    validation.invalid = true;
    validation.reason = "Schedule round generation reached configured round limit with an incomplete pass.";
  }

  if (validation.generatedRounds === validation.expectedRounds) {
    validation.stoppedByRoundLimit = false;
  }

  const configuredLength = configuredLengthValues.length ? Math.max(...configuredLengthValues, 0) : 0;
  const manualRoundTarget =
    args.roundTargetMinutes && args.roundTargetMinutes <= MAX_IMPORTED_ROUND_TARGET_MINUTES
      ? args.roundTargetMinutes
      : 0;
  const roundLength = Math.max(configuredLength, manualRoundTarget, 1);
  validation.generated = true;
  validation.generatedMinutes = rounds.reduce((total, round) => total + Math.max(0, getBlockDurationMinutes(round.start, round.end)), 0);
  validation.computedEndMinutes = rounds.length ? rounds[rounds.length - 1].end : args.startMinutes;
  validation.lastRoundEnd = validation.computedEndMinutes;

  if (typeof window !== "undefined") {
    if (validation.invalid) {
      window.console.warn("Schedule generation validation failed", {
        expectedRounds: validation.expectedRounds,
        generatedRounds: validation.generatedRounds,
        generatedMinutes: validation.generatedMinutes,
        computedEndMinutes: validation.computedEndMinutes,
        stoppedByWindow: validation.stoppedByWindow,
        stoppedByRoundLimit: validation.stoppedByRoundLimit,
        reason: validation.reason,
      });
    }
  }

  const overrunMinutes =
    args.roundTargetMinutes && args.roundTargetMinutes <= MAX_IMPORTED_ROUND_TARGET_MINUTES
      ? Math.max(configuredLength - args.roundTargetMinutes, 0)
      : 0;

  return { rounds, roundLength, configuredLength, overrunMinutes, validation };
}

function getTimingDayBlocksByVisibility(
  dayBlocks: DayBlockConfig[],
  timingVisibility: ScheduleTimingVisibility
) {
  return {
    beforeRotationDayBlocks: dayBlocks.filter(
      (block) =>
        parseNumber(block.durationMinutes, 0) > 0 &&
        block.placement === "before_rotations" &&
        shouldTimingBlockApply(block, timingVisibility)
    ),
    afterRotationDayBlocks: dayBlocks.filter(
      (block) =>
        parseNumber(block.durationMinutes, 0) > 0 &&
        block.placement === "after_rotations" &&
        shouldTimingBlockApply(block, timingVisibility)
    ),
    specificTimeDayBlocks: dayBlocks.filter(
      (block) =>
        parseNumber(block.durationMinutes, 0) > 0 &&
        block.placement === "specific_time" &&
        shouldTimingBlockApply(block, timingVisibility) &&
        toMinutes(block.specificTime) !== null
    ),
  };
}

function buildScheduleTimeline(args: {
  parsedStartMinutes: number;
  rounds: GeneratedRound[];
  parsedRoomSetup: number;
  parsedStaffArrival: number | null;
  parsedSpArrival: number | null;
  parsedFacultyArrival: number | null;
  parsedStudentPrebrief: number;
  parsedSpPrebrief: number;
  parsedFacultyPrebrief: number;
  beforeRotationDayBlocks: DayBlockConfig[];
  afterRotationDayBlocks: DayBlockConfig[];
  specificTimeDayBlocks: DayBlockConfig[];
  referenceEndMinutes?: number | null;
}) {
  const timeline: TimelineBlock[] = [];
  const rotationStart = args.parsedStartMinutes;
  const rotationEnd = args.rounds.length ? args.rounds[args.rounds.length - 1].end : rotationStart;
  const normalizedScheduleEndReference = args.referenceEndMinutes ?? rotationEnd;
  const normalizeTimelineClock = (minutes: number | null) =>
    normalizeClockMinutesForSchedule(minutes, rotationStart, normalizedScheduleEndReference);
  const staffArrivalMinutes = normalizeTimelineClock(args.parsedStaffArrival);
  const spArrivalMinutes = normalizeTimelineClock(args.parsedSpArrival);
  const facultyArrivalMinutes = normalizeTimelineClock(args.parsedFacultyArrival);
  const staffArrivalBeforeRotation =
    staffArrivalMinutes !== null && staffArrivalMinutes < rotationStart ? staffArrivalMinutes : null;

  if (args.parsedRoomSetup > 0) {
    timeline.push({
      label: "Room Setup",
      start: Math.max(staffArrivalBeforeRotation ?? rotationStart - args.parsedRoomSetup, rotationStart - args.parsedRoomSetup),
      end: rotationStart,
      detail: `${args.parsedRoomSetup} minutes`,
      tone: "setup",
    });
  }

  if (staffArrivalMinutes !== null && staffArrivalMinutes < rotationStart) {
    timeline.push({
      label: "Staff Arrival",
      start: staffArrivalMinutes,
      end: rotationStart,
      detail: "Staff on site before session start",
      tone: "setup",
    });
  }

  if (spArrivalMinutes !== null && spArrivalMinutes < rotationStart) {
    timeline.push({
      label: "SP Arrival",
      start: spArrivalMinutes,
      end: rotationStart,
      detail: "SP check-in window",
      tone: "setup",
    });
  }

  if (facultyArrivalMinutes !== null && facultyArrivalMinutes < rotationStart) {
    timeline.push({
      label: "Faculty Arrival",
      start: facultyArrivalMinutes,
      end: rotationStart,
      detail: "Faculty prep window",
      tone: "setup",
    });
  }

  if (args.parsedSpPrebrief > 0) {
    timeline.push({
      label: "SP Prebrief",
      start: rotationStart - args.parsedSpPrebrief,
      end: rotationStart,
      detail: `${args.parsedSpPrebrief} minutes`,
      tone: "prebrief",
      prebriefType: "sp",
    });
  }

  if (args.parsedFacultyPrebrief > 0) {
    timeline.push({
      label: "Faculty Prebrief",
      start: rotationStart - args.parsedFacultyPrebrief,
      end: rotationStart,
      detail: `${args.parsedFacultyPrebrief} minutes`,
      tone: "prebrief",
      prebriefType: "faculty",
    });
  }

  if (args.beforeRotationDayBlocks.length) {
    const beforeBlocks = args.beforeRotationDayBlocks.map((block) => ({
      ...block,
      minutes: parseNumber(block.durationMinutes, 0),
    }));
    let current = rotationStart - beforeBlocks.reduce((sum, block) => sum + block.minutes, 0);
    beforeBlocks.forEach((block) => {
      timeline.push({
        label: asText(block.label) || getDefaultDayBlockLabel(block.type),
        start: current,
        end: current + block.minutes,
        detail: `${block.minutes} minutes`,
        tone: getDayBlockTone(block.type),
        visibleTo: block.visibleTo,
      });
      current += block.minutes;
    });
  }

  if (args.rounds.length) {
    args.rounds.forEach((round) => {
      const encounterBlock = round.subBlocks.find((block) => block.label === "Encounter");
      timeline.push({
        label: `Rotation Round ${round.round}`,
        start: round.start,
        end: encounterBlock?.end || round.end,
        detail: "Encounter",
        tone: "rotation",
        visibleTo: "both",
      });
      round.subBlocks
        .filter((block) => block.label !== "Encounter" && !isFillerTimingLabel(block.label))
        .forEach((block) => {
          timeline.push({
            label: block.label,
            start: block.start,
            end: block.end,
            detail: `Round ${round.round}`,
            tone: "wrap",
            visibleTo: block.visibleTo,
          });
        });
    });
  }

  if (args.afterRotationDayBlocks.length) {
    let current = rotationEnd;
    const referenceEnd = args.referenceEndMinutes;
    for (const block of args.afterRotationDayBlocks) {
      const minutes = parseNumber(block.durationMinutes, 0);
      const blockEnd = current + minutes;
      const visibleEnd = referenceEnd !== null && referenceEnd !== undefined ? Math.min(blockEnd, referenceEnd) : blockEnd;
      if (visibleEnd <= current) {
        break;
      }
      timeline.push({
        label: asText(block.label) || getDefaultDayBlockLabel(block.type),
        start: current,
        end: visibleEnd,
        detail: `${minutes} minutes`,
        tone: getDayBlockTone(block.type),
        visibleTo: block.visibleTo,
      });
      current = visibleEnd;
      if (referenceEnd !== null && referenceEnd !== undefined && current >= referenceEnd) {
        break;
      }
    }
  }

  args.specificTimeDayBlocks.forEach((block) => {
    const start = normalizeTimelineClock(toMinutes(block.specificTime));
    const minutes = parseNumber(block.durationMinutes, 0);
    if (start === null || minutes <= 0) return;
    const blockEnd = start + minutes;
    const visibleEnd =
      args.referenceEndMinutes !== null && args.referenceEndMinutes !== undefined
        ? Math.min(blockEnd, args.referenceEndMinutes)
        : blockEnd;
    if (visibleEnd <= start) return;
    timeline.push({
      label: asText(block.label) || getDefaultDayBlockLabel(block.type),
      start,
      end: visibleEnd,
      detail: `${minutes} minutes`,
      tone: getDayBlockTone(block.type),
      visibleTo: block.visibleTo,
    });
  });

  timeline.sort((a, b) => a.start - b.start || a.end - b.end);
  return { rotationStart, rotationEnd, timeline };
}

function getFirstNonEmptyCell(row: unknown[]) {
  for (const cell of row) {
    const text = normalizeLearnerName(cell);
    if (text) return text;
  }
  return "";
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseLearnerNamesFromWorkbook(workbook: XLSX.WorkBook) {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  const objectRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const preferredHeaders = [
    "student name",
    "name",
    "learner",
    "learner name",
    "student",
    "full name",
  ];

  if (objectRows.length) {
    const sourceKey =
      preferredHeaders
        .map((header) =>
          Object.keys(objectRows[0] || {}).find((key) => normalizeHeader(key) === header)
        )
        .find(Boolean) || "";

    if (sourceKey) {
      return objectRows
        .map((row) => normalizeLearnerName(row[sourceKey]))
        .filter(Boolean);
    }
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  const names = rows
    .map((row) => (Array.isArray(row) ? getFirstNonEmptyCell(row) : ""))
    .filter(Boolean);

  if (!names.length) return [];

  const [firstName, ...rest] = names;
  const skipHeader =
    rest.length > 0 &&
    /\b(name|learner|student|group|participant|email|email address|notes)\b/i.test(firstName);

  return normalizeLearnerNames(skipHeader ? rest : names);
}

async function parseLearnerFile(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  return parseLearnerNamesFromWorkbook(workbook);
}

function downloadStudentRosterTemplate() {
  const csv = [
    "Student Name,Email Address,Notes",
    "Jordan Smith,jsmith@email.com,Needs front-row seat",
    "Taylor Chen,tchen@email.com,",
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "student-roster-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function shuffleRoster(names: string[]) {
  const next = normalizeLearnerNames(names);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildLearnerRoster(uploadedLearners: string[], slotCount: number, roundCount: number, fallbackLearnerCount = 0) {
  const roster = normalizeLearnerNames(uploadedLearners);
  if (roster.length) return roster;
  const fallbackCount = Math.max(fallbackLearnerCount, slotCount * Math.max(roundCount, 1), slotCount, 1);
  return Array.from({ length: fallbackCount }, (_, index) => `Learner ${index + 1}`);
}

function buildLearnerGroups(learnerRoster: string[], groupSize: number) {
  const normalizedLearnerRoster = normalizeLearnerNames(learnerRoster);
  const safeGroupSize = Math.max(1, groupSize);
  const groups: { labels: string[]; indexes: number[] }[] = [];
  for (let index = 0; index < normalizedLearnerRoster.length; index += safeGroupSize) {
    const labels = normalizedLearnerRoster.slice(index, index + safeGroupSize);
    groups.push({
      labels,
      indexes: labels.map((_, offset) => index + offset),
    });
  }
  return groups;
}

function attachLearners(
  rounds: GeneratedRound[],
  learnerRoster: string[],
  groupSize = 1,
  caseCount = 0,
  isMultiCaseMode = true,
  isVirtualEvent = false
) {
  const normalizedLearnerRoster = normalizeLearnerNames(learnerRoster);
  if (!rounds.length || !normalizedLearnerRoster.length) return [] as ScheduledRound[];

  const slotsPerRound = rounds[0]?.roomSlots.reduce((sum, slot) => sum + slot.capacity, 0) || 0;
  const activeCaseSlots = rounds[0]?.roomSlots.filter((slot) => isActiveScheduleSlot(slot, !isMultiCaseMode)) || [];
  const learnerGroups = buildLearnerGroups(normalizedLearnerRoster, groupSize);

  if (isMultiCaseMode && caseCount > 1 && activeCaseSlots.length) {
    const activeRoomCount = activeCaseSlots.length;
    const groupCount = learnerGroups.length;
    return rounds.map((round, roundIndex) => {
      const rotationIndex = roundIndex % Math.max(caseCount, groupCount, 1);
      const activeRoundSlots = round.roomSlots
        .map((slot, roundSlotIndex) => ({
          slot,
          roundSlotIndex,
        }))
        .filter(({ slot }) => isActiveScheduleSlot(slot, !isMultiCaseMode));
      return {
        ...round,
        roomSlots: round.roomSlots.map((slot, slotIndex) => {
          if (!isActiveScheduleSlot(slot, !isMultiCaseMode)) {
            return { ...slot, learnerIndexes: [], learnerLabels: [] };
          }
          const activeRoomIndex = activeRoundSlots.findIndex((entry) => entry.roundSlotIndex === slotIndex);
          const effectiveSlotIndex = activeRoomIndex;
          let groupIndex: number | null = null;
          if (effectiveSlotIndex >= 0) {
            if (groupCount >= activeRoomCount) {
              groupIndex = (rotationIndex + effectiveSlotIndex) % groupCount;
            } else {
              const candidateGroup = isVirtualEvent
                ? (rotationIndex + effectiveSlotIndex) % activeRoomCount
                : ((effectiveSlotIndex - rotationIndex) % activeRoomCount + activeRoomCount) % activeRoomCount;
              groupIndex = candidateGroup < groupCount ? candidateGroup : null;
            }
          }
          const group = groupIndex === null ? null : learnerGroups[groupIndex];
          return {
            ...slot,
            learnerIndexes: group?.indexes || [],
            learnerLabels: group?.labels || [],
          };
        }),
      };
    });
  }

  return rounds.map((round, roundIndex) => {
    let cursor = roundIndex * slotsPerRound;

    return {
      ...round,
      roomSlots: round.roomSlots.map((slot) => {
        const learnerIndexes = Array.from({ length: slot.capacity }, (_, offset) => {
          const learnerIndex = cursor + offset;
          return learnerIndex < normalizedLearnerRoster.length ? learnerIndex : -1;
        }).filter((value) => value >= 0);
        const learnerLabels = Array.from({ length: slot.capacity }, (_, offset) => {
          const learnerIndex = cursor + offset;
          return learnerIndex < normalizedLearnerRoster.length ? normalizedLearnerRoster[learnerIndex] : "";
        }).filter(Boolean);
        cursor += slot.capacity;
        return {
          ...slot,
          learnerIndexes,
          learnerLabels,
        };
      }),
    };
  });
}

function createEmptyScheduleRoomAdjustments(): ParsedScheduleRoomAdjustments {
  return {
    roundsByNumber: new Map(),
    slotKey: (roundNumber: number, slotIndex: number) => `${roundNumber}:${slotIndex}`,
  };
}

function hasScheduleRoomAdjustmentField(
  slot: Partial<ScheduleRoomAdjustmentSlot> | null | undefined,
  field: keyof ScheduleRoomAdjustmentSlot
) {
  return Boolean(slot) && Object.prototype.hasOwnProperty.call(slot, field);
}

function isConfirmedScheduleRoomAdjustment(slot: Partial<ScheduleRoomAdjustmentSlot> | null | undefined) {
  return normalizeDisplayText(slot?.source).toLowerCase() === CONFIRMED_SCHEDULE_OVERRIDE_SOURCE;
}

function normalizeScheduleCaseIdentity(value: unknown) {
  return normalizeDisplayText(value).toLowerCase();
}

function buildActiveScheduleCaseIdentitySet(caseDefinitions: Array<Pick<ScheduleCaseDefinition, "name" | "active">>) {
  return new Set(
    caseDefinitions
      .filter((caseDef) => caseDef.active !== false)
      .map((caseDef) => normalizeScheduleCaseIdentity(caseDef.name))
      .filter(Boolean)
  );
}

function isGeneratedCasePlaceholderLabel(value: unknown) {
  return /^case\s+\d+$/i.test(normalizeDisplayText(value));
}

function shouldStripSavedSlotCaseLabel(value: unknown, activeCaseIdentities: Set<string>) {
  const normalized = normalizeScheduleCaseIdentity(value);
  if (!normalized || !activeCaseIdentities.size) return false;
  return isGeneratedCasePlaceholderLabel(value) && !activeCaseIdentities.has(normalized);
}

function shouldStripMatchingUnconfirmedAdjustmentValue(slotValue: unknown, adjustmentValue: unknown, hasAdjustmentField: boolean) {
  const normalizedSlotValue = normalizeDisplayText(slotValue);
  const normalizedAdjustmentValue = normalizeDisplayText(adjustmentValue);
  return Boolean(
    hasAdjustmentField &&
      normalizedSlotValue &&
      normalizedAdjustmentValue &&
      normalizedSlotValue.toLowerCase() === normalizedAdjustmentValue.toLowerCase()
  );
}

function sanitizePersistedScheduleBuilderRoomSlot(
  slot: PersistedScheduleBuilderRoomSlot,
  adjustment: ScheduleRoomAdjustmentSlot | null | undefined,
  activeCaseIdentities: Set<string>
) {
  // IMPORTANT REGRESSION GUARD:
  // Schedule room cards must render from authoritative saved room slot objects. Do not stitch together
  // room, learner, SP, case, and role data from separate arrays by index. Saved builder/completed
  // schedule slots are the unit of truth. This sanitizer only removes stale, unconfirmed room
  // adjustment overlays that older code persisted into the saved slot object.
  const next = { ...slot };
  if (adjustment && !isConfirmedScheduleRoomAdjustment(adjustment)) {
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.assignedSpName, adjustment.spName, hasScheduleRoomAdjustmentField(adjustment, "spName"))) {
      next.assignedSpName = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.backupSpName, adjustment.backupSpName, hasScheduleRoomAdjustmentField(adjustment, "backupSpName"))) {
      next.backupSpName = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.caseLabel, adjustment.caseLabel, hasScheduleRoomAdjustmentField(adjustment, "caseLabel"))) {
      next.caseLabel = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.roleId, adjustment.roleId, hasScheduleRoomAdjustmentField(adjustment, "roleId"))) {
      next.roleId = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.roleLabel, adjustment.roleLabel, hasScheduleRoomAdjustmentField(adjustment, "roleLabel"))) {
      next.roleLabel = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.notes, adjustment.notes, hasScheduleRoomAdjustmentField(adjustment, "notes"))) {
      next.notes = "";
    }
    if (
      hasScheduleRoomAdjustmentField(adjustment, "stationStatus") &&
      normalizeScheduleStationStatus(next.stationStatus) === normalizeScheduleStationStatus(adjustment.stationStatus)
    ) {
      next.stationStatus = undefined;
    }
    if (
      hasScheduleRoomAdjustmentField(adjustment, "isBackupStation") &&
      Boolean(next.isBackupStation) === Boolean(adjustment.isBackupStation)
    ) {
      next.isBackupStation = false;
    }
  }
  if (shouldStripSavedSlotCaseLabel(next.caseLabel, activeCaseIdentities)) {
    next.caseLabel = "";
  }
  return next;
}

function sanitizePersistedScheduleBuilderRounds(
  rounds: PersistedScheduleBuilderRound[],
  adjustments: ParsedScheduleRoomAdjustments,
  caseDefinitions: Array<Pick<ScheduleCaseDefinition, "name" | "active">>
) {
  const activeCaseIdentities = buildActiveScheduleCaseIdentitySet(caseDefinitions);
  return rounds.map((round) => {
    const roundAdjustments = adjustments.roundsByNumber.get(round.round) || [];
    if (!round.roomSlots.length && !roundAdjustments.length) return round;
    return {
      ...round,
      roomSlots: round.roomSlots.map((slot, slotIndex) => {
        const adjustment = roundAdjustments.find((entry) => entry.slotIndex === slotIndex) || null;
        return sanitizePersistedScheduleBuilderRoomSlot(slot, adjustment, activeCaseIdentities);
      }),
    };
  });
}

function sanitizeScheduledRoomSlotFromStaleAdjustments(
  slot: ScheduledRoomSlot,
  adjustment: ScheduleRoomAdjustmentSlot | null | undefined,
  activeCaseIdentities: Set<string>
) {
  const next = { ...slot };
  if (adjustment && !isConfirmedScheduleRoomAdjustment(adjustment)) {
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.assignedSpName, adjustment.spName, hasScheduleRoomAdjustmentField(adjustment, "spName"))) {
      next.assignedSpName = "";
      next.assignedSpIndex = undefined;
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.backupSpName, adjustment.backupSpName, hasScheduleRoomAdjustmentField(adjustment, "backupSpName"))) {
      next.backupSpName = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.caseLabel, adjustment.caseLabel, hasScheduleRoomAdjustmentField(adjustment, "caseLabel"))) {
      next.caseLabel = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.roleId, adjustment.roleId, hasScheduleRoomAdjustmentField(adjustment, "roleId"))) {
      next.roleId = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.roleLabel, adjustment.roleLabel, hasScheduleRoomAdjustmentField(adjustment, "roleLabel"))) {
      next.roleLabel = "";
    }
    if (shouldStripMatchingUnconfirmedAdjustmentValue(next.notes, adjustment.notes, hasScheduleRoomAdjustmentField(adjustment, "notes"))) {
      next.notes = "";
    }
    if (
      hasScheduleRoomAdjustmentField(adjustment, "stationStatus") &&
      normalizeScheduleStationStatus(next.stationStatus) === normalizeScheduleStationStatus(adjustment.stationStatus)
    ) {
      next.stationStatus = undefined;
    }
    if (
      hasScheduleRoomAdjustmentField(adjustment, "isBackupStation") &&
      Boolean(next.isBackupStation) === Boolean(adjustment.isBackupStation)
    ) {
      next.isBackupStation = false;
    }
  }
  if (shouldStripSavedSlotCaseLabel(next.caseLabel, activeCaseIdentities)) {
    next.caseLabel = "";
  }
  return next;
}

function sanitizeScheduledRoundsFromStaleAdjustments(
  rounds: ScheduledRound[],
  adjustments: ParsedScheduleRoomAdjustments,
  caseDefinitions: Array<Pick<ScheduleCaseDefinition, "name" | "active">>
) {
  const activeCaseIdentities = buildActiveScheduleCaseIdentitySet(caseDefinitions);
  return rounds.map((round) => {
    const roundAdjustments = adjustments.roundsByNumber.get(round.round) || [];
    if (!round.roomSlots.length && !roundAdjustments.length) return round;
    return {
      ...round,
      roomSlots: round.roomSlots.map((slot, slotIndex) => {
        const adjustment = roundAdjustments.find((entry) => entry.slotIndex === slotIndex) || null;
        return sanitizeScheduledRoomSlotFromStaleAdjustments(slot, adjustment, activeCaseIdentities);
      }),
    };
  });
}

function parseScheduleRoomAdjustments(raw: string | null): ParsedScheduleRoomAdjustments {
  const clean = asText(raw);
  if (!clean) return createEmptyScheduleRoomAdjustments();

  try {
    const parsed = JSON.parse(clean) as {
      v?: number;
      rounds?: Array<{
        round: number;
      slots?: Array<{
        slotIndex?: number;
        learnerLabels?: string[];
        manualOverride?: boolean;
        source?: string;
        roomName?: string;
        spName?: string;
	        backupSpName?: string;
	        caseLabel?: string;
	        roleId?: string;
	        roleLabel?: string;
	        notes?: string;
	        stationStatus?: string;
	        isBackupStation?: boolean;
	      }>;
      }>;
    };

    if (!parsed || typeof parsed !== "object") return createEmptyScheduleRoomAdjustments();

    const roundsByNumber = new Map<number, ScheduleRoomAdjustmentSlot[]>();

    parsed.rounds?.forEach((roundEntry) => {
      if (!roundEntry || typeof roundEntry !== "object") return;
      const roundNumber = parseInt(String((roundEntry as { round?: unknown }).round || ""), 10);
      if (!Number.isFinite(roundNumber) || roundNumber < 1) return;

      const slots = (roundEntry.slots || [])
	        .map((slotEntry) => {
	          if (!slotEntry || typeof slotEntry !== "object") return null;
	          const slotRecord = slotEntry as Record<string, unknown>;
	          const slotIndex = parseInt(String((slotEntry as { slotIndex?: unknown }).slotIndex || ""), 10);
	          if (!Number.isFinite(slotIndex) || slotIndex < 0) return null;

          const learnerLabels = normalizeLearnerNames((slotEntry as { learnerLabels?: unknown }).learnerLabels || []);
          const manualOverrideValue = (slotEntry as { manualOverride?: unknown }).manualOverride;
          const manualOverride =
            manualOverrideValue === true ||
            asText(manualOverrideValue).toLowerCase() === "true" ||
            asText(manualOverrideValue).toLowerCase() === "1" ||
            asText(manualOverrideValue).toLowerCase() === "yes";
          const roomName = normalizeDisplayText((slotEntry as { roomName?: unknown }).roomName);
          const source = normalizeDisplayText((slotEntry as { source?: unknown }).source);
	          const spName = normalizeDisplayText((slotEntry as { spName?: unknown }).spName);
	          const backupSpName = normalizeDisplayText((slotEntry as { backupSpName?: unknown }).backupSpName);
	          const caseLabel = normalizeDisplayText((slotEntry as { caseLabel?: unknown }).caseLabel);
	          const roleId = normalizeDisplayText((slotEntry as { roleId?: unknown }).roleId);
	          const roleLabel = normalizeDisplayText((slotEntry as { roleLabel?: unknown }).roleLabel);
	          const notes = normalizeDisplayText((slotEntry as { notes?: unknown }).notes);
	          const stationStatus = normalizeScheduleStationStatus((slotEntry as { stationStatus?: unknown }).stationStatus);
	          const isBackupStationValue = (slotEntry as { isBackupStation?: unknown }).isBackupStation;
	          const isBackupStation =
	            isBackupStationValue === true ||
	            asText(isBackupStationValue).toLowerCase() === "true" ||
	            asText(isBackupStationValue).toLowerCase() === "1" ||
	            asText(isBackupStationValue).toLowerCase() === "yes";
	          const hasExplicitField = [
	            "learnerLabels",
	            "source",
	            "roomName",
	            "spName",
	            "backupSpName",
	            "caseLabel",
	            "roleId",
	            "roleLabel",
	            "notes",
	            "stationStatus",
	            "isBackupStation",
	          ].some((field) => Object.prototype.hasOwnProperty.call(slotRecord, field));
	          if (!learnerLabels.length && !manualOverride && !hasExplicitField) return null;
	          return {
	            slotIndex,
	            learnerLabels,
	            ...(manualOverride ? { manualOverride: true } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "source") ? { source } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "roomName") ? { roomName } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "spName") ? { spName } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "backupSpName") ? { backupSpName } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "caseLabel") ? { caseLabel } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "roleId") ? { roleId } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "roleLabel") ? { roleLabel } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "notes") ? { notes } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "stationStatus") ? { stationStatus: stationStatus || undefined } : {}),
	            ...(Object.prototype.hasOwnProperty.call(slotRecord, "isBackupStation") ? { isBackupStation } : {}),
	          } as ScheduleRoomAdjustmentSlot;
	        })
        .filter(Boolean) as ScheduleRoomAdjustmentSlot[];

      if (slots.length) {
        const deduped = new Map<number, ScheduleRoomAdjustmentSlot>();
        slots.forEach((slot) => {
          deduped.set(slot.slotIndex, slot);
        });
        roundsByNumber.set(roundNumber, Array.from(deduped.values()));
      }
    });

    return {
      roundsByNumber,
      slotKey: (roundNumber: number, slotIndex: number) => `${roundNumber}:${slotIndex}`,
    };
  } catch {
    return createEmptyScheduleRoomAdjustments();
  }
}

function normalizeScheduleRoomAdjustments(value: ParsedScheduleRoomAdjustments) {
  const normalized = createEmptyScheduleRoomAdjustments();
  const payload = value && value.roundsByNumber instanceof Map ? value : createEmptyScheduleRoomAdjustments();
  payload.roundsByNumber.forEach((slots, roundNumber) => {
    normalized.roundsByNumber.set(
      roundNumber,
      slots
      .map((slot) => {
        const learnerLabels = normalizeLearnerNames(slot.learnerLabels || []);
        const manualOverride = Boolean(slot.manualOverride);
        const source = normalizeDisplayText(slot.source);
        const roomName = normalizeDisplayText(slot.roomName);
	        const spName = normalizeDisplayText(slot.spName);
	        const backupSpName = normalizeDisplayText(slot.backupSpName);
	        const caseLabel = normalizeDisplayText(slot.caseLabel);
	        const roleId = normalizeDisplayText(slot.roleId);
	        const roleLabel = normalizeDisplayText(slot.roleLabel);
	        const notes = normalizeDisplayText(slot.notes);
	        const stationStatus = normalizeScheduleStationStatus(slot.stationStatus);
	        return {
	          slotIndex: slot.slotIndex,
	          learnerLabels,
	          ...(manualOverride ? { manualOverride: true } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "source") ? { source } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "roomName") ? { roomName } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "spName") ? { spName } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "backupSpName") ? { backupSpName } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "caseLabel") ? { caseLabel } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "roleId") ? { roleId } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "roleLabel") ? { roleLabel } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "notes") ? { notes } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "stationStatus") ? { stationStatus: stationStatus || undefined } : {}),
	          ...(hasScheduleRoomAdjustmentField(slot, "isBackupStation") ? { isBackupStation: Boolean(slot.isBackupStation) } : {}),
	        } as ScheduleRoomAdjustmentSlot;
	      })
	      .filter((slot) =>
	        slot.learnerLabels.length ||
	        slot.manualOverride ||
	        hasScheduleRoomAdjustmentField(slot, "source") ||
	        hasScheduleRoomAdjustmentField(slot, "roomName") ||
	        hasScheduleRoomAdjustmentField(slot, "spName") ||
	        hasScheduleRoomAdjustmentField(slot, "backupSpName") ||
	        hasScheduleRoomAdjustmentField(slot, "caseLabel") ||
	        hasScheduleRoomAdjustmentField(slot, "roleId") ||
	        hasScheduleRoomAdjustmentField(slot, "roleLabel") ||
	        hasScheduleRoomAdjustmentField(slot, "notes") ||
	        hasScheduleRoomAdjustmentField(slot, "stationStatus") ||
	        hasScheduleRoomAdjustmentField(slot, "isBackupStation")
	      )
    );
  });
  return normalized;
}

function serializeScheduleRoomAdjustments(value: ParsedScheduleRoomAdjustments) {
  const payload = value && value.roundsByNumber instanceof Map ? value : createEmptyScheduleRoomAdjustments();
  return JSON.stringify({
    v: 1,
    rounds: Array.from(payload.roundsByNumber.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, slots]) => ({
        round,
        slots: slots
          .slice()
          .sort((a, b) => a.slotIndex - b.slotIndex)
          .map((slot) => ({
	            slotIndex: slot.slotIndex,
	            learnerLabels: normalizeLearnerNames(slot.learnerLabels || []),
	            ...(slot.manualOverride ? { manualOverride: true } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "source") ? { source: normalizeDisplayText(slot.source) } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "roomName") ? { roomName: normalizeDisplayText(slot.roomName) } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "spName") ? { spName: normalizeDisplayText(slot.spName) } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "backupSpName") ? { backupSpName: normalizeDisplayText(slot.backupSpName) } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "caseLabel") ? { caseLabel: normalizeDisplayText(slot.caseLabel) } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "roleId") ? { roleId: normalizeDisplayText(slot.roleId) } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "roleLabel") ? { roleLabel: normalizeDisplayText(slot.roleLabel) } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "notes") ? { notes: normalizeDisplayText(slot.notes) } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "stationStatus") ? { stationStatus: normalizeScheduleStationStatus(slot.stationStatus) || undefined } : {}),
	            ...(hasScheduleRoomAdjustmentField(slot, "isBackupStation") ? { isBackupStation: Boolean(slot.isBackupStation) } : {}),
	          })),
      }))
      .filter((entry) =>
        entry.slots.some((slot) =>
	          slot.learnerLabels.length ||
	          Boolean(slot.manualOverride) ||
	          hasScheduleRoomAdjustmentField(slot, "source") ||
	          hasScheduleRoomAdjustmentField(slot, "roomName") ||
	          hasScheduleRoomAdjustmentField(slot, "spName") ||
	          hasScheduleRoomAdjustmentField(slot, "backupSpName") ||
	          hasScheduleRoomAdjustmentField(slot, "caseLabel") ||
	          hasScheduleRoomAdjustmentField(slot, "roleId") ||
	          hasScheduleRoomAdjustmentField(slot, "roleLabel") ||
	          hasScheduleRoomAdjustmentField(slot, "notes") ||
	          hasScheduleRoomAdjustmentField(slot, "stationStatus") ||
	          hasScheduleRoomAdjustmentField(slot, "isBackupStation")
	        )
      ),
  });
}

function upsertScheduleRoomAdjustmentSlot(
  adjustments: ParsedScheduleRoomAdjustments,
  roundNumber: number,
  slotIndex: number,
  partial: Partial<ScheduleRoomAdjustmentSlot>
) {
  const current = adjustments && adjustments.roundsByNumber instanceof Map ? adjustments : createEmptyScheduleRoomAdjustments();
  const nextRounds = new Map(current.roundsByNumber);
  const currentSlots = nextRounds.get(roundNumber)?.slice() || [];
  const existing = currentSlots.find((slot) => slot.slotIndex === slotIndex) || { slotIndex, learnerLabels: [] };
  const hasAnyExplicitField = [
    "learnerLabels",
    "source",
    "roomName",
    "spName",
    "backupSpName",
    "caseLabel",
    "roleId",
    "roleLabel",
    "notes",
    "stationStatus",
    "isBackupStation",
  ].some((field) => hasScheduleRoomAdjustmentField(partial, field as keyof ScheduleRoomAdjustmentSlot));
  const merged: ScheduleRoomAdjustmentSlot = {
    ...existing,
    ...partial,
    slotIndex,
    manualOverride:
      partial.manualOverride !== undefined
        ? Boolean(partial.manualOverride)
        : hasAnyExplicitField
        ? true
        : Boolean(existing.manualOverride),
    learnerLabels:
      partial.learnerLabels !== undefined
        ? normalizeLearnerNames(partial.learnerLabels)
        : normalizeLearnerNames(existing.learnerLabels || []),
  };
  const nextSlots = currentSlots.filter((slot) => slot.slotIndex !== slotIndex);
  if (
    merged.learnerLabels.length ||
    Boolean(merged.manualOverride) ||
    normalizeDisplayText(merged.roomName) ||
    normalizeDisplayText(merged.source) ||
    normalizeDisplayText(merged.spName) ||
    normalizeDisplayText(merged.backupSpName) ||
    normalizeDisplayText(merged.caseLabel) ||
    normalizeDisplayText(merged.roleId) ||
    normalizeDisplayText(merged.roleLabel) ||
    normalizeDisplayText(merged.notes) ||
    hasScheduleRoomAdjustmentField(merged, "stationStatus") ||
    hasScheduleRoomAdjustmentField(merged, "isBackupStation")
  ) {
    nextSlots.push(merged);
  }
  if (nextSlots.length) nextRounds.set(roundNumber, nextSlots);
  else nextRounds.delete(roundNumber);
  return {
    roundsByNumber: nextRounds,
    slotKey: current.slotKey,
  };
}

function applyScheduleRoomAdjustments(
  rounds: ScheduledRound[],
  assignedSpNames: string[],
  adjustments: ParsedScheduleRoomAdjustments,
  options?: { protectCompletedScheduleAssignments?: boolean }
) {
  // IMPORTANT REGRESSION GUARD:
  // For saved builder drafts and completed schedules, the saved slot object is the authoritative
  // assignment source. Room Operations metadata may overlay on top, but ordinary operational edits
  // must not silently override saved student/SP/room/case assignments. Assignment-changing edits
  // require explicit confirmation and must be saved as confirmed schedule overrides.
  return rounds.map((round) => {
    if (!rounds.length) return round;
	    const nextSlots = round.roomSlots.map((slot, slotIndex) => {
	      const overrides = (adjustments.roundsByNumber.get(round.round) || []).find(
	        (entry) => entry.slotIndex === slotIndex
	      );
	      const canApplyAssignmentOverride =
	        !options?.protectCompletedScheduleAssignments || isConfirmedScheduleRoomAdjustment(overrides);
	      const hasRoomNameOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "roomName");
	      const hasSpNameOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "spName");
	      const hasBackupSpOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "backupSpName");
	      const hasCaseLabelOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "caseLabel");
	      const hasRoleIdOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "roleId");
	      const hasRoleLabelOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "roleLabel");
	      const hasNotesOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "notes");
	      const hasStationStatusOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "stationStatus");
	      const hasBackupStationOverride = canApplyAssignmentOverride && hasScheduleRoomAdjustmentField(overrides, "isBackupStation");
	      const nextLearners =
	        canApplyAssignmentOverride && overrides?.manualOverride
	          ? normalizeLearnerNames(overrides.learnerLabels)
	          : canApplyAssignmentOverride && overrides?.learnerLabels?.length
	            ? normalizeLearnerNames(overrides.learnerLabels)
	            : slot.learnerLabels;
	      const nextSpName = normalizeDisplayText(overrides?.spName);
      const matchedSpIndex = nextSpName
        ? assignedSpNames.findIndex((candidate) =>
            normalizeDisplayText(candidate).toLowerCase() === normalizeDisplayText(nextSpName).toLowerCase()
          )
        : -1;
	      return {
	        ...slot,
	        roomName: hasRoomNameOverride
	          ? normalizeDisplayText(overrides?.roomName) || normalizeDisplayText(slot.roomName)
	          : normalizeDisplayText(slot.roomName),
	        learnerLabels: nextLearners,
	        caseLabel: hasCaseLabelOverride ? normalizeDisplayText(overrides?.caseLabel) : normalizeDisplayText(slot.caseLabel),
	        backupSpName: hasBackupSpOverride ? normalizeDisplayText(overrides?.backupSpName) : normalizeDisplayText(slot.backupSpName),
	        roleId: hasRoleIdOverride ? normalizeDisplayText(overrides?.roleId) : normalizeDisplayText(slot.roleId),
	        roleLabel: hasRoleLabelOverride ? normalizeDisplayText(overrides?.roleLabel) : normalizeDisplayText(slot.roleLabel),
	        notes: hasNotesOverride ? normalizeDisplayText(overrides?.notes) : normalizeDisplayText(slot.notes),
	        stationStatus: hasStationStatusOverride
	          ? normalizeScheduleStationStatus(overrides?.stationStatus) || undefined
	          : slot.stationStatus,
	        isBackupStation: hasBackupStationOverride
	          ? Boolean(overrides?.isBackupStation)
	          : Boolean(slot.isBackupStation),
	        learnerIndexes: nextLearners.length
	          ? nextLearners.map((value) => slot.learnerLabels.indexOf(value)).filter((value) => value >= 0)
	          : [],
	        assignedSpIndex: hasSpNameOverride ? (nextSpName && matchedSpIndex >= 0 ? matchedSpIndex : undefined) : slot.assignedSpIndex,
	        assignedSpName: hasSpNameOverride ? nextSpName : normalizeDisplayText(slot.assignedSpName),
	      };
    });
    return { ...round, roomSlots: nextSlots };
  });
}

function getSafeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_\.]/g, "")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildSchedulePreviewData(args: {
  kind: SchedulePreviewKind;
  previewFamily?: SchedulePreviewFamily | null;
  event: EventRow | null;
  timeline: TimelineBlock[];
  rounds: ScheduledRound[];
  scheduleGridRows: ScheduleGridPreviewRow[];
  roomColumns: PreviewRoomColumn[];
  roomContext: Parameters<typeof getRoomDisplayLabel>[2];
	  caseName?: string;
	  caseDocumentLabel?: string;
	  isSingleCaseMode?: boolean;
	  assignedSpNames?: string[];
	  hasSavedScheduleSlots?: boolean;
	  learnerCount: number;
  studentTimingConfig?: StudentScheduleTimingConfig;
  generated: {
    rounds: Array<GeneratedRound | ScheduledRound>;
    rotationStart: number;
    rotationEnd: number;
    timeline: TimelineBlock[];
  };
  selectedEventSummaryTime?: string;
}) {
  const {
    kind,
    previewFamily,
    event,
    timeline,
    rounds,
    scheduleGridRows,
    roomColumns,
    roomContext,
    caseName,
	    caseDocumentLabel,
	    isSingleCaseMode,
	    assignedSpNames,
	    hasSavedScheduleSlots,
	    learnerCount,
    studentTimingConfig,
    generated,
    selectedEventSummaryTime,
  } = args;

  const isOperations = kind === "operations" || kind === "rotation";
  const isStudentPreview = kind === "student";
  const isFacultyPreview = kind === "timeline";
  const singleCaseMode = Boolean(isSingleCaseMode);
  const allowGeneratedCaseFallback = !hasSavedScheduleSlots;
  const locationAccess = getLocationAccessFromBuilderEvent(event);
  const effectivePreviewFamily = getPreviewFamilyForKind(kind, previewFamily);
  const titleMap: Record<SchedulePreviewKind, string> = {
    timeline: "Faculty Schedule",
    announcements: "Announcement Schedule",
    student: "Student Schedule",
    sp: "SP Schedule",
    operations: "Admin Schedule",
    rotation: "Rotation Schedule",
  };
  const previewTimeline = timeline;
  const meaningfulPreviewTimeline = previewTimeline.filter((block) => !isFillerTimingLabel(block.label));
  const normalizedStudentTimingConfig = normalizeStudentScheduleTimingConfig(studentTimingConfig);
  const authoritativeGridStartByRound = buildStudentAuthoritativeRoundStartMap(
    scheduleGridRows,
    normalizedStudentTimingConfig.cadenceMinutes
  );
  const previewRounds = isStudentPreview
    ? rounds.map((round) => {
        const authoritativeStart = authoritativeGridStartByRound.get(round.round);
        if (authoritativeStart === undefined) return round;
        return {
          ...round,
          start: authoritativeStart,
        };
      })
    : rounds;
  const previewScheduleGridRows = isStudentPreview
    ? scheduleGridRows.filter((entry) => entry.kind !== "wide" || isStudentFacingWidePrebriefBlock(entry.block))
    : scheduleGridRows;
  const announcementScheduleConfig = parseAnnouncementScheduleFromNotes(event?.notes);
  const announcementRoundItems = previewRounds.flatMap((round, index) =>
    buildRoundAnnouncementCueTimeline(round, previewRounds[index + 1] || null, announcementScheduleConfig, { formatTime: toDisplayTime }).map((item) => ({
      ...item,
      roundNumber: round.round,
    }))
  );

  const lines: string[] = [];

  if (event) {
    lines.push(`Event: ${event.name || "Untitled Event"}`);
    lines.push(`Date: ${formatEventDate(event)}`);
    lines.push(`Location / Access: ${locationAccess.label}`);
    if (!isStudentPreview && caseName) {
      lines.push(`Case: ${caseName}`);
    }
    if (!isStudentPreview && caseDocumentLabel) {
      lines.push(`Case File: ${caseDocumentLabel}`);
    }
    if (selectedEventSummaryTime) {
      lines.push(`Time Window: ${selectedEventSummaryTime}`);
    }
    lines.push(`Rooms in Rotation: ${roomColumns.length || previewRounds[0]?.roomSlots.length || generated.rounds[0]?.roomSlots.length || 0}`);
    lines.push("");
  }

  const includeOperationsContext = isOperations;
  const previewLabel = titleMap[kind];
  // IMPORTANT REGRESSION GUARD:
  // Schedule room cards must render from authoritative saved room slot objects. Do not stitch together
  // room, learner, SP, case, and role data from separate arrays by index. Saved builder/completed
  // schedule slots are the unit of truth.
  const getSlotSpName = (slot: ScheduledRoomSlot, slotIndex = 0) => {
    const directName = normalizeDisplayText(slot.assignedSpName);
    if (directName) return directName;
    const fallbackNames = assignedSpNames || [];
    const indexedName = typeof slot.assignedSpIndex === "number" ? normalizeDisplayText(fallbackNames[slot.assignedSpIndex]) : "";
    return indexedName || normalizeDisplayText(fallbackNames[slotIndex]);
  };
	  const shouldShowRoomCaseLabels = (round: ScheduledRound | GeneratedRound) => {
	    if (singleCaseMode) return false;
	    const caseLabels = new Set(
	      round.roomSlots
	        .map((slot) => normalizeDisplayText(slot.caseLabel) || (allowGeneratedCaseFallback ? normalizeDisplayText(caseName) : ""))
	        .filter(Boolean)
	    );
	    return caseLabels.size > 1;
  };
  const getStudentEncounterStart = (round: ScheduledRound | GeneratedRound) => {
    return authoritativeGridStartByRound.get(round.round) ?? round.start;
  };
  const getStudentTiming = (round: ScheduledRound | GeneratedRound) =>
    buildStudentScheduleTiming(getStudentEncounterStart(round), normalizedStudentTimingConfig);
  const showStudentTiming = isStudentPreview || normalizedStudentTimingConfig.prebriefMinutes > 0;

  if (kind === "timeline") {
    lines.push("EVENT FLOW");
    lines.push("-----------");
    if (!meaningfulPreviewTimeline.length) {
      lines.push("No flow blocks yet. Add day blocks to build a full-day timeline.");
    } else {
      meaningfulPreviewTimeline.forEach((block) => {
        const duration = `${block.detail ? ` (${block.detail})` : ""}`;
        lines.push(`${formatRange(block.start, block.end)}  ${block.label}${duration}`);
      });
    }
    lines.push("");
    lines.push("ROTATION FLOW");
    lines.push("------------");
    previewRounds.forEach((round) => {
      lines.push(
        `Round ${round.round}: ${
          showStudentTiming ? formatStudentScheduleTimingSummary(getStudentTiming(round)) : formatRange(round.start, round.end)
        }`
      );
      const meaningfulSubBlocks = round.subBlocks.filter((subBlock) => !isFillerTimingLabel(subBlock.label));
      if (!showStudentTiming && meaningfulSubBlocks.length) {
        meaningfulSubBlocks.forEach((subBlock) => {
          lines.push(`  ${subBlock.label}: ${formatRange(subBlock.start, subBlock.end)}`);
        });
      }
      const showRoomCaseLabels = shouldShowRoomCaseLabels(round);
      round.roomSlots.forEach((slot, slotIndex) => {
        const displayRoomName = formatRoomName(slot.roomName, slot.roomType, slotIndex + 1, roomContext);
        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No student assigned";
        lines.push(`  ${displayRoomName}: ${learnerText}`);
        if (isOperations) {
          const spName = getSlotSpName(slot, slotIndex) || "Unassigned";
          lines.push(`    SP: ${spName}`);
          const normalizedCaseLabel = normalizeDisplayText(slot.caseLabel);
          if (showRoomCaseLabels && (normalizedCaseLabel || caseName)) {
            lines.push(`    Case: ${normalizedCaseLabel || caseName}`);
          }
          const normalizedBackupSpName = normalizeDisplayText(slot.backupSpName);
          const normalizedRoleLabel = normalizeDisplayText(slot.roleLabel);
          const normalizedNotes = normalizeDisplayText(slot.notes);
          if (normalizedBackupSpName) lines.push(`    Backup: ${normalizedBackupSpName}`);
          if (normalizedRoleLabel) lines.push(`    Role: ${normalizedRoleLabel}`);
          if (normalizedNotes) lines.push(`    Notes: ${normalizedNotes}`);
        }
      });
      lines.push("");
    });
    if (!previewRounds.length) {
      lines.push("No rotation schedule has been generated yet.");
    }
  } else if (kind === "announcements") {
    lines.push("ANNOUNCEMENT SCHEDULE");
    lines.push("---------------------");
    if (!announcementRoundItems.length) {
      lines.push("No announcement schedule has been generated yet.");
    } else {
      announcementRoundItems.forEach((item) => {
        lines.push(
          `Round ${item.roundNumber}: ${item.timeLabel}  ${item.badgeLabel} - ${item.message}${item.detail ? ` (${item.detail})` : ""}`
        );
      });
    }
  } else {
    lines.push(previewLabel.toUpperCase().replace(/\s+/g, " "));
    lines.push("=".repeat(Math.max(30, previewLabel.length)));
    previewRounds.forEach((round) => {
      lines.push(
        `\nRound ${round.round}: ${
          showStudentTiming ? formatStudentScheduleTimingSummary(getStudentTiming(round)) : formatRange(round.start, round.end)
        }`
      );
      const meaningfulSubBlocks = round.subBlocks.filter((subBlock) => !isFillerTimingLabel(subBlock.label));
      if (!showStudentTiming && meaningfulSubBlocks.length) {
        meaningfulSubBlocks.forEach((subBlock) => {
          lines.push(`  ${subBlock.label}: ${formatRange(subBlock.start, subBlock.end)}`);
        });
      }
      const showRoomCaseLabels = shouldShowRoomCaseLabels(round);
      round.roomSlots.forEach((slot, slotIndex) => {
        const displayRoomName = formatRoomName(slot.roomName, slot.roomType, slotIndex + 1, roomContext);
        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No student assigned";
        lines.push(`  ${displayRoomName}`);
        if (kind !== "sp") {
          lines.push(`    Learner: ${learnerText}`);
        }
        if (kind === "sp") {
          lines.push(`    Assignment: ${getSlotSpName(slot, slotIndex) || "Unassigned"}`);
        }
        if (includeOperationsContext) {
          lines.push(`    SP: ${getSlotSpName(slot, slotIndex) || "Unassigned SP"}`);
          const normalizedCaseLabel = normalizeDisplayText(slot.caseLabel);
          if (showRoomCaseLabels && (normalizedCaseLabel || caseName)) {
            lines.push(`    Case: ${normalizedCaseLabel || caseName}`);
          }
          const normalizedBackupSpName = normalizeDisplayText(slot.backupSpName);
          const normalizedRoleLabel = normalizeDisplayText(slot.roleLabel);
          const normalizedNotes = normalizeDisplayText(slot.notes);
          if (normalizedBackupSpName) lines.push(`    Backup: ${normalizedBackupSpName}`);
          if (normalizedRoleLabel) lines.push(`    Role: ${normalizedRoleLabel}`);
          if (normalizedNotes) lines.push(`    Notes: ${normalizedNotes}`);
        }
      });
      lines.push("");
    });

    if (!previewRounds.length) {
      lines.push("No rotation schedule has been generated yet.");
    }
  }

  const previewRotationStart = previewRounds[0]?.start ?? generated.rotationStart;
  const previewRotationEnd = previewRounds[previewRounds.length - 1]?.end ?? generated.rotationEnd;
  const previewRoundSummary = previewRounds.length
    ? `${previewRounds.length} saved rotation round${previewRounds.length === 1 ? "" : "s"}`
    : "";
  const previewTimelineSummary = meaningfulPreviewTimeline.length
    ? `${meaningfulPreviewTimeline.length} timeline block${meaningfulPreviewTimeline.length === 1 ? "" : "s"} · ${Math.max(previewRotationEnd - previewRotationStart, 0)} min planned`
    : "No timeline blocks configured";
  const timelineSummary = [previewRoundSummary, previewTimelineSummary].filter(Boolean).join(" · ");
  const renderCountSummary = `${previewRounds.length} round${previewRounds.length === 1 ? "" : "s"} rendered • ${roomColumns.length} room${roomColumns.length === 1 ? "" : "s"} rendered • ${learnerCount} learner${learnerCount === 1 ? "" : "s"} rendered`;

  const eventMetaHtml = event
    ? `
        <div class="event-meta">
          <div class="event-meta-card">
            <div class="event-meta-label">Event</div>
            <div class="event-meta-value">${escapeHtml(event.name || "Untitled Event")}</div>
          </div>
          <div class="event-meta-card">
            <div class="event-meta-label">Date</div>
            <div class="event-meta-value">${escapeHtml(formatEventDate(event))}</div>
          </div>
          <div class="event-meta-card virtual-access-card">
            <div class="event-meta-label">Location / Access</div>
            <div class="event-meta-value">${escapeHtml(locationAccess.label)}</div>
            <div class="event-meta-subtle">${escapeHtml(locationAccess.modeLabel)}</div>
          </div>
          ${
            !isStudentPreview && caseName
              ? `
                <div class="event-meta-card">
                  <div class="event-meta-label">Case</div>
                  <div class="event-meta-value">${escapeHtml(caseName)}</div>
                  ${caseDocumentLabel ? `<div class="event-meta-subtle">${escapeHtml(caseDocumentLabel)}</div>` : ""}
                </div>
              `
              : ""
          }
          ${
            selectedEventSummaryTime
              ? `
                <div class="event-meta-card">
                  <div class="event-meta-label">Time Window</div>
                  <div class="event-meta-value">${escapeHtml(selectedEventSummaryTime)}</div>
                </div>
              `
              : ""
          }
          <div class="event-meta-card">
            <div class="event-meta-label">Rooms in Rotation</div>
            <div class="event-meta-value">${roomColumns.length || previewRounds[0]?.roomSlots.length || generated.rounds[0]?.roomSlots.length || 0}</div>
          </div>
        </div>
      `
    : "";

  const timelineStripBlocks = meaningfulPreviewTimeline.filter((block) => !isPrimaryScheduleWideTimelineBlock(block));
  const scheduleWideBlocks = isStudentPreview ? [] : meaningfulPreviewTimeline.filter((block) => isPrimaryScheduleWideTimelineBlock(block));
  const renderTimelineRail = (blocks: TimelineBlock[]) =>
    blocks.length
      ? `
          <div class="timeline-rail">
            ${blocks
              .map((block) => {
                const tone = getFlowRhythmSegmentStyles(block.label);
                const durationMinutes = Math.max(getBlockDurationMinutes(block.start, block.end), 1);
                return `
                  <div class="timeline-segment" style="flex:${Math.max(durationMinutes, 6)} 1 84px; background:${tone.background}; border-color:${tone.borderColor}; color:${tone.color};">
                    <div class="timeline-segment-title">${escapeHtml(block.label)}</div>
                    <div class="timeline-segment-detail">${escapeHtml(formatRange(block.start, block.end))}</div>
                    <div class="timeline-segment-detail">${escapeHtml(formatDurationCompact(durationMinutes))}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `
      : `<div class="empty-state">No timing blocks are configured yet.</div>`;

  const renderRoundRhythmRows = () =>
    previewRounds.length
      ? previewRounds
          .map((round) => {
            const visibleRhythmBlocks = round.subBlocks.filter(
              (subBlock) => !isMajorScheduleDividerBlock(subBlock) && !isFillerTimingLabel(subBlock.label)
            );
            const rhythmSegments = visibleRhythmBlocks.length
              ? visibleRhythmBlocks
                  .map((subBlock) => {
                    const tone = getFlowRhythmSegmentStyles(subBlock.label);
                    const durationMinutes = Math.max(getBlockDurationMinutes(subBlock.start, subBlock.end), 1);
                    return `
                      <span class="rhythm-chip" style="flex:${Math.max(durationMinutes, 5)} 1 84px; background:${tone.background}; border-color:${tone.borderColor}; color:${tone.color};">
                        ${escapeHtml(subBlock.label)}
                        <small>${escapeHtml(formatDurationCompact(durationMinutes))}</small>
                      </span>
                    `;
                  })
                  .join("")
              : `<span class="rhythm-chip muted">Encounter flow only</span>`;

            return `
              <section class="rhythm-row">
                <div class="rhythm-row-head">
                  <div>
                    <div class="round-kicker">Round ${round.round}</div>
                    <h2>${escapeHtml(
                      showStudentTiming
                        ? formatStudentScheduleTimingSummary(getStudentTiming(round))
                        : formatRange(round.start, round.end)
                    )}</h2>
                  </div>
                  ${showStudentTiming ? "" : `<div class="rhythm-row-summary">${escapeHtml(getFlowRhythmSummary(round))}</div>`}
                </div>
                ${showStudentTiming ? "" : `<div class="rhythm-strip">${rhythmSegments}</div>`}
              </section>
            `;
          })
          .join("")
      : `<div class="empty-state">No rotation schedule has been generated yet.</div>`;

  const renderTicketRoomSummary = () =>
    rounds.length
      ? rounds
          .map((round) => `
            <section class="round-section">
              <div class="round-header">
                <div>
                  <div class="round-kicker">Round ${round.round}</div>
                  <h2>${escapeHtml(
                    showStudentTiming
                      ? formatStudentScheduleTimingSummary(getStudentTiming(round))
                      : formatRange(round.start, round.end)
                  )}</h2>
                </div>
              </div>
              <div class="room-grid">
                ${
                  round.roomSlots.length
                    ? round.roomSlots
                        .map((slot, slotIndex) => {
                          const displayRoomName = formatRoomName(slot.roomName, slot.roomType, slotIndex + 1, roomContext);
                          const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No student assigned";
                          const spName = getSlotSpName(slot, slotIndex) || "Unassigned";
                          const ticketDetail =
                            kind === "sp"
                              ? `Assignment: ${spName}`
                              : kind === "operations"
                                ? `${learnerText} · SP: ${spName || "Unassigned SP"}`
                                : learnerText;
                          return `
                            <div class="room-row">
                              <div class="room-row-head">
                                <span class="room-name">${escapeHtml(displayRoomName)}</span>
                                <span class="room-capacity">${escapeHtml(slot.capacityLabel)}</span>
                              </div>
                              <div class="room-row-detail">${escapeHtml(ticketDetail)}</div>
                            </div>
                          `;
                        })
                        .join("")
                    : `<div class="empty-state">No room assignments generated for this round yet.</div>`
                }
              </div>
            </section>
          `)
          .join("")
      : "";

  const renderScheduleGrid = () => {
    if (!previewScheduleGridRows.length || !roomColumns.length) {
      return `<div class="empty-state">No rotation schedule has been generated yet.</div>`;
    }
    const scheduleGridClassName = [
      "schedule-grid-table",
      roomColumns.length >= 7 ? "schedule-grid--dense" : "",
      `schedule-grid--rooms-${roomColumns.length}`,
    ]
      .filter(Boolean)
      .join(" ");

    return `
      <div class="schedule-grid-shell">
        <table class="${scheduleGridClassName}" data-room-count="${roomColumns.length}">
          <colgroup>
            <col class="round-index-column" />
            <col class="round-time-column" />
            ${roomColumns.map(() => `<col class="room-assignment-column" />`).join("")}
          </colgroup>
          <thead>
            <tr>
              <th>Round</th>
            <th>${isStudentPreview ? "Encounter Start" : "Time"}</th>
            ${roomColumns.map((column) => `<th class="room-column-header">${escapeHtml(column.displayRoomName)}</th>`).join("")}
          </tr>
          </thead>
          ${previewScheduleGridRows
            .map((entry) => {
              if (entry.kind === "wide") {
                const durationMinutes = Math.max(getBlockDurationMinutes(entry.block.start, entry.block.end), 1);
                return `
                  <tbody class="round-grid-group">
                    <tr class="wide-row">
                      <td colspan="${roomColumns.length + 2}">
                        <div class="wide-band">
                        <div class="wide-band-title">${escapeHtml(isStudentPreview && isStudentFacingWidePrebriefBlock(entry.block) ? getScheduleWidePrebriefLabel(entry.block) : entry.block.label)}</div>
                          <div class="wide-band-meta">${escapeHtml(
                            isStudentPreview && isStudentFacingWidePrebriefBlock(entry.block)
                              ? formatStudentPrebriefStart(entry.block)
                              : `${formatRange(entry.block.start, entry.block.end)} · ${formatDurationCompact(durationMinutes)}`
                          )}</div>
                          ${entry.block.detail ? `<div class="wide-band-note">${escapeHtml(entry.block.detail)}</div>` : ""}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                `;
              }

              const round = entry.round;
              const subBlockSummary = getFlowRhythmSummary(round) || "Encounter flow only";
              const showRoomCaseLabels = shouldShowRoomCaseLabels(round);

              return `
                <tbody class="round-grid-group">
                  <tr class="round-grid-row">
                    <td class="round-index-cell">
                      <div class="round-index">Round ${round.round}</div>
                    </td>
                    <td class="round-time-cell">
                      ${
                        showStudentTiming
                          ? `<div class="round-time round-time-student">${formatStudentScheduleTimingLines(getStudentTiming(round))
                              .map((line) => `<div>${escapeHtml(line)}</div>`)
                              .join("")}</div>`
                          : `<div class="round-time">${escapeHtml(formatRange(round.start, round.end))}</div>`
                      }
                      ${showStudentTiming ? "" : `<div class="round-time-summary">${escapeHtml(subBlockSummary)}</div>`}
                    </td>
                    ${round.roomSlots
                      .map((slot, slotIndex) => {
                        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No student assigned";
                        const spName = getSlotSpName(slot, slotIndex) || "Unassigned";
	                        const slotCaseName = normalizeDisplayText(slot.caseLabel) || (allowGeneratedCaseFallback ? caseName : "");
                        const backupSpName = normalizeDisplayText(slot.backupSpName);
                        const roleLabel = normalizeDisplayText(slot.roleLabel);
                        const notes = normalizeDisplayText(slot.notes);

                        return `
                          <td class="schedule-room-cell">
                            <div class="schedule-room-card">
                              ${
                                kind !== "sp"
                                  ? `<div><span class="detail-label">Learner</span><span class="detail-value">${escapeHtml(learnerText)}</span></div>`
                                  : ""
                              }
                              ${
                                kind === "sp"
                                  ? `<div><span class="detail-label">SP</span><span class="detail-value">${escapeHtml(spName || "Unassigned SP")}</span></div>`
                                  : ""
                              }
                              ${
                                isOperations
                                  ? `<div><span class="detail-label">SP</span><span class="detail-value">${escapeHtml(spName || "Unassigned SP")}</span></div>`
                                  : ""
                              }
                              ${
                                isOperations && showRoomCaseLabels && slotCaseName
                                  ? `<div><span class="detail-label">Case</span><span class="detail-value">${escapeHtml(slotCaseName)}</span></div>`
                                  : ""
                              }
                              ${
                                isOperations && backupSpName
                                  ? `<div><span class="detail-label">Backup</span><span class="detail-value">${escapeHtml(backupSpName)}</span></div>`
                                  : ""
                              }
                              ${
                                isOperations && roleLabel
                                  ? `<div><span class="detail-label">Role</span><span class="detail-value">${escapeHtml(roleLabel)}</span></div>`
                                  : ""
                              }
                              ${
                                isOperations && notes
                                  ? `<div><span class="detail-label">Notes</span><span class="detail-value">${escapeHtml(notes)}</span></div>`
                                  : ""
                              }
                              <div><span class="detail-label">Seat</span><span class="detail-value">${escapeHtml(slot.capacityLabel)}</span></div>
                            </div>
                          </td>
                        `;
                      })
                      .join("")}
                  </tr>
                </tbody>
              `;
            })
            .join("")}
        </table>
      </div>
    `;
  };
  const renderAnnouncementSchedule = () => {
    if (!announcementRoundItems.length) {
      return `<div class="empty-state">No announcement schedule has been generated yet.</div>`;
    }

    const groupedItems = new Map<number, typeof announcementRoundItems>();
    announcementRoundItems.forEach((item) => {
      const current = groupedItems.get(item.roundNumber) || [];
      current.push(item);
      groupedItems.set(item.roundNumber, current);
    });

    return `
      <div class="announcement-list">
        ${Array.from(groupedItems.entries())
          .map(
            ([roundNumber, items]) => `
              <section class="announcement-round">
                <div class="round-header">
                  <div>
                    <div class="round-kicker">Round ${roundNumber}</div>
                    <h2>Announcement Schedule</h2>
                  </div>
                  <div class="rhythm-row-summary">Times are approximate</div>
                </div>
                <table class="announcement-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Phase</th>
                      <th>Announcement</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items
                      .map(
                        (item) => `
                          <tr>
                            <td class="announcement-time-cell">${escapeHtml(item.timeLabel)}</td>
                            <td><span class="announcement-phase-chip">${escapeHtml(item.badgeLabel)}</span></td>
                            <td>
                              <div class="announcement-message">${escapeHtml(item.message)}</div>
                              ${item.detail ? `<div class="announcement-detail">${escapeHtml(item.detail)}</div>` : ""}
                            </td>
                          </tr>
                        `
                      )
                      .join("")}
                  </tbody>
                </table>
              </section>
            `
          )
          .join("")}
      </div>
    `;
  };

  const previewBody =
    kind === "announcements"
      ? `
        <div class="preview-shell">
          <div class="preview-header">
            <h1>${escapeHtml(titleMap[kind])}</h1>
            <div class="meta">${escapeHtml(event ? `Generated from ${event.name || "Untitled Event"}` : "Schedule Builder")}</div>
            <div class="meta">${escapeHtml(timelineSummary)}</div>
            <div class="meta">${escapeHtml(renderCountSummary)}</div>
          </div>
          ${eventMetaHtml}
          <section class="round-section">
            <div class="round-header">
                <div>
                  <div class="round-kicker">Announcement flow</div>
                  <h2>Round Cues</h2>
                </div>
              </div>
            ${renderAnnouncementSchedule()}
          </section>
        </div>
      `
      : effectivePreviewFamily === "ticket"
        ? `
          <div class="preview-shell">
            <div class="preview-header">
              <h1>${escapeHtml(titleMap[kind])}</h1>
              <div class="meta">${escapeHtml(event ? `Generated from ${event.name || "Untitled Event"}` : "Schedule Builder")}</div>
              <div class="meta">${escapeHtml(timelineSummary)}</div>
              <div class="meta">${escapeHtml(renderCountSummary)}</div>
            </div>
            ${eventMetaHtml}
            <section class="round-section">
              <div class="round-header">
                <div>
                  <div class="round-kicker">${escapeHtml(isStudentPreview ? "Student schedule" : isFacultyPreview ? "Faculty schedule" : "Time Ticket")}</div>
                  <h2>${escapeHtml(isStudentPreview ? "Learner-facing rotation view" : "Day flow at a glance")}</h2>
                </div>
              </div>
              ${renderTimelineRail(timelineStripBlocks)}
            </section>
            ${scheduleWideBlocks.length ? `<div class="divider-stack">${scheduleWideBlocks
              .map((block) => {
                const durationMinutes = Math.max(getBlockDurationMinutes(block.start, block.end), 1);
                return `<div class="divider-band"><strong>${escapeHtml(block.label)}</strong><span>${escapeHtml(
                  formatRange(block.start, block.end)
                )} · ${escapeHtml(formatDurationCompact(durationMinutes))}</span></div>`;
              })
              .join("")}</div>` : ""}
            ${renderRoundRhythmRows()}
            ${renderTicketRoomSummary()}
          </div>
        `
        : `
          <div class="preview-shell">
            <div class="preview-header">
              <h1>${escapeHtml(titleMap[kind])}</h1>
              <div class="meta">${escapeHtml(event ? `Generated from ${event.name || "Untitled Event"}` : "Schedule Builder")}</div>
              <div class="meta">${escapeHtml(timelineSummary)}</div>
              <div class="meta">${escapeHtml(renderCountSummary)}</div>
            </div>
            ${eventMetaHtml}
            <section class="round-section schedule-rhythm-section">
              <div class="round-header">
                <div>
                  <div class="round-kicker">Schedule rhythm</div>
                  <h2>Day Rhythm</h2>
                </div>
              </div>
              ${renderTimelineRail(timelineStripBlocks)}
            </section>
            ${scheduleWideBlocks.length ? `<div class="divider-stack">${scheduleWideBlocks
              .map((block) => {
                const durationMinutes = Math.max(getBlockDurationMinutes(block.start, block.end), 1);
                return `<div class="divider-band"><strong>${escapeHtml(block.label)}</strong><span>${escapeHtml(
                  formatRange(block.start, block.end)
                )} · ${escapeHtml(formatDurationCompact(durationMinutes))}</span></div>`;
              })
              .join("")}</div>` : ""}
            <section class="round-section">
              <div class="round-header">
                <div>
                  <div class="round-kicker">Schedule grid</div>
                  <h2>Builder layout preview</h2>
                </div>
              </div>
              ${renderScheduleGrid()}
            </section>
          </div>
        `;
  const csvRows =
    kind === "announcements"
      ? [
          ["Round", "Time", "Phase", "Announcement", "Detail"],
          ...announcementRoundItems.map((item) => [
            `Round ${item.roundNumber}`,
            item.timeLabel,
            item.badgeLabel,
            item.message,
            item.detail || "",
          ]),
        ]
      : kind === "timeline"
      ? [
          ["Start", "End", "Activity", "Duration", "Detail"],
          ...meaningfulPreviewTimeline.map((block) => [
            formatTimeWithDayOffset(block.start),
            formatTimeWithDayOffset(block.end),
            block.label,
            formatDurationCompact(Math.max(getBlockDurationMinutes(block.start, block.end), 1)),
            block.detail || "",
          ]),
        ]
      : [
          ["Round", "Time", "Room", "Learner", "SP", "Case", "Seat"],
          ...previewRounds.flatMap((round) => {
            const showRoomCaseLabels = includeOperationsContext && shouldShowRoomCaseLabels(round);
            return round.roomSlots.map((slot, slotIndex) => {
              const displayRoomName = formatRoomName(slot.roomName, slot.roomType, slotIndex + 1, roomContext);
              const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No student assigned";
              const spName = getSlotSpName(slot, slotIndex);
	              const slotCaseName = normalizeDisplayText(slot.caseLabel) || (allowGeneratedCaseFallback ? caseName || "" : "");

              return [
                `Round ${round.round}`,
                isStudentPreview ? formatStudentScheduleTimingSummary(getStudentTiming(round)) : formatRange(round.start, round.end),
                displayRoomName,
                kind !== "sp" ? learnerText : "",
                kind === "sp" || includeOperationsContext ? spName : "",
                showRoomCaseLabels ? slotCaseName : "",
                slot.capacityLabel,
              ];
            });
          }),
        ];

  return {
    kind,
    title: titleMap[kind],
    summary: timelineSummary,
    text: lines.join("\n"),
    csv: toCsv(csvRows),
    html: `
      <!doctype html>
      <html>
        <head>
          <meta charSet="UTF-8" />
          <title>${titleMap[kind]}</title>
          <style>
            body { margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #17304f; background: #f7fafc; }
            .preview-shell { display: grid; gap: 16px; }
            .preview-header { display: grid; gap: 6px; }
            .meta { color: #5e7388; font-size: 12px; }
            h1 { margin: 0; font-size: 24px; }
            h2 { margin: 0; font-size: 18px; color: #14304f; }
            .event-meta { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
            .event-meta-card, .round-section { border: 1px solid #dce6ee; border-radius: 14px; background: #ffffff; }
            .event-meta-card { padding: 12px 14px; }
            .event-meta-label, .detail-label { display: block; color: #5e7388; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
            .event-meta-value, .detail-value { display: block; margin-top: 6px; color: #14304f; font-size: 14px; font-weight: 700; }
            .round-section { padding: 16px; display: grid; gap: 14px; }
            .round-header { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
            .round-kicker { color: #5e7388; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
            .round-summary { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
            .subblock-chip { border: 1px solid #d6e0e8; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 700; }
            .subblock-chip.muted { background: #f8fafc; color: #64748b; border-color: #dbe4ee; }
            .timeline-rail { display: flex; gap: 8px; overflow: hidden; align-items: stretch; }
            .timeline-segment { min-width: 84px; border: 1px solid #dce6ee; border-radius: 14px; padding: 10px 12px; display: grid; gap: 4px; }
            .timeline-segment-title { font-size: 14px; font-weight: 800; }
            .timeline-segment-detail { font-size: 11px; opacity: 0.82; }
            .rhythm-row { border: 1px solid #dce6ee; border-radius: 14px; background: #fff; padding: 14px; display: grid; gap: 12px; }
            .rhythm-row-head { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }
            .rhythm-row-summary { color: #5e7388; font-size: 13px; font-weight: 700; }
            .rhythm-strip { display: flex; gap: 8px; flex-wrap: wrap; }
            .rhythm-chip { border: 1px solid #d6e0e8; border-radius: 999px; padding: 8px 10px; font-size: 12px; font-weight: 800; display: inline-flex; gap: 6px; align-items: center; justify-content: space-between; }
            .rhythm-chip small { font-size: 11px; opacity: 0.75; font-weight: 700; }
            .rhythm-chip.muted { background: #f8fafc; color: #64748b; border-color: #dbe4ee; }
            .divider-stack { display: grid; gap: 10px; }
            .divider-band { border: 1px solid #f1d1a7; border-radius: 14px; background: #fff6e8; color: #a86411; padding: 12px 14px; display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
            .room-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
            .room-row { border: 1px solid #dce6ee; border-radius: 12px; padding: 12px; background: #f8fbfd; display: grid; gap: 8px; }
            .room-row-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
            .room-name { font-size: 14px; font-weight: 800; color: #14304f; }
            .room-capacity { font-size: 11px; font-weight: 700; color: #5e7388; text-transform: uppercase; letter-spacing: 0.06em; }
            .room-row-detail { font-size: 13px; color: #35526f; line-height: 1.5; }
            .room-row-grid { display: grid; gap: 8px; }
            .schedule-grid-shell { overflow-x: auto; border: 1px solid #dce6ee; border-radius: 14px; background: #f8fbfd; max-width: 100%; }
            .schedule-grid-table { width: 100%; border-collapse: collapse; min-width: 880px; table-layout: fixed; }
            .schedule-grid-table.schedule-grid--dense { min-width: 0; }
            .round-grid-group, .round-grid-row, .wide-row, .schedule-room-cell, .schedule-room-card {
              break-inside: avoid;
              page-break-inside: avoid;
              -webkit-column-break-inside: avoid;
            }
            .schedule-grid-table th { text-align: left; padding: 12px; border-bottom: 1px solid #dce6ee; color: #5e7388; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; background: #f8fbfd; overflow-wrap: anywhere; }
            .schedule-grid-table td { padding: 12px; border-bottom: 1px solid #eef3f7; vertical-align: top; background: #ffffff; overflow-wrap: anywhere; word-break: break-word; }
            .schedule-grid-table.schedule-grid--dense th,
            .schedule-grid-table.schedule-grid--dense td { padding: 6px 7px; font-size: 11px; line-height: 1.2; }
            .round-index { font-size: 13px; font-weight: 900; color: #14304f; white-space: nowrap; }
            .round-time { font-size: 13px; font-weight: 900; color: #14304f; }
            .round-time-student { display: grid; gap: 4px; line-height: 1.35; }
            .round-time-summary { margin-top: 6px; font-size: 12px; line-height: 1.45; color: #5e7388; }
            .schedule-room-cell { background: #fdfefe; min-width: 180px; }
            .schedule-grid-table.schedule-grid--dense .schedule-room-cell { min-width: 0; }
            .schedule-room-card { border: 1px solid #dce6ee; border-radius: 12px; background: #f8fbfd; padding: 10px; display: grid; gap: 8px; }
            .schedule-grid-table.schedule-grid--dense .schedule-room-card { padding: 6px; gap: 5px; border-radius: 9px; }
            .announcement-list { display: grid; gap: 14px; }
            .announcement-round { display: grid; gap: 10px; break-inside: avoid; page-break-inside: avoid; }
            .announcement-table { width: 100%; border-collapse: collapse; border: 1px solid #dce6ee; border-radius: 12px; overflow: hidden; background: #ffffff; }
            .announcement-table th { text-align: left; padding: 10px 12px; border-bottom: 1px solid #dce6ee; color: #5e7388; font-size: 11px; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; background: #f8fbfd; }
            .announcement-table td { padding: 10px 12px; border-bottom: 1px solid #eef3f7; vertical-align: top; color: #14304f; font-size: 13px; line-height: 1.4; background: #ffffff; }
            .announcement-table tr:last-child td { border-bottom: none; }
            .announcement-time-cell { width: 120px; white-space: nowrap; font-weight: 900; }
            .announcement-phase-chip { display: inline-flex; border: 1px solid #cfe1ef; border-radius: 999px; padding: 4px 8px; background: #f2f7fb; color: #35526f; font-size: 11px; font-weight: 900; white-space: nowrap; }
            .announcement-message { font-weight: 800; }
            .announcement-detail { margin-top: 3px; color: #5e7388; font-size: 11px; font-weight: 700; }
            .wide-row td { background: #f8fbfd; }
            .wide-band { border: 1px solid #f1d1a7; border-radius: 14px; background: #fff6e8; color: #a86411; padding: 12px 14px; display: grid; gap: 6px; }
            .wide-band-title { font-size: 15px; font-weight: 900; }
            .wide-band-meta, .wide-band-note { font-size: 12px; font-weight: 700; opacity: 0.9; }
            .empty-state { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 14px; color: #64748b; background: #fff; font-size: 13px; font-weight: 600; }
            @media print {
              @page { margin: 0.35in; }
              html, body { background: #ffffff !important; }
              body { background: #ffffff; padding: 0; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .preview-shell { gap: 12px; }
              .schedule-grid-shell { border: none; }
              .round-section,
              .rhythm-row,
              .event-meta-card,
              .round-grid-group,
              .round-grid-row,
              .wide-row,
              .schedule-room-cell,
              .schedule-room-card,
              .wide-band {
                break-inside: avoid;
                page-break-inside: avoid;
                -webkit-column-break-inside: avoid;
              }
              .schedule-grid-table thead { display: table-header-group; }
              .schedule-grid-table tbody { break-inside: avoid; page-break-inside: avoid; }
              .schedule-grid-table tr { break-inside: avoid; page-break-inside: avoid; }
              .schedule-grid-shell { overflow: visible; max-width: none; }
            }
          </style>
        </head>
        <body>
          ${previewBody}
        </body>
      </html>
    `,
  };
}

function getStorageKey(eventId?: string, scheduleDay = 1, includeLegacy = false) {
  if (scheduleDay <= 1 && includeLegacy) {
    return `cfsp:schedule-builder:${eventId || "global"}`;
  }
  if (scheduleDay <= 1) return `cfsp:schedule-builder:${eventId || "global"}:day-1`;
  return `cfsp:schedule-builder:${eventId || "global"}:day-${Math.max(1, scheduleDay)}`;
}

function parseScheduleBuilderDays(raw: string | null | undefined) {
  const text = asText(raw);
  if (!text) return new Map<number, ScheduleBuilderDraft>();

  try {
    const parsed = JSON.parse(text) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return new Map<number, ScheduleBuilderDraft>();

    const output = new Map<number, ScheduleBuilderDraft>();
    Object.entries(parsed).forEach(([rawKey, encodedSnapshot]) => {
      const day = Number.parseInt(rawKey, 10);
      if (!Number.isFinite(day) || day <= 0 || typeof encodedSnapshot !== "string") return;
      const snapshot = parseScheduleBuilderSnapshot(encodedSnapshot);
      if (snapshot) output.set(day, snapshot);
    });

    return output;
  } catch {
    return new Map<number, ScheduleBuilderDraft>();
  }
}

function encodeScheduleBuilderSnapshot(snapshot: ScheduleBuilderDraft) {
  try {
    return encodeURIComponent(JSON.stringify(snapshot));
  } catch {
    return "";
  }
}

function serializeScheduleBuilderDays(days: Map<number, ScheduleBuilderDraft>) {
  const entries = Array.from(days.entries())
    .filter(([day, snapshot]) => Number.isFinite(day) && day > 0 && Boolean(snapshot))
    .sort((a, b) => a[0] - b[0])
    .map(([day, snapshot]) => {
      const encodedSnapshot = encodeScheduleBuilderSnapshot(snapshot);
      return encodedSnapshot ? ([String(day), encodedSnapshot] as const) : null;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));

  if (!entries.length) return "";
  return JSON.stringify(Object.fromEntries(entries));
}

function normalizeSavedBuilderStartTime(value: unknown) {
  const normalized = asText(value);
  const parsedMinutes = parseClockTextToMinutes(normalized);
  return parsedMinutes !== null ? minutesToInputTime(parsedMinutes) : DEFAULT_SCHEDULE_BUILDER_DRAFT.startTime;
}

function parseSavedDraft(raw: string | null): ScheduleBuilderDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ScheduleBuilderDraft>;
    const normalizedDayBlocks = normalizeDayBlocks((parsed as { dayBlocks?: unknown }).dayBlocks);
    const hasExplicitDayBlocks = Object.prototype.hasOwnProperty.call(parsed, "dayBlocks");
    const scheduleCaseDefinitions = normalizeScheduleCaseDefinitions(
      (parsed as { scheduleCaseDefinitions?: unknown }).scheduleCaseDefinitions
    );
    const activeCaseCount = scheduleCaseDefinitions.filter((caseDef) => caseDef.active).length;
    return {
      ...DEFAULT_SCHEDULE_BUILDER_DRAFT,
      ...parsed,
      startTime: normalizeSavedBuilderStartTime(parsed.startTime),
      builderMode: parsed.builderMode === "advanced" ? "advanced" : "simple",
      scheduleViewMode: parsed.scheduleViewMode === "operations" ? "operations" : "student",
      originalUploadedLearners: Array.isArray(parsed.originalUploadedLearners)
        ? normalizeLearnerNames(parsed.originalUploadedLearners)
        : [],
      uploadedLearners: Array.isArray(parsed.uploadedLearners)
        ? normalizeLearnerNames(parsed.uploadedLearners)
        : [],
      dayBlocks: hasExplicitDayBlocks
        ? normalizedDayBlocks
        : normalizedDayBlocks.length
          ? normalizedDayBlocks
          : buildLegacyDayBlocks(parsed),
      selectedEventId: asText(parsed.selectedEventId),
      learnerFileName: asText(parsed.learnerFileName),
      checklistEnabled: parseBooleanFlag((parsed as { checklistEnabled?: unknown }).checklistEnabled, false),
      checklistMinutes: Object.prototype.hasOwnProperty.call(parsed, "checklistMinutes")
        ? asText(parsed.checklistMinutes)
        : "0",
      checklistPlacement: normalizeChecklistPlacement((parsed as { checklistPlacement?: unknown }).checklistPlacement),
      feedbackMinutes: Object.prototype.hasOwnProperty.call(parsed, "feedbackMinutes")
        ? asText(parsed.feedbackMinutes)
        : "0",
      transitionMinutes: Object.prototype.hasOwnProperty.call(parsed, "transitionMinutes")
        ? asText(parsed.transitionMinutes)
        : "0",
      multipleCasesEnabled: parseBooleanFlag(
        (parsed as { multipleCasesEnabled?: unknown }).multipleCasesEnabled,
        parseBooleanFlag((parsed as { caseRotationRequired?: unknown }).caseRotationRequired, false)
      ),
      scheduleCaseDefinitions,
      scheduleActiveCaseCount:
        parseNumber((parsed as { scheduleActiveCaseCount?: unknown }).scheduleActiveCaseCount, 0) || activeCaseCount,
      scheduleFlexRoomCount: parseNumber((parsed as { scheduleFlexRoomCount?: unknown }).scheduleFlexRoomCount, 0),
      caseRotationRequired: parseBooleanFlag(
        (parsed as { caseRotationRequired?: unknown }).caseRotationRequired,
        parseBooleanFlag((parsed as { multipleCasesEnabled?: unknown }).multipleCasesEnabled, false)
      ),
      savedAt: asText(parsed.savedAt) || null,
    };
  } catch {
    return null;
  }
}

function parseScheduleBuilderSnapshot(raw: unknown) {
  const text = asText(raw);
  if (!text) return null;

  const candidates = [text];
  try {
    candidates.unshift(decodeURIComponent(text));
  } catch {
    // Older local snapshots may already be plain JSON.
  }

  for (const candidate of candidates) {
    const parsed = parseSavedDraft(candidate);
    if (parsed) return parsed;
  }

  return null;
}

function getCompletedScheduleCalculatedRoundCount(payload: Record<string, unknown>) {
  const learnerCount = parseNumber(payload.learner_count, 0);
  const roomCount = parseNumber(payload.room_count, 0);
  const studentsPerRoom = parseNumber(payload.students_per_room, 0);
  const learnersPerRound = roomCount * studentsPerRoom;
  if (learnerCount <= 0 || learnersPerRound <= 0) return 0;
  return Math.max(1, Math.ceil(learnerCount / learnersPerRound));
}

function normalizeCompletedScheduleBuilderSnapshot(
  snapshot: ScheduleBuilderDraft,
  payload: Record<string, unknown>
) {
  const calculatedRoundCount = getCompletedScheduleCalculatedRoundCount(payload);
  const resolvedRounds = snapshot.resolvedRounds || [];
  if (calculatedRoundCount <= 0 || resolvedRounds.length <= calculatedRoundCount) return snapshot;

  return {
    ...snapshot,
    roundCount: String(calculatedRoundCount),
    scheduleRoundCount: calculatedRoundCount,
    resolvedRounds: resolvedRounds.slice(0, calculatedRoundCount),
  };
}

function parseCompletedScheduleBuilderSnapshotFromMetadata(raw: unknown) {
  const text = asText(raw);
  if (!text) return null;

  const candidates = [text];
  try {
    candidates.unshift(decodeURIComponent(text));
  } catch {
    // Completed schedule metadata is usually URL-encoded.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") continue;
      if (asText(parsed.status).toLowerCase() !== "complete") continue;

      const snapshot =
        parsed.snapshot && typeof parsed.snapshot === "object"
          ? parseScheduleBuilderSnapshot(JSON.stringify(parsed.snapshot))
          : parseScheduleBuilderSnapshot(parsed.snapshot);
      if (!snapshot) continue;

      return normalizeCompletedScheduleBuilderSnapshot(snapshot, parsed);
    } catch {
      continue;
    }
  }

  return null;
}

function buildScheduleDraftFromMetadata(metadata: ReturnType<typeof parseEventMetadata>["training"]): ScheduleBuilderDraft | null {
  const learners = parseScheduleLearnerRosterMetadata(metadata.schedule_learner_roster);
  const learnerCount = parseNumber(metadata.schedule_learner_count, 0);
  const roomCount = parseNumber(metadata.schedule_room_count, 0);
  const roundCount = parseNumber(metadata.schedule_round_count, 0);
  const roomCapacity = parseNumber(metadata.schedule_room_capacity, 0);
  const encounterMinutes = parseNumber(metadata.schedule_encounter_minutes, 0);
  const checklistEnabled = parseBooleanFlag(metadata.schedule_checklist_enabled, false);
  const checklistMinutes = parseNumber(metadata.schedule_checklist_minutes, 0);
  const checklistPlacement = normalizeChecklistPlacement(metadata.schedule_checklist_placement);
  const feedbackMinutes = parseNumber(metadata.schedule_feedback_minutes, 0);
  const transitionMinutes = parseNumber(metadata.schedule_transition_minutes, 0);
  const flexCapacity = parseNumber(metadata.schedule_flex_capacity, 0);
  const facultyPrebriefMinutes = parseNumber(metadata.schedule_faculty_prebrief_minutes, 0);
  const roundTargetMinutes = parseNumber(metadata.schedule_round_target_minutes, 0);
  const savedAt = asText(metadata.schedule_last_saved_at || metadata.schedule_updated_at);
  const metadataStartTimeCandidates = [
    asText(metadata.event_start_time),
    asText(metadata.training_start_time),
  ];
  const metadataStartTime =
    metadataStartTimeCandidates
      .map((candidate) => {
        const parsed = parseClockTextToMinutes(candidate);
        return parsed !== null ? minutesToInputTime(parsed) : "";
      })
      .find(Boolean) || DEFAULT_SCHEDULE_BUILDER_DRAFT.startTime;
  const hasMetadataDraft =
    learners.length > 0 ||
    learnerCount > 0 ||
    roomCount > 0 ||
    roundCount > 0 ||
    roomCapacity > 0 ||
    encounterMinutes > 0 ||
    checklistEnabled ||
    checklistMinutes > 0 ||
    feedbackMinutes > 0 ||
    transitionMinutes > 0 ||
    flexCapacity > 0 ||
    facultyPrebriefMinutes > 0 ||
    roundTargetMinutes > 0;
  if (!hasMetadataDraft) return null;

  const normalizedLearners = learners.length > 0 ? learners : [];
  const scheduleLearnerRoster = learners.length > 0 ? learners : buildGeneratedLearnerNames(learnerCount);

  return {
    ...DEFAULT_SCHEDULE_BUILDER_DRAFT,
    startTime: metadataStartTime,
    learnerFileName: learners.length > 0 ? "Saved learner roster" : "",
    originalUploadedLearners: normalizedLearners,
    uploadedLearners: normalizedLearners,
    examRoomCount: roomCount ? String(roomCount) : DEFAULT_SCHEDULE_BUILDER_DRAFT.examRoomCount,
    roundCount: roundCount ? String(roundCount) : DEFAULT_SCHEDULE_BUILDER_DRAFT.roundCount,
    roomCapacity: roomCapacity ? String(roomCapacity) : DEFAULT_SCHEDULE_BUILDER_DRAFT.roomCapacity,
    maxPairsPerFlexRoom: flexCapacity ? String(flexCapacity) : DEFAULT_SCHEDULE_BUILDER_DRAFT.maxPairsPerFlexRoom,
    encounterMinutes: encounterMinutes ? String(encounterMinutes) : DEFAULT_SCHEDULE_BUILDER_DRAFT.encounterMinutes,
    checklistEnabled,
    checklistMinutes: asText(metadata.schedule_checklist_minutes) ? String(checklistMinutes) : "0",
    checklistPlacement,
    feedbackMinutes: asText(metadata.schedule_feedback_minutes) ? String(feedbackMinutes) : "0",
    transitionMinutes: asText(metadata.schedule_transition_minutes) ? String(transitionMinutes) : "0",
    facultyPrebriefMinutes: facultyPrebriefMinutes ? String(facultyPrebriefMinutes) : DEFAULT_SCHEDULE_BUILDER_DRAFT.facultyPrebriefMinutes,
    sessionLengthMinutes: roundTargetMinutes ? sanitizeSavedRoundTargetMinutes(String(roundTargetMinutes)) : "0",
    savedAt: savedAt || null,
    scheduleStatus: asText(metadata.schedule_status).toLowerCase() === "complete" ? "complete" : "in_progress",
    scheduleLearnerRoster,
    scheduleRoundCount: roundCount || Math.max(1, parseNumber(DEFAULT_SCHEDULE_BUILDER_DRAFT.roundCount, 1)),
    scheduleRoomCount: roomCount || parseNumber(DEFAULT_SCHEDULE_BUILDER_DRAFT.examRoomCount, 0),
    scheduleRoomCapacity: roomCapacity || parseNumber(DEFAULT_SCHEDULE_BUILDER_DRAFT.roomCapacity, 1),
  };
}

function getScheduleDraftMultipleCaseMode(draft: Partial<ScheduleBuilderDraft> | null | undefined) {
  if (!draft) return false;
  return parseBooleanFlag(
    draft.multipleCasesEnabled,
    parseBooleanFlag(draft.caseRotationRequired, false)
  );
}

function getSafeScheduleWorkflowPayloadShape(partial: Record<string, string>) {
  const snapshot = parseScheduleBuilderSnapshot(partial.schedule_builder_snapshot);
  let dayKeys: string[] = [];
  try {
    const parsedDays = JSON.parse(asText(partial.schedule_builder_days || "{}")) as Record<string, unknown>;
    dayKeys = parsedDays && typeof parsedDays === "object" ? Object.keys(parsedDays).sort() : [];
  } catch {
    dayKeys = [];
  }

  return {
    metadataKeys: Object.keys(partial).sort(),
    scheduleStatus: asText(partial.schedule_status),
    learnerCount: asText(partial.schedule_learner_count),
    roomCount: asText(partial.schedule_room_count),
    roundCount: asText(partial.schedule_round_count),
    caseCount: asText(partial.case_count),
    caseRotationRequired: asText(partial.case_rotation_required),
    dayKeys,
    snapshot: snapshot
      ? {
          scheduleStatus: asText((snapshot as Partial<PersistedScheduleBuilderSnapshot>).scheduleStatus),
          learnerCount: normalizeLearnerNames(
            (snapshot as Partial<PersistedScheduleBuilderSnapshot>).scheduleLearnerRoster || []
          ).length,
          roomCount: parseNumber((snapshot as Partial<PersistedScheduleBuilderSnapshot>).scheduleRoomCount, 0),
          roundCount: parseNumber((snapshot as Partial<PersistedScheduleBuilderSnapshot>).scheduleRoundCount, 0),
          caseCount: parseNumber((snapshot as Partial<PersistedScheduleBuilderSnapshot>).scheduleActiveCaseCount, 0),
          multipleCasesEnabled: getScheduleDraftMultipleCaseMode(snapshot),
          resolvedRoundCount: normalizePersistedScheduleBuilderRounds(
            (snapshot as Partial<PersistedScheduleBuilderSnapshot>).resolvedRounds
          ).length,
        }
      : null,
  };
}

function logScheduleWorkflowSaveFailure(
  context: string,
  error: unknown,
  partial: Record<string, string>
) {
  console.error("[schedule-builder] Schedule metadata save failed.", {
    context,
    error: error instanceof Error ? error.message : asText(error) || "Unknown error",
    payloadShape: getSafeScheduleWorkflowPayloadShape(partial),
  });
}

const SCHEDULE_BUILDER_DIAGNOSTICS_ENABLED = process.env.NODE_ENV !== "production";

function logScheduleTimingDiagnostics(context: string, payload: Record<string, unknown>) {
  if (!SCHEDULE_BUILDER_DIAGNOSTICS_ENABLED) return;
  console.info("[schedule-builder] timing", { context, ...payload });
}

function normalizePersistedScheduleBuilderRounds(raw: unknown): PersistedScheduleBuilderRound[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((round, roundIndex) => {
      const record = round as Partial<PersistedScheduleBuilderRound>;
      const roomSlots = Array.isArray(record.roomSlots)
        ? record.roomSlots.map((slot, slotIndex) => {
            const slotRecord = slot as Partial<PersistedScheduleBuilderRoomSlot>;
            return {
              roomName: asText(slotRecord.roomName) || `Exam ${slotIndex + 1}`,
              learnerLabels: normalizeLearnerNames(slotRecord.learnerLabels || []),
	              assignedSpName: normalizeDisplayText(slotRecord.assignedSpName),
	              backupSpName: normalizeDisplayText(slotRecord.backupSpName),
	              caseLabel: normalizeDisplayText(slotRecord.caseLabel),
	              roleId: normalizeDisplayText(slotRecord.roleId),
	              roleLabel: normalizeDisplayText(slotRecord.roleLabel),
	              notes: normalizeDisplayText(slotRecord.notes),
	              stationStatus: normalizeScheduleStationStatus(slotRecord.stationStatus) || undefined,
	              isBackupStation: Boolean(slotRecord.isBackupStation),
	              roomType: slotRecord.roomType === "flex" ? "flex" : "exam",
	              capacity: Math.max(0, parseNumber(slotRecord.capacity, 1)),
            } satisfies PersistedScheduleBuilderRoomSlot;
          })
        : [];

      return {
        round: Math.max(1, parseNumber(record.round, roundIndex + 1)),
        sessionDate: asText(record.sessionDate),
        startTime: asText(record.startTime),
        endTime: asText(record.endTime),
        roomSlots,
      } satisfies PersistedScheduleBuilderRound;
    })
    .filter((round) => round.roomSlots.length > 0 || asText(round.startTime) || asText(round.endTime));
}

function convertPersistedRoundsToScheduledRounds(
  rounds: SchedulePreviewRound[],
  rhythmRounds: ScheduledRound[] = []
): ScheduledRound[] {
  const rhythmByRound = new Map(rhythmRounds.map((round) => [round.round, round]));

  return rounds.map((round, roundIndex) => {
    const roundNumber = Math.max(1, parseNumber(round.round, roundIndex + 1));
    const rhythmRound = rhythmByRound.get(roundNumber) || null;
    const start = rhythmRound?.start ?? toMinutes(asText(round.startTime)) ?? 0;
    const parsedEnd = toMinutes(asText(round.endTime));
    const end = rhythmRound?.end ?? (parsedEnd !== null ? (parsedEnd < start ? parsedEnd + 24 * 60 : parsedEnd) : start);
    const subBlocks = rhythmRound?.subBlocks.length
      ? rhythmRound.subBlocks.map((block) => ({ ...block }))
      : [
          {
            label: "Encounter",
            start,
            end,
            visibleTo: "both" as const,
          },
        ];

    return {
      round: roundNumber,
      start,
      end,
      subBlocks,
      roomSlots: (round.roomSlots || []).map((slot) => {
        const learnerLabels = normalizeLearnerNames(slot.learnerLabels || []);
        const capacity = Math.max(0, parseNumber(slot.capacity, Math.max(learnerLabels.length, 1)));
        return {
          roomName: asText(slot.roomName),
          roomType: slot.roomType === "flex" ? "flex" : "exam",
          capacity,
          capacityLabel: capacity
            ? `${capacity} learner${capacity === 1 ? "" : "s"}`
            : "Flex / empty",
          learnerLabels,
          learnerIndexes: [],
	          assignedSpName: normalizeDisplayText(slot.assignedSpName),
	          backupSpName: normalizeDisplayText(slot.backupSpName),
	          caseLabel: normalizeDisplayText(slot.caseLabel),
	          roleId: normalizeDisplayText(slot.roleId),
	          roleLabel: normalizeDisplayText(slot.roleLabel),
	          notes: normalizeDisplayText(slot.notes),
	          stationStatus: normalizeScheduleStationStatus(slot.stationStatus) || undefined,
	          isBackupStation: Boolean(slot.isBackupStation),
	        } satisfies ScheduledRoomSlot;
      }),
    } satisfies ScheduledRound;
  });
}

function cloneScheduledRoundForNumber(round: ScheduledRound, roundNumber: number): ScheduledRound {
  const duration = Math.max(round.end - round.start, 1);
  const start = round.start + (roundNumber - round.round) * duration;
  const end = start + duration;

  return {
    ...round,
    round: roundNumber,
    start,
    end,
    subBlocks: round.subBlocks.map((block) => ({
      ...block,
      start: block.start + (start - round.start),
      end: block.end + (start - round.start),
    })),
    roomSlots: round.roomSlots.map((slot) => ({
      ...slot,
      learnerLabels: [...slot.learnerLabels],
      learnerIndexes: [...slot.learnerIndexes],
    })),
  };
}

function formatSavedTimestamp(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function buildPersistedScheduleBuilderRounds(
  rounds: ScheduledRound[],
  assignedNames: string[],
  sessionDate: string | null | undefined
) {
  const resolvedDate = asText(sessionDate);
  void assignedNames;
  return rounds.map((round) => ({
    round: round.round,
    sessionDate: resolvedDate,
    startTime: minutesToInputTime(round.start),
    endTime: minutesToInputTime(round.end),
    roomSlots: round.roomSlots.map((slot) => ({
      roomName: asText(slot.roomName),
      learnerLabels: normalizeLearnerNames(slot.learnerLabels),
      assignedSpName: normalizeDisplayText(slot.assignedSpName),
	      backupSpName: asText(slot.backupSpName),
	      caseLabel: asText(slot.caseLabel),
	      roleId: asText(slot.roleId),
	      roleLabel: asText(slot.roleLabel),
	      notes: asText(slot.notes),
	      stationStatus:
          normalizeScheduleStationStatus(slot.stationStatus) ||
          (slot.roomType === "flex" || slot.capacity <= 0 ? "inactive" : undefined),
	      isBackupStation: Boolean(slot.isBackupStation),
	      roomType: slot.roomType,
      capacity: slot.capacity,
    })),
  }));
}

function getSaveStateAppearance(state: SaveState) {
  if (state === "saving") {
    return {
      label: "Saving...",
      detail: "Auto-saving schedule builder changes to this browser.",
      background: "rgba(243, 187, 103, 0.16)",
      border: "rgba(243, 187, 103, 0.34)",
      color: "var(--cfsp-warning)",
    };
  }

  if (state === "unsaved") {
    return {
      label: "Unsaved changes",
      detail: "Changes are waiting to auto-save.",
      background: "rgba(243, 187, 103, 0.14)",
      border: "rgba(243, 187, 103, 0.28)",
      color: "var(--cfsp-warning)",
    };
  }

  if (state === "error") {
    return {
      label: "Save failed",
      detail: "This browser could not save the current builder draft.",
      background: "rgba(214, 69, 69, 0.14)",
      border: "rgba(214, 69, 69, 0.28)",
      color: "#c23b3b",
    };
  }

  return {
    label: "Saved",
    detail: "Builder changes are auto-saved locally for this event.",
    background: "rgba(44, 211, 173, 0.14)",
    border: "rgba(44, 211, 173, 0.28)",
    color: "var(--cfsp-green)",
  };
}

function getSaveButtonAppearance(state: SaveState) {
  if (state === "saving") {
    return {
      label: "Saving...",
      background: "#b7791f",
      border: "#975a16",
      color: "#ffffff",
      shadow: "0 10px 24px rgba(183, 121, 31, 0.22)",
    };
  }

  if (state === "error") {
    return {
      label: "Save Failed",
      background: "#b42318",
      border: "#912018",
      color: "#ffffff",
      shadow: "0 10px 24px rgba(180, 35, 24, 0.2)",
    };
  }

  if (state === "unsaved") {
    return {
      label: "Save Changes",
      background: "#c65f16",
      border: "#9a4712",
      color: "#ffffff",
      shadow: "0 10px 24px rgba(198, 95, 22, 0.2)",
    };
  }

  return {
    label: "Saved ✓",
    background: "#12805c",
    border: "#0f684b",
    color: "#ffffff",
    shadow: "0 10px 24px rgba(18, 128, 92, 0.18)",
  };
}

export default function EventScheduleBuilder(props: EventScheduleBuilderProps) {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedEventId, setSelectedEventId] = useState(props.fixedEventId || "");
  const [copyMessage, setCopyMessage] = useState("");
  const [copyMessageTone, setCopyMessageTone] = useState<"success" | "error">("success");
  const [learnerFileName, setLearnerFileName] = useState("");
  const [learnerUploadError, setLearnerUploadError] = useState("");
  const [showClearRosterDialog, setShowClearRosterDialog] = useState(false);
  const [originalUploadedLearners, setOriginalUploadedLearners] = useState<string[]>([]);
  const [uploadedLearners, setUploadedLearners] = useState<string[]>([]);
  const [builderMode, setBuilderMode] = useState<"simple" | "advanced">(
    props.expandedWorkspace ? "advanced" : DEFAULT_SCHEDULE_BUILDER_DRAFT.builderMode
  );
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleBuilderViewMode>(
    props.initialScheduleViewMode || DEFAULT_SCHEDULE_BUILDER_DRAFT.scheduleViewMode
  );
  const [selectedBuilderRound, setSelectedBuilderRound] = useState<number | null>(
    typeof props.initialRoundNumber === "number" && props.initialRoundNumber > 0 ? props.initialRoundNumber : null
  );
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [scheduleCompletionSaving, setScheduleCompletionSaving] = useState(false);
  const [multipleCasesEnabled, setMultipleCasesEnabled] = useState(false);
  const [scheduleMathEpoch, setScheduleMathEpoch] = useState(0);
  const [timeSource, setTimeSource] = useState<BuilderTimePrefill>({
    source: "default",
    label: "Using default time",
    startTime: DEFAULT_SCHEDULE_BUILDER_DRAFT.startTime,
    endTime: "",
    sessionLengthMinutes: "0",
  });

  const [startTime, setStartTime] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.startTime);
  const [staffArrivalTime, setStaffArrivalTime] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.staffArrivalTime);
  const [spArrivalTime, setSpArrivalTime] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.spArrivalTime);
  const [facultyArrivalTime, setFacultyArrivalTime] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.facultyArrivalTime);
  const [roomSetupMinutes, setRoomSetupMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.roomSetupMinutes);

  const [studentPrebriefMinutes, setStudentPrebriefMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.studentPrebriefMinutes);
  const [spPrebriefMinutes, setSpPrebriefMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.spPrebriefMinutes);
  const [facultyPrebriefMinutes, setFacultyPrebriefMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.facultyPrebriefMinutes);

  const [sessionLengthMinutes, setSessionLengthMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.sessionLengthMinutes);
  const [roundCount, setRoundCount] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.roundCount);
  const [examRoomCount, setExamRoomCount] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.examRoomCount);
  const [flexRoomCount, setFlexRoomCount] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.flexRoomCount);
  const [roomCapacity, setRoomCapacity] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.roomCapacity);
  const [maxPairsPerFlexRoom, setMaxPairsPerFlexRoom] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.maxPairsPerFlexRoom);
  const [encounterMinutes, setEncounterMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.encounterMinutes);
  const [postEncounterBlock, setPostEncounterBlock] = useState<"checklist" | "break" | "other">(DEFAULT_SCHEDULE_BUILDER_DRAFT.postEncounterBlock);
  const [postEncounterMinutes, setPostEncounterMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.postEncounterMinutes);
  const [dayBlocks, setDayBlocks] = useState<DayBlockConfig[]>(DEFAULT_SCHEDULE_BUILDER_DRAFT.dayBlocks);
  const [manualRoundOverride, setManualRoundOverride] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.manualRoundOverride);
  const [checklistEnabled, setChecklistEnabled] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.checklistEnabled);
  const [checklistMinutes, setChecklistMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.checklistMinutes);
  const [checklistPlacement, setChecklistPlacement] = useState<ChecklistPlacement>(DEFAULT_SCHEDULE_BUILDER_DRAFT.checklistPlacement);
  const [soapMinutes, setSoapMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.soapMinutes);
  const [feedbackMinutes, setFeedbackMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.feedbackMinutes);
  const [transitionMinutes, setTransitionMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.transitionMinutes);

  const [includeChecklist, setIncludeChecklist] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.includeChecklist);
  const [includeSoap, setIncludeSoap] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.includeSoap);
  const [includeFeedback, setIncludeFeedback] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.includeFeedback);
  const [includeDebrief, setIncludeDebrief] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.includeDebrief);
  const [includeBreakdown, setIncludeBreakdown] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.includeBreakdown);

  const [debriefMinutes, setDebriefMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.debriefMinutes);
  const [breakdownMinutes, setBreakdownMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.breakdownMinutes);
  const hydratedDraftKeyRef = useRef<string>("");
  const hydratedTimePrefillKeyRef = useRef<string>("");
  const lockedScheduleSourceRef = useRef<BuilderTimeSource | null>(null);
  const lastKnownGoodScheduleSnapshotRef = useRef<ScheduleBuilderDraft | null>(null);
  const hasAuthoritativeScheduleDataRef = useRef(false);
  const pendingStructureChangeRef = useRef<(() => void) | null>(null);
  const scheduleStructureChangeConfirmedRef = useRef(false);
  const repairedLegacyScheduleMetadataRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const workflowSyncTimeoutRef = useRef<number | null>(null);
  const [structureChangeDialogOpen, setStructureChangeDialogOpen] = useState(false);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [previewKind, setPreviewKind] = useState<SchedulePreviewKind>(props.initialPreviewKind || "timeline");
  const schedulePreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [styledPdfExporting, setStyledPdfExporting] = useState(false);
  const [studentInstructionsPdfExporting, setStudentInstructionsPdfExporting] = useState(false);
  const [facultySimOpsInstructionsPdfExporting, setFacultySimOpsInstructionsPdfExporting] = useState(false);
  const [showExpandedFlowDetails, setShowExpandedFlowDetails] = useState(false);
  const [activeFlowDetailKey, setActiveFlowDetailKey] = useState("");
  const [me, setMe] = useState<BuilderMeResponse | null>(null);
  const [roomAdjustments, setRoomAdjustments] = useState<ParsedScheduleRoomAdjustments>(createEmptyScheduleRoomAdjustments());
  const [persistedResolvedRounds, setPersistedResolvedRounds] = useState<PersistedScheduleBuilderRound[]>([]);
  const [persistedResolvedRoundTargetCount, setPersistedResolvedRoundTargetCount] = useState(0);
  const [persistedScheduleStructureSignature, setPersistedScheduleStructureSignature] = useState("");
  const [learnerCountOverride, setLearnerCountOverride] = useState<number | null>(null);
  const learnerListTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!showSchedulePreview || typeof document === "undefined") return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [showSchedulePreview]);

  useEffect(() => {
    if (props.initialPreviewKind) {
      setPreviewKind(props.initialPreviewKind);
    }
  }, [props.initialPreviewKind]);

  const applyDraft = useCallback((draft: ScheduleBuilderDraft) => {
    const savedResolvedRounds = normalizePersistedScheduleBuilderRounds(
      (draft as Partial<PersistedScheduleBuilderSnapshot>).resolvedRounds
    );
    const persistedSnapshot = draft as Partial<PersistedScheduleBuilderSnapshot>;
    const savedRoundTargetCount = getExpectedSchedulePreviewRoundCount({
      resolvedRounds: savedResolvedRounds,
      scheduleRoundCount: persistedSnapshot.scheduleRoundCount,
      roundCount: draft.roundCount,
    });
    setBuilderMode(props.expandedWorkspace && !draft.savedAt ? "advanced" : draft.builderMode);
    setScheduleViewMode(props.initialScheduleViewMode || draft.scheduleViewMode);
    setSelectedEventId(props.fixedEventId || draft.selectedEventId || "");
    setLearnerFileName(draft.learnerFileName);
    setOriginalUploadedLearners(draft.originalUploadedLearners);
    setUploadedLearners(draft.uploadedLearners);
    setStartTime(draft.startTime);
    setStaffArrivalTime(draft.staffArrivalTime);
    setSpArrivalTime(draft.spArrivalTime);
    setFacultyArrivalTime(draft.facultyArrivalTime);
    setRoomSetupMinutes(draft.roomSetupMinutes);
    setStudentPrebriefMinutes(draft.studentPrebriefMinutes);
    setSpPrebriefMinutes(draft.spPrebriefMinutes);
    setFacultyPrebriefMinutes(draft.facultyPrebriefMinutes);
    setSessionLengthMinutes(sanitizeSavedRoundTargetMinutes(draft.sessionLengthMinutes));
    setRoundCount(draft.roundCount);
    setExamRoomCount(draft.examRoomCount);
    setFlexRoomCount(draft.flexRoomCount);
    setRoomCapacity(draft.roomCapacity);
    setMaxPairsPerFlexRoom(draft.maxPairsPerFlexRoom);
    setEncounterMinutes(draft.encounterMinutes);
    setPostEncounterBlock(draft.postEncounterBlock);
    setPostEncounterMinutes(draft.postEncounterMinutes);
    setDayBlocks(draft.dayBlocks.length ? draft.dayBlocks : DEFAULT_SCHEDULE_BUILDER_DRAFT.dayBlocks);
    setManualRoundOverride(Boolean(draft.manualRoundOverride));
    setChecklistEnabled(Boolean(draft.checklistEnabled));
    setChecklistMinutes(draft.checklistMinutes);
    setChecklistPlacement(normalizeChecklistPlacement(draft.checklistPlacement));
    setSoapMinutes(draft.soapMinutes);
    setFeedbackMinutes(draft.feedbackMinutes);
    setTransitionMinutes(draft.transitionMinutes);
    setIncludeChecklist(draft.includeChecklist);
    setIncludeSoap(draft.includeSoap);
    setIncludeFeedback(draft.includeFeedback);
    setIncludeDebrief(draft.includeDebrief);
    setIncludeBreakdown(draft.includeBreakdown);
    setDebriefMinutes(draft.debriefMinutes);
    setBreakdownMinutes(draft.breakdownMinutes);
    setMultipleCasesEnabled(getScheduleDraftMultipleCaseMode(draft));
    setPersistedResolvedRounds(savedResolvedRounds);
    setPersistedResolvedRoundTargetCount(savedRoundTargetCount);
    setPersistedScheduleStructureSignature(asText(persistedSnapshot.scheduleStructureSignature));
    setLearnerCountOverride(null);
    setLastSavedAt(draft.savedAt || null);
    setSaveState(draft.savedAt ? "saved" : "saved");
    setSaveErrorMessage("");
  }, [props.expandedWorkspace, props.fixedEventId, props.initialScheduleViewMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/events", {
          cache: "no-store",
          credentials: "include",
        });

        if (cancelled) return;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        const body = (await response.json().catch(() => null)) as EventsResponse | null;

        if (!response.ok) {
          setErrorMessage(asText(body?.error) || `Could not load events (${response.status}).`);
          setLoading(false);
          return;
        }

        const loadedEvents = Array.isArray(body?.events) ? body.events : [];
        setEvents(loadedEvents);
        setSelectedEventId((current) => {
          if (props.fixedEventId) return props.fixedEventId;
          return current || loadedEvents[0]?.id || "";
        });
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load events.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, [props.fixedEventId, router]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as BuilderMeResponse | null;
        if (!cancelled && body) {
          setMe(body);
        }
      } catch {
        return;
      }
    }

    void loadCurrentUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleDay = Number.isFinite(props.initialScheduleDay)
    ? Math.max(1, Math.floor(props.initialScheduleDay as number))
    : 1;
  const storageKey = useMemo(
    () =>
      getStorageKey(
        props.fixedEventId || selectedEventId || "",
        scheduleDay,
        scheduleDay <= 1
      ),
    [props.fixedEventId, selectedEventId, scheduleDay]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey || hydratedDraftKeyRef.current === storageKey) return;

    const legacyStorageKey = getStorageKey(props.fixedEventId || selectedEventId || "", 1, true);
    const savedDraft = props.fixedEventId
      ? null
      : parseSavedDraft(window.localStorage.getItem(storageKey)) ||
        (storageKey !== legacyStorageKey
          ? parseSavedDraft(window.localStorage.getItem(legacyStorageKey))
          : null);
    skipNextAutosaveRef.current = true;
    hydratedDraftKeyRef.current = storageKey;

    // IMPORTANT REGRESSION GUARD:
    // Saved builder draft and completed schedule snapshot are authoritative. Do not rebuild
    // schedule structure from fallback room/learner math when saved schedule metadata exists.
    // Failed saves must not mutate the local saved state.
    if (savedDraft) {
      applyDraft(savedDraft);
    } else {
      applyDraft({
        ...DEFAULT_SCHEDULE_BUILDER_DRAFT,
        selectedEventId: props.fixedEventId || selectedEventId || "",
      });
    }
  }, [applyDraft, props.fixedEventId, selectedEventId, storageKey]);

  useEffect(() => {
    if (typeof props.initialRoundNumber === "number" && props.initialRoundNumber > 0) {
      setSelectedBuilderRound(props.initialRoundNumber);
    }
  }, [props.initialRoundNumber]);

  useEffect(() => {
    if (props.initialScheduleViewMode) {
      setScheduleViewMode(props.initialScheduleViewMode);
    }
  }, [props.initialScheduleViewMode]);

  const draftSnapshot = useMemo<ScheduleBuilderDraft>(
    () => ({
      builderMode,
      scheduleViewMode,
      selectedEventId: props.fixedEventId || selectedEventId || "",
      learnerFileName,
      originalUploadedLearners,
      uploadedLearners,
      startTime,
      staffArrivalTime,
      spArrivalTime,
      facultyArrivalTime,
      roomSetupMinutes,
      studentPrebriefMinutes,
      spPrebriefMinutes,
      facultyPrebriefMinutes,
      sessionLengthMinutes,
      roundCount,
      examRoomCount,
      flexRoomCount,
      roomCapacity,
      maxPairsPerFlexRoom,
      encounterMinutes,
      postEncounterBlock,
      postEncounterMinutes,
      dayBlocks,
      manualRoundOverride,
      checklistEnabled,
      checklistMinutes,
      checklistPlacement,
      soapMinutes,
      feedbackMinutes,
      transitionMinutes,
      includeChecklist,
      includeSoap,
      includeFeedback,
      includeDebrief,
      includeBreakdown,
      debriefMinutes,
      breakdownMinutes,
      savedAt: lastSavedAt,
    }),
    [
      builderMode,
      scheduleViewMode,
      props.fixedEventId,
      selectedEventId,
      learnerFileName,
      originalUploadedLearners,
      uploadedLearners,
      startTime,
      staffArrivalTime,
      spArrivalTime,
      facultyArrivalTime,
      roomSetupMinutes,
      studentPrebriefMinutes,
      spPrebriefMinutes,
      facultyPrebriefMinutes,
      sessionLengthMinutes,
      roundCount,
      examRoomCount,
      flexRoomCount,
      roomCapacity,
      maxPairsPerFlexRoom,
      encounterMinutes,
      postEncounterBlock,
      postEncounterMinutes,
      dayBlocks,
      manualRoundOverride,
      checklistEnabled,
      checklistMinutes,
      checklistPlacement,
      soapMinutes,
      feedbackMinutes,
      transitionMinutes,
      includeChecklist,
      includeSoap,
      includeFeedback,
      includeDebrief,
      includeBreakdown,
      debriefMinutes,
      breakdownMinutes,
      lastSavedAt,
    ]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (props.previewOnly) return;
    if (!storageKey) return;

    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }

    setSaveState("unsaved");
    setSaveErrorMessage("");

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }

    if (hasAuthoritativeScheduleDataRef.current || selectedEventId) {
      return;
    }

    autosaveTimeoutRef.current = window.setTimeout(() => {
      try {
        setSaveState("saving");
        const savedAt = new Date().toISOString();
        const payload = {
          ...draftSnapshot,
          savedAt,
        };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
        setLastSavedAt(savedAt);
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        setSaveErrorMessage(error instanceof Error ? error.message : "Could not save this builder draft.");
      }
    }, 700);

    return () => {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [draftSnapshot, props.previewOnly, selectedEventId, storageKey]);

  const resolvedSelectedEventId = props.fixedEventId || selectedEventId || "";
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === resolvedSelectedEventId) || null,
    [events, resolvedSelectedEventId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (props.previewOnly || !resolvedSelectedEventId) return;

    const route = `/events/${encodeURIComponent(resolvedSelectedEventId)}/schedule-builder`;
    const eventDate = normalizeDisplayText(selectedEvent?.date_text);
    const dateText = eventDate;
    const resumeEntry = {
      eventId: resolvedSelectedEventId,
      eventName: normalizeDisplayText(selectedEvent?.name) || "Untitled Event",
      route,
      label: "Schedule Builder",
      type: "schedule-builder" as const,
      eventDate,
      dateText: dateText || eventDate,
      timestamp: new Date().toISOString(),
    };

    try {
      const parsed = JSON.parse(window.localStorage.getItem(RESUME_WORK_STORAGE_KEY) || "[]");
      const existingEntries = Array.isArray(parsed) ? parsed : [];
      const dedupedEntries = existingEntries.filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        const record = entry as { eventId?: unknown; route?: unknown };
        return `${normalizeDisplayText(record.eventId)}:${normalizeDisplayText(record.route)}` !== `${resumeEntry.eventId}:${resumeEntry.route}`;
      });
      window.localStorage.setItem(
        RESUME_WORK_STORAGE_KEY,
        JSON.stringify([resumeEntry, ...dedupedEntries].slice(0, MAX_RESUME_WORK_ITEMS))
      );
    } catch {
      // localStorage may be unavailable in private mode or restricted environments.
    }
  }, [props.previewOnly, resolvedSelectedEventId, selectedEvent?.name, selectedEvent?.date_text]);

  useEffect(() => {
    setLearnerCountOverride(null);
  }, [resolvedSelectedEventId]);

  const selectedEventMetadata = useMemo(
    () => parseEventMetadata(selectedEvent?.notes).training,
    [selectedEvent?.notes]
  );
  const metadataScheduleLearnerRoster = useMemo(
    () => parseScheduleLearnerRosterMetadata(selectedEventMetadata.schedule_learner_roster),
    [selectedEventMetadata.schedule_learner_roster]
  );
  const scheduleSetupTruth = useMemo(
    () => buildScheduleSetupTruth(selectedEvent),
    [selectedEvent]
  );
  const eventSetupDraft = useMemo(
    () => buildScheduleDraftFromSetupTruth(scheduleSetupTruth),
    [scheduleSetupTruth]
  );
  const savedStudentInstructionsConfig = useMemo(
    () => getStudentInstructionsConfigFromMetadata(selectedEventMetadata),
    [selectedEventMetadata]
  );
  const savedFacultySimOpsInstructionsConfig = useMemo(
    () => getFacultySimOpsInstructionsConfigFromMetadata(selectedEventMetadata),
    [selectedEventMetadata]
  );
  const showCopyMessage = useCallback((message: string, tone: "success" | "error" = "success", timeoutMs = 2400) => {
    setCopyMessageTone(tone);
    setCopyMessage(message);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setCopyMessage(""), timeoutMs);
    }
  }, []);
  const scheduleBuilderDaySnapshots = useMemo(
    () => parseScheduleBuilderDays(selectedEventMetadata.schedule_builder_days),
    [selectedEventMetadata.schedule_builder_days]
  );
  const scheduleBuilderEventId = props.fixedEventId || selectedEventId || "";
  const scheduleBuilderDayOptions = useMemo(() => {
    const days = new Set<number>([Math.max(1, scheduleDay)]);
    scheduleBuilderDaySnapshots.forEach((_snapshot, day) => {
      if (Number.isFinite(day) && day > 0) days.add(Math.floor(day));
    });
    return Array.from(days).sort((a, b) => a - b);
  }, [scheduleBuilderDaySnapshots, scheduleDay]);
  const authoritativeScheduleSnapshot = useMemo(() => {
    const completedSnapshot = parseCompletedScheduleBuilderSnapshotFromMetadata(selectedEventMetadata.completed_schedule);
    const serverSnapshotFromDay = scheduleBuilderDaySnapshots.get(scheduleDay) || null;
    const inheritedDaySnapshot =
      scheduleBuilderDaySnapshots.has(scheduleDay - 1) && scheduleDay > 1
        ? scheduleBuilderDaySnapshots.get(scheduleDay - 1) || null
        : null;
    return (
      completedSnapshot ||
      serverSnapshotFromDay ||
      inheritedDaySnapshot ||
      parseScheduleBuilderSnapshot(selectedEventMetadata.schedule_builder_snapshot)
    );
  }, [
    scheduleBuilderDaySnapshots,
    scheduleDay,
    selectedEventMetadata.completed_schedule,
    selectedEventMetadata.schedule_builder_snapshot,
  ]);
  const authoritativeSnapshotCaseDefinitions = useMemo(
    () => normalizeScheduleCaseDefinitions(authoritativeScheduleSnapshot?.scheduleCaseDefinitions),
    [authoritativeScheduleSnapshot?.scheduleCaseDefinitions]
  );
  const authoritativeSnapshotActiveCaseCount = useMemo(
    () =>
      parseNumber(authoritativeScheduleSnapshot?.scheduleActiveCaseCount, 0) ||
      authoritativeSnapshotCaseDefinitions.filter((caseDef) => caseDef.active).length,
    [authoritativeScheduleSnapshot, authoritativeSnapshotCaseDefinitions]
  );
  const authoritativeSnapshotLearnerRoster = useMemo(
    () => normalizeLearnerNames(authoritativeScheduleSnapshot?.scheduleLearnerRoster || []),
    [authoritativeScheduleSnapshot?.scheduleLearnerRoster]
  );
  const authoritativeSnapshotLearnerCount = useMemo(
    () =>
      authoritativeSnapshotLearnerRoster.length ||
      parseNumber(authoritativeScheduleSnapshot?.scheduleLearnerRoster?.length, 0) ||
      0,
    [authoritativeSnapshotLearnerRoster, authoritativeScheduleSnapshot?.scheduleLearnerRoster?.length]
  );
  const authoritativeSnapshotRosterIsExplicit = useMemo(
    () => hasExplicitLearnerRoster(authoritativeSnapshotLearnerRoster),
    [authoritativeSnapshotLearnerRoster]
  );
  const metadataRosterIsExplicit = useMemo(
    () => hasExplicitLearnerRoster(metadataScheduleLearnerRoster),
    [metadataScheduleLearnerRoster]
  );
  const normalizedDraftUploadedLearners = useMemo(() => normalizeLearnerNames(uploadedLearners), [uploadedLearners]);
  const normalizedDraftOriginalLearners = useMemo(
    () => normalizeLearnerNames(originalUploadedLearners),
    [originalUploadedLearners]
  );
  const draftUploadedRosterIsExplicit = useMemo(
    () => hasExplicitLearnerRoster(normalizedDraftUploadedLearners),
    [normalizedDraftUploadedLearners]
  );
  const draftOriginalRosterIsExplicit = useMemo(
    () =>
      !draftUploadedRosterIsExplicit &&
      hasExplicitLearnerRoster(normalizedDraftOriginalLearners),
    [draftUploadedRosterIsExplicit, normalizedDraftOriginalLearners]
  );
  const explicitLearnerRosterFromDraft = useMemo(
    () =>
      draftUploadedRosterIsExplicit
        ? normalizedDraftUploadedLearners
        : draftOriginalRosterIsExplicit
          ? normalizedDraftOriginalLearners
          : [],
    [draftUploadedRosterIsExplicit, draftOriginalRosterIsExplicit, normalizedDraftOriginalLearners, normalizedDraftUploadedLearners]
  );
  const explicitLearnerRoster = useMemo(
    () =>
      explicitLearnerRosterFromDraft.length
        ? explicitLearnerRosterFromDraft
        : authoritativeSnapshotRosterIsExplicit
          ? authoritativeSnapshotLearnerRoster
          : metadataRosterIsExplicit
            ? metadataScheduleLearnerRoster
            : [],
    [authoritativeSnapshotLearnerRoster, authoritativeSnapshotRosterIsExplicit, explicitLearnerRosterFromDraft, metadataRosterIsExplicit, metadataScheduleLearnerRoster]
  );
  const hasActiveExplicitLearnerRoster = explicitLearnerRoster.length > 0;
  const explicitLearnerCount = explicitLearnerRoster.length;
  const draftGeneratedFallbackCount = useMemo(() => {
    if (normalizedDraftUploadedLearners.length > 0 && !draftUploadedRosterIsExplicit) {
      return normalizedDraftUploadedLearners.length;
    }
    if (normalizedDraftOriginalLearners.length > 0 && !draftOriginalRosterIsExplicit) {
      return normalizedDraftOriginalLearners.length;
    }
    return 0;
  }, [draftOriginalRosterIsExplicit, draftUploadedRosterIsExplicit, normalizedDraftOriginalLearners.length, normalizedDraftUploadedLearners.length]);
  const authoritativeGeneratedFallbackCount = useMemo(
    () => (authoritativeSnapshotRosterIsExplicit ? 0 : authoritativeSnapshotLearnerCount),
    [authoritativeSnapshotRosterIsExplicit, authoritativeSnapshotLearnerCount]
  );
  const metadataGeneratedFallbackCount = useMemo(
    () => (metadataRosterIsExplicit ? 0 : metadataScheduleLearnerRoster.length),
    [metadataRosterIsExplicit, metadataScheduleLearnerRoster.length]
  );
  const derivedBaseLearnerCount = useMemo(
    () =>
      Math.max(
        draftGeneratedFallbackCount || authoritativeGeneratedFallbackCount || metadataGeneratedFallbackCount,
        0
      ),
    [
      authoritativeGeneratedFallbackCount,
      draftGeneratedFallbackCount,
      metadataGeneratedFallbackCount,
    ]
  );
  const hasLearnerCountOverride = learnerCountOverride !== null;
  const hasEventSetupLearnerCount = scheduleSetupTruth.studentCount > 0;
  const builderDraftFallbackCount = useMemo(
    () => (hasLearnerCountOverride ? learnerCountOverride : derivedBaseLearnerCount),
    [hasLearnerCountOverride, learnerCountOverride, derivedBaseLearnerCount]
  );
  const fallbackLearnerCount = hasEventSetupLearnerCount
    ? hasLearnerCountOverride
      ? learnerCountOverride
      : scheduleSetupTruth.studentCount
    : hasLearnerCountOverride
      ? learnerCountOverride
      : derivedBaseLearnerCount;
  const activeLearnerCount = hasActiveExplicitLearnerRoster ? explicitLearnerCount : fallbackLearnerCount;
  const activeLearnerSourceIsExplicit = hasActiveExplicitLearnerRoster;
  const activeLearnerSourceIsGenerated = !activeLearnerSourceIsExplicit;
  const activeLearnerRosterSeed = useMemo(
    () =>
      activeLearnerSourceIsExplicit
        ? explicitLearnerRoster
        : buildGeneratedLearnerNames(Math.max(activeLearnerCount, 0)),
    [activeLearnerCount, activeLearnerSourceIsExplicit, explicitLearnerRoster]
  );
  const generatedLearnerCountMismatch = activeLearnerSourceIsGenerated && hasEventSetupLearnerCount && builderDraftFallbackCount > 0 && builderDraftFallbackCount !== scheduleSetupTruth.studentCount;
  const rosterCountMismatch = activeLearnerSourceIsExplicit && hasEventSetupLearnerCount && explicitLearnerCount !== scheduleSetupTruth.studentCount;
  const hasAuthoritativeScheduleData = Boolean(
    authoritativeScheduleSnapshot?.savedAt ||
      authoritativeScheduleSnapshot?.startTime ||
      authoritativeScheduleSnapshot?.resolvedRounds?.length ||
      asText(selectedEventMetadata.schedule_builder_snapshot) ||
      asText(selectedEventMetadata.schedule_builder_days) ||
      asText(selectedEventMetadata.schedule_last_saved_at)
  );
  hasAuthoritativeScheduleDataRef.current = hasAuthoritativeScheduleData;
  const requestScheduleStructureChange = useCallback(
    (action: () => void) => {
      if (!hasAuthoritativeScheduleData || scheduleStructureChangeConfirmedRef.current) {
        action();
        return;
      }
      pendingStructureChangeRef.current = action;
      setStructureChangeDialogOpen(true);
    },
    [hasAuthoritativeScheduleData]
  );

  const cancelScheduleStructureChange = useCallback(() => {
    pendingStructureChangeRef.current = null;
    setStructureChangeDialogOpen(false);
  }, []);

  const continueScheduleStructureChange = useCallback(() => {
    const action = pendingStructureChangeRef.current;
    pendingStructureChangeRef.current = null;
    scheduleStructureChangeConfirmedRef.current = true;
    setStructureChangeDialogOpen(false);
    action?.();
  }, []);
  const buildScheduleBuilderDayHref = useCallback(
    (nextDay: number) => {
      const safeDay = Math.max(1, Math.floor(nextDay));
      if (!scheduleBuilderEventId) return "";

      if (typeof window !== "undefined") {
        const nextUrl = new URL(window.location.href);
        nextUrl.pathname = `/events/${encodeURIComponent(scheduleBuilderEventId)}/schedule-builder`;
        nextUrl.searchParams.set("day", String(safeDay));
        nextUrl.searchParams.set("scheduleDay", String(safeDay));
        nextUrl.searchParams.set("view", scheduleViewMode);
        nextUrl.searchParams.set("preview", previewKind);
        nextUrl.searchParams.delete("previewMode");
        nextUrl.searchParams.delete("downloadMode");
        return `${nextUrl.pathname}${nextUrl.search}`;
      }

      const params = new URLSearchParams();
      params.set("day", String(safeDay));
      params.set("scheduleDay", String(safeDay));
      params.set("view", scheduleViewMode);
      params.set("preview", previewKind);
      return `/events/${encodeURIComponent(scheduleBuilderEventId)}/schedule-builder?${params.toString()}`;
    },
    [previewKind, scheduleBuilderEventId, scheduleViewMode]
  );
  const navigateToScheduleBuilderDay = useCallback(
    (nextDay: number) => {
      const href = buildScheduleBuilderDayHref(nextDay);
      if (!href) return;
      router.push(href);
    },
    [buildScheduleBuilderDayHref, router]
  );
  const saveDraftForScheduleDay = useCallback(
    (nextDay: number, draft: ScheduleBuilderDraft) => {
      if (typeof window === "undefined") return;
      const dayStorageKey = getStorageKey(scheduleBuilderEventId, nextDay, nextDay <= 1);
      if (!dayStorageKey) return;
      window.localStorage.setItem(dayStorageKey, JSON.stringify(draft));
    },
    [scheduleBuilderEventId]
  );

  const persistScheduleWorkflowMetadata = useCallback(
    async (partial: Record<string, string>) => {
      if (!selectedEvent?.id) return false;
      const payload: Record<string, string> = { ...partial };
      const notesWereOversized = hasOversizedScheduleWorkflowMetadata(selectedEvent.notes);
      const buildNotes = (baseNotes: string | null | undefined) =>
        upsertEventMetadata(baseNotes || "", { training: payload });
      const sendNotes = async (notes: string) =>
        fetch(`/api/events/${encodeURIComponent(selectedEvent.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_updates: {
              notes,
            },
          }),
        });

      let nextNotes = buildNotes(selectedEvent.notes);
      let response: Response;
      let repairedLegacyScheduleMetadata = false;
      try {
        response = await sendNotes(nextNotes);
      } catch (error) {
        logScheduleWorkflowSaveFailure("network", error, payload);
        logScheduleTimingDiagnostics("save:network-error", {
          eventId: selectedEvent.id,
          startTime: parseScheduleBuilderSnapshot(payload.schedule_builder_snapshot)?.startTime || "",
        });
        throw error;
      }
      const parseSaveResponse = async (saveResponse: Response) => {
        const contentType = asText(saveResponse.headers.get("content-type")).toLowerCase();
        if (!contentType.includes("application/json")) {
          await saveResponse.text().catch(() => "");
          return {
            body: null as { error?: string; message?: string; event?: Partial<EventRow> | null } | null,
            error: `PATCH /api/events/${selectedEvent.id} HTTP ${saveResponse.status}: non-JSON response.`,
          };
        }
        const parsedBody = (await saveResponse.json().catch(() => null)) as {
          error?: string;
          message?: string;
          event?: Partial<EventRow> | null;
        } | null;
        return {
          body: parsedBody,
          error: parsedBody?.message || parsedBody?.error || `PATCH /api/events/${selectedEvent.id} HTTP ${saveResponse.status}.`,
        };
      };

      const parsedResponse = await parseSaveResponse(response);
      let body = parsedResponse.body as {
        error?: string;
        message?: string;
        event?: Partial<EventRow> | null;
      } | null;
      if (!response.ok) {
        const shouldRetrySanitized =
          response.status === 413 ||
          hasOversizedScheduleWorkflowMetadata(nextNotes) ||
          notesWereOversized;
        if (shouldRetrySanitized) {
          repairedLegacyScheduleMetadata = true;
          nextNotes = buildNotes(sanitizeScheduleWorkflowNotes(selectedEvent.notes));
          response = await sendNotes(nextNotes);
          const retryParsedResponse = await parseSaveResponse(response);
          const retryBody = retryParsedResponse.body;
          if (!response.ok) {
            const retryError = new Error(retryParsedResponse.error || `Could not save schedule workflow state (${response.status}).`);
            logScheduleWorkflowSaveFailure("api-retry", retryError, payload);
            logScheduleTimingDiagnostics("save:retry-failed", {
              eventId: selectedEvent.id,
              status: response.status,
              startTime: parseScheduleBuilderSnapshot(payload.schedule_builder_snapshot)?.startTime || "",
            });
            throw retryError;
          }
          body = retryBody || body;
        } else {
          const error = new Error(parsedResponse.error || `Could not save schedule workflow state (${response.status}).`);
          logScheduleWorkflowSaveFailure("api", error, payload);
          logScheduleTimingDiagnostics("save:api-failed", {
            eventId: selectedEvent.id,
            status: response.status,
            startTime: parseScheduleBuilderSnapshot(payload.schedule_builder_snapshot)?.startTime || "",
          });
          throw error;
        }
      }
      const persistedNotes =
        typeof body?.event?.notes === "string" || body?.event?.notes === null
          ? body.event.notes
          : nextNotes;

      const persistedMetadata = parseEventMetadata(persistedNotes).training;
      if (
        partial.schedule_status &&
        asText(persistedMetadata.schedule_status) !== asText(payload.schedule_status)
      ) {
        const error = new Error("Schedule metadata save did not persist to the event record.");
        logScheduleWorkflowSaveFailure("verification", error, payload);
        throw error;
      }
      if (partial.schedule_learner_roster) {
        const expectedLearners = parseScheduleLearnerRosterMetadata(payload.schedule_learner_roster);
        const persistedLearners = parseScheduleLearnerRosterMetadata(persistedMetadata.schedule_learner_roster);
        if (expectedLearners.length > 0 && persistedLearners.length !== expectedLearners.length) {
          const error = new Error("Learner roster save did not persist to the event record.");
          logScheduleWorkflowSaveFailure("verification-roster", error, payload);
          throw error;
        }
      }
      if (
        partial.schedule_builder_snapshot &&
        asText(persistedMetadata.schedule_builder_snapshot) !== asText(payload.schedule_builder_snapshot)
      ) {
        const error = new Error("Schedule builder snapshot save did not persist to the event record.");
        logScheduleWorkflowSaveFailure("verification-builder-snapshot", error, payload);
        throw error;
      }
      if (
        partial.schedule_builder_days &&
        asText(persistedMetadata.schedule_builder_days) !== asText(payload.schedule_builder_days)
      ) {
        const error = new Error("Schedule builder day snapshots did not persist to the event record.");
        logScheduleWorkflowSaveFailure("verification-builder-days", error, payload);
        throw error;
      }

      const expectedSnapshot = parseScheduleBuilderSnapshot(payload.schedule_builder_snapshot);
      const persistedSnapshot = parseScheduleBuilderSnapshot(persistedMetadata.schedule_builder_snapshot);
      logScheduleTimingDiagnostics("save:success", {
        eventId: selectedEvent.id,
        backendSaveResult: "ok",
        savedScheduleStartTime: expectedSnapshot?.startTime || "",
        persistedScheduleStartTime: persistedSnapshot?.startTime || "",
        repairedLegacyScheduleMetadata,
      });

      if (partial.schedule_builder_snapshot || partial.schedule_builder_days) {
        const persistedDays = parseScheduleBuilderDays(persistedMetadata.schedule_builder_days);
        const persistedDayStartTime =
          Array.from(persistedDays.values())
            .map((snapshot) => asText(snapshot.startTime))
            .find(Boolean) || "";
        const hasPersistedStartTime = asText(persistedSnapshot?.startTime) || persistedDayStartTime;
        if (!hasPersistedStartTime) {
          const error = new Error("Schedule timing save could not be verified after metadata update.");
          logScheduleWorkflowSaveFailure("verification-start-time", error, payload);
          throw error;
        }
      }

      setEvents((current) =>
        current.map((event) =>
          event.id === selectedEvent.id
            ? {
                ...event,
                ...body?.event,
                notes: persistedNotes,
              }
            : event
        )
      );
      if (repairedLegacyScheduleMetadata) {
        repairedLegacyScheduleMetadataRef.current = true;
        showCopyMessage("Cleaned old schedule data and saved.", "success", 3200);
      }
      return true;
    },
    [selectedEvent, showCopyMessage]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey || !selectedEventId) return;

    const hydrationKey = [
      storageKey,
      selectedEvent?.id || "none",
      scheduleDay,
      asText(selectedEventMetadata.schedule_status),
      asText(selectedEventMetadata.completed_schedule).length,
      asText(selectedEventMetadata.schedule_last_saved_at || selectedEventMetadata.schedule_updated_at),
      asText(selectedEventMetadata.schedule_builder_snapshot).length,
      asText(selectedEventMetadata.schedule_builder_days).length,
      asText(selectedEventMetadata.schedule_learner_roster).length,
      asText(selectedEventMetadata.schedule_learner_count),
      asText(selectedEventMetadata.schedule_room_count),
      asText(selectedEventMetadata.schedule_round_count),
      asText(selectedEvent?.notes).length,
      scheduleSetupTruth.studentCount,
      scheduleSetupTruth.roomCount,
      scheduleSetupTruth.roundsNeeded,
      scheduleSetupTruth.startTime,
      scheduleSetupTruth.endTime,
    ].join(":");
    if (hydratedTimePrefillKeyRef.current === hydrationKey) return;

    const completedMetadataSnapshot = parseCompletedScheduleBuilderSnapshotFromMetadata(selectedEventMetadata.completed_schedule);
    const serverSnapshotFromDay = scheduleBuilderDaySnapshots.get(scheduleDay) || null;
    const inheritedDaySnapshot =
      scheduleBuilderDaySnapshots.has(scheduleDay - 1) && scheduleDay > 1
        ? scheduleBuilderDaySnapshots.get(scheduleDay - 1) || null
        : null;
    const fallbackLegacySnapshot = parseScheduleBuilderSnapshot(selectedEventMetadata.schedule_builder_snapshot);
    const metadataDraft = eventSetupDraft || buildScheduleDraftFromMetadata(selectedEventMetadata);
    const serverSnapshot =
      completedMetadataSnapshot ||
      serverSnapshotFromDay ||
      inheritedDaySnapshot ||
      fallbackLegacySnapshot;
    const completedSnapshot =
      completedMetadataSnapshot ||
      (asText(selectedEventMetadata.schedule_status).toLowerCase() === "complete"
        ? serverSnapshot
        : null);
    const serverDraft =
      completedSnapshot ||
      (serverSnapshot && asText(selectedEventMetadata.schedule_status).toLowerCase() === "in_progress"
        ? serverSnapshot
        : null);
    const primaryStorageKey = getStorageKey(props.fixedEventId || selectedEventId || "", scheduleDay, scheduleDay <= 1);
    const legacyStorageKey = getStorageKey(props.fixedEventId || selectedEventId || "", 1, true);
    const savedDraft = props.fixedEventId
      ? null
      : parseSavedDraft(window.localStorage.getItem(storageKey)) ||
        (primaryStorageKey !== legacyStorageKey ? parseSavedDraft(window.localStorage.getItem(legacyStorageKey)) : null);
    const sourceDraft = serverDraft || savedDraft || metadataDraft;
    let nextTimeSource = completedSnapshot
      ? {
          source: "completed_snapshot" as const,
          label: "Using completed schedule snapshot",
          startTime: completedSnapshot.startTime,
          endTime: "",
          sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(completedSnapshot.sessionLengthMinutes),
        }
      : serverDraft
        ? {
            source: "saved_draft" as const,
            label: "Using saved builder draft",
            startTime: serverDraft.startTime,
            endTime: "",
            sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(serverDraft.sessionLengthMinutes),
          }
      : savedDraft
        ? buildTimePrefill(selectedEvent, savedDraft, scheduleSetupTruth)
        : metadataDraft
          ? {
              source: "event_setup" as const,
              label: "Using Event Setup",
              startTime: metadataDraft.startTime,
              endTime: scheduleSetupTruth.endTime,
              sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(metadataDraft.sessionLengthMinutes),
            }
          : buildTimePrefill(selectedEvent, sourceDraft, scheduleSetupTruth);
    const authoritativeStartTime = asText(completedSnapshot?.startTime || serverDraft?.startTime);
    if (authoritativeStartTime && authoritativeStartTime !== nextTimeSource.startTime) {
      logScheduleTimingDiagnostics("load:regression-guard", {
        eventId: selectedEvent?.id || "",
        preservedStartTime: authoritativeStartTime,
        replacedStartTime: nextTimeSource.startTime,
      });
      nextTimeSource = {
        ...nextTimeSource,
        startTime: authoritativeStartTime,
        source: completedSnapshot ? "completed_snapshot" : "saved_draft",
        label: completedSnapshot ? "Using completed schedule snapshot" : "Using saved builder draft",
      };
    }

    if (lockedScheduleSourceRef.current === "completed_snapshot" && nextTimeSource.source !== "completed_snapshot") {
      return;
    }

    hydratedTimePrefillKeyRef.current = hydrationKey;
    skipNextAutosaveRef.current = true;
    // IMPORTANT REGRESSION GUARD:
    // Saved builder draft and completed schedule snapshot are authoritative. Do not rebuild
    // schedule structure from fallback room/learner math when saved schedule metadata exists.
    // Failed saves must not mutate the local saved state.
    if (completedSnapshot) {
      lockedScheduleSourceRef.current = "completed_snapshot";
      lastKnownGoodScheduleSnapshotRef.current = completedSnapshot;
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(completedSnapshot));
        } catch {
          // Browser cache is best-effort; the server snapshot remains authoritative.
        }
      }
      applyDraft(completedSnapshot);
    } else if (serverDraft) {
      lockedScheduleSourceRef.current = "saved_draft";
      lastKnownGoodScheduleSnapshotRef.current = serverDraft;
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(serverDraft));
        } catch {
          // Browser cache is best-effort; the server snapshot remains authoritative.
        }
      }
      applyDraft(serverDraft);
    } else if (savedDraft) {
      lockedScheduleSourceRef.current = "saved_draft";
      applyDraft(savedDraft);
    } else if (metadataDraft) {
      lockedScheduleSourceRef.current = "event_setup";
      applyDraft(metadataDraft);
    } else if (!lockedScheduleSourceRef.current) {
      lockedScheduleSourceRef.current = nextTimeSource.source;
    }
    logScheduleTimingDiagnostics("load:start-time", {
      eventId: selectedEvent?.id || "",
      loadedScheduleStartTime: nextTimeSource.startTime,
      source: getScheduleStartTimeSourceLabel(nextTimeSource.source),
      sourceDetail: nextTimeSource.source,
    });
    setTimeSource(nextTimeSource);
    setStartTime(nextTimeSource.startTime);
    if (nextTimeSource.sessionLengthMinutes !== "0") {
      setSessionLengthMinutes(nextTimeSource.sessionLengthMinutes);
    }
    }, [
      applyDraft,
      selectedEvent,
      selectedEventId,
      props.fixedEventId,
      scheduleBuilderDaySnapshots,
      scheduleDay,
      storageKey,
      selectedEventMetadata,
      selectedEventMetadata.schedule_builder_days,
      selectedEventMetadata.schedule_builder_snapshot,
      selectedEventMetadata.completed_schedule,
      selectedEventMetadata.schedule_learner_count,
      selectedEventMetadata.schedule_learner_roster,
      selectedEventMetadata.schedule_last_saved_at,
      selectedEventMetadata.schedule_room_count,
      selectedEventMetadata.schedule_round_count,
      selectedEventMetadata.schedule_status,
      selectedEventMetadata.schedule_updated_at,
      scheduleSetupTruth,
      eventSetupDraft,
    ]);

  const caseRotationFeatureFlag = useMemo(() => {
    const raw = asText(selectedEventMetadata.case_rotation_required).toLowerCase();
    if (raw === "yes" || raw === "true" || raw === "1") return true;
    if (raw === "no" || raw === "false" || raw === "0") return false;
    return false;
  }, [selectedEventMetadata.case_rotation_required]);
  const configuredCaseCountFromMetadata = parseNumber(selectedEventMetadata.case_count, 0);
  const configuredCaseCount = configuredCaseCountFromMetadata || authoritativeSnapshotActiveCaseCount;
  const scheduleCaseDefinitions = useMemo(
    () => {
      const metadataCases = parseScheduleCaseDefinitions(
        selectedEventMetadata.case_manager_cases || selectedEventMetadata.case_files,
        selectedEventMetadata.case_name
      );
      return metadataCases.length ? metadataCases : authoritativeSnapshotCaseDefinitions;
    },
    [
      authoritativeSnapshotCaseDefinitions,
      selectedEventMetadata.case_files,
      selectedEventMetadata.case_manager_cases,
      selectedEventMetadata.case_name,
    ]
  );
  const activeScheduleCases = useMemo(
    () => scheduleCaseDefinitions.filter((caseDef) => caseDef.active),
    [scheduleCaseDefinitions]
  );
  const scheduleCasesForMath = useMemo(() => {
    if (!multipleCasesEnabled) return [];
    if (activeScheduleCases.length > 0) return activeScheduleCases;
    if (configuredCaseCount > 0) {
      return scheduleCaseDefinitions.slice(0, configuredCaseCount);
    }
    return scheduleCaseDefinitions.slice(0, Math.max(1, scheduleCaseDefinitions.length));
  }, [activeScheduleCases, configuredCaseCount, multipleCasesEnabled, scheduleCaseDefinitions]);
  const parsedScheduleRoomAdjustments = useMemo(
    () => normalizeScheduleRoomAdjustments(parseScheduleRoomAdjustments(selectedEventMetadata.schedule_room_adjustments)),
    [selectedEventMetadata.schedule_room_adjustments]
  );

  useEffect(() => {
    setRoomAdjustments(parsedScheduleRoomAdjustments);
  }, [parsedScheduleRoomAdjustments]);

  useEffect(() => {
    const savedSnapshotRequiresMultipleCases = getScheduleDraftMultipleCaseMode(authoritativeScheduleSnapshot);
    const nextMode = savedSnapshotRequiresMultipleCases || caseRotationFeatureFlag;
    setMultipleCasesEnabled(nextMode);
    setScheduleMathEpoch((current) => current + 1);
  }, [selectedEvent?.id, authoritativeScheduleSnapshot, caseRotationFeatureFlag]);

  const scheduleWorkflowStatus = asText(selectedEventMetadata.schedule_status).toLowerCase();
  const scheduleWorkflowBadgeLabel =
    scheduleWorkflowStatus === "complete"
      ? "Schedule Complete"
      : scheduleWorkflowStatus === "in_progress"
        ? "Schedule In Progress"
        : "Schedule Not Started";
  const explicitEventModality = asText(selectedEventMetadata.modality).toLowerCase();
  const selectedEventModality =
    explicitEventModality === "virtual" || explicitEventModality === "hybrid"
      ? explicitEventModality
      : explicitEventModality === "in_person" || explicitEventModality === "in-person" || explicitEventModality === "in person"
        ? "in_person"
        : hasPhysicalEventLocation(selectedEvent?.location)
          ? "in_person"
          : /\b(virtual|vir|telehealth|breakout|online|remote)\b/.test(
                [selectedEvent?.name, selectedEvent?.location, selectedEvent?.status]
                  .map((value) => asText(value))
                  .join(" ")
                  .toLowerCase()
              )
            ? "virtual"
            : "in_person";
  const isVirtualEvent = selectedEventModality === "virtual";
  const roomNamingContext = useMemo(
    () => ({
      modalityLabel:
        selectedEventModality === "virtual"
          ? "Virtual"
          : selectedEventModality === "hybrid"
            ? "Hybrid"
            : "In-person",
      telehealthOrZoomEnabled:
        selectedEventModality === "virtual" || selectedEventModality === "hybrid",
    }),
    [selectedEventModality]
  );
  const roomLabel = getRoomTypeLabel(roomNamingContext);
  const roomCountLabel =
    roomLabel === "Breakout Room" ? "Number of breakout rooms" : "Number of exam rooms";
  const roomCapacityLabel =
    roomLabel === "Breakout Room" ? "Students per breakout room" : "Students per room";

  const parsedStartMinutes = toMinutes(startTime);
  const parsedReferenceEndMinutes = toMinutes(timeSource.endTime);
  const normalizedReferenceEndMinutes =
    parsedStartMinutes !== null
      ? normalizeEndMinutesForRange(parsedStartMinutes, parsedReferenceEndMinutes)
      : null;
  const parsedRounds = parseNumber(roundCount, 4);
  const parsedExamRooms = parseNumber(examRoomCount, 4);
  const parsedRoomCapacity = Math.max(1, parseNumber(roomCapacity, 1));
  const parsedFlexRooms = parseNumber(flexRoomCount, 1);
  const parsedMaxPairs = Math.max(1, parseNumber(maxPairsPerFlexRoom, 3));
  const parsedSessionLength = parseNumber(sessionLengthMinutes, 0);
  const parsedEncounter = parseNumber(encounterMinutes, 20);
  const parsedChecklist = parseNumber(checklistMinutes, 0);
  const parsedCoreChecklist = checklistEnabled ? Math.max(0, parsedChecklist) : 0;
  const parsedFeedback = parseNumber(feedbackMinutes, 5);
  const parsedTransition = parseNumber(transitionMinutes, 5);
  const parsedStaffArrival = toMinutes(staffArrivalTime);
  const parsedSpArrival = toMinutes(spArrivalTime);
  const parsedFacultyArrival = toMinutes(facultyArrivalTime);
  const parsedRoomSetup = parseNumber(roomSetupMinutes, 0);
  const parsedStudentPrebrief = parseNumber(studentPrebriefMinutes, 0);
  const parsedSpPrebrief = parseNumber(spPrebriefMinutes, 0);
  const parsedFacultyPrebrief = parseNumber(facultyPrebriefMinutes, 0);
  const effectiveFlexRoomCount = isVirtualEvent ? 0 : parsedFlexRooms;
  const effectiveFlexCapacity = isVirtualEvent ? 0 : parsedMaxPairs;
  const singleCaseMode = !multipleCasesEnabled;
  const scheduleMathFlexRoomCount = singleCaseMode ? 0 : effectiveFlexRoomCount;
  const scheduleMathFlexCapacity = singleCaseMode ? 0 : effectiveFlexCapacity;
  const normalizedDayBlocks = useMemo(
    () =>
      dayBlocks.map((block) =>
        createDayBlock({
          ...block,
          label: asText(block.label) || getDefaultDayBlockLabel(block.type),
          durationMinutes: asText(block.durationMinutes) || "0",
        })
      ),
    [dayBlocks]
  );
  const activeCaseCount = useMemo(() => {
    if (!multipleCasesEnabled) return 0;
    return scheduleCasesForMath.length;
  }, [scheduleCasesForMath, multipleCasesEnabled]);
  const scheduleStructureSignature = useMemo(
    () =>
      buildScheduleStructureSignature({
        startTime,
        sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(sessionLengthMinutes),
        manualRoundOverride,
        roundCount,
        examRoomCount: parsedExamRooms,
        flexRoomCount: scheduleMathFlexRoomCount,
        roomCapacity: parsedRoomCapacity,
        maxPairsPerFlexRoom: scheduleMathFlexCapacity,
        encounterMinutes: parsedEncounter,
        checklistEnabled,
        checklistMinutes: parsedCoreChecklist,
        checklistPlacement,
        feedbackMinutes: parsedFeedback,
        transitionMinutes: parsedTransition,
        dayBlocks: normalizedDayBlocks.map((block) => ({
          type: block.type,
          label: asText(block.label),
          durationMinutes: asText(block.durationMinutes),
          placement: block.placement,
          placementInterval: asText(block.placementInterval),
          specificTime: asText(block.specificTime),
          visibleTo: block.visibleTo,
        })),
        learners: normalizeLearnerNames(activeLearnerRosterSeed),
        multipleCasesEnabled,
        cases: scheduleCasesForMath.map((caseDef) => ({
          id: asText(caseDef.id),
          name: asText(caseDef.name),
          active: caseDef.active !== false,
          roomAssignment: asText(caseDef.roomAssignment),
        })),
        stationStatuses: Array.from(roomAdjustments.roundsByNumber.entries())
          .flatMap(([roundNumber, slots]) =>
            slots.map((slot) => ({
              roundNumber,
              slotIndex: slot.slotIndex,
              stationStatus: normalizeScheduleStationStatus(slot.stationStatus) || "",
              isBackupStation: Boolean(slot.isBackupStation),
            }))
          )
          .filter((slot) => slot.stationStatus || slot.isBackupStation),
      }),
    [
      manualRoundOverride,
      multipleCasesEnabled,
      normalizedDayBlocks,
      checklistEnabled,
      parsedCoreChecklist,
      checklistPlacement,
      parsedEncounter,
      parsedExamRooms,
      parsedFeedback,
      parsedRoomCapacity,
      parsedTransition,
      roomAdjustments,
      roundCount,
      scheduleCasesForMath,
      scheduleMathFlexCapacity,
      scheduleMathFlexRoomCount,
      sessionLengthMinutes,
      startTime,
      activeLearnerRosterSeed,
    ]
  );
  const singleCaseSlotsPerRound = Math.max(parsedExamRooms * parsedRoomCapacity, 1);
  const singleCaseDefinitionName = useMemo(
    () =>
      asText(scheduleCaseDefinitions[0]?.name) ||
      asText(selectedEventMetadata.case_name) ||
      getCaseLabelFromBuilderEvent(selectedEvent, selectedEventMetadata.case_name),
    [selectedEvent, selectedEventMetadata.case_name, scheduleCaseDefinitions]
  );
  const scheduleCasesForGeneration = useMemo(() => {
    if (multipleCasesEnabled) return scheduleCasesForMath;
    const caseCount = Math.max(parsedExamRooms, 0);
    if (caseCount <= 0) return [];
    const label = singleCaseDefinitionName || "Case 1";
    const template = scheduleCaseDefinitions[0] || {
      id: "single-case-template",
      name: label,
      active: true,
    };
    return Array.from({ length: caseCount }, (_, index) => ({
      ...template,
      id: `${template.id}-room-${index + 1}`,
      name: template.name || label,
      roomAssignment: `Exam ${index + 1}`,
      active: true,
    }));
  }, [multipleCasesEnabled, parsedExamRooms, scheduleCasesForMath, scheduleCaseDefinitions, singleCaseDefinitionName]);
  const handleRebuildScheduleMath = useCallback(() => {
    setPersistedResolvedRounds([]);
    setPersistedResolvedRoundTargetCount(0);
    setScheduleMathEpoch((current) => current + 1);
    setSelectedBuilderRound(null);
    setSaveState("unsaved");
    showCopyMessage("Invalid generated schedule detected. Please rebuild schedule math.", "success", 3200);
  }, [showCopyMessage]);
  const activeCaseRoomCount = parsedExamRooms;
  const isSingleCaseMode = !multipleCasesEnabled;
  const activeCaseDisplayCount = isSingleCaseMode ? 1 : activeCaseCount;
  const configuredFlexRoomCountForDisplay = scheduleMathFlexRoomCount;
  const singleCaseRoundCapacity = parsedExamRooms * parsedRoomCapacity;
  const slotsPerRound = (activeCaseCount ? activeCaseRoomCount : parsedExamRooms) * parsedRoomCapacity || singleCaseRoundCapacity;
  const totalRoomCount = parsedExamRooms + scheduleMathFlexRoomCount;
  const effectiveLearnerInputCount = activeLearnerCount;
  const builderLearnerGroups = useMemo(
    () => buildLearnerGroups(activeLearnerRosterSeed, parsedRoomCapacity),
    [activeLearnerRosterSeed, parsedRoomCapacity]
  );
  const caseRotationRoundCount =
    multipleCasesEnabled && activeCaseCount > 1
      ? Math.max(activeCaseCount, Math.ceil(effectiveLearnerInputCount / Math.max(slotsPerRound, 1)), 1)
      : 0;
  const autoCalculatedRounds =
    caseRotationRoundCount > 0
      ? caseRotationRoundCount
      : effectiveLearnerInputCount && slotsPerRound > 0
      ? Math.max(1, Math.ceil(effectiveLearnerInputCount / slotsPerRound))
      : Math.max(parsedRounds, 1);
  const expectedSingleCaseRounds = useMemo(
    () => (multipleCasesEnabled || parsedRoomCapacity <= 0 ? null : Math.max(1, Math.ceil(effectiveLearnerInputCount / singleCaseSlotsPerRound))),
    [effectiveLearnerInputCount, multipleCasesEnabled, parsedRoomCapacity, singleCaseSlotsPerRound]
  );
  const singleCaseRoundCountCorrupted =
    !multipleCasesEnabled && manualRoundOverride && expectedSingleCaseRounds && parsedRounds > Math.max(1, expectedSingleCaseRounds * 2);
  useEffect(() => {
    if (!singleCaseRoundCountCorrupted) return;
    setManualRoundOverride(false);
    setRoundCount(String(expectedSingleCaseRounds || Math.max(1, parsedRounds)));
    setSaveState("unsaved");
    setScheduleMathEpoch((current) => current + 1);
    showCopyMessage(
      `Invalid single-case round count detected. Regenerated to ${expectedSingleCaseRounds} rounds from learner/room math.`,
      "success",
      3200
    );
  }, [
    expectedSingleCaseRounds,
    manualRoundOverride,
    multipleCasesEnabled,
    parsedRounds,
    singleCaseRoundCountCorrupted,
    showCopyMessage,
  ]);
  const manualRoundOverrideApplies =
    builderMode === "advanced" && manualRoundOverride && caseRotationRoundCount <= 0;
  const effectiveRoundCount =
    manualRoundOverrideApplies
      ? Math.max(parsedRounds, 1)
      : autoCalculatedRounds;
  const persistedResolvedRoundTarget = persistedResolvedRounds.length
    ? Math.max(persistedResolvedRoundTargetCount || 0, persistedResolvedRounds.length)
    : 0;
  const persistedRoundCountMatches =
    manualRoundOverrideApplies ||
    !persistedResolvedRounds.length ||
    persistedResolvedRoundTarget === effectiveRoundCount;
  const canReusePersistedResolvedRounds =
    Boolean(persistedResolvedRounds.length) &&
    Boolean(persistedScheduleStructureSignature) &&
    persistedScheduleStructureSignature === scheduleStructureSignature &&
    persistedRoundCountMatches;
  const reusablePersistedResolvedRounds = useMemo(
    () => (canReusePersistedResolvedRounds ? persistedResolvedRounds : []),
    [canReusePersistedResolvedRounds, persistedResolvedRounds]
  );
  const savedSnapshotRoundCount = useMemo(() => {
    if (!authoritativeScheduleSnapshot) return 0;
    return (
      parseNumber(authoritativeScheduleSnapshot.scheduleRoundCount, 0) ||
      normalizePersistedScheduleBuilderRounds(authoritativeScheduleSnapshot.resolvedRounds).length ||
      parseNumber(authoritativeScheduleSnapshot.roundCount, 0)
    );
  }, [authoritativeScheduleSnapshot]);
  const eventSetupRoundCount = eventSetupDraft
    ? parseNumber(eventSetupDraft.roundCount, 0) || scheduleSetupTruth.roundsNeeded
    : scheduleSetupTruth.roundsNeeded;
  const eventSetupDraftConflictMessage =
    savedSnapshotRoundCount > 0 &&
    eventSetupRoundCount > 0 &&
    savedSnapshotRoundCount !== eventSetupRoundCount &&
    scheduleSetupTruth.hasEventSetupValues &&
    timeSource.source !== "event_setup"
      ? `Saved draft has ${savedSnapshotRoundCount} round${savedSnapshotRoundCount === 1 ? "" : "s"}. Event setup now calculates ${eventSetupRoundCount} round${eventSetupRoundCount === 1 ? "" : "s"}.`
      : "";
  const handleRegenerateFromEventSetup = useCallback(() => {
    if (!eventSetupDraft) return;
    lockedScheduleSourceRef.current = "event_setup";
    lastKnownGoodScheduleSnapshotRef.current = null;
    setPersistedResolvedRounds([]);
    setPersistedResolvedRoundTargetCount(0);
    setPersistedScheduleStructureSignature("");
    setSelectedBuilderRound(null);
    skipNextAutosaveRef.current = true;
    applyDraft(eventSetupDraft);
    setTimeSource({
      source: "event_setup",
      label: "Using Event Setup",
      startTime: eventSetupDraft.startTime,
      endTime: scheduleSetupTruth.endTime,
      sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(eventSetupDraft.sessionLengthMinutes),
    });
    setSaveState("unsaved");
    setScheduleMathEpoch((current) => current + 1);
    showCopyMessage("Regenerated schedule inputs from Event Setup.", "success", 3200);
  }, [applyDraft, eventSetupDraft, scheduleSetupTruth.endTime, showCopyMessage]);
  useEffect(() => {
    if (!persistedResolvedRounds.length) return;
    if (canReusePersistedResolvedRounds) return;
    if (!persistedRoundCountMatches) {
      logScheduleTimingDiagnostics("round-mismatch:discard-saved", {
        message: `Round mismatch: calculated ${effectiveRoundCount}, rendered ${persistedResolvedRoundTarget}`,
        source: "saved snapshot",
        calculatedRequiredRounds: effectiveRoundCount,
        savedRoundTarget: persistedResolvedRoundTarget,
        savedResolvedRounds: persistedResolvedRounds.length,
        manualOverride: manualRoundOverrideApplies,
      });
    }
    setPersistedResolvedRounds([]);
    setPersistedResolvedRoundTargetCount(0);
  }, [
    canReusePersistedResolvedRounds,
    effectiveRoundCount,
    manualRoundOverrideApplies,
    persistedResolvedRoundTarget,
    persistedRoundCountMatches,
    persistedResolvedRounds.length,
  ]);
  const timingVisibility: ScheduleTimingVisibility = "all";
  const { beforeRotationDayBlocks, afterRotationDayBlocks, specificTimeDayBlocks } = useMemo(
    () => getTimingDayBlocksByVisibility(normalizedDayBlocks, timingVisibility),
    [normalizedDayBlocks, timingVisibility]
  );
  const scheduleExtensionBlockLabels = useMemo(() => {
    const labels = normalizedDayBlocks
      .filter((block) => shouldTimingBlockApply(block, timingVisibility))
      .filter((block) => parseNumber(block.durationMinutes, 0) > 0)
      .map((block) => {
        const defaultLabel = getDefaultDayBlockLabel(block.type).toLowerCase();
        const customLabel = asText(block.label).toLowerCase();
        return customLabel || defaultLabel;
      })
      .filter(Boolean);

    return Array.from(new Set(labels));
  }, [normalizedDayBlocks, timingVisibility]);

  const generated = useMemo(() => {
    if (parsedStartMinutes === null) {
    return {
      rounds: [] as GeneratedRound[],
      roundLength: 0,
      configuredLength: 0,
      overrunMinutes: 0,
      rotationStart: 0,
      rotationEnd: 0,
      timeline: [] as TimelineBlock[],
      validation: {
        generated: false,
        expectedRounds: 0,
        generatedRounds: 0,
        generatedMinutes: 0,
        computedEndMinutes: 0,
        stoppedByWindow: false,
        stoppedByRoundLimit: false,
        invalid: false,
        reason: "Start time not available.",
        lastRoundEnd: 0,
      } as RoundGenerationValidation,
    };
  }

    const { rounds, roundLength, configuredLength, overrunMinutes, validation } =
      calculateRoundTimingsWithBlocks({
      startMinutes: parsedStartMinutes + scheduleMathEpoch * 0,
      rounds: effectiveRoundCount,
      sessionLengthMinutes: parsedSessionLength,
      examRoomCount: parsedExamRooms,
      roomNames: scheduleSetupTruth.roomNames,
      examRoomCapacity: parsedRoomCapacity,
      flexRoomCount: scheduleMathFlexRoomCount,
      maxPairsPerFlexRoom: scheduleMathFlexCapacity,
      cases: scheduleCasesForGeneration,
      encounterMinutes: parsedEncounter,
      checklistMinutes: parsedCoreChecklist,
      checklistPlacement,
      feedbackMinutes: parsedFeedback,
      transitionMinutes: parsedTransition,
      facultyPrebriefMinutes,
      dayBlocks: normalizedDayBlocks,
      timingVisibility,
      referenceEndMinutes: normalizedReferenceEndMinutes,
      roundTargetMinutes: parsedSessionLength,
    });
    const { rotationStart, rotationEnd, timeline } = buildScheduleTimeline({
      parsedStartMinutes,
      rounds,
      parsedRoomSetup,
      parsedStaffArrival,
      parsedSpArrival,
      parsedFacultyArrival,
      parsedStudentPrebrief,
      parsedSpPrebrief,
      parsedFacultyPrebrief,
      beforeRotationDayBlocks,
      afterRotationDayBlocks,
      specificTimeDayBlocks,
      referenceEndMinutes: normalizedReferenceEndMinutes,
    });

    return {
      rounds,
      roundLength,
      configuredLength,
      overrunMinutes,
      rotationStart,
      rotationEnd,
      timeline,
      validation,
    };
  }, [
    scheduleCasesForGeneration,
    effectiveRoundCount,
    afterRotationDayBlocks,
    beforeRotationDayBlocks,
    checklistPlacement,
    normalizedDayBlocks,
    parsedCoreChecklist,
    parsedEncounter,
    parsedExamRooms,
    parsedFeedback,
    parsedFacultyArrival,
    parsedFacultyPrebrief,
    facultyPrebriefMinutes,
    scheduleMathFlexCapacity,
    scheduleMathFlexRoomCount,
    parsedRoomCapacity,
    parsedRoomSetup,
    parsedSessionLength,
    parsedSpArrival,
    parsedSpPrebrief,
    parsedStaffArrival,
    parsedStartMinutes,
    parsedStudentPrebrief,
    parsedTransition,
    normalizedReferenceEndMinutes,
    timingVisibility,
    specificTimeDayBlocks,
    scheduleMathEpoch,
    scheduleSetupTruth.roomNames,
  ]);
  useEffect(() => {
    if (!generated.rounds.length) return;
    const regeneratedFrom =
      timeSource.source === "edited"
        ? "user time"
        : timeSource.source === "default"
          ? "fallback default"
          : "builder metadata";
    logScheduleTimingDiagnostics("generation:timing", {
      eventId: selectedEvent?.id || "",
      startTime,
      regeneratedFrom,
      sourceDetail: timeSource.source,
      roundCount: generated.rounds.length,
    });
  }, [generated.rounds.length, selectedEvent?.id, startTime, timeSource.source]);
  const scheduleOverrunAdvisory = useMemo(() => {
    if (!(parsedSessionLength > 0 && generated.overrunMinutes > 0)) return "";

    const blockSummary = scheduleExtensionBlockLabels.length
      ? `${formatOperationalList(scheduleExtensionBlockLabels)} block${
          scheduleExtensionBlockLabels.length === 1 ? "" : "s"
        }`
      : "configured timing blocks";

    return `Configured round blocks exceed the manual round target by ${generated.overrunMinutes} minute${
      generated.overrunMinutes === 1 ? "" : "s"
    }. ${blockSummary} are preserved, but the builder no longer pads rounds with extra unused time.`;
  }, [generated.overrunMinutes, parsedSessionLength, scheduleExtensionBlockLabels]);
  const absurdRoundLengthAdvisory = useMemo(() => {
    if (!generated.configuredLength || generated.configuredLength <= MAX_OPERATIONAL_ROUND_MINUTES) return "";
    return `Round timing is unusually long at ${generated.configuredLength} minutes. Check encounter and recurring block durations; imported event windows are not used as per-round duration.`;
  }, [generated.configuredLength]);
  const timingValidationMessages = useMemo(() => {
    const messages: string[] = [];
    if (generated.validation.invalid) {
      const details = generated.validation.reason ? ` ${generated.validation.reason}` : "";
      messages.push(
        `Schedule generation failed — invalid timing expansion detected.${details} Rebuild schedule math to refresh from current config.`
      );
    }
    if (asText(startTime) && parsedStartMinutes === null) {
      messages.push("Start time could not be read. The builder will wait for a valid time before generating rounds.");
    }
    if (parsedEncounter !== sanitizeEncounterMinutes(parsedEncounter)) {
      messages.push(`Encounter duration is outside the operational range; using ${DEFAULT_ENCOUNTER_MINUTES} minutes for generated rounds.`);
    }
    if (parsedSessionLength > MAX_IMPORTED_ROUND_TARGET_MINUTES) {
      messages.push(`Round target ${parsedSessionLength} minutes is ignored to prevent inflated round blocks.`);
    }
    if (activeCaseCount > parsedExamRooms && parsedExamRooms > 0) {
      messages.push(`${activeCaseCount} active cases exceed ${parsedExamRooms} exam rooms. Add rooms, deactivate cases, or expect a case/room capacity conflict.`);
    }
    if (asText(timeSource.endTime) && parsedReferenceEndMinutes === null) {
      messages.push("Reference event end time could not be read; generated rounds will use configured block durations only.");
    }
    if (
      parsedStartMinutes !== null &&
      normalizedReferenceEndMinutes !== null &&
      normalizedReferenceEndMinutes - parsedStartMinutes > 16 * 60
    ) {
      messages.push("Reference event window is unusually long; verify the imported start/end times before exporting.");
    }
    const ignoredRecurringBlocks = normalizedDayBlocks.filter((block) => {
      const duration = parseNumber(block.durationMinutes, 0);
      return (
        duration > MAX_RECURRING_BLOCK_MINUTES &&
        (block.placement === "after_each_rotation" || block.placement === "after_every_x_rotations") &&
        shouldTimingBlockApply(block, timingVisibility)
      );
    });
    if (ignoredRecurringBlocks.length) {
      messages.push(
        `${ignoredRecurringBlocks.length} recurring timing block${ignoredRecurringBlocks.length === 1 ? "" : "s"} over ${MAX_RECURRING_BLOCK_MINUTES} minutes ignored.`
      );
    }
    return messages;
  }, [
    normalizedDayBlocks,
    activeCaseCount,
    normalizedReferenceEndMinutes,
    parsedEncounter,
    parsedExamRooms,
    parsedReferenceEndMinutes,
    parsedSessionLength,
    parsedStartMinutes,
    startTime,
    timeSource.endTime,
    timingVisibility,
    generated.validation.invalid,
    generated.validation.reason,
  ]);

  const learnerRoster = useMemo(
    () =>
      activeLearnerSourceIsExplicit
        ? normalizeLearnerNames(activeLearnerRosterSeed)
        : buildLearnerRoster([], Math.max(slotsPerRound, 1), Math.max(generated.rounds.length, 1), activeLearnerCount),
    [activeLearnerCount, activeLearnerRosterSeed, activeLearnerSourceIsExplicit, generated.rounds.length, slotsPerRound]
  );
  const savedRealLearnerCount = useMemo(
    () => countRealLearnerNames(parseScheduleLearnerRosterMetadata(selectedEventMetadata.schedule_learner_roster)),
    [selectedEventMetadata.schedule_learner_roster]
  );
  const activeRealLearnerCount = countRealLearnerNames(explicitLearnerRoster);
  const studentListFacultyEmails = useMemo(
    () => extractStudentListFacultyEmails(selectedEventMetadata.faculty_email),
    [selectedEventMetadata.faculty_email]
  );
  const studentListRequestDraftedAt = asText(selectedEventMetadata.student_list_request_drafted_at);
  const studentListRequestStatusLabel =
    activeRealLearnerCount > 0 || savedRealLearnerCount > 0
      ? "Learner roster available"
      : studentListRequestDraftedAt
        ? "Student list requested"
        : "Learner roster needed";
  const studentListRequestDraftedLabel = useMemo(() => {
    if (!studentListRequestDraftedAt) return "";
    const parsed = new Date(studentListRequestDraftedAt);
    if (Number.isNaN(parsed.getTime())) return studentListRequestDraftedAt;
    return parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }, [studentListRequestDraftedAt]);
  const buildPersistedScheduleSnapshot = useCallback(
    (now: string, statusOverride?: "complete" | "in_progress") => {
      const nextStatus = statusOverride || (scheduleWorkflowStatus === "complete" ? "complete" : "in_progress");
      const resolvedAssignedNames = selectedEvent ? getAssignedNames(selectedEvent) : [];
      const generatedAssignedNamesForSnapshot = hasAuthoritativeScheduleData ? [] : resolvedAssignedNames;
      const scheduleCaseDefinitionsForSnapshot =
        scheduleCaseDefinitions.length ? scheduleCaseDefinitions : scheduleCasesForMath;
      const shouldReusePersistedRounds =
        reusablePersistedResolvedRounds.length > 0 &&
        (nextStatus !== "complete" || reusablePersistedResolvedRounds.length === effectiveRoundCount);
      const sanitizedPersistedResolvedRounds = shouldReusePersistedRounds
        ? sanitizePersistedScheduleBuilderRounds(
            reusablePersistedResolvedRounds,
            roomAdjustments,
            scheduleCaseDefinitionsForSnapshot
          )
        : [];
      const resolvedRounds = shouldReusePersistedRounds
        ? normalizePersistedScheduleBuilderRounds(
            getSchedulePreviewRounds({
              resolvedRounds: sanitizedPersistedResolvedRounds,
              scheduleRoundCount:
                nextStatus === "complete"
                  ? effectiveRoundCount
                  : Math.max(persistedResolvedRoundTargetCount, effectiveRoundCount),
            })
          )
	        : buildPersistedScheduleBuilderRounds(
            applyScheduleRoomAdjustments(
              assignUniquePrimarySpIndexes(
                attachLearners(
                  generated.rounds,
                  learnerRoster,
                  parsedRoomCapacity,
                  activeCaseCount,
                  multipleCasesEnabled,
                  isVirtualEvent
                ),
                generatedAssignedNamesForSnapshot,
                !multipleCasesEnabled
              ),
              generatedAssignedNamesForSnapshot,
              roomAdjustments,
              { protectCompletedScheduleAssignments: nextStatus === "complete" || hasAuthoritativeScheduleData }
            ),
            generatedAssignedNamesForSnapshot,
            selectedEvent?.earliest_session_date || selectedEvent?.date_text || ""
          );
      const normalizedResolvedRounds = resolvedRounds.map((round) => ({
        ...round,
        roomSlots: round.roomSlots.map((slot) => ({ ...slot })),
      }));
      const resolvedRoomCount = normalizedResolvedRounds.reduce((maxCount, round) => Math.max(maxCount, round.roomSlots.length), 0);
      const resolvedLearnerRoster = activeLearnerSourceIsExplicit
        ? explicitLearnerRoster
        : learnerRoster;

      return {
        ...draftSnapshot,
        savedAt: now,
        snapshotVersion: 2 as const,
        scheduleStatus: nextStatus,
        scheduleRoundCount: normalizedResolvedRounds.length || effectiveRoundCount,
        scheduleRoomCount: resolvedRoomCount || totalRoomCount,
        scheduleRoomCapacity: parsedRoomCapacity,
        scheduleLearnerRoster: resolvedLearnerRoster,
        multipleCasesEnabled,
        scheduleCaseDefinitions: scheduleCaseDefinitionsForSnapshot,
        scheduleActiveCaseCount: multipleCasesEnabled
          ? Math.max(
              activeCaseCount,
              scheduleCaseDefinitionsForSnapshot.filter((caseDef) => caseDef.active).length
            )
          : 1,
        scheduleFlexRoomCount: multipleCasesEnabled ? configuredFlexRoomCountForDisplay : 0,
        caseRotationRequired: multipleCasesEnabled,
        eventDate: asText(selectedEvent?.earliest_session_date) || asText(selectedEvent?.date_text),
        scheduleStructureSignature,
        resolvedRounds: normalizedResolvedRounds,
      } satisfies PersistedScheduleBuilderSnapshot;
    },
    [
      activeCaseCount,
      configuredFlexRoomCountForDisplay,
      draftSnapshot,
      effectiveRoundCount,
      generated.rounds,
      hasAuthoritativeScheduleData,
      isVirtualEvent,
      learnerRoster,
      multipleCasesEnabled,
      parsedRoomCapacity,
      persistedResolvedRoundTargetCount,
      reusablePersistedResolvedRounds,
      roomAdjustments,
      scheduleCaseDefinitions,
      scheduleCasesForMath,
      scheduleWorkflowStatus,
      scheduleStructureSignature,
      selectedEvent,
      totalRoomCount,
      activeLearnerSourceIsExplicit,
      explicitLearnerRoster,
    ]
  );
  const buildScheduleWorkflowPartial = useCallback(
    (
      now: string,
      statusOverride?: "complete" | "in_progress",
      snapshotOverride?: PersistedScheduleBuilderSnapshot
    ) => {
      const persistedSnapshot = snapshotOverride || buildPersistedScheduleSnapshot(now, statusOverride);
      const nextStatus = persistedSnapshot.scheduleStatus;
      const nextDaySnapshots = new Map(scheduleBuilderDaySnapshots);
      nextDaySnapshots.set(scheduleDay, persistedSnapshot);
      const currentDaySnapshot = nextDaySnapshots.get(scheduleDay) || persistedSnapshot;
      const encodedSnapshot = encodeScheduleBuilderSnapshot(currentDaySnapshot);
      const serializedDaySnapshots = serializeScheduleBuilderDays(nextDaySnapshots);
      const normalizedCaseDefinitions = persistedSnapshot.scheduleCaseDefinitions.length
        ? persistedSnapshot.scheduleCaseDefinitions
        : scheduleCaseDefinitions;
      const serializedCases = serializeScheduleCaseDefinitions(normalizedCaseDefinitions);
      // IMPORTANT REGRESSION GUARD:
      // Saved builder draft and completed schedule snapshot are authoritative. Do not rebuild
      // schedule structure from fallback room/learner math when saved schedule metadata exists.
      // Failed saves must not mutate the local saved state.
      return {
        schedule_status: nextStatus,
        rotation_schedule_status: nextStatus === "complete" ? "complete" : "built",
        schedule_started_at: selectedEventMetadata.schedule_started_at || now,
        schedule_last_saved_at: now,
        schedule_updated_at: now,
        schedule_learner_count: String(persistedSnapshot.scheduleLearnerRoster.length),
        schedule_room_count: String(persistedSnapshot.scheduleRoomCount),
        schedule_round_count: String(persistedSnapshot.scheduleRoundCount),
        schedule_room_capacity: String(persistedSnapshot.scheduleRoomCapacity),
        schedule_encounter_minutes: asText(persistedSnapshot.encounterMinutes),
        schedule_checklist_enabled: persistedSnapshot.checklistEnabled ? "yes" : "no",
        schedule_checklist_minutes: persistedSnapshot.checklistEnabled ? asText(persistedSnapshot.checklistMinutes) : "0",
        schedule_checklist_placement: normalizeChecklistPlacement(persistedSnapshot.checklistPlacement),
        schedule_feedback_minutes: asText(persistedSnapshot.feedbackMinutes),
        schedule_transition_minutes: asText(persistedSnapshot.transitionMinutes),
        schedule_flex_capacity: asText(persistedSnapshot.maxPairsPerFlexRoom),
        schedule_faculty_prebrief_minutes: asText(persistedSnapshot.facultyPrebriefMinutes),
        schedule_round_target_minutes: sanitizeSavedRoundTargetMinutes(persistedSnapshot.sessionLengthMinutes),
        schedule_structure_signature: persistedSnapshot.scheduleStructureSignature,
        schedule_learner_roster: serializeScheduleLearnerRosterMetadata(
          activeLearnerSourceIsExplicit ? explicitLearnerRoster : []
        ),
        case_rotation_required: persistedSnapshot.caseRotationRequired ? "yes" : "no",
        case_count: String(Math.max(persistedSnapshot.scheduleActiveCaseCount, normalizedCaseDefinitions.length || 1)),
        case_name: normalizedCaseDefinitions[0]?.name || selectedEventMetadata.case_name || "",
        case_files: serializedCases,
        case_manager_cases: serializedCases,
        case_extra_rooms_mode: selectedEventMetadata.case_extra_rooms_mode || "",
        schedule_builder_snapshot: encodedSnapshot,
        schedule_builder_days: serializedDaySnapshots,
        schedule_preview_enabled_for_sps: selectedEventMetadata.schedule_preview_enabled_for_sps || "no",
      };
    },
    [
      buildPersistedScheduleSnapshot,
      activeLearnerSourceIsExplicit,
      explicitLearnerRoster,
      scheduleBuilderDaySnapshots,
      scheduleDay,
      scheduleCaseDefinitions,
      selectedEventMetadata.case_extra_rooms_mode,
      selectedEventMetadata.case_name,
      selectedEventMetadata.schedule_preview_enabled_for_sps,
      selectedEventMetadata.schedule_started_at,
    ]
  );
  const buildCompletedScheduleMetadataPayload = useCallback(
    (snapshot: PersistedScheduleBuilderSnapshot, payload: { completedAt: string; completedBy: string; }) => {
      const roomNames = Array.from(
        new Set(
          snapshot.resolvedRounds.flatMap((round) =>
            round.roomSlots.map((slot) => asText(slot.roomName).trim()).filter(Boolean)
          )
        )
      );
      const fallbackRoomNames =
        roomNames.length > 0
          ? roomNames
          : Array.from(
              { length: Math.max(snapshot.scheduleRoomCount, 0) },
              (_entry, index) => getRoomDisplayLabelFromIndex("", index, roomNamingContext)
            );
      const lastRound = snapshot.resolvedRounds[snapshot.resolvedRounds.length - 1] || null;

      return {
        status: "complete",
        source: "schedule_builder",
        completed_at: payload.completedAt,
        completed_by: payload.completedBy,
        learner_count: snapshot.scheduleLearnerRoster.length,
        room_count: snapshot.scheduleRoomCount,
        students_per_room: Math.max(snapshot.scheduleRoomCapacity, 1),
        rounds_count: snapshot.resolvedRounds.length || snapshot.scheduleRoundCount,
        room_names: fallbackRoomNames,
        timing: {
          start_time: asText(snapshot.startTime),
          end_time: asText(lastRound?.endTime),
          encounter_minutes: parseNumber(snapshot.encounterMinutes, 0),
          feedback_minutes: parseNumber(snapshot.feedbackMinutes, 0),
          transition_minutes: parseNumber(snapshot.transitionMinutes, 0),
          checklist_minutes: parseNumber(snapshot.checklistMinutes, 0),
          prebrief_minutes: parseNumber(snapshot.facultyPrebriefMinutes, 0),
          round_target_minutes: parseNumber(snapshot.sessionLengthMinutes, 0),
        },
        snapshot,
      };
    },
    [roomNamingContext]
  );
  const handleSaveScheduleChanges = useCallback(async () => {
    if (props.previewOnly || saveState === "saving") return false;
    const now = new Date().toISOString();
    const savedSnapshot = buildPersistedScheduleSnapshot(now);
    const workflowPartial = buildScheduleWorkflowPartial(now, undefined, savedSnapshot);

    if (autosaveTimeoutRef.current) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
    if (workflowSyncTimeoutRef.current) {
      window.clearTimeout(workflowSyncTimeoutRef.current);
      workflowSyncTimeoutRef.current = null;
    }

    setSaveState("saving");
    setSaveErrorMessage("");

    try {
      if (selectedEvent?.id) {
        await persistScheduleWorkflowMetadata(workflowPartial);
      }
      if (typeof window !== "undefined" && storageKey) {
        window.localStorage.setItem(storageKey, JSON.stringify(savedSnapshot));
      }
      lastKnownGoodScheduleSnapshotRef.current = savedSnapshot;
      setPersistedScheduleStructureSignature(savedSnapshot.scheduleStructureSignature);
      skipNextAutosaveRef.current = true;
      setLastSavedAt(now);
      setSaveState("saved");
      const cleanedLegacyMetadata = repairedLegacyScheduleMetadataRef.current;
      repairedLegacyScheduleMetadataRef.current = false;
      showCopyMessage(
        cleanedLegacyMetadata
          ? "Cleaned old schedule data and saved."
          : `Schedule saved ${formatSavedTimestamp(now) || "now"}.`
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save schedule changes.";
      if (typeof window !== "undefined" && storageKey && lastKnownGoodScheduleSnapshotRef.current) {
        window.localStorage.setItem(storageKey, JSON.stringify(lastKnownGoodScheduleSnapshotRef.current));
      }
      setSaveState("error");
      setSaveErrorMessage(message);
      showCopyMessage(message, "error", 3200);
      return false;
    }
  }, [
    buildPersistedScheduleSnapshot,
    buildScheduleWorkflowPartial,
    persistScheduleWorkflowMetadata,
    props.previewOnly,
    saveState,
    selectedEvent?.id,
    showCopyMessage,
    storageKey,
  ]);
  const handleAddScheduleDay = useCallback(async () => {
    if (!scheduleBuilderEventId) return;
    const nextDay = Math.max(scheduleDay, ...scheduleBuilderDayOptions) + 1;
    const now = new Date().toISOString();
    const nextDraft: ScheduleBuilderDraft = {
      ...draftSnapshot,
      selectedEventId: scheduleBuilderEventId,
      savedAt: now,
    };

    try {
      if (autosaveTimeoutRef.current) {
        window.clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
      const saved = await handleSaveScheduleChanges();
      if (!saved) return;
      saveDraftForScheduleDay(nextDay, nextDraft);
      navigateToScheduleBuilderDay(nextDay);
    } catch {
      showCopyMessage("Could not create the next schedule day.", "error", 3200);
    }
  }, [
    draftSnapshot,
    handleSaveScheduleChanges,
    navigateToScheduleBuilderDay,
    saveDraftForScheduleDay,
    scheduleBuilderDayOptions,
    scheduleBuilderEventId,
    scheduleDay,
    showCopyMessage,
  ]);
  const handleSaveBuilderCase = useCallback(
    async (caseIndex: number, partial: Partial<ScheduleCaseDefinition>) => {
      if (!selectedEvent?.id) return;
      const nextCases = scheduleCaseDefinitions.length ? [...scheduleCaseDefinitions] : [];
      while (nextCases.length <= caseIndex) {
        nextCases.push({
          id: `builder-case-${Date.now()}-${nextCases.length}`,
          name: `Case ${nextCases.length + 1}`,
          active: true,
        });
      }
      nextCases[caseIndex] = {
        ...nextCases[caseIndex],
        ...partial,
        active: partial.active ?? nextCases[caseIndex].active,
      };
      const serialized = serializeScheduleCaseDefinitions(nextCases);
      setSaveState("saving");
      setSaveErrorMessage("");
      try {
        const nextCaseRotationRequired = multipleCasesEnabled;
        await persistScheduleWorkflowMetadata({
          case_rotation_required: nextCaseRotationRequired ? "yes" : "no",
          case_count: String(nextCases.length),
          case_name: nextCases[0]?.name || "",
          case_files: serialized,
          case_manager_cases: serialized,
        });
        setSaveState("saved");
        skipNextAutosaveRef.current = true;
        setLastSavedAt(new Date().toISOString());
        showCopyMessage("Case setup saved.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save case setup.";
        setSaveState("error");
        setSaveErrorMessage(message);
        showCopyMessage(message, "error", 3200);
      }
    },
    [multipleCasesEnabled, persistScheduleWorkflowMetadata, scheduleCaseDefinitions, selectedEvent?.id, showCopyMessage]
  );
  const handleEnsureBuilderCaseCount = useCallback(
    async (value: string) => {
      const count = Math.max(0, Math.min(20, Number.parseInt(value, 10) || 0));
      const saveCaseCount = async () => {
        const nextCases = [...scheduleCaseDefinitions];
        while (nextCases.length < count) {
          nextCases.push({
            id: `builder-case-${Date.now()}-${nextCases.length}`,
            name: `Case ${nextCases.length + 1}`,
            roomAssignment: `Exam ${nextCases.length + 1}`,
            active: true,
          });
        }
        const serialized = serializeScheduleCaseDefinitions(nextCases.slice(0, count));
        setSaveState("saving");
        setSaveErrorMessage("");
        try {
          const nextCaseRotationRequired = multipleCasesEnabled;
          await persistScheduleWorkflowMetadata({
            case_rotation_required: nextCaseRotationRequired ? "yes" : "no",
            case_count: String(count),
            case_name: nextCases[0]?.name || "",
            case_files: serialized,
            case_manager_cases: serialized,
          });
          setSaveState("saved");
          skipNextAutosaveRef.current = true;
          setLastSavedAt(new Date().toISOString());
          showCopyMessage("Case count saved.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "Could not save case count.";
          setSaveState("error");
          setSaveErrorMessage(message);
          showCopyMessage(message, "error", 3200);
        }
      };
      requestScheduleStructureChange(() => {
        void saveCaseCount();
      });
    },
    [multipleCasesEnabled, persistScheduleWorkflowMetadata, requestScheduleStructureChange, scheduleCaseDefinitions, showCopyMessage]
  );
  const handleSaveBuilderCaseList = useCallback(
    async (
      nextCases: ScheduleCaseDefinition[],
      message = "Case setup saved.",
      options?: { caseRotationRequired?: boolean }
    ) => {
      if (!selectedEvent?.id) return false;
      const normalizedCases = nextCases.map((caseDef, index) => ({
        ...caseDef,
        id: caseDef.id || `builder-case-${Date.now()}-${index}`,
        name: asText(caseDef.name) || `Case ${index + 1}`,
        roomAssignment: asText(caseDef.roomAssignment) || `Exam ${index + 1}`,
        active: caseDef.active !== false,
      }));
      const serialized = serializeScheduleCaseDefinitions(normalizedCases);
      setSaveState("saving");
      setSaveErrorMessage("");
      try {
        const nextCaseRotationRequired =
          options?.caseRotationRequired ?? multipleCasesEnabled;
        await persistScheduleWorkflowMetadata({
          case_rotation_required: nextCaseRotationRequired ? "yes" : "no",
          case_count: String(normalizedCases.length),
          case_name: normalizedCases[0]?.name || "",
          case_files: serialized,
          case_manager_cases: serialized,
        });
        setSaveState("saved");
        skipNextAutosaveRef.current = true;
        setLastSavedAt(new Date().toISOString());
        showCopyMessage(message);
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not save case setup.";
        setSaveState("error");
        setSaveErrorMessage(errorMessage);
        showCopyMessage(errorMessage, "error", 3200);
        return false;
      }
    },
    [multipleCasesEnabled, persistScheduleWorkflowMetadata, selectedEvent?.id, showCopyMessage]
  );
  const handleAddBuilderCase = useCallback(() => {
    const nextIndex = scheduleCaseDefinitions.length;
    requestScheduleStructureChange(() => {
      void handleSaveBuilderCaseList(
        [
          ...scheduleCaseDefinitions,
          {
            id: `builder-case-${Date.now()}-${nextIndex}`,
            name: `Case ${nextIndex + 1}`,
            roomAssignment: `Exam ${nextIndex + 1}`,
            active: true,
          },
        ],
        "Case added.",
        { caseRotationRequired: multipleCasesEnabled }
      );
    });
  }, [handleSaveBuilderCaseList, multipleCasesEnabled, requestScheduleStructureChange, scheduleCaseDefinitions]);
  const handleDuplicateBuilderCase = useCallback(
    (caseIndex = Math.max(scheduleCaseDefinitions.length - 1, 0)) => {
      const source = scheduleCaseDefinitions[caseIndex] || scheduleCaseDefinitions[0];
      if (!source) {
        handleAddBuilderCase();
        return;
      }
      const nextIndex = scheduleCaseDefinitions.length;
      requestScheduleStructureChange(() => {
        void handleSaveBuilderCaseList(
          [
            ...scheduleCaseDefinitions,
            {
              ...source,
              id: `builder-case-${Date.now()}-${nextIndex}`,
              name: `${source.name || `Case ${caseIndex + 1}`} Copy`,
              roomAssignment: `Exam ${nextIndex + 1}`,
              active: true,
            },
          ],
          "Case duplicated.",
          { caseRotationRequired: multipleCasesEnabled }
        );
      });
    },
    [handleAddBuilderCase, handleSaveBuilderCaseList, multipleCasesEnabled, requestScheduleStructureChange, scheduleCaseDefinitions]
  );
  const handleRemoveBuilderCase = useCallback(
    (caseIndex = Math.max(scheduleCaseDefinitions.length - 1, 0)) => {
      if (!scheduleCaseDefinitions.length) return;
      const nextCases = scheduleCaseDefinitions.filter((_, index) => index !== caseIndex);
      requestScheduleStructureChange(() => {
        void handleSaveBuilderCaseList(nextCases, "Case removed.", {
          caseRotationRequired: multipleCasesEnabled,
        });
      });
    },
    [handleSaveBuilderCaseList, multipleCasesEnabled, requestScheduleStructureChange, scheduleCaseDefinitions]
  );
  const handleMoveBuilderCase = useCallback(
    (caseIndex: number, direction: -1 | 1) => {
      const targetIndex = caseIndex + direction;
      if (targetIndex < 0 || targetIndex >= scheduleCaseDefinitions.length) return;
      const nextCases = [...scheduleCaseDefinitions];
      [nextCases[caseIndex], nextCases[targetIndex]] = [nextCases[targetIndex], nextCases[caseIndex]];
      requestScheduleStructureChange(() => {
        void handleSaveBuilderCaseList(nextCases, "Case order updated.", {
          caseRotationRequired: multipleCasesEnabled,
        });
      });
    },
    [handleSaveBuilderCaseList, multipleCasesEnabled, requestScheduleStructureChange, scheduleCaseDefinitions]
  );
  const handleMultipleCasesToggle = useCallback(
    (enabled: boolean) => {
      const applyToggle = async () => {
        if (enabled) {
          const base = scheduleCaseDefinitions[0] || {
            id: `builder-case-${Date.now()}-0`,
            name: "Case 1",
            roomAssignment: "Exam 1",
            active: true,
          };
          const nextCases =
            scheduleCaseDefinitions.length > 1
              ? scheduleCaseDefinitions
              : [
                  { ...base, name: base.name || "Case 1", roomAssignment: base.roomAssignment || "Exam 1", active: true },
                  {
                    id: `builder-case-${Date.now()}-1`,
                    name: "Case 2",
                    roomAssignment: "Exam 2",
                    active: true,
                  },
                ];
          const saved = await handleSaveBuilderCaseList(
            nextCases,
            "Multiple-case rotation enabled.",
            { caseRotationRequired: true }
          );
          if (!saved) return;
          setMultipleCasesEnabled(true);
          setScheduleMathEpoch((current) => current + 1);
          return;
        }
        const nextCases = scheduleCaseDefinitions.length
          ? scheduleCaseDefinitions
          : [
              {
                id: `builder-case-${Date.now()}-0`,
                name: "Case 1",
                roomAssignment: "Exam 1",
                active: true,
              },
            ];
        const saved = await handleSaveBuilderCaseList(nextCases, "Single-case student schedule enabled.", {
          caseRotationRequired: false,
        });
        if (!saved) return;
        setMultipleCasesEnabled(false);
        setScheduleMathEpoch((current) => current + 1);
      };
      requestScheduleStructureChange(() => {
        void applyToggle();
      });
    },
    [handleSaveBuilderCaseList, requestScheduleStructureChange, scheduleCaseDefinitions]
  );
  const handleUpdateLearnerAt = useCallback((learnerIndex: number, value: string) => {
    setUploadedLearners((current) => current.map((learner, index) => (index === learnerIndex ? normalizeLearnerName(value) : learner)));
    setSaveState("unsaved");
  }, []);
  const handleRemoveLearnerAt = useCallback((learnerIndex: number) => {
    setUploadedLearners((current) => current.filter((_, index) => index !== learnerIndex));
    setSaveState("unsaved");
  }, []);
  const handleMoveLearnerToGroup = useCallback((learnerIndex: number, targetGroupIndex: number) => {
    requestScheduleStructureChange(() => {
      setUploadedLearners((current) => {
        const next = [...current];
        const [learner] = next.splice(learnerIndex, 1);
        if (!learner) return current;
        const insertIndex = Math.min(next.length, Math.max(0, targetGroupIndex) * Math.max(parsedRoomCapacity, 1));
        next.splice(insertIndex, 0, learner);
        return next;
      });
      setSaveState("unsaved");
    });
  }, [parsedRoomCapacity, requestScheduleStructureChange]);
  const handleCreateLearnerGroup = useCallback(() => {
    requestScheduleStructureChange(() => {
      setUploadedLearners((current) => [
        ...current,
        ...Array.from({ length: Math.max(parsedRoomCapacity, 1) }, (_, index) => `Learner ${current.length + index + 1}`),
      ]);
      setSaveState("unsaved");
    });
  }, [parsedRoomCapacity, requestScheduleStructureChange]);
  const handleDeleteLearnerGroup = useCallback((groupIndex: number) => {
    const groupSize = Math.max(parsedRoomCapacity, 1);
    requestScheduleStructureChange(() => {
      setUploadedLearners((current) =>
        current.filter((_, index) => index < groupIndex * groupSize || index >= (groupIndex + 1) * groupSize)
      );
      setSaveState("unsaved");
    });
  }, [parsedRoomCapacity, requestScheduleStructureChange]);
  const handleSaveCaseStationOverride = useCallback(
    async (caseIndex: number, partial: Partial<ScheduleRoomAdjustmentSlot>) => {
      if (!selectedEvent?.id) return;
      let nextAdjustments = roomAdjustments;
      const roundTotal = Math.max(persistedResolvedRounds.length, generated.rounds.length, effectiveRoundCount, activeCaseCount || 1);
      for (let roundNumber = 1; roundNumber <= roundTotal; roundNumber += 1) {
        nextAdjustments = upsertScheduleRoomAdjustmentSlot(nextAdjustments, roundNumber, caseIndex, partial);
      }
      const normalized = normalizeScheduleRoomAdjustments(nextAdjustments);
      setSaveState("saving");
      try {
        await persistScheduleWorkflowMetadata({
          schedule_room_adjustments: serializeScheduleRoomAdjustments(normalized),
          schedule_updated_at: new Date().toISOString(),
        });
        setRoomAdjustments(normalized);
        setPersistedResolvedRounds([]);
        setPersistedResolvedRoundTargetCount(0);
        setPersistedScheduleStructureSignature("");
        setSaveState("saved");
        skipNextAutosaveRef.current = true;
        setLastSavedAt(new Date().toISOString());
        showCopyMessage("Case station assignment saved.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save case station assignment.";
        setSaveState("error");
        setSaveErrorMessage(message);
        showCopyMessage(message, "error", 3200);
      }
    },
    [activeCaseCount, effectiveRoundCount, generated.rounds.length, persistScheduleWorkflowMetadata, persistedResolvedRounds.length, roomAdjustments, selectedEvent?.id, showCopyMessage]
  );

  // IMPORTANT REGRESSION GUARD:
  // Saved builder draft and completed schedule snapshot are authoritative. Do not rebuild
  // schedule structure from fallback room/learner math when saved schedule metadata exists.
  // Failed saves must not mutate the local saved state. Server persistence only happens
  // through explicit save/complete/case actions so temporary preview recalculation cannot
  // silently overwrite Command Center truth.
  useEffect(() => {
    return () => {
      if (workflowSyncTimeoutRef.current) {
        window.clearTimeout(workflowSyncTimeoutRef.current);
      }
    };
  }, []);

  const assignedNames = useMemo(() => (selectedEvent ? getAssignedNames(selectedEvent) : []), [selectedEvent]);
  const generatedScheduledRounds = useMemo(
    () => {
      const generatedAssignedNames = hasAuthoritativeScheduleData ? [] : assignedNames;
      return applyScheduleRoomAdjustments(
        assignUniquePrimarySpIndexes(
          attachLearners(
            generated.rounds,
            learnerRoster,
            parsedRoomCapacity,
            activeCaseCount,
            multipleCasesEnabled,
            isVirtualEvent
          ),
          generatedAssignedNames,
          !multipleCasesEnabled
        ),
        generatedAssignedNames,
        roomAdjustments,
        { protectCompletedScheduleAssignments: hasAuthoritativeScheduleData }
      );
    },
    [activeCaseCount, assignedNames, generated.rounds, hasAuthoritativeScheduleData, isVirtualEvent, learnerRoster, multipleCasesEnabled, parsedRoomCapacity, roomAdjustments]
  );
  const persistedScheduledRounds = useMemo(
    () => {
      // IMPORTANT REGRESSION GUARD:
      // Do not treat non-empty resolvedRounds as complete. Some persisted
      // snapshots only contain Round 1. Always compare against saved schedule
      // metadata / expected round count before rendering Open Schedule.
      const sanitizedPersistedResolvedRounds = sanitizePersistedScheduleBuilderRounds(
        reusablePersistedResolvedRounds,
        roomAdjustments,
        activeScheduleCases.length ? activeScheduleCases : scheduleCasesForMath
      );
      const expandedPersistedRounds = getSchedulePreviewRounds({
        resolvedRounds: sanitizedPersistedResolvedRounds,
        scheduleRoundCount: persistedResolvedRoundTargetCount,
        rhythmRounds: generatedScheduledRounds.map((round) => ({
          round: round.round,
          start: round.start,
          end: round.end,
          subBlocks: round.subBlocks,
        })),
      });
      const savedRounds = convertPersistedRoundsToScheduledRounds(expandedPersistedRounds, generatedScheduledRounds);
      if (!savedRounds.length) return [];

      const targetCount = Math.max(persistedResolvedRoundTargetCount, savedRounds.length);
      const expandedRounds = savedRounds.length >= targetCount
        ? savedRounds
        : (() => {
            const savedByRound = new Map(savedRounds.map((round) => [round.round, round]));
            const templateRound = savedRounds[savedRounds.length - 1];

            return Array.from({ length: targetCount }, (_, index) => {
              const roundNumber = index + 1;
              return (
                savedByRound.get(roundNumber) ||
                cloneScheduledRoundForNumber(templateRound, roundNumber)
              );
            });
          })();

      return applyScheduleRoomAdjustments(expandedRounds, assignedNames, roomAdjustments, {
        protectCompletedScheduleAssignments: true,
      });
    },
    [activeScheduleCases, assignedNames, generatedScheduledRounds, persistedResolvedRoundTargetCount, reusablePersistedResolvedRounds, roomAdjustments, scheduleCasesForMath]
  );
  const scheduledRounds = useMemo(
    () => {
      if (persistedScheduledRounds.length) {
        return sanitizeScheduledRoundsFromStaleAdjustments(
          persistedScheduledRounds,
          roomAdjustments,
          activeScheduleCases.length ? activeScheduleCases : scheduleCasesForMath
        );
      }
      return generatedScheduledRounds;
    },
    [activeScheduleCases, generatedScheduledRounds, persistedScheduledRounds, roomAdjustments, scheduleCasesForMath]
  );
  const authoritativeScheduleDisplayRounds = useMemo(
    () => applyScheduleDisplaySpFallback(scheduledRounds, assignedNames, !multipleCasesEnabled),
    [assignedNames, multipleCasesEnabled, scheduledRounds]
  );
  const scheduleValidationMessages = useMemo(() => {
    const messages: string[] = [];
	    const groups = buildLearnerGroups(learnerRoster, parsedRoomCapacity);
	    const caseNames = activeScheduleCases.map((caseDef) => caseDef.name).filter(Boolean);
	    const shouldValidateCaseCoverage = activeCaseCount > 1 && groups.length > 0 && caseNames.length > 0;

    const coverageByGroup = new Map<number, Set<string>>();
    if (shouldValidateCaseCoverage) groups.forEach((_, index) => coverageByGroup.set(index, new Set()));
    const learnerToGroup = new Map<string, number>();
    if (shouldValidateCaseCoverage) {
      groups.forEach((group, groupIndex) => {
        group.labels.forEach((label) => learnerToGroup.set(label, groupIndex));
      });
    }

    let maxActiveRoomCount = 0;
    let maxAssignedPrimarySpCount = 0;
    authoritativeScheduleDisplayRounds.forEach((round) => {
      const spRoomsByName = new Map<string, string[]>();
      const backupRoomsByName = new Map<string, string[]>();
      let activeRoomCount = 0;
      round.roomSlots.forEach((slot, slotIndex) => {
        const caseLabel = normalizeDisplayText(slot.caseLabel);
        const isActiveRoom = isActiveScheduleSlot(slot, !multipleCasesEnabled);
        if (isActiveRoom) activeRoomCount += 1;
	        const spName = normalizeDisplayText(slot.assignedSpName);
        const roomLabel = slot.roomName || `Room ${slotIndex + 1}`;
        if (spName && isActiveRoom) {
          const existing = spRoomsByName.get(spName) || [];
          existing.push(roomLabel);
          spRoomsByName.set(spName, existing);
        }
        const backupSpName = normalizeDisplayText(slot.backupSpName);
        if (backupSpName && isActiveRoom) {
          const existing = backupRoomsByName.get(backupSpName) || [];
          existing.push(roomLabel);
          backupRoomsByName.set(backupSpName, existing);
        }
        if (shouldValidateCaseCoverage && caseLabel && slot.learnerLabels.length) {
          const firstLearner = slot.learnerLabels[0];
          const groupIndex = learnerToGroup.get(firstLearner);
          if (groupIndex !== undefined) coverageByGroup.get(groupIndex)?.add(caseLabel);
        }
      });
      spRoomsByName.forEach((rooms, spName) => {
        if (rooms.length > 1) {
          messages.push(`SP conflict detected: ${spName} assigned to ${rooms.join(" and ")} during Round ${round.round}.`);
        }
      });
      backupRoomsByName.forEach((rooms, spName) => {
        if (rooms.length > 1) {
          messages.push(`Backup SP conflict detected: ${spName} assigned to ${rooms.join(" and ")} during Round ${round.round}.`);
        }
      });
      maxActiveRoomCount = Math.max(maxActiveRoomCount, activeRoomCount);
      maxAssignedPrimarySpCount = Math.max(maxAssignedPrimarySpCount, spRoomsByName.size);
    });
    const eventAssignedSpCount = getUniqueAssignedSpIndexPool(assignedNames).length;
    const effectiveAssignedPrimarySpCount = Math.max(maxAssignedPrimarySpCount, Math.min(eventAssignedSpCount, maxActiveRoomCount));
    const spShortageCount = Math.max(maxActiveRoomCount - effectiveAssignedPrimarySpCount, 0);
    if (spShortageCount > 0) {
      messages.push(
        `${spShortageCount} room${spShortageCount === 1 ? "" : "s"} need SP assignment before completion.`
      );
    }

    if (shouldValidateCaseCoverage) {
      let missingCaseCoverageCount = 0;
      const groupsMissingCases: string[] = [];
      coverageByGroup.forEach((seenCases, groupIndex) => {
        const missingCases = caseNames.filter((caseName) => !seenCases.has(caseName));
        if (missingCases.length) {
          missingCaseCoverageCount += 1;
          groupsMissingCases.push(`Group ${groupIndex + 1}`);
        }
      });
      if (missingCaseCoverageCount) {
        messages.push(
          `${missingCaseCoverageCount} learner group${missingCaseCoverageCount === 1 ? "" : "s"} need final case review before completion.`
        );
      }
    }

    const activeCaseRoomCountForSchedule =
      authoritativeScheduleDisplayRounds[0]?.roomSlots.filter((slot) => isActiveScheduleSlot(slot, !multipleCasesEnabled)).length || 0;
    const expectedActiveCaseRoomCount = parsedExamRooms;
    if (activeCaseRoomCountForSchedule !== expectedActiveCaseRoomCount) {
      messages.push("Active case room count does not match the configured active cases and exam rooms.");
    }
    return messages;
  }, [
	    activeCaseCount,
	    activeScheduleCases,
    assignedNames,
	    learnerRoster,
    multipleCasesEnabled,
    parsedExamRooms,
    parsedRoomCapacity,
    authoritativeScheduleDisplayRounds,
  ]);
  const studentPreviewTimeline = useMemo(
    () => filterTimelineForView(generated.timeline, "student"),
    [generated.timeline]
  );
  const operationsPreviewTimeline = useMemo(
    () => filterTimelineForView(generated.timeline, "operations"),
    [generated.timeline]
  );
  const visibleTimeline = useMemo(
    () => (scheduleViewMode === "student" ? studentPreviewTimeline : operationsPreviewTimeline),
    [operationsPreviewTimeline, scheduleViewMode, studentPreviewTimeline]
  );
  const studentRoomSlotIndexes = useMemo(
    () => buildStudentFacingRoomSlotIndexes(authoritativeScheduleDisplayRounds),
    [authoritativeScheduleDisplayRounds]
  );
  const operationsPreviewRounds = useMemo(
    () => filterRoundsForView(authoritativeScheduleDisplayRounds, "operations"),
    [authoritativeScheduleDisplayRounds]
  );
  const operationsScheduleGridRows = useMemo(
    () => buildScheduleGridPreviewRows(operationsPreviewRounds, operationsPreviewTimeline),
    [operationsPreviewRounds, operationsPreviewTimeline]
  );
  const studentPreviewRoundsFromVisibility = useMemo(
    () =>
      alignStudentRoundTimingWithAuthoritativeRounds(
        filterRoundsForView(authoritativeScheduleDisplayRounds, "student", { studentRoomSlotIndexes }),
        operationsPreviewRounds
      ),
    [authoritativeScheduleDisplayRounds, operationsPreviewRounds, studentRoomSlotIndexes]
  );
  const studentPreviewRounds = useMemo(
    () => alignStudentRoundsToAuthoritativeGridRows(studentPreviewRoundsFromVisibility, operationsScheduleGridRows),
    [operationsScheduleGridRows, studentPreviewRoundsFromVisibility]
  );
  const visibleScheduledRounds = useMemo(
    () => (scheduleViewMode === "student" ? studentPreviewRounds : operationsPreviewRounds),
    [operationsPreviewRounds, scheduleViewMode, studentPreviewRounds]
  );
  const studentScheduleGridRows = useMemo(
    () => buildStudentScheduleGridRowsFromAuthoritativeRows(operationsScheduleGridRows, studentPreviewRounds),
    [operationsScheduleGridRows, studentPreviewRounds]
  );
  const compactFlowEntries = useMemo(() => {
    const visibleRows = scheduleViewMode === "student" ? studentScheduleGridRows : operationsScheduleGridRows;
    return visibleRows.map((row) => {
      if (row.kind === "wide") {
        return {
          key: row.key,
          kind: "wide" as const,
          start: row.start,
          end: row.end,
          block: row.block,
        };
      }

      return {
        key: row.key,
        kind: "round" as const,
        start: row.start,
        end: row.end,
        round: row.round,
      };
    });
  }, [operationsScheduleGridRows, scheduleViewMode, studentScheduleGridRows]);
  const scheduleGridRows = useMemo(
    () => (scheduleViewMode === "student" ? studentScheduleGridRows : operationsScheduleGridRows),
    [operationsScheduleGridRows, scheduleViewMode, studentScheduleGridRows]
  );
  const studentScheduleTimingConfig = useMemo(() => {
    const configuredPrebriefMinutes = Number.isFinite(parsedStudentPrebrief) && parsedStudentPrebrief > 0
      ? [Math.floor(parsedStudentPrebrief)]
      : [];
    const cfspEncounterMinutes = normalizeStudentScheduleMinutes(parsedEncounter, 20);
    const cfspChecklistCadenceMinutes = normalizeStudentScheduleMinutes(parsedCoreChecklist, 0);
    const cfspFeedbackMinutes = Math.min(normalizeStudentScheduleMinutes(parsedFeedback, 5), 5);
    const cfspTransitionCadenceMinutes = Math.max(normalizeStudentScheduleMinutes(parsedTransition, 5), 5);
    return normalizeStudentScheduleTimingConfig({
      prebriefMinutes: configuredPrebriefMinutes.length ? Math.max(...configuredPrebriefMinutes) : 0,
      encounterMinutes: cfspEncounterMinutes,
      feedbackMinutes: cfspFeedbackMinutes,
      cadenceMinutes: cfspEncounterMinutes + cfspChecklistCadenceMinutes + cfspFeedbackMinutes + cfspTransitionCadenceMinutes,
    });
  }, [parsedCoreChecklist, parsedEncounter, parsedFeedback, parsedStudentPrebrief, parsedTransition]);
  const adminRoundStartByRound = useMemo(
    () => buildStudentAuthoritativeRoundStartMap(operationsScheduleGridRows, studentScheduleTimingConfig.cadenceMinutes),
    [operationsScheduleGridRows, studentScheduleTimingConfig.cadenceMinutes]
  );
  const getStudentDisplayEncounterStart = useCallback(
    (round: ScheduledRound) => adminRoundStartByRound.get(round.round) ?? round.start,
    [adminRoundStartByRound]
  );
  const getStudentDisplayTiming = useCallback(
    (round: ScheduledRound) => buildStudentScheduleTiming(getStudentDisplayEncounterStart(round), studentScheduleTimingConfig),
    [getStudentDisplayEncounterStart, studentScheduleTimingConfig]
  );
  const selectedBuilderRoundContext = useMemo(
    () =>
      typeof selectedBuilderRound === "number"
        ? visibleScheduledRounds.find((round) => round.round === selectedBuilderRound) || null
        : null,
    [selectedBuilderRound, visibleScheduledRounds]
  );
  const totalScheduleCapacity = Math.max(slotsPerRound, 0) * generated.rounds.length;
  const unplacedLearnerCount =
    effectiveLearnerInputCount > 0 ? Math.max(effectiveLearnerInputCount - totalScheduleCapacity, 0) : 0;

  const selectedEventEncounterLabel = useMemo(
    () => getCaseLabelFromBuilderEvent(selectedEvent, selectedEventMetadata.case_name),
    [selectedEvent, selectedEventMetadata.case_name]
  );
  const previewCaseFallbackLabel = activeCaseCount > 1 ? "" : selectedEventEncounterLabel;
  const previewCaseDocumentLabel = useMemo(() => {
    if (activeCaseCount > 1) return "";
    const selectedCase = activeScheduleCases[0] || scheduleCaseDefinitions[0];
    return normalizeDisplayText(selectedCase?.documentName) || "";
  }, [activeCaseCount, activeScheduleCases, scheduleCaseDefinitions]);
  const rotationEnd = generated.rotationEnd;
  const totalEventEnd = useMemo(() => {
    if (authoritativeScheduleDisplayRounds.length) return authoritativeScheduleDisplayRounds[authoritativeScheduleDisplayRounds.length - 1].end;
    const lastTimeline = generated.timeline[generated.timeline.length - 1];
    return lastTimeline ? lastTimeline.end : rotationEnd;
  }, [authoritativeScheduleDisplayRounds, generated.timeline, rotationEnd]);
  const totalEventDuration = Math.max(totalEventEnd - (authoritativeScheduleDisplayRounds[0]?.start ?? parsedStartMinutes ?? totalEventEnd), 0);
  const estimatedStaffDayLength = useMemo(() => {
    if (!generated.timeline.length) return 0;
    return generated.timeline[generated.timeline.length - 1].end - generated.timeline[0].start;
  }, [generated.timeline]);
  const roomColumns = useMemo(
    () => buildPreviewRoomColumns(operationsPreviewRounds, roomNamingContext),
    [operationsPreviewRounds, roomNamingContext]
  );
  const studentRoomColumns = useMemo(
    () => buildPreviewRoomColumns(authoritativeScheduleDisplayRounds, roomNamingContext, studentRoomSlotIndexes),
    [authoritativeScheduleDisplayRounds, roomNamingContext, studentRoomSlotIndexes]
  );
  const visibleRoomColumns = scheduleViewMode === "student" ? studentRoomColumns : roomColumns;
  const renderedRoundCount = authoritativeScheduleDisplayRounds.length || effectiveRoundCount;
  const renderedRoomCount = visibleRoomColumns.length || totalRoomCount;
  const showStudentTimingInMode = scheduleViewMode === "student" || studentScheduleTimingConfig.prebriefMinutes > 0;
  const roundMismatchSource = manualRoundOverrideApplies
    ? "manual override"
    : persistedScheduledRounds.length
      ? "saved snapshot"
      : "regenerated schedule";
  const roundMismatchMessage =
    renderedRoundCount !== effectiveRoundCount
      ? roundMismatchSource === "saved snapshot"
        ? `Saved draft has ${renderedRoundCount} round${renderedRoundCount === 1 ? "" : "s"}. Event setup now calculates ${effectiveRoundCount} round${effectiveRoundCount === 1 ? "" : "s"}.`
        : `Round mismatch: calculated ${effectiveRoundCount}, rendered ${renderedRoundCount}. Source: ${roundMismatchSource}.`
      : "";
  const learnerCountMismatchMessage = activeLearnerSourceIsExplicit
    ? rosterCountMismatch
      ? `Roster count differs from Event Setup. Event Setup: ${scheduleSetupTruth.studentCount} · Roster: ${explicitLearnerCount}.`
      : ""
    : generatedLearnerCountMismatch
      ? `Learner count differs from Event Setup. Event Setup: ${scheduleSetupTruth.studentCount} · Builder draft: ${builderDraftFallbackCount}.`
      : "";
  useEffect(() => {
    if (!roundMismatchMessage) return;
    logScheduleTimingDiagnostics("round-mismatch:rendered", {
      message: roundMismatchMessage,
      calculatedRequiredRounds: effectiveRoundCount,
      renderedRounds: renderedRoundCount,
      source: roundMismatchSource,
      manualOverride: manualRoundOverrideApplies,
    });
  }, [effectiveRoundCount, manualRoundOverrideApplies, renderedRoundCount, roundMismatchMessage, roundMismatchSource]);
  const learnerCapacitySummary =
    effectiveLearnerInputCount && slotsPerRound > 0
      ? `${effectiveLearnerInputCount} learners • ${totalRoomCount} rooms • ${effectiveRoundCount} rounds required`
      : effectiveLearnerInputCount && slotsPerRound <= 0
        ? `${effectiveLearnerInputCount} learners • configure rooms to calculate rounds`
        : "";
  const coreConfiguredBlockLength = parsedCoreChecklist + parsedEncounter + parsedFeedback + parsedTransition;
  const coreTimingExpression = checklistEnabled
    ? `Core timing total: checklist + encounter + feedback + transition (${parsedCoreChecklist} + ${parsedEncounter} + ${parsedFeedback} + ${parsedTransition} = ${coreConfiguredBlockLength}).`
    : `Core timing total: encounter + feedback + transition (${parsedEncounter} + ${parsedFeedback} + ${parsedTransition} = ${coreConfiguredBlockLength}).`;
  const configuredBlockLengthForDisplay =
    parsedSessionLength > 0
      ? Math.max(generated.configuredLength, parsedSessionLength)
      : generated.configuredLength;
  const configuredBlockLengthDetail =
    parsedSessionLength > 0
      ? `Advanced target active; core timing is ${coreConfiguredBlockLength} minutes.`
      : generated.configuredLength !== coreConfiguredBlockLength
        ? `Includes optional advanced blocks; core timing is ${coreConfiguredBlockLength} minutes.`
        : coreTimingExpression;

  const selectedEventSummaryTime = useMemo(() => {
    if (authoritativeScheduleDisplayRounds.length) {
      return formatRange(authoritativeScheduleDisplayRounds[0].start, authoritativeScheduleDisplayRounds[authoritativeScheduleDisplayRounds.length - 1].end);
    }
    if (parsedStartMinutes === null || !generated.rounds.length) return "";
    return formatRange(parsedStartMinutes, generated.rotationEnd);
  }, [authoritativeScheduleDisplayRounds, generated.rotationEnd, generated.rounds.length, parsedStartMinutes]);
  const schedulePreviews = useMemo(() => {
    const timelinePreview = buildSchedulePreviewData({
      kind: "timeline",
      previewFamily: props.previewFamily,
      event: selectedEvent,
      timeline: operationsPreviewTimeline,
      rounds: operationsPreviewRounds,
      scheduleGridRows: operationsScheduleGridRows,
      roomColumns,
      roomContext: roomNamingContext,
      caseName: previewCaseFallbackLabel,
      caseDocumentLabel: previewCaseDocumentLabel,
      isSingleCaseMode,
      assignedSpNames: assignedNames,
      hasSavedScheduleSlots: persistedScheduledRounds.length > 0,
      learnerCount: learnerRoster.length,
      studentTimingConfig: studentScheduleTimingConfig,
      generated,
      selectedEventSummaryTime,
    });
    const announcementPreview = buildSchedulePreviewData({
      kind: "announcements",
      previewFamily: props.previewFamily,
      event: selectedEvent,
      timeline: operationsPreviewTimeline,
      rounds: operationsPreviewRounds,
      scheduleGridRows: operationsScheduleGridRows,
      roomColumns,
      roomContext: roomNamingContext,
      caseName: previewCaseFallbackLabel,
      caseDocumentLabel: previewCaseDocumentLabel,
      isSingleCaseMode,
      assignedSpNames: assignedNames,
      hasSavedScheduleSlots: persistedScheduledRounds.length > 0,
      learnerCount: learnerRoster.length,
      studentTimingConfig: studentScheduleTimingConfig,
      generated,
      selectedEventSummaryTime,
    });
    const studentPreview = buildSchedulePreviewData({
      kind: "student",
      previewFamily: props.previewFamily,
      event: selectedEvent,
      timeline: operationsPreviewTimeline,
      rounds: operationsPreviewRounds,
      scheduleGridRows: operationsScheduleGridRows,
      roomColumns,
      roomContext: roomNamingContext,
      caseName: previewCaseFallbackLabel,
      caseDocumentLabel: previewCaseDocumentLabel,
	      isSingleCaseMode,
	      assignedSpNames: assignedNames,
	      hasSavedScheduleSlots: persistedScheduledRounds.length > 0,
	      learnerCount: learnerRoster.length,
      studentTimingConfig: studentScheduleTimingConfig,
      generated,
      selectedEventSummaryTime,
    });
    const spPreview = buildSchedulePreviewData({
      kind: "sp",
      previewFamily: props.previewFamily,
      event: selectedEvent,
      timeline: operationsPreviewTimeline,
      rounds: operationsPreviewRounds,
      scheduleGridRows: operationsScheduleGridRows,
      roomColumns,
      roomContext: roomNamingContext,
      caseName: previewCaseFallbackLabel,
      caseDocumentLabel: previewCaseDocumentLabel,
	      isSingleCaseMode,
	      assignedSpNames: assignedNames,
	      hasSavedScheduleSlots: persistedScheduledRounds.length > 0,
	      learnerCount: learnerRoster.length,
      generated,
      selectedEventSummaryTime,
    });
    const operationsPreview = buildSchedulePreviewData({
      kind: "operations",
      previewFamily: props.previewFamily,
      event: selectedEvent,
      timeline: operationsPreviewTimeline,
      rounds: operationsPreviewRounds,
      scheduleGridRows: operationsScheduleGridRows,
      roomColumns,
      roomContext: roomNamingContext,
      caseName: previewCaseFallbackLabel,
      caseDocumentLabel: previewCaseDocumentLabel,
	      isSingleCaseMode,
	      assignedSpNames: assignedNames,
	      hasSavedScheduleSlots: persistedScheduledRounds.length > 0,
	      learnerCount: learnerRoster.length,
      generated,
      selectedEventSummaryTime,
    });
    const rotationPreview = buildSchedulePreviewData({
      kind: "rotation",
      previewFamily: props.previewFamily,
      event: selectedEvent,
      timeline: operationsPreviewTimeline,
      rounds: operationsPreviewRounds,
      scheduleGridRows: operationsScheduleGridRows,
      roomColumns,
      roomContext: roomNamingContext,
      caseName: previewCaseFallbackLabel,
      caseDocumentLabel: previewCaseDocumentLabel,
	      isSingleCaseMode,
	      assignedSpNames: assignedNames,
	      hasSavedScheduleSlots: persistedScheduledRounds.length > 0,
	      learnerCount: learnerRoster.length,
      generated,
      selectedEventSummaryTime,
    });

    return {
      timeline: timelinePreview,
      announcements: announcementPreview,
      student: studentPreview,
      sp: spPreview,
      operations: operationsPreview,
      rotation: rotationPreview,
    };
  }, [
    assignedNames,
    generated,
    learnerRoster.length,
    operationsPreviewRounds,
    operationsPreviewTimeline,
    operationsScheduleGridRows,
    roomNamingContext,
    roomColumns,
	    selectedEvent,
	    persistedScheduledRounds.length,
	    previewCaseFallbackLabel,
    previewCaseDocumentLabel,
    isSingleCaseMode,
    selectedEventSummaryTime,
    studentScheduleTimingConfig,
    props.previewFamily,
  ]);
  const schedulePreview = schedulePreviews[previewKind];
  const compactPrintKind: CompactSchedulePrintKind = previewKind === "student" ? "student" : "operations";
  const compactSchedulePrintHtml = useMemo(() => {
    return buildCompactScheduleExportHtml(schedulePreview.html, compactPrintKind);
  }, [compactPrintKind, schedulePreview.html]);
  const operationsCompactSchedulePrintHtml = useMemo(
    () => buildCompactScheduleExportHtml(schedulePreviews.operations.html, "operations"),
    [schedulePreviews.operations.html]
  );
  const selectedPreviewBaseFileName = getSafeFileName(schedulePreview.title) || "schedule";
  const selectedPreviewExportFileName = `${selectedPreviewBaseFileName}.txt`;
  const selectedPreviewCsvFileName = `${selectedPreviewBaseFileName}.csv`;
  const selectedPreviewHtmlFileName = `${selectedPreviewBaseFileName}-printable.html`;
  const selectedPreviewStyledPdfFileName = previewKind === "student" ? "student-schedule.pdf" : "admin-schedule.pdf";
  const selectedScheduleDateLabel = useMemo(() => {
    const dateSource =
      asText(selectedEvent?.earliest_session_date) ||
      asText(selectedEvent?.date_text);
    if (!dateSource) return "";
    return formatHumanDate(dateSource, getImportedYearHint(selectedEvent?.notes)) || dateSource;
  }, [
    selectedEvent?.date_text,
    selectedEvent?.earliest_session_date,
    selectedEvent?.notes,
  ]);
  const firstStudentEncounterStartMinutes = useMemo(() => {
    return studentPreviewRounds[0]?.start ?? generated.rounds[0]?.start ?? null;
  }, [generated.rounds, studentPreviewRounds]);
  const firstStudentEncounterDurationMinutes = useMemo(() => {
    for (const round of studentPreviewRounds) {
      const encounterBlock = round.subBlocks.find((subBlock) => /^encounter$/i.test(asText(subBlock.label)));
      if (encounterBlock) return Math.max(encounterBlock.end - encounterBlock.start, 0);
    }
    return parsedEncounter;
  }, [parsedEncounter, studentPreviewRounds]);
  const firstFeedbackDurationMinutes = useMemo(() => {
    for (const round of scheduledRounds) {
      const feedbackBlock = round.subBlocks.find((subBlock) => /^feedback$/i.test(asText(subBlock.label)));
      if (feedbackBlock) return Math.max(feedbackBlock.end - feedbackBlock.start, 0);
    }
    return parseNumber(feedbackMinutes, parseNumber(DEFAULT_SCHEDULE_BUILDER_DRAFT.feedbackMinutes, 10));
  }, [feedbackMinutes, scheduledRounds]);
  const studentInstructionsEventName = normalizeDisplayText(selectedEvent?.name);
  const studentInstructionsAccessDetails = useMemo(
    () => {
      const trainingMetadata = parseEventMetadata(selectedEvent?.notes).training;
      return resolveStudentInstructionsAccessDetails({
        configAccess: savedStudentInstructionsConfig?.zoomLink,
        contextAccess: getStudentInstructionsZoomLinkFromBuilderEvent(selectedEvent),
        eventLocation: selectedEvent?.location,
        excludedAccessLinks: [trainingMetadata.zoom_url, trainingMetadata.training_zoom_link]
          .map((value) => asText(value))
          .filter(Boolean),
      });
    },
    [savedStudentInstructionsConfig?.zoomLink, selectedEvent]
  );
  const studentInstructionsResolvedZoomLink = studentInstructionsAccessDetails.zoomLink;
  const studentInstructionsResolvedLocation = studentInstructionsAccessDetails.location;
  const studentInstructionsContextError = useMemo(() => {
    if (!selectedEvent?.id) {
      return "Open this from an event before generating Student Instructions.";
    }
    if (!studentInstructionsEventName) {
      return "This event is missing a title for Student Instructions.";
    }
    if (!selectedScheduleDateLabel) {
      return "This event is missing a student schedule date for Student Instructions.";
    }
    if (!studentInstructionsResolvedZoomLink && !studentInstructionsResolvedLocation) {
      return "Add a Zoom link or location in Student Instructions or event details before generating the packet.";
    }
    return "";
  }, [
    selectedEvent?.id,
    selectedScheduleDateLabel,
    studentInstructionsEventName,
    studentInstructionsResolvedLocation,
    studentInstructionsResolvedZoomLink,
  ]);
  const facultySimOpsEventName = normalizeDisplayText(selectedEvent?.name);
  const facultySimOpsFirstEncounterStartMinutes = useMemo(() => {
    return operationsPreviewRounds[0]?.start ?? authoritativeScheduleDisplayRounds[0]?.start ?? generated.rounds[0]?.start ?? null;
  }, [authoritativeScheduleDisplayRounds, generated.rounds, operationsPreviewRounds]);
  const facultySimOpsPrebriefMinutes = useMemo(() => {
    return Number.isFinite(parsedFacultyPrebrief) && parsedFacultyPrebrief > 0
      ? Math.floor(parsedFacultyPrebrief)
      : 0;
  }, [parsedFacultyPrebrief]);
  const facultySimOpsArrivalLabel = useMemo(() => {
    if (facultySimOpsFirstEncounterStartMinutes === null) return "";
    return toDisplayTime(facultySimOpsFirstEncounterStartMinutes - facultySimOpsPrebriefMinutes);
  }, [facultySimOpsFirstEncounterStartMinutes, facultySimOpsPrebriefMinutes]);
  const facultySimOpsFirstEncounterLabel = useMemo(() => {
    if (facultySimOpsFirstEncounterStartMinutes === null) return "";
    return toDisplayTime(facultySimOpsFirstEncounterStartMinutes);
  }, [facultySimOpsFirstEncounterStartMinutes]);
  const facultySimOpsContextError = useMemo(() => {
    if (!selectedEvent?.id) {
      return "Open this from an event before generating Faculty / SimOps Instructions.";
    }
    if (!facultySimOpsEventName) {
      return "This event is missing a title for Faculty / SimOps Instructions.";
    }
    if (!selectedScheduleDateLabel) {
      return "This event is missing an event date for Faculty / SimOps Instructions.";
    }
    return "";
  }, [facultySimOpsEventName, selectedEvent?.id, selectedScheduleDateLabel]);
  const buildCurrentStudentInstructionsHtml = useCallback((): StudentInstructionsHtmlBuildResult => {
    if (studentInstructionsContextError) {
      return { html: "", ready: false, reason: studentInstructionsContextError };
    }

    try {
      const html = buildStudentInstructionsExportHtml({
        event: selectedEvent,
        programLabel: studentInstructionsEventName,
        dateLabel: selectedScheduleDateLabel,
        zoomLink: studentInstructionsResolvedZoomLink,
        locationLabel: studentInstructionsResolvedLocation,
        instructionsConfig: savedStudentInstructionsConfig,
        encounterMinutes: firstStudentEncounterDurationMinutes,
        feedbackMinutes: firstFeedbackDurationMinutes,
        firstEncounterStartMinutes: firstStudentEncounterStartMinutes,
        studentScheduleRounds: studentPreviewRounds,
        studentScheduleSourceRounds: authoritativeScheduleDisplayRounds,
        roomColumns: studentRoomColumns,
        roomContext: roomNamingContext,
      });
      const validation = validateStudentInstructionsPrintHtml(html);
      if (!validation.ready) {
        return { html: "", ready: false, reason: validation.reason };
      }
      return { html, ready: true, reason: "" };
    } catch (error) {
      return {
        html: "",
        ready: false,
        reason: `Student Instructions HTML builder failed: ${getErrorDetail(error)}`,
        cause: error,
      };
    }
  }, [
    firstFeedbackDurationMinutes,
    firstStudentEncounterStartMinutes,
    firstStudentEncounterDurationMinutes,
    studentRoomColumns,
    roomNamingContext,
    selectedEvent,
    selectedScheduleDateLabel,
    savedStudentInstructionsConfig,
    studentInstructionsContextError,
    studentInstructionsEventName,
    studentInstructionsResolvedLocation,
    studentInstructionsResolvedZoomLink,
    studentPreviewRounds,
    authoritativeScheduleDisplayRounds,
  ]);
  const buildCurrentFacultySimOpsInstructionsHtml = useCallback((): StudentInstructionsHtmlBuildResult => {
    if (facultySimOpsContextError) {
      return { html: "", ready: false, reason: facultySimOpsContextError };
    }

    try {
      const html = buildFacultySimOpsInstructionsExportHtml({
        event: selectedEvent,
        programLabel: facultySimOpsEventName,
        dateLabel: selectedScheduleDateLabel,
        locationLabel: selectedEvent?.location || "",
        instructionsConfig: savedFacultySimOpsInstructionsConfig,
        arrivalTimeLabel: facultySimOpsArrivalLabel,
        firstEncounterTimeLabel: facultySimOpsFirstEncounterLabel,
        roundCount: authoritativeScheduleDisplayRounds.length || effectiveRoundCount,
        roomCount: roomColumns.length || totalRoomCount,
        encounterMinutes: normalizeStudentScheduleMinutes(parsedEncounter, 20),
        checklistMinutes: normalizeStudentScheduleMinutes(parsedCoreChecklist, 0),
        feedbackMinutes: normalizeStudentScheduleMinutes(parsedFeedback, 5),
        transitionMinutes: normalizeStudentScheduleMinutes(parsedTransition, 5),
        adminScheduleHtml: operationsCompactSchedulePrintHtml,
      });
      if (!hasRenderablePrintHtml(html)) {
        return {
          html: "",
          ready: false,
          reason: "Could not generate Faculty / SimOps Instructions PDF. Printable packet markup is missing.",
        };
      }
      return { html, ready: true, reason: "" };
    } catch (error) {
      return {
        html: "",
        ready: false,
        reason: `Faculty / SimOps Instructions HTML builder failed: ${getErrorDetail(error)}`,
        cause: error,
      };
    }
  }, [
    authoritativeScheduleDisplayRounds.length,
    effectiveRoundCount,
    facultySimOpsArrivalLabel,
    facultySimOpsContextError,
    facultySimOpsEventName,
    facultySimOpsFirstEncounterLabel,
    operationsCompactSchedulePrintHtml,
    parsedCoreChecklist,
    parsedEncounter,
    parsedFeedback,
    parsedTransition,
    roomColumns.length,
    savedFacultySimOpsInstructionsConfig,
    selectedEvent,
    selectedScheduleDateLabel,
    totalRoomCount,
  ]);
  const studentInstructionsPdfFileName = useMemo(() => {
    const eventBaseName = getSafeFileName(normalizeDisplayText(selectedEvent?.name));
    return eventBaseName ? `${eventBaseName}-student-instructions.pdf` : "student-instructions.pdf";
  }, [selectedEvent?.name]);
  const facultySimOpsInstructionsPdfFileName = useMemo(() => {
    const eventBaseName = getSafeFileName(normalizeDisplayText(selectedEvent?.name));
    return eventBaseName ? `${eventBaseName}-faculty-simops-instructions.pdf` : "faculty-simops-instructions.pdf";
  }, [selectedEvent?.name]);
  const autoDownloadTriggeredRef = useRef(false);
  const previewDocumentParts = useMemo(
    () => getPreviewDocumentParts(schedulePreview.html),
    [schedulePreview.html]
  );
  const saveStateAppearance = getSaveStateAppearance(saveState);
  const saveButtonAppearance = getSaveButtonAppearance(saveState);
  const saveButtonLabel =
    saveState === "saved" && lastSavedAt ? `Saved ${formatSavedTimestamp(lastSavedAt)} ✓` : saveButtonAppearance.label;
  const lastSavedLabel = formatSavedTimestamp(lastSavedAt);
  const advancedSettingsActive =
    parsedRoomSetup > 0 ||
    parsedStudentPrebrief > 0 ||
    parsedSpPrebrief > 0 ||
    parsedFacultyPrebrief > 0 ||
    parsedSessionLength > 0 ||
    (!isVirtualEvent && parsedMaxPairs !== parseNumber(DEFAULT_SCHEDULE_BUILDER_DRAFT.maxPairsPerFlexRoom, 3)) ||
    Boolean(parsedStaffArrival !== null || parsedSpArrival !== null || parsedFacultyArrival !== null) ||
    manualRoundOverride;
  const currentTimeSourceLabel = startTime === timeSource.startTime ? timeSource.label : "Edited in builder";
  const referenceEndTimeLabel = formatReferenceEndDetail(parsedStartMinutes, parsedReferenceEndMinutes);

  function handleStartTimeChange(value: string) {
    requestScheduleStructureChange(() => {
      lockedScheduleSourceRef.current = null;
      setStartTime(value);
      setSaveState("unsaved");
      if (value !== timeSource.startTime) {
        setTimeSource((current) => ({ ...current, source: "edited" }));
      }
      logScheduleTimingDiagnostics("edit:start-time", {
        eventId: selectedEvent?.id || "",
        startTime: value,
      });
    });
  }

  function handleEncounterMinutesChange(value: string) {
    requestScheduleStructureChange(() => setEncounterMinutes(value));
  }

  function handleChecklistEnabledChange(value: boolean) {
    requestScheduleStructureChange(() => {
      setChecklistEnabled(value);
      if (value && parseNumber(checklistMinutes, 0) <= 0) {
        setChecklistMinutes("10");
      }
    });
  }

  function handleChecklistMinutesChange(value: string) {
    requestScheduleStructureChange(() => setChecklistMinutes(value));
  }

  function handleChecklistPlacementChange(value: string) {
    requestScheduleStructureChange(() => setChecklistPlacement(normalizeChecklistPlacement(value)));
  }

  function handleFeedbackMinutesChange(value: string) {
    requestScheduleStructureChange(() => setFeedbackMinutes(value));
  }

  function handleTransitionMinutesChange(value: string) {
    requestScheduleStructureChange(() => setTransitionMinutes(value));
  }

  function handleFacultyPrebriefMinutesChange(value: string) {
    requestScheduleStructureChange(() => setFacultyPrebriefMinutes(value));
  }

  function handleRoundTargetMinutesChange(value: string) {
    requestScheduleStructureChange(() => setSessionLengthMinutes(value));
  }

  function handleRoomCapacityChange(value: string) {
    const applyChange = () => {
      if (!asText(value)) {
        setRoomCapacity("");
        return;
      }
      setRoomCapacity(String(Math.max(1, parseNumber(value, 1))));
    };
    requestScheduleStructureChange(applyChange);
  }

  function handleExamRoomCountChange(value: string) {
    requestScheduleStructureChange(() => setExamRoomCount(value));
  }

  function handleFlexRoomCountChange(value: string) {
    requestScheduleStructureChange(() => setFlexRoomCount(value));
  }

  function handleMaxPairsPerFlexRoomChange(value: string) {
    requestScheduleStructureChange(() => setMaxPairsPerFlexRoom(value));
  }

  function handleManualRoundOverrideChange(value: boolean) {
    requestScheduleStructureChange(() => setManualRoundOverride(value));
  }

  function handleManualRoundCountChange(value: string) {
    requestScheduleStructureChange(() => setRoundCount(value));
  }

  function handleExamRoomDelta(delta: number) {
    requestScheduleStructureChange(() =>
      setExamRoomCount(String(Math.max(1, parseNumber(examRoomCount, delta > 0 ? 0 : 1) + delta)))
    );
  }

  async function handleShareOrCopyLink() {
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    if (!shareUrl) return;

    try {
      if (navigator.share) {
        await navigator.share({ title: schedulePreview.title, url: shareUrl });
        showCopyMessage("Schedule link shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showCopyMessage("Schedule link copied.");
      } else {
        showCopyMessage("Copy/share is not supported in this browser.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showCopyMessage(error instanceof Error ? error.message : "Could not share schedule link.", "error", 2600);
    }
  }

  function handleSchedulePreviewViewChange(nextView: ScheduleBuilderViewMode) {
    const nextKind: SchedulePreviewKind = nextView === "student" ? "student" : "operations";
    setScheduleViewMode(nextView);
    setPreviewKind(nextKind);

    if (props.previewOnly && typeof window !== "undefined") {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("view", nextView === "student" ? "student" : "operations");
      nextUrl.searchParams.set("preview", nextKind);
      nextUrl.searchParams.set("previewFamily", "schedule");
      nextUrl.searchParams.delete("downloadMode");
      window.history.replaceState(null, "", `${nextUrl.pathname}?${nextUrl.searchParams.toString()}`);
    }
  }

  function handleRawTextExport() {
    downloadBlob(new Blob([schedulePreview.text], { type: "text/plain;charset=utf-8" }), selectedPreviewExportFileName);
    showCopyMessage(`${schedulePreview.title} raw text export downloaded.`, "success", 2200);
  }

  function handleCsvExport() {
    downloadBlob(new Blob([schedulePreview.csv], { type: "text/csv;charset=utf-8" }), selectedPreviewCsvFileName);
    showCopyMessage(`${schedulePreview.title} CSV export downloaded.`, "success", 2200);
  }

  function handlePrintableHtmlExport() {
    downloadBlob(new Blob([compactSchedulePrintHtml], { type: "text/html;charset=utf-8" }), selectedPreviewHtmlFileName);
    showCopyMessage(`${schedulePreview.title} printable HTML downloaded.`, "success", 2200);
  }

  const openSchedulePrintFlow = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    if (!hasRenderablePrintHtml(compactSchedulePrintHtml)) {
      console.error("[schedule-export] Missing schedule print HTML for fallback print flow.");
      return false;
    }

    return openPrintableHtmlBlob(compactSchedulePrintHtml, {
      printOnLoad: true,
      logLabel: "[schedule-export] Could not open print dialog.",
    });
  }, [compactSchedulePrintHtml]);

  const openStudentInstructionsPrintFlow = useCallback((preparedHtml?: string): boolean => {
    if (typeof window === "undefined") return false;
    let html = asText(preparedHtml);
    if (!html) {
      const buildResult = buildCurrentStudentInstructionsHtml();
      if (!buildResult.ready) {
        console.error("[student-instructions] Student Instructions HTML generation failed before preview window.", {
          reason: buildResult.reason,
          cause: buildResult.cause,
        });
        return false;
      }
      html = buildResult.html;
    }

    const validation = validateStudentInstructionsPrintHtml(html);
    if (!validation.ready) {
      console.error("[student-instructions] Student Instructions HTML failed validation before preview window.", {
        reason: validation.reason,
      });
      return false;
    }

    return openPrintableHtmlBlob(html, {
      printOnLoad: true,
      logLabel: "[student-instructions] Could not open print dialog.",
    });
  }, [buildCurrentStudentInstructionsHtml]);

  const openFacultySimOpsInstructionsPrintFlow = useCallback((preparedHtml?: string): boolean => {
    if (typeof window === "undefined") return false;
    let html = asText(preparedHtml);
    if (!html) {
      const buildResult = buildCurrentFacultySimOpsInstructionsHtml();
      if (!buildResult.ready) {
        console.error("[faculty-simops-instructions] Faculty / SimOps Instructions HTML generation failed before preview window.", {
          reason: buildResult.reason,
          cause: buildResult.cause,
        });
        return false;
      }
      html = buildResult.html;
    }

    if (!hasRenderablePrintHtml(html)) {
      console.error("[faculty-simops-instructions] Faculty / SimOps Instructions HTML failed validation before preview window.");
      return false;
    }

    return openPrintableHtmlBlob(html, {
      printOnLoad: true,
      logLabel: "[faculty-simops-instructions] Could not open print dialog.",
    });
  }, [buildCurrentFacultySimOpsInstructionsHtml]);

  const handleStyledPdfDownload = useCallback(async () => {
    if (styledPdfExporting) return;

    setStyledPdfExporting(true);
    showCopyMessage("Preparing styled PDF download...", "success", 2200);
    try {
      const pdfBlob = await createStyledSchedulePdfBlob({
        html: compactSchedulePrintHtml,
        printView: previewKind === "student" ? "student" : "operations",
      });
      downloadBlob(pdfBlob, selectedPreviewStyledPdfFileName);
      showCopyMessage(`${schedulePreview.title} styled PDF downloaded.`, "success", 2600);
    } catch (error) {
      const printOpened = openSchedulePrintFlow();
      showCopyMessage(
        printOpened
          ? "Direct PDF download was blocked, so a print window opened. Use Save as PDF from the print dialog."
          : error instanceof Error
            ? error.message
            : "Could not download styled PDF. Use Print Schedule or Export Printable HTML from Actions.",
        printOpened ? "success" : "error",
        printOpened ? 5200 : 3600
      );
    } finally {
      setStyledPdfExporting(false);
    }
  }, [
    compactSchedulePrintHtml,
    openSchedulePrintFlow,
    selectedPreviewStyledPdfFileName,
    previewKind,
    schedulePreview.title,
    showCopyMessage,
    styledPdfExporting,
  ]);

  const handleStudentInstructionsPdfDownload = useCallback(async () => {
    if (studentInstructionsPdfExporting) return;
    const buildResult = buildCurrentStudentInstructionsHtml();
    if (!buildResult.ready) {
      console.error("[student-instructions] PDF generation blocked before export.", {
        reason: buildResult.reason,
        cause: buildResult.cause,
      });
      showCopyMessage(STUDENT_INSTRUCTIONS_EXPORT_ERROR_MESSAGE, "error", 4200);
      return;
    }

    setStudentInstructionsPdfExporting(true);
    showCopyMessage("Preparing Student Instructions PDF...", "success", 2200);
    try {
      const pdfBlob = await createStyledSchedulePdfBlob({
        html: buildResult.html,
        printView: "student-instructions",
      });
      downloadBlob(pdfBlob, studentInstructionsPdfFileName);
      showCopyMessage("Student Instructions PDF downloaded.", "success", 2600);
    } catch (error) {
      console.error("[student-instructions] PDF generation failed after HTML was validated.", error);
      const printOpened = openStudentInstructionsPrintFlow(buildResult.html);
      showCopyMessage(
        printOpened
          ? "Direct Student Instructions PDF download was blocked, so a print window opened. Use Save as PDF from the print dialog."
          : STUDENT_INSTRUCTIONS_EXPORT_ERROR_MESSAGE,
        printOpened ? "success" : "error",
        printOpened ? 5200 : 4200
      );
    } finally {
      setStudentInstructionsPdfExporting(false);
    }
  }, [
    buildCurrentStudentInstructionsHtml,
    openStudentInstructionsPrintFlow,
    showCopyMessage,
    studentInstructionsPdfExporting,
    studentInstructionsPdfFileName,
  ]);

  const handleFacultySimOpsInstructionsPdfDownload = useCallback(async () => {
    if (facultySimOpsInstructionsPdfExporting) return;
    const buildResult = buildCurrentFacultySimOpsInstructionsHtml();
    if (!buildResult.ready) {
      console.error("[faculty-simops-instructions] PDF generation blocked before export.", {
        reason: buildResult.reason,
        cause: buildResult.cause,
      });
      showCopyMessage(FACULTY_SIMOPS_INSTRUCTIONS_EXPORT_ERROR_MESSAGE, "error", 4200);
      return;
    }

    setFacultySimOpsInstructionsPdfExporting(true);
    showCopyMessage("Preparing Faculty / SimOps Instructions PDF...", "success", 2200);
    try {
      const pdfBlob = await createStyledSchedulePdfBlob({
        html: buildResult.html,
        printView: "faculty-simops-instructions",
      });
      downloadBlob(pdfBlob, facultySimOpsInstructionsPdfFileName);
      showCopyMessage("Faculty / SimOps Instructions PDF downloaded.", "success", 2600);
    } catch (error) {
      console.error("[faculty-simops-instructions] PDF generation failed after HTML was validated.", error);
      const printOpened = openFacultySimOpsInstructionsPrintFlow(buildResult.html);
      showCopyMessage(
        printOpened
          ? "Direct Faculty / SimOps Instructions PDF download was blocked, so a print window opened. Use Save as PDF from the print dialog."
          : FACULTY_SIMOPS_INSTRUCTIONS_EXPORT_ERROR_MESSAGE,
        printOpened ? "success" : "error",
        printOpened ? 5200 : 4200
      );
    } finally {
      setFacultySimOpsInstructionsPdfExporting(false);
    }
  }, [
    buildCurrentFacultySimOpsInstructionsHtml,
    facultySimOpsInstructionsPdfExporting,
    facultySimOpsInstructionsPdfFileName,
    openFacultySimOpsInstructionsPrintFlow,
    showCopyMessage,
  ]);

  useEffect(() => {
    if (loading || !props.previewOnly || !props.autoDownload || autoDownloadTriggeredRef.current) return;
    if (!resolvedSelectedEventId || !selectedEvent) return;
    if (studentInstructionsContextError && props.autoDownloadMode === "student-instructions") return;
    if (facultySimOpsContextError && props.autoDownloadMode === "faculty-simops-instructions") return;
    autoDownloadTriggeredRef.current = true;
    const shouldDownloadStudentInstructions = props.autoDownloadMode === "student-instructions";
    const shouldDownloadFacultySimOpsInstructions = props.autoDownloadMode === "faculty-simops-instructions";
    const timeout = window.setTimeout(() => {
      if (shouldDownloadStudentInstructions) {
        void handleStudentInstructionsPdfDownload();
      } else if (shouldDownloadFacultySimOpsInstructions) {
        void handleFacultySimOpsInstructionsPdfDownload();
      } else {
        void handleStyledPdfDownload();
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [
    facultySimOpsContextError,
    handleFacultySimOpsInstructionsPdfDownload,
    handleStyledPdfDownload,
    handleStudentInstructionsPdfDownload,
    loading,
    props.autoDownload,
    props.autoDownloadMode,
    resolvedSelectedEventId,
    props.previewOnly,
    selectedEvent,
    studentInstructionsContextError,
  ]);

  useEffect(() => {
    if (loading || !props.previewOnly || !props.autoDownload) return;
    if (props.autoDownloadMode !== "student-instructions") return;
    if (!studentInstructionsContextError) return;
    console.error("[student-instructions] Student Instructions export unavailable.", {
      reason: studentInstructionsContextError,
    });
    showCopyMessage(STUDENT_INSTRUCTIONS_EXPORT_ERROR_MESSAGE, "error", 4200);
  }, [loading, props.autoDownload, props.autoDownloadMode, props.previewOnly, showCopyMessage, studentInstructionsContextError]);

  useEffect(() => {
    if (loading || !props.previewOnly || !props.autoDownload) return;
    if (props.autoDownloadMode !== "faculty-simops-instructions") return;
    if (!facultySimOpsContextError) return;
    console.error("[faculty-simops-instructions] Faculty / SimOps Instructions export unavailable.", {
      reason: facultySimOpsContextError,
    });
    showCopyMessage(FACULTY_SIMOPS_INSTRUCTIONS_EXPORT_ERROR_MESSAGE, "error", 4200);
  }, [facultySimOpsContextError, loading, props.autoDownload, props.autoDownloadMode, props.previewOnly, showCopyMessage]);

  function handleRenderedSchedulePrint() {
    const printed = openSchedulePrintFlow();
    if (!printed) {
      showCopyMessage("Print window blocked. Please allow popups for this site.", "error", 2500);
    }
  }

  const renderScheduleViewToggle = (isDark = false) => {
    const activeView = previewKind === "student" ? "student" : "operations";
    const baseBorder = isDark ? "1px solid rgba(220, 239, 255, 0.18)" : "1px solid var(--cfsp-border)";
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          border: baseBorder,
          borderRadius: 12,
          padding: 4,
          background: isDark ? "rgba(15, 35, 53, 0.78)" : "#ffffff",
          gap: 3,
        }}
        aria-label="Schedule view"
      >
        {[
          { value: "student", label: "Student Schedule" },
          { value: "operations", label: "Admin Schedule" },
        ].map((option) => {
          const selected = activeView === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSchedulePreviewViewChange(option.value as ScheduleBuilderViewMode)}
              aria-pressed={selected}
              style={{
                border: "none",
                borderRadius: 9,
                padding: "8px 11px",
                fontSize: 13,
                fontWeight: 900,
                cursor: "pointer",
                background: selected ? "var(--cfsp-blue)" : "transparent",
                color: selected ? "#ffffff" : isDark ? "rgba(220, 239, 255, 0.78)" : "var(--cfsp-text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  };

  const renderScheduleActionsMenu = (isDark = false) => (
    <details
      className="cfsp-schedule-actions-menu"
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      <summary
        className="cfsp-btn"
        style={{
          listStyle: "none",
          cursor: "pointer",
          background: isDark ? "var(--cfsp-button-secondary-bg)" : undefined,
          border: isDark ? "1px solid var(--cfsp-button-secondary-border)" : undefined,
          color: isDark ? "var(--cfsp-button-secondary-text)" : undefined,
        }}
      >
        Actions
      </summary>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 8px)",
          zIndex: 20,
          minWidth: 190,
          borderRadius: 12,
          border: isDark ? "1px solid rgba(120, 180, 255, 0.18)" : "1px solid #dce6ee",
          background: isDark ? "#102d44" : "#ffffff",
          boxShadow: "0 18px 38px rgba(15, 35, 53, 0.18)",
          padding: 6,
          display: "grid",
          gap: 4,
        }}
      >
        {[
          { label: "Open Schedule Preview", onClick: () => setShowSchedulePreview(true) },
          { label: "Print Schedule", onClick: handleRenderedSchedulePrint },
          { label: styledPdfExporting ? "Preparing PDF..." : "Download PDF / Save PDF", onClick: () => void handleStyledPdfDownload(), disabled: styledPdfExporting },
          {
            label: studentInstructionsPdfExporting ? "Preparing Instructions PDF..." : "Download Student Instructions PDF",
            onClick: () => void handleStudentInstructionsPdfDownload(),
            disabled: studentInstructionsPdfExporting,
          },
          {
            label: facultySimOpsInstructionsPdfExporting
              ? "Preparing Faculty / SimOps PDF..."
              : "Download Faculty / SimOps Instructions PDF",
            onClick: () => void handleFacultySimOpsInstructionsPdfDownload(),
            disabled: facultySimOpsInstructionsPdfExporting,
          },
          { label: "Copy/share link", onClick: () => void handleShareOrCopyLink() },
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={(event) => {
              if (action.disabled) return;
              action.onClick();
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
            disabled={action.disabled}
            style={{
              border: "none",
              borderRadius: 9,
              background: "transparent",
              color: isDark ? "rgba(240, 248, 255, 0.92)" : "#14304f",
              cursor: action.disabled ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 800,
              opacity: action.disabled ? 0.62 : 1,
              padding: "9px 10px",
              textAlign: "left",
              whiteSpace: "nowrap",
            }}
          >
            {action.label}
          </button>
        ))}
        {!props.previewOnly ? (
          <div
            style={{
              borderTop: isDark ? "1px solid rgba(120, 180, 255, 0.14)" : "1px solid #e6edf3",
              marginTop: 4,
              paddingTop: 7,
              display: "grid",
              gap: 4,
            }}
          >
            <div style={{ color: isDark ? "rgba(220, 239, 255, 0.62)" : "#6b7d8f", fontSize: 11, fontWeight: 900, padding: "3px 10px", textTransform: "uppercase" }}>
              Builder
            </div>
            {[
              { label: "Rebuild Schedule Math", onClick: handleRebuildScheduleMath, disabled: false },
              { label: scheduleCompletionSaving ? "Marking Complete..." : "Mark Schedule Complete", onClick: () => void handleCompleteSchedule(), disabled: scheduleCompletionSaving },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={(event) => {
                  if (action.disabled) return;
                  action.onClick();
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
                disabled={action.disabled}
                style={{
                  border: "none",
                  borderRadius: 9,
                  background: isDark ? "rgba(255,255,255,0.04)" : "#f8fbfd",
                  color: isDark ? "rgba(240, 248, 255, 0.92)" : "#14304f",
                  cursor: action.disabled ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: action.disabled ? 0.62 : 1,
                  padding: "9px 10px",
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
        <div
          style={{
            borderTop: isDark ? "1px solid rgba(120, 180, 255, 0.14)" : "1px solid #e6edf3",
            marginTop: 4,
            paddingTop: 7,
            display: "grid",
            gap: 4,
          }}
        >
          <div style={{ color: isDark ? "rgba(220, 239, 255, 0.62)" : "#6b7d8f", fontSize: 11, fontWeight: 900, padding: "3px 10px", textTransform: "uppercase" }}>
            Download/Export
          </div>
          {[
            { label: "Export Raw Text", onClick: handleRawTextExport, disabled: false },
            { label: "Export CSV", onClick: handleCsvExport, disabled: false },
            { label: "Export Printable HTML", onClick: handlePrintableHtmlExport, disabled: false },
          ].map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={(event) => {
                if (action.disabled) return;
                action.onClick();
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              disabled={action.disabled}
              style={{
                border: "none",
                borderRadius: 9,
                background: isDark ? "rgba(255,255,255,0.04)" : "#f8fbfd",
                color: isDark ? "rgba(240, 248, 255, 0.92)" : "#14304f",
                cursor: action.disabled ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 800,
                opacity: action.disabled ? 0.62 : 1,
                padding: "9px 10px",
                textAlign: "left",
                whiteSpace: "nowrap",
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </details>
  );

  async function handleCompleteSchedule() {
    if (!selectedEvent?.id || scheduleCompletionSaving) return;
    const confirmed = window.confirm("Mark this schedule complete?");
    if (!confirmed) return;

    const now = new Date().toISOString();
    if (workflowSyncTimeoutRef.current) {
      window.clearTimeout(workflowSyncTimeoutRef.current);
      workflowSyncTimeoutRef.current = null;
    }

    setScheduleCompletionSaving(true);
    setSaveState("saving");
    setSaveErrorMessage("");
    try {
      const completedSnapshot = buildPersistedScheduleSnapshot(now, "complete");
      const completedWorkflowPartial = buildScheduleWorkflowPartial(now, "complete", completedSnapshot);
      const completedScheduleMetadata = buildCompletedScheduleMetadataPayload(completedSnapshot, {
        completedAt: now,
        completedBy: getBuilderUserLabel(me),
      });
      await persistScheduleWorkflowMetadata({
        ...completedWorkflowPartial,
        schedule_completed_at: now,
        schedule_completed_by: getBuilderUserLabel(me),
        completed_schedule: encodeURIComponent(JSON.stringify(completedScheduleMetadata)),
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(completedSnapshot));
      }
      lastKnownGoodScheduleSnapshotRef.current = completedSnapshot;
      setPersistedScheduleStructureSignature(completedSnapshot.scheduleStructureSignature);
      lockedScheduleSourceRef.current = "completed_snapshot";
      setTimeSource({
        source: "completed_snapshot",
        label: "Using completed schedule snapshot",
        startTime: completedSnapshot.startTime,
        endTime: "",
        sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(completedSnapshot.sessionLengthMinutes),
      });
      setSaveState("saved");
      skipNextAutosaveRef.current = true;
      setLastSavedAt(now);
      showCopyMessage("Schedule marked complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not mark schedule complete.";
      setSaveState("error");
      setSaveErrorMessage(message);
      showCopyMessage(message, "error", 3200);
    } finally {
      setScheduleCompletionSaving(false);
    }
  }

  function handleClearRoster() {
    setLearnerFileName("");
    setOriginalUploadedLearners([]);
    setUploadedLearners([]);
    setLearnerCountOverride(null);
    setSaveState("unsaved");
    showCopyMessage("Learner roster cleared. Placeholder learner names restored.");
  }

  async function handleUpdateEventSetupLearnerCount(nextCount: number) {
    if (!selectedEvent?.id) return;
    const safeCount = Math.max(0, Math.trunc(nextCount));
    const nextNotes = upsertEventMetadata(selectedEvent.notes, { training: { schedule_learner_count: String(safeCount) } });
    if (!nextNotes) return;

    try {
      await persistScheduleWorkflowMetadata({ schedule_learner_count: String(safeCount) });
      setEvents((current) =>
        current.map((event) =>
          event.id === selectedEvent.id
            ? {
                ...event,
                notes: nextNotes,
              }
            : event
        )
      );
      setSaveState("unsaved");
      showCopyMessage(`Event setup learner count updated to ${safeCount}.`, "success", 3200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update event setup learner count.";
      setSaveState("error");
      setSaveErrorMessage(message);
      showCopyMessage(message, "error", 3200);
    }
  }

  function handleUpdateEventSetupFromRosterCount() {
    if (!explicitLearnerCount) {
      showCopyMessage("No learner names to use for this update.", "error", 3200);
      return;
    }
    void handleUpdateEventSetupLearnerCount(explicitLearnerCount);
  }

  function handleUseRosterLearnerCount() {
    setLearnerCountOverride(null);
    showCopyMessage("Using uploaded roster learner count.");
  }

  function handleReviewLearners() {
    if (learnerListTextareaRef.current) {
      learnerListTextareaRef.current.focus();
      learnerListTextareaRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function handleSyncLearnersFromEventSetup() {
    if (!hasEventSetupLearnerCount) {
      showCopyMessage("Event setup learner count is not set.", "error", 3200);
      return;
    }

    if (hasAuthoritativeScheduleData) {
      const confirmed = window.confirm("Syncing learners from Event Setup may regenerate the schedule. Continue?");
      if (!confirmed) return;
    }

    setLearnerCountOverride(scheduleSetupTruth.studentCount);
    setSaveState("unsaved");
    setPersistedResolvedRounds([]);
    setPersistedResolvedRoundTargetCount(0);
    setScheduleMathEpoch((current) => current + 1);
    setLearnerFileName("Generated from Event Setup student count");
    showCopyMessage(`Learners synced from Event Setup: ${scheduleSetupTruth.studentCount}.`, "success", 3200);
  }

  function handleEditLearnerCount() {
    const raw = window.prompt("Enter learner count:");
    const nextCount = Number(raw?.trim());
    if (!Number.isFinite(nextCount) || nextCount <= 0) {
      if (raw !== null) {
        showCopyMessage("Please enter a valid positive number.", "error", 3200);
      }
      return;
    }
    setLearnerCountOverride(Math.floor(nextCount));
    setSaveState("unsaved");
    setPersistedResolvedRounds([]);
    setPersistedResolvedRoundTargetCount(0);
    setScheduleMathEpoch((current) => current + 1);
    setLearnerFileName("Builder learner count override");
    showCopyMessage(`Learner count set to ${Math.floor(nextCount)}.`);
  }

  function handleKeepBuilderDraftLearners() {
    setLearnerCountOverride(builderDraftFallbackCount);
    setSaveState("unsaved");
    setPersistedResolvedRounds([]);
    setPersistedResolvedRoundTargetCount(0);
    setScheduleMathEpoch((current) => current + 1);
    showCopyMessage("Keeping saved builder learner count.");
  }

  function confirmClearRoster() {
    setShowClearRosterDialog(false);
    requestScheduleStructureChange(handleClearRoster);
  }

  async function handleLearnerUpload(file: File | null) {
    if (!file) return;

    setLearnerUploadError("");

    try {
      const names = await parseLearnerFile(file);
      if (!names.length) {
        throw new Error("No learner names were found in the uploaded file.");
      }

      const existingScheduleDetected =
        activeLearnerSourceIsExplicit ||
        uploadedLearners.length > 0 ||
        originalUploadedLearners.length > 0 ||
        generated.rounds.length > 0 ||
        Boolean(selectedEventMetadata.schedule_builder_snapshot) ||
        scheduleBuilderDaySnapshots.size > 0;

      let uploadMode: "add" | "replace" = "replace";

      if (existingScheduleDetected) {
        const choice = window
          .prompt(
            [
              "This event already has a saved/current schedule.",
              "",
              "Type ADD to add this upload as a new schedule/day and keep the current schedule.",
              "Type REPLACE to replace the current schedule.",
              "Type CANCEL to stop.",
            ].join("\\n"),
            "ADD"
          )
          ?.trim()
          .toUpperCase();

        if (!choice || choice === "CANCEL") {
          setLearnerUploadError("");
          showCopyMessage("Schedule upload canceled. Current schedule was not changed.", "success", 3200);
          return;
        }

        if (choice === "ADD") {
          uploadMode = "add";
        } else if (choice === "REPLACE") {
          const replaceConfirmed = window.confirm(
            "Replace the current schedule? This will rebuild the current schedule from this upload."
          );

          if (!replaceConfirmed) {
            showCopyMessage("Replace canceled. Current schedule was not changed.", "success", 3200);
            return;
          }

          uploadMode = "replace";
        } else {
          showCopyMessage("Upload canceled. Type ADD, REPLACE, or CANCEL.", "error", 4200);
          return;
        }
      }

      if (uploadMode === "add") {
        const knownDays = Array.from(scheduleBuilderDaySnapshots.keys()).filter((day) => Number.isFinite(day));
        const nextDay = Math.max(scheduleDay, 1, ...knownDays) + 1;
        const savedAt = new Date().toISOString();
        const nextDraft: ScheduleBuilderDraft = {
          ...draftSnapshot,
          selectedEventId: scheduleBuilderEventId,
          learnerFileName: file.name,
          originalUploadedLearners: names,
          uploadedLearners: names,
          roundCount: String(Math.max(1, Math.ceil(names.length / Math.max(slotsPerRound, 1)))),
          manualRoundOverride: false,
          savedAt,
        };

        lockedScheduleSourceRef.current = null;
        hydratedTimePrefillKeyRef.current = "";
        skipNextAutosaveRef.current = true;
        saveDraftForScheduleDay(nextDay, nextDraft);
        showCopyMessage(
          `Added ${file.name} as schedule/day ${nextDay}. Opening that day now; save it when the setup looks right.`,
          "success",
          5600
        );
        navigateToScheduleBuilderDay(nextDay);
        return;
      }

      setLearnerFileName(file.name);
      setOriginalUploadedLearners(names);
      setUploadedLearners(names);
      setLearnerCountOverride(null);
      setRoundCount(String(Math.max(1, Math.ceil(names.length / Math.max(slotsPerRound, 1)))));
      setManualRoundOverride(false);
      setSaveState("unsaved");
      setScheduleMathEpoch((current) => current + 1);
      showCopyMessage(`Uploaded ${names.length} learners from ${file.name}.`, "success", 3200);
    } catch (error) {
      setOriginalUploadedLearners([]);
      setUploadedLearners([]);
      setLearnerCountOverride(null);
      setLearnerUploadError(error instanceof Error ? error.message : "Could not read learner upload.");
    }
  }

  function handleManualLearnerRosterChange(value: string) {
    const names = normalizeLearnerNames(value.split(/\r?\n/));
    setLearnerFileName(names.length ? "Manual student list" : "");
    setOriginalUploadedLearners(names);
    setUploadedLearners(names);
    setLearnerCountOverride(null);
    setLearnerUploadError("");
    setSaveState("unsaved");
  }

  async function handleRequestStudentList() {
    if (!selectedEvent?.id) return;
    if (!studentListFacultyEmails.length) {
      setLearnerUploadError("Add a valid faculty email before requesting the student list.");
      showCopyMessage("Add a valid faculty email before requesting the student list.", "error", 3200);
      return;
    }

    setLearnerUploadError("");

    const eventDate = selectedEvent ? formatEventDate(selectedEvent) : "Date TBD";
    const draft = buildStudentListRequestDraft({
      eventTitle: selectedEvent.name || "CFSP Event",
      eventDate,
      startTime: formatStudentListRequestTime(scheduleSetupTruth.startTime || selectedEventMetadata.event_start_time),
      endTime: formatStudentListRequestTime(scheduleSetupTruth.endTime || selectedEventMetadata.event_end_time),
      locationAccess:
        normalizeDisplayText(selectedEvent.location) ||
        normalizeDisplayText(selectedEventMetadata.zoom_url) ||
        normalizeDisplayText(selectedEventMetadata.training_zoom_link) ||
        normalizeDisplayText(selectedEventMetadata.modality) ||
        "TBD",
      facultyName: selectedEventMetadata.faculty_names,
      facultyEmails: studentListFacultyEmails,
      senderName: getBuilderUserLabel(me) || selectedEventMetadata.sim_contact || "CFSP Simulation Operations",
    });
    const mailtoHref = buildStudentListRequestMailtoHref({
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    });

    try {
      const draftedAt = new Date().toISOString();
      await persistScheduleWorkflowMetadata({
        student_list_request_status: "drafted",
        student_list_request_drafted_at: draftedAt,
        student_list_request_faculty_email: studentListFacultyEmails.join(","),
        student_list_request_email_subject: draft.subject,
        last_email_workflow_type: "student_list_request",
        last_email_recipient_count: String(studentListFacultyEmails.length),
      });
      window.location.href = mailtoHref;
      showCopyMessage("Student list request draft opened.", "success", 3200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open student list request draft.";
      setLearnerUploadError(message);
      showCopyMessage(message, "error", 3200);
    }
  }

  function handleRandomizeLearners() {
    const source = activeLearnerSourceIsExplicit ? explicitLearnerRoster : learnerRoster;
    if (!source.length) return;
    setUploadedLearners(shuffleRoster(source));
    setLearnerCountOverride(null);
    showCopyMessage("Learner spread randomized.", "success", 2600);
  }

  function handleResetLearnerOrder() {
    if (!originalUploadedLearners.length) return;
    setUploadedLearners(originalUploadedLearners);
    showCopyMessage("Uploaded learner order restored.", "success", 2600);
  }

  function handleAddDayBlock() {
    requestScheduleStructureChange(() => {
      setDayBlocks((current) => [
        ...current,
        createDayBlock({
          type: "break",
          label: "Break",
          durationMinutes: "10",
          placement: "after_each_rotation",
          visibleTo: "both",
        }),
      ]);
    });
  }

  function handleUpdateDayBlock(blockId: string, updates: Partial<DayBlockConfig>) {
    requestScheduleStructureChange(() => {
      setDayBlocks((current) =>
        current.map((block) => {
          if (block.id !== blockId) return block;
          const nextType = updates.type ? normalizeDayBlockType(updates.type) : block.type;
          const nextLabel =
            updates.label !== undefined
              ? updates.label
              : block.label === getDefaultDayBlockLabel(block.type)
                ? getDefaultDayBlockLabel(nextType)
                : block.label;
          return createDayBlock({
            ...block,
            ...updates,
            type: nextType,
            label: nextLabel,
            placement: updates.placement
              ? normalizeDayBlockPlacement(updates.placement)
              : block.placement,
            visibleTo: updates.visibleTo
              ? normalizeDayBlockVisibility(updates.visibleTo)
              : block.visibleTo,
          });
        })
      );
    });
  }

  function handleRemoveDayBlock(blockId: string) {
    requestScheduleStructureChange(() => {
      setDayBlocks((current) => current.filter((block) => block.id !== blockId));
    });
  }

  function handleMoveDayBlock(blockId: string, direction: "up" | "down") {
    requestScheduleStructureChange(() => {
      setDayBlocks((current) => {
        const index = current.findIndex((block) => block.id === blockId);
        if (index < 0) return current;
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= current.length) return current;
        const next = [...current];
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        return next;
      });
    });
  }

  if (props.previewOnly) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#ffffff",
        }}
      >
        {previewDocumentParts.styles ? (
          <style dangerouslySetInnerHTML={{ __html: previewDocumentParts.styles }} />
        ) : null}
        <style>{`
          .cfsp-schedule-actions-menu > summary::-webkit-details-marker { display: none; }
          .cfsp-schedule-print-root { background: #f7fafc; }
          @media print {
            @page { margin: 0.35in; }
            html, body { background: #ffffff !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .cfsp-schedule-viewer-toolbar,
            .cfsp-schedule-actions-menu,
            .cfsp-schedule-no-print,
            .schedule-rhythm-section,
            .rhythm-row,
            .divider-stack {
              display: none !important;
            }
            .cfsp-schedule-print-root { background: #ffffff !important; }
            .preview-shell { break-inside: auto; }
            .round-section,
            .rhythm-row,
            .event-meta-card,
            .round-grid-group,
            .round-grid-row,
            .wide-row,
            .schedule-room-cell,
            .schedule-room-card,
            .wide-band {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .schedule-grid-table thead { display: table-header-group; }
            .schedule-grid-table tbody,
            .schedule-grid-table tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .schedule-grid-shell {
              overflow: visible !important;
              max-width: none !important;
            }
          }
        `}</style>
        <div
          className="cfsp-schedule-viewer-toolbar"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 50,
            borderBottom: "1px solid rgba(20, 91, 150, 0.16)",
            background: "rgba(247, 250, 252, 0.96)",
            backdropFilter: "blur(12px)",
            padding: "10px 14px",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {renderScheduleViewToggle(false)}
            <div style={{ color: "#5e7388", fontSize: 12, fontWeight: 800 }}>
              {schedulePreview.summary}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {copyMessage ? (
              <span style={{ color: copyMessageTone === "error" ? "#c23b3b" : "#0f766e", fontSize: 12, fontWeight: 850 }}>
                {copyMessage}
              </span>
            ) : null}
            {renderScheduleActionsMenu(false)}
          </div>
        </div>
        <div className="cfsp-schedule-print-root" dangerouslySetInnerHTML={{ __html: previewDocumentParts.body }} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <style>{`
        .cfsp-schedule-actions-menu > summary::-webkit-details-marker,
        .cfsp-schedule-advanced-summary::-webkit-details-marker { display: none; }
      `}</style>
      {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

      <section className="sticky top-3 z-20 rounded-[14px] border border-[#cfe0ea] bg-white/95 px-3 py-2 shadow-[0_12px_30px_rgba(20,48,79,0.10)] backdrop-blur">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="cfsp-kicker">Schedule Builder</span>
            <span className="rounded-full border border-[#c7dcee] bg-[#edf5fb] px-3 py-1 text-xs font-black uppercase text-[#165a96]">
              {scheduleWorkflowBadgeLabel}
            </span>
            <span className="cfsp-chip">Learners {activeLearnerCount}</span>
            <span className="cfsp-chip">Rooms {renderedRoomCount}</span>
            <span className="cfsp-chip">Rounds {renderedRoundCount}</span>
            <span className="cfsp-chip">
              Cases {activeCaseDisplayCount}
              {configuredFlexRoomCountForDisplay ? ` • Flex ${configuredFlexRoomCountForDisplay}` : ""}
            </span>
            {scheduleSetupTruth.backupSpTarget > 0 ? (
              <span className="cfsp-chip">Backups {scheduleSetupTruth.backupSpTarget}</span>
            ) : null}
            {scheduleSetupTruth.hasEventSetupValues ? (
              <span className="text-xs font-bold text-[#5e7388]">Source: {scheduleSetupTruth.sourceLabel}</span>
            ) : null}
            {lastSavedLabel ? (
              <span className="text-xs font-bold text-[#5e7388]">Saved {lastSavedLabel}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-black uppercase text-[#5e7388]">
              Day
              <select
                value={scheduleDay}
                onChange={(event) => navigateToScheduleBuilderDay(Number.parseInt(event.target.value, 10) || 1)}
                className="cfsp-input h-9 min-w-[105px] rounded-[10px] px-3 text-sm normal-case"
                aria-label="Schedule day"
              >
                {scheduleBuilderDayOptions.map((day) => (
                  <option key={`schedule-day-option-${day}`} value={day}>
                    Day {day}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void handleAddScheduleDay()} className="cfsp-btn cfsp-btn-secondary">
              Add Day
            </button>
            {props.backHref ? (
              <Link href={props.backHref} className="cfsp-btn cfsp-btn-secondary">
                {props.backLabel || "Return to Event"}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSaveScheduleChanges()}
              disabled={saveState === "saving"}
              className="cfsp-btn"
              aria-live="polite"
              style={{
                background: saveButtonAppearance.background,
                borderColor: saveButtonAppearance.border,
                boxShadow: saveButtonAppearance.shadow,
                color: saveButtonAppearance.color,
                minWidth: 132,
                opacity: saveState === "saving" ? 0.85 : 1,
              }}
            >
              {saveState === "saving" ? (
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/45 border-t-white"
                />
              ) : null}
              {saveButtonLabel}
            </button>
            {renderScheduleActionsMenu(false)}
          </div>
        </div>
        {(copyMessage || (saveState === "error" && saveErrorMessage)) ? (
          <div
            className={`mt-2 text-sm font-semibold ${
              saveState === "error" && saveErrorMessage
                ? "text-[#c23b3b]"
                : copyMessageTone === "error"
                  ? "text-[#c23b3b]"
                  : "text-[#196b57]"
            }`}
          >
            {saveState === "error" && saveErrorMessage ? `Save failed: ${saveErrorMessage}` : copyMessage}
          </div>
        ) : null}
      </section>

      {loading ? (
        <div className="cfsp-alert cfsp-alert-info">Loading events for schedule building...</div>
      ) : events.length === 0 ? (
        <div className="cfsp-panel px-5 py-6">
          <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">No events available yet</h3>
          <p className="mt-3 text-sm leading-6 text-[#5e7388]">
            CFSP could not find any events to build a schedule from yet. Start by creating a new event or importing one from an upload workbook.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/events/new" className="cfsp-btn cfsp-btn-primary">
              Create New Event
            </Link>
            <Link href="/events/upload" className="cfsp-btn cfsp-btn-secondary">
              Upload Events
            </Link>
          </div>
        </div>
      ) : (
        <>
          {!selectedEvent && props.fixedEventId ? (
            <div className="cfsp-alert cfsp-alert-error">This event could not be found for schedule building.</div>
          ) : null}

          {eventSetupDraftConflictMessage ? (
            <div className="cfsp-alert cfsp-alert-info flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{eventSetupDraftConflictMessage}</span>
              <button type="button" onClick={handleRegenerateFromEventSetup} className="cfsp-btn cfsp-btn-secondary">
                Regenerate from Event Setup
              </button>
            </div>
          ) : null}

          <details className="px-1 py-1">
            <summary className="cfsp-schedule-advanced-summary cursor-pointer list-none rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="cfsp-label">Advanced setup</div>
                  <div className="mt-1 text-sm font-semibold text-[#5e7388]">
                    Event details, learner roster, setup inputs, and optional preview controls.
                  </div>
                </div>
                <span className="rounded-full border border-[#c7dcee] bg-[#f8fbfd] px-3 py-1 text-xs font-black uppercase text-[#165a96]">
                  Expand setup
                </span>
              </div>
            </summary>
            <div className="mt-4 grid gap-4">
              <div className="flex flex-col gap-3 rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-[12px] border border-[var(--cfsp-border)] bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setBuilderMode("simple")}
                      className="rounded-[10px] px-4 py-2 text-sm font-black transition"
                      style={{
                        background: builderMode === "simple" ? "var(--cfsp-blue)" : "transparent",
                        color: builderMode === "simple" ? "#ffffff" : "var(--cfsp-text-muted)",
                      }}
                    >
                      Core Setup
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuilderMode("advanced")}
                      className="rounded-[10px] px-4 py-2 text-sm font-black transition"
                      style={{
                        background: builderMode === "advanced" ? "var(--cfsp-blue)" : "transparent",
                        color: builderMode === "advanced" ? "#ffffff" : "var(--cfsp-text-muted)",
                      }}
                    >
                      Advanced Editing
                    </button>
                  </div>
                  <select
                    value={previewKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as SchedulePreviewKind;
                      setPreviewKind(nextKind);
                      if (nextKind === "student") setScheduleViewMode("student");
                      if (nextKind === "operations" || nextKind === "rotation") setScheduleViewMode("operations");
                    }}
                    className="cfsp-input h-10 min-w-[170px] rounded-[10px] px-3"
                    aria-label="Schedule preview type"
                  >
                    {schedulePreviewKindOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setShowSchedulePreview(true)} className="cfsp-btn cfsp-btn-secondary">
                    View Schedule Preview
                  </button>
                </div>
                <div
                  className="inline-flex flex-wrap items-center gap-2 rounded-full px-3 py-2 text-sm font-bold"
                  style={{
                    border: `1px solid ${saveStateAppearance.border}`,
                    background: saveStateAppearance.background,
                    color: saveStateAppearance.color,
                  }}
                >
                  <span>{saveStateAppearance.label}</span>
                  {lastSavedLabel ? <span style={{ color: "var(--cfsp-text-muted)" }}>Saved {lastSavedLabel}</span> : null}
                </div>
              </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
            <section className="cfsp-panel px-4 py-4">
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Event</h3>
              <div className="mt-4 grid gap-4">
                {!props.fixedEventId ? (
                  <label className="grid gap-2">
                    <span className="cfsp-label">Select event</span>
                    <select
                      value={selectedEventId}
                      onChange={(event) => setSelectedEventId(event.target.value)}
                      className="cfsp-input"
                    >
                      {events.map((event) => (
                        <option key={event.id} value={event.id}>
                          {event.name || "Untitled Event"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {selectedEvent ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                      <div className="cfsp-label">Event</div>
                      <div className="mt-2 text-base font-black text-[#14304f]">{selectedEvent.name || "Untitled Event"}</div>
                    </div>
                    <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                      <div className="cfsp-label">Date</div>
                      <div className="mt-2 text-base font-black text-[#14304f]">{formatEventDate(selectedEvent)}</div>
                    </div>
                    <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                      <div className="cfsp-label">Location</div>
                      <div className="mt-2 text-base font-black text-[#14304f]">{selectedEvent.location || "TBD"}</div>
                    </div>
                    <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                      <div className="cfsp-label">SP Coverage</div>
                      <div className="mt-2 text-base font-black text-[#14304f]">
                        {Number(selectedEvent.confirmed_assignments || 0)} / {Number(selectedEvent.sp_needed || 0)}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Assigned SPs</div>
                  <div className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#6a7e91]">
                    builder SP source: event_sps confirmed primary
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-[#547189]">
                    confirmed SP count: {assignedNames.length}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assignedNames.length ? (
                      assignedNames.map((name) => (
                        <span key={name} className="cfsp-chip">
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm font-semibold text-[#6a7e91]">No confirmed event SPs yet</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="cfsp-panel px-4 py-4">
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Learners</h3>
              <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                Upload a CSV or Excel roster to populate real learner names. If you skip the upload, the builder will use Learner 1,
                Learner 2, and so on.
              </p>
              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="cfsp-label">Student list CSV / XLSX</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(event) => void handleLearnerUpload(event.target.files?.[0] || null)}
                    className="cfsp-input"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={downloadStudentRosterTemplate} className="cfsp-btn cfsp-btn-secondary">
                    Download Student Roster Template
                  </button>
                  <button type="button" onClick={() => void handleRequestStudentList()} className="cfsp-btn cfsp-btn-secondary">
                    Request Student List
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#5e7388]">
                  <span className="cfsp-chip">{studentListRequestStatusLabel}</span>
                  {studentListRequestDraftedLabel && activeRealLearnerCount === 0 ? (
                    <span>Last drafted {studentListRequestDraftedLabel}</span>
                  ) : null}
                </div>
                <div className="text-sm font-semibold text-[#5e7388]">
                  Use the Student Name column for learner names. Email Address and Notes are optional.
                </div>
                <label className="grid gap-2">
                  <span className="cfsp-label">Manual Student / Learner List</span>
                  <textarea
                    ref={learnerListTextareaRef}
                    className="cfsp-input"
                    value={uploadedLearners.join("\n")}
                    onChange={(event) => handleManualLearnerRosterChange(event.target.value)}
                    placeholder={"One learner per line\nAlex Smith\nJordan Lee"}
                    style={{ minHeight: 132, resize: "vertical" }}
                  />
                </label>
                {learnerUploadError ? <div className="cfsp-alert cfsp-alert-error">{learnerUploadError}</div> : null}
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Active learner roster</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">
                    {activeLearnerSourceIsExplicit
                      ? `${explicitLearnerCount} uploaded learners`
                      : `${activeLearnerCount} generated learners`}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                    {activeLearnerSourceIsExplicit
                      ? learnerFileName
                        ? `Source: ${learnerFileName}`
                        : "Using uploaded/manual learner names."
                      : hasEventSetupLearnerCount
                        ? "Source: Event Setup or builder-generated fallback."
                        : "Source: builder-generated fallback learner names."}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {learnerRoster.length > 1 ? (
                      <button type="button" onClick={handleRandomizeLearners} className="cfsp-btn cfsp-btn-secondary">
                        Randomize Learner Spread
                      </button>
                    ) : null}
                    <button type="button" onClick={handleEditLearnerCount} className="cfsp-btn cfsp-btn-secondary">
                      Edit Learner Count
                    </button>
                    <button type="button" onClick={handleReviewLearners} className="cfsp-btn cfsp-btn-secondary">
                      Review Learners
                    </button>
                    {activeLearnerSourceIsExplicit && uploadedLearners.length ? (
                      <>
                        <button type="button" onClick={() => setShowClearRosterDialog(true)} className="cfsp-btn cfsp-btn-secondary">
                          Clear Roster
                        </button>
                      </>
                    ) : null}
                    {activeLearnerSourceIsExplicit && originalUploadedLearners.length ? (
                      <button type="button" onClick={handleResetLearnerOrder} className="cfsp-btn cfsp-btn-secondary">
                        Reset Uploaded Order
                      </button>
                    ) : null}
                    {activeLearnerSourceIsExplicit && rosterCountMismatch ? (
                      <>
                        <button type="button" onClick={handleUseRosterLearnerCount} className="cfsp-btn cfsp-btn-secondary">
                          Use roster count
                        </button>
                        <button
                          type="button"
                          onClick={handleUpdateEventSetupFromRosterCount}
                          className="cfsp-btn cfsp-btn-secondary"
                        >
                          Update Event Setup count
                        </button>
                      </>
                    ) : null}
                    {!activeLearnerSourceIsExplicit && generatedLearnerCountMismatch && hasEventSetupLearnerCount ? (
                      <>
                        <button type="button" onClick={handleSyncLearnersFromEventSetup} className="cfsp-btn cfsp-btn-secondary">
                          Sync Learners from Event Setup
                        </button>
                        <button type="button" onClick={handleKeepBuilderDraftLearners} className="cfsp-btn cfsp-btn-secondary">
                          Keep Builder Draft
                        </button>
                      </>
                    ) : null}
                  </div>
                  {learnerCountMismatchMessage ? (
                    <div className="mt-3 cfsp-alert cfsp-alert-error">{learnerCountMismatchMessage}</div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeLearnerRosterSeed.slice(0, 10).map((learner, learnerIndex) => (
                    <span key={`${learner}-${learnerIndex}`} className="cfsp-chip">
                      {learner}
                    </span>
                  ))}
                  {activeLearnerCount > 10 ? (
                    <span className="text-sm font-semibold text-[#6a7e91]">+{activeLearnerCount - 10} more</span>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
            <section className="cfsp-panel px-4 py-4">
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Schedule Context Summary</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Start Time</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">
                    {parsedStartMinutes === null ? "Invalid start time" : toDisplayTime(parsedStartMinutes)}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-[#5e7388]">{currentTimeSourceLabel}</div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">End Time</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">
                    {scheduledRounds.length || generated.rounds.length ? formatTimeWithDayOffset(totalEventEnd) : "Not generated yet"}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-[#5e7388]">
                    {referenceEndTimeLabel || "Calculated from the builder settings"}
                  </div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Rounds Needed</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">{effectiveRoundCount}</div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Total Event Duration</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">{totalEventDuration} minutes</div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Estimated Staff Day</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">{estimatedStaffDayLength} minutes</div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Seats per Round</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">{Math.max(slotsPerRound, 0)}</div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">{roomCapacityLabel}</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">{parsedRoomCapacity}</div>
                </div>
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="cfsp-label">Configured Block Length</div>
                  <div className="mt-2 text-base font-black text-[#14304f]">{configuredBlockLengthForDisplay} minutes</div>
                  <div className="mt-1 text-xs font-semibold text-[#5e7388]">{configuredBlockLengthDetail}</div>
                </div>
              </div>
              {learnerCapacitySummary ? (
                <div className="cfsp-alert cfsp-alert-info mt-4">{learnerCapacitySummary}</div>
              ) : null}
              {roundMismatchMessage ? (
                <div className="cfsp-alert cfsp-alert-error mt-4">{roundMismatchMessage}</div>
              ) : null}
              {effectiveLearnerInputCount > 0 && slotsPerRound > 0 ? (
                <div className="mt-3 text-sm font-semibold text-[#5e7388]">
                  {slotsPerRound} seats per round across {totalRoomCount} configured room
                  {totalRoomCount === 1 ? "" : "s"}.
                </div>
              ) : null}
              {effectiveLearnerInputCount > 0 && slotsPerRound <= 0 ? (
                <div className="cfsp-alert cfsp-alert-error mt-4">
                  Add at least one usable room or flex seat to calculate the required rounds.
                </div>
              ) : null}
              {manualRoundOverrideApplies && effectiveLearnerInputCount > 0 && slotsPerRound > 0 ? (
                <div className="cfsp-alert cfsp-alert-info mt-4">
                  Manual round override is active. Auto-calculated need is {autoCalculatedRounds} rounds based on learner count and room capacity.
                </div>
              ) : null}
              {unplacedLearnerCount > 0 ? (
                <div className="cfsp-alert cfsp-alert-error mt-4">
                  {unplacedLearnerCount} learner{unplacedLearnerCount === 1 ? "" : "s"} cannot fit in the current manual schedule. Add more rounds,{" "}
                  {isVirtualEvent ? "breakout rooms, or students per breakout room" : "exam rooms, flex rooms, or room capacity"}.
                </div>
              ) : null}
              {timingValidationMessages.length ? (
                <div className="cfsp-alert cfsp-alert-error mt-4">
                  {timingValidationMessages.join(" ")}
                </div>
              ) : null}
              {absurdRoundLengthAdvisory ? (
                <div className="cfsp-alert cfsp-alert-error mt-4">
                  {absurdRoundLengthAdvisory}
                </div>
              ) : null}
              {scheduleOverrunAdvisory ? (
                <div className="cfsp-alert cfsp-alert-error mt-4">
                  {scheduleOverrunAdvisory}
                </div>
              ) : null}
            </section>

            <section className="cfsp-panel px-4 py-4">
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Core Schedule Setup</h3>
              <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                Use the core scheduling inputs below to generate a standard session schedule quickly.
              </p>
              <div className="mt-3 text-sm font-semibold text-[#5e7388]">
                Student roster upload lives in the Learners panel and drives the automatic rounds calculation.
              </div>
              <div className="mt-4 rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <label className="grid gap-2">
                    <span className="cfsp-label">Start time</span>
                    <input type="time" value={startTime} onChange={(event) => handleStartTimeChange(event.target.value)} className="cfsp-input" />
                    <span className="text-xs font-semibold text-[#5e7388]">{currentTimeSourceLabel}</span>
                  </label>
                  <div className="grid gap-2">
                    <span className="cfsp-label">End time</span>
                    <div className="cfsp-input flex items-center bg-[#eef5fb] font-black text-[#14304f]">
                      {generated.rounds.length ? formatTimeWithDayOffset(rotationEnd) : "Not generated yet"}
                    </div>
                    <span className="text-xs font-semibold text-[#5e7388]">
                      {referenceEndTimeLabel || "Calculated from rounds and block settings"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div style={{ display: "grid", gap: "10px" }}>
                  <NumberInput
                    label={roomCountLabel}
                    value={examRoomCount}
                    onChange={handleExamRoomCountChange}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="cfsp-btn cfsp-btn-secondary"
                      onClick={() => handleExamRoomDelta(-1)}
                    >
                      − Room
                    </button>
                    <button
                      type="button"
                      className="cfsp-btn cfsp-btn-primary"
                      onClick={() => handleExamRoomDelta(1)}
                    >
                      + Room
                    </button>
                  </div>
                </div>
                <NumberInput label={roomCapacityLabel} value={roomCapacity} onChange={handleRoomCapacityChange} />
                {!isVirtualEvent ? (
                  <NumberInput label="Number of flex rooms" value={flexRoomCount} onChange={handleFlexRoomCountChange} />
                ) : null}
                <NumberInput label="Encounter time" value={encounterMinutes} onChange={handleEncounterMinutesChange} />
                <ToggleInput label="Checklist Time" checked={checklistEnabled} onChange={handleChecklistEnabledChange} />
                {checklistEnabled ? (
                  <>
                    <NumberInput label="Checklist Minutes" value={checklistMinutes} onChange={handleChecklistMinutesChange} />
                    <SelectInput
                      label="Checklist Placement"
                      value={checklistPlacement}
                      options={[
                        { value: "before_encounter", label: "Before Encounter" },
                        { value: "before_feedback", label: "Before Feedback" },
                        { value: "after_feedback", label: "After Feedback" },
                      ]}
                      onChange={handleChecklistPlacementChange}
                    />
                  </>
                ) : null}
                <NumberInput label="Feedback time" value={feedbackMinutes} onChange={handleFeedbackMinutesChange} />
                <NumberInput label="Transition time" value={transitionMinutes} onChange={handleTransitionMinutesChange} />
              </div>
              {multipleCasesEnabled ? (
              <div className="mt-4 rounded-[16px] border-2 border-[#145b96] bg-[#eef7ff] px-4 py-4 shadow-[0_14px_30px_rgba(20,91,150,0.12)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-[0.78rem] font-black uppercase tracking-[0.1em] text-[#145b96]">Case Rotation Setup</div>
                    <h3 className="mt-2 mb-0 text-[1.3rem] font-black text-[#14304f]">Cases drive the schedule math</h3>
                    <div className="mt-2 text-sm font-bold leading-6 text-[#365a76]">
                      {multipleCasesEnabled
                        ? "CFSP will build rounds so every group sees every active case once."
                        : "Single-case events stay simple. Turn on multiple cases when case rotation should drive the schedule math."}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <label className="inline-flex items-center gap-2 rounded-full border border-[#c7dcee] bg-white px-3 py-2 text-xs font-black text-[#14304f]">
                      <input
                        type="checkbox"
                        checked={multipleCasesEnabled}
                        onChange={(event) => handleMultipleCasesToggle(event.target.checked)}
                        style={{ accentColor: "#145b96" }}
                      />
                      This event contains multiple cases
                    </label>
                    <button type="button" onClick={handleAddBuilderCase} className="cfsp-btn cfsp-btn-primary">
                      Add Case
                    </button>
                    <button type="button" onClick={() => handleDuplicateBuilderCase()} className="cfsp-btn cfsp-btn-secondary">
                      Duplicate Case
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveBuilderCase()}
                      className="cfsp-btn cfsp-btn-secondary"
                      disabled={!scheduleCaseDefinitions.length}
                    >
                      Remove Case
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <label className="grid gap-2 rounded-[12px] border border-[#c7dcee] bg-white px-3 py-3">
                    <span className="cfsp-label">How many cases?</span>
                    <input
                      className="cfsp-input"
                      defaultValue={String(scheduleCaseDefinitions.length || activeCaseCount || "")}
                      onBlur={(event) => void handleEnsureBuilderCaseCount(event.target.value)}
                      placeholder="4"
                    />
                  </label>
                  <div className="rounded-[12px] border border-[#c7dcee] bg-white px-3 py-3">
                    <div className="cfsp-label">Every group sees every case?</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">
                      {multipleCasesEnabled ? "Yes" : "Not needed"}
                    </div>
                  </div>
                  <NumberInput label="Students per group" value={roomCapacity} onChange={handleRoomCapacityChange} />
                  <div className="rounded-[12px] border border-[#c7dcee] bg-white px-3 py-3">
                    <div className="cfsp-label">Active case rooms</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">{activeCaseRoomCount}</div>
                  </div>
                  <div className="rounded-[12px] border border-[#c7dcee] bg-white px-3 py-3">
                    <div className="cfsp-label">Extra rooms</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">
                      {configuredFlexRoomCountForDisplay
                        ? `${configuredFlexRoomCountForDisplay} configured flex`
                        : "None"}
                    </div>
                  </div>
                </div>
                {multipleCasesEnabled && activeCaseCount > parsedExamRooms && parsedExamRooms > 0 ? (
                  <div className="cfsp-alert cfsp-alert-error mt-4">
                    {activeCaseCount} active cases exceed {parsedExamRooms} exam rooms. Add rooms, deactivate cases, or expect additional rotation waves.
                  </div>
                ) : null}
                {multipleCasesEnabled ? (
                  <div className="cfsp-alert cfsp-alert-info mt-4">
                    {effectiveLearnerInputCount || 0} learner{effectiveLearnerInputCount === 1 ? "" : "s"} in groups of {parsedRoomCapacity} rotating through {activeCaseCount} active case{activeCaseCount === 1 ? "" : "s"} requires {effectiveRoundCount} round{effectiveRoundCount === 1 ? "" : "s"}.
                    {configuredFlexRoomCountForDisplay ? ` ${configuredFlexRoomCountForDisplay} flex room${configuredFlexRoomCountForDisplay === 1 ? "" : "s"} configured separately.` : ""}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3">
                  {(scheduleCaseDefinitions.length ? scheduleCaseDefinitions : [{ id: "case-placeholder", name: "", active: true }]).map((caseDef, caseIndex) => (
                    <div key={`${caseDef.id}-${caseIndex}`} className="rounded-[12px] border border-[#dce6ee] bg-white px-3 py-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-black text-[#14304f]">Case {caseIndex + 1}</div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => handleDuplicateBuilderCase(caseIndex)} className="cfsp-btn cfsp-btn-secondary">
                            Duplicate
                          </button>
                          <button type="button" onClick={() => handleMoveBuilderCase(caseIndex, -1)} disabled={caseIndex === 0} className="cfsp-btn cfsp-btn-secondary">
                            Move Up
                          </button>
                          <button type="button" onClick={() => handleMoveBuilderCase(caseIndex, 1)} disabled={caseIndex === scheduleCaseDefinitions.length - 1} className="cfsp-btn cfsp-btn-secondary">
                            Move Down
                          </button>
                          <button type="button" onClick={() => handleRemoveBuilderCase(caseIndex)} className="cfsp-btn cfsp-btn-secondary">
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <label className="grid gap-2">
                          <span className="cfsp-label">Case title</span>
                          <input
                            className="cfsp-input"
                            defaultValue={caseDef.name}
                            onBlur={(event) => void handleSaveBuilderCase(caseIndex, { name: event.target.value })}
                            placeholder={`Case ${caseIndex + 1}`}
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="cfsp-label">Fixed room</span>
                          <input
                            className="cfsp-input"
                            defaultValue={caseDef.roomAssignment || `Exam ${caseIndex + 1}`}
                            onBlur={(event) => void handleSaveBuilderCase(caseIndex, { roomAssignment: event.target.value })}
                            placeholder={`Exam ${caseIndex + 1}`}
                          />
                        </label>
                        <div className="grid gap-2">
                          <span className="cfsp-label">Uploaded case file</span>
                          <div className="cfsp-input flex items-center bg-[#f8fbfd] text-sm font-bold text-[#5e7388]">
                            {caseDef.hasDocument ? caseDef.documentName || "Document attached" : "No document attached"}
                          </div>
                        </div>
                        <label className="grid gap-2">
                          <span className="cfsp-label">Encounter min</span>
                          <input
                            className="cfsp-input"
                            defaultValue={caseDef.encounterMinutes ? String(caseDef.encounterMinutes) : ""}
                            onBlur={(event) => void handleSaveBuilderCase(caseIndex, { encounterMinutes: parseNumber(event.target.value, 0) || undefined })}
                            placeholder={encounterMinutes}
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="cfsp-label">Status</span>
                          <select
                            className="cfsp-input"
                            defaultValue={caseDef.active ? "active" : "inactive"}
                            onChange={(event) => void handleSaveBuilderCase(caseIndex, { active: event.target.value === "active" })}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </label>
                        <label className="grid gap-2">
                          <span className="cfsp-label">Assigned SP</span>
                          <input
                            className="cfsp-input"
                            defaultValue={
                              normalizeDisplayText(
                                roomAdjustments.roundsByNumber.get(1)?.find((slot) => slot.slotIndex === caseIndex)?.spName ||
                                  selectedEvent?.assigned_sp_names?.[caseIndex]
                              ) ||
                              ""
                            }
                            onBlur={(event) => void handleSaveCaseStationOverride(caseIndex, { spName: event.target.value, caseLabel: caseDef.name })}
                            placeholder="SP name"
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="cfsp-label">Role / portrayal</span>
                          <input
                            className="cfsp-input"
                            defaultValue={normalizeDisplayText(
                              roomAdjustments.roundsByNumber.get(1)?.find((slot) => slot.slotIndex === caseIndex)?.roleLabel
                            )}
                            onBlur={(event) => void handleSaveCaseStationOverride(caseIndex, { roleLabel: event.target.value, caseLabel: caseDef.name })}
                            placeholder="Patient, nurse, family..."
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="cfsp-label">Checklist min</span>
                          <input
                            className="cfsp-input"
                            defaultValue={caseDef.checklistMinutes ? String(caseDef.checklistMinutes) : ""}
                            onBlur={(event) => void handleSaveBuilderCase(caseIndex, { checklistMinutes: parseNumber(event.target.value, 0) || undefined })}
                            placeholder={checklistMinutes}
                          />
                        </label>
                        <label className="grid gap-2">
                          <span className="cfsp-label">Feedback min</span>
                          <input
                            className="cfsp-input"
                            defaultValue={caseDef.feedbackMinutes ? String(caseDef.feedbackMinutes) : ""}
                            onBlur={(event) => void handleSaveBuilderCase(caseIndex, { feedbackMinutes: parseNumber(event.target.value, 0) || undefined })}
                            placeholder={feedbackMinutes}
                          />
                        </label>
                        <label className="grid gap-2 md:col-span-2">
                          <span className="cfsp-label">Role names/descriptions</span>
                          <input
                            className="cfsp-input"
                            defaultValue={caseDef.notes || ""}
                            onBlur={(event) => void handleSaveBuilderCase(caseIndex, { notes: event.target.value })}
                            placeholder="Patient, nurse, family member, observer notes..."
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                {multipleCasesEnabled ? (
                <div className="mt-4 rounded-[12px] border border-[#c7dcee] bg-white px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="cfsp-label">Student Groups</div>
                      <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                        Edit group membership directly. Group size follows Students per group.
                      </div>
                    </div>
                    <button type="button" onClick={handleCreateLearnerGroup} className="cfsp-btn cfsp-btn-secondary">
                      Create Group
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {builderLearnerGroups.length ? builderLearnerGroups.map((group, groupIndex) => (
                      <div key={`builder-group-${groupIndex}`} className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-black text-[#14304f]">Group {groupIndex + 1}</div>
                          <button type="button" onClick={() => handleDeleteLearnerGroup(groupIndex)} className="cfsp-btn cfsp-btn-secondary">
                            Delete
                          </button>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {group.labels.map((learner, memberIndex) => {
                            const learnerIndex = group.indexes[memberIndex];
                            return (
                              <div key={`builder-group-${groupIndex}-${learnerIndex}`} className="grid gap-2">
                                <input
                                  className="cfsp-input"
                                  value={learner}
                                  onChange={(event) => handleUpdateLearnerAt(learnerIndex, event.target.value)}
                                  placeholder="Student name"
                                />
                                <div className="flex gap-2">
                                  <select
                                    className="cfsp-input"
                                    defaultValue=""
                                    onChange={(event) => {
                                      const targetGroup = Number(event.target.value);
                                      if (Number.isFinite(targetGroup)) handleMoveLearnerToGroup(learnerIndex, targetGroup);
                                      event.currentTarget.value = "";
                                    }}
                                  >
                                    <option value="">Move to group...</option>
                                    {builderLearnerGroups.map((_, targetIndex) => (
                                      <option key={`move-${learnerIndex}-${targetIndex}`} value={targetIndex}>
                                        Group {targetIndex + 1}
                                      </option>
                                    ))}
                                  </select>
                                  <button type="button" onClick={() => handleRemoveLearnerAt(learnerIndex)} className="cfsp-btn cfsp-btn-secondary">
                                    Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )) : (
                      <div className="rounded-[12px] border border-dashed border-[#c9d7e3] bg-white px-4 py-4 text-sm font-semibold text-[#5e7388]">
                        Upload or create learners to edit groups.
                      </div>
                    )}
                  </div>
                </div>
                ) : null}
              </div>
              ) : (
                <div className="mt-4 rounded-[14px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="cfsp-label">Single-case student schedule</div>
                      <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                        Use this when learners only need one case assignment, even if multiple case files exist.
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-full border border-[#c7dcee] bg-white px-3 py-2 text-xs font-black text-[#14304f]">
                      <input
                        type="checkbox"
                        checked={multipleCasesEnabled}
                        onChange={(event) => handleMultipleCasesToggle(event.target.checked)}
                        style={{ accentColor: "#145b96" }}
                      />
                      This event contains multiple cases
                    </label>
                  </div>
                </div>
              )}
              <div className="mt-4 rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                  <div className="cfsp-label">Reusable Schedule Blocks</div>
                  <div className="mt-2 text-sm font-semibold leading-6 text-[#5e7388]">
                      Add optional schedule items such as breaks, checklist time, SOAP notes, feedback, lunch, transitions, or custom blocks around rotation rounds.
                  </div>
                </div>
                  <button type="button" onClick={handleAddDayBlock} className="cfsp-btn cfsp-btn-secondary">
                    Add Schedule Block
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  {dayBlocks.length ? (
                    dayBlocks.map((block, index) => (
                      <div key={block.id} className="rounded-[12px] border border-[#dce6ee] bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-black text-[#14304f]">
                            {asText(block.label) || getDefaultDayBlockLabel(block.type)}{" "}
                            <span style={{ color: "#5e7388", fontWeight: 700 }}>
                              · Schedule Block {index + 1}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleMoveDayBlock(block.id, "up")}
                              className="cfsp-btn cfsp-btn-secondary"
                              disabled={index === 0}
                            >
                              Move Up
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveDayBlock(block.id, "down")}
                              className="cfsp-btn cfsp-btn-secondary"
                              disabled={index === dayBlocks.length - 1}
                            >
                              Move Down
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDayBlock(block.id)}
                              className="cfsp-btn cfsp-btn-secondary"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <SelectInput
                            label="Block type"
                            value={block.type}
                            options={[
                              { value: "break", label: "Break" },
                              { value: "checklist", label: "Checklist" },
                              { value: "soap_notes", label: "SOAP Notes" },
                              { value: "feedback", label: "Feedback" },
                              { value: "debrief", label: "Debrief" },
                              { value: "lunch", label: "Lunch" },
                              { value: "transition", label: "Transition" },
                              { value: "custom", label: "Custom" },
                            ]}
                            onChange={(value) => handleUpdateDayBlock(block.id, { type: value as DayBlockType })}
                          />
                          <label className="grid gap-2">
                            <span className="cfsp-label">Label</span>
                            <input
                              className="cfsp-input"
                              value={block.label}
                              onChange={(event) => handleUpdateDayBlock(block.id, { label: event.target.value })}
                            />
                          </label>
                          <NumberInput
                            label="Duration minutes"
                            value={block.durationMinutes}
                            onChange={(value) => handleUpdateDayBlock(block.id, { durationMinutes: value })}
                          />
                          <SelectInput
                            label="Placement"
                            value={block.placement}
                            options={[
                              { value: "before_rotations", label: "Before rotations" },
                              { value: "after_each_rotation", label: "After each rotation" },
                              { value: "after_every_x_rotations", label: "After every X rotations" },
                              { value: "after_rotations", label: "After rotations" },
                              { value: "specific_time", label: "Specific time" },
                            ]}
                            onChange={(value) => handleUpdateDayBlock(block.id, { placement: value as DayBlockPlacement })}
                          />
                          {block.placement === "after_every_x_rotations" ? (
                            <NumberInput
                              label="After every X rotations"
                              value={block.placementInterval}
                              onChange={(value) => handleUpdateDayBlock(block.id, { placementInterval: value })}
                            />
                          ) : block.placement === "specific_time" ? (
                            <TimeInput
                              label="Specific time"
                              value={block.specificTime}
                              onChange={(value) => handleUpdateDayBlock(block.id, { specificTime: value })}
                            />
                          ) : (
                            <div className="grid gap-2">
                              <span className="cfsp-label">Placement detail</span>
                              <div className="cfsp-input flex items-center bg-[#eef5fb] text-sm font-semibold text-[#5e7388]">
                                {block.placement === "before_rotations"
                                  ? "Scheduled before the first rotation round"
                                  : block.placement === "after_rotations"
                                    ? "Scheduled after the last rotation round"
                                    : "Scheduled after each rotation round"}
                              </div>
                            </div>
                          )}
                          <SelectInput
                            label="Visible to"
                            value={block.visibleTo}
                            options={[
	                              { value: "student", label: "Student Schedule" },
	                              { value: "operations", label: "Room Operations" },
	                              { value: "both", label: "Both" },
                            ]}
                            onChange={(value) => handleUpdateDayBlock(block.id, { visibleTo: value as DayBlockVisibility })}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[12px] border border-dashed border-[#c9d7e3] bg-white px-4 py-4 text-sm font-semibold text-[#5e7388]">
                      No reusable schedule blocks added.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          {builderMode === "advanced" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="cfsp-panel px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Advanced Scheduling Controls</h3>
                    <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                      These timing details are optional. They only affect the schedule when enabled or set to a nonzero value.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleRandomizeLearners} className="cfsp-btn cfsp-btn-secondary">
                      Randomize Learner Spread
                    </button>
                    {originalUploadedLearners.length ? (
                      <button type="button" onClick={handleResetLearnerOrder} className="cfsp-btn cfsp-btn-secondary">
                        Reset Uploaded Order
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <TimeInput label="Staff arrival time" value={staffArrivalTime} onChange={setStaffArrivalTime} />
                  <TimeInput label="SP arrival time" value={spArrivalTime} onChange={setSpArrivalTime} />
                  <TimeInput label="Faculty arrival time" value={facultyArrivalTime} onChange={setFacultyArrivalTime} />
                  {!isVirtualEvent ? (
                    <NumberInput label="Flex capacity" value={maxPairsPerFlexRoom} onChange={handleMaxPairsPerFlexRoomChange} />
                  ) : null}
                  <NumberInput label="Room setup minutes" value={roomSetupMinutes} onChange={setRoomSetupMinutes} />
                  <NumberInput label="Student prebrief minutes" value={studentPrebriefMinutes} onChange={setStudentPrebriefMinutes} />
                  <NumberInput label="SP prebrief minutes" value={spPrebriefMinutes} onChange={setSpPrebriefMinutes} />
                  <NumberInput label="Faculty prebrief minutes" value={facultyPrebriefMinutes} onChange={handleFacultyPrebriefMinutesChange} />
                  <NumberInput label="Round target minutes (optional)" value={sessionLengthMinutes} onChange={handleRoundTargetMinutesChange} />
                  <ToggleInput label="Manual rounds override" checked={manualRoundOverride} onChange={handleManualRoundOverrideChange} />
                  <NumberInput label="Manual round count" value={roundCount} onChange={handleManualRoundCountChange} disabled={!manualRoundOverride} />
                </div>
              </section>

              <section className="cfsp-panel px-4 py-4">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Workspace Status</h3>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Advanced settings</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">
                      {advancedSettingsActive ? "Active" : "Inactive"}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                      Set arrival, prebrief, manual round overrides, or optional round targets only when you want them included in the builder. Use reusable schedule blocks for breaks, checklist steps, SOAP notes, feedback, and debrief timing.
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}
            </div>
          </details>

          <section className="cfsp-panel px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Day Flow</h3>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Round timing, encounters, feedback, transitions, and major day blocks.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {renderScheduleViewToggle(false)}
              </div>
            </div>

            {copyMessage ? (
              <div className={`mt-4 text-sm font-semibold ${copyMessageTone === "error" ? "text-[#c23b3b]" : "text-[#196b57]"}`}>
                {copyMessage}
              </div>
            ) : null}
            {scheduleValidationMessages.length ? (
              <div className="cfsp-alert cfsp-alert-info mt-4">
                <strong>Before completion:</strong> {scheduleValidationMessages.join(" ")}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-black text-[#14304f]">Status: {scheduleWorkflowBadgeLabel}</div>
              <span
                className="rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em]"
                style={{
                  borderColor:
                    scheduleWorkflowStatus === "complete"
                      ? "rgba(44, 211, 173, 0.28)"
                      : scheduleWorkflowStatus === "in_progress"
                        ? "rgba(73, 168, 255, 0.28)"
                        : "rgba(148, 163, 184, 0.24)",
                  background:
                    scheduleWorkflowStatus === "complete"
                      ? "rgba(209, 250, 229, 0.52)"
                      : scheduleWorkflowStatus === "in_progress"
                        ? "rgba(219, 234, 254, 0.58)"
                        : "rgba(241, 245, 249, 0.7)",
                  color:
                    scheduleWorkflowStatus === "complete"
                      ? "#0f766e"
                      : scheduleWorkflowStatus === "in_progress"
                        ? "#1d4ed8"
                        : "#5e7388",
                }}
              >
                {scheduleWorkflowBadgeLabel}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[#5e7388]">
                Compact day flow keeps the full schedule visible without the long stacked scroll.
              </div>
              <button
                type="button"
                onClick={() => setShowExpandedFlowDetails((current) => !current)}
                className="cfsp-btn cfsp-btn-secondary"
              >
                {showExpandedFlowDetails ? "Collapse Flow Details" : "Expand Flow Details"}
              </button>
            </div>

            {parsedStartMinutes === null ? (
              <div className="cfsp-alert cfsp-alert-error mt-5">Enter a valid start time to generate day flow.</div>
            ) : (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#5e7388]">
                        Flow rail
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[#5e7388]">
                        A compact operational rail for pacing, transitions, and major pauses.
                      </div>
                    </div>
                    {selectedBuilderRoundContext ? (
                      <div className="rounded-full border border-[#c7dcee] bg-[#edf5fb] px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#165a96]">
                        Focused on Round {selectedBuilderRoundContext.round}
                      </div>
                    ) : null}
                  </div>

                  {compactFlowEntries.map((entry) =>
                    entry.kind === "wide" ? (
                      <div
                        key={entry.key}
                        className="rounded-[14px] border px-4 py-3"
                        style={{
                          background:
                            entry.block.tone === "prebrief"
                              ? "#eefbf6"
                              : entry.block.tone === "wrap"
                                ? "#fff6e8"
                                : "#edf5fb",
                          borderColor:
                            entry.block.tone === "prebrief"
                              ? "#bfe4d6"
                              : entry.block.tone === "wrap"
                                ? "#f1d1a7"
                                : "#c7dcee",
                          color:
                            entry.block.tone === "prebrief"
                              ? "#196b57"
                              : entry.block.tone === "wrap"
                                ? "#a86411"
                                : "#165a96",
                        }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-black uppercase tracking-[0.08em]">
                            {scheduleViewMode === "student" && isStudentFacingWidePrebriefBlock(entry.block)
                              ? getScheduleWidePrebriefLabel(entry.block)
                              : entry.block.label}
                          </div>
                          <div className="text-xs font-bold">
                            {scheduleViewMode === "student" && isStudentFacingWidePrebriefBlock(entry.block)
                              ? formatStudentPrebriefStart(entry.block)
                              : `${formatRange(entry.block.start, entry.block.end)} · ${formatDurationCompact(
                                  getBlockDurationMinutes(entry.block.start, entry.block.end)
                                )}`}
                          </div>
                        </div>
                        {entry.block.detail ? (
                          <div className="mt-1 text-xs font-semibold opacity-90">{entry.block.detail}</div>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        key={entry.key}
                        type="button"
                        className="w-full rounded-[14px] border px-4 py-3 text-left transition"
                        onClick={() => setSelectedBuilderRound(entry.round.round)}
                        style={{
                          borderColor: selectedBuilderRound === entry.round.round ? "#0f766e" : "#dce6ee",
                          background: selectedBuilderRound === entry.round.round ? "rgba(209, 250, 229, 0.26)" : "#f8fbfd",
                          boxShadow:
                            selectedBuilderRound === entry.round.round
                              ? "0 10px 24px rgba(15,118,110,0.10)"
                              : "0 6px 18px rgba(20,48,79,0.05)",
                        }}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#5e7388]">
                              Round {entry.round.round}
                            </div>
	                            <div className="mt-1 text-sm font-black text-[#14304f]">
	                              {showStudentTimingInMode
	                                ? formatStudentScheduleTimingLines(getStudentDisplayTiming(entry.round)).map((line) => (
                                      <div key={`${entry.key}-${line}`}>{line}</div>
                                    ))
	                                : formatRange(entry.round.start, entry.round.end)}
	                            </div>
                            {scheduleViewMode === "operations" ? (
                              <div className="mt-1 text-xs font-semibold text-[#5e7388]">
                                {getFlowRhythmSummary(entry.round)}
                              </div>
                            ) : null}
                          </div>
                          {scheduleViewMode === "operations" ? (
                            <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
                            {entry.round.subBlocks
                              .filter((subBlock) => !isMajorScheduleDividerBlock(subBlock) && !isFillerTimingLabel(subBlock.label))
                              .map((subBlock) => {
                              const durationMinutes = Math.max(getBlockDurationMinutes(subBlock.start, subBlock.end), 1);
                              const rhythmStyles = getFlowRhythmSegmentStyles(subBlock.label);
                              return (
                                <span
                                  key={`${entry.round.round}-${subBlock.label}-${subBlock.start}`}
                                  className="rounded-full border px-3 py-2 text-[0.72rem] font-black uppercase tracking-[0.08em]"
                                  style={{
                                    flex: `${Math.max(durationMinutes, 5)} 1 92px`,
                                    borderColor: rhythmStyles.borderColor,
                                    background: rhythmStyles.background,
                                    color: rhythmStyles.color,
                                  }}
                                >
                                  {subBlock.label} · {formatDurationCompact(durationMinutes)}
                                </span>
                              );
                            })}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    )
                  )}
                </div>

                {selectedBuilderRoundContext ? (
                  <div className="rounded-[16px] border border-[#c7dcee] bg-white px-4 py-4 shadow-[0_10px_22px_rgba(20,48,79,0.06)]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#5e7388]">
                          Selected round
                        </div>
	                          <div className="mt-2 text-base font-black text-[#14304f]">
	                          <div>Round {selectedBuilderRoundContext.round}</div>
	                          {showStudentTimingInMode ? (
                              <div className="mt-1 grid gap-1 text-sm">
                                {formatStudentScheduleTimingLines(getStudentDisplayTiming(selectedBuilderRoundContext)).map((line) => (
                                  <div key={`selected-${selectedBuilderRoundContext.round}-${line}`}>{line}</div>
                                ))}
                              </div>
                            ) : (
                              <div>{formatRange(selectedBuilderRoundContext.start, selectedBuilderRoundContext.end)}</div>
                            )}
	                        </div>
                        {scheduleViewMode === "operations" ? (
                          <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                            {getFlowRhythmSummary(selectedBuilderRoundContext)}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-full border border-[#dce6ee] bg-[#f8fbfd] px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#165a96]">
                        {selectedBuilderRoundContext.roomSlots.length} room
                        {selectedBuilderRoundContext.roomSlots.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    {scheduleViewMode === "operations" ? (
                      <>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedBuilderRoundContext.subBlocks
                            .filter((subBlock) => !isMajorScheduleDividerBlock(subBlock) && !isFillerTimingLabel(subBlock.label))
                            .map((subBlock) => (
                            <button
                              key={`${selectedBuilderRoundContext.round}-${subBlock.label}-${subBlock.start}`}
                              type="button"
                              className="min-w-[128px] rounded-[12px] border px-3 py-2 text-left text-xs font-bold transition"
                              onClick={() =>
                                setActiveFlowDetailKey((current) =>
                                  current === `selected-round-${subBlock.label}-${subBlock.start}`
                                    ? ""
                                    : `selected-round-${subBlock.label}-${subBlock.start}`
                                )
                              }
                              style={(() => {
                                const durationMinutes = Math.max(getBlockDurationMinutes(subBlock.start, subBlock.end), 1);
                                const rhythmStyles = getFlowRhythmSegmentStyles(subBlock.label);
                                return {
                                  flex: `${Math.max(durationMinutes, 6)} 1 128px`,
                                  borderColor: rhythmStyles.borderColor,
                                  background: rhythmStyles.background,
                                  color: rhythmStyles.color,
                                  boxShadow:
                                    activeFlowDetailKey === `selected-round-${subBlock.label}-${subBlock.start}`
                                      ? "0 0 0 1px rgba(15,118,110,0.12), 0 10px 18px rgba(20,48,79,0.08)"
                                      : "none",
                                };
                              })()}
                            >
                              <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] opacity-70">
                                {formatDurationCompact(getBlockDurationMinutes(subBlock.start, subBlock.end))}
                              </div>
                              <div className="mt-1 text-sm font-black leading-5">{subBlock.label}</div>
                            </button>
                          ))}
                        </div>
                        {selectedBuilderRoundContext.subBlocks
                          .filter((subBlock) => !isMajorScheduleDividerBlock(subBlock) && !isFillerTimingLabel(subBlock.label))
                          .map((subBlock) => {
                          const detailKey = `selected-round-${subBlock.label}-${subBlock.start}`;
                          if (activeFlowDetailKey !== detailKey) return null;
                          return (
                            <div
                              key={`${detailKey}-detail`}
                              className="mt-3 rounded-[12px] border border-[#c7dcee] bg-[#f8fbfd] px-3 py-3 text-sm"
                            >
                              <div className="font-black text-[#14304f]">{subBlock.label}</div>
                              <div className="mt-1 font-semibold text-[#5e7388]">
                                {formatRange(subBlock.start, subBlock.end)} · {getBlockDurationMinutes(subBlock.start, subBlock.end)} minutes
                              </div>
                              <div className="mt-1 font-semibold text-[#5e7388]">Round {selectedBuilderRoundContext.round}</div>
                              <div className="mt-1 font-semibold text-[#5e7388]">
                                Visibility: {subBlock.visibleTo === "both" || !subBlock.visibleTo ? "Both" : subBlock.visibleTo === "student" ? "Student" : "Operations"}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    ) : null}
                  </div>
                ) : null}

                {showExpandedFlowDetails ? (
                  <div className="grid gap-3">
                    {visibleTimeline.map((block) => {
                      const tone = getToneStyles(block.tone);
                      return (
                        <div
                          key={`${block.label}-${block.start}-${block.end}`}
                          className="rounded-[12px] border px-4 py-3"
                          style={{ background: tone.background, borderColor: tone.border, color: tone.color }}
                          >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="font-black">
                              {scheduleViewMode === "student" && isStudentFacingWidePrebriefBlock(block)
                                ? getScheduleWidePrebriefLabel(block)
                                : block.label}
                            </div>
                            <div className="text-sm font-bold">
                              {scheduleViewMode === "student" && isStudentFacingWidePrebriefBlock(block)
                                ? formatStudentPrebriefStart(block)
                                : formatRange(block.start, block.end)}
                            </div>
                          </div>
                          {block.detail ? <div className="mt-1 text-sm font-semibold opacity-90">{block.detail}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="cfsp-panel px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Rotation Schedule Reviewer</h3>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", margin: "14px 0", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, color: "#17324d" }}>
                    Rooms: {examRoomCount}
                  </span>
                  <button
                    type="button"
                    className="cfsp-btn cfsp-btn-secondary"
                    onClick={() => handleExamRoomDelta(-1)}
                  >
                    − Room
                  </button>
                  <button
                    type="button"
                    className="cfsp-btn cfsp-btn-primary"
                    onClick={() => handleExamRoomDelta(1)}
                  >
                    + Room
                  </button>
                </div>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Rows track the same rotation rounds shown on the event command surface, with room columns, learner flow, timing blocks, and operations context.
                </p>
              </div>
              <div className="inline-flex rounded-[12px] border border-[var(--cfsp-border)] p-1">
                <button
                  type="button"
                  onClick={() => setScheduleViewMode("student")}
                  className="rounded-[10px] px-4 py-2 text-sm font-black transition"
                  style={{
                    background: scheduleViewMode === "student" ? "var(--cfsp-blue)" : "transparent",
                    color: scheduleViewMode === "student" ? "#ffffff" : "var(--cfsp-text-muted)",
                  }}
                >
                  Student Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleViewMode("operations")}
                  className="rounded-[10px] px-4 py-2 text-sm font-black transition"
                  style={{
                    background: scheduleViewMode === "operations" ? "var(--cfsp-blue)" : "transparent",
                    color: scheduleViewMode === "operations" ? "#ffffff" : "var(--cfsp-text-muted)",
                  }}
                >
                  Admin Schedule
                </button>
              </div>
            </div>

            {parsedStartMinutes === null ? (
              <div className="cfsp-alert cfsp-alert-error mt-5">Enter a valid start time to generate the rotation schedule grid.</div>
            ) : !scheduledRounds.length ? (
              <div className="cfsp-alert cfsp-alert-info mt-5">Add enough rooms and schedule timing to generate the rotation schedule grid.</div>
            ) : (
              <div
                className="mt-5 max-w-full min-w-0 overflow-hidden rounded-[16px] border border-[#dce6ee] bg-[#f8fbfd]"
                style={{ width: "100%", maxWidth: "100%", contain: "inline-size" }}
              >
                <div className="border-b border-[#dce6ee] px-4 py-3 text-sm font-semibold text-[#5e7388]">
                  {scheduleViewMode === "student"
                    ? "Student Schedule excludes internal SP and case details."
                    : "Admin Schedule includes assigned SP, room, learner, and case details when available."}
                </div>
                <div
                  className="w-full max-w-full min-w-0 overflow-x-auto"
                  style={{
                    WebkitOverflowScrolling: "touch",
                    contain: "inline-size",
                    overscrollBehaviorX: "contain",
                  }}
                >
                <table
                  className="border-collapse text-left"
                  style={{
                    minWidth: "100%",
                    width: "max-content",
                    maxWidth: "none",
                  }}
                >
                  <thead>
                    <tr className="border-b border-[#dce6ee] text-sm text-[#5e7388]">
                      <th className="px-3 py-3 font-black">Round</th>
                      <th className="px-3 py-3 font-black">
                        {showStudentTimingInMode ? "Encounter Start" : "Time"}
                      </th>
                      {visibleRoomColumns.map((column) => (
                        <th key={`${column.slotIndex}-${column.roomName}`} className="px-3 py-3 font-black">
                          {column.displayRoomName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleGridRows.map((entry) => {
                      if (entry.kind === "wide") {
                        const durationMinutes = getBlockDurationMinutes(entry.block.start, entry.block.end);
                        return (
                          <tr key={entry.key} className="border-b border-[#eef3f7]">
                            <td colSpan={visibleRoomColumns.length + 2} className="px-3 py-3">
                              <div
                                className="rounded-[14px] border px-4 py-3"
                                style={{
                                  background:
                                    entry.block.tone === "prebrief"
                                      ? "#eefbf6"
                                      : entry.block.tone === "wrap"
                                        ? "#fff6e8"
                                        : "#edf5fb",
                                  borderColor:
                                    entry.block.tone === "prebrief"
                                      ? "#bfe4d6"
                                      : entry.block.tone === "wrap"
                                        ? "#f1d1a7"
                                        : "#c7dcee",
                                  color:
                                    entry.block.tone === "prebrief"
                                      ? "#196b57"
                                      : entry.block.tone === "wrap"
                                        ? "#a86411"
                                        : "#165a96",
                                }}
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="text-base font-black">
                                    {scheduleViewMode === "student" && isStudentFacingWidePrebriefBlock(entry.block)
                                      ? getScheduleWidePrebriefLabel(entry.block)
                                      : entry.block.label}
                                  </div>
                                  <div className="text-sm font-bold">
                                    {scheduleViewMode === "student" && isStudentFacingWidePrebriefBlock(entry.block)
                                      ? formatStudentPrebriefStart(entry.block)
                                      : `${formatRange(entry.block.start, entry.block.end)} · ${durationMinutes} minutes`}
                                  </div>
                                </div>
                                {entry.block.detail ? (
                                  <div className="mt-1 text-sm font-semibold opacity-90">{entry.block.detail}</div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      const round = entry.round;
                      const isSelectedContextRound = selectedBuilderRound === round.round;
                      return (
                        <tr
                          key={entry.key}
                          className="border-b border-[#eef3f7] align-top text-sm text-[#14304f]"
                          onClick={() => setSelectedBuilderRound(round.round)}
                          style={{
                            background: isSelectedContextRound ? "rgba(209, 250, 229, 0.36)" : undefined,
                            boxShadow: isSelectedContextRound ? "inset 4px 0 0 rgba(15, 118, 110, 0.72)" : undefined,
                            cursor: "pointer",
                          }}
                        >
                          <td className="px-3 py-4 font-black">
                            <div>Round {round.round}</div>
                            {isSelectedContextRound ? (
                              <div className="mt-2 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[#0f766e]">
                                Selected round
                              </div>
                            ) : null}
                          </td>
	                          <td className="px-3 py-4">
	                            <div className="font-bold">
	                              {showStudentTimingInMode
                                  ? formatStudentScheduleTimingLines(getStudentDisplayTiming(round)).map((line) => (
                                      <div key={`${round.round}-${line}`}>{line}</div>
                                    ))
                                  : formatRange(round.start, round.end)}
	                            </div>
                            {scheduleViewMode === "operations" ? (
                              <div className="mt-2 grid gap-1 text-xs font-semibold text-[#5e7388]">
                                {round.subBlocks
                                  .filter((subBlock) => !isMajorScheduleDividerBlock(subBlock))
                                  .map((subBlock) => (
                                  <div key={`${round.round}-${subBlock.label}-${subBlock.start}`}>
                                    {subBlock.label}: {formatRange(subBlock.start, subBlock.end)}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </td>
                          {round.roomSlots.map((slot, index) => (
                            <td key={`${round.round}-${slot.roomName}`} className="px-3 py-4">
                              <div
                                style={{
                                  border: `1px solid ${slot.roomType === "exam" ? "#c7dcee" : "#bfe4d6"}`,
                                  borderRadius: "12px",
                                  background: slot.roomType === "exam" ? "#edf5fb" : "#eefbf6",
                                  padding: "10px 12px",
                                  minWidth: "160px",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 800,
                                    color: slot.roomType === "exam" ? "#165a96" : "#196b57",
                                    fontSize: "12px",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {formatRoomName(slot.roomName, slot.roomType, index + 1, roomNamingContext)} · {slot.capacityLabel}
                                </div>
                                {scheduleViewMode === "operations" ? (
                                  <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#4f677d", lineHeight: 1.5 }}>
	                                    <div>
	                                      SP:{" "}
	                                      {normalizeDisplayText(slot.assignedSpName) ||
                                          (typeof slot.assignedSpIndex === "number" ? normalizeDisplayText(assignedNames[slot.assignedSpIndex]) : "") ||
                                          normalizeDisplayText(assignedNames[index]) ||
                                          "No SP assigned"}
	                                    </div>
                                    {normalizeDisplayText(slot.backupSpName) ? (
                                      <div>
                                        <strong>Backup:</strong> {normalizeDisplayText(slot.backupSpName)}
                                      </div>
                                    ) : (
                                      <div style={{ opacity: 0.72 }}>No backup assigned</div>
                                    )}
                                    {normalizeDisplayText(slot.caseLabel) ? (
                                      <div>Case: {normalizeDisplayText(slot.caseLabel)}</div>
                                    ) : null}
                                    {normalizeDisplayText(slot.roleLabel) ? (
                                      <div>Role: {normalizeDisplayText(slot.roleLabel)}</div>
                                    ) : null}
                                  </div>
                                ) : null}
	                                <div style={{ marginTop: "8px", display: "grid", gap: "6px" }}>
	                                  {slot.learnerLabels.length ? (
	                                    slot.learnerLabels.map((learner) => (
	                                      <div
	                                        key={`${slot.roomName}-${learner}`}
	                                        style={{
	                                          borderRadius: "999px",
	                                          background: "#ffffff",
	                                          border: "1px solid rgba(148,163,184,0.28)",
	                                          padding: "6px 10px",
	                                          fontSize: "12px",
	                                          fontWeight: 700,
	                                        }}
	                                      >
	                                        {learner}
	                                      </div>
	                                    ))
	                                  ) : (
	                                    <div
	                                      style={{
	                                        borderRadius: "999px",
	                                        background: "#ffffff",
	                                        border: "1px solid rgba(148,163,184,0.28)",
	                                        padding: "6px 10px",
	                                        fontSize: "12px",
	                                        fontWeight: 700,
	                                        color: "#5e7388",
	                                      }}
	                                    >
	                                      No student assigned
	                                    </div>
	                                  )}
	                                </div>
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            )}
          </section>
        </>
      )}

      {showSchedulePreview && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2000,
                background: "rgba(3, 9, 17, 0.8)",
                display: "grid",
                placeItems: "center",
                padding: 20,
              }}
            >
              <div
                style={{
                  width: "min(1024px, 100%)",
                  maxHeight: "calc(100vh - 56px)",
                  borderRadius: 18,
                  border: "1px solid rgba(148, 184, 218, 0.32)",
                  background: "#0f2335",
                  boxShadow: "0 26px 60px rgba(3, 9, 17, 0.55)",
                  display: "grid",
                  gridTemplateRows: "auto minmax(0, 1fr)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    borderBottom: "1px solid rgba(120, 180, 255, 0.16)",
                    padding: "14px 16px",
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ color: "var(--cfsp-info)", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Schedule Preview
                    </div>
                    <div style={{ color: "#ffffff", fontWeight: 900, fontSize: 19, marginTop: 4 }}>{schedulePreview.title}</div>
                    <div style={{ color: "rgba(220, 239, 255, 0.7)", fontSize: 12, marginTop: 3 }}>
                      {schedulePreview.summary}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {renderScheduleViewToggle(true)}
                    {renderScheduleActionsMenu(true)}
                    <button
                      type="button"
                      onClick={() => setShowSchedulePreview(false)}
                      className="cfsp-btn"
                      style={{ background: "var(--cfsp-button-secondary-bg)", border: "1px solid var(--cfsp-button-secondary-border)", color: "var(--cfsp-button-secondary-text)" }}
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div style={{ minHeight: 0, background: "#ffffff", overflow: "auto" }}>
                  <iframe
                    ref={schedulePreviewFrameRef}
                    title={schedulePreview.title}
                    srcDoc={schedulePreview.html}
                    style={{ width: "100%", height: "min(76vh, 860px)", border: "none", background: "#fff", display: "block" }}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {showClearRosterDialog ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 75,
            background: "rgba(3, 9, 17, 0.73)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 480,
              width: "100%",
              borderRadius: 14,
              background: "#0f2335",
              border: "1px solid rgba(120, 180, 255, 0.16)",
              padding: "18px",
              color: "#fff",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>Remove current learner roster?</div>
            <div style={{ marginTop: 8, color: "rgba(220, 239, 255, 0.8)" }}>
              This will clear uploaded learner names and source metadata. The builder will return to generated placeholder learners.
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setShowClearRosterDialog(false)}
                className="cfsp-btn cfsp-btn-secondary"
              >
                Cancel
              </button>
              <button type="button" onClick={confirmClearRoster} className="cfsp-btn">
                Clear Roster
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {structureChangeDialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-structure-change-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 76,
            background: "rgba(3, 9, 17, 0.66)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div className="cfsp-panel max-w-[520px] px-5 py-5 shadow-xl" style={{ maxHeight: "calc(100vh - 40px)", overflow: "auto" }}>
            <h3 id="schedule-structure-change-title" className="m-0 text-[1.25rem] font-black text-[#14304f]">
              Change schedule structure?
            </h3>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#5e7388]">
              This event already has saved schedule data. Changing case mode, room count, learner grouping, or rotation setup may reset the schedule and affect Command Center, Student/Admin Schedule, and exports.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="cfsp-btn cfsp-btn-secondary" onClick={cancelScheduleStructureChange}>
                Cancel
              </button>
              <button type="button" className="cfsp-btn cfsp-btn-primary" onClick={continueScheduleStructureChange}>
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 40,
          maxWidth: 360,
          borderRadius: 16,
          padding: "12px 14px",
          border: `1px solid ${saveStateAppearance.border}`,
          background: saveStateAppearance.background,
          boxShadow: "0 12px 30px rgba(0, 0, 0, 0.18)",
          color: saveStateAppearance.color,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 900 }}>{saveStateAppearance.label}</div>
          {lastSavedLabel ? (
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--cfsp-text-muted)" }}>Saved {lastSavedLabel}</div>
          ) : null}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: "var(--cfsp-text-muted)", lineHeight: 1.5 }}>
          {saveState === "error" && saveErrorMessage ? saveErrorMessage : saveStateAppearance.detail}
        </div>
      </div>
    </div>
  );
}

function NumberInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="cfsp-label">{props.label}</span>
      <input
        type="number"
        min={0}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        className="cfsp-input"
      />
    </label>
  );
}

function SelectInput(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="cfsp-label">{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)} className="cfsp-input">
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleInput(props: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="cfsp-label">{props.label}</span>
      <button
        type="button"
        onClick={() => props.onChange(!props.checked)}
        className={`cfsp-btn ${props.checked ? "cfsp-btn-primary" : "cfsp-btn-secondary"}`}
      >
        {props.checked ? "Included" : "Not Included"}
      </button>
    </label>
  );
}

function TimeInput(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="cfsp-label">{props.label}</span>
      <input type="time" value={props.value} onChange={(event) => props.onChange(event.target.value)} className="cfsp-input" />
    </label>
  );
}
