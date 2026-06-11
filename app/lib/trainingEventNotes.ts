export type TrainingEventMetadata = {
  canonical_event_type: string;
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
  training_faculty_availability_unknown: string;
  training_zoom_required: string;
  training_zoom_link: string;
  training_recording_planned: string;
  training_request_faculty_availability: string;
  faculty_training_coordination_requested: string;
  faculty_training_coordination_status: string;
  faculty_training_coordination_requested_at: string;
  faculty_request_sent_at: string;
  zoom_url: string;
  training_password: string;
  virtual_access: string;
  training_recording_url: string;
  training_recording_status: string;
  training_attendance_status: string;
  completed_schedule: string;
  av_support_required: string;
  sim_tech_required: string;
  recording_monitor_needed: string;
  recording_url: string;
  recording_status: string;
  event_recording_enabled: string;
  event_recording_required: string;
  event_recording_status: string;
  event_recording_url: string;
  event_recording_notes: string;
  case_name: string;
  case_file_url: string;
  case_file_name: string;
  case_file_storage_path: string;
  case_file_uploaded_at: string;
  case_file_uploaded_by: string;
  case_files: string;
  case_manager_cases: string;
  case_count: string;
  case_roles_per_case: string;
  case_rotation_required: string;
  case_fixed_rooms: string;
  case_extra_rooms_mode: string;
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
  schedule_room_capacity: string;
  schedule_encounter_minutes: string;
  schedule_checklist_enabled: string;
  schedule_checklist_minutes: string;
  schedule_checklist_placement: string;
  schedule_feedback_minutes: string;
  schedule_transition_minutes: string;
  prebrief_enabled: string;
  prebrief_length_minutes: string;
  prebrief_location: string;
  schedule_flex_capacity: string;
  schedule_faculty_prebrief_minutes: string;
  schedule_round_target_minutes: string;
  schedule_learner_roster: string;
  schedule_structure_signature: string;
  schedule_builder_snapshot: string;
  schedule_room_adjustments: string;
  schedule_preview_enabled_for_sps: string;
  sp_portal_arrival_instructions: string;
  sp_portal_training_instructions: string;
  sp_portal_event_note: string;
  sp_portal_role_case_note: string;
  sp_portal_release_arrival_instructions: string;
  sp_portal_release_location: string;
  sp_portal_release_virtual_access: string;
  sp_portal_release_training_details: string;
  sp_portal_release_role_case: string;
  sp_portal_release_case_files: string;
  sp_portal_release_training_materials: string;
  live_room_adjustments: string;
  live_learner_attendance: string;
  schedule_repair_backup_snapshot: string;
  schedule_repair_backup_days: string;
  schedule_repair_backup_adjustments: string;
  schedule_repair_backup_attendance: string;
  schedule_repair_applied_at: string;
  schedule_repair_applied_by: string;
  schedule_repair_note: string;
  announcement_cue_overrides: string;
  announcement_cue_state: string;
  announcement_alert_settings: string;
  live_mode_started_at: string;
  live_mode_ended_at: string;
  live_alerts_acknowledged: string;
  live_flow_status: string;
  modality: string;
  workflow_manual_checks: string;
  email_status: string;
  email_sent_at: string;
  email_draft_opened_at: string;
  communications_status: string;
  communication_recipient_verifications: string;
  hiring_email_drafted_at: string;
  hiring_email_sent_at: string;
  hiring_email_sent_or_marked_at: string;
  hiring_email_recipient_snapshot: string;
  confirmation_email_drafted_at: string;
  confirmation_email_sent_at: string;
  confirmation_email_sent_or_marked_at: string;
  confirmation_email_recipient_snapshot: string;
  faculty_training_date_email_recipient_snapshot: string;
  faculty_training_date_email_drafted_at: string;
  faculty_training_date_email_sent_at: string;
  student_list_request_status: string;
  student_list_request_drafted_at: string;
  student_list_request_faculty_email: string;
  student_list_request_email_subject: string;
  last_email_workflow_type: string;
  last_email_recipient_count: string;
  staffing_status: string;
  backups_required: string;
  backup_count: string;
  include_backups_in_email: string;
  selected_hiring_sp_ids: string;
  sp_poll_builder_state: string;
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
  parent_event_id: string;
  follow_up_of_event_id: string;
  follow_up_created_at: string;
  follow_up_created_by: string;
  copied_from_event_name: string;
  follow_up_event_ids: string;
  follow_up_event_titles: string;
  signal_type: string;
  related_events_hidden: string;
  related_events_confirmed: string;
  attachment_metadata: string;
  schedule_builder_days: string;
  student_instructions_config: string;
  faculty_simops_instructions_config: string;
  acknowledged_by: string;
};

