export type TrainingEventMetadata = {
  zoom_url: string;
  recording_url: string;
  case_name: string;
  case_file_url: string;
  case_upload_placeholder: string;
  doorsign_url: string;
  doorsign_upload_placeholder: string;
  faculty_names: string;
  sim_contact: string;
};

const TRAINING_METADATA_START = "[CFSP_TRAINING_METADATA]";
const TRAINING_METADATA_END = "[/CFSP_TRAINING_METADATA]";

const TRAINING_METADATA_KEYS = [
  "zoom_url",
  "recording_url",
  "case_name",
  "case_file_url",
  "case_upload_placeholder",
  "doorsign_url",
  "doorsign_upload_placeholder",
  "faculty_names",
  "sim_contact",
] as const satisfies readonly (keyof TrainingEventMetadata)[];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function emptyTrainingEventMetadata(): TrainingEventMetadata {
  return {
    zoom_url: "",
    recording_url: "",
    case_name: "",
    case_file_url: "",
    case_upload_placeholder: "",
    doorsign_url: "",
    doorsign_upload_placeholder: "",
    faculty_names: "",
    sim_contact: "",
  };
}

function getMetadataBlock(notes?: string | null) {
  const text = asText(notes);
  if (!text) return "";

  const startIndex = text.indexOf(TRAINING_METADATA_START);
  const endIndex = text.indexOf(TRAINING_METADATA_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return "";

  return text
    .slice(startIndex + TRAINING_METADATA_START.length, endIndex)
    .trim();
}

export function parseTrainingEventMetadata(notes?: string | null) {
  const metadata = emptyTrainingEventMetadata();
  const block = getMetadataBlock(notes);
  if (!block) return metadata;

  block.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (!match) return;
    const key = match[1].toLowerCase() as keyof TrainingEventMetadata;
    if (!(TRAINING_METADATA_KEYS as readonly string[]).includes(key)) return;
    metadata[key] = match[2].trim();
  });

  return metadata;
}

export function upsertTrainingEventMetadata(
  notes: string | null | undefined,
  partial: Partial<TrainingEventMetadata>
) {
  const current = parseTrainingEventMetadata(notes);
  const next = {
    ...current,
    ...Object.fromEntries(
      Object.entries(partial).map(([key, value]) => [key, asText(value)])
    ),
  } as TrainingEventMetadata;

  const lines = (TRAINING_METADATA_KEYS as readonly (keyof TrainingEventMetadata)[])
    .map((key) => (next[key] ? `${key}: ${next[key]}` : ""))
    .filter(Boolean);

  const text = asText(notes);
  const withoutExisting = text.replace(
    new RegExp(`\\n?${TRAINING_METADATA_START}[\\s\\S]*?${TRAINING_METADATA_END}\\n?`, "g"),
    "\n"
  ).trim();

  if (!lines.length) return withoutExisting;

  const block = [TRAINING_METADATA_START, ...lines, TRAINING_METADATA_END].join("\n");
  return withoutExisting ? `${block}\n${withoutExisting}` : block;
}

export function hasTrainingMetadataValue(
  metadata: TrainingEventMetadata,
  key: keyof TrainingEventMetadata
) {
  return Boolean(asText(metadata[key]));
}
