export type StudentInstructionsConfig = {
  title: string;
  zoomLink: string;
  joinOffsetMinutes: number;
  joinInstructions: string;
  waitingRoomNote: string;
  timeZoneNote: string;
  netiquetteInstructions: string;
  prebriefInstructions: string;
  encounterTimeDetail: string;
  feedbackTimeDetail: string;
  scenarioReminders: string;
  footerNote: string;
  updatedAt: string;
};

export type FacultySimOpsInstructionsConfig = {
  template: string;
  footerNote: string;
  updatedAt: string;
};

export const DEFAULT_STUDENT_INSTRUCTIONS_CONFIG: StudentInstructionsConfig = {
  title: "",
  zoomLink: "",
  joinOffsetMinutes: 15,
  joinInstructions: "Students join Zoom 15 minutes before their first scheduled encounter.",
  waitingRoomNote: "Students are held in the waiting room before staff admit them.",
  timeZoneNote: "All times are Eastern Standard Time.",
  netiquetteInstructions: [
    "Join from a quiet, private location with a stable internet connection.",
    "Use a professional screen name, keep your camera on when possible, and frame your face clearly.",
    "Mute your microphone when you are not speaking, and avoid side conversations or multitasking.",
    "Protect confidentiality. Do not record, photograph, or share simulation content.",
  ].join("\n"),
  prebriefInstructions: [
    "Staff review simulation flow and case information in the main room.",
    "Students are assigned to breakout rooms.",
    "Students introduce themselves to the patient at the start of the encounter.",
  ].join("\n"),
  encounterTimeDetail: "",
  feedbackTimeDetail: "",
  scenarioReminders: "",
  footerNote: "This document is intended for students and includes only learner-facing simulation instructions.",
  updatedAt: "",
};

export const DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_TEMPLATE = [
  "Faculty and SimOps staff should use this document to manage simulation flow, room readiness, learner movement, standardized patient coordination, timing, and event operations.",
  "",
  "Before Event Start:",
  "* Confirm all exam rooms are ready before learners are released.",
  "* Confirm SPs are checked in, briefed, and placed in the correct rooms.",
  "* Confirm faculty, SimOps, and support staff understand the timing structure.",
  "* Hold learners in the designated waiting/pre-brief area until released by staff.",
  "* Review any case-specific reminders, timing notes, or operational concerns before Round 1 begins.",
  "",
  "During the Event:",
  "* Release learners according to the Admin Schedule.",
  "* Monitor room timing and transitions between encounters.",
  "* Keep students moving according to the round schedule.",
  "* Track delays, no-shows, room issues, SP concerns, or faculty notes.",
  "* Use the Admin Schedule as the operational source of truth.",
  "",
  "After Each Round:",
  "* Confirm rooms are reset as needed.",
  "* Confirm SPs are ready for the next learner.",
  "* Communicate timing changes to faculty, SimOps, and support staff.",
  "* Document any operational issues or learner flow problems.",
  "",
  "Confidentiality / Professional Standards:",
  "* Simulation content should not be recorded, photographed, copied, or shared outside approved course/event use.",
  "* Faculty and SimOps should help maintain learner confidentiality, SP confidentiality, and case integrity.",
].join("\n");

export const DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_CONFIG: FacultySimOpsInstructionsConfig = {
  template: DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_TEMPLATE,
  footerNote:
    "This document is intended for faculty, SimOps, and event staff. It includes operational scheduling details for event management.",
  updatedAt: "",
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeJoinOffset(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(asText(value));
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_STUDENT_INSTRUCTIONS_CONFIG.joinOffsetMinutes;
  return Math.min(Math.floor(parsed), 240);
}

function parseInstructionConfigJson<T>(raw: string | null | undefined, normalize: (value: Partial<T> | null | undefined) => T): T {
  const text = asText(raw);
  if (!text) return normalize(null);

  try {
    const parsed = JSON.parse(text) as Partial<T>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return normalize(null);
    }
    return normalize(parsed);
  } catch {
    return normalize(null);
  }
}

