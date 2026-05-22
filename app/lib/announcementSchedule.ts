import { formatDisplayTimeFromMinutes, parseTimeToMinutes } from "./timeFormat";

export type AnnouncementCueAnchor =
  | "encounter_start"
  | "encounter_end"
  | "feedback_start"
  | "feedback_end"
  | "transition_start"
  | "block_end"
  | "custom_time";

export type AnnouncementCueAppliesTo = "all_rounds" | "selected_rounds";

export type AnnouncementScheduleCueConfig = {
  id: string;
  title: string;
  announcementText: string;
  anchor: AnnouncementCueAnchor;
  offsetMinutes: number;
  active: boolean;
  sortOrder: number;
  appliesTo: AnnouncementCueAppliesTo;
  selectedRoundNumbers?: number[];
  notes?: string;
  customTime?: string;
};

export type AnnouncementScheduleConfig = {
  version: 1;
  cues: AnnouncementScheduleCueConfig[];
  updatedAt?: string;
  updatedBy?: string;
};

export type AnnouncementRoundBlockTiming = {
  label?: string | null;
  start?: number | string | null;
  end?: number | string | null;
};

export type AnnouncementRoundTiming = {
  key?: string | null;
  round?: number | string | null;
  start?: number | string | null;
  end?: number | string | null;
  subBlocks?: Array<AnnouncementRoundBlockTiming | null | undefined> | null;
};

export type ScheduledAnnouncementCue = {
  key: string;
  cueId: string;
  roundKey: string;
  roundNumber: number;
  timeMinutes: number;
  timeLabel: string;
  cueTimingLabel: string;
  badgeLabel: string;
  blockLabel: string;
  phaseKey: AnnouncementCueAnchor;
  title: string;
  message: string;
  detail?: string;
};

