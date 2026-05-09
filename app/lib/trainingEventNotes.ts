export type TrainingEventMetadata = {
  zoom_url: string;
  training_password: string;
  recording_url: string;
  recording_status: string;
  case_name: string;
  case_file_url: string;
  case_file_name: string;
  case_file_storage_path: string;
  case_file_uploaded_at: string;
  case_file_uploaded_by: string;
  doorsign_url: string;
  doorsign_file_name: string;
  doorsign_storage_path: string;
  doorsign_uploaded_at: string;
  doorsign_uploaded_by: string;
  supplemental_doc_url: string;
  supplemental_doc_name: string;
  supplemental_doc_storage_path: string;
  supplemental_doc_uploaded_at: string;
  supplemental_doc_uploaded_by: string;
  faculty_names: string;
  faculty_program: string;
  faculty_email: string;
  faculty_phone: string;
  sim_contact: string;
  contact_internal_notes: string;
  training_notes: string;
  rotation_schedule_status: string;
  modality: string;
  workflow_manual_checks: string;
  email_status: string;
  email_sent_at: string;
  email_draft_opened_at: string;
  imported_event_info_at: string;
  imported_event_info_count: string;
  imported_training_date: string;
  imported_training_time: string;
  imported_event_times: string;
  imported_event_dates_count: string;
};

const TRAINING_METADATA_START = "[CFSP_TRAINING_METADATA]";
const TRAINING_METADATA_END = "[/CFSP_TRAINING_METADATA]";

const TRAINING_METADATA_KEYS = [
  "zoom_url",
  "training_password",
  "recording_url",
  "recording_status",
  "case_name",
  "case_file_url",
  "case_file_name",
  "case_file_storage_path",
  "case_file_uploaded_at",
  "case_file_uploaded_by",
  "doorsign_url",
  "doorsign_file_name",
  "doorsign_storage_path",
  "doorsign_uploaded_at",
  "doorsign_uploaded_by",
  "supplemental_doc_url",
  "supplemental_doc_name",
  "supplemental_doc_storage_path",
  "supplemental_doc_uploaded_at",
  "supplemental_doc_uploaded_by",
  "faculty_names",
  "faculty_program",
  "faculty_email",
  "faculty_phone",
  "sim_contact",
  "contact_internal_notes",
  "training_notes",
  "rotation_schedule_status",
  "modality",
  "workflow_manual_checks",
  "email_status",
  "email_sent_at",
  "email_draft_opened_at",
  "imported_event_info_at",
  "imported_event_info_count",
  "imported_training_date",
  "imported_training_time",
  "imported_event_times",
  "imported_event_dates_count",
] as const satisfies readonly (keyof TrainingEventMetadata)[];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function isMeaningfulTrainingMetadataText(value: unknown) {
  const normalized = asText(value).toLowerCase();
  if (!normalized) return false;
  return !["not assigned", "none", "n/a", "na", "unknown", "unassigned", "tbd"].includes(normalized);
}

export function emptyTrainingEventMetadata(): TrainingEventMetadata {
  return {
    zoom_url: "",
    training_password: "",
    recording_url: "",
    recording_status: "",
    case_name: "",
    case_file_url: "",
    case_file_name: "",
    case_file_storage_path: "",
    case_file_uploaded_at: "",
    case_file_uploaded_by: "",
    doorsign_url: "",
    doorsign_file_name: "",
    doorsign_storage_path: "",
    doorsign_uploaded_at: "",
    doorsign_uploaded_by: "",
    supplemental_doc_url: "",
    supplemental_doc_name: "",
    supplemental_doc_storage_path: "",
    supplemental_doc_uploaded_at: "",
    supplemental_doc_uploaded_by: "",
    faculty_names: "",
    faculty_program: "",
    faculty_email: "",
    faculty_phone: "",
    sim_contact: "",
    contact_internal_notes: "",
    training_notes: "",
    rotation_schedule_status: "",
    modality: "",
    workflow_manual_checks: "",
    email_status: "",
    email_sent_at: "",
    email_draft_opened_at: "",
    imported_event_info_at: "",
    imported_event_info_count: "",
    imported_training_date: "",
    imported_training_time: "",
    imported_event_times: "",
    imported_event_dates_count: "",
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
  return isMeaningfulTrainingMetadataText(metadata[key]);
}
