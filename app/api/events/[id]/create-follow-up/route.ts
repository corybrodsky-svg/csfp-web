import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../../lib/authCookies";
import { parseEventMetadata, upsertEventMetadata } from "../../../../lib/eventMetadata";
import {
  DEFAULT_FOLLOW_UP_COPY_OPTIONS,
  normalizeFollowUpCopyOptions,
  parseFollowUpList,
  serializeFollowUpList,
  stripCfspMetadataBlocks,
  type FollowUpCopyOptions,
} from "../../../../lib/followUpSimulation";
import { getProfileForUser } from "../../../../lib/profileServer";
import { resolveSpAccountLink } from "../../../../lib/spAccountLinking";
import { createSupabaseServerClient } from "../../../../lib/supabaseServerClient";
import {
  parseTrainingEventMetadata,
  type TrainingEventMetadata,
} from "../../../../lib/trainingEventNotes";
import { MINUTES_PER_DAY, formatDisplayTimeFromMinutes, normalizeEndMinutesForRange, parseTimeToMinutes } from "../../../../lib/timeFormat";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNullableText(value: unknown) {
  const text = asText(value);
  return text || null;
}

function parseNullableStoredTime(value: unknown) {
  const minutes = parseTimeToMinutes(asText(value));
  if (minutes === null) return null;
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`;
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "faculty" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "unknown";
}

function isOperatorRole(role: string) {
  return role === "sim_op" || role === "admin" || role === "super_admin";
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  const normalizedRole = normalizeRole(role);

  if (normalizedEmail === "cwb55@drexel.edu" || localPart === "cory.brodsky") {
    if (normalizedRole === "super_admin" || normalizedRole === "admin" || normalizedRole === "sim_op") {
      return normalizedRole;
    }
    return "super_admin";
  }

  return normalizedRole;
}

type ViewerContext = {
  id: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  role: string;
  fullName: string;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

type AuthenticatedUserResult = {
  accessToken: string;
  refreshToken: string;
  user: Awaited<ReturnType<ReturnType<typeof createSupabaseServerClient>["auth"]["getUser"]>>["data"]["user"] | null;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

async function getAuthenticatedUser(): Promise<AuthenticatedUserResult> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value || "";
    const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value || "";

    if (!accessToken && !refreshToken) {
      return { accessToken: "", refreshToken: "", user: null };
    }

    const supabase = createSupabaseServerClient();

    if (accessToken) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (!error && user) {
        return { accessToken, refreshToken, user };
      }
    }

    if (!refreshToken) {
      return { accessToken, refreshToken, user: null, shouldClearCookies: true };
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (error || !refreshedUser || !refreshedAccessToken || !refreshedRefreshToken) {
      return { accessToken, refreshToken, user: null, shouldClearCookies: true };
    }

    return {
      accessToken: refreshedAccessToken,
      refreshToken: refreshedRefreshToken,
      user: refreshedUser,
      refreshedTokens: {
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken,
      },
    };
  } catch {
    return { accessToken: "", refreshToken: "", user: null };
  }
}

async function getAuthenticatedViewer(): Promise<ViewerContext | null> {
  try {
    const auth = await getAuthenticatedUser();
    if (!auth.user) return null;

    const profileResult = await getProfileForUser(auth.user.id, auth.accessToken);
    const profile = profileResult.profile;
    const email = asText(profile?.email) || asText(auth.user.email);
    await resolveSpAccountLink({
      user: auth.user,
      profile: profile || null,
      accessToken: auth.accessToken,
    });

    return {
      id: auth.user.id,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      email,
      role: getEffectiveRole(email, profile?.role || auth.user.user_metadata?.role),
      fullName: asText(profile?.full_name) || asText(auth.user.user_metadata?.full_name),
      refreshedTokens: auth.refreshedTokens,
      shouldClearCookies: auth.shouldClearCookies,
    };
  } catch {
    return null;
  }
}

function applyAuthCookies(response: NextResponse, viewer: ViewerContext | null) {
  if (!viewer) return response;
  if (viewer.refreshedTokens) {
    setAuthCookies(response, viewer.refreshedTokens);
  }
  return response;
}

function unauthorizedResponse(viewer?: ViewerContext | null) {
  const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer?.shouldClearCookies) {
    clearAuthCookies(response);
  }
  return response;
}

type SourceSessionRow = {
  id: string;
  event_id: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  room: string | null;
};

type SourceAssignmentRow = {
  id: string;
  event_id: string | null;
  sp_id: string | null;
  status: string | null;
  assignment_status?: string | null;
  role_name?: string | null;
  confirmed: boolean | null;
  notes: string | null;
};

type FollowUpRequestBody = {
  name?: unknown;
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  location?: unknown;
  status?: unknown;
  visibility?: unknown;
  notes?: unknown;
  copyOptions?: Partial<FollowUpCopyOptions> | null;
  mode?: unknown;
};

type RelatedEventCreationMode = "follow_up" | "duplicate";

const FOLLOW_UP_EXCLUDED_METADATA_BLOCKS = new Set([
  "CFSP_TRAINING_METADATA",
  "CFSP_POLL_METADATA",
  "CFSP_POLL_RESPONSE",
  "CFSP_LIVE_ATTENDANCE",
  "CFSP_QA_CHECKLIST_STATE",
]);

const LEARNER_METADATA_KEYS: Array<keyof TrainingEventMetadata> = [
  "student_roster_file_url",
  "schedule_learner_count",
  "schedule_learner_roster",
];

const CASE_METADATA_KEYS: Array<keyof TrainingEventMetadata> = [
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
];

const MATERIAL_METADATA_KEYS: Array<keyof TrainingEventMetadata> = [
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
  "doorsign_url",
  "doorsign_file_url",
  "doorsign_file_name",
  "doorsign_storage_path",
  "doorsign_uploaded_at",
  "doorsign_uploaded_by",
  "attachment_metadata",
  "student_instructions_config",
  "event_material_status",
  "faculty_schedule_file_url",
];

const TRAINING_REFERENCE_METADATA_KEYS: Array<keyof TrainingEventMetadata> = [
  "training_required",
  "training_ownership",
  "training_zoom_required",
  "training_zoom_link",
  "zoom_url",
  "training_password",
  "training_recording_planned",
  "training_recording_url",
  "training_recording_status",
  "recording_url",
  "recording_status",
  "event_recording_enabled",
  "event_recording_required",
  "event_recording_status",
  "event_recording_url",
  "event_recording_notes",
  "faculty_names",
  "faculty_program",
  "faculty_email",
  "faculty_phone",
  "sim_contact",
  "contact_internal_notes",
  "training_notes",
  "sp_report_call_time",
  "sp_release_end_time",
  "hiring_window_label",
];

const EMAIL_CONTEXT_METADATA_KEYS: Array<keyof TrainingEventMetadata> = [
  "include_backups_in_email",
  "selected_hiring_sp_ids",
];

const FOLLOW_UP_STATE_RESET_METADATA: Partial<TrainingEventMetadata> = {
  event_session_date: "",
  event_start_time: "",
  event_end_time: "",
  preferred_training_date: "",
  preferred_training_time: "",
  preferred_training_end_time: "",
  training_date: "",
  training_start_time: "",
  training_end_time: "",
  training_attendance_status: "",
  rotation_schedule_status: "",
  schedule_started_at: "",
  schedule_last_saved_at: "",
  schedule_updated_at: "",
  schedule_completed_at: "",
  schedule_status: "",
  schedule_completed_by: "",
  schedule_preview_enabled_for_sps: "",
  live_room_adjustments: "",
  live_learner_attendance: "",
  schedule_repair_backup_snapshot: "",
  schedule_repair_backup_days: "",
  schedule_repair_backup_adjustments: "",
  schedule_repair_backup_attendance: "",
  schedule_repair_applied_at: "",
  schedule_repair_applied_by: "",
  schedule_repair_note: "",
  announcement_cue_state: "",
  announcement_alert_settings: "",
  live_mode_started_at: "",
  live_mode_ended_at: "",
  live_alerts_acknowledged: "",
  live_flow_status: "",
  workflow_manual_checks: "",
  email_status: "",
  email_sent_at: "",
  email_draft_opened_at: "",
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
  last_email_workflow_type: "",
  last_email_recipient_count: "",
  staffing_status: "",
  imported_event_info_at: "",
  imported_event_info_count: "",
  imported_training_date: "",
  imported_training_time: "",
  imported_event_times: "",
  imported_event_dates_count: "",
  follow_up_event_ids: "",
  follow_up_event_titles: "",
  acknowledged_by: "",
};

function pickTrainingMetadata(
  source: TrainingEventMetadata,
  keys: Array<keyof TrainingEventMetadata>
) {
  const next: Partial<TrainingEventMetadata> = {};
  keys.forEach((key) => {
    const value = asText(source[key]);
    if (value) next[key] = value;
  });
  return next;
}

function extractCfspMetadataBlocks(notes?: string | null) {
  const blocks = new Map<string, string>();
  const text = asText(notes);
  const pattern = /\[(CFSP_[A-Z0-9_]+)\][\s\S]*?\[\/\1\]/g;
  for (const match of text.matchAll(pattern)) {
    const blockKey = match[1];
    const blockText = match[0];
    if (blockKey && blockText) blocks.set(blockKey, blockText.trim());
  }
  return blocks;
}

function composeFollowUpNotes(args: {
  sourceNotes: string | null;
  visibleNotes: string;
  trainingMetadata: Partial<TrainingEventMetadata>;
}) {
  const nextNotes = upsertEventMetadata(args.visibleNotes, {
    training: args.trainingMetadata,
  });

  const preservedBlocks = Array.from(extractCfspMetadataBlocks(args.sourceNotes).entries())
    .filter(([key]) => !FOLLOW_UP_EXCLUDED_METADATA_BLOCKS.has(key))
    .map(([, value]) => value);

  const visibleSection = stripCfspMetadataBlocks(nextNotes);
  const trainingBlock = extractCfspMetadataBlocks(nextNotes).get("CFSP_TRAINING_METADATA") || "";
  const sections = [trainingBlock, ...preservedBlocks, visibleSection].filter(Boolean);
  return sections.join("\n").trim();
}

function parseEncodedJsonObject(value: string | null | undefined) {
  const text = asText(value);
  if (!text) return null as Record<string, unknown> | null;

  const candidates = [text];
  try {
    candidates.unshift(decodeURIComponent(text));
  } catch {
    // Already plain JSON.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Keep trying legacy variants.
    }
  }

  return null;
}

function encodeJsonObject(value: Record<string, unknown>) {
  return encodeURIComponent(JSON.stringify(value));
}

function shiftClockLabel(value: unknown, deltaMinutes: number) {
  const minutes = parseTimeToMinutes(asText(value));
  if (minutes === null) return asText(value);
  return formatDisplayTimeFromMinutes(minutes + deltaMinutes);
}

function shiftSpecificTime(value: unknown, deltaMinutes: number) {
  const minutes = parseTimeToMinutes(asText(value));
  if (minutes === null) return asText(value);
  const shifted = ((minutes + deltaMinutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(shifted / 60);
  const mins = shifted % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function shiftScheduleSnapshot(args: {
  snapshot: Record<string, unknown>;
  newDate: string;
  targetStartTime: string | null;
  scheduleStatus: "draft" | "complete";
  savedAt: string;
}) {
  const next = JSON.parse(JSON.stringify(args.snapshot)) as Record<string, unknown>;
  const resolvedRounds = Array.isArray(next.resolvedRounds)
    ? (next.resolvedRounds as Array<Record<string, unknown>>)
    : [];
  const originalStartMinutes =
    parseTimeToMinutes(asText(next.startTime)) ||
    parseTimeToMinutes(asText(resolvedRounds[0]?.startTime));
  const targetStartMinutes = parseTimeToMinutes(args.targetStartTime);
  const deltaMinutes =
    originalStartMinutes !== null && targetStartMinutes !== null
      ? targetStartMinutes - originalStartMinutes
      : 0;

  if (targetStartMinutes !== null) {
    next.startTime = formatDisplayTimeFromMinutes(targetStartMinutes);
  }
  next.eventDate = args.newDate || asText(next.eventDate);
  next.scheduleStatus = args.scheduleStatus;
  next.savedAt = args.savedAt;
  if (asText(next.staffArrivalTime)) next.staffArrivalTime = shiftClockLabel(next.staffArrivalTime, deltaMinutes);
  if (asText(next.spArrivalTime)) next.spArrivalTime = shiftClockLabel(next.spArrivalTime, deltaMinutes);
  if (asText(next.facultyArrivalTime)) next.facultyArrivalTime = shiftClockLabel(next.facultyArrivalTime, deltaMinutes);

  if (Array.isArray(next.dayBlocks)) {
    next.dayBlocks = (next.dayBlocks as Array<Record<string, unknown>>).map((block) => ({
      ...block,
      specificTime: asText(block.specificTime) ? shiftSpecificTime(block.specificTime, deltaMinutes) : asText(block.specificTime),
    }));
  }

  next.resolvedRounds = resolvedRounds.map((round) => ({
    ...round,
    sessionDate: args.newDate || asText(round.sessionDate),
    startTime: shiftClockLabel(round.startTime, deltaMinutes),
    endTime: shiftClockLabel(round.endTime, deltaMinutes),
  }));

  return next;
}

function shiftScheduleBuilderDays(
  rawValue: string | null | undefined,
  options: {
    newDate: string;
    targetStartTime: string | null;
    scheduleStatus: "draft" | "complete";
    savedAt: string;
  }
) {
  const text = asText(rawValue);
  if (!text) return "";

  try {
    const parsed = JSON.parse(text) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return "";
    const next = Object.fromEntries(
      Object.entries(parsed).flatMap(([day, encodedSnapshot]) => {
        const snapshot = parseEncodedJsonObject(encodedSnapshot);
        if (!snapshot) return [];
        const shifted = shiftScheduleSnapshot({
          snapshot,
          ...options,
        });
        return [[day, encodeJsonObject(shifted)]];
      })
    );
    return Object.keys(next).length ? JSON.stringify(next) : "";
  } catch {
    return "";
  }
}

function buildFollowUpSessionsFromSnapshot(
  shiftedSnapshot: Record<string, unknown> | null,
  location: string | null
) {
  if (!shiftedSnapshot || !Array.isArray(shiftedSnapshot.resolvedRounds)) return [] as Array<Record<string, string | null>>;
  return (shiftedSnapshot.resolvedRounds as Array<Record<string, unknown>>).flatMap((round) => {
    const sessionDate = asText(round.sessionDate);
    const startTime = parseNullableStoredTime(round.startTime);
    const endTime = parseNullableStoredTime(round.endTime);
    const roomSlots = Array.isArray(round.roomSlots) ? (round.roomSlots as Array<Record<string, unknown>>) : [];
    if (!sessionDate || !startTime) return [];
    return roomSlots.map((slot, slotIndex) => ({
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
      location,
      room: parseNullableText(slot.roomName) || `Exam ${slotIndex + 1}`,
    }));
  });
}

function buildFollowUpSessionsFromSourceSessions(args: {
  sourceSessions: SourceSessionRow[];
  newDate: string;
  targetStartTime: string | null;
  location: string | null;
}) {
  const grouped = new Map<
    string,
    {
      startMinutes: number;
      endMinutes: number | null;
      rooms: Array<string | null>;
    }
  >();

  args.sourceSessions.forEach((session) => {
    const startMinutes = parseTimeToMinutes(session.start_time);
    if (startMinutes === null) return;
    const endMinutes = normalizeEndMinutesForRange(startMinutes, parseTimeToMinutes(session.end_time));
    const key = `${startMinutes}:${endMinutes ?? ""}`;
    const current = grouped.get(key) || {
      startMinutes,
      endMinutes,
      rooms: [],
    };
    current.rooms.push(parseNullableText(session.room));
    grouped.set(key, current);
  });

  const orderedRounds = Array.from(grouped.values()).sort((a, b) => a.startMinutes - b.startMinutes);
  if (!orderedRounds.length) return [] as Array<Record<string, string | null>>;

  const sourceStartMinutes = orderedRounds[0]?.startMinutes ?? null;
  const targetStartMinutes = parseTimeToMinutes(args.targetStartTime);
  const deltaMinutes =
    sourceStartMinutes !== null && targetStartMinutes !== null
      ? targetStartMinutes - sourceStartMinutes
      : 0;

  return orderedRounds.flatMap((round) => {
    const shiftedStart = round.startMinutes + deltaMinutes;
    const shiftedEnd = round.endMinutes !== null ? round.endMinutes + deltaMinutes : null;
    const startTime = parseNullableStoredTime(formatDisplayTimeFromMinutes(shiftedStart));
    const endTime = shiftedEnd !== null ? parseNullableStoredTime(formatDisplayTimeFromMinutes(shiftedEnd)) : null;
    return round.rooms.map((room, roomIndex) => ({
      session_date: args.newDate,
      start_time: startTime,
      end_time: endTime,
      location: args.location,
      room: room || `Exam ${roomIndex + 1}`,
    }));
  });
}

function buildScheduleMetadataForFollowUp(args: {
  sourceMetadata: TrainingEventMetadata;
  copyOptions: FollowUpCopyOptions;
  newDate: string;
  startStoredTime: string | null;
  endStoredTime: string | null;
  savedAt: string;
}) {
  if (!args.copyOptions.copyScheduleStructure) {
    return {
      schedule_builder_snapshot: "",
      schedule_builder_days: "",
      schedule_room_adjustments: "",
      schedule_status: "",
      rotation_schedule_status: "",
      schedule_started_at: "",
      schedule_last_saved_at: "",
      schedule_updated_at: "",
      schedule_completed_at: "",
      schedule_completed_by: "",
      schedule_preview_enabled_for_sps: "",
      announcement_cue_overrides: "",
    } satisfies Partial<TrainingEventMetadata>;
  }

  const status = args.copyOptions.createCompletedSchedule ? "complete" : "draft";
  const baseSnapshot = parseEncodedJsonObject(args.sourceMetadata.schedule_builder_snapshot);
  const shiftedSnapshot = baseSnapshot
    ? shiftScheduleSnapshot({
        snapshot: baseSnapshot,
        newDate: args.newDate,
        targetStartTime: args.startStoredTime,
        scheduleStatus: args.copyOptions.createCompletedSchedule ? "complete" : "draft",
        savedAt: args.savedAt,
      })
    : null;

  return {
    schedule_builder_snapshot: shiftedSnapshot ? encodeJsonObject(shiftedSnapshot) : "",
    schedule_builder_days: shiftScheduleBuilderDays(args.sourceMetadata.schedule_builder_days, {
      newDate: args.newDate,
      targetStartTime: args.startStoredTime,
      scheduleStatus: args.copyOptions.createCompletedSchedule ? "complete" : "draft",
      savedAt: args.savedAt,
    }),
    schedule_room_adjustments: "",
    schedule_status: status,
    rotation_schedule_status: status,
    schedule_started_at: args.savedAt,
    schedule_last_saved_at: args.savedAt,
    schedule_updated_at: args.savedAt,
    schedule_completed_at: "",
    schedule_completed_by: "",
    schedule_preview_enabled_for_sps: "",
    announcement_cue_overrides: asText(args.sourceMetadata.announcement_cue_overrides),
    schedule_room_count: asText(args.sourceMetadata.schedule_room_count),
    schedule_round_count: asText(args.sourceMetadata.schedule_round_count),
    schedule_room_capacity: asText(args.sourceMetadata.schedule_room_capacity),
  } satisfies Partial<TrainingEventMetadata>;
}

async function cleanupCreatedFollowUp(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string
) {
  await supabaseServer.from("event_sps").delete().eq("event_id", eventId);
  await supabaseServer.from("event_sessions").delete().eq("event_id", eventId);
  await supabaseServer.from("events").delete().eq("id", eventId);
}

export async function createRelatedEvent(
  request: Request,
  context: { params: Promise<unknown> },
  forcedMode: RelatedEventCreationMode = "follow_up"
) {
  const viewer = await getAuthenticatedViewer();
  if (!viewer) {
    return unauthorizedResponse();
  }
  if (!isOperatorRole(viewer.role)) {
    return applyAuthCookies(
      NextResponse.json(
        {
          error:
            forcedMode === "duplicate"
              ? "Only Sim Ops or admin accounts can duplicate events."
              : "Only Sim Ops or admin accounts can create follow-up simulations.",
        },
        { status: 403 }
      ),
      viewer
    );
  }

  try {
    const params = (await context.params) as { id?: string | string[] };
    const sourceEventId = getRouteId(params);
    if (!sourceEventId) {
      return applyAuthCookies(NextResponse.json({ error: "Missing source event id." }, { status: 400 }), viewer);
    }

    const body = (await request.json().catch(() => null)) as FollowUpRequestBody | null;
    const mode =
      forcedMode ||
      (asText(body?.mode).toLowerCase() === "duplicate" ? "duplicate" : "follow_up");
    const copyOptions = normalizeFollowUpCopyOptions(body?.copyOptions || DEFAULT_FOLLOW_UP_COPY_OPTIONS);
    const newEventName = asText(body?.name);
    const newDate = asText(body?.date);
    const newLocation = parseNullableText(body?.location);
    const newStatus = asText(body?.status) || "Planning";
    const newVisibility = asText(body?.visibility) || "team";
    const newVisibleNotes = asText(body?.notes);
    const newStartTime = parseNullableStoredTime(body?.startTime);
    const newEndTime = parseNullableStoredTime(body?.endTime);

    if (!newEventName) {
      return applyAuthCookies(NextResponse.json({ error: "New event name is required." }, { status: 400 }), viewer);
    }
    if (!newDate) {
      return applyAuthCookies(
        NextResponse.json(
          { error: mode === "duplicate" ? "A duplicate event date is required." : "A follow-up event date is required." },
          { status: 400 }
        ),
        viewer
      );
    }

    const supabaseServer = createSupabaseServerClient();
    const [{ data: sourceEvent, error: sourceEventError }, { data: sourceSessions, error: sourceSessionsError }, { data: sourceAssignments, error: sourceAssignmentsError }] =
      await Promise.all([
        supabaseServer
          .from("events")
          .select("id,name,status,date_text,sp_needed,visibility,location,notes")
          .eq("id", sourceEventId)
          .maybeSingle(),
        supabaseServer
          .from("event_sessions")
          .select("id,event_id,session_date,start_time,end_time,location,room")
          .eq("event_id", sourceEventId)
          .order("session_date", { ascending: true })
          .order("start_time", { ascending: true })
          .order("room", { ascending: true }),
        supabaseServer
          .from("event_sps")
          .select("id,event_id,sp_id,status,assignment_status,role_name,confirmed,notes")
          .eq("event_id", sourceEventId)
          .order("created_at", { ascending: true }),
      ]);

    if (sourceEventError) {
      return applyAuthCookies(
        NextResponse.json({ error: sourceEventError.message || "Could not load the source event." }, { status: 500 }),
        viewer
      );
    }
    if (!sourceEvent) {
      return applyAuthCookies(NextResponse.json({ error: "Source event not found." }, { status: 404 }), viewer);
    }
    if (sourceSessionsError) {
      return applyAuthCookies(
        NextResponse.json({ error: sourceSessionsError.message || "Could not load source sessions." }, { status: 500 }),
        viewer
      );
    }
    if (sourceAssignmentsError) {
      return applyAuthCookies(
        NextResponse.json({ error: sourceAssignmentsError.message || "Could not load source SP assignments." }, { status: 500 }),
        viewer
      );
    }

    const sourceTrainingMetadata = parseTrainingEventMetadata(sourceEvent.notes);
    const sourceParsedEventMetadata = parseEventMetadata(sourceEvent.notes);
    const now = new Date().toISOString();

    const followUpTrainingMetadata: Partial<TrainingEventMetadata> = {
      ...FOLLOW_UP_STATE_RESET_METADATA,
      modality: asText(sourceTrainingMetadata.modality),
      linked_event_id: sourceEvent.id,
      linked_event_title: asText(sourceEvent.name),
      copied_from_event_name: asText(sourceEvent.name),
      event_session_date: newDate,
      event_start_time: newStartTime || "",
      event_end_time: newEndTime || "",
    };

    if (mode === "follow_up") {
      Object.assign(followUpTrainingMetadata, {
        parent_event_id: sourceEvent.id,
        follow_up_of_event_id: sourceEvent.id,
        follow_up_created_at: now,
        follow_up_created_by: viewer.fullName || viewer.email || viewer.role,
      } satisfies Partial<TrainingEventMetadata>);
    }

    if (copyOptions.copyLearnerRoster || copyOptions.copyScheduleStructure) {
      Object.assign(followUpTrainingMetadata, pickTrainingMetadata(sourceTrainingMetadata, LEARNER_METADATA_KEYS));
    }
    if (copyOptions.copyCases) {
      Object.assign(followUpTrainingMetadata, pickTrainingMetadata(sourceTrainingMetadata, CASE_METADATA_KEYS));
    }
    if (copyOptions.copyMaterials) {
      Object.assign(followUpTrainingMetadata, pickTrainingMetadata(sourceTrainingMetadata, MATERIAL_METADATA_KEYS));
    }
    if (copyOptions.copyTrainingReferences) {
      Object.assign(followUpTrainingMetadata, pickTrainingMetadata(sourceTrainingMetadata, TRAINING_REFERENCE_METADATA_KEYS));
    }
    if (copyOptions.copyEmailTemplateContext) {
      Object.assign(followUpTrainingMetadata, pickTrainingMetadata(sourceTrainingMetadata, EMAIL_CONTEXT_METADATA_KEYS));
    }

    // IMPORTANT FOLLOW-UP SIMULATION GUARD:
    // Follow-up simulations copy operational structure, not live completion state.
    // Do not copy attendance, delivered announcements, completed checklist state,
    // or old live event statuses into the new event.
    Object.assign(
      followUpTrainingMetadata,
      buildScheduleMetadataForFollowUp({
        sourceMetadata: sourceTrainingMetadata,
        copyOptions,
        newDate,
        startStoredTime: newStartTime,
        endStoredTime: newEndTime,
        savedAt: now,
      })
    );

    const nextNotes = composeFollowUpNotes({
      sourceNotes: sourceEvent.notes,
      visibleNotes: newVisibleNotes,
      trainingMetadata: followUpTrainingMetadata,
    });
    const nextNotesWithEventTypes = sourceParsedEventMetadata.eventTypes.length
      ? upsertEventMetadata(nextNotes, { eventTypes: sourceParsedEventMetadata.eventTypes })
      : nextNotes;

    const createdEventInsert = await supabaseServer
      .from("events")
      .insert({
        name: newEventName,
        status: newStatus,
        date_text: newDate,
        sp_needed: sourceEvent.sp_needed || 0,
        visibility: newVisibility,
        location: newLocation || sourceEvent.location,
        notes: nextNotesWithEventTypes || null,
      })
      .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at")
      .single();

    if (createdEventInsert.error || !createdEventInsert.data) {
      return applyAuthCookies(
        NextResponse.json(
          {
            error:
              createdEventInsert.error?.message ||
              (mode === "duplicate" ? "Could not create the duplicate event." : "Could not create the follow-up event."),
          },
          { status: 500 }
        ),
        viewer
      );
    }

    const createdEvent = createdEventInsert.data;

    try {
      const shiftedSnapshot = parseEncodedJsonObject(followUpTrainingMetadata.schedule_builder_snapshot || "");
      const followUpSessions =
        copyOptions.copyScheduleStructure
          ? buildFollowUpSessionsFromSnapshot(shiftedSnapshot, newLocation || sourceEvent.location)
          : [];
      const fallbackSessions =
        copyOptions.copyScheduleStructure && !followUpSessions.length
          ? buildFollowUpSessionsFromSourceSessions({
              sourceSessions: (sourceSessions || []) as SourceSessionRow[],
              newDate,
              targetStartTime: newStartTime,
              location: newLocation || sourceEvent.location,
            })
          : [];
      const sessionRowsToInsert = (followUpSessions.length ? followUpSessions : fallbackSessions)
        .filter((session) => session.session_date && session.start_time);

      if (sessionRowsToInsert.length) {
        const { error: sessionInsertError } = await supabaseServer.from("event_sessions").insert(
          sessionRowsToInsert.map((session) => ({
            event_id: createdEvent.id,
            session_date: session.session_date,
            start_time: session.start_time,
            end_time: session.end_time,
            location: session.location,
            room: session.room,
          }))
        );
        if (sessionInsertError) {
          throw new Error(sessionInsertError.message || "Could not copy follow-up sessions.");
        }
      }

      if (copyOptions.copySpRoster) {
        const assignmentRows = ((sourceAssignments || []) as SourceAssignmentRow[])
          .filter((assignment) => Boolean(asText(assignment.sp_id)))
          .map((assignment) => ({
            event_id: createdEvent.id,
            sp_id: assignment.sp_id,
            status: asText(assignment.status) || asText(assignment.assignment_status) || asText(assignment.role_name) || null,
            confirmed: typeof assignment.confirmed === "boolean" ? assignment.confirmed : false,
            notes: parseNullableText(assignment.notes),
          }));

        if (assignmentRows.length) {
          const { error: assignmentInsertError } = await supabaseServer.from("event_sps").insert(assignmentRows);
          if (assignmentInsertError) {
            throw new Error(assignmentInsertError.message || "Could not copy follow-up SP roster.");
          }
        }
      }

      if (mode === "follow_up") {
        const sourceFollowUpIds = parseFollowUpList(sourceTrainingMetadata.follow_up_event_ids);
        const sourceFollowUpTitles = parseFollowUpList(sourceTrainingMetadata.follow_up_event_titles);
        const sourceNextNotes = upsertEventMetadata(sourceEvent.notes, {
          training: {
            follow_up_event_ids: serializeFollowUpList([...sourceFollowUpIds, createdEvent.id]),
            follow_up_event_titles: serializeFollowUpList([...sourceFollowUpTitles, asText(createdEvent.name)]),
          },
        });

        const { error: sourceUpdateError } = await supabaseServer
          .from("events")
          .update({ notes: sourceNextNotes || null })
          .eq("id", sourceEvent.id);

        if (sourceUpdateError) {
          throw new Error(sourceUpdateError.message || "Could not update follow-up relationship on the source event.");
        }
      }
    } catch (error) {
      await cleanupCreatedFollowUp(supabaseServer, createdEvent.id);
      throw error;
    }

    return applyAuthCookies(
      NextResponse.json(
        {
          event: createdEvent,
          redirectUrl: `/events/${encodeURIComponent(createdEvent.id)}`,
        },
        { status: 201 }
      ),
      viewer
    );
  } catch (error) {
    return applyAuthCookies(
      NextResponse.json(
        { error: `Supabase request failed: ${getErrorMessage(error)}` },
        { status: 500 }
      ),
      viewer
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<unknown> }
) {
  return createRelatedEvent(request, context, "follow_up");
}
