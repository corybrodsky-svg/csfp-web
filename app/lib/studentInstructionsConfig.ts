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

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeJoinOffset(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(asText(value));
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_STUDENT_INSTRUCTIONS_CONFIG.joinOffsetMinutes;
  return Math.min(Math.floor(parsed), 240);
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
  const text = asText(raw);
  if (!text) return normalizeStudentInstructionsConfig(null);

  try {
    const parsed = JSON.parse(text) as Partial<StudentInstructionsConfig>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return normalizeStudentInstructionsConfig(null);
    }
    return normalizeStudentInstructionsConfig(parsed);
  } catch {
    return normalizeStudentInstructionsConfig(null);
  }
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

export function splitInstructionLines(value: string) {
  return asText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
