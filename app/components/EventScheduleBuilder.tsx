"use client";

import * as XLSX from "xlsx";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatHumanDate, getImportedYearHint } from "../lib/eventDateUtils";
import { parseTrainingEventMetadata } from "../lib/trainingEventNotes";

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

type EventScheduleBuilderProps = {
  fixedEventId?: string;
  backHref?: string;
  backLabel?: string;
};

type TimelineBlock = {
  label: string;
  start: number;
  end: number;
  detail?: string;
  tone: "setup" | "prebrief" | "rotation" | "wrap";
};

type RoundSubBlock = {
  label: string;
  start: number;
  end: number;
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

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function toMinutes(value: string) {
  const [hoursText, minutesText] = asText(value).split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
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
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function extractTimeRange(value: string) {
  const matches =
    value.match(/\b(?:\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?|\d{1,2}\s*(?:AM|PM))\b/gi) || [];
  const parsed = matches
    .map((match) => parseClockTextToMinutes(match))
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
        sessionLengthMinutes: savedDraft.sessionLengthMinutes || "0",
      };
    }
    return defaultPrefill;
  }

  const eventStartMinutes = parseClockTextToMinutes(asText(event.earliest_session_start));
  const eventEndMinutes = parseClockTextToMinutes(asText(event.latest_session_end));
  if (eventStartMinutes !== null) {
    const derivedLength =
      eventEndMinutes !== null && eventEndMinutes > eventStartMinutes
        ? String(eventEndMinutes - eventStartMinutes)
        : "0";
    return {
      source: "event_session",
      label: "Using event session time",
      startTime: minutesToInputTime(eventStartMinutes),
      endTime: eventEndMinutes !== null ? minutesToInputTime(eventEndMinutes) : "",
      sessionLengthMinutes: derivedLength,
    };
  }

  const metadata = parseTrainingEventMetadata(event.notes);
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
      sessionLengthMinutes:
        importedEventRange.endMinutes !== null && importedEventRange.endMinutes > importedEventRange.startMinutes
          ? String(importedEventRange.endMinutes - importedEventRange.startMinutes)
          : "0",
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
      sessionLengthMinutes:
        trainingMetadataRange.endMinutes !== null && trainingMetadataRange.endMinutes > trainingMetadataRange.startMinutes
          ? String(trainingMetadataRange.endMinutes - trainingMetadataRange.startMinutes)
          : "0",
    };
  }

  if (savedDraft?.startTime) {
    return {
      source: "saved_draft",
      label: "Using saved builder draft",
      startTime: savedDraft.startTime,
      endTime: "",
      sessionLengthMinutes: savedDraft.sessionLengthMinutes || "0",
    };
  }

  return defaultPrefill;
}

