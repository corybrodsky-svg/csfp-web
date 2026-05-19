export type RoundAnnouncementBlock = {
  label: string;
  start: number;
  end: number;
};

export type RoundAnnouncementRound = {
  key?: string;
  round?: number | string;
  start: number;
  end: number;
  subBlocks?: RoundAnnouncementBlock[];
};

export type RoundAnnouncementItem = {
  key: string;
  timeMinutes: number;
  timeLabel: string;
  badgeLabel: string;
  message: string;
  detail?: string;
};

type RoundAnnouncementOptions = {
  formatTime: (minutes: number) => string;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isFiniteMinute(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getBlockDurationMinutes(block: RoundAnnouncementBlock) {
  return Math.max(block.end - block.start, 0);
}

function formatDuration(minutes: number) {
  const rounded = Math.max(0, Math.floor(minutes));
  return `${rounded} minute${rounded === 1 ? "" : "s"}`;
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

function normalizeRoundBlocks(round: RoundAnnouncementRound) {
  const roundStart = round.start;
  const roundEnd = Math.max(round.end, round.start);
  return (round.subBlocks || [])
    .filter((block) => isFiniteMinute(block.start) && isFiniteMinute(block.end) && block.end >= block.start)
    .filter((block) => block.start >= roundStart - 1 && block.start <= roundEnd + 1)
    .sort((a, b) => a.start - b.start || a.end - b.end || asText(a.label).localeCompare(asText(b.label)));
}

export function buildRoundAnnouncementItems(
  round: RoundAnnouncementRound,
  nextRound: RoundAnnouncementRound | null | undefined,
  options: RoundAnnouncementOptions
) {
  if (!isFiniteMinute(round.start) || !isFiniteMinute(round.end) || round.end <= round.start) {
    return [] as RoundAnnouncementItem[];
  }

  const roundKey = asText(round.key) || `round-${asText(round.round) || "selected"}`;
  const blocks = normalizeRoundBlocks(round);
  const roundEnd = Math.max(round.end, round.start);
  const encounterBlock =
    blocks.find((block) => isEncounterLabel(block.label)) ||
    ({
      label: "Encounter",
      start: round.start,
      end: roundEnd,
    } satisfies RoundAnnouncementBlock);
  const feedbackBlock = blocks.find(
    (block) => isFeedbackLabel(block.label) && block.start >= encounterBlock.end - 1 && block.start <= roundEnd + 1
  );
  const transitionBlock = blocks.find(
    (block) =>
      isTransitionLabel(block.label) &&
      block.start >= (feedbackBlock?.end ?? encounterBlock.end) - 1 &&
      block.start <= roundEnd + 1
  );
  const feedbackStart = feedbackBlock?.start ?? encounterBlock.end;
  const returnTime = transitionBlock?.start ?? feedbackBlock?.end ?? roundEnd;
  const hasNextRound = Boolean(nextRound && isFiniteMinute(nextRound.start) && nextRound.start >= round.start);
  const nextRoundStart = hasNextRound && nextRound ? nextRound.start : roundEnd;
  const items: RoundAnnouncementItem[] = [];
  const pushItem = (
    key: string,
    timeMinutes: number,
    badgeLabel: string,
    message: string,
    detail?: string
  ) => {
    if (!isFiniteMinute(timeMinutes)) return;
    items.push({
      key: `${roundKey}-${key}`,
      timeMinutes,
      timeLabel: options.formatTime(timeMinutes),
      badgeLabel,
      message,
      detail,
    });
  };

  pushItem(
    "prepare",
    encounterBlock.start - 1,
    "Prepare",
    "SPs, please prepare.",
    "1 minute before encounter start"
  );
  pushItem("start", encounterBlock.start, "Start", "You may now begin your encounter.");

  const warningTime = encounterBlock.end - 5;
  if (warningTime > encounterBlock.start) {
    pushItem("warning", warningTime, "5-Min Warning", "You have 5 minutes remaining in your encounter.");
  }

  pushItem(
    "feedback-start",
    feedbackStart,
    "Feedback",
    "Encounter has ended. SPs, please begin feedback.",
    feedbackBlock
      ? `${formatDuration(getBlockDurationMinutes(feedbackBlock))} feedback window`
      : "Feedback timing not configured; using encounter end."
  );

  if (returnTime > feedbackStart || transitionBlock) {
    pushItem(
      "return-transition",
      returnTime,
      "Return/Transition",
      "Students, return to Main Room / transition to next assignment.",
      transitionBlock
        ? `${options.formatTime(transitionBlock.start)} - ${options.formatTime(transitionBlock.end)} transition`
        : feedbackBlock
          ? "Feedback window ends."
          : "Round transition."
    );
  }

  if (nextRoundStart >= round.start) {
    pushItem(
      "next-round",
      nextRoundStart,
      hasNextRound ? "Next Round" : "Round End",
      hasNextRound ? "Next round begins." : "Round ends.",
      hasNextRound ? "Next scheduled round start." : "Round end."
    );
  }

  const seen = new Set<string>();
  return items
    .sort((a, b) => a.timeMinutes - b.timeMinutes || a.badgeLabel.localeCompare(b.badgeLabel))
    .filter((item) => {
      const key = `${item.timeMinutes}|${item.badgeLabel}|${item.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
