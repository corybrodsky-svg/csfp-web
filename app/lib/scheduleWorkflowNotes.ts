const CFSP_TRAINING_METADATA_START = "[CFSP_TRAINING_METADATA]";
const CFSP_TRAINING_METADATA_END = "[/CFSP_TRAINING_METADATA]";
const CFSP_TRAINING_METADATA_PATTERN = /\[CFSP_TRAINING_METADATA\][\s\S]*?\[\/CFSP_TRAINING_METADATA\]/g;

const OVERSIZED_SCHEDULE_METADATA_KEYS = new Set([
  "schedule_builder_snapshot",
  "schedule_builder_days",
  "resolvedrounds",
  "resolved_rounds",
  "schedule_resolved_rounds",
]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isOversizedScheduleMetadataLine(line: string) {
  const trimmed = line.trim();
  const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
  if (match && OVERSIZED_SCHEDULE_METADATA_KEYS.has(match[1].toLowerCase())) return true;
  return /\b(schedule_builder_snapshot|schedule_builder_days|resolvedRounds|resolved_rounds|schedule_resolved_rounds)\b/.test(trimmed);
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
  if (text.length > 400_000) return true;
  return /\b(schedule_builder_snapshot|schedule_builder_days|resolvedRounds|resolved_rounds|schedule_resolved_rounds)\b/.test(text);
}