function toDisplayTime(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatRange(start: number, end: number) {
  return `${toDisplayTime(start)} - ${toDisplayTime(end)}`;
}

function formatEventDate(event: EventRow) {
  const dateSource = event.earliest_session_date || event.date_text;
  if (!dateSource) return "Date TBD";
  return formatHumanDate(dateSource, getImportedYearHint(event.notes)) || dateSource;
}

function getAssignedNames(event: EventRow) {
  return (event.assigned_sp_names || []).filter(Boolean);
}

function getToneStyles(tone: TimelineBlock["tone"]) {
  if (tone === "setup") return { background: "#edf5fb", border: "#c7dcee", color: "#165a96" };
  if (tone === "prebrief") return { background: "#eefbf6", border: "#bfe4d6", color: "#196b57" };
  if (tone === "wrap") return { background: "#fff6e8", border: "#f1d1a7", color: "#a86411" };
  return { background: "#f4f7fb", border: "#d6e0e8", color: "#4f677d" };
}

function formatRoomName(roomName: string, roomType: "exam" | "flex", roomLabel: string) {
  if (roomType === "exam") {
    return roomName.replace(/^Exam\b/i, roomLabel);
  }
  if (roomLabel === "Breakout Room") {
    return roomName.replace(/^Flex\b/i, "Overflow Room");
  }
  return roomName;
}

function buildRounds(args: {
  startMinutes: number;
  rounds: number;
  sessionLengthMinutes: number;
  examRoomCount: number;
  examRoomCapacity: number;
  flexRoomCount: number;
  maxPairsPerFlexRoom: number;
  encounterMinutes: number;
  includeChecklist: boolean;
  checklistMinutes: number;
  includeSoap: boolean;
  soapMinutes: number;
  includeFeedback: boolean;
  feedbackMinutes: number;
  transitionMinutes: number;
  transitionLabel: string;
}) {
  const blockDurations = [
    { label: "Encounter", minutes: args.encounterMinutes, enabled: true },
    { label: "Checklist", minutes: args.checklistMinutes, enabled: args.includeChecklist && args.checklistMinutes > 0 },
    { label: "SOAP Note", minutes: args.soapMinutes, enabled: args.includeSoap && args.soapMinutes > 0 },
    { label: "Feedback", minutes: args.feedbackMinutes, enabled: args.includeFeedback && args.feedbackMinutes > 0 },
    { label: args.transitionLabel, minutes: args.transitionMinutes, enabled: args.transitionMinutes > 0 },
  ].filter((item) => item.enabled && item.minutes > 0);

  const configuredLength = blockDurations.reduce((sum, item) => sum + item.minutes, 0);
  const sessionLengthMinutes = Math.max(0, args.sessionLengthMinutes);
  const targetLength = sessionLengthMinutes > 0 ? sessionLengthMinutes : configuredLength;
  const roundLength = Math.max(configuredLength, targetLength, 1);
  const bufferMinutes = sessionLengthMinutes > 0 ? Math.max(sessionLengthMinutes - configuredLength, 0) : 0;
  const overrunMinutes = sessionLengthMinutes > 0 ? Math.max(configuredLength - sessionLengthMinutes, 0) : 0;
  const rounds: GeneratedRound[] = [];
  let roundStart = args.startMinutes;

  for (let roundIndex = 0; roundIndex < args.rounds; roundIndex += 1) {
    const subBlocks: RoundSubBlock[] = [];
    let current = roundStart;

    for (const block of blockDurations) {
      subBlocks.push({
        label: block.label,
        start: current,
        end: current + block.minutes,
      });
      current += block.minutes;
    }

    if (bufferMinutes > 0) {
      subBlocks.push({
        label: "Open Buffer",
        start: current,
        end: current + bufferMinutes,
      });
    }

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
      round: roundIndex + 1,
      start: roundStart,
      end: roundStart + roundLength,
      roomSlots: [...examSlots, ...flexSlots],
      subBlocks,
    });

    roundStart += roundLength;
  }

  return { rounds, roundLength, configuredLength, bufferMinutes, overrunMinutes };
}

