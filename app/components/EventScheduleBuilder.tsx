"use client";

import * as XLSX from "xlsx";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatHumanDate, getImportedYearHint } from "../lib/eventDateUtils";
import { parseEventMetadata, upsertEventMetadata } from "../lib/eventMetadata";
import { normalizeLearnerName, normalizeLearnerNames } from "../lib/learnerNames";
import { getRoomDisplayLabel, getRoomTypeLabel } from "../lib/roomNaming";

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
};

type GeneratedRound = {
  round: number;
  start: number;
  end: number;
  roomSlots: GeneratedRoomSlot[];
  subBlocks: RoundSubBlock[];
};

type ScheduledRoomSlot = GeneratedRoomSlot & {
  learnerLabels: string[];
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
  | "event_session"
  | "imported_event_info"
  | "training_metadata"
  | "saved_draft"
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
    asText(me?.profile?.full_name) ||
    asText(me?.profile?.schedule_name) ||
    asText(me?.profile?.email) ||
    asText(me?.user?.email)
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

function getNotesLineValue(notes: string | null | undefined, label: "Training Time" | "Event Time") {
  const match = asText(notes).match(new RegExp(`(?:^|\\n)${label}\\s*:\\s*(.+?)(?:\\n|$)`, "i"));
  return asText(match?.[1]);
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

  if (!event) {
    if (savedDraft?.startTime) {
      return {
        source: "saved_draft",
        label: "Using saved builder draft",
        startTime: savedDraft.startTime,
        endTime: "",
        sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(savedDraft.sessionLengthMinutes),
      };
    }
    return defaultPrefill;
  }

  const eventStartMinutes = parseClockTextToMinutes(asText(event.earliest_session_start));
  const eventEndMinutes = parseClockTextToMinutes(asText(event.latest_session_end));
  if (eventStartMinutes !== null) {
    return {
      source: "event_session",
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
      source: "imported_event_info",
      label: "Using imported SP Event Info time",
      startTime: minutesToInputTime(importedEventRange.startMinutes),
      endTime:
        importedEventRange.endMinutes !== null ? minutesToInputTime(importedEventRange.endMinutes) : "",
      sessionLengthMinutes: "0",
    };
  }

  const trainingMetadataRange = extractTimeRange(
    asText(metadata.imported_training_time) ||
      getNotesLineValue(event.notes, "Training Time") ||
      getNotesLineValue(event.notes, "Event Time")
  );
  if (trainingMetadataRange.startMinutes !== null) {
    return {
      source: "training_metadata",
      label: "Using training/session metadata",
      startTime: minutesToInputTime(trainingMetadataRange.startMinutes),
      endTime:
        trainingMetadataRange.endMinutes !== null ? minutesToInputTime(trainingMetadataRange.endMinutes) : "",
      sessionLengthMinutes: "0",
    };
  }

  if (savedDraft?.startTime) {
    return {
      source: "saved_draft",
      label: "Using saved builder draft",
      startTime: savedDraft.startTime,
      endTime: "",
      sessionLengthMinutes: sanitizeSavedRoundTargetMinutes(savedDraft.sessionLengthMinutes),
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

function formatEventDate(event: EventRow) {
  const dateSource = event.earliest_session_date || event.date_text;
  if (!dateSource) return "Date TBD";
  return formatHumanDate(dateSource, getImportedYearHint(event.notes)) || dateSource;
}

function getAssignedNames(event: EventRow) {
  return (event.assigned_sp_names || []).filter(Boolean);
}

function getCaseLabelFromBuilderEvent(event: EventRow | null, caseName?: string | null) {
  const explicit = asText(caseName);
  if (explicit) return explicit;

  const noteMatch = asText(event?.notes).match(/(?:^|\n)(?:Case|Case Name|Station Case)\s*:\s*(.+?)(?:\n|$)/i);
  const noteValue = asText(noteMatch?.[1]);
  if (noteValue) return noteValue;

  const parsedTraining = parseEventMetadata(event?.notes).training;
  const caseFileLabel =
    asText(parsedTraining.case_name) ||
    asText(parsedTraining.case_file_url).split("/").pop()?.replace(/\.[^.]+$/, "") ||
    "";
  return caseFileLabel;
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
  encounterMinutes: number;
  dayBlocks: DayBlockConfig[];
  timingVisibility?: ScheduleTimingVisibility;
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

  for (let roundIndex = 0; roundIndex < args.rounds; roundIndex += 1) {
    const roundNumber = roundIndex + 1;
    const subBlocks: RoundSubBlock[] = [];
    let current = roundStart;
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

    const examSlots: GeneratedRoomSlot[] = Array.from({ length: args.examRoomCount }, (_, index) => ({
      roomName: `Exam ${index + 1}`,
      roomType: "exam",
      capacity: args.examRoomCapacity,
      capacityLabel: `${args.examRoomCapacity} learner${args.examRoomCapacity === 1 ? "" : "s"}`,
    }));

    const flexSlots: GeneratedRoomSlot[] = Array.from({ length: args.flexRoomCount }, (_, index) => ({
      roomName: `Flex ${index + 1}`,
      roomType: "flex",
      capacity: args.maxPairsPerFlexRoom,
      capacityLabel: `Up to ${args.maxPairsPerFlexRoom} learners`,
    }));

    rounds.push({
      round: roundNumber,
      start: roundStart,
      end: roundStart + roundTargetLength,
      roomSlots: [...examSlots, ...flexSlots],
      subBlocks,
    });

    roundStart += roundTargetLength;
  }

  const configuredLength = configuredLengthValues.length ? Math.max(...configuredLengthValues, 0) : 0;
  const roundLength = Math.max(configuredLength, 1);
  const overrunMinutes =
    args.sessionLengthMinutes > 0 && args.sessionLengthMinutes <= MAX_IMPORTED_ROUND_TARGET_MINUTES
      ? Math.max(configuredLength - args.sessionLengthMinutes, 0)
      : 0;

  return { rounds, roundLength, configuredLength, overrunMinutes };
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
  const normalizedScheduleEndReference = Math.max(rotationEnd, args.referenceEndMinutes ?? rotationEnd);
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
    args.afterRotationDayBlocks.forEach((block) => {
      const minutes = parseNumber(block.durationMinutes, 0);
      timeline.push({
        label: asText(block.label) || getDefaultDayBlockLabel(block.type),
        start: current,
        end: current + minutes,
        detail: `${minutes} minutes`,
        tone: getDayBlockTone(block.type),
        visibleTo: block.visibleTo,
      });
      current += minutes;
    });
  }

  args.specificTimeDayBlocks.forEach((block) => {
    const start = normalizeTimelineClock(toMinutes(block.specificTime));
    const minutes = parseNumber(block.durationMinutes, 0);
    if (start === null || minutes <= 0) return;
    timeline.push({
      label: asText(block.label) || getDefaultDayBlockLabel(block.type),
      start,
      end: start + minutes,
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

function attachLearners(rounds: GeneratedRound[], learnerRoster: string[]) {
  const normalizedLearnerRoster = normalizeLearnerNames(learnerRoster);
  if (!rounds.length || !normalizedLearnerRoster.length) return [] as ScheduledRound[];

  const slotsPerRound = rounds[0]?.roomSlots.reduce((sum, slot) => sum + slot.capacity, 0) || 0;

  return rounds.map((round, roundIndex) => {
    let cursor = roundIndex * slotsPerRound;

    return {
      ...round,
      roomSlots: round.roomSlots.map((slot) => {
        const learnerLabels = Array.from({ length: slot.capacity }, (_, offset) => {
          const learnerIndex = cursor + offset;
          return learnerIndex < normalizedLearnerRoster.length ? normalizedLearnerRoster[learnerIndex] : "";
        }).filter(Boolean);
        cursor += slot.capacity;
        return { ...slot, learnerLabels };
      }),
    };
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

function normalizePdfText(text: string) {
  const replacements: Record<string, string> = {
    "\u2013": "-",
    "\u2014": "-",
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2022": "*",
    "\u00b7": "-",
    "\u00a0": " ",
  };

  return text.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, (character) => replacements[character] || " ");
}

function escapePdfText(text: string) {
  return normalizePdfText(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapPdfLine(line: string, maxCharacters: number) {
  const normalizedLine = normalizePdfText(line).replace(/\s+/g, " ").trim();
  if (!normalizedLine) return [""];
  if (normalizedLine.length <= maxCharacters) return [normalizedLine];

  const wrapped: string[] = [];
  const words = normalizedLine.split(" ");
  let currentLine = "";

  words.forEach((word) => {
    if (word.length > maxCharacters) {
      if (currentLine) {
        wrapped.push(currentLine);
        currentLine = "";
      }
      for (let index = 0; index < word.length; index += maxCharacters) {
        wrapped.push(word.slice(index, index + maxCharacters));
      }
      return;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > maxCharacters) {
      wrapped.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  });

  if (currentLine) wrapped.push(currentLine);
  return wrapped;
}

function buildSchedulePdfBlob(title: string, text: string) {
  const normalizedTitle = normalizePdfText(title || "Schedule");
  const sourceLines = [normalizedTitle, "", ...text.split(/\r?\n/)];
  const wrappedLines = sourceLines.flatMap((line) => wrapPdfLine(line, 96));
  const linesPerPage = 48;
  const pages: string[][] = [];

  for (let index = 0; index < wrappedLines.length; index += linesPerPage) {
    pages.push(wrappedLines.slice(index, index + linesPerPage));
  }

  if (!pages.length) pages.push([normalizedTitle]);

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(`${objects.length + 1} 0 obj\n${body}\nendobj\n`);
    return objects.length;
  };

  addObject("<< /Type /Catalog /Pages 2 0 R >>");
  addObject("");
  const fontObjectNumber = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageObjectNumbers: number[] = [];

  pages.forEach((pageLines, pageIndex) => {
    const contentLines = ["BT", "72 744 Td"];
    pageLines.forEach((line, lineIndex) => {
      const isTitle = pageIndex === 0 && lineIndex === 0;
      contentLines.push(`/F1 ${isTitle ? "18" : "10"} Tf`);
      contentLines.push(`(${escapePdfText(line)}) Tj`);
      contentLines.push(`0 -${isTitle ? "24" : "14"} Td`);
    });
    contentLines.push("ET");

    const stream = contentLines.join("\n");
    const contentObjectNumber = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageObjectNumber = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
    pageObjectNumbers.push(pageObjectNumber);
  });

  objects[1] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageObjectNumbers.length} >>\nendobj\n`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += object;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
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

  const lines: string[] = [];

  if (event) {
    lines.push(`Event: ${event.name || "Untitled Event"}`);
    lines.push(`Date/Location: ${formatEventDate(event)}${event.location ? ` · ${event.location}` : ""}`);
    if (selectedEventSummaryTime) {
      lines.push(`Time Window: ${selectedEventSummaryTime}`);
    }
    lines.push(`Rooms in Rotation: ${generated.rounds[0]?.roomSlots.length || 0}`);
    lines.push("");
  }

  const includeOperationsContext = isOperations;
  const previewLabel = titleMap[kind];

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
        const assignmentIndex = round.roomSlots.findIndex((item) => item.roomName === slot.roomName);
        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
        lines.push(`  ${displayRoomName}: ${learnerText}`);
        if (isOperations) {
          const spName = assignedSpNames?.[assignmentIndex] || "Unassigned";
          lines.push(`    SP: ${spName}`);
          if (caseName) lines.push(`    Case: ${caseName}`);
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
    if (!meaningfulPreviewTimeline.length) {
      lines.push("No announcement schedule has been generated yet.");
    } else {
      meaningfulPreviewTimeline.forEach((block) => {
        lines.push(`${formatRange(block.start, block.end)}  ${block.label}${block.detail ? ` (${block.detail})` : ""}`);
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
        const assignmentIndex = round.roomSlots.findIndex((item) => item.roomName === slot.roomName);
        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
        lines.push(`  ${displayRoomName}`);
        if (kind !== "sp") {
          lines.push(`    Learner: ${learnerText}`);
        }
        if (kind === "sp") {
          lines.push(`    Assignment: ${assignedSpNames?.[assignmentIndex] || "Unassigned"}`);
        }
        if (includeOperationsContext) {
          lines.push(`    SP: ${assignedSpNames?.[assignmentIndex] || "Unassigned SP"}`);
          if (caseName) lines.push(`    Case: ${caseName}`);
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
            <div class="event-meta-label">Date / Location</div>
            <div class="event-meta-value">${escapeHtml(`${formatEventDate(event)}${event.location ? ` · ${event.location}` : ""}`)}</div>
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
                          const assignmentIndex = round.roomSlots.findIndex((item) => item.roomName === slot.roomName);
                          const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
                          const spName = assignedSpNames?.[assignmentIndex] || "Unassigned";
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
          <thead>
            <tr>
              <th>Round</th>
              <th>Time</th>
              ${roomColumns.map((column) => `<th>${escapeHtml(column.displayRoomName)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${previewScheduleGridRows
              .map((entry) => {
                if (entry.kind === "wide") {
                  const durationMinutes = Math.max(getBlockDurationMinutes(entry.block.start, entry.block.end), 1);
                  return `
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
                  `;
                }

                const round = entry.round;
                const subBlockSummary = getFlowRhythmSummary(round) || "Encounter flow only";

                return `
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
                        const assignmentIndex = round.roomSlots.findIndex((item) => item.roomName === slot.roomName);
                        const learnerText = slot.learnerLabels.length ? slot.learnerLabels.join(", ") : "No learner assigned";
                        const spName = assignedSpNames?.[assignmentIndex] || "Unassigned";

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
                                isOperations && caseName
                                  ? `<div><span class="detail-label">Case</span><span class="detail-value">${escapeHtml(caseName)}</span></div>`
                                  : ""
                              }
                              <div><span class="detail-label">Seat</span><span class="detail-value">${escapeHtml(slot.capacityLabel)}</span></div>
                            </div>
                          </td>
                        `;
                      })
                      .join("")}
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
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
                <h2>Operational prompts and pacing</h2>
              </div>
            </div>
            ${renderTimelineRail(timeline)}
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
            <section class="round-section">
              <div class="round-header">
                <div>
                  <div class="round-kicker">Schedule rhythm</div>
                  <h2>Operational cadence</h2>
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

  return {
    kind,
    title: titleMap[kind],
    summary: timelineSummary,
    text: lines.join("\n"),
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
            .schedule-grid-table th { text-align: left; padding: 12px; border-bottom: 1px solid #dce6ee; color: #5e7388; font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; background: #f8fbfd; }
            .schedule-grid-table td { padding: 12px; border-bottom: 1px solid #eef3f7; vertical-align: top; background: #ffffff; }
            .round-index { font-size: 13px; font-weight: 900; color: #14304f; white-space: nowrap; }
            .round-time { font-size: 13px; font-weight: 900; color: #14304f; }
            .round-time-summary { margin-top: 6px; font-size: 12px; line-height: 1.45; color: #5e7388; }
            .schedule-room-cell { background: #fdfefe; min-width: 180px; }
            .schedule-room-card { border: 1px solid #dce6ee; border-radius: 12px; background: #f8fbfd; padding: 10px; display: grid; gap: 8px; }
            .wide-row td { background: #f8fbfd; }
            .wide-band { border: 1px solid #f1d1a7; border-radius: 14px; background: #fff6e8; color: #a86411; padding: 12px 14px; display: grid; gap: 6px; }
            .wide-band-title { font-size: 15px; font-weight: 900; }
            .wide-band-meta, .wide-band-note { font-size: 12px; font-weight: 700; opacity: 0.9; }
            .empty-state { border: 1px dashed #cbd5e1; border-radius: 12px; padding: 14px; color: #64748b; background: #fff; font-size: 13px; font-weight: 600; }
            @media print {
              body { background: #ffffff; padding: 0; }
              .preview-shell { gap: 12px; }
              .schedule-grid-shell { border: none; }
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

function getStorageKey(eventId?: string) {
  return `cfsp:schedule-builder:${eventId || "global"}`;
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

function formatSavedTimestamp(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  const skipNextAutosaveRef = useRef(false);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const workflowSyncTimeoutRef = useRef<number | null>(null);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [previewKind, setPreviewKind] = useState<SchedulePreviewKind>(props.initialPreviewKind || "timeline");
  const [showExpandedFlowDetails, setShowExpandedFlowDetails] = useState(false);
  const [activeFlowDetailKey, setActiveFlowDetailKey] = useState("");
  const [me, setMe] = useState<BuilderMeResponse | null>(null);

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

  const storageKey = useMemo(
    () => getStorageKey(props.fixedEventId || selectedEventId || ""),
    [props.fixedEventId, selectedEventId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKey || hydratedDraftKeyRef.current === storageKey) return;

    const savedDraft = parseSavedDraft(window.localStorage.getItem(storageKey));
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
  }, [draftSnapshot, storageKey]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId]
  );
  function showCopyMessage(message: string, tone: "success" | "error" = "success", timeoutMs = 2400) {
    setCopyMessageTone(tone);
    setCopyMessage(message);
    if (typeof window !== "undefined") {
      window.setTimeout(() => setCopyMessage(""), timeoutMs);
    }
  }

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

    const savedDraft = parseSavedDraft(window.localStorage.getItem(storageKey));
    const nextTimeSource = buildTimePrefill(selectedEvent, savedDraft);

    hydratedTimePrefillKeyRef.current = hydrationKey;
    skipNextAutosaveRef.current = true;
    setTimeSource(nextTimeSource);
    setStartTime(nextTimeSource.startTime);
    if (nextTimeSource.sessionLengthMinutes !== "0") {
      setSessionLengthMinutes(nextTimeSource.sessionLengthMinutes);
    }
  }, [selectedEvent, selectedEventId, storageKey]);

  const selectedEventMetadata = useMemo(
    () => parseEventMetadata(selectedEvent?.notes).training,
    [selectedEvent?.notes]
  );
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
  const slotsPerRound = parsedExamRooms * parsedRoomCapacity + effectiveFlexRoomCount * effectiveFlexCapacity;
  const totalRoomCount = parsedExamRooms + effectiveFlexRoomCount;
  const autoCalculatedRounds =
    uploadedLearners.length && slotsPerRound > 0
      ? Math.max(1, Math.ceil(uploadedLearners.length / slotsPerRound))
      : Math.max(parsedRounds, 1);
  const effectiveRoundCount =
    builderMode === "advanced" && manualRoundOverride
      ? Math.max(parsedRounds, 1)
      : autoCalculatedRounds;
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
      };
    }

    const { rounds, roundLength, configuredLength, overrunMinutes } =
      calculateRoundTimingsWithBlocks({
      startMinutes: parsedStartMinutes,
      rounds: effectiveRoundCount,
      sessionLengthMinutes: parsedSessionLength,
      examRoomCount: parsedExamRooms,
      examRoomCapacity: parsedRoomCapacity,
      flexRoomCount: effectiveFlexRoomCount,
      maxPairsPerFlexRoom: effectiveFlexCapacity,
      encounterMinutes: parsedEncounter,
      dayBlocks: normalizedDayBlocks,
      timingVisibility,
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
    };
  }, [
    effectiveRoundCount,
    afterRotationDayBlocks,
    beforeRotationDayBlocks,
    normalizedDayBlocks,
    parsedEncounter,
    parsedExamRooms,
    parsedFacultyArrival,
    parsedFacultyPrebrief,
    effectiveFlexCapacity,
    effectiveFlexRoomCount,
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
    if (asText(startTime) && parsedStartMinutes === null) {
      messages.push("Start time could not be read. The builder will wait for a valid time before generating rounds.");
    }
    if (parsedEncounter !== sanitizeEncounterMinutes(parsedEncounter)) {
      messages.push(`Encounter duration is outside the operational range; using ${DEFAULT_ENCOUNTER_MINUTES} minutes for generated rounds.`);
    }
    if (parsedSessionLength > MAX_IMPORTED_ROUND_TARGET_MINUTES) {
      messages.push(`Round target ${parsedSessionLength} minutes is ignored to prevent inflated round blocks.`);
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
    normalizedReferenceEndMinutes,
    parsedEncounter,
    parsedReferenceEndMinutes,
    parsedSessionLength,
    parsedStartMinutes,
    startTime,
    timeSource.endTime,
    timingVisibility,
  ]);

  const learnerRoster = useMemo(
    () => buildLearnerRoster(uploadedLearners, Math.max(slotsPerRound, 1), generated.rounds.length),
    [generated.rounds.length, slotsPerRound, uploadedLearners]
  );
  useEffect(() => {
    if (!selectedEvent?.id) return;
    if (skipNextAutosaveRef.current) return;

    if (workflowSyncTimeoutRef.current) {
      window.clearTimeout(workflowSyncTimeoutRef.current);
    }

    workflowSyncTimeoutRef.current = window.setTimeout(() => {
      const now = new Date().toISOString();
      const nextStatus = scheduleWorkflowStatus === "complete" ? "complete" : "in_progress";
      const partial = {
        schedule_status: nextStatus,
        rotation_schedule_status: nextStatus === "complete" ? "complete" : "built",
        schedule_started_at: selectedEventMetadata.schedule_started_at || now,
        schedule_last_saved_at: now,
        schedule_updated_at: now,
        schedule_learner_count: String(learnerRoster.length),
        schedule_room_count: String(totalRoomCount),
        schedule_round_count: String(effectiveRoundCount),
        schedule_room_capacity: String(parsedRoomCapacity),
        schedule_learner_roster: serializeScheduleLearnerRosterMetadata(
          uploadedLearners.length ? uploadedLearners : originalUploadedLearners
        ),
        schedule_preview_enabled_for_sps: selectedEventMetadata.schedule_preview_enabled_for_sps || "no",
      };
      void persistScheduleWorkflowMetadata(partial).catch(() => {
        // Keep the builder usable even if event metadata persistence is temporarily unavailable.
      });
    }, 1400);

    return () => {
      if (workflowSyncTimeoutRef.current) {
        window.clearTimeout(workflowSyncTimeoutRef.current);
      }
    };
  }, [
    draftSnapshot,
    effectiveRoundCount,
    learnerRoster.length,
    originalUploadedLearners,
    parsedRoomCapacity,
    persistScheduleWorkflowMetadata,
    scheduleWorkflowStatus,
    selectedEvent?.id,
    selectedEventMetadata.schedule_preview_enabled_for_sps,
    selectedEventMetadata.schedule_started_at,
    totalRoomCount,
    uploadedLearners,
  ]);

  const scheduledRounds = useMemo(
    () => attachLearners(generated.rounds, learnerRoster),
    [generated.rounds, learnerRoster]
  );
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

  const assignedNames = selectedEvent ? getAssignedNames(selectedEvent) : [];
  const selectedEventEncounterLabel = useMemo(
    () => getCaseLabelFromBuilderEvent(selectedEvent, selectedEventMetadata.case_name),
    [selectedEvent, selectedEventMetadata.case_name]
  );
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
      caseName: selectedEventEncounterLabel,
      assignedSpNames: selectedEvent?.assigned_sp_names || [],
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
      caseName: selectedEventEncounterLabel,
      assignedSpNames: selectedEvent?.assigned_sp_names || [],
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
      caseName: selectedEventEncounterLabel,
      assignedSpNames: selectedEvent?.assigned_sp_names || [],
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
      caseName: selectedEventEncounterLabel,
      assignedSpNames: selectedEvent?.assigned_sp_names || [],
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
      caseName: selectedEventEncounterLabel,
      assignedSpNames: selectedEvent?.assigned_sp_names || [],
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
      caseName: selectedEventEncounterLabel,
      assignedSpNames: selectedEvent?.assigned_sp_names || [],
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
    generated,
    learnerRoster.length,
    operationsPreviewRounds,
    operationsPreviewTimeline,
    operationsScheduleGridRows,
    roomNamingContext,
    roomColumns,
    selectedEvent,
    selectedEventEncounterLabel,
    selectedEventSummaryTime,
    props.previewFamily,
    studentPreviewRounds,
    studentPreviewTimeline,
    studentScheduleGridRows,
  ]);
  const schedulePreview = schedulePreviews[previewKind];
  const selectedPreviewBaseFileName = getSafeFileName(schedulePreview.title) || "schedule";
  const selectedPreviewPdfFileName = `${selectedPreviewBaseFileName}.pdf`;
  const selectedPreviewExportFileName = `${selectedPreviewBaseFileName}.txt`;
  const autoDownloadTriggeredRef = useRef(false);
  const previewDocumentParts = useMemo(
    () => getPreviewDocumentParts(schedulePreview.html),
    [schedulePreview.html]
  );
  useEffect(() => {
    if (loading || !props.previewOnly || !props.autoDownload || autoDownloadTriggeredRef.current || !schedulePreview.html) return;
    autoDownloadTriggeredRef.current = true;
    const downloadBlob = buildSchedulePdfBlob(schedulePreview.title, schedulePreview.text);
    const downloadUrl = URL.createObjectURL(downloadBlob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = selectedPreviewPdfFileName;
    anchor.rel = "noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }, [loading, props.autoDownload, props.previewOnly, schedulePreview.html, schedulePreview.text, schedulePreview.title, selectedPreviewPdfFileName]);
  const saveStateAppearance = getSaveStateAppearance(saveState);
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

  function handleDownloadPdf() {
    const downloadBlob = buildSchedulePdfBlob(schedulePreview.title, schedulePreview.text);
    const downloadUrl = URL.createObjectURL(downloadBlob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = selectedPreviewPdfFileName;
    anchor.rel = "noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);
    showCopyMessage(`${schedulePreview.title} PDF downloaded.`, "success", 2200);
  }

  function handleExportSchedule() {
    const downloadBlob = new Blob([schedulePreview.text], { type: "text/plain;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(downloadBlob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = selectedPreviewExportFileName;
    anchor.rel = "noreferrer";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);
    showCopyMessage(`${schedulePreview.title} exported.`, "success", 2200);
  }

  async function handlePrintPreview() {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      showCopyMessage("Print window blocked. Please allow popups for this site.", "error", 2500);
      return;
    }

    popup.document.write(schedulePreview.html);
    popup.document.close();
    popup.onload = () => {
      popup.focus();
      popup.print();
    };
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
          { label: "Print schedule", onClick: handlePrintPreview },
          { label: "Download PDF", onClick: handleDownloadPdf },
          { label: "Download/Export", onClick: handleExportSchedule },
          { label: "Copy/share link", onClick: () => void handleShareOrCopyLink() },
        ].map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={(event) => {
              action.onClick();
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
            style={{
              border: "none",
              borderRadius: 9,
              background: "transparent",
              color: isDark ? "rgba(240, 248, 255, 0.92)" : "#14304f",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 800,
              padding: "9px 10px",
              textAlign: "left",
              whiteSpace: "nowrap",
            }}
          >
            {action.label}
          </button>
        ))}
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
      await persistScheduleWorkflowMetadata({
        schedule_status: "complete",
        schedule_started_at: selectedEventMetadata.schedule_started_at || now,
        schedule_last_saved_at: now,
        schedule_updated_at: now,
        schedule_completed_at: now,
        schedule_completed_by: getBuilderUserLabel(me),
        rotation_schedule_status: "complete",
        schedule_learner_count: String(learnerRoster.length),
        schedule_room_count: String(totalRoomCount),
        schedule_round_count: String(effectiveRoundCount),
        schedule_room_capacity: String(parsedRoomCapacity),
        schedule_learner_roster: serializeScheduleLearnerRosterMetadata(
          uploadedLearners.length ? uploadedLearners : originalUploadedLearners
        ),
        schedule_preview_enabled_for_sps: selectedEventMetadata.schedule_preview_enabled_for_sps || "no",
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
    setLearnerFileName(file.name);
    setSaveState("unsaved");

    try {
      const names = await parseLearnerFile(file);
      if (!names.length) {
        throw new Error("No learner names were found in the uploaded file.");
      }
      setOriginalUploadedLearners(names);
      setUploadedLearners(names);
    } catch (error) {
      setOriginalUploadedLearners([]);
      setUploadedLearners([]);
      setLearnerUploadError(error instanceof Error ? error.message : "Could not read learner upload.");
    }
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
          @media print {
            .cfsp-schedule-viewer-toolbar { display: none !important; }
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
        <div dangerouslySetInnerHTML={{ __html: previewDocumentParts.body }} />
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

      <section className="cfsp-panel px-4 py-4">
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
              <span className="cfsp-chip">{scheduleWorkflowBadgeLabel}</span>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {props.backHref ? (
                <Link href={props.backHref} className="cfsp-btn cfsp-btn-secondary">
                  {props.backLabel || "Return to Event"}
                </Link>
              ) : null}
              {renderScheduleActionsMenu(false)}
              <button
                type="button"
                onClick={() => void handleCompleteSchedule()}
                disabled={scheduleCompletionSaving}
                className="cfsp-btn"
                style={{ opacity: scheduleCompletionSaving ? 0.65 : 1 }}
              >
                {scheduleCompletionSaving ? "Marking Complete..." : "Mark Schedule Complete"}
              </button>
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
              {builderMode === "advanced" && manualRoundOverride && uploadedLearners.length > 0 && slotsPerRound > 0 ? (
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
                <NumberInput label={roomCountLabel} value={examRoomCount} onChange={setExamRoomCount} />
                <NumberInput label={roomCapacityLabel} value={roomCapacity} onChange={handleRoomCapacityChange} />
                {!isVirtualEvent ? (
                  <>
                    <NumberInput label="Number of flex rooms" value={flexRoomCount} onChange={setFlexRoomCount} />
                    <NumberInput label="Flex capacity" value={maxPairsPerFlexRoom} onChange={setMaxPairsPerFlexRoom} />
                  </>
                ) : null}
                <NumberInput label="Encounter minutes" value={encounterMinutes} onChange={setEncounterMinutes} />
                <NumberInput label="Round target minutes (optional)" value={sessionLengthMinutes} onChange={setSessionLengthMinutes} />
              </div>
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
              <div className="mt-5 overflow-hidden rounded-[16px] border border-[#dce6ee] bg-[#f8fbfd]">
                <div className="border-b border-[#dce6ee] px-4 py-3 text-sm font-semibold text-[#5e7388]">
                  {scheduleViewMode === "student"
                    ? "Student Schedule excludes internal SP and case details."
                    : "Admin Schedule includes assigned SP, room, learner, and case details when available."}
                </div>
                <div className="max-w-full overflow-x-auto">
                <table className="w-full border-collapse text-left">
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
                                    <div>SP: {selectedEvent?.assigned_sp_names?.[round.roomSlots.findIndex((item) => item.roomName === slot.roomName)] || "Unassigned SP"}</div>
                                    <div>Case: {selectedEventEncounterLabel || "Case not assigned"}</div>
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
