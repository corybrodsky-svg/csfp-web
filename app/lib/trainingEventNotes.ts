export type TrainingEventMetadata = {
  training_required: string;
  training_ownership: string;
  training_scheduling_status: string;
  training_date: string;
  training_start_time: string;
  training_end_time: string;
  event_session_date: string;
  event_start_time: string;
  event_end_time: string;
  preferred_training_date: string;
  preferred_training_time: string;
  preferred_training_end_time: string;
  faculty_availability_unknown: string;
  training_zoom_required: string;
  training_zoom_link: string;
  training_recording_planned: string;
  faculty_training_coordination_requested: string;
  faculty_training_coordination_status: string;
  faculty_training_coordination_requested_at: string;
  zoom_url: string;
  training_password: string;
  training_recording_url: string;
  training_recording_status: string;
  training_attendance_status: string;
  recording_url: string;
  recording_status: string;
  case_name: string;
  case_file_url: string;
  case_file_name: string;
  case_file_storage_path: string;
  case_file_uploaded_at: string;
  case_file_uploaded_by: string;
  doorsign_url: string;
  doorsign_file_url: string;
  doorsign_file_name: string;
  doorsign_storage_path: string;
  doorsign_uploaded_at: string;
  doorsign_uploaded_by: string;
  faculty_schedule_file_url: string;
  student_roster_file_url: string;
  additional_materials: string;
  supplemental_doc_url: string;
  supplemental_doc_name: string;
  supplemental_doc_storage_path: string;
  supplemental_doc_uploaded_at: string;
  supplemental_doc_uploaded_by: string;
  staffing_doc_url: string;
  staffing_doc_name: string;
  staffing_doc_storage_path: string;
  staffing_doc_uploaded_at: string;
  staffing_doc_uploaded_by: string;
  faculty_names: string;
  faculty_program: string;
  faculty_email: string;
  faculty_phone: string;
  sim_contact: string;
  contact_internal_notes: string;
  training_notes: string;
  rotation_schedule_status: string;
  schedule_started_at: string;
  schedule_last_saved_at: string;
  schedule_updated_at: string;
  schedule_completed_at: string;
  schedule_status: string;
  schedule_completed_by: string;
  schedule_learner_count: string;
  schedule_room_count: string;
  schedule_round_count: string;
  schedule_preview_enabled_for_sps: string;
  live_room_adjustments: string;
  live_mode_started_at: string;
  live_mode_ended_at: string;
  live_alerts_acknowledged: string;
  live_flow_status: string;
  modality: string;
  workflow_manual_checks: string;
  email_status: string;
  email_sent_at: string;
  email_draft_opened_at: string;
  hiring_email_drafted_at: string;
  hiring_email_sent_at: string;
  hiring_email_sent_or_marked_at: string;
  confirmation_email_drafted_at: string;
  confirmation_email_sent_at: string;
  confirmation_email_sent_or_marked_at: string;
  last_email_workflow_type: string;
  last_email_recipient_count: string;
  staffing_status: string;
  include_backups_in_email: string;
  selected_hiring_sp_ids: string;
  event_material_status: string;
  imported_event_info_at: string;
  imported_event_info_count: string;
  imported_training_date: string;
  imported_training_time: string;
  imported_event_times: string;
  imported_event_dates_count: string;
  sp_report_call_time: string;
  sp_release_end_time: string;
  hiring_window_label: string;
  linked_event_id: string;
  linked_event_title: string;
  signal_type: string;
  attachment_metadata: string;
  acknowledged_by: string;
};

const TRAINING_METADATA_START = "[CFSP_TRAINING_METADATA]";
const TRAINING_METADATA_END = "[/CFSP_TRAINING_METADATA]";

