"use client";

import Link from "next/link";
import { useMemo, useState, useEffect} from "react";
import { useRouter } from "next/navigation";
import SiteShell from "./SiteShell";
import { ActionFeedback, useActionFeedback } from "./SaveActionFeedback";
import { normalizeEventType, type CanonicalEventType } from "../lib/canonicalEventType";
import { normalizeLooseDateToIso } from "../lib/eventDateUtils";
import { sanitizePublicErrorMessage } from "../lib/safeErrorMessage";
import { parseTrainingEventMetadata } from "../lib/trainingEventNotes";

import NewEventSchedulePreview from "@/app/components/NewEventSchedulePreview";

type EventType = "simulation" | "didactic" | "sp" | "skills" | "training" | "virtual" | "hifi";
type WizardStep = 0 | 1 | 2 | 3;
type TrainingRequirement = "yes" | "no" | "tbd";
type TrainingOwnership = "faculty_led" | "internal_sim" | "shared" | "tbd";

type GeneratedSession = {
  session_date: string;
  start_time: string;
  end_time: string;
  room: string | null;
  location: string | null;
};

type RotationRound = {
  roundNumber: number;
  session_date: string;
  start_time: string;
  end_time: string;
  roomCount: number;
  learnerStart: number | null;
  learnerEnd: number | null;
};

export type EventSetupEvent = {
  id?: string;
  name?: string | null;
  status?: string | null;
  date_text?: string | null;
  sp_needed?: number | null;
  visibility?: string | null;
  location?: string | null;
  notes?: string | null;
};

export type EventSetupSession = {
  session_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  room?: string | null;
  location?: string | null;
};

type EventSetupFormProps = {
  mode?: "create" | "edit";
  initialEvent?: EventSetupEvent | null;
  initialSessions?: EventSetupSession[];
};

const EVENT_TYPE_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: "simulation", label: "Simulation" },
  { value: "didactic", label: "Didactic" },
  { value: "sp", label: "SP Event" },
  { value: "skills", label: "Skills" },
  { value: "training", label: "Training" },
  { value: "virtual", label: "Virtual / VIR" },
  { value: "hifi", label: "Hi-Fi" },
];

const STEP_TITLES = ["Event Info", "Schedule Builder", "Staffing Needs", "Review & Create"] as const;
const MINUTES_PER_DAY = 24 * 60;