function getFirstNonEmptyCell(row: unknown[]) {
  for (const cell of row) {
    const text = asText(cell);
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
        .map((row) => asText(row[sourceKey]))
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
    /\b(name|learner|student|group|participant)\b/i.test(firstName);

  return (skipHeader ? rest : names).filter(Boolean);
}

async function parseLearnerFile(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  return parseLearnerNamesFromWorkbook(workbook);
}

function downloadStudentRosterTemplate() {
  const csv = ["Student Name,Group,Notes", "Jordan Smith,A,", "Taylor Chen,B,Requires front-row seat"].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "student-roster-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function shuffleRoster(names: string[]) {
  const next = [...names];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildLearnerRoster(uploadedLearners: string[], slotCount: number, roundCount: number) {
  if (uploadedLearners.length) return uploadedLearners;
  const fallbackCount = Math.max(slotCount * Math.max(roundCount, 1), slotCount, 1);
  return Array.from({ length: fallbackCount }, (_, index) => `Learner ${index + 1}`);
}

function attachLearners(rounds: GeneratedRound[], learnerRoster: string[]) {
  if (!rounds.length || !learnerRoster.length) return [] as ScheduledRound[];

  const slotsPerRound = rounds[0]?.roomSlots.reduce((sum, slot) => sum + slot.capacity, 0) || 0;

  return rounds.map((round, roundIndex) => {
    let cursor = roundIndex * slotsPerRound;

    return {
      ...round,
      roomSlots: round.roomSlots.map((slot) => {
        const learnerLabels = Array.from({ length: slot.capacity }, (_, offset) => {
          const learnerIndex = cursor + offset;
          return learnerIndex < learnerRoster.length ? learnerRoster[learnerIndex] : "";
        }).filter(Boolean);
        cursor += slot.capacity;
        return { ...slot, learnerLabels };
      }),
    };
  });
}

function buildPlaintextPreview(args: {
  event: EventRow | null;
  timeline: TimelineBlock[];
  rounds: ScheduledRound[];
  roomLabel: string;
  caseName?: string;
  assignedSpNames?: string[];
  viewMode: "student" | "operations";
}) {
  const lines: string[] = [];

  if (args.event) {
    lines.push(`Event: ${args.event.name || "Untitled Event"}`);
    lines.push(`Date: ${formatEventDate(args.event)}`);
    lines.push(`Location: ${args.event.location || "TBD"}`);
    if (args.viewMode === "operations") {
      lines.push(`SP Coverage: ${Number(args.event.confirmed_assignments || 0)} / ${Number(args.event.sp_needed || 0)}`);
    }
    lines.push("");
  }

  lines.push("DAY TIMELINE");
  args.timeline.forEach((block) => {
    lines.push(`- ${block.label}: ${formatRange(block.start, block.end)}${block.detail ? ` (${block.detail})` : ""}`);
  });
  lines.push("");
  lines.push("SESSION SCHEDULE");

  args.rounds.forEach((round) => {
    lines.push(`Round ${round.round}: ${formatRange(round.start, round.end)}`);
    round.subBlocks.forEach((subBlock) => {
      lines.push(`  ${subBlock.label}: ${formatRange(subBlock.start, subBlock.end)}`);
    });
    round.roomSlots.forEach((slot) => {
      const displayRoomName = formatRoomName(slot.roomName, slot.roomType, args.roomLabel);
      lines.push(`  ${displayRoomName}: ${slot.capacityLabel}`);
      if (args.viewMode === "operations") {
        const slotIndex = round.roomSlots.findIndex((item) => item.roomName === slot.roomName);
        const spName = args.assignedSpNames?.[slotIndex] || "";
        if (spName) lines.push(`    SP: ${spName}`);
        if (args.caseName) lines.push(`    Case: ${args.caseName}`);
      }
      slot.learnerLabels.forEach((learner) => {
        lines.push(`    ${args.roomLabel}: ${displayRoomName} · Learner: ${learner}`);
      });
    });
  });

  return lines.join("\n");
}

function getStorageKey(eventId?: string) {
  return `cfsp:schedule-builder:${eventId || "global"}`;
}

function parseSavedDraft(raw: string | null): ScheduleBuilderDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ScheduleBuilderDraft>;
    return {
      ...DEFAULT_SCHEDULE_BUILDER_DRAFT,
      ...parsed,
      builderMode: parsed.builderMode === "advanced" ? "advanced" : "simple",
      scheduleViewMode: parsed.scheduleViewMode === "operations" ? "operations" : "student",
      originalUploadedLearners: Array.isArray(parsed.originalUploadedLearners)
        ? parsed.originalUploadedLearners.map((item) => asText(item)).filter(Boolean)
        : [],
      uploadedLearners: Array.isArray(parsed.uploadedLearners)
        ? parsed.uploadedLearners.map((item) => asText(item)).filter(Boolean)
        : [],
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
  const [learnerFileName, setLearnerFileName] = useState("");
  const [learnerUploadError, setLearnerUploadError] = useState("");
  const [originalUploadedLearners, setOriginalUploadedLearners] = useState<string[]>([]);
  const [uploadedLearners, setUploadedLearners] = useState<string[]>([]);
  const [builderMode, setBuilderMode] = useState<"simple" | "advanced">(DEFAULT_SCHEDULE_BUILDER_DRAFT.builderMode);
  const [scheduleViewMode, setScheduleViewMode] = useState<"student" | "operations">(DEFAULT_SCHEDULE_BUILDER_DRAFT.scheduleViewMode);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
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

  const applyDraft = useCallback((draft: ScheduleBuilderDraft) => {
    setBuilderMode(draft.builderMode);
    setScheduleViewMode(draft.scheduleViewMode);
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
    setSessionLengthMinutes(draft.sessionLengthMinutes);
    setRoundCount(draft.roundCount);
    setExamRoomCount(draft.examRoomCount);
    setFlexRoomCount(draft.flexRoomCount);
    setRoomCapacity(draft.roomCapacity);
    setMaxPairsPerFlexRoom(draft.maxPairsPerFlexRoom);
    setEncounterMinutes(draft.encounterMinutes);
    setPostEncounterBlock(draft.postEncounterBlock);
    setPostEncounterMinutes(draft.postEncounterMinutes);
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
  }, [props.fixedEventId]);

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
    () => parseTrainingEventMetadata(selectedEvent?.notes),
    [selectedEvent?.notes]
  );
  const selectedEventText = [selectedEvent?.name, selectedEvent?.location, selectedEvent?.notes]
    .map((value) => asText(value))
    .join(" ")
    .toLowerCase();
  const selectedEventModality =
    asText(selectedEventMetadata.modality).toLowerCase() === "virtual" ||
    asText(selectedEventMetadata.modality).toLowerCase() === "hybrid"
      ? asText(selectedEventMetadata.modality).toLowerCase()
      : /\b(virtual|vir|zoom|breakout)\b/.test(selectedEventText)
        ? "virtual"
        : "in_person";
  const isVirtualEvent = selectedEventModality === "virtual";
  const roomLabel = isVirtualEvent ? "Breakout Room" : "Exam Room";
  const roomCountLabel = isVirtualEvent ? "Number of breakout rooms" : "Number of exam rooms";
  const roomCapacityLabel = isVirtualEvent ? "Students per breakout room" : "Students per room";
  const postEncounterLabel = postEncounterBlock === "checklist" ? "Checklist" : postEncounterBlock === "break" ? "Break" : "Other";

  const parsedStartMinutes = toMinutes(startTime);
  const parsedRounds = parseNumber(roundCount, 4);
  const parsedExamRooms = parseNumber(examRoomCount, 4);
  const parsedRoomCapacity = Math.max(1, parseNumber(roomCapacity, 1));
  const parsedFlexRooms = parseNumber(flexRoomCount, 1);
  const parsedMaxPairs = Math.max(1, parseNumber(maxPairsPerFlexRoom, 3));
  const parsedSessionLength = parseNumber(sessionLengthMinutes, 0);
  const parsedEncounter = parseNumber(encounterMinutes, 20);
  const parsedPostEncounter = parseNumber(postEncounterMinutes, 5);
  const parsedChecklist = parseNumber(checklistMinutes, 5);
  const parsedSoap = parseNumber(soapMinutes, 10);
  const parsedFeedback = parseNumber(feedbackMinutes, 10);
  const parsedTransition = parseNumber(transitionMinutes, 0);
  const parsedStaffArrival = toMinutes(staffArrivalTime);
  const parsedSpArrival = toMinutes(spArrivalTime);
  const parsedFacultyArrival = toMinutes(facultyArrivalTime);
  const parsedRoomSetup = parseNumber(roomSetupMinutes, 0);
  const parsedStudentPrebrief = parseNumber(studentPrebriefMinutes, 0);
  const parsedSpPrebrief = parseNumber(spPrebriefMinutes, 0);
  const parsedFacultyPrebrief = parseNumber(facultyPrebriefMinutes, 0);
  const parsedDebrief = parseNumber(debriefMinutes, 0);
  const parsedBreakdown = parseNumber(breakdownMinutes, 0);
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
  const effectiveIncludeChecklist =
    builderMode === "simple" ? postEncounterBlock === "checklist" : includeChecklist;
  const effectiveChecklistMinutes =
    builderMode === "simple" && postEncounterBlock === "checklist" ? parsedPostEncounter : parsedChecklist;
  const effectiveIncludeFeedback =
    builderMode === "simple" ? parsedFeedback > 0 : includeFeedback;
  const effectiveFeedbackMinutes =
    builderMode === "simple" ? parsedFeedback : parsedFeedback;
  const effectiveTransitionMinutes =
    builderMode === "simple" && postEncounterBlock !== "checklist" ? parsedPostEncounter : parsedTransition;
  const effectiveIncludeSoap = builderMode === "simple" ? false : includeSoap;
  const effectiveSoapMinutes = builderMode === "simple" ? 0 : parsedSoap;

  const generated = useMemo(() => {
    if (parsedStartMinutes === null) {
      return {
        rounds: [] as GeneratedRound[],
        roundLength: 0,
        configuredLength: 0,
        bufferMinutes: 0,
        overrunMinutes: 0,
        rotationStart: 0,
        rotationEnd: 0,
        timeline: [] as TimelineBlock[],
      };
    }

    const { rounds, roundLength, configuredLength, bufferMinutes, overrunMinutes } = buildRounds({
      startMinutes: parsedStartMinutes,
      rounds: effectiveRoundCount,
      sessionLengthMinutes: parsedSessionLength,
      examRoomCount: parsedExamRooms,
      examRoomCapacity: parsedRoomCapacity,
      flexRoomCount: effectiveFlexRoomCount,
      maxPairsPerFlexRoom: effectiveFlexCapacity,
      encounterMinutes: parsedEncounter,
      includeChecklist: effectiveIncludeChecklist,
      checklistMinutes: effectiveChecklistMinutes,
      includeSoap: effectiveIncludeSoap,
      soapMinutes: effectiveSoapMinutes,
      includeFeedback: effectiveIncludeFeedback,
      feedbackMinutes: effectiveFeedbackMinutes,
      transitionMinutes: effectiveTransitionMinutes,
      transitionLabel: postEncounterLabel,
    });

    const rotationStart = parsedStartMinutes;
    const rotationEnd = rounds.length ? rounds[rounds.length - 1].end : rotationStart;
    const timeline: TimelineBlock[] = [];

    if (parsedRoomSetup > 0) {
      timeline.push({
        label: "Room Setup",
        start: Math.max(parsedStaffArrival ?? rotationStart, rotationStart - parsedRoomSetup),
        end: rotationStart,
        detail: `${parsedRoomSetup} minutes`,
        tone: "setup",
      });
    }

    if (parsedStaffArrival !== null && parsedStaffArrival < rotationStart) {
      timeline.push({
        label: "Staff Arrival",
        start: parsedStaffArrival,
        end: rotationStart,
        detail: "Staff on site before session start",
        tone: "setup",
      });
    }

    if (parsedSpArrival !== null && parsedSpArrival < rotationStart) {
      timeline.push({
        label: "SP Arrival",
        start: parsedSpArrival,
        end: rotationStart,
        detail: "SP check-in window",
        tone: "setup",
      });
    }

    if (parsedFacultyArrival !== null && parsedFacultyArrival < rotationStart) {
      timeline.push({
        label: "Faculty Arrival",
        start: parsedFacultyArrival,
        end: rotationStart,
        detail: "Faculty prep window",
        tone: "setup",
      });
    }

    if (parsedStudentPrebrief > 0) {
      timeline.push({
        label: "Student Prebrief",
        start: rotationStart - parsedStudentPrebrief,
        end: rotationStart,
        detail: `${parsedStudentPrebrief} minutes`,
        tone: "prebrief",
      });
    }

    if (parsedSpPrebrief > 0) {
      timeline.push({
        label: "SP Prebrief",
        start: rotationStart - parsedSpPrebrief,
        end: rotationStart,
        detail: `${parsedSpPrebrief} minutes`,
        tone: "prebrief",
      });
    }

    if (parsedFacultyPrebrief > 0) {
      timeline.push({
        label: "Faculty Prebrief",
        start: rotationStart - parsedFacultyPrebrief,
        end: rotationStart,
        detail: `${parsedFacultyPrebrief} minutes`,
        tone: "prebrief",
      });
    }

    if (rounds.length) {
      timeline.push({
        label: "Session Blocks",
        start: rotationStart,
        end: rotationEnd,
        detail: `${effectiveRoundCount} round${effectiveRoundCount === 1 ? "" : "s"} · ${roundLength} minutes each`,
        tone: "rotation",
      });
    }

    if (includeDebrief && parsedDebrief > 0) {
      timeline.push({
        label: "Debrief",
        start: rotationEnd,
        end: rotationEnd + parsedDebrief,
        detail: `${parsedDebrief} minutes`,
        tone: "wrap",
      });
    }

    const breakdownStart = includeDebrief && parsedDebrief > 0 ? rotationEnd + parsedDebrief : rotationEnd;
    if (includeBreakdown && parsedBreakdown > 0) {
      timeline.push({
        label: "Breakdown",
        start: breakdownStart,
        end: breakdownStart + parsedBreakdown,
        detail: `${parsedBreakdown} minutes`,
        tone: "wrap",
      });
    }

    timeline.sort((a, b) => a.start - b.start || a.end - b.end);

    return {
      rounds,
      roundLength,
      configuredLength,
      bufferMinutes,
      overrunMinutes,
      rotationStart,
      rotationEnd,
      timeline,
    };
  }, [
    effectiveChecklistMinutes,
    effectiveFeedbackMinutes,
    effectiveIncludeChecklist,
    effectiveIncludeFeedback,
    effectiveIncludeSoap,
    effectiveRoundCount,
    effectiveSoapMinutes,
    effectiveTransitionMinutes,
    includeBreakdown,
    includeDebrief,
    parsedBreakdown,
    parsedDebrief,
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
    postEncounterLabel,
  ]);

  const learnerRoster = useMemo(
    () => buildLearnerRoster(uploadedLearners, Math.max(slotsPerRound, 1), generated.rounds.length),
    [generated.rounds.length, slotsPerRound, uploadedLearners]
  );

  const scheduledRounds = useMemo(
    () => attachLearners(generated.rounds, learnerRoster),
    [generated.rounds, learnerRoster]
  );
  const totalScheduleCapacity = Math.max(slotsPerRound, 0) * generated.rounds.length;
  const unplacedLearnerCount =
    uploadedLearners.length > 0 ? Math.max(uploadedLearners.length - totalScheduleCapacity, 0) : 0;

  const assignedNames = selectedEvent ? getAssignedNames(selectedEvent) : [];
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
      (scheduledRounds[0]?.roomSlots || []).map((slot) => ({
        roomName: slot.roomName,
        displayRoomName: formatRoomName(slot.roomName, slot.roomType, roomLabel),
        roomType: slot.roomType,
        capacityLabel: slot.capacityLabel,
      })),
    [roomLabel, scheduledRounds]
  );
  const learnerCapacitySummary =
    uploadedLearners.length && slotsPerRound > 0
      ? `${uploadedLearners.length} learners • ${totalRoomCount} rooms • ${effectiveRoundCount} rounds required`
      : uploadedLearners.length && slotsPerRound <= 0
        ? `${uploadedLearners.length} learners uploaded • configure rooms to calculate rounds`
        : "";

  const previewText = useMemo(
    () =>
      buildPlaintextPreview({
        event: selectedEvent,
        timeline: generated.timeline,
        rounds: scheduledRounds,
        roomLabel,
        caseName: selectedEventMetadata.case_name,
        assignedSpNames: selectedEvent?.assigned_sp_names || [],
        viewMode: scheduleViewMode,
      }),
    [generated.timeline, roomLabel, scheduleViewMode, scheduledRounds, selectedEvent, selectedEventMetadata.case_name]
  );
  const saveStateAppearance = getSaveStateAppearance(saveState);
  const lastSavedLabel = formatSavedTimestamp(lastSavedAt);
  const advancedSettingsActive =
    parsedRoomSetup > 0 ||
    parsedStudentPrebrief > 0 ||
    parsedSpPrebrief > 0 ||
    parsedFacultyPrebrief > 0 ||
    parsedDebrief > 0 ||
    parsedBreakdown > 0 ||
    parsedTransition > 0 ||
    parsedSessionLength > 0 ||
    effectiveSoapMinutes > 0 ||
    Boolean(parsedStaffArrival !== null || parsedSpArrival !== null || parsedFacultyArrival !== null) ||
    manualRoundOverride ||
    includeSoap ||
    includeDebrief ||
    includeBreakdown;
  const currentTimeSourceLabel = startTime === timeSource.startTime ? timeSource.label : "Edited in builder";
  const referenceEndTimeLabel = timeSource.endTime ? toDisplayTime(toMinutes(timeSource.endTime) || 0) : "";

  function handleStartTimeChange(value: string) {
    setStartTime(value);
    if (value !== timeSource.startTime) {
      setTimeSource((current) => ({ ...current, source: "edited" }));
    }
  }

  async function handleCopyPreview() {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopyMessage("Schedule preview copied.");
      window.setTimeout(() => setCopyMessage(""), 2400);
    } catch (error) {
      setCopyMessage(error instanceof Error ? error.message : "Could not copy schedule preview.");
      window.setTimeout(() => setCopyMessage(""), 2400);
    }
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
    setCopyMessage("Student order randomized.");
    window.setTimeout(() => setCopyMessage(""), 2600);
  }

  function handleResetLearnerOrder() {
    if (!originalUploadedLearners.length) return;
    setUploadedLearners(originalUploadedLearners);
    setCopyMessage("Student order reset to uploaded order.");
    window.setTimeout(() => setCopyMessage(""), 2600);
  }

  return (
    <div className="grid gap-5">
      {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

      <section className="rounded-[14px] border border-[#dce6ee] bg-[linear-gradient(180deg,#f8fbfd_0%,#eef5fb_100%)] px-5 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="cfsp-kicker">Connected builder</p>
            <h2 className="mt-3 text-[1.7rem] leading-tight font-black text-[#14304f]">Build session schedule</h2>
            <p className="mt-3 max-w-3xl text-[0.98rem] leading-6 text-[#5e7388]">
              Build a full-day session schedule preview with arrivals, time blocks, rooms, and learner flow while keeping the event record untouched. Builder changes auto-save locally in this browser for the current event.
            </p>
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
                Simple
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
                Advanced
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
                ? "Simple mode shows the core scheduling inputs only."
                : "Advanced mode adds arrival, prebrief, wrap-up, and timing overrides."}
            </div>
            {uploadedLearners.length > 0 && slotsPerRound > 0 ? (
              <div className="mt-3 text-sm font-semibold text-[#165a96]">
                Auto-calculated from learner count and room capacity: {uploadedLearners.length} learners,{" "}
                {totalRoomCount} rooms, {slotsPerRound} seats per round, {autoCalculatedRounds} rounds required.
              </div>
            ) : null}
          </div>
          {props.backHref ? (
            <Link href={props.backHref} className="cfsp-btn cfsp-btn-secondary">
              {props.backLabel || "Back"}
            </Link>
          ) : null}
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assignedNames.length ? (
                      assignedNames.map((name) => (
                        <span key={name} className="cfsp-chip">
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm font-semibold text-[#6a7e91]">No assigned SPs yet</span>
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
                  Use the Student Name column for learner names. Group and Notes are optional.
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
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Schedule Summary</h3>
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
                    {generated.rounds.length ? toDisplayTime(rotationEnd) : "Not generated yet"}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-[#5e7388]">
                    {referenceEndTimeLabel ? `Reference event end: ${referenceEndTimeLabel}` : "Calculated from the builder settings"}
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
              {parsedSessionLength > 0 && generated.bufferMinutes > 0 ? (
                <div className="cfsp-alert cfsp-alert-info mt-4">
                  Each round includes {generated.bufferMinutes} minutes of open buffer so the generated timeline matches the {parsedSessionLength}-minute session target.
                </div>
              ) : null}
              {parsedSessionLength > 0 && generated.overrunMinutes > 0 ? (
                <div className="cfsp-alert cfsp-alert-error mt-4">
                  The configured round blocks exceed the target session length by {generated.overrunMinutes} minutes, so the preview expands each round to fit the real timing.
                </div>
              ) : null}
            </section>

            <section className="cfsp-panel px-4 py-4">
              <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Simple Builder</h3>
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
                      {generated.rounds.length ? toDisplayTime(rotationEnd) : "Not generated yet"}
                    </div>
                    <span className="text-xs font-semibold text-[#5e7388]">
                      {referenceEndTimeLabel ? `Reference event end: ${referenceEndTimeLabel}` : "Calculated from rounds and block settings"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <NumberInput label={roomCountLabel} value={examRoomCount} onChange={setExamRoomCount} />
                <NumberInput label={roomCapacityLabel} value={roomCapacity} onChange={setRoomCapacity} />
                {!isVirtualEvent ? (
                  <>
                    <NumberInput label="Number of flex rooms" value={flexRoomCount} onChange={setFlexRoomCount} />
                    <NumberInput label="Flex capacity" value={maxPairsPerFlexRoom} onChange={setMaxPairsPerFlexRoom} />
                  </>
                ) : null}
                <NumberInput label="Encounter minutes" value={encounterMinutes} onChange={setEncounterMinutes} />
                <NumberInput label="Feedback minutes" value={feedbackMinutes} onChange={setFeedbackMinutes} />
                <SelectInput
                  label="Post-encounter block"
                  value={postEncounterBlock}
                  options={[
                    { value: "checklist", label: "Checklist" },
                    { value: "break", label: "Break" },
                    { value: "other", label: "Other" },
                  ]}
                  onChange={(value) => setPostEncounterBlock(value as "checklist" | "break" | "other")}
                />
                <NumberInput label="Post-encounter minutes" value={postEncounterMinutes} onChange={setPostEncounterMinutes} />
              </div>
            </section>
          </div>

          {builderMode === "advanced" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              <section className="cfsp-panel px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Advanced Options</h3>
                    <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                      These timing details are optional. They only affect the schedule when enabled or set to a nonzero value.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleRandomizeLearners} className="cfsp-btn cfsp-btn-secondary">
                      Randomize Student Order
                    </button>
                    {originalUploadedLearners.length ? (
                      <button type="button" onClick={handleResetLearnerOrder} className="cfsp-btn cfsp-btn-secondary">
                        Reset to Uploaded Order
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
                  <NumberInput label="Session length override" value={sessionLengthMinutes} onChange={setSessionLengthMinutes} />
                  <ToggleInput label="Manual rounds override" checked={manualRoundOverride} onChange={setManualRoundOverride} />
                  <NumberInput label="Manual round count" value={roundCount} onChange={setRoundCount} disabled={!manualRoundOverride} />
                  <NumberInput label="Transition minutes" value={transitionMinutes} onChange={setTransitionMinutes} />
                  <ToggleInput label="Include SOAP note" checked={includeSoap} onChange={setIncludeSoap} />
                  <NumberInput label="SOAP note minutes" value={soapMinutes} onChange={setSoapMinutes} disabled={!includeSoap} />
                  <ToggleInput label="Include checklist" checked={includeChecklist} onChange={setIncludeChecklist} />
                  <NumberInput label="Checklist minutes" value={checklistMinutes} onChange={setChecklistMinutes} disabled={!includeChecklist} />
                  <ToggleInput label="Include feedback" checked={includeFeedback} onChange={setIncludeFeedback} />
                  <NumberInput label="Feedback minutes" value={feedbackMinutes} onChange={setFeedbackMinutes} disabled={!includeFeedback} />
                  <ToggleInput label="Include debrief" checked={includeDebrief} onChange={setIncludeDebrief} />
                  <NumberInput label="Post-event debrief minutes" value={debriefMinutes} onChange={setDebriefMinutes} disabled={!includeDebrief} />
                  <ToggleInput label="Include breakdown" checked={includeBreakdown} onChange={setIncludeBreakdown} />
                  <NumberInput label="Room reset / breakdown minutes" value={breakdownMinutes} onChange={setBreakdownMinutes} disabled={!includeBreakdown} />
                </div>
              </section>

              <section className="cfsp-panel px-4 py-4">
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Advanced Status</h3>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                    <div className="cfsp-label">Advanced settings</div>
                    <div className="mt-2 text-base font-black text-[#14304f]">
                      {advancedSettingsActive ? "Active" : "Inactive"}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-[#5e7388]">
                      Set arrival, prebrief, transition, debrief, or breakdown values only when you want them included in the timeline.
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : null}

          <section className="cfsp-panel px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Full day timeline</h3>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Review the operational day from arrival through breakdown before moving into the session grid.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleCopyPreview} className="cfsp-btn cfsp-btn-secondary">
                  Copy Full Schedule Preview
                </button>
                <button type="button" onClick={() => window.print()} className="cfsp-btn cfsp-btn-secondary">
                  Print Preview
                </button>
              </div>
            </div>

            {copyMessage ? <div className="mt-4 text-sm font-semibold text-[#196b57]">{copyMessage}</div> : null}

            {parsedStartMinutes === null ? (
              <div className="cfsp-alert cfsp-alert-error mt-5">Enter a valid start time to generate the full-day preview.</div>
            ) : (
              <div className="mt-5 grid gap-3">
                {generated.timeline.map((block) => {
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
            )}
          </section>

          <section className="cfsp-panel px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="m-0 text-[1.2rem] font-black text-[#14304f]">Session schedule grid</h3>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Rows track rounds and time blocks while columns track rooms in a spreadsheet-style layout. Without an upload, fallback learner names are generated automatically.
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
                  Student View
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
                  Operations View
                </button>
              </div>
            </div>

            {parsedStartMinutes === null ? (
              <div className="cfsp-alert cfsp-alert-error mt-5">Enter a valid start time to generate the session schedule grid.</div>
            ) : !scheduledRounds.length ? (
              <div className="cfsp-alert cfsp-alert-info mt-5">Add enough rooms and schedule timing to generate the session schedule grid.</div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-[16px] border border-[#dce6ee] bg-[#f8fbfd]">
                <div className="border-b border-[#dce6ee] px-4 py-3 text-sm font-semibold text-[#5e7388]">
                  {scheduleViewMode === "student"
                    ? "Student View excludes internal SP and case details."
                    : "Operations View includes assigned SP and case details when available."}
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
                    {scheduledRounds.map((round) => (
                      <tr key={round.round} className="border-b border-[#eef3f7] align-top text-sm text-[#14304f]">
                        <td className="px-3 py-4 font-black">Round {round.round}</td>
                        <td className="px-3 py-4">
                          <div className="font-bold">{formatRange(round.start, round.end)}</div>
                          <div className="mt-2 grid gap-1 text-xs font-semibold text-[#5e7388]">
                            {round.subBlocks.map((subBlock) => (
                              <div key={`${round.round}-${subBlock.label}`}>
                                {subBlock.label}: {formatRange(subBlock.start, subBlock.end)}
                              </div>
                            ))}
                          </div>
                        </td>
                        {round.roomSlots.map((slot) => (
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
                                {formatRoomName(slot.roomName, slot.roomType, roomLabel)} · {slot.capacityLabel}
                              </div>
                              {scheduleViewMode === "operations" ? (
                                <div style={{ marginTop: "6px", fontSize: "12px", fontWeight: 700, color: "#4f677d", lineHeight: 1.5 }}>
                                  <div>SP: {selectedEvent?.assigned_sp_names?.[round.roomSlots.findIndex((item) => item.roomName === slot.roomName)] || "Unassigned"}</div>
                                  {selectedEventMetadata.case_name ? <div>Case: {selectedEventMetadata.case_name}</div> : null}
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
                    ))}
                  </tbody>
                </table>
              </div>
              </div>
            )}
          </section>
        </>
      )}

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