const TRAINING_METADATA_KEYS = [
  "training_required",
  "training_ownership",
  "training_scheduling_status",
  "training_date",
  "training_start_time",
  "training_end_time",
  "event_session_date",
  "event_start_time",
  "event_end_time",
  "preferred_training_date",
  "preferred_training_time",
  "preferred_training_end_time",
  "faculty_availability_unknown",
  "training_zoom_required",
  "training_zoom_link",
  "training_recording_planned",
  "faculty_training_coordination_requested",
  "faculty_training_coordination_status",
  "faculty_training_coordination_requested_at",
  "zoom_url",
  "training_password",
  "training_recording_url",
  "training_recording_status",
  "training_attendance_status",
  "recording_url",
  "recording_status",
  "case_name",
  "case_file_url",
  "case_file_name",
  "case_file_storage_path",
  "case_file_uploaded_at",
  "case_file_uploaded_by",
  "doorsign_url",
  "doorsign_file_url",
  "doorsign_file_name",
  "doorsign_storage_path",
  "doorsign_uploaded_at",
  "doorsign_uploaded_by",
  "faculty_schedule_file_url",
  "student_roster_file_url",
  "additional_materials",
  "supplemental_doc_url",
  "supplemental_doc_name",
  "supplemental_doc_storage_path",
  "supplemental_doc_uploaded_at",
  "supplemental_doc_uploaded_by",
  "staffing_doc_url",
  "staffing_doc_name",
  "staffing_doc_storage_path",
  "staffing_doc_uploaded_at",
  "staffing_doc_uploaded_by",
  "faculty_names",
  "faculty_program",
  "faculty_email",
  "faculty_phone",
  "sim_contact",
  "contact_internal_notes",
  "training_notes",
  "rotation_schedule_status",
  "schedule_started_at",
  "schedule_last_saved_at",
  "schedule_updated_at",
  "schedule_completed_at",
  "schedule_status",
  "schedule_completed_by",
  "schedule_learner_count",
  "schedule_room_count",
  "schedule_round_count",
  "schedule_preview_enabled_for_sps",
  "live_room_adjustments",
  "live_mode_started_at",
  "live_mode_ended_at",
  "live_alerts_acknowledged",
  "live_flow_status",
  "modality",
  "workflow_manual_checks",
  "email_status",
  "email_sent_at",
  "email_draft_opened_at",
  "hiring_email_drafted_at",
  "hiring_email_sent_at",
  "hiring_email_sent_or_marked_at",
  "confirmation_email_drafted_at",
  "confirmation_email_sent_at",
  "confirmation_email_sent_or_marked_at",
  "last_email_workflow_type",
  "last_email_recipient_count",
  "staffing_status",
  "include_backups_in_email",
  "selected_hiring_sp_ids",
  "event_material_status",
  "imported_event_info_at",
  "imported_event_info_count",
  "imported_training_date",
  "imported_training_time",
  "imported_event_times",
  "imported_event_dates_count",
  "sp_report_call_time",
  "sp_release_end_time",
  "hiring_window_label",
  "linked_event_id",
  "linked_event_title",
  "signal_type",
  "attachment_metadata",
  "acknowledged_by",
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
    training_required: "",
    training_ownership: "",
    training_scheduling_status: "",
    training_date: "",
    training_start_time: "",
    training_end_time: "",
    event_session_date: "",
    event_start_time: "",
    event_end_time: "",
    preferred_training_date: "",
    preferred_training_time: "",
    preferred_training_end_time: "",
    faculty_availability_unknown: "",
    training_zoom_required: "",
    training_zoom_link: "",
    training_recording_planned: "",
    faculty_training_coordination_requested: "",
    faculty_training_coordination_status: "",
    faculty_training_coordination_requested_at: "",
    zoom_url: "",
    training_password: "",
    training_recording_url: "",
    training_recording_status: "",
    training_attendance_status: "",
    recording_url: "",
    recording_status: "",
    case_name: "",
    case_file_url: "",
    case_file_name: "",
    case_file_storage_path: "",
    case_file_uploaded_at: "",
    case_file_uploaded_by: "",
    doorsign_url: "",
    doorsign_file_url: "",
    doorsign_file_name: "",
    doorsign_storage_path: "",
    doorsign_uploaded_at: "",
    doorsign_uploaded_by: "",
    faculty_schedule_file_url: "",
    student_roster_file_url: "",
    additional_materials: "",
    supplemental_doc_url: "",
    supplemental_doc_name: "",
    supplemental_doc_storage_path: "",
    supplemental_doc_uploaded_at: "",
    supplemental_doc_uploaded_by: "",
    staffing_doc_url: "",
    staffing_doc_name: "",
    staffing_doc_storage_path: "",
    staffing_doc_uploaded_at: "",
    staffing_doc_uploaded_by: "",
    faculty_names: "",
    faculty_program: "",
    faculty_email: "",
    faculty_phone: "",
    sim_contact: "",
    contact_internal_notes: "",
    training_notes: "",
    rotation_schedule_status: "",
    schedule_started_at: "",
    schedule_last_saved_at: "",
    schedule_updated_at: "",
    schedule_completed_at: "",
    schedule_status: "",
    schedule_completed_by: "",
    schedule_learner_count: "",
    schedule_room_count: "",
    schedule_round_count: "",
    schedule_preview_enabled_for_sps: "",
    live_room_adjustments: "",
    live_mode_started_at: "",
    live_mode_ended_at: "",
    live_alerts_acknowledged: "",
    live_flow_status: "",
    modality: "",
    workflow_manual_checks: "",
    email_status: "",
    email_sent_at: "",
    email_draft_opened_at: "",
    hiring_email_drafted_at: "",
    hiring_email_sent_at: "",
    hiring_email_sent_or_marked_at: "",
    confirmation_email_drafted_at: "",
    confirmation_email_sent_at: "",
    confirmation_email_sent_or_marked_at: "",
    last_email_workflow_type: "",
    last_email_recipient_count: "",
    staffing_status: "",
    include_backups_in_email: "",
    selected_hiring_sp_ids: "",
    event_material_status: "",
    imported_event_info_at: "",
    imported_event_info_count: "",
    imported_training_date: "",
    imported_training_time: "",
    imported_event_times: "",
    imported_event_dates_count: "",
    sp_report_call_time: "",
    sp_release_end_time: "",
    hiring_window_label: "",
    linked_event_id: "",
    linked_event_title: "",
    signal_type: "",
    attachment_metadata: "",
    acknowledged_by: "",
  };
}

export function getTrainingMetadataBlock(notes?: string | null) {
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
  const block = getTrainingMetadataBlock(notes);
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
