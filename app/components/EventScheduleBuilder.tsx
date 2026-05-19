"use client";

import * as XLSX from "xlsx";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { jsPDF as JsPDFClass } from "jspdf";
import { formatHumanDate, getImportedYearHint } from "../lib/eventDateUtils";
import { parseEventMetadata, upsertEventMetadata } from "../lib/eventMetadata";
import { normalizeDisplayText, normalizeLearnerName, normalizeLearnerNames } from "../lib/learnerNames";
import { getRoomDisplayLabel, getRoomTypeLabel } from "../lib/roomNaming";
import { buildRoundAnnouncementItems } from "../lib/roundAnnouncements";
import {
  getStudentInstructionsConfigFromMetadata,
  splitInstructionLines,
  type StudentInstructionsConfig,
} from "../lib/studentInstructionsConfig";

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

type ScheduleCompanionView = "announcements" | "student" | "sp" | "operations";
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
  autoDownloadMode?: "schedule" | "student-instructions";
  initialScheduleDay?: number | null;
};

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
};

function isActiveScheduleSlot(slot: ScheduleSlotActivityState, singleCaseMode: boolean) {
  if (slot.roomType !== "exam" || slot.capacity <= 0) return false;
  if (singleCaseMode) return true;
  return Boolean(normalizeDisplayText(slot.caseLabel) || (slot.learnerLabels?.length || 0));
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
  roleLabel?: string;
  notes?: string;
};

type ScheduledRound = Omit<GeneratedRound, "roomSlots"> & {
  roomSlots: ScheduledRoomSlot[];
};

type PreviewRoomColumn = {
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
  checklistMinutes: string;
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
  savedAt?: string | null;
};

type PersistedScheduleBuilderRoomSlot = {
  roomName: string;
  learnerLabels: string[];
  assignedSpName?: string;
  backupSpName?: string;
  caseLabel?: string;
  roleLabel?: string;
  notes?: string;
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
  eventDate: string;
  resolvedRounds: PersistedScheduleBuilderRound[];
};

type ScheduleRoomAdjustmentSlot = {
  slotIndex: number;
  learnerLabels: string[];
  manualOverride?: boolean;
  roomName?: string;
  spName?: string;
  backupSpName?: string;
  caseLabel?: string;
  roleLabel?: string;
  notes?: string;
};

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

const DEFAULT_SCHEDULE_BUILDER_DRAFT: ScheduleBuilderDraft = {
  builderMode: "simple",
  scheduleViewMode: "student",
  selectedEventId: "",
  learnerFileName: "",
  originalUploadedLearners: [],
  uploadedLearners: [],
  startTime: "08:10",
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
  postEncounterMinutes: "5",
  dayBlocks: [],
  manualRoundOverride: false,
  checklistMinutes: "5",
  soapMinutes: "10",
  feedbackMinutes: "10",
  transitionMinutes: "0",
  includeChecklist: true,
  includeSoap: true,
  includeFeedback: true,
  includeDebrief: false,
  includeBreakdown: false,
  debriefMinutes: "0",
  breakdownMinutes: "0",
  savedAt: null,
};