const ANNOUNCEMENT_SCHEDULE_START = "[CFSP_ANNOUNCEMENT_SCHEDULE]";
const ANNOUNCEMENT_SCHEDULE_END = "[/CFSP_ANNOUNCEMENT_SCHEDULE]";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toFiniteMinute(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const clockMinutes = parseTimeToMinutes(value);
    if (clockMinutes !== null) return clockMinutes;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function isEncounterLabel(label: string) {
  return /\bencounter\b/i.test(asText(label));
}

function isFeedbackLabel(label: string) {
  return /\bfeedback\b/i.test(asText(label));
}

function isTransitionLabel(label: string) {
  return /\b(transition|turnaround|reset)\b/i.test(asText(label));
}

function normalizeRoundBlocks(round: AnnouncementRoundTiming) {
  const roundStart = toFiniteMinute(round.start);
  const roundEnd = toFiniteMinute(round.end);
  if (roundStart === null || roundEnd === null) return [];
  return (round.subBlocks || [])
    .map((block) => {
      const start = toFiniteMinute(block?.start);
      const end = toFiniteMinute(block?.end);
      if (start === null || end === null || end < start) return null;
      return {
        label: asText(block?.label),
        start,
        end,
      };
    })
    .filter((block): block is { label: string; start: number; end: number } => Boolean(block))
    .filter((block) => block.start >= roundStart - 1 && block.start <= Math.max(roundEnd, roundStart) + 1)
    .sort((a, b) => a.start - b.start || a.end - b.end || a.label.localeCompare(b.label));
}

function getAnchorLabel(anchor: AnnouncementCueAnchor) {
  switch (anchor) {
    case "encounter_start":
      return "encounter start";
    case "encounter_end":
      return "encounter end";
    case "feedback_start":
      return "feedback start";
    case "feedback_end":
      return "feedback end";
    case "transition_start":
      return "transition start";
    case "block_end":
      return "block end";
    case "custom_time":
      return "custom time";
    default:
      return "schedule time";
  }
}

function buildCueTimingLabel(cue: AnnouncementScheduleCueConfig) {
  const anchorLabel = getAnchorLabel(cue.anchor);
  if (cue.offsetMinutes === 0) return `At ${anchorLabel}`;
  const absOffset = Math.abs(cue.offsetMinutes);
  return `${absOffset} minute${absOffset === 1 ? "" : "s"} ${cue.offsetMinutes < 0 ? "before" : "after"} ${anchorLabel}`;
}

function getScheduleBlock(notes?: string | null) {
  const text = asText(notes);
  const escapedStart = ANNOUNCEMENT_SCHEDULE_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = ANNOUNCEMENT_SCHEDULE_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedStart}\\s*([\\s\\S]*?)\\s*${escapedEnd}`, "m"));
  return match?.[1]?.trim() || "";
}

export function getDefaultVirAnnouncementCues(): AnnouncementScheduleCueConfig[] {
  return [
    {
      id: "sp-prepare",
      title: "SPs prepare",
      announcementText: "SPs, Please Prepare.",
      anchor: "encounter_start",
      offsetMinutes: -1,
      active: true,
      sortOrder: 0,
      appliesTo: "all_rounds",
    },
    {
      id: "begin-encounter",
      title: "Begin Encounter",
      announcementText: "Begin Encounter.",
      anchor: "encounter_start",
      offsetMinutes: 0,
      active: true,
      sortOrder: 1,
      appliesTo: "all_rounds",
    },
    {
      id: "five-minutes-remaining",
      title: "5 minutes remaining",
      announcementText: "5 minutes remaining.",
      anchor: "encounter_end",
      offsetMinutes: -5,
      active: true,
      sortOrder: 2,
      appliesTo: "all_rounds",
    },
    {
      id: "encounter-over-feedback",
      title: "Encounter Over / Begin Feedback",
      announcementText: "Encounter Over, Stay for SP Feedback.",
      anchor: "encounter_end",
      offsetMinutes: 0,
      active: true,
      sortOrder: 3,
      appliesTo: "all_rounds",
    },
    {
      id: "leave-meeting",
      title: "Leave Meeting",
      announcementText: "Your encounter has ended. Please leave the meeting.",
      anchor: "feedback_end",
      offsetMinutes: 0,
      active: true,
      sortOrder: 4,
      appliesTo: "all_rounds",
    },
  ];
}

export function normalizeAnnouncementScheduleConfig(value?: Partial<AnnouncementScheduleConfig> | null): AnnouncementScheduleConfig {
  const rawCues = Array.isArray(value?.cues) && value?.cues?.length ? value.cues : getDefaultVirAnnouncementCues();
  const seen = new Set<string>();
  const cues = rawCues
    .map((cue, index) => {
      const baseId = asText(cue?.id) || `announcement-cue-${index + 1}`;
      const uniqueId = seen.has(baseId) ? `${baseId}-${index + 1}` : baseId;
      seen.add(uniqueId);
      const anchor = cue?.anchor && [
        "encounter_start",
        "encounter_end",
        "feedback_start",
        "feedback_end",
        "transition_start",
        "block_end",
        "custom_time",
      ].includes(cue.anchor)
        ? cue.anchor
        : "encounter_start";
      return {
        id: uniqueId,
        title: asText(cue?.title) || "Announcement Cue",
        announcementText: asText(cue?.announcementText) || asText(cue?.title) || "Announcement.",
        anchor,
        offsetMinutes: normalizeInteger(cue?.offsetMinutes, 0),
        active: cue?.active !== false,
        sortOrder: normalizeInteger(cue?.sortOrder, index),
        appliesTo: cue?.appliesTo === "selected_rounds" ? "selected_rounds" : "all_rounds",
        selectedRoundNumbers: Array.isArray(cue?.selectedRoundNumbers)
          ? cue.selectedRoundNumbers.map((item) => normalizeInteger(item, 0)).filter((item) => item > 0)
          : [],
        notes: asText(cue?.notes),
        customTime: asText(cue?.customTime),
      } satisfies AnnouncementScheduleCueConfig;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((cue, index) => ({ ...cue, sortOrder: index }));

  return {
    version: 1,
    cues,
    updatedAt: asText(value?.updatedAt),
    updatedBy: asText(value?.updatedBy),
  };
}

export function parseAnnouncementScheduleFromNotes(notes?: string | null): AnnouncementScheduleConfig {
  const block = getScheduleBlock(notes);
  if (!block) return normalizeAnnouncementScheduleConfig(null);
  try {
    const parsed = JSON.parse(block);
    return normalizeAnnouncementScheduleConfig(parsed);
  } catch {
    return normalizeAnnouncementScheduleConfig(null);
  }
}

export function serializeAnnouncementSchedule(config: AnnouncementScheduleConfig) {
  const normalized = normalizeAnnouncementScheduleConfig(config);
  return JSON.stringify(normalized, null, 2);
}

export function upsertAnnouncementScheduleInNotes(notes: string | null | undefined, config: AnnouncementScheduleConfig) {
  const text = asText(notes);
  const block = `${ANNOUNCEMENT_SCHEDULE_START}\n${serializeAnnouncementSchedule(config)}\n${ANNOUNCEMENT_SCHEDULE_END}`;
  const pattern = new RegExp(
    `${ANNOUNCEMENT_SCHEDULE_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${ANNOUNCEMENT_SCHEDULE_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "m"
  );
  if (pattern.test(text)) return text.replace(pattern, block).trim();
  return [block, text].filter(Boolean).join("\n").trim();
}

export function extractAnnouncementScheduleBlock(notes?: string | null) {
  const blockBody = getScheduleBlock(notes);
  return blockBody ? `${ANNOUNCEMENT_SCHEDULE_START}\n${blockBody}\n${ANNOUNCEMENT_SCHEDULE_END}` : "";
}

export function buildRoundAnnouncementCueTimeline(
  round: AnnouncementRoundTiming | null | undefined,
  nextRound: AnnouncementRoundTiming | null | undefined,
  cueConfig: AnnouncementScheduleConfig | AnnouncementScheduleCueConfig[] | null | undefined,
  options: { formatTime?: (minutes: number) => string } = {}
): ScheduledAnnouncementCue[] {
  if (!round) return [];
  const roundStart = toFiniteMinute(round.start);
  const rawRoundEnd = toFiniteMinute(round.end);
  if (roundStart === null || rawRoundEnd === null || rawRoundEnd <= roundStart) return [];

  const normalizedConfig = Array.isArray(cueConfig)
    ? normalizeAnnouncementScheduleConfig({ version: 1, cues: cueConfig })
    : normalizeAnnouncementScheduleConfig(cueConfig);
  const blocks = normalizeRoundBlocks(round);
  const roundEnd = Math.max(rawRoundEnd, roundStart);
  const encounterBlock =
    blocks.find((block) => isEncounterLabel(block.label)) ||
    ({
      label: "Encounter",
      start: roundStart,
      end: roundEnd,
    } satisfies { label: string; start: number; end: number });
  const feedbackBlock = blocks.find(
    (block) => isFeedbackLabel(block.label) && block.start >= encounterBlock.end - 1 && block.start <= roundEnd + 1
  );
  const transitionBlock = blocks.find(
    (block) =>
      isTransitionLabel(block.label) &&
      block.start >= (feedbackBlock?.end ?? encounterBlock.end) - 1 &&
      block.start <= roundEnd + 1
  );
  const nextRoundStart = toFiniteMinute(nextRound?.start);
  const roundKey = asText(round.key) || `round-${asText(round.round) || "selected"}`;
  const roundNumber = normalizeInteger(round.round, 1);
  const formatTime = (minutes: number) => {
    try {
      return options.formatTime?.(minutes) || formatDisplayTimeFromMinutes(minutes);
    } catch {
      return formatDisplayTimeFromMinutes(minutes);
    }
  };
  const anchorMinutes: Record<AnnouncementCueAnchor, number | null> = {
    encounter_start: encounterBlock.start,
    encounter_end: encounterBlock.end,
    feedback_start: feedbackBlock?.start ?? encounterBlock.end,
    feedback_end: feedbackBlock?.end ?? transitionBlock?.start ?? roundEnd,
    transition_start: transitionBlock?.start ?? feedbackBlock?.end ?? roundEnd,
    block_end: nextRoundStart !== null && nextRoundStart >= roundStart ? nextRoundStart : roundEnd,
    custom_time: null,
  };

  return normalizedConfig.cues
    .filter((cue) => cue.active !== false)
    .filter((cue) => cue.appliesTo !== "selected_rounds" || !cue.selectedRoundNumbers?.length || cue.selectedRoundNumbers.includes(roundNumber))
    .flatMap((cue) => {
      const baseTime = cue.anchor === "custom_time" ? toFiniteMinute(cue.customTime) : anchorMinutes[cue.anchor];
      if (baseTime === null) return [];
      const timeMinutes = baseTime + cue.offsetMinutes;
      return [{
        key: `${roundKey}-${cue.id}`,
        cueId: cue.id,
        roundKey,
        roundNumber,
        timeMinutes,
        timeLabel: formatTime(timeMinutes),
        cueTimingLabel: buildCueTimingLabel(cue),
        badgeLabel: cue.title,
        blockLabel: getAnchorLabel(cue.anchor),
        phaseKey: cue.anchor,
        title: cue.title,
        message: cue.announcementText,
        detail: cue.notes || buildCueTimingLabel(cue),
      } satisfies ScheduledAnnouncementCue];
    })
    .sort((a, b) => a.timeMinutes - b.timeMinutes || a.badgeLabel.localeCompare(b.badgeLabel));
}
