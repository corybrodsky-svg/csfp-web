const CFSP_TRAINING_METADATA_START = "[CFSP_TRAINING_METADATA]";
const CFSP_TRAINING_METADATA_END = "[/CFSP_TRAINING_METADATA]";
const CFSP_TRAINING_METADATA_PATTERN = /\[CFSP_TRAINING_METADATA\][\s\S]*?\[\/CFSP_TRAINING_METADATA\]/g;

const MAX_SCHEDULE_WORKFLOW_NOTES_LENGTH = 400_000;
const MAX_SCHEDULE_SNAPSHOT_METADATA_VALUE_LENGTH = 180_000;

const PERSISTED_SCHEDULE_SNAPSHOT_METADATA_KEYS = new Set([
  "schedule_builder_snapshot",
  "schedule_builder_days",
]);

const LEGACY_SCHEDULE_METADATA_KEYS = new Set([
  "resolvedrounds",
  "resolved_rounds",
  "schedule_resolved_rounds",
]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseMetadataLine(line: string) {
  const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
  if (!match) return null;
  return {
    key: match[1].toLowerCase(),
    value: asText(match[2]),
  };
}

function isOversizedScheduleMetadataLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const parsed = parseMetadataLine(trimmed);
  if (parsed) {
    if (LEGACY_SCHEDULE_METADATA_KEYS.has(parsed.key)) return true;
    if (PERSISTED_SCHEDULE_SNAPSHOT_METADATA_KEYS.has(parsed.key)) {
      return parsed.value.length > MAX_SCHEDULE_SNAPSHOT_METADATA_VALUE_LENGTH;
    }
  }

  return trimmed.length > MAX_SCHEDULE_SNAPSHOT_METADATA_VALUE_LENGTH &&
    /\b(schedule_builder_snapshot|schedule_builder_days|resolvedRounds|resolved_rounds|schedule_resolved_rounds)\b/i.test(trimmed);
}

function sanitizeTrainingMetadataBlock(block: string) {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== CFSP_TRAINING_METADATA_START && line !== CFSP_TRAINING_METADATA_END)
    .filter((line) => !isOversizedScheduleMetadataLine(line));

  return lines.length
    ? [CFSP_TRAINING_METADATA_START, ...lines, CFSP_TRAINING_METADATA_END].join("\n")
    : "";
}

export function sanitizeScheduleWorkflowNotes(notes?: string | null) {
  const text = asText(notes);
  if (!text) return "";

  const withoutLegacyTrainingPayloads = text.replace(CFSP_TRAINING_METADATA_PATTERN, (block) =>
    sanitizeTrainingMetadataBlock(block)
  );

  return withoutLegacyTrainingPayloads
    .split(/\r?\n/)
    .filter((line) => !isOversizedScheduleMetadataLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasOversizedScheduleWorkflowMetadata(notes?: string | null) {
  const text = asText(notes);
  if (!text) return false;
  if (text.length > MAX_SCHEDULE_WORKFLOW_NOTES_LENGTH) return true;
  return text.split(/\r?\n/).some((line) => isOversizedScheduleMetadataLine(line));
}