const TRAINING_REQUIREMENT_OPTIONS: Array<{ value: TrainingRequirement; label: string }> = [
  { value: "tbd", label: "TBD" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const TRAINING_OWNERSHIP_OPTIONS: Array<{ value: TrainingOwnership; label: string; detail: string }> = [
  { value: "faculty_led", label: "Faculty-led training", detail: "Faculty owns SP prep content and timing." },
  { value: "internal_sim", label: "Internal sim team training", detail: "Sim Ops owns SP prep and logistics." },
  { value: "shared", label: "Shared/co-led training", detail: "Faculty and Sim Ops coordinate together." },
  { value: "tbd", label: "TBD", detail: "Ownership still needs confirmation." },
];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNumber(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function toMinutes(value: string) {
  const raw = asText(value);
  if (!raw) return null;
  const [hours, minutes] = raw.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function toTimeString(totalMinutes: number) {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

function toDisplayTime(totalMinutes: number) {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;
  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function normalizeEndMinutes(startMinutes: number, endMinutes: number) {
  return endMinutes < startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes;
}

function displayStoredTime(value: string) {
  return toDisplayTime(toMinutes(value) || 0);
}

function getTrainingRequirementLabel(value: TrainingRequirement) {
  return TRAINING_REQUIREMENT_OPTIONS.find((option) => option.value === value)?.label || "TBD";
}

function getTrainingOwnershipLabel(value: TrainingOwnership) {
  return TRAINING_OWNERSHIP_OPTIONS.find((option) => option.value === value)?.label || "TBD";
}

function boolText(value: boolean) {
  return value ? "yes" : "no";
}

function normalizeBackupRequirementValue(value: unknown) {
  const normalized = asText(value).toLowerCase();
  if (!normalized) return "";
  if (/\b(no|false|0|none|not needed|not required)\b/.test(normalized)) return "no";
  if (/\b(yes|true|1|required|needed)\b/.test(normalized) || /\d+/.test(normalized)) return "yes";
  return "";
}

function getCanonicalEventType(eventType: EventType): CanonicalEventType {
  return eventType === "didactic" || eventType === "training" ? "didactic" : "simulation";
}

function eventTypeNeedsSpStaffing(eventType: EventType) {
  return !["didactic", "skills", "training"].includes(eventType);
}

function parseDateList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => normalizeLooseDateToIso(part) || part)
    )
  );
}

function parseRoomNames(roomNames: string, roomCount: number) {
  const parsed = roomNames
    .split(/\r?\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parsed.length) {
    return Array.from({ length: Math.max(roomCount, 1) }, (_, index) => `Exam Room ${index + 1}`);
  }

  const next = [...parsed];
  while (next.length < roomCount) {
    next.push(`Exam Room ${next.length + 1}`);
  }
  return next.slice(0, Math.max(roomCount, 1));
}

function countRoundsThatFit(args: {
  dates: string[];
  startTime: string;
  endTime: string;
  sessionLengthMinutes: number;
  feedbackLengthMinutes: number;
}) {
  const startMinutes = toMinutes(args.startTime);
  const parsedEndMinutes = toMinutes(args.endTime);
  if (startMinutes === null || parsedEndMinutes === null) return 0;
  const endMinutes = normalizeEndMinutes(startMinutes, parsedEndMinutes);
  if (endMinutes <= startMinutes) return 0;
  if (args.sessionLengthMinutes <= 0) return 0;

  let total = 0;

  args.dates.forEach(() => {
    let currentStart = startMinutes;
    while (currentStart + args.sessionLengthMinutes <= endMinutes) {
      total += 1;
      currentStart = currentStart + args.sessionLengthMinutes + args.feedbackLengthMinutes;
    }
  });

  return total;
}

function buildRotationRounds(args: {
  dates: string[];
  startTime: string;
  endTime: string;
  sessionLengthMinutes: number;
  feedbackLengthMinutes: number;
  roomCount: number;
  studentCount: number;
}) {
  const startMinutes = toMinutes(args.startTime);
  const parsedEndMinutes = toMinutes(args.endTime);
  if (startMinutes === null || parsedEndMinutes === null) return [];
  const endMinutes = normalizeEndMinutes(startMinutes, parsedEndMinutes);
  if (endMinutes <= startMinutes) return [];
  if (args.sessionLengthMinutes <= 0) return [];
  if (args.roomCount <= 0) return [];

  const roundsNeeded = args.studentCount > 0 ? Math.ceil(args.studentCount / args.roomCount) : 0;
  const rounds: RotationRound[] = [];

  args.dates.forEach((date) => {
    let currentStart = startMinutes;

    while (currentStart + args.sessionLengthMinutes <= endMinutes) {
      if (roundsNeeded > 0 && rounds.length >= roundsNeeded) break;

      const currentEnd = currentStart + args.sessionLengthMinutes;
      const roundNumber = rounds.length + 1;
      const learnerStart = args.studentCount > 0 ? (roundNumber - 1) * args.roomCount + 1 : null;
      const learnerEnd =
        args.studentCount > 0 && learnerStart !== null
          ? Math.min(roundNumber * args.roomCount, args.studentCount)
          : null;

      rounds.push({
        roundNumber,
        session_date: date,
        start_time: toTimeString(currentStart),
        end_time: toTimeString(currentEnd),
        roomCount: args.roomCount,
        learnerStart,
        learnerEnd,
      });

      currentStart = currentEnd + args.feedbackLengthMinutes;
    }
  });

  return rounds;
}

function buildGeneratedSessions(args: {
  rounds: RotationRound[];
  roomNames: string[];
  location: string;
}) {
  const sessions: GeneratedSession[] = [];

  args.rounds.forEach((round) => {
    args.roomNames.forEach((room) => {
      sessions.push({
        session_date: round.session_date,
        start_time: round.start_time,
        end_time: round.end_time,
        room,
        location: asText(args.location) || null,
      });
    });
  });

  return sessions;
}

function formatRoundPreview(round: RotationRound) {
  const learnerLabel =
    round.learnerStart && round.learnerEnd
      ? ` · Learners ${round.learnerStart}-${round.learnerEnd}`
      : "";

  return `Round ${round.roundNumber} · ${round.session_date} · ${displayStoredTime(round.start_time)} - ${displayStoredTime(round.end_time)} · ${round.roomCount} room${round.roomCount === 1 ? "" : "s"}${learnerLabel}`;
}

function buildNotes(args: {
  eventType: EventType;
  canonicalEventType: CanonicalEventType;
  modality: string;
  zoomUrl: string;
  eventLeadTeam: string;
  simStaff: string;
  courseFaculty: string;
  trainingRequirement: TrainingRequirement;
  trainingOwnership: TrainingOwnership;
  preferredTrainingDate: string;
  preferredTrainingTime: string;
  preferredTrainingEndTime: string;
  facultyAvailabilityUnknown: boolean;
  trainingZoomRequired: boolean;
  trainingRecordingPlanned: boolean;
  avSupportRequired: boolean;
  simTechRequired: boolean;
  eventRecordingRequired: boolean;
  materialsReady: boolean;
  requestFacultyAvailability: boolean;
  trainingNotes: string;
  studentCount: string;
  notes: string;
  sessionLength: string;
  feedbackLength: string;
  prebriefingRequired: string;
  prebriefingMinutes: string;
  prebriefingLocation: string;
  roomNames: string[];
  roomCount: number;
  rotationsNeeded: number;
  backupSpsRequired: string;
  backupSpCount: string;

  generatedRotationRounds: number;
  generatedRoomSlots: number;
}) {
  const normalizedBackupRequired = normalizeBackupRequirementValue(args.backupSpsRequired);
  const backupTarget = normalizedBackupRequired === "yes" ? parseNumber(args.backupSpCount) : 0;
  const trainingMetadataLines = [
    "[CFSP_TRAINING_METADATA]",
    `canonical_event_type: ${args.canonicalEventType}`,
    `training_required: ${args.trainingRequirement}`,
    args.trainingRequirement === "yes" ? `training_ownership: ${args.trainingOwnership}` : "",
    args.trainingRequirement === "yes" ? `training_scheduling_status: ${args.preferredTrainingDate || args.preferredTrainingTime || args.preferredTrainingEndTime ? "planned" : "not_scheduled"}` : "",
    args.preferredTrainingDate ? `preferred_training_date: ${args.preferredTrainingDate}` : "",
    args.preferredTrainingTime ? `preferred_training_time: ${args.preferredTrainingTime}` : "",
    args.preferredTrainingEndTime ? `preferred_training_end_time: ${args.preferredTrainingEndTime}` : "",
    args.trainingRequirement === "yes" ? `faculty_availability_unknown: ${boolText(args.facultyAvailabilityUnknown)}` : "",
    args.trainingRequirement === "yes" ? `training_zoom_required: ${boolText(args.trainingZoomRequired)}` : "",
    args.zoomUrl ? `zoom_url: ${args.zoomUrl}` : "",
    args.zoomUrl ? `training_zoom_link: ${args.zoomUrl}` : "",
    args.modality ? `modality: ${args.modality}` : "",
    args.trainingRequirement === "yes" ? `training_recording_planned: ${boolText(args.trainingRecordingPlanned)}` : "",
    `av_support_required: ${boolText(args.avSupportRequired)}`,
    `sim_tech_required: ${boolText(args.simTechRequired)}`,
    `event_recording_required: ${boolText(args.eventRecordingRequired)}`,
    `event_material_status: ${args.materialsReady ? "materials_uploaded" : "materials_pending"}`,
    args.requestFacultyAvailability ? "faculty_training_coordination_requested: yes" : "",
    args.requestFacultyAvailability ? "faculty_training_coordination_status: requested" : "",
    args.courseFaculty ? `faculty_names: ${args.courseFaculty}` : "",
    (args.eventLeadTeam || args.simStaff)
      ? `sim_contact: ${args.eventLeadTeam || args.simStaff}`
      : "",
    args.trainingNotes ? `training_notes: ${args.trainingNotes}` : "",
    normalizedBackupRequired ? `backups_required: ${normalizedBackupRequired}` : "",
    normalizedBackupRequired ? `backup_count: ${backupTarget}` : "",
    "[/CFSP_TRAINING_METADATA]",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    `Event Type: ${EVENT_TYPE_OPTIONS.find((option) => option.value === args.eventType)?.label || "SP Event"}`,
    args.modality ? `Modality: ${args.modality}` : "",
    args.zoomUrl ? `Zoom Link: ${args.zoomUrl}` : "",
    args.eventLeadTeam ? `Event Lead/Sim Lead: ${args.eventLeadTeam}` : "",
    args.simStaff ? `Sim Staff: ${args.simStaff}` : "",
    args.courseFaculty ? `Course Faculty: ${args.courseFaculty}` : "",
    `SP Training Required: ${getTrainingRequirementLabel(args.trainingRequirement)}`,
    args.trainingRequirement === "yes" ? `SP Training Ownership: ${getTrainingOwnershipLabel(args.trainingOwnership)}` : "",
    args.preferredTrainingDate ? `Preferred Training Date: ${args.preferredTrainingDate}` : "",
    args.preferredTrainingTime ? `Preferred Training Time: ${args.preferredTrainingTime}` : "",
    args.preferredTrainingEndTime ? `Preferred Training End Time: ${args.preferredTrainingEndTime}` : "",
    args.trainingRequirement === "yes" && args.facultyAvailabilityUnknown ? "Faculty Availability: Unknown" : "",
    args.trainingRequirement === "yes" && args.trainingZoomRequired ? "Training Zoom Required: Yes" : "",
    args.trainingRequirement === "yes" && args.trainingRecordingPlanned ? "Training Recording Planned: Yes" : "",
    args.avSupportRequired ? "AV Support Required: Yes" : "",
    args.simTechRequired ? "Sim Tech Required: Yes" : "",
    args.eventRecordingRequired ? "Event Recording Required: Yes" : "",
    args.materialsReady ? "Materials Readiness: materials_ready" : "",
    args.requestFacultyAvailability ? "Faculty Training Coordination: Request faculty availability" : "",
    args.trainingNotes ? `Training Notes: ${args.trainingNotes}` : "",
    `Student Count: ${args.studentCount || "Uncapped preview"}`,
    `Rotation Rounds Needed: ${args.studentCount ? String(args.rotationsNeeded) : "Uncapped preview"}`,
    `Generated Rotation Rounds: ${args.generatedRotationRounds}`,
    `Room Slots Generated: ${args.generatedRoomSlots}`,
    args.sessionLength ? `Session Length: ${args.sessionLength} minutes` : "",
    args.feedbackLength ? `Feedback / Break Length: ${args.feedbackLength} minutes` : "",
    `Pre-briefing Required: ${args.prebriefingRequired === "yes" ? "Yes" : "No"}`,
    args.prebriefingRequired === "yes" ? `Pre-briefing Length: ${args.prebriefingMinutes || "15"} minutes` : "",
    args.prebriefingRequired === "yes" && args.prebriefingLocation ? `Pre-briefing Location: ${args.prebriefingLocation}` : "",
    normalizedBackupRequired ? `Backups Required: ${normalizedBackupRequired === "yes" ? "Yes" : "No"}` : "",
    normalizedBackupRequired === "yes" ? `Backup SP Count: ${backupTarget || args.backupSpCount || "Not set"}` : "",
    `Rooms: ${args.roomCount}`,
    args.roomNames.length ? `Rooms: ${args.roomNames.join(", ")}` : "",
    args.notes,
    trainingMetadataLines,
  ]
    .map((line) => asText(line))
    .filter(Boolean);

  return lines.join("\n");
}

function sortRoomNamesNaturally(roomNames: string[]) {
  return [...roomNames].sort((a, b) => {
    const aMatch = a.match(/^(.*?)(\d+)\s*$/);
    const bMatch = b.match(/^(.*?)(\d+)\s*$/);

    if (aMatch && bMatch && aMatch[1].trim().toLowerCase() === bMatch[1].trim().toLowerCase()) {
      return Number(aMatch[2]) - Number(bMatch[2]);
    }

    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  });
}

function parseClockTimeToMinutes(value: string) {
  const trimmed = asText(value);
  if (!trimmed) return null;

  const native = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (native) {
    const hours = Number(native[1]);
    const minutes = Number(native[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return hours * 60 + minutes;
  }

  const friendly = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!friendly) return null;

  let hours = Number(friendly[1]);
  const minutes = Number(friendly[2] || "0");
  const meridiem = friendly[3].toUpperCase();

  if (hours === 12) hours = 0;
  if (meridiem === "PM") hours += 12;

  if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) return hours * 60 + minutes;
  return null;
}


function formatDateListForDisplay(value: string) {
  return asText(value)
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const iso = item.match(/^(\d{4})-(\d{2})-(\d{2})$/);

      if (iso) {
        return `${iso[2]}/${iso[3]}/${iso[1].slice(2)}`;
      }

      return item;
    })
    .join("\n");
}