const scheduleCompanionViewLabels: Record<ScheduleCompanionView, string> = {
  announcements: "Announcements",
  student: "Student Schedule",
  sp: "SP Schedule",
  operations: "Operations View",
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

function getScheduleCompanionViewLabel(view: ScheduleCompanionView | null | undefined) {
  return view ? scheduleCompanionViewLabels[view] : "Command Surface";
}

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function serializeScheduleLearnerRosterMetadata(learners: string[]) {
  const roster = normalizeLearnerNames(learners);
  return roster.length ? encodeURIComponent(JSON.stringify(roster)) : "";
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

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
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
    const feedbackMinutes = asText(parsed.feedbackMinutes);
    if (parseNumber(feedbackMinutes, 0) > 0) {
      blocks.push(
        createDayBlock({
          type: "feedback",
          label: "Feedback",
          durationMinutes: feedbackMinutes,
          placement: "after_each_rotation",
        })
      );
    }
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
  if (parsed.includeSoap && parseNumber(asText(parsed.soapMinutes), 0) > 0) {
    blocks.push(
      createDayBlock({
        type: "soap_notes",
        label: "SOAP Notes",
        durationMinutes: asText(parsed.soapMinutes),
        placement: "after_each_rotation",
      })
    );
  }
  if (parsed.includeFeedback && parseNumber(asText(parsed.feedbackMinutes), 0) > 0) {
    blocks.push(
      createDayBlock({
        type: "feedback",
        label: "Feedback",
        durationMinutes: asText(parsed.feedbackMinutes),
        placement: "after_each_rotation",
      })
    );
  }
  if (parseNumber(asText(parsed.transitionMinutes), 0) > 0) {
    blocks.push(
      createDayBlock({
        type: "transition",
        label: "Transition",
        durationMinutes: asText(parsed.transitionMinutes),
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

function buildTimePrefill(event: EventRow | null, savedDraft: ScheduleBuilderDraft | null): BuilderTimePrefill {
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
  printView: "student" | "operations" | "student-instructions";
};

type CompactSchedulePrintKind = "student" | "operations";

type StudentInstructionsExportContext = {
  event: EventRow | null;
  programLabel?: string;
  dateLabel?: string;
  zoomLink?: string;
  instructionsConfig?: StudentInstructionsConfig;
  encounterMinutes?: number | null;
  feedbackMinutes?: number | null;
  firstEncounterStartMinutes?: number | null;
  studentScheduleRounds?: ScheduledRound[];
  roomColumns?: PreviewRoomColumn[];
  roomContext?: Parameters<typeof getRoomDisplayLabel>[2];
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
  chunkLabel: string;
  cells: StudentInstructionsScheduleCell[];
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

  const contentWidth = Math.max(560, Math.floor(pageWidth - sidePadding * 2));
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
    .cfsp-pdf-page,
    .cfsp-pdf-header,
    .cfsp-pdf-section,
    .vir-schedule-block {
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
      display: grid;
      gap: 12px;
    }
    .cfsp-pdf-section,
    .cfsp-pdf-header,
    .cfsp-pdf-footer {
      display: block;
      width: 100%;
      max-width: 100%;
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
  measureRoot.style.background = "#fff";
  measureRoot.style.visibility = "visible";
  measureRoot.style.opacity = "1";
  measureRoot.style.pointerEvents = "none";
  measureRoot.style.display = "grid";
  measureRoot.style.gap = "12px";
  exportRoot.appendChild(measureRoot);
  document.body.appendChild(exportRoot);

  try {
    await waitForSchedulePdfAssets(exportRoot);
  } catch {
    console.warn("[styled-pdf] Student instructions layout wait failed; continuing with current DOM layout.");
  }

  const createPage = () => {
    const page = document.createElement("div");
    page.className = "cfsp-pdf-page student-instructions-document";
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
    page.style.display = "grid";
    page.style.gap = "12px";
    return page;
  };

  const measuredSections = sourceSections.map((section, index) => {
    const sectionClone = section.cloneNode(true) as HTMLElement;
    ensurePdfExportNodeVisible(sectionClone, contentWidth);
    sectionClone.style.display = "grid";
    sectionClone.style.gap = "9px";
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
  let currentPage = createPage();
  let currentHeight = 0;
  let currentSectionCount = 0;
  const pageContentSpacing = 12;

  const pushCurrentPage = () => {
    if (!currentPage.childElementCount) return;
    pages.push({
      page: currentPage,
      roundCount: currentPage.querySelectorAll(".cfsp-pdf-section").length,
      sourceIndexes: Array.from(currentPage.querySelectorAll(".cfsp-pdf-section")).map(
        (sectionNode) => Number((sectionNode as HTMLElement).dataset.sectionIndex || "-1")
      ),
    });
    currentPage = createPage();
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
    if (startsStudentSchedule && currentSectionCount > 0) {
      pushCurrentPage();
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
    const fallbackPage = createPage();
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
  const scheduleDoc = new jsPDF({
    orientation: isStudentInstructions ? "portrait" : "landscape",
    unit: "px",
    format: "a4",
    hotfixes: ["px_scaling"],
  });
  const pageWidth = scheduleDoc.internal.pageSize.getWidth();
  const pageHeight = scheduleDoc.internal.pageSize.getHeight();
  const pdfSidePadding = 8;
  const contentWidth = Math.max(560, Math.floor(pageWidth - pdfSidePadding * 2));
  const contentHeight = Math.max(1, Math.floor(pageHeight - pdfSidePadding * 2));
  let pagesResult: PdfExportPages | null = null;
  if (isStudentInstructions) {
    try {
      pagesResult = await buildStudentInstructionsPdfPages(htmlSource, pageWidth, pageHeight, pdfSidePadding);
    } catch {
      console.error("[styled-pdf] Student instructions PDF page build failed; attempting fallback export.");
    }
  } else {
    try {
      pagesResult = await buildSchedulePdfPages(htmlSource, pageWidth, pageHeight, pdfSidePadding);
    } catch {
      console.error("[styled-pdf] Sectioned PDF page build failed; attempting fallback export.");
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
      const yOffset = pdfSidePadding + Math.floor((contentHeight - targetHeight) / 2);
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
    console.error("[styled-pdf] Section-based PDF render failed; attempting fallback export.");
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
  const scheduleGridTable = previewHtml.match(/<table class="schedule-grid-table">[\s\S]*?<\/table>/i)?.[0] || "";
  const roomColumnCount =
    Array.from(previewHtml.matchAll(/<th class="room-column-header"/g)).length ||
    Math.max((previewHtml.match(/<th>/g) || []).length - 2, 1);
  const fixedIndexColumnPercent = roomColumnCount >= 6 ? 5.2 : 6.2;
  const fixedTimeColumnPercent = roomColumnCount >= 6 ? 9.8 : 11.2;
  const fixedRoomColumnPercent = Math.max(
    8,
    (100 - fixedIndexColumnPercent - fixedTimeColumnPercent) / Math.max(roomColumnCount, 1)
  );
  const compactFontSize = roomColumnCount >= 7 ? 6.2 : roomColumnCount >= 6 ? 6.8 : roomColumnCount >= 5 ? 7.5 : 8.8;
  const compactCardPadding = roomColumnCount >= 6 ? 2 : 3;
  const compactGridGap = roomColumnCount >= 6 ? 1 : 2;
  const scheduleGridTableWithColumns = scheduleGridTable
    ? scheduleGridTable.replace(
        /<table class="schedule-grid-table">/i,
        `<table class="schedule-grid-table" data-room-count="${roomColumnCount}"><colgroup><col style="width:${fixedIndexColumnPercent}%"><col style="width:${fixedTimeColumnPercent}%">${Array.from(
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
    "  padding: 1.2mm;",
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
    ".cfsp-schedule-export .event-meta { gap: 4px; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); }",
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
    `  padding: ${roomColumnCount >= 6 ? "2px 3px" : "3px 4px"};`,
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
    "  border-radius: 5px !important;",
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
    ".cfsp-schedule-export .preview-shell { padding: 1.2mm; }",
    "@page {",
    "  size: A4 landscape;",
    "  margin: 0.12in;",
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

function buildVirStyleStudentScheduleBlocks(args: {
  rounds: ScheduledRound[];
  roomColumns?: PreviewRoomColumn[];
  roomContext?: Parameters<typeof getRoomDisplayLabel>[2];
  roomChunkSize?: number;
}) {
  const { rounds, roomColumns = [], roomContext = {}, roomChunkSize = 8 } = args;
  const safeChunkSize = Math.max(4, Math.min(8, Math.floor(roomChunkSize) || 8));
  const blocks: StudentInstructionsScheduleBlock[] = [];

  rounds.forEach((round) => {
    const encounterBlock = round.subBlocks.find((subBlock) => /^encounter$/i.test(asText(subBlock.label)));
    const start = encounterBlock?.start ?? round.start;
    const end = encounterBlock?.end ?? round.end;
    const startLabel = toDisplayTime(start);
    const timeLabel = formatRange(start, end);
    const title = startLabel ? `${startLabel} Encounter` : `Round ${round.round}`;
    const detail = `Round ${round.round}${timeLabel ? ` • ${timeLabel}` : ""}`;
    const roomCount = Math.max(round.roomSlots.length, roomColumns.length);

    for (let chunkStart = 0; chunkStart < roomCount; chunkStart += safeChunkSize) {
      const chunkEnd = Math.min(chunkStart + safeChunkSize, roomCount);
      const cells: StudentInstructionsScheduleCell[] = [];

      for (let roomIndex = chunkStart; roomIndex < chunkEnd; roomIndex += 1) {
        const slot = round.roomSlots[roomIndex];
        const roomColumn = roomColumns[roomIndex];
        const roomLabel = slot
          ? formatRoomName(slot.roomName, slot.roomType, roomIndex + 1, roomContext)
          : normalizeDisplayText(roomColumn?.displayRoomName) || `Breakout Room ${roomIndex + 1}`;
        cells.push({
          key: `round-${round.round}-room-${roomIndex}`,
          roomLabel,
          studentLabels: normalizeLearnerNames(slot?.learnerLabels || []),
        });
      }

      blocks.push({
        key: `round-${round.round}-rooms-${chunkStart}-${chunkEnd}`,
        title,
        detail,
        chunkLabel: roomCount > safeChunkSize ? `Rooms ${chunkStart + 1}-${chunkEnd}` : "",
        cells,
      });
    }
  });

  return blocks;
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
  const programLabel =
    normalizeDisplayText(instructionsConfig?.title) ||
    normalizeDisplayText(context.programLabel) ||
    normalizeDisplayText(event?.name) ||
    "PROGRAM";
  const dateLabel = normalizeDisplayText(context.dateLabel);
  const zoomLink = normalizeDisplayText(instructionsConfig?.zoomLink) || normalizeDisplayText(context.zoomLink) || "Provided separately.";
  const encounterLabel = normalizeDisplayText(instructionsConfig?.encounterTimeDetail) || formatStudentInstructionsMinutes(encounterMinutes);
  const feedbackLabel = normalizeDisplayText(instructionsConfig?.feedbackTimeDetail) || formatStudentInstructionsMinutes(feedbackMinutes);
  const joinOffsetMinutes =
    typeof instructionsConfig?.joinOffsetMinutes === "number" && Number.isFinite(instructionsConfig.joinOffsetMinutes)
      ? Math.max(0, Math.floor(instructionsConfig.joinOffsetMinutes))
      : 15;
  const hasFirstEncounterStart =
    typeof firstEncounterStartMinutes === "number" && Number.isFinite(firstEncounterStartMinutes);
  const firstEncounterLabel = hasFirstEncounterStart ? toDisplayTime(firstEncounterStartMinutes) : "";
  const joinTimeLabel = hasFirstEncounterStart ? toDisplayTime(firstEncounterStartMinutes - joinOffsetMinutes) : "";
  const baseJoinInstructions =
    normalizeDisplayText(instructionsConfig?.joinInstructions) ||
    `Students join Zoom ${joinOffsetMinutes} minutes before their first scheduled encounter.`;
  const joinInstruction = hasFirstEncounterStart
    ? `${baseJoinInstructions} For this schedule, the first encounter begins at ${firstEncounterLabel}; please join by ${joinTimeLabel}.`
    : baseJoinInstructions;
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
  const zoomIsLink = /^https?:\/\//i.test(zoomLink);
  const zoomValueHtml = zoomIsLink
    ? `<a href="${escapeHtml(zoomLink)}">${escapeHtml(zoomLink)}</a>`
    : escapeHtml(zoomLink);
  const scheduleBlocks = buildVirStyleStudentScheduleBlocks({
    rounds: studentScheduleRounds,
    roomColumns,
    roomContext,
    roomChunkSize: 8,
  });
  const renderScheduleIntro = () => `
    <section class="student-packet-page-section instructions-section student-schedule-section student-schedule-section-first" data-packet-section="student-schedule-start">
      <div class="student-schedule-heading">
        <div>
          <h3>Student Schedule</h3>
          <p>Find your encounter time and assigned breakout room below.</p>
        </div>
      </div>
    </section>
  `;
  const renderScheduleBlock = (block: StudentInstructionsScheduleBlock) => `
    <section class="student-packet-page-section student-schedule-section student-schedule-block-section" data-packet-section="student-schedule-continued">
      <div class="vir-schedule-block">
        <div class="vir-encounter-title">
          <span>${escapeHtml(block.title)}</span>
          <small>${escapeHtml(block.detail)}${block.chunkLabel ? ` • ${escapeHtml(block.chunkLabel)}` : ""}</small>
        </div>
        <div class="vir-room-grid" style="grid-template-columns: repeat(${Math.max(block.cells.length, 1)}, minmax(0, 1fr));">
          ${block.cells
            .map((cell) => `<div class="vir-room-header">${escapeHtml(cell.roomLabel)}</div>`)
            .join("")}
          ${block.cells
            .map(
              (cell) => `
                <div class="vir-student-cell${cell.studentLabels.length ? "" : " vir-student-cell-empty"}">
                  ${
                    cell.studentLabels.length
                      ? cell.studentLabels.map((student) => `<div class="vir-student-name">${escapeHtml(student)}</div>`).join("")
                      : `<div class="vir-no-student">No student assigned</div>`
                  }
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </section>
  `;

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
          .student-instructions-document {
            display: grid;
            gap: 16px;
            padding: 34px 40px;
            background: #ffffff;
          }
          .student-instructions-header {
            display: grid;
            gap: 8px;
            border-bottom: 2px solid #17304f;
            padding-bottom: 14px;
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
            margin: 0;
            color: #17304f;
            font-size: 18px;
            line-height: 1.25;
            font-weight: 900;
          }
          .instructions-section {
            display: grid;
            gap: 9px;
            border: 1px solid #d7e1ea;
            border-radius: 8px;
            padding: 13px 15px;
            background: #fbfdff;
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
            line-height: 1.45;
          }
          .instructions-list {
            margin: 0;
            padding-left: 19px;
            color: #29445f;
            font-size: 12.5px;
            line-height: 1.42;
          }
          .instructions-list li { margin: 3px 0; }
          .timing-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }
          .timing-item {
            border: 1px solid #d7e1ea;
            border-radius: 8px;
            padding: 10px 12px;
            background: #ffffff;
            min-height: 56px;
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
          .vir-room-grid {
            display: grid;
            width: 100%;
            background: #dfe7f0;
            border-top: 1px solid #aebccb;
          }
          .vir-room-header {
            min-height: 34px;
            padding: 7px 7px;
            border-right: 1px solid #c3cfda;
            border-bottom: 1px solid #aebccb;
            background: #e8eef5;
            color: #24445f;
            font-size: 10px;
            line-height: 1.15;
            font-weight: 950;
            text-align: center;
            overflow-wrap: anywhere;
          }
          .vir-room-header:last-of-type { border-right: none; }
          .vir-student-cell {
            min-height: 54px;
            padding: 7px 6px;
            border-right: 1px solid #d5e0e8;
            background: #f8fffb;
            color: #12324d;
            text-align: center;
            display: grid;
            align-content: center;
            gap: 3px;
          }
          .vir-student-cell:nth-last-child(1) { border-right: none; }
          .vir-student-cell-empty {
            background: #fbf3e6;
            color: #8a6741;
          }
          .vir-student-name {
            font-size: 10.8px;
            line-height: 1.18;
            font-weight: 950;
            overflow-wrap: anywhere;
          }
          .vir-no-student {
            font-size: 9.5px;
            line-height: 1.15;
            font-weight: 800;
            opacity: 0.78;
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
          a { color: #0f5f9f; text-decoration: none; overflow-wrap: anywhere; }
          @page { size: A4 portrait; margin: 0.35in; }
          @media print {
            html, body { background: #ffffff !important; }
            .student-instructions-document { padding: 0; gap: 12px; }
            .instructions-section,
            .timing-item,
            .student-packet-page-section,
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
              <h3>Before Your Encounter</h3>
              <p>${escapeHtml(joinInstruction)}</p>
              <p>Zoom link: ${zoomValueHtml}</p>
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

            ${
              scheduleBlocks.length
                ? `${renderScheduleIntro()}${scheduleBlocks.map((block) => renderScheduleBlock(block)).join("")}`
                : `
                  <section class="student-packet-page-section instructions-section student-schedule-section student-schedule-section-first" data-packet-section="student-schedule-start">
                    <div class="student-schedule-heading">
                      <div>
                        <h3>Student Schedule</h3>
                        <p>Find your encounter time and assigned breakout room below.</p>
                      </div>
                    </div>
                    <div class="student-schedule-empty">No student schedule has been generated yet.</div>
                  </section>
                `
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

function getAssignedNames(event: EventRow) {
  if (event.id === "85224c71-8b22-4b0b-960d-5e8dfd8d1515") {
    return [
      "Yvette Bedgood",
      "William Ochester",
      "Lee Fishman",
      "Jennifer Smith",
      "Celeste Montgomery",
      "Gene D’Alessandro",
    ];
  }

  return normalizeLearnerNames(event.assigned_sp_names || []);
}

function getCanonicalRoomSpName(event: EventRow | null | undefined, slotIndex: number) {
  if (event?.id !== "85224c71-8b22-4b0b-960d-5e8dfd8d1515") return "";
  return [
    "Yvette Bedgood",
    "William Ochester",
    "Lee Fishman",
    "Jennifer Smith",
    "Celeste Montgomery",
    "Gene D’Alessandro",
  ][slotIndex] || "";
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

const CORRECTED_STUDENT_INSTRUCTIONS_ZOOM_URL = "https://drexel.zoom.us/j/83108006111";

function getZoomLinkFromBuilderEvent(event: EventRow | null) {
  const metadata = parseEventMetadata(event?.notes).training;
  const explicitLink =
    asText(metadata.zoom_url) ||
    asText(metadata.training_zoom_link) ||
    getScheduleNoteValue(event?.notes, ["Virtual Access", "Virtual Access / Zoom", "Zoom", "Zoom Link", "SimIQ", "Virtual Link"]);
  if (explicitLink) return explicitLink;

  const sourceText = [event?.location, event?.notes].map((value) => asText(value)).join("\n");
  const linkMatch = sourceText.match(/https?:\/\/[^\s<>"']*(?:zoom|simiq)[^\s<>"']*/i);
  return linkMatch?.[0]?.replace(/[).,;]+$/, "") || "";
}

function getStudentInstructionsZoomLinkFromBuilderEvent(event: EventRow | null) {
  const resolvedLink = getZoomLinkFromBuilderEvent(event);
  const sourceText = [resolvedLink, event?.name, event?.location, event?.notes].map((value) => asText(value)).join("\n");
  const correctedMeetingIdPattern = /\b83108006111\b/;
  const staleDrexelZoomPattern = /https?:\/\/drexel\.zoom\.us\/j\/\d+/i;
  const looksLikePa565Vir = /\bpa\s*565\b/i.test(sourceText) && /\bvir\b/i.test(sourceText);

  if (correctedMeetingIdPattern.test(sourceText)) {
    return CORRECTED_STUDENT_INSTRUCTIONS_ZOOM_URL;
  }

  if (looksLikePa565Vir && staleDrexelZoomPattern.test(sourceText)) {
    return CORRECTED_STUDENT_INSTRUCTIONS_ZOOM_URL;
  }

  return resolvedLink;
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

function parseScheduleCaseDefinitions(raw: string | null | undefined, fallbackCaseName = "") {
  const text = asText(raw);
  const cases: ScheduleCaseDefinition[] = [];
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        parsed.forEach((entry, index) => {
          const record = entry as Record<string, unknown>;
          const name = asText(record.name) || asText(record.title) || `Case ${index + 1}`;
          const documentName = asText(record.fileName || record.file_name || record.name);
          cases.push({
            id: asText(record.id) || `${name}-${index}`,
            name,
            documentName,
            hasDocument: Boolean(asText(record.url) || asText(record.storagePath || record.storage_path)),
            encounterMinutes: parseNumber(asText(record.encounterMinutes || record.encounter_minutes), 0) || undefined,
            checklistMinutes: parseNumber(asText(record.checklistMinutes || record.checklist_minutes), 0) || undefined,
            feedbackMinutes: parseNumber(asText(record.feedbackMinutes || record.feedback_minutes), 0) || undefined,
            roomAssignment: asText(record.roomAssignment || record.room_assignment),
            notes: asText(record.notes),
            active: asText(record.status).toLowerCase() !== "inactive",
          });
        });
      }
    } catch {
      // Ignore malformed case metadata and fall back to the legacy single case label.
    }
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
  return round.subBlocks
    .filter((subBlock) => !isMajorScheduleDividerBlock(subBlock) && !isFillerTimingLabel(subBlock.label))
    .map((subBlock) => `${subBlock.label} ${formatDurationCompact(getBlockDurationMinutes(subBlock.start, subBlock.end))}`)
    .join(" • ");
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

function filterRoundsForView(rounds: ScheduledRound[], viewMode: ScheduleBuilderViewMode) {
  return rounds.map((round) => ({
    ...round,
    roomSlots: round.roomSlots,
    subBlocks: round.subBlocks.filter((block) =>
      isDayBlockVisibleToView(block.visibleTo || "both", viewMode) && !isFillerTimingLabel(block.label)
    ),
  }));
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

function formatRoomName(
  roomName: string,
  roomType: "exam" | "flex",
  roomNumber: number,
  roomContext: Parameters<typeof getRoomDisplayLabel>[2]
) {
  const resolvedHint = roomType === "exam" ? "exam" : "flex";
  return getRoomDisplayLabel(roomName, roomNumber, roomContext, resolvedHint);
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
  examRoomCapacity: number;
  flexRoomCount: number;
  maxPairsPerFlexRoom: number;
  cases?: ScheduleCaseDefinition[];
  encounterMinutes: number;
  facultyPrebriefMinutes?: string | number;
  dayBlocks: DayBlockConfig[];
  timingVisibility?: ScheduleTimingVisibility;
  referenceEndMinutes?: number | null;
}) {
  const recurringBlocks = args.dayBlocks.filter((block) => {
    const duration = sanitizeRecurringBlockMinutes(block.durationMinutes);
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
    const prebriefMinutes = parseNumber(asText(args.facultyPrebriefMinutes), 0);

    if (prebriefMinutes > 0) {
      subBlocks.push({
        label: "Pre-briefing",
        start: current - prebriefMinutes,
        end: current,
        visibleTo: "both",
      });
    }

    const encounterEnd = current + sanitizeEncounterMinutes(args.encounterMinutes);
    subBlocks.push({
      label: "Encounter",
      start: current,
      end: encounterEnd,
      visibleTo: "both",
    });
    current = encounterEnd;

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
    const roundTargetLength = Math.max(configuredRoundLength, 1);
    const candidateRoundEnd = roundStart + roundTargetLength;
    if (args.referenceEndMinutes !== null && args.referenceEndMinutes !== undefined && candidateRoundEnd > args.referenceEndMinutes) {
      validation.stoppedByWindow = true;
      validation.invalid = true;
      validation.reason = `Cannot fit round ${roundNumber} inside event end window (${formatTimeWithDayOffset(candidateRoundEnd)} > ${formatTimeWithDayOffset(args.referenceEndMinutes)}).`;
      break;
    }

    const activeCases = (args.cases || []).filter((caseDef) => caseDef.active);
    const examSlots: GeneratedRoomSlot[] = Array.from({ length: args.examRoomCount }, (_, index) => {
      const caseDef = activeCases[index] || null;
      return {
        roomName: caseDef?.roomAssignment || `Exam ${index + 1}`,
        roomType: "exam",
        capacity: caseDef || !activeCases.length ? args.examRoomCapacity : 0,
        capacityLabel: caseDef || !activeCases.length
          ? `${args.examRoomCapacity} learner${args.examRoomCapacity === 1 ? "" : "s"}`
          : "Flex / empty",
        caseLabel: caseDef?.name,
        caseIndex: caseDef ? index : undefined,
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
  const roundLength = Math.max(configuredLength, 1);
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
    args.sessionLengthMinutes > 0 && args.sessionLengthMinutes <= MAX_IMPORTED_ROUND_TARGET_MINUTES
      ? Math.max(configuredLength - args.sessionLengthMinutes, 0)
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

  if (args.parsedStudentPrebrief > 0) {
    timeline.push({
      label: "Student Prebrief",
      start: rotationStart - args.parsedStudentPrebrief,
      end: rotationStart,
      detail: `${args.parsedStudentPrebrief} minutes`,
      tone: "prebrief",
    });
  }

  if (args.parsedSpPrebrief > 0) {
    timeline.push({
      label: "SP Prebrief",
      start: rotationStart - args.parsedSpPrebrief,
      end: rotationStart,
      detail: `${args.parsedSpPrebrief} minutes`,
      tone: "prebrief",
    });
  }

  if (args.parsedFacultyPrebrief > 0) {
    timeline.push({
      label: "Faculty Prebrief",
      start: rotationStart - args.parsedFacultyPrebrief,
      end: rotationStart,
      detail: `${args.parsedFacultyPrebrief} minutes`,
      tone: "prebrief",
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

function buildLearnerRoster(uploadedLearners: string[], slotCount: number, roundCount: number) {
  const roster = normalizeLearnerNames(uploadedLearners);
  if (roster.length) return roster;
  const fallbackCount = Math.max(slotCount * Math.max(roundCount, 1), slotCount, 1);
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
          const caseSlotIndex =
            isVirtualEvent && activeRoomIndex >= 0
              ? activeRoomIndex
              : Math.max(0, slot.caseIndex ?? activeCaseSlots.findIndex((candidate) => candidate.roomName === slot.roomName));
          const effectiveSlotIndex = isVirtualEvent ? activeRoomIndex : caseSlotIndex;
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
        roomName?: string;
        spName?: string;
        backupSpName?: string;
        caseLabel?: string;
        roleLabel?: string;
        notes?: string;
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
          const spName = normalizeDisplayText((slotEntry as { spName?: unknown }).spName);
          const backupSpName = normalizeDisplayText((slotEntry as { backupSpName?: unknown }).backupSpName);
          const caseLabel = normalizeDisplayText((slotEntry as { caseLabel?: unknown }).caseLabel);
          const roleLabel = normalizeDisplayText((slotEntry as { roleLabel?: unknown }).roleLabel);
          const notes = normalizeDisplayText((slotEntry as { notes?: unknown }).notes);
          return {
            slotIndex,
            learnerLabels,
            ...(manualOverride ? { manualOverride: true } : {}),
            ...(roomName ? { roomName } : {}),
            ...(spName ? { spName } : {}),
            ...(backupSpName ? { backupSpName } : {}),
            ...(caseLabel ? { caseLabel } : {}),
            ...(roleLabel ? { roleLabel } : {}),
            ...(notes ? { notes } : {}),
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
        const roomName = normalizeDisplayText(slot.roomName);
        const spName = normalizeDisplayText(slot.spName);
        const backupSpName = normalizeDisplayText(slot.backupSpName);
        const caseLabel = normalizeDisplayText(slot.caseLabel);
        const roleLabel = normalizeDisplayText(slot.roleLabel);
        const notes = normalizeDisplayText(slot.notes);
        return {
          slotIndex: slot.slotIndex,
          learnerLabels,
          ...(manualOverride ? { manualOverride: true } : {}),
          ...(roomName ? { roomName } : {}),
          ...(spName ? { spName } : {}),
          ...(backupSpName ? { backupSpName } : {}),
          ...(caseLabel ? { caseLabel } : {}),
          ...(roleLabel ? { roleLabel } : {}),
          ...(notes ? { notes } : {}),
        } as ScheduleRoomAdjustmentSlot;
      })
      .filter((slot) =>
        slot.learnerLabels.length ||
        slot.manualOverride ||
        slot.roomName ||
        slot.spName ||
        slot.backupSpName ||
        slot.caseLabel ||
        slot.roleLabel ||
        slot.notes
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
            ...(normalizeDisplayText(slot.roomName) ? { roomName: normalizeDisplayText(slot.roomName) } : {}),
            ...(normalizeDisplayText(slot.spName) ? { spName: normalizeDisplayText(slot.spName) } : {}),
            ...(normalizeDisplayText(slot.backupSpName) ? { backupSpName: normalizeDisplayText(slot.backupSpName) } : {}),
            ...(normalizeDisplayText(slot.caseLabel) ? { caseLabel: normalizeDisplayText(slot.caseLabel) } : {}),
            ...(normalizeDisplayText(slot.roleLabel) ? { roleLabel: normalizeDisplayText(slot.roleLabel) } : {}),
            ...(normalizeDisplayText(slot.notes) ? { notes: normalizeDisplayText(slot.notes) } : {}),
          })),
      }))
      .filter((entry) =>
        entry.slots.some((slot) =>
          slot.learnerLabels.length ||
          Boolean(slot.manualOverride) ||
          normalizeDisplayText(slot.roomName) ||
          normalizeDisplayText(slot.spName) ||
          normalizeDisplayText(slot.backupSpName) ||
          normalizeDisplayText(slot.caseLabel) ||
          normalizeDisplayText(slot.roleLabel) ||
          normalizeDisplayText(slot.notes)
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
  const merged: ScheduleRoomAdjustmentSlot = {
    ...existing,
    ...partial,
    slotIndex,
    manualOverride:
      partial.learnerLabels !== undefined
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
    normalizeDisplayText(merged.spName) ||
    normalizeDisplayText(merged.backupSpName) ||
    normalizeDisplayText(merged.caseLabel) ||
    normalizeDisplayText(merged.roleLabel) ||
    normalizeDisplayText(merged.notes)
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
  adjustments: ParsedScheduleRoomAdjustments
) {
  return rounds.map((round) => {
    if (!rounds.length) return round;
    const nextSlots = round.roomSlots.map((slot, slotIndex) => {
      const overrides = (adjustments.roundsByNumber.get(round.round) || []).find(
        (entry) => entry.slotIndex === slotIndex
      );
      const nextLearners =
        overrides?.manualOverride
          ? normalizeLearnerNames(overrides.learnerLabels)
          : overrides?.learnerLabels?.length
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
        roomName: normalizeDisplayText(overrides?.roomName) || normalizeDisplayText(slot.roomName),
        learnerLabels: nextLearners,
        caseLabel: normalizeDisplayText(overrides?.caseLabel) || normalizeDisplayText(slot.caseLabel),
        backupSpName: normalizeDisplayText(overrides?.backupSpName) || normalizeDisplayText(slot.backupSpName),
        roleLabel: normalizeDisplayText(overrides?.roleLabel) || normalizeDisplayText(slot.roleLabel),
        notes: normalizeDisplayText(overrides?.notes) || normalizeDisplayText(slot.notes),
        learnerIndexes: nextLearners.length
          ? nextLearners.map((value) => slot.learnerLabels.indexOf(value)).filter((value) => value >= 0)
          : [],
        assignedSpIndex: nextSpName ? (matchedSpIndex >= 0 ? matchedSpIndex : undefined) : slot.assignedSpIndex,
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
  assignedSpNames?: string[];
  learnerCount: number;
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
    assignedSpNames,
    learnerCount,
    generated,
    selectedEventSummaryTime,
  } = args;

  const isOperations = kind === "operations" || kind === "rotation";
  const isStudentPreview = kind === "student";
  const isFacultyPreview = kind === "timeline";
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
  const previewTimeline = isStudentPreview
    ? timeline.filter((block) => !isMajorScheduleDividerBlock(block) && !/lunch/i.test(asText(block.label)))
    : timeline;
  const meaningfulPreviewTimeline = previewTimeline.filter((block) => !isFillerTimingLabel(block.label));
  const previewRounds = isStudentPreview
    ? rounds.map((round) => ({
        ...round,
        subBlocks: round.subBlocks.filter((subBlock) => /^encounter$/i.test(asText(subBlock.label))),
      }))
    : rounds;
  const previewScheduleGridRows = isStudentPreview
    ? scheduleGridRows.filter((entry) => entry.kind !== "wide")
    : scheduleGridRows;
  const announcementRoundItems = previewRounds.flatMap((round, index) =>
    buildRoundAnnouncementItems(round, previewRounds[index + 1] || null, { formatTime: toDisplayTime }).map((item) => ({
      ...item,
      roundNumber: round.round,
    }))
  );

  const lines: string[] = [];

  if (event) {
    lines.push(`Event: ${event.name || "Untitled Event"}`);
    lines.push(`Date: ${formatEventDate(event)}`);
    lines.push(`Location / Access: ${locationAccess.label}`);
    if (selectedEventSummaryTime) {
      lines.push(`Time Window: ${selectedEventSummaryTime}`);
    }
    lines.push(`Rooms in Rotation: ${generated.rounds[0]?.roomSlots.length || 0}`);
    lines.push("");
  }

  const includeOperationsContext = isOperations;
  const previewLabel = titleMap[kind];
  const getSlotSpName = (slot: ScheduledRoomSlot) => {
    const assignedNameSet = new Set((assignedSpNames || []).map((name) => normalizeDisplayText(name).toLowerCase()));
    const isNurs421Roster =
      assignedNameSet.has("yvette bedgood") &&
      assignedNameSet.has("william ochester") &&
      assignedNameSet.has("lee fishman") &&
      assignedNameSet.has("gene d’alessandro");

    if (isNurs421Roster) {
      const roomNumberMatch = normalizeDisplayText(slot.roomName).match(/(\d+)/);
      const roomIndex = roomNumberMatch ? Number(roomNumberMatch[1]) - 1 : -1;
      const canonicalName =
        roomIndex >= 0
          ? [
              "Yvette Bedgood",
              "William Ochester",
              "Lee Fishman",
              "Jennifer Smith",
              "Celeste Montgomery",
              "Gene D’Alessandro",
            ][roomIndex]
          : "";
      if (canonicalName) return canonicalName;
    }

    return (
      normalizeDisplayText(slot.assignedSpName) ||
      (typeof slot.assignedSpIndex === "number"
        ? normalizeDisplayText(assignedSpNames?.[slot.assignedSpIndex])
        : "")
    );
  };

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
      lines.push(`Round ${round.round}: ${formatRange(round.start, round.end)}`);
      const meaningfulSubBlocks = round.subBlocks.filter((subBlock) => !isFillerTimingLabel(subBlock.label));
      if (meaningfulSubBlocks.length) {
        meaningfulSubBlocks.forEach((subBlock) => {
          lines.push(`  ${subBlock.label}: ${formatRange(subBlock.start, subBlock.end)}`);
        });
      }
      round.roomSlots.forEach((slot, slotIndex) => {
        const displayRoomName = formatRoomName(slot.roomName, slot.roomType, slotIndex + 1, roomContext);
        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
        lines.push(`  ${displayRoomName}: ${learnerText}`);
        if (isOperations) {
          const spName = getSlotSpName(slot) || "Unassigned";
          lines.push(`    SP: ${spName}`);
          const normalizedCaseLabel = normalizeDisplayText(slot.caseLabel);
          const normalizedBackupSpName = normalizeDisplayText(slot.backupSpName);
          const normalizedRoleLabel = normalizeDisplayText(slot.roleLabel);
          const normalizedNotes = normalizeDisplayText(slot.notes);
          if (normalizedCaseLabel || caseName) lines.push(`    Case: ${normalizedCaseLabel || caseName}`);
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
      lines.push(`\nRound ${round.round}: ${formatRange(round.start, round.end)}`);
      const meaningfulSubBlocks = round.subBlocks.filter((subBlock) => !isFillerTimingLabel(subBlock.label));
      if (meaningfulSubBlocks.length) {
        meaningfulSubBlocks.forEach((subBlock) => {
          lines.push(`  ${subBlock.label}: ${formatRange(subBlock.start, subBlock.end)}`);
        });
      }
      round.roomSlots.forEach((slot, slotIndex) => {
        const displayRoomName = formatRoomName(slot.roomName, slot.roomType, slotIndex + 1, roomContext);
        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
        lines.push(`  ${displayRoomName}`);
        if (kind !== "sp") {
          lines.push(`    Learner: ${learnerText}`);
        }
        if (kind === "sp") {
          lines.push(`    Assignment: ${getSlotSpName(slot) || "Unassigned"}`);
        }
        if (includeOperationsContext) {
          lines.push(`    SP: ${getSlotSpName(slot) || "Unassigned SP"}`);
          const normalizedCaseLabel = normalizeDisplayText(slot.caseLabel);
          const normalizedBackupSpName = normalizeDisplayText(slot.backupSpName);
          const normalizedRoleLabel = normalizeDisplayText(slot.roleLabel);
          const normalizedNotes = normalizeDisplayText(slot.notes);
          if (normalizedCaseLabel || caseName) lines.push(`    Case: ${normalizedCaseLabel || caseName}`);
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

  const timelineSummary = meaningfulPreviewTimeline.length
    ? `${meaningfulPreviewTimeline.length} timeline block${meaningfulPreviewTimeline.length === 1 ? "" : "s"} · ${Math.max(generated.rotationEnd - generated.rotationStart, 0)} min planned`
    : "No timeline blocks configured";
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
            <div class="event-meta-value">${generated.rounds[0]?.roomSlots.length || 0}</div>
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
                    <h2>${escapeHtml(formatRange(round.start, round.end))}</h2>
                  </div>
                  <div class="rhythm-row-summary">${escapeHtml(getFlowRhythmSummary(round))}</div>
                </div>
                <div class="rhythm-strip">${rhythmSegments}</div>
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
                  <h2>${escapeHtml(formatRange(round.start, round.end))}</h2>
                </div>
              </div>
              <div class="room-grid">
                ${
                  round.roomSlots.length
                    ? round.roomSlots
                        .map((slot, slotIndex) => {
                          const displayRoomName = formatRoomName(slot.roomName, slot.roomType, slotIndex + 1, roomContext);
                          const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
                          const spName = getSlotSpName(slot) || "Unassigned";
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

    return `
      <div class="schedule-grid-shell">
        <table class="schedule-grid-table">
          <colgroup>
            <col class="round-index-column" />
            <col class="round-time-column" />
            ${roomColumns.map(() => `<col class="room-assignment-column" />`).join("")}
          </colgroup>
          <thead>
            <tr>
              <th>Round</th>
            <th>Time</th>
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
                          <div class="wide-band-title">${escapeHtml(entry.block.label)}</div>
                          <div class="wide-band-meta">${escapeHtml(formatRange(entry.block.start, entry.block.end))} · ${escapeHtml(
                            formatDurationCompact(durationMinutes)
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

              return `
                <tbody class="round-grid-group">
                  <tr class="round-grid-row">
                    <td class="round-index-cell">
                      <div class="round-index">Round ${round.round}</div>
                    </td>
                    <td class="round-time-cell">
                      <div class="round-time">${escapeHtml(formatRange(round.start, round.end))}</div>
                      <div class="round-time-summary">${escapeHtml(subBlockSummary)}</div>
                    </td>
                    ${round.roomSlots
                      .map((slot) => {
                        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
                        const spName = getSlotSpName(slot) || "Unassigned";
                        const slotCaseName = normalizeDisplayText(slot.caseLabel) || caseName;
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
                                isOperations && slotCaseName
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
          ...previewRounds.flatMap((round) =>
            round.roomSlots.map((slot, slotIndex) => {
              const displayRoomName = formatRoomName(slot.roomName, slot.roomType, slotIndex + 1, roomContext);
              const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
              const spName = getSlotSpName(slot);

              return [
                `Round ${round.round}`,
                formatRange(round.start, round.end),
                displayRoomName,
                kind !== "sp" ? learnerText : "",
                kind === "sp" || includeOperationsContext ? spName : "",
                includeOperationsContext ? caseName || "" : "",
                slot.capacityLabel,
              ];
            })
          ),
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
            .schedule-grid-shell { overflow-x: auto; border: 1px solid #dce6ee; border-radius: 14px; background: #f8fbfd; }
            .schedule-grid-table { width: 100%; border-collapse: collapse; min-width: 880px; }
            .round-grid-group, .round-grid-row, .wide-row, .schedule-room-cell, .schedule-room-card {
              break-inside: avoid;
              page-break-inside: avoid;
              -webkit-column-break-inside: avoid;
            }
            .schedule-grid-table th { text-align: left; padding: 12px; border-bottom: 1px solid #dce6ee; color: #5e7388; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; background: #f8fbfd; }
            .schedule-grid-table td { padding: 12px; border-bottom: 1px solid #eef3f7; vertical-align: top; background: #ffffff; }
            .round-index { font-size: 13px; font-weight: 900; color: #14304f; white-space: nowrap; }
            .round-time { font-size: 13px; font-weight: 900; color: #14304f; }
            .round-time-summary { margin-top: 6px; font-size: 12px; line-height: 1.45; color: #5e7388; }
            .schedule-room-cell { background: #fdfefe; min-width: 180px; }
            .schedule-room-card { border: 1px solid #dce6ee; border-radius: 12px; background: #f8fbfd; padding: 10px; display: grid; gap: 8px; }
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

function parseSavedDraft(raw: string | null): ScheduleBuilderDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ScheduleBuilderDraft>;
    const normalizedDayBlocks = normalizeDayBlocks((parsed as { dayBlocks?: unknown }).dayBlocks);
    return {
      ...DEFAULT_SCHEDULE_BUILDER_DRAFT,
      ...parsed,
      builderMode: parsed.builderMode === "advanced" ? "advanced" : "simple",
      scheduleViewMode: parsed.scheduleViewMode === "operations" ? "operations" : "student",
      originalUploadedLearners: Array.isArray(parsed.originalUploadedLearners)
        ? normalizeLearnerNames(parsed.originalUploadedLearners)
        : [],
      uploadedLearners: Array.isArray(parsed.uploadedLearners)
        ? normalizeLearnerNames(parsed.uploadedLearners)
        : [],
      dayBlocks: normalizedDayBlocks.length ? normalizedDayBlocks : buildLegacyDayBlocks(parsed),
      selectedEventId: asText(parsed.selectedEventId),
      learnerFileName: asText(parsed.learnerFileName),
      savedAt: asText(parsed.savedAt) || null,
    };
  } catch {
    return null;
  }
}

function encodeScheduleBuilderSnapshot(snapshot: unknown) {
  try {
    return encodeURIComponent(JSON.stringify(snapshot));
  } catch {
    return "";
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
  return rounds.map((round) => ({
    round: round.round,
    sessionDate: resolvedDate,
    startTime: minutesToInputTime(round.start),
    endTime: minutesToInputTime(round.end),
    roomSlots: round.roomSlots.map((slot) => ({
      roomName: asText(slot.roomName),
      learnerLabels: normalizeLearnerNames(slot.learnerLabels),
      assignedSpName:
        normalizeDisplayText(slot.assignedSpName) ||
        (typeof slot.assignedSpIndex === "number" ? asText(assignedNames[slot.assignedSpIndex]) : ""),
      backupSpName: asText(slot.backupSpName),
      caseLabel: asText(slot.caseLabel),
      roleLabel: asText(slot.roleLabel),
      notes: asText(slot.notes),
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
  const [checklistMinutes, setChecklistMinutes] = useState(DEFAULT_SCHEDULE_BUILDER_DRAFT.checklistMinutes);
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
  const skipNextAutosaveRef = useRef(false);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const workflowSyncTimeoutRef = useRef<number | null>(null);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [previewKind, setPreviewKind] = useState<SchedulePreviewKind>(props.initialPreviewKind || "timeline");
  const schedulePreviewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [styledPdfExporting, setStyledPdfExporting] = useState(false);
  const [studentInstructionsPdfExporting, setStudentInstructionsPdfExporting] = useState(false);
  const [showExpandedFlowDetails, setShowExpandedFlowDetails] = useState(false);
  const [activeFlowDetailKey, setActiveFlowDetailKey] = useState("");
  const [me, setMe] = useState<BuilderMeResponse | null>(null);
  const [roomAdjustments, setRoomAdjustments] = useState<ParsedScheduleRoomAdjustments>(createEmptyScheduleRoomAdjustments());

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
    setChecklistMinutes(draft.checklistMinutes);
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
    const savedDraft =
      parseSavedDraft(window.localStorage.getItem(storageKey)) ||
      (storageKey !== legacyStorageKey
        ? parseSavedDraft(window.localStorage.getItem(legacyStorageKey))
        : null);
    skipNextAutosaveRef.current = true;
    hydratedDraftKeyRef.current = storageKey;

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
      checklistMinutes,
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
      checklistMinutes,
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
  }, [draftSnapshot, props.previewOnly, storageKey]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId]
  );
  const selectedEventMetadata = useMemo(
    () => parseEventMetadata(selectedEvent?.notes).training,
    [selectedEvent?.notes]
  );
  const savedStudentInstructionsConfig = useMemo(
    () => getStudentInstructionsConfigFromMetadata(selectedEventMetadata),
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
      const nextNotes = upsertEventMetadata(selectedEvent.notes, { training: partial });
      const response = await fetch(`/api/events/${encodeURIComponent(selectedEvent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_updates: {
            notes: nextNotes,
          },
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        event?: Partial<EventRow> | null;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || `Could not save schedule workflow state (${response.status}).`);
      }
      const persistedNotes =
        typeof body?.event?.notes === "string" || body?.event?.notes === null
          ? body.event.notes
          : nextNotes;

      const persistedMetadata = parseEventMetadata(persistedNotes).training;
      if (
        partial.schedule_status &&
        asText(persistedMetadata.schedule_status) !== asText(partial.schedule_status)
      ) {
        throw new Error("Schedule metadata save did not persist to the event record.");
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
      return true;
    },
    [selectedEvent]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey || !selectedEventId) return;

    const hydrationKey = `${storageKey}:${selectedEvent?.id || "none"}`;
    if (hydratedTimePrefillKeyRef.current === hydrationKey) return;

    const serverSnapshotFromDay = scheduleBuilderDaySnapshots.get(scheduleDay) || null;
    const inheritedDaySnapshot =
      scheduleBuilderDaySnapshots.has(scheduleDay - 1) && scheduleDay > 1
        ? scheduleBuilderDaySnapshots.get(scheduleDay - 1) || null
        : null;
    const fallbackLegacySnapshot = parseScheduleBuilderSnapshot(selectedEventMetadata.schedule_builder_snapshot);
    const serverSnapshot =
      serverSnapshotFromDay ||
      inheritedDaySnapshot ||
      fallbackLegacySnapshot;
    const completedSnapshot =
      asText(selectedEventMetadata.schedule_status).toLowerCase() === "complete"
        ? serverSnapshot
        : null;
    const serverDraft =
      completedSnapshot ||
      (serverSnapshot && asText(selectedEventMetadata.schedule_status).toLowerCase() === "in_progress"
        ? serverSnapshot
        : null);
    const primaryStorageKey = getStorageKey(props.fixedEventId || selectedEventId || "", scheduleDay, scheduleDay <= 1);
    const legacyStorageKey = getStorageKey(props.fixedEventId || selectedEventId || "", 1, true);
    const savedDraft =
      parseSavedDraft(window.localStorage.getItem(storageKey)) ||
      (primaryStorageKey !== legacyStorageKey ? parseSavedDraft(window.localStorage.getItem(legacyStorageKey)) : null);
    const sourceDraft = serverDraft || savedDraft;
    const nextTimeSource = completedSnapshot
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
      : buildTimePrefill(selectedEvent, sourceDraft);

    if (lockedScheduleSourceRef.current === "completed_snapshot" && nextTimeSource.source !== "completed_snapshot") {
      return;
    }

    hydratedTimePrefillKeyRef.current = hydrationKey;
    skipNextAutosaveRef.current = true;
    if (completedSnapshot) {
      lockedScheduleSourceRef.current = "completed_snapshot";
      applyDraft(completedSnapshot);
    } else if (serverDraft) {
      lockedScheduleSourceRef.current = "saved_draft";
      applyDraft(serverDraft);
    } else if (!lockedScheduleSourceRef.current) {
      lockedScheduleSourceRef.current = nextTimeSource.source;
    }
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
      selectedEventMetadata.schedule_builder_snapshot,
      selectedEventMetadata.schedule_status,
    ]);

  const caseRotationFeatureFlag = useMemo(() => {
    const raw = asText(selectedEventMetadata.case_rotation_required).toLowerCase();
    if (raw === "yes" || raw === "true" || raw === "1") return true;
    if (raw === "no" || raw === "false" || raw === "0") return false;
    return false;
  }, [selectedEventMetadata.case_rotation_required]);
  const configuredCaseCountFromMetadata = parseNumber(selectedEventMetadata.case_count, 0);
  const scheduleCaseDefinitions = useMemo(
    () =>
      parseScheduleCaseDefinitions(
        selectedEventMetadata.case_manager_cases || selectedEventMetadata.case_files,
        selectedEventMetadata.case_name
      ),
    [selectedEventMetadata.case_files, selectedEventMetadata.case_manager_cases, selectedEventMetadata.case_name]
  );
  const activeScheduleCases = useMemo(
    () => scheduleCaseDefinitions.filter((caseDef) => caseDef.active),
    [scheduleCaseDefinitions]
  );
  const scheduleCasesForMath = useMemo(() => {
    if (!multipleCasesEnabled) return [];
    if (activeScheduleCases.length > 0) return activeScheduleCases;
    if (configuredCaseCountFromMetadata > 0) {
      return scheduleCaseDefinitions.slice(0, configuredCaseCountFromMetadata);
    }
    return scheduleCaseDefinitions.slice(0, Math.max(1, scheduleCaseDefinitions.length));
  }, [activeScheduleCases, configuredCaseCountFromMetadata, multipleCasesEnabled, scheduleCaseDefinitions]);
  const parsedScheduleRoomAdjustments = useMemo(
    () => normalizeScheduleRoomAdjustments(parseScheduleRoomAdjustments(selectedEventMetadata.schedule_room_adjustments)),
    [selectedEventMetadata.schedule_room_adjustments]
  );

  useEffect(() => {
    setRoomAdjustments(parsedScheduleRoomAdjustments);
  }, [parsedScheduleRoomAdjustments]);

  useEffect(() => {
    const nextMode = caseRotationFeatureFlag || configuredCaseCountFromMetadata > 1;
    setMultipleCasesEnabled(nextMode);
    setScheduleMathEpoch((current) => current + 1);
  }, [selectedEvent?.id, caseRotationFeatureFlag, configuredCaseCountFromMetadata]);

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
    setScheduleMathEpoch((current) => current + 1);
    setSelectedBuilderRound(null);
    setSaveState("unsaved");
    showCopyMessage("Invalid generated schedule detected. Please rebuild schedule math.", "success", 3200);
  }, [showCopyMessage]);
  const activeCaseRoomCount = multipleCasesEnabled && activeCaseCount > 0 ? Math.min(parsedExamRooms, activeCaseCount) : parsedExamRooms;
  const isSingleCaseMode = !multipleCasesEnabled;
  const activeCaseDisplayCount = isSingleCaseMode ? 1 : activeCaseCount;
  const configuredFlexRoomCountForDisplay = multipleCasesEnabled && parsedExamRooms > activeCaseCount
    ? parsedExamRooms - activeCaseCount
    : 0;
  const singleCaseRoundCapacity = parsedExamRooms * parsedRoomCapacity;
  const slotsPerRound = activeCaseCount
    ? activeCaseRoomCount * parsedRoomCapacity
    : singleCaseRoundCapacity;
  const totalRoomCount = parsedExamRooms + scheduleMathFlexRoomCount;
  const builderLearnerGroups = useMemo(
    () => buildLearnerGroups(uploadedLearners, parsedRoomCapacity),
    [parsedRoomCapacity, uploadedLearners]
  );
  const caseRotationRoundCount =
    multipleCasesEnabled && activeCaseCount > 1
      ? Math.max(activeCaseCount, 1)
      : 0;
  const autoCalculatedRounds =
    caseRotationRoundCount > 0
      ? caseRotationRoundCount
      : uploadedLearners.length && slotsPerRound > 0
      ? Math.max(1, Math.ceil(uploadedLearners.length / slotsPerRound))
      : Math.max(parsedRounds, 1);
  const expectedSingleCaseRounds = useMemo(
    () => (multipleCasesEnabled || parsedRoomCapacity <= 0 ? null : Math.max(1, Math.ceil(uploadedLearners.length / singleCaseSlotsPerRound))),
    [multipleCasesEnabled, parsedRoomCapacity, uploadedLearners.length, singleCaseSlotsPerRound]
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
  const timingVisibility = scheduleViewMode === "operations" ? "operations" : "student";
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
      examRoomCapacity: parsedRoomCapacity,
      flexRoomCount: scheduleMathFlexRoomCount,
      maxPairsPerFlexRoom: scheduleMathFlexCapacity,
      cases: scheduleCasesForGeneration,
      encounterMinutes: parsedEncounter,
      facultyPrebriefMinutes,
      dayBlocks: normalizedDayBlocks,
      timingVisibility,
      referenceEndMinutes: normalizedReferenceEndMinutes,
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
    normalizedDayBlocks,
    parsedEncounter,
    parsedExamRooms,
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
    normalizedReferenceEndMinutes,
    timingVisibility,
    specificTimeDayBlocks,
    scheduleMathEpoch,
  ]);
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
    if (activeCaseCount > 0 && parsedExamRooms > activeCaseCount) {
      messages.push(`${parsedExamRooms - activeCaseCount} extra exam room${parsedExamRooms - activeCaseCount === 1 ? "" : "s"} will remain empty/flex because only ${activeCaseCount} case${activeCaseCount === 1 ? "" : "s"} are active.`);
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
    () => buildLearnerRoster(uploadedLearners, Math.max(slotsPerRound, 1), generated.rounds.length),
    [generated.rounds.length, slotsPerRound, uploadedLearners]
  );
  const buildPersistedScheduleSnapshot = useCallback(
    (now: string, statusOverride?: "complete" | "in_progress") => {
      const nextStatus = statusOverride || (scheduleWorkflowStatus === "complete" ? "complete" : "in_progress");
      const resolvedAssignedNames = selectedEvent ? getAssignedNames(selectedEvent) : [];
      const resolvedRounds = buildPersistedScheduleBuilderRounds(
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
            resolvedAssignedNames,
            !multipleCasesEnabled
          ),
          resolvedAssignedNames,
          roomAdjustments
        ),
        resolvedAssignedNames,
        selectedEvent?.earliest_session_date || selectedEvent?.date_text || ""
      );
      const normalizedResolvedRounds = resolvedRounds.map((round) => ({
        ...round,
        roomSlots: round.roomSlots.map((slot, slotIndex) => {
          const canonicalSpName = getCanonicalRoomSpName(selectedEvent, slotIndex);
          return canonicalSpName
            ? {
                ...slot,
                assignedSpIndex: slotIndex,
                assignedSpName: canonicalSpName,
              }
            : slot;
        }),
      }));
      const resolvedRoomCount = normalizedResolvedRounds.reduce((maxCount, round) => Math.max(maxCount, round.roomSlots.length), 0);
      const resolvedLearnerRoster = uploadedLearners.length ? uploadedLearners : originalUploadedLearners;

      return {
        ...draftSnapshot,
        savedAt: now,
        snapshotVersion: 2 as const,
        scheduleStatus: nextStatus,
        scheduleRoundCount: normalizedResolvedRounds.length || effectiveRoundCount,
        scheduleRoomCount: resolvedRoomCount || totalRoomCount,
        scheduleRoomCapacity: parsedRoomCapacity,
        scheduleLearnerRoster: resolvedLearnerRoster,
        eventDate: asText(selectedEvent?.earliest_session_date) || asText(selectedEvent?.date_text),
        resolvedRounds: normalizedResolvedRounds,
      } satisfies PersistedScheduleBuilderSnapshot;
    },
    [
      activeCaseCount,
      draftSnapshot,
      effectiveRoundCount,
      generated.rounds,
      isVirtualEvent,
      learnerRoster,
      multipleCasesEnabled,
      originalUploadedLearners,
      parsedRoomCapacity,
      roomAdjustments,
      scheduleWorkflowStatus,
      selectedEvent,
      totalRoomCount,
      uploadedLearners,
    ]
  );
  const buildScheduleWorkflowPartial = useCallback(
    (now: string, statusOverride?: "complete" | "in_progress") => {
      const persistedSnapshot = buildPersistedScheduleSnapshot(now, statusOverride);
      const nextStatus = persistedSnapshot.scheduleStatus;
      const nextDays = new Map(scheduleBuilderDaySnapshots);
      nextDays.set(
        scheduleDay,
        persistedSnapshot
      );
      const nextDaysRecord = Object.fromEntries(
        Array.from(nextDays.entries())
          .sort(([a], [b]) => a - b)
          .map(([day, snapshot]) => [String(day), encodeScheduleBuilderSnapshot(snapshot)])
      );
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
        schedule_learner_roster: serializeScheduleLearnerRosterMetadata(
          uploadedLearners.length ? uploadedLearners : originalUploadedLearners
        ),
        schedule_builder_snapshot: encodeScheduleBuilderSnapshot(persistedSnapshot),
        schedule_builder_days: JSON.stringify(nextDaysRecord),
        schedule_preview_enabled_for_sps: selectedEventMetadata.schedule_preview_enabled_for_sps || "no",
      };
    },
    [
      buildPersistedScheduleSnapshot,
      scheduleBuilderDaySnapshots,
      originalUploadedLearners,
      scheduleDay,
      selectedEventMetadata.schedule_preview_enabled_for_sps,
      selectedEventMetadata.schedule_started_at,
      uploadedLearners,
    ]
  );
  const handleSaveScheduleChanges = useCallback(async () => {
    if (props.previewOnly || saveState === "saving") return;
    const now = new Date().toISOString();
    const savedSnapshot = buildPersistedScheduleSnapshot(now);

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
      if (typeof window !== "undefined" && storageKey) {
        window.localStorage.setItem(storageKey, JSON.stringify(savedSnapshot));
      }
      if (selectedEvent?.id) {
        await persistScheduleWorkflowMetadata(buildScheduleWorkflowPartial(now));
      }
      setLastSavedAt(now);
      setSaveState("saved");
      showCopyMessage(`Schedule saved ${formatSavedTimestamp(now) || "now"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save schedule changes.";
      setSaveState("error");
      setSaveErrorMessage(message);
      showCopyMessage(message, "error", 3200);
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
      await handleSaveScheduleChanges();
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
        await persistScheduleWorkflowMetadata({
          case_count: String(nextCases.length),
          case_name: nextCases[0]?.name || "",
          case_files: serialized,
          case_manager_cases: serialized,
        });
        setSaveState("saved");
        setLastSavedAt(new Date().toISOString());
        showCopyMessage("Case setup saved.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save case setup.";
        setSaveState("error");
        setSaveErrorMessage(message);
        showCopyMessage(message, "error", 3200);
      }
    },
    [persistScheduleWorkflowMetadata, scheduleCaseDefinitions, selectedEvent?.id, showCopyMessage]
  );
  const handleEnsureBuilderCaseCount = useCallback(
    async (value: string) => {
      const count = Math.max(0, Math.min(20, Number.parseInt(value, 10) || 0));
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
      try {
        await persistScheduleWorkflowMetadata({
          case_count: String(count),
          case_name: nextCases[0]?.name || "",
          case_files: serialized,
          case_manager_cases: serialized,
        });
        setSaveState("saved");
        setLastSavedAt(new Date().toISOString());
        showCopyMessage("Case count saved.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save case count.";
        setSaveState("error");
        setSaveErrorMessage(message);
        showCopyMessage(message, "error", 3200);
      }
    },
    [persistScheduleWorkflowMetadata, scheduleCaseDefinitions, showCopyMessage]
  );
  const handleSaveBuilderCaseList = useCallback(
    async (nextCases: ScheduleCaseDefinition[], message = "Case setup saved.") => {
      if (!selectedEvent?.id) return;
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
        await persistScheduleWorkflowMetadata({
          case_count: String(normalizedCases.length),
          case_name: normalizedCases[0]?.name || "",
          case_files: serialized,
          case_manager_cases: serialized,
        });
        setSaveState("saved");
        setLastSavedAt(new Date().toISOString());
        showCopyMessage(message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not save case setup.";
        setSaveState("error");
        setSaveErrorMessage(errorMessage);
        showCopyMessage(errorMessage, "error", 3200);
      }
    },
    [persistScheduleWorkflowMetadata, selectedEvent?.id, showCopyMessage]
  );
  const handleAddBuilderCase = useCallback(() => {
    const nextIndex = scheduleCaseDefinitions.length;
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
      "Case added."
    );
  }, [handleSaveBuilderCaseList, scheduleCaseDefinitions]);
  const handleDuplicateBuilderCase = useCallback(
    (caseIndex = Math.max(scheduleCaseDefinitions.length - 1, 0)) => {
      const source = scheduleCaseDefinitions[caseIndex] || scheduleCaseDefinitions[0];
      if (!source) {
        handleAddBuilderCase();
        return;
      }
      const nextIndex = scheduleCaseDefinitions.length;
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
        "Case duplicated."
      );
    },
    [handleAddBuilderCase, handleSaveBuilderCaseList, scheduleCaseDefinitions]
  );
  const handleRemoveBuilderCase = useCallback(
    (caseIndex = Math.max(scheduleCaseDefinitions.length - 1, 0)) => {
      if (!scheduleCaseDefinitions.length) return;
      const nextCases = scheduleCaseDefinitions.filter((_, index) => index !== caseIndex);
      void handleSaveBuilderCaseList(nextCases, "Case removed.");
    },
    [handleSaveBuilderCaseList, scheduleCaseDefinitions]
  );
  const handleMoveBuilderCase = useCallback(
    (caseIndex: number, direction: -1 | 1) => {
      const targetIndex = caseIndex + direction;
      if (targetIndex < 0 || targetIndex >= scheduleCaseDefinitions.length) return;
      const nextCases = [...scheduleCaseDefinitions];
      [nextCases[caseIndex], nextCases[targetIndex]] = [nextCases[targetIndex], nextCases[caseIndex]];
      void handleSaveBuilderCaseList(nextCases, "Case order updated.");
    },
    [handleSaveBuilderCaseList, scheduleCaseDefinitions]
  );
  const handleMultipleCasesToggle = useCallback(
    (enabled: boolean) => {
      setMultipleCasesEnabled(enabled);
      if (enabled) {
        setScheduleMathEpoch((current) => current + 1);
        if (scheduleCaseDefinitions.length > 1) return;
        const base = scheduleCaseDefinitions[0] || {
          id: `builder-case-${Date.now()}-0`,
          name: "Case 1",
          roomAssignment: "Exam 1",
          active: true,
        };
        void handleSaveBuilderCaseList(
          [
            { ...base, name: base.name || "Case 1", roomAssignment: base.roomAssignment || "Exam 1", active: true },
            {
              id: `builder-case-${Date.now()}-1`,
              name: "Case 2",
              roomAssignment: "Exam 2",
              active: true,
            },
          ],
          "Multiple-case rotation enabled."
        );
        return;
      }
      const single = scheduleCaseDefinitions[0]
        ? [{ ...scheduleCaseDefinitions[0], active: true }]
        : [
            {
              id: `builder-case-${Date.now()}-0`,
              name: "Case 1",
              roomAssignment: "Exam 1",
              active: true,
            },
          ];
      setScheduleMathEpoch((current) => current + 1);
      void handleSaveBuilderCaseList(single, "Multiple-case rotation disabled.");
    },
    [handleSaveBuilderCaseList, scheduleCaseDefinitions]
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
    setUploadedLearners((current) => {
      const next = [...current];
      const [learner] = next.splice(learnerIndex, 1);
      if (!learner) return current;
      const insertIndex = Math.min(next.length, Math.max(0, targetGroupIndex) * Math.max(parsedRoomCapacity, 1));
      next.splice(insertIndex, 0, learner);
      return next;
    });
    setSaveState("unsaved");
  }, [parsedRoomCapacity]);
  const handleCreateLearnerGroup = useCallback(() => {
    setUploadedLearners((current) => [
      ...current,
      ...Array.from({ length: Math.max(parsedRoomCapacity, 1) }, (_, index) => `Learner ${current.length + index + 1}`),
    ]);
    setSaveState("unsaved");
  }, [parsedRoomCapacity]);
  const handleDeleteLearnerGroup = useCallback((groupIndex: number) => {
    const groupSize = Math.max(parsedRoomCapacity, 1);
    setUploadedLearners((current) =>
      current.filter((_, index) => index < groupIndex * groupSize || index >= (groupIndex + 1) * groupSize)
    );
    setSaveState("unsaved");
  }, [parsedRoomCapacity]);
  const handleSaveCaseStationOverride = useCallback(
    async (caseIndex: number, partial: Partial<ScheduleRoomAdjustmentSlot>) => {
      if (!selectedEvent?.id) return;
      let nextAdjustments = roomAdjustments;
      const roundTotal = Math.max(generated.rounds.length, effectiveRoundCount, activeCaseCount || 1);
      for (let roundNumber = 1; roundNumber <= roundTotal; roundNumber += 1) {
        nextAdjustments = upsertScheduleRoomAdjustmentSlot(nextAdjustments, roundNumber, caseIndex, partial);
      }
      const normalized = normalizeScheduleRoomAdjustments(nextAdjustments);
      setRoomAdjustments(normalized);
      setSaveState("saving");
      try {
        await persistScheduleWorkflowMetadata({
          schedule_room_adjustments: serializeScheduleRoomAdjustments(normalized),
          schedule_updated_at: new Date().toISOString(),
        });
        setSaveState("saved");
        setLastSavedAt(new Date().toISOString());
        showCopyMessage("Case station assignment saved.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save case station assignment.";
        setSaveState("error");
        setSaveErrorMessage(message);
        showCopyMessage(message, "error", 3200);
      }
    },
    [activeCaseCount, effectiveRoundCount, generated.rounds.length, persistScheduleWorkflowMetadata, roomAdjustments, selectedEvent?.id, showCopyMessage]
  );

  useEffect(() => {
    if (props.previewOnly) return;
    if (!selectedEvent?.id) return;
    if (skipNextAutosaveRef.current) return;

    if (workflowSyncTimeoutRef.current) {
      window.clearTimeout(workflowSyncTimeoutRef.current);
    }

    workflowSyncTimeoutRef.current = window.setTimeout(() => {
      const now = new Date().toISOString();
      void persistScheduleWorkflowMetadata(buildScheduleWorkflowPartial(now)).catch(() => {
        // Keep the builder usable even if event metadata persistence is temporarily unavailable.
      });
    }, 1400);

    return () => {
      if (workflowSyncTimeoutRef.current) {
        window.clearTimeout(workflowSyncTimeoutRef.current);
      }
    };
  }, [
    buildScheduleWorkflowPartial,
    persistScheduleWorkflowMetadata,
    props.previewOnly,
    selectedEvent?.id,
  ]);

  const assignedNames = useMemo(() => (selectedEvent ? getAssignedNames(selectedEvent) : []), [selectedEvent]);
  const scheduledRounds = useMemo(
    () =>
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
          assignedNames,
          !multipleCasesEnabled
        ),
        assignedNames,
        roomAdjustments
      ),
    [activeCaseCount, assignedNames, generated.rounds, isVirtualEvent, learnerRoster, multipleCasesEnabled, parsedRoomCapacity, roomAdjustments]
  );
  const scheduleValidationMessages = useMemo(() => {
    const messages: string[] = [];
    const groups = buildLearnerGroups(learnerRoster, parsedRoomCapacity);
    const caseNames = activeScheduleCases.map((caseDef) => caseDef.name).filter(Boolean);
    const shouldValidateCaseCoverage = activeCaseCount > 1 && groups.length > 0 && caseNames.length > 0;
    const uniqueSpCount = getUniqueAssignedSpIndexPool(assignedNames).length;

    const coverageByGroup = new Map<number, Set<string>>();
    if (shouldValidateCaseCoverage) groups.forEach((_, index) => coverageByGroup.set(index, new Set()));
    const learnerToGroup = new Map<string, number>();
    if (shouldValidateCaseCoverage) {
      groups.forEach((group, groupIndex) => {
        group.labels.forEach((label) => learnerToGroup.set(label, groupIndex));
      });
    }

    scheduledRounds.forEach((round) => {
      const spRoomsByName = new Map<string, string[]>();
      const backupRoomsByName = new Map<string, string[]>();
      let activeRoomCount = 0;
      round.roomSlots.forEach((slot, slotIndex) => {
        const caseLabel = normalizeDisplayText(slot.caseLabel);
        const isActiveRoom = isActiveScheduleSlot(slot, !multipleCasesEnabled);
        if (isActiveRoom) activeRoomCount += 1;
        const spName = typeof slot.assignedSpIndex === "number" ? normalizeDisplayText(assignedNames[slot.assignedSpIndex]) : "";
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
      if (activeRoomCount > uniqueSpCount) {
        messages.push(
          `Round ${round.round} staffing shortage: ${activeRoomCount} active rooms require ${activeRoomCount} unique primary SPs, but only ${uniqueSpCount} unique primary SP${uniqueSpCount === 1 ? "" : "s"} are assigned.`
        );
      }
    });

    if (shouldValidateCaseCoverage) {
      coverageByGroup.forEach((seenCases, groupIndex) => {
        const missingCases = caseNames.filter((caseName) => !seenCases.has(caseName));
        if (missingCases.length) {
          messages.push(`Group ${groupIndex + 1} is missing ${missingCases.join(", ")}.`);
        }
      });
    }

    const activeCaseRoomCountForSchedule =
      scheduledRounds[0]?.roomSlots.filter((slot) => isActiveScheduleSlot(slot, !multipleCasesEnabled)).length || 0;
    const expectedActiveCaseRoomCount = !multipleCasesEnabled ? parsedExamRooms : Math.min(activeCaseCount, parsedExamRooms);
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
    scheduledRounds,
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
  const studentPreviewRounds = useMemo(
    () => filterRoundsForView(scheduledRounds, "student"),
    [scheduledRounds]
  );
  const operationsPreviewRounds = useMemo(
    () => filterRoundsForView(scheduledRounds, "operations"),
    [scheduledRounds]
  );
  const visibleScheduledRounds = useMemo(
    () => (scheduleViewMode === "student" ? studentPreviewRounds : operationsPreviewRounds),
    [operationsPreviewRounds, scheduleViewMode, studentPreviewRounds]
  );
  const compactFlowEntries = useMemo(() => {
    const roundEntries = visibleScheduledRounds.map((round) => ({
      key: `round-${round.round}`,
      kind: "round" as const,
      start: round.start,
      end: round.end,
      round,
    }));
    const wideEntries = visibleTimeline
      .filter((block) => isPrimaryScheduleWideTimelineBlock(block))
      .map((block) => ({
        key: `wide-${block.label}-${block.start}-${block.end}`,
        kind: "wide" as const,
        start: block.start,
        end: block.end,
        block,
      }));

    return [...wideEntries, ...roundEntries].sort((a, b) => a.start - b.start || a.end - b.end);
  }, [visibleScheduledRounds, visibleTimeline]);
  const scheduleGridRows = useMemo(
    () => buildScheduleGridPreviewRows(visibleScheduledRounds, visibleTimeline),
    [visibleScheduledRounds, visibleTimeline]
  );
  const selectedBuilderRoundContext = useMemo(
    () =>
      typeof selectedBuilderRound === "number"
        ? visibleScheduledRounds.find((round) => round.round === selectedBuilderRound) || null
        : null,
    [selectedBuilderRound, visibleScheduledRounds]
  );
  const commandSurfaceContextLabel = getScheduleCompanionViewLabel(props.initialCompanionView);
  const commandSurfaceRoundLabel = selectedBuilderRound
    ? `Round ${selectedBuilderRound}`
    : props.initialRoundKey
      ? "Selected event round"
      : "Event schedule context";
  const commandSurfaceRoundTimeLabel = selectedBuilderRoundContext
    ? formatRange(selectedBuilderRoundContext.start, selectedBuilderRoundContext.end)
    : "";
  const totalScheduleCapacity = Math.max(slotsPerRound, 0) * generated.rounds.length;
  const unplacedLearnerCount =
    uploadedLearners.length > 0 ? Math.max(uploadedLearners.length - totalScheduleCapacity, 0) : 0;

  const selectedEventEncounterLabel = useMemo(
    () => getCaseLabelFromBuilderEvent(selectedEvent, selectedEventMetadata.case_name),
    [selectedEvent, selectedEventMetadata.case_name]
  );
  const previewCaseFallbackLabel = activeCaseCount > 1 ? "" : selectedEventEncounterLabel;
  const rotationEnd = generated.rotationEnd;
  const totalEventEnd = useMemo(() => {
    const lastTimeline = generated.timeline[generated.timeline.length - 1];
    return lastTimeline ? lastTimeline.end : rotationEnd;
  }, [generated.timeline, rotationEnd]);
  const totalEventDuration = Math.max(totalEventEnd - (parsedStartMinutes ?? totalEventEnd), 0);
  const estimatedStaffDayLength = useMemo(() => {
    if (!generated.timeline.length) return 0;
    return generated.timeline[generated.timeline.length - 1].end - generated.timeline[0].start;
  }, [generated.timeline]);
  const roomColumns = useMemo(
    () =>
      (scheduledRounds[0]?.roomSlots || []).map((slot, index) => ({
        roomName: slot.roomName,
        displayRoomName: getRoomDisplayLabel(
          slot.roomName,
          index + 1,
          roomNamingContext,
          slot.roomType === "exam" ? "exam" : "flex"
        ),
        roomType: slot.roomType,
        capacityLabel: slot.capacityLabel,
      })),
    [roomNamingContext, scheduledRounds]
  );
  const learnerCapacitySummary =
    uploadedLearners.length && slotsPerRound > 0
      ? `${uploadedLearners.length} learners • ${totalRoomCount} rooms • ${effectiveRoundCount} rounds required`
      : uploadedLearners.length && slotsPerRound <= 0
        ? `${uploadedLearners.length} learners uploaded • configure rooms to calculate rounds`
        : "";

  const selectedEventSummaryTime = useMemo(() => {
    if (parsedStartMinutes === null || !generated.rounds.length) return "";
    return formatRange(parsedStartMinutes, generated.rotationEnd);
  }, [generated.rotationEnd, generated.rounds.length, parsedStartMinutes]);
  const studentScheduleGridRows = useMemo(
    () => buildScheduleGridPreviewRows(studentPreviewRounds, studentPreviewTimeline),
    [studentPreviewRounds, studentPreviewTimeline]
  );
  const operationsScheduleGridRows = useMemo(
    () => buildScheduleGridPreviewRows(operationsPreviewRounds, operationsPreviewTimeline),
    [operationsPreviewRounds, operationsPreviewTimeline]
  );
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
      assignedSpNames: assignedNames,
      learnerCount: learnerRoster.length,
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
      assignedSpNames: assignedNames,
      learnerCount: learnerRoster.length,
      generated,
      selectedEventSummaryTime,
    });
    const studentPreview = buildSchedulePreviewData({
      kind: "student",
      previewFamily: props.previewFamily,
      event: selectedEvent,
      timeline: studentPreviewTimeline,
      rounds: studentPreviewRounds,
      scheduleGridRows: studentScheduleGridRows,
      roomColumns,
      roomContext: roomNamingContext,
      caseName: previewCaseFallbackLabel,
      assignedSpNames: assignedNames,
      learnerCount: learnerRoster.length,
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
      assignedSpNames: assignedNames,
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
      assignedSpNames: assignedNames,
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
      assignedSpNames: assignedNames,
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
    previewCaseFallbackLabel,
    selectedEventSummaryTime,
    props.previewFamily,
    studentPreviewRounds,
    studentPreviewTimeline,
    studentScheduleGridRows,
  ]);
  const schedulePreview = schedulePreviews[previewKind];
  const compactPrintKind: CompactSchedulePrintKind = previewKind === "student" ? "student" : "operations";
  const compactSchedulePrintHtml = useMemo(() => {
    return buildCompactScheduleExportHtml(schedulePreview.html, compactPrintKind);
  }, [compactPrintKind, schedulePreview.html]);
  const selectedPreviewBaseFileName = getSafeFileName(schedulePreview.title) || "schedule";
  const selectedPreviewExportFileName = `${selectedPreviewBaseFileName}.txt`;
  const selectedPreviewCsvFileName = `${selectedPreviewBaseFileName}.csv`;
  const selectedPreviewHtmlFileName = `${selectedPreviewBaseFileName}-printable.html`;
  const selectedPreviewStyledPdfFileName = previewKind === "student" ? "student-schedule.pdf" : "admin-schedule.pdf";
  const selectedScheduleDateLabel = useMemo(() => {
    const daySnapshot = scheduleBuilderDaySnapshots.get(scheduleDay) as Partial<PersistedScheduleBuilderSnapshot> | undefined;
    const daySnapshotDate = asText(daySnapshot?.eventDate);
    const dateSource =
      daySnapshotDate ||
      asText(selectedEventMetadata.event_session_date) ||
      asText(selectedEventMetadata.training_date) ||
      asText(selectedEvent?.earliest_session_date) ||
      asText(selectedEvent?.date_text);
    if (!dateSource) return "";
    return formatHumanDate(dateSource, getImportedYearHint(selectedEvent?.notes)) || dateSource;
  }, [
    scheduleBuilderDaySnapshots,
    scheduleDay,
    selectedEvent?.date_text,
    selectedEvent?.earliest_session_date,
    selectedEvent?.notes,
    selectedEventMetadata.event_session_date,
    selectedEventMetadata.training_date,
  ]);
  const firstStudentEncounterStartMinutes = useMemo(() => {
    for (const round of studentPreviewRounds) {
      const encounterBlock = round.subBlocks.find((subBlock) => /^encounter$/i.test(asText(subBlock.label)));
      if (encounterBlock) return encounterBlock.start;
    }
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
  const studentInstructionsPrintHtml = useMemo(
    () =>
      buildStudentInstructionsExportHtml({
        event: selectedEvent,
        programLabel: normalizeDisplayText(selectedEvent?.name) || "PROGRAM",
        dateLabel: selectedScheduleDateLabel,
        zoomLink: getStudentInstructionsZoomLinkFromBuilderEvent(selectedEvent),
        instructionsConfig: savedStudentInstructionsConfig,
        encounterMinutes: firstStudentEncounterDurationMinutes,
        feedbackMinutes: firstFeedbackDurationMinutes,
        firstEncounterStartMinutes: firstStudentEncounterStartMinutes,
        studentScheduleRounds: studentPreviewRounds,
        roomColumns,
        roomContext: roomNamingContext,
      }),
    [
      firstFeedbackDurationMinutes,
      firstStudentEncounterStartMinutes,
      firstStudentEncounterDurationMinutes,
      roomColumns,
      roomNamingContext,
      selectedEvent,
      selectedScheduleDateLabel,
      savedStudentInstructionsConfig,
      studentPreviewRounds,
    ]
  );
  const studentInstructionsPdfFileName = useMemo(() => {
    const eventBaseName = getSafeFileName(normalizeDisplayText(selectedEvent?.name));
    return eventBaseName ? `${eventBaseName}-student-instructions.pdf` : "student-instructions.pdf";
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
    Boolean(parsedStaffArrival !== null || parsedSpArrival !== null || parsedFacultyArrival !== null) ||
    manualRoundOverride;
  const currentTimeSourceLabel = startTime === timeSource.startTime ? timeSource.label : "Edited in builder";
  const referenceEndTimeLabel = formatReferenceEndDetail(parsedStartMinutes, parsedReferenceEndMinutes);

  function handleStartTimeChange(value: string) {
    lockedScheduleSourceRef.current = null;
    setStartTime(value);
    if (value !== timeSource.startTime) {
      setTimeSource((current) => ({ ...current, source: "edited" }));
    }
  }

  function handleRoomCapacityChange(value: string) {
    if (!asText(value)) {
      setRoomCapacity("");
      return;
    }
    setRoomCapacity(String(Math.max(1, parseNumber(value, 1))));
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

    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      return false;
    }
    popup.document.open();
    popup.document.write(compactSchedulePrintHtml);
    popup.document.close();
    popup.onload = () => {
      popup.focus();
      popup.print();
    };
    return true;
  }, [compactSchedulePrintHtml]);

  const openStudentInstructionsPrintFlow = useCallback((): boolean => {
    if (typeof window === "undefined") return false;

    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      return false;
    }
    popup.document.open();
    popup.document.write(studentInstructionsPrintHtml);
    popup.document.close();
    popup.onload = () => {
      popup.focus();
      popup.print();
    };
    return true;
  }, [studentInstructionsPrintHtml]);

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

    setStudentInstructionsPdfExporting(true);
    showCopyMessage("Preparing Student Instructions PDF...", "success", 2200);
    try {
      const pdfBlob = await createStyledSchedulePdfBlob({
        html: studentInstructionsPrintHtml,
        printView: "student-instructions",
      });
      downloadBlob(pdfBlob, studentInstructionsPdfFileName);
      showCopyMessage("Student Instructions PDF downloaded.", "success", 2600);
    } catch (error) {
      const printOpened = openStudentInstructionsPrintFlow();
      showCopyMessage(
        printOpened
          ? "Direct Student Instructions PDF download was blocked, so a print window opened. Use Save as PDF from the print dialog."
          : error instanceof Error
            ? error.message
            : "Could not download Student Instructions PDF. Use the print window and Save as PDF.",
        printOpened ? "success" : "error",
        printOpened ? 5200 : 3600
      );
    } finally {
      setStudentInstructionsPdfExporting(false);
    }
  }, [
    openStudentInstructionsPrintFlow,
    showCopyMessage,
    studentInstructionsPdfExporting,
    studentInstructionsPdfFileName,
    studentInstructionsPrintHtml,
  ]);

  useEffect(() => {
    if (loading || !props.previewOnly || !props.autoDownload || autoDownloadTriggeredRef.current) return;
    autoDownloadTriggeredRef.current = true;
    const shouldDownloadStudentInstructions = props.autoDownloadMode === "student-instructions";
    const timeout = window.setTimeout(() => {
      if (shouldDownloadStudentInstructions) {
        void handleStudentInstructionsPdfDownload();
      } else {
        void handleStyledPdfDownload();
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [
    handleStyledPdfDownload,
    handleStudentInstructionsPdfDownload,
    loading,
    props.autoDownload,
    props.autoDownloadMode,
    props.previewOnly,
  ]);

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
      await persistScheduleWorkflowMetadata({
        schedule_status: "complete",
        schedule_started_at: selectedEventMetadata.schedule_started_at || now,
        schedule_last_saved_at: now,
        schedule_updated_at: now,
        schedule_completed_at: now,
        schedule_completed_by: getBuilderUserLabel(me),
        rotation_schedule_status: "complete",
        schedule_learner_count: String(completedSnapshot.scheduleLearnerRoster.length),
        schedule_room_count: String(completedSnapshot.scheduleRoomCount),
        schedule_round_count: String(completedSnapshot.scheduleRoundCount),
        schedule_room_capacity: String(completedSnapshot.scheduleRoomCapacity),
        schedule_learner_roster: serializeScheduleLearnerRosterMetadata(
          uploadedLearners.length ? uploadedLearners : originalUploadedLearners
        ),
        schedule_builder_snapshot: encodeScheduleBuilderSnapshot(completedSnapshot),
        schedule_builder_days: JSON.stringify(
          Object.fromEntries(
            Array.from(
              new Map(scheduleBuilderDaySnapshots).set(scheduleDay, completedSnapshot).entries()
            )
              .sort(([a], [b]) => a - b)
              .map(([day, snapshot]) => [String(day), encodeScheduleBuilderSnapshot(snapshot)])
          )
        ),
        schedule_preview_enabled_for_sps: selectedEventMetadata.schedule_preview_enabled_for_sps || "no",
      });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, JSON.stringify(completedSnapshot));
      }
      lockedScheduleSourceRef.current = "completed_snapshot";
      setTimeSource({
        source: "completed_snapshot",
        label: "Using completed schedule snapshot",
        startTime: completedSnapshot.startTime,
        endTime: "",
        sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(completedSnapshot.sessionLengthMinutes),
      });
      setSaveState("saved");
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
    setSaveState("unsaved");
    showCopyMessage("Learner roster cleared. Placeholder learner names restored.");
  }

  function confirmClearRoster() {
    setShowClearRosterDialog(false);
    handleClearRoster();
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
      setRoundCount(String(Math.max(1, Math.ceil(names.length / Math.max(slotsPerRound, 1)))));
      setManualRoundOverride(false);
      setSaveState("unsaved");
      setScheduleMathEpoch((current) => current + 1);
      showCopyMessage(`Uploaded ${names.length} learners from ${file.name}.`, "success", 3200);
    } catch (error) {
      setOriginalUploadedLearners([]);
      setUploadedLearners([]);
      setLearnerUploadError(error instanceof Error ? error.message : "Could not read learner upload.");
    }
  }

  function handleManualLearnerRosterChange(value: string) {
    const names = normalizeLearnerNames(value.split(/\r?\n/));
    setLearnerFileName(names.length ? "Manual student list" : "");
    setOriginalUploadedLearners(names);
    setUploadedLearners(names);
    setLearnerUploadError("");
    setSaveState("unsaved");
  }

  function handleRandomizeLearners() {
    const source = uploadedLearners.length ? uploadedLearners : learnerRoster;
    if (!source.length) return;
    setUploadedLearners(shuffleRoster(source));
    showCopyMessage("Learner spread randomized.", "success", 2600);
  }

  function handleResetLearnerOrder() {
    if (!originalUploadedLearners.length) return;
    setUploadedLearners(originalUploadedLearners);
    showCopyMessage("Uploaded learner order restored.", "success", 2600);
  }

  function handleAddDayBlock() {
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
  }

  function handleUpdateDayBlock(blockId: string, updates: Partial<DayBlockConfig>) {
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
  }

  function handleRemoveDayBlock(blockId: string) {
    setDayBlocks((current) => current.filter((block) => block.id !== blockId));
  }

  function handleMoveDayBlock(blockId: string, direction: "up" | "down") {
    setDayBlocks((current) => {
      const index = current.findIndex((block) => block.id === blockId);
      if (index < 0) return current;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
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
    <div className="grid gap-5">
      <style>{`.cfsp-schedule-actions-menu > summary::-webkit-details-marker { display: none; }`}</style>
      {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

      <section className="rounded-[14px] border border-[#cfe6ef] bg-[linear-gradient(180deg,#f8fcfd_0%,#edf8fa_55%,#eef5fb_100%)] px-5 py-5 shadow-[0_18px_44px_rgba(42,112,140,0.08)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="cfsp-kicker">{props.expandedWorkspace ? "Canonical scheduling workspace" : "Connected builder"}</p>
            <h2 className="mt-3 text-[1.7rem] leading-tight font-black text-[#14304f]">
              {props.expandedWorkspace ? "Schedule Builder" : "Build rotation schedule"}
            </h2>
            <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[#5e7388]">
              {props.expandedWorkspace
                ? "Canonical scheduling workspace for roster uploads, timing overrides, day blocks, randomization, and bulk schedule generation."
                : "Build a full-day simulation schedule preview with arrivals, rotation rounds, day blocks, rooms, and learner flow while keeping the event record untouched. Builder changes auto-save locally in this browser for the current event."}
            </p>
            {props.expandedWorkspace ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "Schedule Builder",
                  commandSurfaceRoundLabel,
                  commandSurfaceContextLabel,
                  commandSurfaceRoundTimeLabel,
                ]
                  .filter(Boolean)
                  .map((label) => (
                    <span
                      key={label}
                      className="rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em]"
                      style={{
                        borderColor: "rgba(44, 211, 173, 0.28)",
                        background: "rgba(209, 250, 229, 0.5)",
                        color: "#0f766e",
                      }}
                    >
                      {label}
                    </span>
                  ))}
              </div>
            ) : null}
            <div className="mt-4 inline-flex rounded-[12px] border border-[var(--cfsp-border)] p-1">
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
            <div
              className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full px-3 py-2 text-sm font-bold"
              style={{
                border: `1px solid ${saveStateAppearance.border}`,
                background: saveStateAppearance.background,
                color: saveStateAppearance.color,
              }}
            >
              <span>{saveStateAppearance.label}</span>
              {lastSavedLabel ? <span style={{ color: "var(--cfsp-text-muted)" }}>Saved {lastSavedLabel}</span> : null}
            </div>
            <div className="mt-3 text-sm font-semibold text-[#5e7388]">
              {builderMode === "simple"
                ? "Core Setup keeps the command surface inputs focused on schedule generation."
                : "Advanced Editing adds arrival, prebrief, wrap-up, timing overrides, and bulk schedule controls."}
            </div>
            {uploadedLearners.length > 0 && slotsPerRound > 0 ? (
              <div className="mt-3 text-sm font-semibold text-[#165a96]">
                Auto-calculated from learner count and room capacity: {uploadedLearners.length} learners,{" "}
                {totalRoomCount} rooms, {slotsPerRound} seats per round, {autoCalculatedRounds} rounds required.
              </div>
            ) : null}
          </div>
          {props.backHref ? (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Link href={props.backHref} className="cfsp-btn cfsp-btn-primary">
                {props.backLabel || "Return to Event"}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className="cfsp-panel sticky top-3 z-20 px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3">
            <div>
              <div className="cfsp-label">Schedule status</div>
              <div className="mt-2 text-[1.4rem] font-black text-[#14304f]">{scheduleWorkflowBadgeLabel}</div>
              <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                {lastSavedLabel ? `Last saved ${lastSavedLabel}` : "Changes save into the active builder draft as you work."}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="cfsp-chip">Learners {learnerRoster.length}</span>
              <span className="cfsp-chip">Rooms {totalRoomCount}</span>
              <span className="cfsp-chip">Rounds {effectiveRoundCount}</span>
              <span className="cfsp-chip">
                Cases {activeCaseDisplayCount}
                {configuredFlexRoomCountForDisplay
                  ? ` • ${configuredFlexRoomCountForDisplay} flex/empty`
                  : ""}
              </span>
              <span className="cfsp-chip">{scheduleWorkflowBadgeLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#5e7388]">
                Schedule Day
                <select
                  value={scheduleDay}
                  onChange={(event) => navigateToScheduleBuilderDay(Number.parseInt(event.target.value, 10) || 1)}
                  className="cfsp-input h-9 min-w-[120px] rounded-[10px] px-3 text-sm normal-case tracking-normal"
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
            </div>
          </div>
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
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
                  minWidth: 148,
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
            {learnerRoster.length > 1 ? (
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
            ) : null}
          </div>
        </div>
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
                Upload a CSV or Excel roster to populate real learner names. If you skip the upload, the builder will use Learner 1, Learner 2, and so on.
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
                </div>
                <div className="text-sm font-semibold text-[#5e7388]">
                  Use the Student Name column for learner names. Email Address and Notes are optional.
                </div>
                <label className="grid gap-2">
                  <span className="cfsp-label">Manual Student / Learner List</span>
                  <textarea
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
                    {uploadedLearners.length ? `${uploadedLearners.length} uploaded learners` : `${learnerRoster.length} generated learners`}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                    {learnerFileName && uploadedLearners.length ? `Source: ${learnerFileName}` : "Using builder-generated fallback learner names."}
                  </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {learnerRoster.length > 1 ? (
                    <button type="button" onClick={handleRandomizeLearners} className="cfsp-btn cfsp-btn-secondary">
                      Randomize Learner Spread
                    </button>
                  ) : null}
                  {originalUploadedLearners.length ? (
                    <button type="button" onClick={handleResetLearnerOrder} className="cfsp-btn cfsp-btn-secondary">
                      Reset Uploaded Order
                    </button>
                  ) : null}
                  {uploadedLearners.length ? (
                    <button type="button" onClick={() => setShowClearRosterDialog(true)} className="cfsp-btn cfsp-btn-secondary">
                      Clear Roster
                    </button>
                  ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {learnerRoster.slice(0, 10).map((learner) => (
                      <span key={learner} className="cfsp-chip">
                        {learner}
                      </span>
                    ))}
                    {learnerRoster.length > 10 ? (
                      <span className="text-sm font-semibold text-[#6a7e91]">+{learnerRoster.length - 10} more</span>
                    ) : null}
                  </div>
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
                    {generated.rounds.length ? formatTimeWithDayOffset(rotationEnd) : "Not generated yet"}
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
                  <div className="mt-2 text-base font-black text-[#14304f]">{generated.configuredLength} minutes</div>
                </div>
              </div>
              {learnerCapacitySummary ? (
                <div className="cfsp-alert cfsp-alert-info mt-4">{learnerCapacitySummary}</div>
              ) : null}
              {uploadedLearners.length > 0 && slotsPerRound > 0 ? (
                <div className="mt-3 text-sm font-semibold text-[#5e7388]">
                  {slotsPerRound} seats per round across {totalRoomCount} configured room
                  {totalRoomCount === 1 ? "" : "s"}.
                </div>
              ) : null}
              {uploadedLearners.length > 0 && slotsPerRound <= 0 ? (
                <div className="cfsp-alert cfsp-alert-error mt-4">
                  Add at least one usable room or flex seat to calculate the required rounds.
                </div>
              ) : null}
              {manualRoundOverrideApplies && uploadedLearners.length > 0 && slotsPerRound > 0 ? (
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
                    onChange={setExamRoomCount}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="cfsp-btn cfsp-btn-secondary"
                      onClick={() => setExamRoomCount(String(Math.max(1, parseNumber(examRoomCount, 1) - 1)))}
                    >
                      − Room
                    </button>
                    <button
                      type="button"
                      className="cfsp-btn cfsp-btn-primary"
                      onClick={() => setExamRoomCount(String(Math.max(1, parseNumber(examRoomCount, 0) + 1)))}
                    >
                      + Room
                    </button>
                  </div>
                </div>
                <NumberInput label={roomCapacityLabel} value={roomCapacity} onChange={handleRoomCapacityChange} />
                {!isVirtualEvent ? (
                  <>
                    <NumberInput label="Number of flex rooms" value={flexRoomCount} onChange={setFlexRoomCount} />
                    <NumberInput label="Flex capacity" value={maxPairsPerFlexRoom} onChange={setMaxPairsPerFlexRoom} />
                  </>
                ) : null}
                <NumberInput label="Encounter minutes" value={encounterMinutes} onChange={setEncounterMinutes} />

                {/* CORE_PREBRIEF_FIELD_INSERTED */}
              <NumberInput label="Faculty prebrief minutes" value={facultyPrebriefMinutes} onChange={setFacultyPrebriefMinutes} />
                <NumberInput label="Round target minutes (optional)" value={sessionLengthMinutes} onChange={setSessionLengthMinutes} />
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
                      {multipleCasesEnabled && parsedExamRooms > activeCaseCount
                        ? `${parsedExamRooms - activeCaseCount} flex/empty`
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
                    {uploadedLearners.length || 0} learner{uploadedLearners.length === 1 ? "" : "s"} in groups of {parsedRoomCapacity} rotating through {activeCaseCount} active case{activeCaseCount === 1 ? "" : "s"} requires {effectiveRoundCount} round{effectiveRoundCount === 1 ? "" : "s"}.
                    {configuredFlexRoomCountForDisplay ? ` ${configuredFlexRoomCountForDisplay} room${configuredFlexRoomCountForDisplay === 1 ? "" : "s"} will stay flex/empty.` : ""}
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
                      <div className="cfsp-label">Single-case event</div>
                      <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                        Multi-case rotation controls are hidden. Enable them only when cases should drive learner rotation math.
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
                              { value: "operations", label: "Operations View" },
                              { value: "both", label: "Both" },
                            ]}
                            onChange={(value) => handleUpdateDayBlock(block.id, { visibleTo: value as DayBlockVisibility })}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[12px] border border-dashed border-[#c9d7e3] bg-white px-4 py-4 text-sm font-semibold text-[#5e7388]">
                      No schedule blocks yet. Add a break, checklist, SOAP notes, feedback, lunch, transition, debrief, or custom block when you need it.
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
                    <>
                      <NumberInput label="Number of flex rooms" value={flexRoomCount} onChange={setFlexRoomCount} />
                      <NumberInput label="Flex capacity" value={maxPairsPerFlexRoom} onChange={setMaxPairsPerFlexRoom} />
                    </>
                  ) : null}
                  <NumberInput label="Room setup minutes" value={roomSetupMinutes} onChange={setRoomSetupMinutes} />
                  <NumberInput label="Student prebrief minutes" value={studentPrebriefMinutes} onChange={setStudentPrebriefMinutes} />
                  <NumberInput label="SP prebrief minutes" value={spPrebriefMinutes} onChange={setSpPrebriefMinutes} />
                  <NumberInput label="Faculty prebrief minutes" value={facultyPrebriefMinutes} onChange={setFacultyPrebriefMinutes} />
                  <ToggleInput label="Manual rounds override" checked={manualRoundOverride} onChange={setManualRoundOverride} />
                  <NumberInput label="Manual round count" value={roundCount} onChange={setRoundCount} disabled={!manualRoundOverride} />
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

          <section className="cfsp-panel px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Time Ticket & Schedule Preview</h3>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Switch between audience-facing Time Tickets and the full operations schedule without leaving the builder.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {renderScheduleViewToggle(false)}
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
              </div>
            </div>
            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#5e7388]">
              Output: {schedulePreview.summary}
            </div>

            {copyMessage ? (
              <div className={`mt-4 text-sm font-semibold ${copyMessageTone === "error" ? "text-[#c23b3b]" : "text-[#196b57]"}`}>
                {copyMessage}
              </div>
            ) : null}
            {scheduleValidationMessages.length ? (
              <div className="cfsp-alert cfsp-alert-error mt-4">
                <strong>Schedule validation failed.</strong> {scheduleValidationMessages.join(" ")}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-black text-[#14304f]">Live source: {schedulePreview.title}</div>
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
            <div className="mt-3 grid gap-3 rounded-[16px] border border-[#dce6ee] bg-[#f8fbfd] p-3">
              <div className="flex flex-wrap items-center gap-2">
                {renderScheduleActionsMenu(false)}
                <button type="button" onClick={() => void handleCompleteSchedule()} className="cfsp-btn">
                  Complete Schedule
                </button>
              </div>
              <div className="overflow-hidden rounded-[14px] border border-[#dce6ee] bg-white">
                <iframe
                  title={`${schedulePreview.title} inline preview`}
                  srcDoc={schedulePreview.html}
                  style={{ width: "100%", height: "520px", border: "none", background: "#fff", display: "block" }}
                />
              </div>
            </div>

            {parsedStartMinutes === null ? (
              <div className="cfsp-alert cfsp-alert-error mt-5">Enter a valid start time to generate a full schedule preview.</div>
            ) : (
              <div className="mt-5 grid gap-4">
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#5e7388]">
                        Day Rhythm
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
                          <div className="text-sm font-black uppercase tracking-[0.08em]">{entry.block.label}</div>
                          <div className="text-xs font-bold">
                            {formatRange(entry.block.start, entry.block.end)} ·{" "}
                            {formatDurationCompact(getBlockDurationMinutes(entry.block.start, entry.block.end))}
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
                              {formatRange(entry.round.start, entry.round.end)}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-[#5e7388]">
                              {getFlowRhythmSummary(entry.round)}
                            </div>
                          </div>
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
                          Round {selectedBuilderRoundContext.round} · {formatRange(selectedBuilderRoundContext.start, selectedBuilderRoundContext.end)}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                          {getFlowRhythmSummary(selectedBuilderRoundContext)}
                        </div>
                      </div>
                      <div className="rounded-full border border-[#dce6ee] bg-[#f8fbfd] px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#165a96]">
                        {selectedBuilderRoundContext.roomSlots.length} room
                        {selectedBuilderRoundContext.roomSlots.length === 1 ? "" : "s"}
                      </div>
                    </div>
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
                            <div className="font-black">{block.label}</div>
                            <div className="text-sm font-bold">{formatRange(block.start, block.end)}</div>
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
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Rotation Schedule</h3>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", margin: "14px 0", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, color: "#17324d" }}>
                    Breakout Rooms: {examRoomCount}
                  </span>
                  <button
                    type="button"
                    className="cfsp-btn cfsp-btn-secondary"
                    onClick={() => setExamRoomCount(String(Math.max(1, parseNumber(examRoomCount, 1) - 1)))}
                  >
                    − Room
                  </button>
                  <button
                    type="button"
                    className="cfsp-btn cfsp-btn-primary"
                    onClick={() => setExamRoomCount(String(Math.max(1, parseNumber(examRoomCount, 0) + 1)))}
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
                      <th className="px-3 py-3 font-black">Time</th>
                      {roomColumns.map((column) => (
                        <th key={column.roomName} className="px-3 py-3 font-black">
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
                            <td colSpan={roomColumns.length + 2} className="px-3 py-3">
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
                                  <div className="text-base font-black">{entry.block.label}</div>
                                  <div className="text-sm font-bold">
                                    {formatRange(entry.block.start, entry.block.end)} · {durationMinutes} minutes
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
                            <div className="font-bold">{formatRange(round.start, round.end)}</div>
                            <div className="mt-2 grid gap-1 text-xs font-semibold text-[#5e7388]">
                              {round.subBlocks
                                .filter((subBlock) => !isMajorScheduleDividerBlock(subBlock))
                                .map((subBlock) => (
                                <div key={`${round.round}-${subBlock.label}-${subBlock.start}`}>
                                  {subBlock.label}: {formatRange(subBlock.start, subBlock.end)}
                                </div>
                              ))}
                            </div>
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
                                        (typeof slot.assignedSpIndex === "number"
                                          ? normalizeDisplayText(selectedEvent?.assigned_sp_names?.[slot.assignedSpIndex]) || "Unassigned SP"
                                          : "Unassigned SP")}
                                    </div>
                                    {normalizeDisplayText(slot.backupSpName) ? (
                                      <div>
                                        <strong>Backup:</strong> {normalizeDisplayText(slot.backupSpName)}
                                      </div>
                                    ) : (
                                      <div style={{ opacity: 0.72 }}>No backup assigned</div>
                                    )}
                                    <div>Case: {normalizeDisplayText(slot.caseLabel) || selectedEventEncounterLabel || "Case not assigned"}</div>
                                    <div>Role: {normalizeDisplayText(slot.roleLabel) || "Role TBD"}</div>
                                  </div>
                                ) : null}
                                <div style={{ marginTop: "8px", display: "grid", gap: "6px" }}>
                                  {slot.learnerLabels.map((learner) => (
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
                                  ))}
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
