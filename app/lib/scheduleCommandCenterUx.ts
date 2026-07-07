function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getNameList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asText(item)).filter(Boolean);
  }
  const text = asText(value);
  return text ? [text] : [];
}

function isBooleanLikeCaseFlag(value: string) {
  return /^(yes|no|true|false|1|0)$/i.test(value);
}

export function shouldShowManualLearnerEntry(args: {
  hasImportedLearnerRoster: boolean;
  manuallyOpened: boolean;
}) {
  return !args.hasImportedLearnerRoster || args.manuallyOpened;
}

export function getSchedulePreviewLearnerDisplayText(
  learnerLabels: unknown,
  options: {
    learnerRosterImported: boolean;
    fallbackLearnerLabels?: unknown;
    summary?: boolean;
  }
) {
  const labels = getNameList(learnerLabels);
  const fallbackLabels = getNameList(options.fallbackLearnerLabels);
  const displayLabels = labels.length ? labels : fallbackLabels;

  if (displayLabels.length) {
    return options.summary
      ? `${displayLabels.length} learner${displayLabels.length === 1 ? "" : "s"}`
      : displayLabels.join(", ");
  }

  return options.learnerRosterImported ? "Learners not assigned yet" : "Learner roster not imported";
}

export function getSchedulePreviewCaseDisplayText(caseLabel: unknown, fallbackCaseLabel: unknown) {
  const label = asText(caseLabel);
  const displayLabel = label && !isBooleanLikeCaseFlag(label) ? label : "";
  return displayLabel || asText(fallbackCaseLabel) || "Case not assigned yet";
}