function formatClockLabel(value: number) {
  const normalized = ((value % 1440) + 1440) % 1440;
  let hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const meridiem = hours >= 12 ? "PM" : "AM";

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

function formatClockMinutesForInput(value: number) {
  const normalized = ((value % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}


function getRecommendedStatus(eventType: EventType, spNeeded: number) {
  if (!eventTypeNeedsSpStaffing(eventType) || spNeeded <= 0) return "Scheduled";
  return "Needs SPs";
}

function getFirstNoteValue(notes: string | null | undefined, labels: string[]) {
  const text = asText(notes);
  if (!text) return "";
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*([^\\n]+)`, "i"));
    if (match?.[1]) return asText(match[1]);
  }
  return "";
}

function toInputTime(value: string | null | undefined, fallback: string) {
  const text = asText(value);
  if (!text) return fallback;
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function inferEventType(event: EventSetupEvent | null | undefined): EventType {
  const notes = asText(event?.notes);
  const metadata = parseTrainingEventMetadata(notes);
  const canonicalEventType = normalizeEventType(metadata.canonical_event_type);
  const explicitType = getFirstNoteValue(notes, ["Event Type"]).toLowerCase();
  const source = [event?.name, event?.status, event?.location, notes, metadata.modality].map(asText).join(" ").toLowerCase();
  if (canonicalEventType === "didactic" || /\b(didactic|lecture|classroom|seminar)\b/.test(explicitType) || /\b(didactic|lecture|classroom|seminar)\b/.test(source)) {
    return "didactic";
  }
  if (/\b(simulation|sim event)\b/.test(explicitType)) return "simulation";
  if (/\b(skills|ipe|workshop)\b/.test(explicitType) || /\b(skills|ipe|workshop)\b/.test(source)) return "skills";
  if (/\b(training|orientation|onboarding|prep)\b/.test(explicitType)) return "training";
  if (/\b(virtual|vir|telehealth|online|zoom|remote)\b/.test(explicitType) || /\b(virtual|vir|telehealth|online|zoom|remote)\b/.test(source)) return "virtual";
  if (/\b(hi-fi|hifi|high fidelity)\b/.test(explicitType) || /\b(hi-fi|hifi|high fidelity)\b/.test(source)) return "hifi";
  return "sp";
}

function getUniqueSessionDates(event: EventSetupEvent | null | undefined, sessions: EventSetupSession[]) {
  const dates = Array.from(
    new Set(
      sessions
        .map((session) => asText(session.session_date))
        .filter(Boolean)
    )
  );
  if (dates.length) return dates.join("\n");
  return asText(event?.date_text)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
}

function getUniqueRoomNames(sessions: EventSetupSession[]) {
  return Array.from(new Set(sessions.map((session) => asText(session.room)).filter(Boolean))).join("\n");
}

function getInitialNumberFromNotes(notes: string | null | undefined, labels: string[], fallback = "") {
  const value = getFirstNoteValue(notes, labels);
  const match = value.match(/\d+/);
  return match?.[0] || fallback;
}

export default function EventSetupForm({ mode = "create", initialEvent = null, initialSessions = [] }: EventSetupFormProps) {
  const router = useRouter();
  const isEditMode = mode === "edit";
  const initialTrainingMetadata = parseTrainingEventMetadata(initialEvent?.notes);
  const firstSession = initialSessions[0] || null;
  const initialBackupCount =
    asText(initialTrainingMetadata.backup_count) ||
    getInitialNumberFromNotes(initialEvent?.notes, ["Backup SP Count", "Backup Count", "Backups Required", "Backups Needed"]);
  const initialBackupRequired =
    normalizeBackupRequirementValue(
      initialTrainingMetadata.backups_required ||
      getFirstNoteValue(initialEvent?.notes, ["Backups Required", "Backup Required", "Backups?", "Backups Needed"])
    ) || (parseNumber(initialBackupCount) > 0 ? "yes" : "");
  const [step, setStep] = useState<WizardStep>(0);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const { status: createEventFeedback, begin, done, fail } = useActionFeedback({
    autoHideMs: 1200,
    autoHideErrorMs: 3200,
  });

  const [name, setName] = useState(() => asText(initialEvent?.name));
  const [eventType, setEventType] = useState<EventType>(() => inferEventType(initialEvent));
  const [modality, setModality] = useState(() => asText(initialTrainingMetadata.modality) || (inferEventType(initialEvent) === "virtual" ? "virtual" : "in_person"));
  const [zoomUrl, setZoomUrl] = useState(() => asText(initialTrainingMetadata.zoom_url || initialTrainingMetadata.training_zoom_link));
  const [location, setLocation] = useState(() => asText(initialEvent?.location || firstSession?.location));
  const [eventLeadTeam, setEventLeadTeam] = useState(() => getFirstNoteValue(initialEvent?.notes, ["Event Lead/Team", "Event Lead"]) || asText(initialTrainingMetadata.sim_contact));
  const [simStaff, setSimStaff] = useState(() => getFirstNoteValue(initialEvent?.notes, ["Sim Staff"]) || asText(initialTrainingMetadata.sim_contact));
  const [courseFaculty, setCourseFaculty] = useState(() => getFirstNoteValue(initialEvent?.notes, ["Course Faculty"]) || asText(initialTrainingMetadata.faculty_names));
  const [notes, setNotes] = useState(() => asText(initialEvent?.notes));
  const [visibility, setVisibility] = useState(() => asText(initialEvent?.visibility) || "team");
  const [trainingRequirement, setTrainingRequirement] = useState<TrainingRequirement>(() => {
    const value = asText(initialTrainingMetadata.training_required).toLowerCase();
    return value === "yes" || value === "no" ? value : "tbd";
  });
  const [trainingOwnership, setTrainingOwnership] = useState<TrainingOwnership>(() => {
    const value = asText(initialTrainingMetadata.training_ownership).toLowerCase();
    return value === "faculty_led" || value === "internal_sim" || value === "shared" ? value : "tbd";
  });
  const [preferredTrainingDate, setPreferredTrainingDate] = useState(() => asText(initialTrainingMetadata.preferred_training_date || initialTrainingMetadata.training_date));
  const [preferredTrainingTime, setPreferredTrainingTime] = useState(() => toInputTime(initialTrainingMetadata.preferred_training_time || initialTrainingMetadata.training_start_time, ""));
  const [preferredTrainingEndTime, setPreferredTrainingEndTime] = useState(() => toInputTime(initialTrainingMetadata.preferred_training_end_time || initialTrainingMetadata.training_end_time, ""));
  const [facultyAvailabilityUnknown, setFacultyAvailabilityUnknown] = useState(() => asText(initialTrainingMetadata.faculty_availability_unknown).toLowerCase() === "yes");
  const [trainingZoomRequired, setTrainingZoomRequired] = useState(() => asText(initialTrainingMetadata.training_zoom_required).toLowerCase() === "yes" || Boolean(asText(initialTrainingMetadata.zoom_url || initialTrainingMetadata.training_zoom_link)));
  const [trainingRecordingPlanned, setTrainingRecordingPlanned] = useState(() => asText(initialTrainingMetadata.training_recording_planned).toLowerCase() === "yes");
  const [avSupportRequired, setAvSupportRequired] = useState(() => asText(initialTrainingMetadata.av_support_required).toLowerCase() === "yes");
  const [simTechRequired, setSimTechRequired] = useState(() => asText(initialTrainingMetadata.sim_tech_required).toLowerCase() === "yes");
  const [eventRecordingRequired, setEventRecordingRequired] = useState(() => asText(initialTrainingMetadata.event_recording_required || initialTrainingMetadata.event_recording_enabled).toLowerCase() === "yes");
  const [materialsReady, setMaterialsReady] = useState(() => /ready|uploaded|complete/i.test(asText(initialTrainingMetadata.event_material_status)));
  const [requestFacultyAvailability, setRequestFacultyAvailability] = useState(() => asText(initialTrainingMetadata.faculty_training_coordination_requested).toLowerCase() === "yes");
  const [trainingNotes, setTrainingNotes] = useState(() => asText(initialTrainingMetadata.training_notes) || getFirstNoteValue(initialEvent?.notes, ["Training Notes"]));

  const [dateList, setDateList] = useState(() => getUniqueSessionDates(initialEvent, initialSessions));
  const [startTime, setStartTime] = useState(() => toInputTime(firstSession?.start_time, "08:00"));
  const [endTime, setEndTime] = useState(() => toInputTime(firstSession?.end_time, "12:00"));
  const [sessionLength, setSessionLength] = useState(() => getInitialNumberFromNotes(initialEvent?.notes, ["Session Length"], "25"));
  const [feedbackLength, setFeedbackLength] = useState(() => getInitialNumberFromNotes(initialEvent?.notes, ["Feedback / Break Length"], "10"));
  const [prebriefingRequired, setPrebriefingRequired] = useState("no");
  const [prebriefingMinutes, setPrebriefingMinutes] = useState("15");
  const [prebriefingLocation, setPrebriefingLocation] = useState("");
  const [roomCount, setRoomCount] = useState(() => asText(initialTrainingMetadata.schedule_room_count) || String(Math.max(1, getUniqueRoomNames(initialSessions).split("\n").filter(Boolean).length || 1)));
  const [roomNames, setRoomNames] = useState(() => getUniqueRoomNames(initialSessions));
  const [numberOfCases, setNumberOfCases] = useState("1");
  const [studentsSeeEachCase, setStudentsSeeEachCase] = useState("yes");
  const [scheduleBreakBlock, setScheduleBreakBlock] = useState("");
  const [backupSpsRequired, setBackupSpsRequired] = useState(() => initialBackupRequired);
  const [backupSpCount, setBackupSpCount] = useState(() => initialBackupRequired === "yes" ? initialBackupCount : "");
  const [studentCount, setStudentCount] = useState(() => asText(initialTrainingMetadata.schedule_learner_count) || getInitialNumberFromNotes(initialEvent?.notes, ["Student Count"], ""));
  const [spNeededOverride, setSpNeededOverride] = useState(() => initialEvent?.sp_needed === null || initialEvent?.sp_needed === undefined ? "" : String(initialEvent.sp_needed));

  const parsedDates = useMemo(() => parseDateList(dateList), [dateList]);
  const parsedRoomCount = parseNumber(roomCount) || 1;
  const parsedStudentCount = parseNumber(studentCount);
  const normalizedRoomNames = useMemo(
    () => sortRoomNamesNaturally(parseRoomNames(roomNames, parsedRoomCount)),
    [parsedRoomCount, roomNames]
  );
  const sessionLengthMinutes = parseNumber(sessionLength);
  const feedbackLengthMinutes = parseNumber(feedbackLength);
  const rotationsNeeded =
    parsedStudentCount > 0 && parsedRoomCount > 0
      ? Math.ceil(parsedStudentCount / parsedRoomCount)
      : 0;
  const maxRoundsThatFit = useMemo(
    () =>
      countRoundsThatFit({
        dates: parsedDates,
        startTime,
        endTime,
        sessionLengthMinutes,
        feedbackLengthMinutes,
      }),
    [endTime, feedbackLengthMinutes, parsedDates, sessionLengthMinutes, startTime]
  );

  const fallbackStartMinutes = parseClockTimeToMinutes(startTime);
  const fallbackEndMinutes = parseClockTimeToMinutes(endTime);
  const fallbackBlockMinutes = sessionLengthMinutes + feedbackLengthMinutes;
  const fallbackAvailableMinutes =
    fallbackStartMinutes !== null && fallbackEndMinutes !== null ? fallbackEndMinutes - fallbackStartMinutes : 0;
  const fallbackRoundsThatFit =
    fallbackAvailableMinutes > 0 && fallbackBlockMinutes > 0 ? Math.floor(fallbackAvailableMinutes / fallbackBlockMinutes) : 0;
  const scheduleTimeWindowRounds = Math.max(maxRoundsThatFit, fallbackRoundsThatFit);
  const generatedRotationRoundCount =
    parsedStudentCount > 0
      ? Math.min(rotationsNeeded, scheduleTimeWindowRounds)
      : scheduleTimeWindowRounds;
  const generatedRoomSlotCount = generatedRotationRoundCount * parsedRoomCount;
  const effectiveAvailableRoundCapacity = generatedRoomSlotCount;
  const effectiveEmptyRoomSlotsInFinalRound =
    parsedStudentCount > 0 && generatedRotationRoundCount >= rotationsNeeded
      ? Math.max(0, generatedRoomSlotCount - parsedStudentCount)
      : 0;

  // CFSP_AUTO_PROJECTED_END_TIME
  useEffect(() => {
    const startMinutes = parseClockTimeToMinutes(startTime);
    const blockMinutes = sessionLengthMinutes + feedbackLengthMinutes;

    if (
      startMinutes === null ||
      parsedStudentCount <= 0 ||
      parsedRoomCount <= 0 ||
      rotationsNeeded <= 0 ||
      blockMinutes <= 0
    ) {
      return;
    }

    const projectedEndTime = formatClockMinutesForInput(startMinutes + rotationsNeeded * blockMinutes);

    if (projectedEndTime && projectedEndTime !== endTime) {
      window.requestAnimationFrame(() => {
        setEndTime(projectedEndTime);
      });
    }
  }, [
    endTime,
    feedbackLengthMinutes,
    parsedRoomCount,
    parsedStudentCount,
    rotationsNeeded,
    sessionLengthMinutes,
    startTime,
  ]);

  const canonicalEventType = getCanonicalEventType(eventType);
  const needsSpStaffing = eventTypeNeedsSpStaffing(eventType);
  const calculatedSpNeeded = needsSpStaffing ? parsedRoomCount : 0;
  const trainingRequired = trainingRequirement === "yes";
  const facultyTrainingCoordinationRelevant =
    trainingRequired && (trainingOwnership === "faculty_led" || trainingOwnership === "shared");
  const facultyAvailabilityRequestPlanned = facultyTrainingCoordinationRelevant && requestFacultyAvailability;
  const parsedSpNeeded =
    !needsSpStaffing
      ? 0
      : asText(spNeededOverride)
        ? parseNumber(spNeededOverride)
        : calculatedSpNeeded;
  const normalizedBackupSpsRequired = normalizeBackupRequirementValue(backupSpsRequired);
  const parsedBackupTarget = normalizedBackupSpsRequired === "yes" ? parseNumber(backupSpCount) : 0;
  const backupRequirementSummary =
    normalizedBackupSpsRequired === "yes"
      ? `Yes - ${parsedBackupTarget || backupSpCount || "Not set"}`
      : normalizedBackupSpsRequired === "no"
        ? "No"
        : "Not set";

  const rotationRounds = useMemo(
    () =>
      buildRotationRounds({
        dates: parsedDates,
        startTime,
        endTime,
        sessionLengthMinutes,
        feedbackLengthMinutes,
        roomCount: parsedRoomCount,
        studentCount: parsedStudentCount,
      }),
    [endTime, feedbackLengthMinutes, parsedDates, parsedRoomCount, parsedStudentCount, sessionLengthMinutes, startTime]
  );

  const generatedSessions = useMemo(
    () =>
      buildGeneratedSessions({
        rounds: rotationRounds,
        roomNames: normalizedRoomNames,
        location,
      }),
    [location, normalizedRoomNames, rotationRounds]
  );

  const availableRoundCapacity = effectiveAvailableRoundCapacity;
  const emptyRoomSlotsInFinalRound = effectiveEmptyRoomSlotsInFinalRound;
  const totalSpCoverageNeeded = !needsSpStaffing || parsedSpNeeded <= 0 ? 0 : generatedRotationRoundCount * parsedSpNeeded;
  const dateText = parsedDates.join(", ");
  const compiledNotes = buildNotes({
    eventType,
    canonicalEventType,
    modality,
    zoomUrl,
    eventLeadTeam,
    simStaff,
    courseFaculty,
    trainingRequirement,
    trainingOwnership,
    preferredTrainingDate,
    preferredTrainingTime,
    preferredTrainingEndTime,
    facultyAvailabilityUnknown,
    trainingZoomRequired,
    trainingRecordingPlanned,
    avSupportRequired,
    simTechRequired,
    eventRecordingRequired,
    materialsReady,
    requestFacultyAvailability: facultyAvailabilityRequestPlanned,
    trainingNotes,
    studentCount,
    notes,
    sessionLength,
    feedbackLength,
    prebriefingRequired,
    prebriefingMinutes,
    prebriefingLocation,
    roomCount: parsedRoomCount,
    roomNames: normalizedRoomNames,
    rotationsNeeded,
    backupSpsRequired,
    backupSpCount,
    generatedRotationRounds: generatedRotationRoundCount,
    generatedRoomSlots: generatedRoomSlotCount,
  });

  const warnings = useMemo(() => {
    const next: string[] = [];
    if (!asText(name)) next.push("Event name is required.");
    if (!parsedDates.length) next.push("At least one event date is required.");
    if (!startTime || !endTime) next.push("Start and end times are required.");
    if (!generatedRotationRoundCount) next.push("Schedule builder could not generate any rotation rounds.");
    if (parsedStudentCount <= 0) {
      next.push("Student count is blank, so this schedule is shown as an uncapped preview based on the time window.");
    }
    if (rotationsNeeded > 0 && generatedRotationRoundCount < rotationsNeeded) {
      next.push(`Time window only fits ${generatedRotationRoundCount} of ${rotationsNeeded} needed rotations.`);
    }
    if (parsedStudentCount > 0 && availableRoundCapacity < parsedStudentCount) {
      next.push(`Only ${availableRoundCapacity} learner slots fit in the current schedule. Increase time, reduce feedback, or add rooms.`);
    }
    if (needsSpStaffing && parsedSpNeeded <= 0) next.push("SP staffing is set to 0. This event will behave as no-SP-required.");
    if (!asText(simStaff) && !asText(eventLeadTeam)) next.push("Add sim staff or event lead/team so ownership is visible.");
    if (!backupSpsRequired) next.push("Select whether backup SPs are needed.");
    if (backupSpsRequired === "yes" && parseNumber(backupSpCount) <= 0) next.push("Enter how many backup SPs are needed.");
    if (trainingRequirement === "yes" && trainingOwnership === "tbd") next.push("SP training is marked Yes, but training ownership is still TBD.");
    if (facultyTrainingCoordinationRelevant && facultyAvailabilityUnknown && !facultyAvailabilityRequestPlanned) {
      next.push("Faculty-led/co-led training has unknown faculty availability. Consider requesting faculty availability before staffing locks.");
    }
    if (trainingRequirement === "yes" && trainingZoomRequired && !preferredTrainingDate) {
      next.push("Zoom is marked needed for training; add a preferred training date when available.");
    }
    return next;
  }, [
    availableRoundCapacity,
    backupSpsRequired,
    backupSpCount,
    endTime,
    eventLeadTeam,
    eventType,
    needsSpStaffing,
    facultyAvailabilityUnknown,
    facultyAvailabilityRequestPlanned,
    facultyTrainingCoordinationRelevant,
    name,
    parsedDates.length,
    parsedSpNeeded,
    parsedStudentCount,
    preferredTrainingDate,
    generatedRotationRoundCount,
    rotationsNeeded,
    simStaff,
    startTime,
    trainingOwnership,
    trainingRequirement,
    trainingZoomRequired,
  ]);

  
async function handleDownloadReviewPdf() {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
  });

  let y = 40;
  const margin = 40;

  const addLine = (label: string, value: string | number) => {
    doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, margin, y);

    doc.setFont("helvetica", "normal");
    doc.text(String(value || "Not set"), margin + 170, y);

    y += 18;
  };

  const addSection = (title: string) => {
    y += 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(title, margin, y);

    y += 18;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
  };

  const nextPage = () => {
    if (y > 520) {
      doc.addPage();
      y = 40;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("CFSP Event Review Summary", margin, y);

  y += 30;

  doc.setFontSize(10);

  addSection("Event Information");

  addLine("Event", name || "Untitled Event");
  addLine("Type", eventType);
  addLine("Location", location || "Not set");
  addLine("Sim Lead", eventLeadTeam || "Not set");
  addLine("Sim Staff", simStaff || "Not set");
  addLine("Faculty", courseFaculty || "Not set");

  addSection("Schedule Projection");

  addLine("Student Count", parsedStudentCount);
  addLine("Rooms", parsedRoomCount);
  addLine("Rotations Needed", rotationsNeeded);
  addLine("Generated Rotations", generatedRotationRoundCount);
  addLine("Generated Room Slots", generatedRoomSlotCount);
  addLine("Pre-briefing Required", prebriefingRequired === "yes" ? "Yes" : "No");
  if (prebriefingRequired === "yes") {
    addLine("Pre-briefing Length", `${prebriefingMinutes || "15"} minutes`);
    addLine("Pre-briefing Location", prebriefingLocation || "Not set");
  }
  addLine("Number of Cases", numberOfCases || "1");
  if (Number(numberOfCases || "1") > 1) {
    addLine("Students See Each Case", studentsSeeEachCase || "Not set");
  }
  addLine("Backups Required", backupRequirementSummary);
  if (normalizedBackupSpsRequired === "yes") {
    addLine("Backup SP Count", backupSpCount || "Not set");
  }
  if (scheduleBreakBlock) {
    addLine("Schedule Break / Block", scheduleBreakBlock);
  }
  addLine("Start Time", startTime || "Not set");
  addLine("End Time", endTime || "Not set");

  addSection("Rotation Rounds");

  if (rotationRounds.length) {
    rotationRounds.forEach((round, index) => {
      nextPage();

      const startMinutes = parseClockTimeToMinutes(startTime);
      const blockMinutes = sessionLengthMinutes + feedbackLengthMinutes;
      const roundStart = startMinutes === null ? null : startMinutes + index * blockMinutes;
      const roundEnd = roundStart === null ? null : roundStart + sessionLengthMinutes;
      const roundLabel =
        roundStart === null || roundEnd === null
          ? `Round ${index + 1}`
          : `Round ${index + 1} · ${formatClockLabel(roundStart)} - ${formatClockLabel(roundEnd)}`;

      doc.text(roundLabel, margin, y);

      y += 16;
    });
  } else {
    doc.text("No rotation rounds generated.", margin, y);
    y += 16;
  }

  const safeName = (name || "event-review")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  doc.save(`${safeName}.pdf`);
}

async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    begin();
    setSaving(true);
    setErrorMessage("");

    const blockingWarnings = warnings.filter((warning) => {
      const normalized = warning.toLowerCase();
      return (
        normalized.includes("event name is required") ||
        normalized.includes("date is required") ||
        normalized.includes("start time is required") ||
        normalized.includes("end time is required")
      );
    });

    if (blockingWarnings.length) {
      const message = blockingWarnings[0] || `Please complete the required fields before ${isEditMode ? "saving" : "creating"} the event.`;
      setErrorMessage(message);
      fail(message);
      setSaving(false);
      return;
    }

    const payload = {
      name: asText(name),
      status: getRecommendedStatus(eventType, parsedSpNeeded),
      date_text: dateText,
      sp_needed: parsedSpNeeded,
      event_type: canonicalEventType,
      visibility,
      location: asText(location),
      notes: compiledNotes,
      sessions: generatedSessions,
    };

    try {
      const response = await fetch(isEditMode && initialEvent?.id ? `/api/events/${encodeURIComponent(initialEvent.id)}` : "/api/events", {
        method: isEditMode ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEditMode
            ? {
                event_updates: {
                  name: payload.name,
                  status: asText(initialEvent?.status) || payload.status,
                  date_text: payload.date_text,
                  sp_needed: payload.sp_needed,
                  visibility: payload.visibility,
                  location: payload.location,
                  notes: payload.notes,
                },
                session_replacements: payload.sessions,
              }
            : payload
        ),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const message = sanitizePublicErrorMessage(
          body?.message || body?.error,
          `Could not ${isEditMode ? "save" : "create"} event (${response.status}).`
        );
        setErrorMessage(message);
        fail(message);
        setSaving(false);
        return;
      }

      const eventId = asText(body?.event?.id || initialEvent?.id);
      if (eventId) {
        done(isEditMode ? "Event setup saved." : "Event created.");
        setSaving(false);
        window.setTimeout(() => {
          router.push(`/events/${eventId}`);
        }, 900);
        return;
      }

      done(isEditMode ? "Event setup saved." : "Event created.");
      setSaving(false);
      window.setTimeout(() => {
        router.push("/events");
      }, 900);
    } catch (error) {
      const message = sanitizePublicErrorMessage(
        error instanceof Error ? error.message : error,
        `Could not ${isEditMode ? "save" : "create"} event.`
      );
      setErrorMessage(message);
      fail(message);
      setSaving(false);
    }
  }

  return (
    <SiteShell
      title={isEditMode ? "Edit Event Setup" : "New Event"}
      subtitle={isEditMode ? "Update the structured intake, timing, staffing, access, training, and support details for this event." : "Use the guided intake flow to build rotation rounds, set staffing needs, and create a ready-to-run event."}
    >
      <div className="grid gap-5">
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}

        <section className="cfsp-panel-muted rounded-[12px] border border-[#dce6ee] px-5 py-5">
          <div className="flex flex-wrap gap-2">
            {STEP_TITLES.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index as WizardStep)}
                className={`cfsp-btn ${step === index ? "cfsp-btn-primary" : "cfsp-btn-secondary"}`}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="grid gap-5">
          {step === 0 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Event Info</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Start with the basic event identity and the team responsible for the event.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="cfsp-label">Event Name</span>
                  <input className="cfsp-input" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Event Type</span>
                  <select className="cfsp-input" value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Location / Site</span>
                  <input className="cfsp-input" value={location} onChange={(e) => setLocation(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Modality</span>
                  <select className="cfsp-input" value={modality} onChange={(e) => setModality(e.target.value)}>
                    <option value="in_person">In-person</option>
                    <option value="virtual">Virtual / VIR</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="tbd">TBD</option>
                  </select>
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Virtual / Zoom Access</span>
                  <input className="cfsp-input" value={zoomUrl} onChange={(e) => setZoomUrl(e.target.value)} placeholder="https://zoom.us/j/..." />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Visibility</span>
                  <select className="cfsp-input" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
                    <option value="team">Team</option>
                    <option value="personal">Personal</option>
                  </select>
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Sim Lead</span>
                  <input className="cfsp-input" value={eventLeadTeam} onChange={(e) => setEventLeadTeam(e.target.value)} placeholder="Cory/Cristina" />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Sim Staff</span>
                  <input className="cfsp-input" value={simStaff} onChange={(e) => setSimStaff(e.target.value)} placeholder="Cory" />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Course / Faculty</span>
                  <input className="cfsp-input" value={courseFaculty} onChange={(e) => setCourseFaculty(e.target.value)} />
                </label>
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Notes</span>
                  <textarea
                    className="cfsp-input"
                    style={{ minHeight: 110, resize: "vertical" }}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Schedule Builder</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Enter the student count, rooms, and timing rules. CFSP calculates learner rotation rounds automatically.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Date(s)</span>
                  <textarea
                    className="cfsp-input"
                    style={{ minHeight: 88, resize: "vertical" }}
                    value={formatDateListForDisplay(dateList)}
                    onChange={(e) => setDateList(e.target.value)}
                    placeholder={"05/26/2026\n05/27/2026"}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Student Count</span>
                  <input className="cfsp-input" type="number" min={1} value={studentCount} onChange={(e) => setStudentCount(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Number of Rooms</span>
                  <input className="cfsp-input" type="number" min={1} value={roomCount} onChange={(e) => setRoomCount(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Start Time</span>
                  <input className="cfsp-input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">End Time</span>
                  <input className="cfsp-input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Encounter Length (minutes)</span>
                  <input className="cfsp-input" type="number" min={5} step={5} value={sessionLength} onChange={(e) => setSessionLength(e.target.value)} />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Feedback / Transition Length (minutes)</span>
                  <input className="cfsp-input" type="number" min={0} step={5} value={feedbackLength} onChange={(e) => setFeedbackLength(e.target.value)} />
                </label>
                                <label className="grid gap-2">
                  <span className="cfsp-label">Pre-briefing?</span>
                  <select
                    className="cfsp-input"
                    value={prebriefingRequired}
                    onChange={(e) => setPrebriefingRequired(e.target.value)}
                  >
                    <option value="no">No pre-briefing</option>
                    <option value="yes">Yes, include pre-briefing</option>
                  </select>
                </label>

                {prebriefingRequired === "yes" ? (
                  <>
                    <label className="grid gap-2">
                      <span className="cfsp-label">Pre-briefing Length (minutes)</span>
                      <input
                        className="cfsp-input"
                        type="number"
                        min="1"
                        step="5"
                        value={prebriefingMinutes}
                        onChange={(e) => setPrebriefingMinutes(e.target.value)}
                        placeholder="15"
                      />
                    </label>

                    <label className="grid gap-2 md:col-span-2">
                      <span className="cfsp-label">Pre-briefing Location</span>
                      <input
                        className="cfsp-input"
                        value={prebriefingLocation}
                        onChange={(e) => setPrebriefingLocation(e.target.value)}
                        placeholder="Example: Classroom, hallway, Zoom, room 401"
                      />
                    </label>
                  </>
                ) : null}

<label className="grid gap-2 md:col-span-2">
                  <span className="cfsp-label">Room Names</span>

                  <textarea
                    className="cfsp-input"
                    style={{ minHeight: 88, resize: "vertical" }}
                    value={roomNames}
                    onChange={(e) => setRoomNames(e.target.value)}
                    placeholder={"Exam Room 1\nExam Room 2"}
                  />
                </label>
              </div>

                            <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-2">
                  <span className="cfsp-label">Number of Cases</span>
                  <input
                    className="cfsp-input"
                    type="number"
                    min="1"
                    value={numberOfCases}
                    onChange={(e) => setNumberOfCases(e.target.value)}
                    placeholder="1"
                  />
                </label>

                {Number(numberOfCases || "1") > 1 ? (
                  <>
                    <label className="grid gap-2">
                      <span className="cfsp-label">How many cases?</span>
                      <input
                        className="cfsp-input"
                        type="number"
                        min="2"
                        value={numberOfCases}
                        onChange={(e) => setNumberOfCases(e.target.value)}
                        placeholder="2"
                      />
                    </label>

                    <label className="grid gap-2">
                      <span className="cfsp-label">Do students see each case?</span>
                      <select
                        className="cfsp-input"
                        value={studentsSeeEachCase}
                        onChange={(e) => setStudentsSeeEachCase(e.target.value)}
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                        <option value="partial">Some / partial rotation</option>
                      </select>
                    </label>
                  </>
                ) : null}
              </div>

              <label className="grid gap-2">
                <span className="cfsp-label">Break / Block in Schedule Preview</span>
                <textarea
                  className="cfsp-textarea"
                  style={{ minHeight: 72, resize: "vertical" }}
                  value={scheduleBreakBlock}
                  onChange={(e) => setScheduleBreakBlock(e.target.value)}
                  placeholder={"Example: 10:30 AM - 10:45 AM Break\nExample: 12:00 PM - 12:30 PM Lunch"}
                />
              </label>

<div className="cfsp-alert cfsp-alert-info">
                {parsedStudentCount > 0
                  ? `CFSP needs ${rotationsNeeded || 0} learner rotation round${rotationsNeeded === 1 ? "" : "s"} for ${parsedStudentCount} students, generated ${generatedRotationRoundCount || 0}, and will store ${generatedRoomSlotCount || 0} room-slot record${generatedRoomSlotCount === 1 ? "" : "s"}.`
                  : `Student count is blank, so CFSP is showing an uncapped time-window preview with ${generatedRotationRoundCount || 0} learner rotation round${generatedRotationRoundCount === 1 ? "" : "s"} and ${generatedRoomSlotCount || 0} stored room-slot record${generatedRoomSlotCount === 1 ? "" : "s"}.`}
              </div>
              <NewEventSchedulePreview
                snapshotOverride={{
                  dates: dateList,
                  studentCount,
                  roomCount,
                  startTime,
                  endTime,
                  encounterMinutes: sessionLength,
                  transitionMinutes: feedbackLength,
                  prebriefingRequired,
                  prebriefingMinutes,
                  prebriefingLocation,
                  roomNames,
                }}
              />
            </section>
          ) : null}

          {step === 2 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">Staffing Needs</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  CFSP estimates SP staffing from the number of rooms. Adjust only if this event needs a different staffing pattern.
                </p>
              </div>

                            <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="cfsp-label">Backups?</span>
                  <select
                    className="cfsp-input"
                    required
                    value={backupSpsRequired}
                    onChange={(e) => setBackupSpsRequired(e.target.value)}
                  >
                    <option value="">Select one</option>
                    <option value="no">No backups needed</option>
                    <option value="yes">Yes, backups needed</option>
                  </select>
                </label>

                {backupSpsRequired === "yes" ? (
                  <label className="grid gap-2">
                    <span className="cfsp-label">If so, how many?</span>
                    <input
                      className="cfsp-input"
                      type="number"
                      min="1"
                      required
                      value={backupSpCount}
                      onChange={(e) => setBackupSpCount(e.target.value)}
                      placeholder="2"
                    />
                  </label>
                ) : null}
              </div>

<div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="cfsp-label">Calculated SPs Needed</span>
                  <input className="cfsp-input" value={calculatedSpNeeded} disabled />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Adjust SP Count (Optional)</span>
                  <input
                    className="cfsp-input"
                    type="number"
                    min={0}
                    value={!needsSpStaffing ? "0" : spNeededOverride}
                    onChange={(e) => setSpNeededOverride(e.target.value)}
                    disabled={!needsSpStaffing}
                    placeholder={String(calculatedSpNeeded)}
                  />
                </label>
              </div>

              <section className="rounded-[14px] border border-[#b7dce8] bg-[linear-gradient(180deg,#f8fdff_0%,#eef8fb_100%)] px-4 py-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="m-0 text-[1.05rem] font-black text-[#14304f]">Training Planning</h3>
                    <p className="mt-1 mb-0 text-sm font-semibold leading-6 text-[#5e7388]">
                      Capture SP training intent early so ownership, faculty coordination, Zoom, and recording needs are visible after creation.
                    </p>
                  </div>
                  <span className="inline-flex rounded-full border border-[#99d8e9] bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-[#1d5f83]">
                    SP readiness
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="grid gap-2">
                    <span className="cfsp-label">Does this event require SP training?</span>
                    <select className="cfsp-input" value={trainingRequirement} onChange={(e) => setTrainingRequirement(e.target.value as TrainingRequirement)}>
                      {TRAINING_REQUIREMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="cfsp-label">Training ownership</span>
                    <select
                      className="cfsp-input"
                      value={trainingOwnership}
                      onChange={(e) => setTrainingOwnership(e.target.value as TrainingOwnership)}
                      disabled={!trainingRequired}
                    >
                      {TRAINING_OWNERSHIP_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-[12px] border border-[#dce6ee] bg-white/80 px-3 py-3 text-sm font-semibold leading-6 text-[#14304f]">
                    {trainingRequired
                      ? TRAINING_OWNERSHIP_OPTIONS.find((option) => option.value === trainingOwnership)?.detail || "Training ownership still needs confirmation."
                      : trainingRequirement === "no"
                        ? "Training will be marked not required for this event."
                        : "Training requirement will remain TBD until operations confirm it."}
                  </div>

                  <label className="grid gap-2">
                    <span className="cfsp-label">Preferred training date</span>
                    <input
                      className="cfsp-input"
                      type="date"
                      value={preferredTrainingDate}
                      onChange={(e) => setPreferredTrainingDate(e.target.value)}
                      disabled={!trainingRequired}
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="cfsp-label">Preferred training start time</span>
                    <input
                      className="cfsp-input"
                      type="time"
                      value={preferredTrainingTime}
                      onChange={(e) => setPreferredTrainingTime(e.target.value)}
                      disabled={!trainingRequired}
                    />
                  </label>

                  <label className="grid gap-2">
                    <span className="cfsp-label">Preferred training end time</span>
                    <input
                      className="cfsp-input"
                      type="time"
                      value={preferredTrainingEndTime}
                      onChange={(e) => setPreferredTrainingEndTime(e.target.value)}
                      disabled={!trainingRequired}
                    />
                  </label>

                  <div className="grid gap-2 rounded-[12px] border border-[#dce6ee] bg-white/80 px-3 py-3">
                    {[
                      {
                        id: "faculty-availability",
                        label: "Faculty availability unknown",
                        checked: facultyAvailabilityUnknown,
                        onChange: setFacultyAvailabilityUnknown,
                        disabled: !trainingRequired,
                      },
                      {
                        id: "training-zoom",
                        label: "Zoom required",
                        checked: trainingZoomRequired,
                        onChange: setTrainingZoomRequired,
                        disabled: !trainingRequired,
                      },
                      {
                        id: "training-recording",
                        label: "Recording planned",
                        checked: trainingRecordingPlanned,
                        onChange: setTrainingRecordingPlanned,
                        disabled: !trainingRequired,
                      },
                    ].map((option) => (
                      <label key={option.id} className="flex items-center gap-2 text-sm font-bold text-[#14304f]">
                        <input
                          type="checkbox"
                          checked={option.checked}
                          onChange={(e) => option.onChange(e.target.checked)}
                          disabled={option.disabled}
                          className="h-4 w-4 accent-[#0f766e]"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>

                  {facultyTrainingCoordinationRelevant ? (
                    <label className="flex items-center gap-2 rounded-[12px] border border-[#f2d48b] bg-[#fffbeb] px-3 py-3 text-sm font-bold text-[#8a5a13] md:col-span-3">
                      <input
                        type="checkbox"
                        checked={requestFacultyAvailability}
                        onChange={(e) => setRequestFacultyAvailability(e.target.checked)}
                        className="h-4 w-4 accent-[#b45309]"
                      />
                      Request faculty availability for SP training after event save
                    </label>
                  ) : null}

                  <label className="grid gap-2 md:col-span-3">
                    <span className="cfsp-label">Training notes</span>
                    <textarea
                      className="cfsp-input"
                      style={{ minHeight: 92, resize: "vertical" }}
                      value={trainingNotes}
                      onChange={(e) => setTrainingNotes(e.target.value)}
                      disabled={!trainingRequired && trainingRequirement !== "tbd"}
                      placeholder="Faculty constraints, prep ownership, tentative windows, Zoom/recording requirements..."
                    />
                  </label>
                </div>
              </section>

              <div className={`cfsp-alert ${!needsSpStaffing || parsedSpNeeded <= 0 ? "cfsp-alert-info" : "cfsp-alert-success"}`}>
                {!needsSpStaffing || parsedSpNeeded <= 0
                  ? "No SP staffing required. This event will suppress SP assignment workflow after creation."
                  : `Projected total SP coverage needed: ${totalSpCoverageNeeded} SP round-blocks.`}
                {needsSpStaffing ? " SP count is per concurrent rotation, not total room-slot coverage." : ""}
              </div>

              <section className="rounded-[14px] border border-[#dce6ee] bg-white/80 px-4 py-4">
                <div>
                  <h3 className="m-0 text-[1.05rem] font-black text-[#14304f]">Support, Recording, and Materials</h3>
                  <p className="mt-1 mb-0 text-sm font-semibold leading-6 text-[#5e7388]">
                    Keep operational support needs visible in the Command Center and readiness board.
                  </p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    { label: "AV support required", checked: avSupportRequired, onChange: setAvSupportRequired },
                    { label: "Sim tech required", checked: simTechRequired, onChange: setSimTechRequired },
                    { label: "Event recording required", checked: eventRecordingRequired, onChange: setEventRecordingRequired },
                    { label: "Materials/file cabinet ready", checked: materialsReady, onChange: setMaterialsReady },
                  ].map((option) => (
                    <label key={option.label} className="flex items-center gap-2 rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-3 py-3 text-sm font-bold text-[#14304f]">
                      <input
                        type="checkbox"
                        checked={option.checked}
                        onChange={(e) => option.onChange(e.target.checked)}
                        className="h-4 w-4 accent-[#0f766e]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </section>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="cfsp-panel grid gap-4">
              <div>
                <h2 className="m-0 text-[1.35rem] font-black text-[#14304f]">{isEditMode ? "Review & Save" : "Review & Create"}</h2>
                <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                  Review the learner rounds, room usage, staffing need, and team details before saving.
                </p>
              </div>

              {warnings.length ? (
                <div className="cfsp-alert cfsp-alert-info">
                  <div className="font-black text-[#14304f]">Review warnings</div>
                  <ul className="mt-2 mb-0 pl-5 text-sm leading-6 text-[#5e7388]">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Student Count</div>
                  <div className="cfsp-stat-value">{parsedStudentCount || "—"}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Rooms</div>
                  <div className="cfsp-stat-value">{normalizedRoomNames.length}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Rotations Needed</div>
                  <div className="cfsp-stat-value">{parsedStudentCount > 0 ? rotationsNeeded : "Uncapped"}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Generated Rotations</div>
                  <div className="cfsp-stat-value">{generatedRotationRoundCount}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Generated Room Slots</div>
                  <div className="cfsp-stat-value">{generatedRoomSlotCount}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Empty Room Slots In Final Round</div>
                  <div className="cfsp-stat-value">{parsedStudentCount > 0 ? emptyRoomSlotsInFinalRound : "—"}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">SP Coverage</div>
                  <div className="cfsp-stat-value">{!needsSpStaffing || parsedSpNeeded <= 0 ? "None" : totalSpCoverageNeeded}</div>
                </div>
                <div className="cfsp-stat-card">
                  <div className="cfsp-label">Training Plan</div>
                  <div className="cfsp-stat-value text-[1.35rem]">{getTrainingRequirementLabel(trainingRequirement)}</div>
                  <div className="mt-1 text-sm font-bold text-[#5e7388]">
                    {trainingRequirement === "yes" ? getTrainingOwnershipLabel(trainingOwnership) : "Ownership not required yet"}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                  <div className="cfsp-label">Rotation Rounds</div>
                  <div className="mt-3 grid gap-2">
                    {rotationRounds.length ? (
                      rotationRounds.slice(0, 18).map((round) => (
                        <div key={`${round.session_date}-${round.start_time}-${round.roundNumber}`} className="rounded-[10px] border border-[#dce6ee] bg-white px-3 py-3 text-sm font-semibold text-[#14304f]">
                          {formatRoundPreview(round)}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm font-semibold text-[#6a7e91]">No rotation rounds generated yet.</div>
                    )}
                    {rotationRounds.length > 18 ? (
                      <div className="text-sm font-semibold text-[#6a7e91]">
                        Showing first 18 of {generatedRotationRoundCount} learner rotation rounds.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="cfsp-label">Review Summary</div>
                    <button
                      type="button"
                      className="cfsp-btn cfsp-btn-secondary"
                      onClick={handleDownloadReviewPdf}
                    >
                      Download PDF
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-[#14304f]">
                    <div><strong>Event:</strong> {name || "Untitled Event"}</div>
                    <div><strong>Type:</strong> {EVENT_TYPE_OPTIONS.find((option) => option.value === eventType)?.label}</div>
                    <div><strong>Location:</strong> {location || "Not set"}</div>
                    <div><strong>Sim Lead:</strong> {eventLeadTeam || "Not set"}</div>
                    <div><strong>Sim Staff:</strong> {simStaff || "Not set"}</div>
                    <div><strong>Course Faculty:</strong> {courseFaculty || "Not set"}</div>
                    <div><strong>Student Count:</strong> {parsedStudentCount || "Not set"}</div>
                    <div><strong>Rooms:</strong> {normalizedRoomNames.length}</div>
                    <div><strong>Rotations Needed:</strong> {parsedStudentCount > 0 ? rotationsNeeded : `Uncapped preview (${maxRoundsThatFit})`}</div>
                    <div><strong>Generated Rotations:</strong> {generatedRotationRoundCount}</div>
                    <div><strong>Generated Room Slots:</strong> {generatedRoomSlotCount}</div>
                    <div><strong>Pre-briefing Required:</strong> {prebriefingRequired === "yes" ? "Yes" : "No"}</div>
                    {prebriefingRequired === "yes" ? (
                      <>
                        <div><strong>Pre-briefing Length:</strong> {prebriefingMinutes || "15"} minutes</div>
                        <div><strong>Pre-briefing Location:</strong> {prebriefingLocation || "Not set"}</div>
                      </>
                    ) : null}
                    <div><strong>Empty Room Slots In Final Round:</strong> {parsedStudentCount > 0 ? emptyRoomSlotsInFinalRound : "—"}</div>
                    <div><strong>SPs Needed:</strong> {!needsSpStaffing ? "No SPs required" : parsedSpNeeded}</div>
                    <div><strong>SP Training:</strong> {getTrainingRequirementLabel(trainingRequirement)}</div>
                    {trainingRequirement === "yes" ? (
                      <>
                        <div><strong>Training Ownership:</strong> {getTrainingOwnershipLabel(trainingOwnership)}</div>
                        <div>
                          <strong>Preferred Training:</strong>{" "}
                          {[
                            preferredTrainingDate,
                            [preferredTrainingTime, preferredTrainingEndTime].filter(Boolean).join(" - "),
                          ].filter(Boolean).join(" · ") || "Not scheduled"}
                        </div>
                        <div><strong>Training Logistics:</strong> {[trainingZoomRequired ? "Zoom required" : "", trainingRecordingPlanned ? "Recording planned" : "", facultyAvailabilityUnknown ? "Faculty availability unknown" : ""].filter(Boolean).join(" · ") || "No extra logistics marked"}</div>
                        {facultyAvailabilityRequestPlanned ? <div><strong>Faculty Coordination:</strong> Request availability after creation</div> : null}
                      </>
                    ) : null}
                    <div><strong>Room Names:</strong> {normalizedRoomNames.join(", ")}</div>
                    <div><strong>Number of Cases:</strong> {numberOfCases || "1"}</div>
                    {Number(numberOfCases || "1") > 1 ? (
                      <div><strong>Students See Each Case:</strong> {studentsSeeEachCase || "Not set"}</div>
                    ) : null}
                    <div><strong>Backups Required:</strong> {backupRequirementSummary}</div>
                    {normalizedBackupSpsRequired === "yes" ? (
                      <div><strong>Backup SP Count:</strong> {backupSpCount || "Not set"}</div>
                    ) : null}
                    {scheduleBreakBlock ? (
                      <div><strong>Schedule Break / Block:</strong> {scheduleBreakBlock}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap justify-between gap-3">
<div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep((current) => Math.max(0, current - 1) as WizardStep)}
                className="cfsp-btn cfsp-btn-secondary"
                disabled={step === 0}
              >
                Back
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep((current) => Math.min(3, current + 1) as WizardStep)}
                  className="cfsp-btn cfsp-btn-secondary"
                >
                  Next
                </button>
              ) : (
                <button type="button" className="cfsp-btn cfsp-btn-secondary" disabled>
                  {isEditMode ? "Ready to Save" : "Ready to Create"}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Link href={isEditMode && initialEvent?.id ? `/events/${initialEvent.id}` : "/events"} className="cfsp-btn cfsp-btn-secondary">
                Cancel
              </Link>
              <button type="submit" disabled={saving || step !== 3} className="cfsp-btn cfsp-btn-primary">
                {saving ? (isEditMode ? "Saving..." : "Creating...") : isEditMode ? "Save Event Setup" : "Create Event"}
              </button>
              <ActionFeedback feedback={createEventFeedback} />
            </div>
          </div>
        </form>
      </div>
    </SiteShell>
  );
}
