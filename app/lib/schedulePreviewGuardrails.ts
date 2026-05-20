export type SchedulePreviewRoomSlot = {
  roomName?: string;
  learnerLabels?: string[];
  assignedSpName?: string;
  backupSpName?: string;
  caseLabel?: string;
  roleId?: string;
  roleLabel?: string;
  notes?: string;
  stationStatus?: "active" | "backup" | "inactive";
  isBackupStation?: boolean;
  roomType?: "exam" | "flex";
  capacity?: number;
};

export type SchedulePreviewRound = {
  round?: number;
  sessionDate?: string;
  startTime?: string;
  endTime?: string;
  roomSlots?: SchedulePreviewRoomSlot[];
};

export type ScheduleRhythmBlock = {
  label: string;
  start: number;
  end: number;
  visibleTo?: "student" | "operations" | "both";
};

export type ScheduleRhythmRound = {
  round: number;
  start: number;
  end: number;
  subBlocks: ScheduleRhythmBlock[];
  roomSlots?: SchedulePreviewRoomSlot[];
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parsePositiveInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseTimeToMinutes(value: unknown) {
  const text = asText(value);
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function formatInputTime(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function blockDuration(block: Pick<ScheduleRhythmBlock, "start" | "end">) {
  return Math.max(0, block.end - block.start);
}

export function formatRoundRhythmBreakdown(round: { subBlocks?: Array<Pick<ScheduleRhythmBlock, "label" | "start" | "end">> }) {
  return (round.subBlocks || [])
    .filter((block) => asText(block.label) && blockDuration(block) > 0)
    .map((block) => `${asText(block.label)} ${blockDuration(block)}m`)
    .join(" · ");
}

export function getExpectedSchedulePreviewRoundCount(snapshot: {
  resolvedRounds?: SchedulePreviewRound[] | null;
  scheduleRoundCount?: unknown;
  roundCount?: unknown;
}) {
  return Math.max(
    Array.isArray(snapshot.resolvedRounds) ? snapshot.resolvedRounds.length : 0,
    parsePositiveInteger(snapshot.scheduleRoundCount, 0),
    parsePositiveInteger(snapshot.roundCount, 0)
  );
}

function cloneRoundSlots(slots: SchedulePreviewRoomSlot[] | undefined) {
  return (slots || []).map((slot) => ({
    ...slot,
    learnerLabels: Array.isArray(slot.learnerLabels) ? [...slot.learnerLabels] : [],
  }));
}

function cloneResolvedRound(round: SchedulePreviewRound, roundNumber: number, rhythmRound?: ScheduleRhythmRound | null): SchedulePreviewRound {
  const sourceStart = parseTimeToMinutes(round.startTime);
  const sourceEnd = parseTimeToMinutes(round.endTime);
  const duration = rhythmRound
    ? Math.max(1, rhythmRound.end - rhythmRound.start)
    : sourceStart !== null && sourceEnd !== null
      ? Math.max(1, sourceEnd < sourceStart ? sourceEnd + 1440 - sourceStart : sourceEnd - sourceStart)
      : 1;
  const baseRoundNumber = parsePositiveInteger(round.round, 1);
  const start = rhythmRound?.start ?? ((sourceStart ?? 0) + (roundNumber - baseRoundNumber) * duration);
  const end = rhythmRound?.end ?? start + duration;

  return {
    ...round,
    round: roundNumber,
    startTime: formatInputTime(start),
    endTime: formatInputTime(end),
    roomSlots: cloneRoundSlots(rhythmRound?.roomSlots?.length ? rhythmRound.roomSlots : round.roomSlots),
  };
}

export function expandPartialResolvedRounds(args: {
  resolvedRounds: SchedulePreviewRound[];
  expectedRoundCount: number;
  rhythmRounds?: ScheduleRhythmRound[];
}) {
  const savedRounds = Array.isArray(args.resolvedRounds) ? args.resolvedRounds : [];
  const expectedRoundCount = Math.max(args.expectedRoundCount, savedRounds.length);
  if (!savedRounds.length || savedRounds.length >= expectedRoundCount) {
    return savedRounds.map((round) => ({ ...round, roomSlots: cloneRoundSlots(round.roomSlots) }));
  }

  const savedByRound = new Map(savedRounds.map((round, index) => [parsePositiveInteger(round.round, index + 1), round]));
  const rhythmByRound = new Map((args.rhythmRounds || []).map((round) => [round.round, round]));
  const template = savedRounds[savedRounds.length - 1];

  return Array.from({ length: expectedRoundCount }, (_, index) => {
    const roundNumber = index + 1;
    const savedRound = savedByRound.get(roundNumber);
    if (savedRound) return { ...savedRound, round: roundNumber, roomSlots: cloneRoundSlots(savedRound.roomSlots) };
    return cloneResolvedRound(template, roundNumber, rhythmByRound.get(roundNumber));
  });
}

export function getSchedulePreviewRounds(args: {
  resolvedRounds: SchedulePreviewRound[];
  scheduleRoundCount?: unknown;
  roundCount?: unknown;
  rhythmRounds?: ScheduleRhythmRound[];
}) {
  const expectedRoundCount = getExpectedSchedulePreviewRoundCount({
    resolvedRounds: args.resolvedRounds,
    scheduleRoundCount: args.scheduleRoundCount,
    roundCount: args.roundCount,
  });
  return expandPartialResolvedRounds({
    resolvedRounds: args.resolvedRounds,
    expectedRoundCount,
    rhythmRounds: args.rhythmRounds,
  });
}