export function normalizeStudentInstructionsConfig(
  value: Partial<StudentInstructionsConfig> | null | undefined
): StudentInstructionsConfig {
  const hasFooterNote = Boolean(value && Object.prototype.hasOwnProperty.call(value, "footerNote"));

  return {
    ...DEFAULT_STUDENT_INSTRUCTIONS_CONFIG,
    ...value,
    title: asText(value?.title),
    zoomLink: asText(value?.zoomLink),
    joinOffsetMinutes: normalizeJoinOffset(value?.joinOffsetMinutes),
    joinInstructions: asText(value?.joinInstructions) || DEFAULT_STUDENT_INSTRUCTIONS_CONFIG.joinInstructions,
    waitingRoomNote: asText(value?.waitingRoomNote) || DEFAULT_STUDENT_INSTRUCTIONS_CONFIG.waitingRoomNote,
    timeZoneNote: asText(value?.timeZoneNote) || DEFAULT_STUDENT_INSTRUCTIONS_CONFIG.timeZoneNote,
    netiquetteInstructions:
      asText(value?.netiquetteInstructions) || DEFAULT_STUDENT_INSTRUCTIONS_CONFIG.netiquetteInstructions,
    prebriefInstructions:
      asText(value?.prebriefInstructions) || DEFAULT_STUDENT_INSTRUCTIONS_CONFIG.prebriefInstructions,
    encounterTimeDetail: asText(value?.encounterTimeDetail),
    feedbackTimeDetail: asText(value?.feedbackTimeDetail),
    scenarioReminders: asText(value?.scenarioReminders),
    footerNote: hasFooterNote ? asText(value?.footerNote) : DEFAULT_STUDENT_INSTRUCTIONS_CONFIG.footerNote,
    updatedAt: asText(value?.updatedAt),
  };
}

export function parseStudentInstructionsConfig(raw: string | null | undefined): StudentInstructionsConfig {
  return parseInstructionConfigJson(raw, normalizeStudentInstructionsConfig);
}

export function getStudentInstructionsConfigFromMetadata(
  metadata?: { student_instructions_config?: unknown } | null
) {
  return parseStudentInstructionsConfig(
    typeof metadata?.student_instructions_config === "string"
      ? metadata.student_instructions_config
      : null
  );
}

export function serializeStudentInstructionsConfig(config: Partial<StudentInstructionsConfig>) {
  return JSON.stringify(normalizeStudentInstructionsConfig(config));
}

export function normalizeFacultySimOpsInstructionsConfig(
  value: Partial<FacultySimOpsInstructionsConfig> | null | undefined
): FacultySimOpsInstructionsConfig {
  const hasFooterNote = Boolean(value && Object.prototype.hasOwnProperty.call(value, "footerNote"));

  return {
    ...DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_CONFIG,
    ...value,
    template: asText(value?.template) || DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_CONFIG.template,
    footerNote: hasFooterNote
      ? asText(value?.footerNote)
      : DEFAULT_FACULTY_SIMOPS_INSTRUCTIONS_CONFIG.footerNote,
    updatedAt: asText(value?.updatedAt),
  };
}

export function parseFacultySimOpsInstructionsConfig(raw: string | null | undefined): FacultySimOpsInstructionsConfig {
  return parseInstructionConfigJson(raw, normalizeFacultySimOpsInstructionsConfig);
}

export function getFacultySimOpsInstructionsConfigFromMetadata(
  metadata?: { faculty_simops_instructions_config?: unknown } | null
) {
  return parseFacultySimOpsInstructionsConfig(
    typeof metadata?.faculty_simops_instructions_config === "string"
      ? metadata.faculty_simops_instructions_config
      : null
  );
}

export function serializeFacultySimOpsInstructionsConfig(config: Partial<FacultySimOpsInstructionsConfig>) {
  return JSON.stringify(normalizeFacultySimOpsInstructionsConfig(config));
}

export function splitInstructionLines(value: string) {
  return asText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