export type CommunicationTemplateStatusKey =
  | "sp_hiring_poll_email"
  | "availability_poll_closed_email"
  | "hire_confirmation_email"
  | "prep_for_training_email"
  | "post_training_pre_event_email"
  | "sp_cancellation_email"
  | "post_event_payroll_email"
  | "faculty_training_date_email";

export type CommunicationTemplateStatusValue =
  | "needs_info"
  | "ready_to_draft"
  | "drafted"
  | "sent"
  | "completed"
  | "not_needed";

export type ParsedCommunicationTemplateStatuses = Partial<
  Record<CommunicationTemplateStatusKey, CommunicationTemplateStatusValue>
>;

const COMMUNICATION_TEMPLATE_STATUS_KEYS = [
  "sp_hiring_poll_email",
  "availability_poll_closed_email",
  "hire_confirmation_email",
  "prep_for_training_email",
  "post_training_pre_event_email",
  "sp_cancellation_email",
  "post_event_payroll_email",
  "faculty_training_date_email",
] as const satisfies readonly CommunicationTemplateStatusKey[];

function isCommunicationTemplateStatusValue(value: unknown): value is CommunicationTemplateStatusValue {
  return value === "needs_info"
    || value === "ready_to_draft"
    || value === "drafted"
    || value === "sent"
    || value === "completed"
    || value === "not_needed";
}

export function parseCommunicationTemplateStatuses(value?: string | null): ParsedCommunicationTemplateStatuses {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const next: ParsedCommunicationTemplateStatuses = {};
    const rawEntries = Object.entries(parsed as Record<string, unknown>);

    rawEntries.forEach(([rawKey, rawValue]) => {
      if (!(COMMUNICATION_TEMPLATE_STATUS_KEYS as readonly string[]).includes(rawKey)) return;
      if (!isCommunicationTemplateStatusValue(rawValue)) return;
      next[rawKey as CommunicationTemplateStatusKey] = rawValue;
    });

    return next;
  } catch {
    return {};
  }
}

export function serializeCommunicationTemplateStatuses(
  value: ParsedCommunicationTemplateStatuses
): string {
  const cleaned: ParsedCommunicationTemplateStatuses = {};

  COMMUNICATION_TEMPLATE_STATUS_KEYS.forEach((key) => {
    const nextValue = value?.[key];
    if (isCommunicationTemplateStatusValue(nextValue)) {
      cleaned[key] = nextValue;
    }
  });

  return JSON.stringify(cleaned);
}

const TRAINING_METADATA_START = "[CFSP_TRAINING_METADATA]";
const TRAINING_METADATA_END = "[/CFSP_TRAINING_METADATA]";

