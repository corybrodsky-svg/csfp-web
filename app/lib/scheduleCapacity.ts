const MINUTES_PER_DAY = 24 * 60;

export type ScheduleCapacityInput = {
  learnerCount: number;
  roomCount: number;
  learnersPerRoom?: number;
  startTime: unknown;
  endTime: unknown;
  encounterMinutes: number;
  feedbackMinutes: number;
  transitionMinutes: number;
  prebriefMinutes?: number;
  dateCount?: number;
  transitionIncludedInFeedback?: boolean;
};

export type ScheduleCapacityResult = {
  learnerCount: number;
  roomCount: number;
  learnersPerRoom: number;
  learnerSlotsPerRound: number;
  dateCount: number;
  startMinutes: number | null;
  endMinutes: number | null;
  normalizedEndMinutes: number | null;
  prebriefMinutes: number;
  firstEncounterStartMinutes: number | null;
  encounterMinutes: number;
  feedbackMinutes: number;
  transitionMinutes: number;
  roundLengthMinutes: number;
  availableMinutesPerDate: number;
  requiredRounds: number;
  availableRounds: number;
  availableRoundsPerDate: number;
  scheduledRounds: number;
  availableLearnerSlots: number;
  scheduledLearnerSlots: number;
  scheduledLearners: number;
  unscheduledLearners: number;
  emptySlotsInFinalRound: number;
  hasConflict: boolean;
  requiredEndMinutes: number | null;
  requiredEndTime: string;
};

export type ScheduleCapacitySuggestedAction = {
  key: "extend_end_time" | "adjust_students_per_room" | "regenerate_schedule" | "review_timing";
  label: string;
  detail: string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function positiveInteger(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function parseScheduleClockToMinutes(value: unknown) {
  const text = asText(value);
  if (!text) return null;

  const native = text.match(/^(\d{1,2}):(\d{2})$/);
  if (native) {
    const hour = Number(native[1]);
    const minute = Number(native[2]);
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) return hour * 60 + minute;
  }

  const meridiem = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (meridiem) {
    let hour = Number(meridiem[1]);
    const minute = Number(meridiem[2] || "0");
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute < 60) {
      const suffix = meridiem[3].toUpperCase();
      if (suffix === "AM" && hour === 12) hour = 0;
      if (suffix === "PM" && hour !== 12) hour += 12;
      return hour * 60 + minute;
    }
  }

  return null;
}

export function formatScheduleClockFromMinutes(totalMinutes: number | null | undefined) {
  if (typeof totalMinutes !== "number" || !Number.isFinite(totalMinutes)) return "";
  const normalized = ((Math.round(totalMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function calculateScheduleCapacity(input: ScheduleCapacityInput): ScheduleCapacityResult {
  const learnerCount = positiveInteger(input.learnerCount);
  const roomCount = positiveInteger(input.roomCount);
  const learnersPerRoom = positiveInteger(input.learnersPerRoom, 1);
  const learnerSlotsPerRound = roomCount * learnersPerRoom;
  const dateCount = positiveInteger(input.dateCount, 1);
  const startMinutes = parseScheduleClockToMinutes(input.startTime);
  const rawEndMinutes = parseScheduleClockToMinutes(input.endTime);
  const normalizedEndMinutes =
    startMinutes !== null && rawEndMinutes !== null
      ? rawEndMinutes <= startMinutes
        ? rawEndMinutes + MINUTES_PER_DAY
        : rawEndMinutes
      : null;
  const prebriefMinutes = nonNegativeInteger(input.prebriefMinutes);
  const encounterMinutes = positiveInteger(input.encounterMinutes);
  const feedbackMinutes = nonNegativeInteger(input.feedbackMinutes);
  const transitionMinutes = input.transitionIncludedInFeedback ? 0 : nonNegativeInteger(input.transitionMinutes);
  const roundLengthMinutes = encounterMinutes + feedbackMinutes + transitionMinutes;
  const firstEncounterStartMinutes = startMinutes === null ? null : startMinutes + prebriefMinutes;
  const availableMinutesPerDate =
    firstEncounterStartMinutes !== null && normalizedEndMinutes !== null
      ? Math.max(0, normalizedEndMinutes - firstEncounterStartMinutes)
      : 0;
  const availableRoundsPerDate =
    roomCount > 0 && roundLengthMinutes > 0
      ? Math.floor(availableMinutesPerDate / roundLengthMinutes)
      : 0;
  const availableRounds = availableRoundsPerDate * dateCount;
  const requiredRounds = learnerCount > 0 && learnerSlotsPerRound > 0 ? Math.ceil(learnerCount / learnerSlotsPerRound) : 0;
  const scheduledRounds = learnerCount > 0 ? Math.min(requiredRounds, availableRounds) : availableRounds;
  const availableLearnerSlots = availableRounds * learnerSlotsPerRound;
  const scheduledLearnerSlots = scheduledRounds * learnerSlotsPerRound;
  const scheduledLearners = learnerCount > 0 ? Math.min(learnerCount, scheduledLearnerSlots) : 0;
  const unscheduledLearners = Math.max(learnerCount - scheduledLearnerSlots, 0);
  const hasConflict = requiredRounds > availableRounds;
  const emptySlotsInFinalRound =
    learnerCount > 0 && !hasConflict
      ? Math.max(0, scheduledLearnerSlots - learnerCount)
      : 0;
  const requiredEndMinutes =
    startMinutes !== null && requiredRounds > 0 && roundLengthMinutes > 0
      ? startMinutes + prebriefMinutes + requiredRounds * roundLengthMinutes
      : null;

  return {
    learnerCount,
    roomCount,
    learnersPerRoom,
    learnerSlotsPerRound,
    dateCount,
    startMinutes,
    endMinutes: rawEndMinutes,
    normalizedEndMinutes,
    prebriefMinutes,
    firstEncounterStartMinutes,
    encounterMinutes,
    feedbackMinutes,
    transitionMinutes,
    roundLengthMinutes,
    availableMinutesPerDate,
    requiredRounds,
    availableRounds,
    availableRoundsPerDate,
    scheduledRounds,
    availableLearnerSlots,
    scheduledLearnerSlots,
    scheduledLearners,
    unscheduledLearners,
    emptySlotsInFinalRound,
    hasConflict,
    requiredEndMinutes,
    requiredEndTime: formatScheduleClockFromMinutes(requiredEndMinutes),
  };
}

export function getScheduleCapacityConflictMessage(capacity: ScheduleCapacityResult) {
  if (!capacity.hasConflict) return "";
  return `Schedule capacity conflict: ${capacity.learnerCount} learners require ${capacity.requiredRounds} rounds, but this time window supports only ${capacity.availableRounds} rounds / ${capacity.availableLearnerSlots} learner slots. ${capacity.unscheduledLearners} learners are unscheduled.`;
}

export function getScheduleCapacitySuggestionText(capacity: ScheduleCapacityResult) {
  const extendEnd = capacity.requiredEndTime ? `extend end time to ${capacity.requiredEndTime}` : "extend the end time";
  return `Suggested fixes: ${extendEnd}, adjust students per room, remove or reduce transition time, reduce student count, add rooms, or shorten encounter/feedback timing.`;
}

export function getScheduleCapacitySuggestedActions(capacity: ScheduleCapacityResult): ScheduleCapacitySuggestedAction[] {
  if (!capacity.hasConflict) return [];

  const actions: ScheduleCapacitySuggestedAction[] = [];
  if (capacity.requiredEndTime) {
    actions.push({
      key: "extend_end_time",
      label: `Extend end time to ${capacity.requiredEndTime}`,
      detail: "Updates Event Settings end time so the current learner count can fit.",
    });
  }

  actions.push(
    {
      key: "adjust_students_per_room",
      label: "Adjust students per room",
      detail: "Review the room capacity setting used for schedule generation.",
    },
    {
      key: "regenerate_schedule",
      label: "Regenerate schedule from Event Settings",
      detail: "Open the schedule builder so saved rounds can be refreshed.",
    },
    {
      key: "review_timing",
      label: "Review timing settings",
      detail: "Open setup details for start time, end time, prebrief, encounter, feedback, and transition timing.",
    }
  );

  return actions;
}