const TRAINING_METADATA_KEYS = [
  "canonical_event_type",
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
  "training_faculty_availability_unknown",
  "training_zoom_required",
  "training_zoom_link",
  "training_recording_planned",
  "training_request_faculty_availability",
  "faculty_training_coordination_requested",
  "faculty_training_coordination_status",
  "faculty_training_coordination_requested_at",
  "faculty_request_sent_at",
  "zoom_url",
  "training_password",
  "virtual_access",
  "training_recording_url",
  "training_recording_status",
  "training_attendance_status",
  "completed_schedule",
  "av_support_required",
  "sim_tech_required",
  "recording_monitor_needed",
  "recording_url",
  "recording_status",
  "event_recording_enabled",
  "event_recording_required",
  "event_recording_status",
  "event_recording_url",
  "event_recording_notes",
  "case_name",
  "case_file_url",
  "case_file_name",
  "case_file_storage_path",
  "case_file_uploaded_at",
  "case_file_uploaded_by",
  "case_files",
  "case_manager_cases",
  "case_count",
  "case_roles_per_case",
  "case_rotation_required",
  "case_fixed_rooms",
  "case_extra_rooms_mode",
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
  "schedule_room_capacity",
  "schedule_encounter_minutes",
  "schedule_checklist_enabled",
  "schedule_checklist_minutes",
  "schedule_checklist_placement",
  "schedule_feedback_minutes",
  "schedule_transition_minutes",
  "prebrief_enabled",
  "prebrief_length_minutes",
  "prebrief_location",
  "schedule_flex_capacity",
  "schedule_faculty_prebrief_minutes",
  "schedule_round_target_minutes",
  "schedule_learner_roster",
  "schedule_structure_signature",
  "schedule_builder_snapshot",
  "schedule_room_adjustments",
  "schedule_preview_enabled_for_sps",
  "sp_portal_arrival_instructions",
  "sp_portal_training_instructions",
  "sp_portal_event_note",
  "sp_portal_role_case_note",
  "sp_portal_release_arrival_instructions",
  "sp_portal_release_location",
  "sp_portal_release_virtual_access",
  "sp_portal_release_training_details",
  "sp_portal_release_role_case",
  "sp_portal_release_case_files",
  "sp_portal_release_training_materials",
  "live_room_adjustments",
  "live_learner_attendance",
  "schedule_repair_backup_snapshot",
  "schedule_repair_backup_days",
  "schedule_repair_backup_adjustments",
  "schedule_repair_backup_attendance",
  "schedule_repair_applied_at",
  "schedule_repair_applied_by",
  "schedule_repair_note",
  "announcement_cue_overrides",
  "announcement_cue_state",
  "announcement_alert_settings",
  "live_mode_started_at",
  "live_mode_ended_at",
  "live_alerts_acknowledged",
  "live_flow_status",
  "modality",
  "workflow_manual_checks",
  "email_status",
  "email_sent_at",
  "email_draft_opened_at",
  "communications_status",
  "communication_recipient_verifications",
  "hiring_email_drafted_at",
  "hiring_email_sent_at",
  "hiring_email_sent_or_marked_at",
  "hiring_email_recipient_snapshot",
  "confirmation_email_drafted_at",
  "confirmation_email_sent_at",
  "confirmation_email_sent_or_marked_at",
  "confirmation_email_recipient_snapshot",
  "faculty_training_date_email_recipient_snapshot",
  "faculty_training_date_email_drafted_at",
  "faculty_training_date_email_sent_at",
  "student_list_request_status",
  "student_list_request_drafted_at",
  "student_list_request_faculty_email",
  "student_list_request_email_subject",
  "last_email_workflow_type",
  "last_email_recipient_count",
  "staffing_status",
  "backups_required",
  "backup_count",
  "include_backups_in_email",
  "selected_hiring_sp_ids",
  "sp_poll_builder_state",
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
  "parent_event_id",
  "follow_up_of_event_id",
  "follow_up_created_at",
  "follow_up_created_by",
  "copied_from_event_name",
  "follow_up_event_ids",
  "follow_up_event_titles",
  "signal_type",
  "related_events_hidden",
  "related_events_confirmed",
  "attachment_metadata",
  "schedule_builder_days",
  "student_instructions_config",
  "faculty_simops_instructions_config",
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
    canonical_event_type: "",
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
    training_faculty_availability_unknown: "",
    training_zoom_required: "",
    training_zoom_link: "",
    training_recording_planned: "",
    training_request_faculty_availability: "",
    faculty_training_coordination_requested: "",
    faculty_training_coordination_status: "",
    faculty_training_coordination_requested_at: "",
    faculty_request_sent_at: "",
    zoom_url: "",
    training_password: "",
    virtual_access: "",
    training_recording_url: "",
    training_recording_status: "",
    training_attendance_status: "",
    completed_schedule: "",
    av_support_required: "",
    sim_tech_required: "",
    recording_monitor_needed: "",
    recording_url: "",
    recording_status: "",
    event_recording_enabled: "",
    event_recording_required: "",
    event_recording_status: "",
    event_recording_url: "",
    event_recording_notes: "",
    case_name: "",
    case_file_url: "",
    case_file_name: "",
    case_file_storage_path: "",
    case_file_uploaded_at: "",
    case_file_uploaded_by: "",
    case_files: "",
    case_manager_cases: "",
    case_count: "",
    case_roles_per_case: "",
    case_rotation_required: "",
    case_fixed_rooms: "",
    case_extra_rooms_mode: "",
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
    schedule_room_capacity: "",
    schedule_encounter_minutes: "",
    schedule_checklist_enabled: "",
    schedule_checklist_minutes: "",
    schedule_checklist_placement: "",
    schedule_feedback_minutes: "",
    schedule_transition_minutes: "",
    prebrief_enabled: "",
    prebrief_length_minutes: "",
    prebrief_location: "",
    schedule_flex_capacity: "",
    schedule_faculty_prebrief_minutes: "",
    schedule_round_target_minutes: "",
    schedule_learner_roster: "",
    schedule_structure_signature: "",
    schedule_builder_snapshot: "",
    schedule_room_adjustments: "",
    schedule_preview_enabled_for_sps: "",
    sp_portal_arrival_instructions: "",
    sp_portal_training_instructions: "",
    sp_portal_event_note: "",
    sp_portal_role_case_note: "",
    sp_portal_release_arrival_instructions: "",
    sp_portal_release_location: "",
    sp_portal_release_virtual_access: "",
    sp_portal_release_training_details: "",
    sp_portal_release_role_case: "",
    sp_portal_release_case_files: "",
    sp_portal_release_training_materials: "",
    live_room_adjustments: "",
    live_learner_attendance: "",
    schedule_repair_backup_snapshot: "",
    schedule_repair_backup_days: "",
    schedule_repair_backup_adjustments: "",
    schedule_repair_backup_attendance: "",
    schedule_repair_applied_at: "",
    schedule_repair_applied_by: "",
    schedule_repair_note: "",
    announcement_cue_overrides: "",
    announcement_cue_state: "",
    announcement_alert_settings: "",
    live_mode_started_at: "",
    live_mode_ended_at: "",
    live_alerts_acknowledged: "",
    live_flow_status: "",
    modality: "",
    workflow_manual_checks: "",
    email_status: "",
    email_sent_at: "",
    email_draft_opened_at: "",
    communications_status: "",
    communication_recipient_verifications: "",
    hiring_email_drafted_at: "",
    hiring_email_sent_at: "",
    hiring_email_sent_or_marked_at: "",
    hiring_email_recipient_snapshot: "",
    confirmation_email_drafted_at: "",
    confirmation_email_sent_at: "",
    confirmation_email_sent_or_marked_at: "",
    confirmation_email_recipient_snapshot: "",
    faculty_training_date_email_recipient_snapshot: "",
    faculty_training_date_email_drafted_at: "",
    faculty_training_date_email_sent_at: "",
    student_list_request_status: "",
    student_list_request_drafted_at: "",
    student_list_request_faculty_email: "",
    student_list_request_email_subject: "",
    last_email_workflow_type: "",
    last_email_recipient_count: "",
    staffing_status: "",
    backups_required: "",
    backup_count: "",
    include_backups_in_email: "",
    selected_hiring_sp_ids: "",
    sp_poll_builder_state: "",
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
    parent_event_id: "",
    follow_up_of_event_id: "",
    follow_up_created_at: "",
    follow_up_created_by: "",
    copied_from_event_name: "",
    follow_up_event_ids: "",
    follow_up_event_titles: "",
    signal_type: "",
    related_events_hidden: "",
    related_events_confirmed: "",
    attachment_metadata: "",
    schedule_builder_days: "",
    student_instructions_config: "",
    faculty_simops_instructions_config: "",
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

const TRAINING_METADATA_ALIASES: Record<string, keyof TrainingEventMetadata> = {
  event_requires_training: "training_required",
  faculty_training_owner: "training_ownership",
  include_prebrief: "prebrief_enabled",
  pre_briefing: "prebrief_enabled",
  pre_briefing_enabled: "prebrief_enabled",
  prebriefing_enabled: "prebrief_enabled",
  prebrief_length: "prebrief_length_minutes",
  prebrief_minutes: "prebrief_length_minutes",
  pre_briefing_length: "prebrief_length_minutes",
  prebrief_room: "prebrief_location",
  pre_briefing_location: "prebrief_location",
  preferred_training_start_time: "training_start_time",
  recording_planned: "training_recording_planned",
  request_faculty_availability: "training_request_faculty_availability",
  requires_training: "training_required",
  sp_training_required: "training_required",
  training_owner: "training_ownership",
  training_recording: "training_recording_planned",
  training_required_status: "training_required",
  training_zoom: "training_zoom_required",
  zoom_required: "training_zoom_required",
};

const TRAINING_METADATA_MIRRORS: Partial<Record<keyof TrainingEventMetadata, keyof TrainingEventMetadata>> = {
  faculty_availability_unknown: "training_faculty_availability_unknown",
  faculty_training_coordination_requested: "training_request_faculty_availability",
  preferred_training_date: "training_date",
  preferred_training_end_time: "training_end_time",
  preferred_training_time: "training_start_time",
  schedule_faculty_prebrief_minutes: "prebrief_length_minutes",
};

export function parseTrainingEventMetadata(notes?: string | null) {
  const metadata = emptyTrainingEventMetadata();
  const block = getTrainingMetadataBlock(notes);
  if (!block) return metadata;

  block.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (!match) return;
    const rawKey = match[1].toLowerCase();
    const rawValue = match[2].trim();
    const key = (TRAINING_METADATA_KEYS as readonly string[]).includes(rawKey)
      ? rawKey as keyof TrainingEventMetadata
      : TRAINING_METADATA_ALIASES[rawKey];
    if (!key) return;
    metadata[key] = rawValue;

    const mirrorKey = TRAINING_METADATA_MIRRORS[key];
    if (mirrorKey && !metadata[mirrorKey]) {
      metadata[mirrorKey] = rawValue;
    }
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

export type FacultyTrainingCoordinationState = {
  requested: boolean;
  drafted: boolean;
  sent: boolean;
  status: "not_started" | "drafted" | "requested" | "sent";
  requestedAt: string;
  sentAt: string;
};

export function getFacultyTrainingCoordinationState(
  metadata: TrainingEventMetadata
): FacultyTrainingCoordinationState {
  const coordinationStatus = asText(metadata.faculty_training_coordination_status).toLowerCase();
  const explicitSentAt = asText(metadata.faculty_request_sent_at);
  const requestedAt = asText(metadata.faculty_training_coordination_requested_at) || explicitSentAt;
  const sent =
    Boolean(explicitSentAt) ||
    ["sent", "complete", "completed", "ready"].includes(coordinationStatus);
  const drafted = !sent && coordinationStatus === "draft_opened";
  const requested =
    sent ||
    drafted ||
    ["requested", "request_sent", "awaiting_reply", "in_progress"].includes(coordinationStatus) ||
    asText(metadata.faculty_training_coordination_requested).toLowerCase() === "yes" ||
    Boolean(requestedAt);

  return {
    requested,
    drafted,
    sent,
    status: sent ? "sent" : drafted ? "drafted" : requested ? "requested" : "not_started",
    requestedAt,
    sentAt: explicitSentAt || (sent ? requestedAt : ""),
  };
}
