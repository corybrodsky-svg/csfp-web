import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  setAuthCookies,
} from "../../../lib/authCookies";
import { parseEventMetadata } from "../../../lib/eventMetadata";
import { getImportedYearHint, normalizeLooseDateToIso } from "../../../lib/eventDateUtils";
import { sanitizePublicErrorMessage } from "../../../lib/safeErrorMessage";
import { createSupabaseAdminClient } from "../../../lib/supabaseAdminClient";
import { createSupabaseServerClient, supabaseKey, supabaseUrl } from "../../../lib/supabaseServerClient";
import { getProfileForUser } from "../../../lib/profileServer";
import { resolveSpAccountLink } from "../../../lib/spAccountLinking";
import {
  getTrainingMetadataBlock,
  parseTrainingEventMetadata,
  upsertTrainingEventMetadata,
  type TrainingEventMetadata,
} from "../../../lib/trainingEventNotes";
import { sanitizeScheduleWorkflowNotes } from "../../../lib/scheduleWorkflowNotes";
import { upsertOrganizationFacultyContact } from "../../../lib/organizationContacts";
import {
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanManageOrganization,
  roleCanOperateOrganization,
  unauthorizedJson,
} from "../../../lib/organizationAuth";

export const dynamic = "force-dynamic";

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

function toSupabaseError(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== "object") return {};
  const source = error as SupabaseErrorLike;
  return {
    message: source.message || null,
    code: source.code || null,
    details: source.details || null,
    hint: source.hint || null,
  };
}

function getErrorMessage(error: unknown, fallback = "Event details could not be loaded.") {
  const source = toSupabaseError(error);
  return sanitizePublicErrorMessage(
    source.message || (error instanceof Error ? error.message : error),
    fallback
  );
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = toSupabaseError(error);
  const code = asText(source.code).toLowerCase();
  const text = [source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  const target = columnName.toLowerCase();
  return code === "42703" || (text.includes(target) && (text.includes("does not exist") || text.includes("schema cache") || text.includes("column")));
}

function isMissingOrganizationColumnError(error: unknown) {
  return isMissingColumnError(error, "organization_id");
}

const spEventDetailBaseColumns = [
  "id",
  "first_name",
  "last_name",
  "full_name",
  "working_email",
  "email",
  "phone",
] as const;
const spEventDetailOptionalColumns = [
  "portrayal_age",
  "race",
  "sex",
  "telehealth",
  "pt_preferred",
  "other_roles",
  "speaks_spanish",
  "notes",
  "status",
] as const;

function exactSupabaseError(error: unknown) {
  const source = toSupabaseError(error);
  return {
    message: getErrorMessage(error),
    code: asText(source.code) || null,
    details: sanitizePublicErrorMessage(source.details || "", ""),
    hint: sanitizePublicErrorMessage(source.hint || "", ""),
  };
}

function jsonEventDetailError(
  body: {
    error: "bad_request" | "not_found" | "forbidden" | "server_error";
    message: string;
    eventId?: string;
    status?: number;
    diagnostics?: Record<string, unknown>;
  },
  init: ResponseInit
) {
  return NextResponse.json({ ok: false, ...body }, init);
}

function logEventDetail(stage: string, payload: Record<string, unknown>) {
  console.info("[api/events/[id]]", { stage, ...payload });
}

function logEventDetailFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[api/events/[id]] failed", {
    stage,
    message: source.message || "",
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
    ...(extra || {}),
  });
}

function canUsePrivilegedEventWrite(context: {
  role: string | null | undefined;
  legacyRole: string | null | undefined;
  isPlatformOwner: boolean | null | undefined;
}) {
  return Boolean(
    context.isPlatformOwner ||
      context.role === "platform_owner" ||
      context.role === "org_admin" ||
      context.role === "sim_ops" ||
      context.legacyRole === "super_admin" ||
      context.legacyRole === "admin" ||
      context.legacyRole === "sim_op"
  );
}

function canMutateEventForActiveOrganization(
  context: {
    role: string | null | undefined;
    legacyRole: string | null | undefined;
    isPlatformOwner: boolean | null | undefined;
    schemaAvailable: boolean;
    activeOrganization?: { id?: string | null } | null;
  },
  eventOrganizationId: string
) {
  if (!context.schemaAvailable) return true;
  const activeOrganizationId = asText(context.activeOrganization?.id);
  if (eventOrganizationId && activeOrganizationId && eventOrganizationId === activeOrganizationId) return true;

  // Legacy imported events may not have organization_id yet. If an operator can open
  // the event through the active organization + legacy read path, they should be able
  // to save it; PATCH will attach the event to the active organization as part of the save.
  if (!eventOrganizationId) {
    return canUsePrivilegedEventWrite(context);
  }

  return false;
}

function logEventWriteFailure(stage: string, error: unknown, extra?: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[event-save] write failed", {
    stage,
    message: source.message || "",
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
    ...(extra || {}),
  });
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function createViewerScopedClient(accessToken: string) {
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase configuration.");
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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

  const coryAdminEmails = new Set([
    "cwb55@drexel.edu",
    "cory.brodsky@drexel.edu",
  ]);

  if (coryAdminEmails.has(normalizedEmail) || localPart === "cory.brodsky") {
    if (
      normalizedRole === "super_admin" ||
      normalizedRole === "admin" ||
      normalizedRole === "sim_op"
    ) {
      return normalizedRole;
    }

    return "super_admin";
  }

  return normalizedRole;
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeMatchValue(value: unknown) {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

const CFSP_METADATA_BLOCK_PATTERN = /\[(CFSP_[A-Z0-9_]+)\][\s\S]*?\[\/\1\]/g;

function extractCfspMetadataBlocks(notes?: string | null) {
  const blocks = new Map<string, string>();
  const text = asText(notes);
  for (const match of text.matchAll(CFSP_METADATA_BLOCK_PATTERN)) {
    const blockKey = match[1];
    const blockText = match[0];
    if (blockKey && blockText) blocks.set(blockKey, blockText.trim());
  }
  return blocks;
}

function stripCfspMetadataBlocks(notes?: string | null) {
  return asText(notes).replace(CFSP_METADATA_BLOCK_PATTERN, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function getRequestedMetadataKeys(notes?: string | null) {
  const block = getTrainingMetadataBlock(asText(notes));
  if (!block) return new Set<string>();

  const keys = new Set<string>();
  block.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
    if (!match) return;
    const key = asText(match[1]).toLowerCase();
    if (key) keys.add(key);
  });

  return keys;
}

function getTrainingMetadataPatch(notes?: string | null) {
  const source = asText(notes);
  const requestedKeys = getRequestedMetadataKeys(source);
  if (!requestedKeys.size) return null;

  const parsed = parseTrainingEventMetadata(source);
  const next: Partial<TrainingEventMetadata> = {};
  const allKeys = Object.keys(parsed) as Array<keyof TrainingEventMetadata>;

  allKeys.forEach((key) => {
    if (requestedKeys.has(key)) {
      next[key] = parsed[key];
    }
  });

  return next;
}

function logEventSetupSave(stage: string, payload: Record<string, unknown>) {
  console.info("[event-setup-save]", { stage, ...payload });
}

function logEventSetupSaveFailure(stage: string, error: unknown, payload: Record<string, unknown>) {
  const source = toSupabaseError(error);
  console.error("[event-setup-save] failed", {
    stage,
    message: source.message || "",
    code: source.code || "",
    details: source.details || "",
    hint: source.hint || "",
    ...payload,
  });
}

function logEventSettingsSaveRejected(
  kind: "unauthorized" | "forbidden",
  payload: Record<string, unknown>
) {
  console.error(`[event-settings-save] ${kind}`, {
    route: "PATCH /api/events/[id]",
    ...payload,
  });
}

function mergeEventNotesPreservingMetadata(currentNotes?: string | null, incomingNotes?: string | null) {
  if (incomingNotes === null) return null;

  const sanitizedCurrentNotes = sanitizeScheduleWorkflowNotes(currentNotes);
  const sanitizedIncomingNotes = sanitizeScheduleWorkflowNotes(incomingNotes);
  const incomingBlocks = extractCfspMetadataBlocks(sanitizedIncomingNotes);
  const trainingMetadataPatch = getTrainingMetadataPatch(sanitizedIncomingNotes);
  const currentMetadata = parseTrainingEventMetadata(sanitizedCurrentNotes);
  const nextMetadata = {
    ...currentMetadata,
  } as Record<keyof TrainingEventMetadata, string>;

  if (trainingMetadataPatch) {
    Object.entries(trainingMetadataPatch).forEach(([key, value]) => {
      const metadataKey = key as keyof TrainingEventMetadata;
      const metadataValue = asText(value);
      if (!metadataValue) {
        delete nextMetadata[metadataKey];
      } else {
        nextMetadata[metadataKey] = metadataValue;
      }
    });
  }

  const trainingMetadataMergedNotes = trainingMetadataPatch
    ? upsertTrainingEventMetadata(sanitizedCurrentNotes, nextMetadata)
    : sanitizedCurrentNotes;
  const mergedBlocks = new Map(extractCfspMetadataBlocks(trainingMetadataMergedNotes));
  for (const [key, value] of incomingBlocks.entries()) {
    if (key !== "CFSP_TRAINING_METADATA") {
      mergedBlocks.set(key, value);
    }
  }

  const currentVisibleNotes = stripCfspMetadataBlocks(sanitizedCurrentNotes);
  const incomingVisibleNotes = stripCfspMetadataBlocks(sanitizedIncomingNotes);
  const incomingHasNonTrainingBlock = Array.from(incomingBlocks.keys()).some((key) => key !== "CFSP_TRAINING_METADATA");
  const mergedVisibleNotes =
    incomingVisibleNotes || (incomingHasNonTrainingBlock ? currentVisibleNotes : incomingVisibleNotes);

  const mergedSections = [...mergedBlocks.values(), mergedVisibleNotes].filter(Boolean);
  return mergedSections.length ? mergedSections.join("\n") : null;
}

type ViewerContext = {
  id: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  role: string;
  fullName: string;
  scheduleName: string;
  linkedSpId: string;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

type AssignedSpApiRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  working_email?: string | null;
  email?: string | null;
};

type AssignmentApiRow = {
  id: string;
  event_id: string | null;
  organization_id?: string | null;
  sp_id: string | null;
  status: string | null;
  assignment_status?: string | null;
  role_name?: string | null;
  confirmed: boolean | null;
  notes?: string | null;
  last_contacted_at?: string | null;
  contact_method?: string | null;
  created_at?: string | null;
  training_attended?: boolean | null;
  training_checked_in_at?: string | null;
  event_checked_in_at?: string | null;
  event_attendance_status?: string | null;
  attendance_note?: string | null;
};

type RelatedEventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  notes: string | null;
  created_at?: string | null;
  organization_id?: string | null;
};

type EventDetailApiRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  sp_needed?: number | null;
  visibility?: string | null;
  location: string | null;
  notes: string | null;
  created_at: string | null;
  organization_id?: string | null;
  event_type?: "simulation" | "didactic";
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
      return {
        accessToken,
        refreshToken,
        user: null,
        shouldClearCookies: true,
      };
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (error || !refreshedUser || !refreshedAccessToken || !refreshedRefreshToken) {
      return {
        accessToken,
        refreshToken,
        user: null,
        shouldClearCookies: true,
      };
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
    const spLink = await resolveSpAccountLink({
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
      scheduleName: asText(profile?.schedule_name) || asText(auth.user.user_metadata?.schedule_name),
      linkedSpId: asText(spLink.sp_id),
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

type CourseSignature = {
  full: string;
  prefix: string;
  number: string;
  hasPrefix: boolean;
};

type RelatedMatchReason =
  | "Matched by exact course"
  | "Matched by exact course + title family"
  | "Matched by source batch + exact course"
  | "No stable match";

type RelatedMatchConfidence = "exact_course" | "title_family" | "source_batch" | "none";

const COURSE_MATCH_STOPWORDS = new Set([
  "training",
  "event",
  "session",
  "simulation",
  "sim",
  "date",
  "prep",
  "orientation",
  "virtual",
  "skills",
  "workshop",
  "ire",
]);

function tokenizeFamilyText(value: unknown) {
  return asText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !COURSE_MATCH_STOPWORDS.has(token));
}

function normalizeCoursePrefix(value: string) {
  return asText(value).toUpperCase().replace(/\s+/g, " ").trim();
}

function asCourseToken(value: unknown) {
  return asText(value)
    .toUpperCase()
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCourseSignatures(value: unknown) {
  const text = asText(value).toUpperCase();
  const matchTokens = Array.from(text.matchAll(/\b([A-Z]{2,})\s*-?\s*(\d{3,4}[A-Z]?)\b/g));
  const numericMatches = Array.from(text.matchAll(/\b(\d{3,4}[A-Z]?)\b/g));
  const courseTokens = matchTokens.map((match) => ({
    full: asCourseToken(`${match[1]} ${match[2]}`),
    prefix: normalizeCoursePrefix(match[1]),
    number: asCourseToken(match[2]),
    hasPrefix: true,
  }));

  if (courseTokens.length) {
    return Array.from(
      new Map(courseTokens.map((item) => [item.full, item])).values()
    );
  }

  const numericCourses = numericMatches.map((match) => ({
    full: asCourseToken(match[1]),
    prefix: "",
    number: asCourseToken(match[1]),
    hasPrefix: false,
  }));

  const yearFilteredNumericCourses = numericCourses.filter((item) => {
    const numeric = Number(item.number);
    return !(Number.isFinite(numeric) && numeric >= 1900 && numeric <= 2600);
  });

  return Array.from(new Map(yearFilteredNumericCourses.map((item) => [item.full, item])).values());
}

function parseHiddenRelatedIds(value: string | null | undefined) {
  return Array.from(
    new Set(
      asText(value)
        .split(/[,;\n]/g)
        .map((entry) => asText(entry))
        .filter(Boolean)
    )
  );
}

function parseConfirmedRelatedIds(value: string | null | undefined) {
  return new Set(
    Array.from(
      new Set(
        asText(value)
          .split(/[,;\n]/g)
          .map((entry) => asText(entry))
          .filter(Boolean)
      )
    )
  );
}

function normalizeSourceBatchKey(metadata: ReturnType<typeof parseTrainingEventMetadata>) {
  const linkedId = asText(metadata.linked_event_id);
  const signalType = asText(metadata.signal_type);
  if (linkedId) return `link:${linkedId}`;
  if (signalType) return `signal:${signalType}`;
  return "";
}

function extractTitleFamily(value: unknown) {
  return Array.from(new Set(tokenizeFamilyText(value))).sort();
}

function resolveCourseIdentifier(
  signals: ReturnType<typeof getEventFamilySignals>,
  signature: CourseSignature
) {
  if (signature.hasPrefix) return signature.full;
  if (!signature.number) return "";
  if (signature.prefix) return "";

  const program = normalizeCoursePrefix(signals.facultyProgram);
  return program ? `${program} ${signature.number}`.trim() : "";
}

function getEventFamilySignals(event: RelatedEventRow) {
  const metadata = parseTrainingEventMetadata(event.notes);
  const familySource = [
    event.name,
    event.status,
    event.location,
    event.date_text,
    metadata.faculty_program,
    metadata.linked_event_title,
    metadata.training_notes,
  ]
    .map(asText)
    .filter(Boolean)
    .join(" ");
  const facultyProgram = normalizeCoursePrefix(metadata.faculty_program);
  const titleFamily = extractTitleFamily(event.name);
  const courseSignatures = extractCourseSignatures(familySource);

  return {
    courseSignatures,
    titleFamilyTokens: titleFamily,
    facultyProgram,
    sourceBatchKey: normalizeSourceBatchKey(metadata),
    metadata,
  };
}

function getTitleFamilyMatch(sourceTokens: string[], targetTokens: string[]) {
  if (!sourceTokens.length || !targetTokens.length) return false;
  const targetSet = new Set(targetTokens);
  const overlap = sourceTokens.filter((token) => targetSet.has(token)).length;
  if (overlap < 1) return false;

  const sourceWeight = sourceTokens.length;
  const targetWeight = targetTokens.length;
  const normalized = overlap / Math.min(sourceWeight, targetWeight);
  return normalized >= 0.6;
}

function pickExactCourseMatch(
  source: ReturnType<typeof getEventFamilySignals>,
  candidate: ReturnType<typeof getEventFamilySignals>
) {
  const sourceCourses = source.courseSignatures;
  const candidateCourses = candidate.courseSignatures;

  for (const sourceCourse of sourceCourses) {
    const sourceIdentifier = resolveCourseIdentifier(source, sourceCourse);
    if (!sourceIdentifier) continue;

    const matches = candidateCourses.filter((candidateCourse) => {
      const candidateIdentifier = resolveCourseIdentifier(candidate, candidateCourse);
      if (!candidateIdentifier) return false;
      return candidateIdentifier === sourceIdentifier;
    });
    if (!matches.length) continue;

    const exactCourse = matches[0];
    const sameCourse = sourceIdentifier;
    return { matchedCourse: sameCourse, sourceCourse, candidateCourse: exactCourse };
  }

  return null;
}

function buildRelatedMatchAssessment(
  sourceSignals: ReturnType<typeof getEventFamilySignals>,
  candidateSignals: ReturnType<typeof getEventFamilySignals>
) {
  const exactMatch = pickExactCourseMatch(sourceSignals, candidateSignals);
  if (!exactMatch) {
    return {
      matchReason: "No stable match" as RelatedMatchReason,
      matchConfidence: "none" as RelatedMatchConfidence,
      matchCourse: "",
      isMatched: false,
    };
  }

  const matchedCourse = exactMatch.matchedCourse;
  const sourceBatch = sourceSignals.sourceBatchKey;
  const candidateBatch = candidateSignals.sourceBatchKey;
  const sameBatch = Boolean(sourceBatch && candidateBatch && sourceBatch === candidateBatch);
  const titleFamilyMatch = getTitleFamilyMatch(
    sourceSignals.titleFamilyTokens,
    candidateSignals.titleFamilyTokens
  );

  if (sameBatch) {
    return {
      matchReason: `Matched by source batch + exact course: ${matchedCourse}` as RelatedMatchReason,
      matchConfidence: "source_batch" as RelatedMatchConfidence,
      matchCourse: matchedCourse,
      isMatched: true,
    };
  }

  if (titleFamilyMatch) {
    return {
      matchReason: `Matched by exact course + title family: ${matchedCourse}` as RelatedMatchReason,
      matchConfidence: "title_family" as RelatedMatchConfidence,
      matchCourse: matchedCourse,
      isMatched: true,
    };
  }

  return {
    matchReason: `Matched by exact course: ${matchedCourse}` as RelatedMatchReason,
    matchConfidence: "exact_course" as RelatedMatchConfidence,
    matchCourse: matchedCourse,
    isMatched: true,
  };
}

function getMatchSortValue(confidence: RelatedMatchConfidence) {
  if (confidence === "source_batch") return 0;
  if (confidence === "title_family") return 1;
  if (confidence === "exact_course") return 2;
  return 99;
}

function classifyRelatedEventNode(event: RelatedEventRow) {
  const metadata = parseTrainingEventMetadata(event.notes);
  const visibleSource = [event.name, event.status, event.location].map(asText).join(" ").toLowerCase();
  const notes = asText(event.notes).toLowerCase();
  const explicitTrainingType =
    /\b(event[_\s-]*types?|active[_\s-]*event[_\s-]*types?|type)\s*:\s*[^\n]*\btraining\b/.test(notes);
  if (
    /\b(training|orientation|onboarding|prep)\b/.test(visibleSource) ||
    explicitTrainingType ||
    (asText(metadata.training_date) && !asText(metadata.event_session_date) && /\btraining\b/.test(notes))
  ) {
    return "training";
  }
  if (/\b(ipe|skills|workshop)\b/.test(visibleSource)) return "skills";
  if (/\b(virtual|zoom|telehealth|online)\b/.test(visibleSource)) return "virtual";
  return "simulation";
}

function isStandaloneTrainingRecord(event: RelatedEventRow & { sp_needed?: number | null }) {
  const kind = classifyRelatedEventNode(event);
  if (kind !== "training") return false;

  const notes = asText(event.notes).toLowerCase();
  const visibleSource = [event.name, event.status, event.location].map(asText).join(" ").toLowerCase();
  const explicitlyMixedWorkflow =
    /\b(event[_\s-]*types?|active[_\s-]*event[_\s-]*types?|type)\s*:\s*[^\n]*\b(sp|skills|hifi)\b/.test(notes) ||
    /\b(simulation|encounter|osce|skills|ipe|hifi|high fidelity)\b/.test(visibleSource);

  return !explicitlyMixedWorkflow;
}

function pickPrimaryEventForTrainingRecord(relatedEvents: Array<Record<string, unknown>>) {
  const ranked = relatedEvents
    .filter((node) => {
      const kind = asText(node.kind);
      return kind === "simulation" || kind === "skills" || kind === "virtual";
    })
    .map((node) => {
      const confidence = asText(node.match_confidence) as RelatedMatchConfidence;
      const kind = asText(node.kind);
      const dateText = asText(node.date_text);
      const dateValue = Date.parse(dateText);
      const isFutureOrUnknown = !Number.isFinite(dateValue) || dateValue >= Date.now() - 24 * 60 * 60 * 1000;
      const kindScore = kind === "simulation" ? 0 : kind === "skills" ? 1 : 2;
      return {
        node,
        score:
          getMatchSortValue(confidence) * 100 +
          kindScore * 10 +
          (isFutureOrUnknown ? 0 : 5),
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return asText(a.node.name).localeCompare(asText(b.node.name));
    });

  return ranked[0]?.node || null;
}

function getTrainingRecordFallbackSearch(event: RelatedEventRow) {
  const signals = getEventFamilySignals(event);
  const exactCourse =
    signals.courseSignatures
      .map((signature) => resolveCourseIdentifier(signals, signature))
      .find(Boolean) || "";
  if (exactCourse) return exactCourse;

  return asText(event.name)
    .replace(/\b(SP\s*)?Training\b/gi, " ")
    .replace(/\b(VIR|Virtual|Orientation|Prep|Onboarding)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadRelatedOperationalEvents(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  sourceEvent: RelatedEventRow,
  organizationId?: string,
  includeLegacyUnscopedRows = false
) {
  const sourceSignals = getEventFamilySignals(sourceEvent);
  const confirmedRelatedIds = parseConfirmedRelatedIds(
    parseTrainingEventMetadata(sourceEvent.notes).related_events_confirmed
  );
  const hiddenRelatedIds = new Set(
    parseHiddenRelatedIds(
      parseTrainingEventMetadata(sourceEvent.notes).related_events_hidden
    )
  );

  let relatedQuery = supabaseServer
    .from("events")
    .select("id,name,status,date_text,location,notes,created_at,organization_id")
    .limit(250);
  relatedQuery = applyRelatedOrganizationReadScope(relatedQuery, organizationId, includeLegacyUnscopedRows);
  const { data, error } = await relatedQuery;

  if (error) return [] as Array<Record<string, unknown>>;

  return ((data || []) as RelatedEventRow[])
    .map((candidate) => {
      if (candidate.id === sourceEvent.id || hiddenRelatedIds.has(candidate.id)) return null;

      const candidateSignals = getEventFamilySignals(candidate);
      const assessment = buildRelatedMatchAssessment(sourceSignals, candidateSignals);
      if (!assessment.isMatched) return null;

      const kind = classifyRelatedEventNode(candidate);
      const metadata = parseTrainingEventMetadata(candidate.notes);
      const confidence = assessment.matchConfidence;
      return {
        id: candidate.id,
        name: candidate.name,
        status: candidate.status,
        date_text: candidate.date_text,
        location: candidate.location,
        match_reason: assessment.matchReason,
        match_confidence: assessment.matchConfidence,
        kind,
        isConfirmed: confirmedRelatedIds.has(candidate.id),
        relationship:
          kind === "training"
            ? "Training"
            : kind === "skills"
              ? "Related skills/IPE session"
              : kind === "virtual"
                ? "Related virtual session"
                : "Simulation date",
        trainingMetadata: kind === "training" ? metadata : null,
        exact_course_match: confidence === "exact_course",
      };
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .sort((a, b) => {
      if (a.kind === "training" && b.kind !== "training") return -1;
      if (a.kind !== "training" && b.kind === "training") return 1;
      const aSort = getMatchSortValue(a.match_confidence);
      const bSort = getMatchSortValue(b.match_confidence);
      if (aSort !== bSort) return aSort - bSort;
      return asText(a.name).localeCompare(asText(b.name));
    })
    .slice(0, 20);
}

function viewerMatchesAssignedSp(sp: AssignedSpApiRow, viewer: ViewerContext) {
  const viewerEmails = new Set([normalizeEmail(viewer.email)].filter(Boolean));
  const viewerNames = new Set(
    [normalizeMatchValue(viewer.fullName), normalizeMatchValue(viewer.scheduleName)].filter(Boolean)
  );
  const spEmails = [normalizeEmail(sp.working_email), normalizeEmail(sp.email)].filter(Boolean);
  const spName =
    normalizeMatchValue(sp.full_name) ||
    normalizeMatchValue([sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" "));

  return spEmails.some((email) => viewerEmails.has(email)) || (spName && viewerNames.has(spName));
}

function getSafeAssignmentUpdates(rawUpdates: unknown) {
  if (!rawUpdates || typeof rawUpdates !== "object") return null;

  const source = rawUpdates as Record<string, unknown>;
  const updates: Record<string, string | boolean | null> = {};

  if (typeof source.status === "string") {
    updates.status = source.status;
    updates.assignment_status = source.status;
    updates.role_name = source.status;
  }
  if (typeof source.confirmed === "boolean") updates.confirmed = source.confirmed;
  if (typeof source.notes === "string" || source.notes === null) updates.notes = source.notes;
  if (typeof source.last_contacted_at === "string" || source.last_contacted_at === null) {
    updates.last_contacted_at = source.last_contacted_at;
  }
  if (typeof source.contact_method === "string" || source.contact_method === null) {
    updates.contact_method = source.contact_method;
  }
  if (typeof source.training_attended === "boolean") updates.training_attended = source.training_attended;
  if (typeof source.training_checked_in_at === "string" || source.training_checked_in_at === null) {
    updates.training_checked_in_at = source.training_checked_in_at;
  }
  if (typeof source.event_checked_in_at === "string" || source.event_checked_in_at === null) {
    updates.event_checked_in_at = source.event_checked_in_at;
  }
  if (typeof source.event_attendance_status === "string" || source.event_attendance_status === null) {
    updates.event_attendance_status = source.event_attendance_status;
  }
  if (typeof source.attendance_note === "string" || source.attendance_note === null) {
    updates.attendance_note = source.attendance_note;
  }

  return Object.keys(updates).length ? updates : null;
}

function getSafeEventUpdates(rawUpdates: unknown) {
  if (!rawUpdates || typeof rawUpdates !== "object") return null;

  const source = rawUpdates as Record<string, unknown>;
  const updates: Record<string, string | number | null> = {};

  if (Object.prototype.hasOwnProperty.call(source, "name")) {
    if (typeof source.name === "string") updates.name = source.name.trim() || null;
    else if (source.name === null) updates.name = null;
  }
  if (Object.prototype.hasOwnProperty.call(source, "status")) {
    if (typeof source.status === "string") updates.status = source.status.trim() || null;
    else if (source.status === null) updates.status = null;
  }
  if (Object.prototype.hasOwnProperty.call(source, "visibility")) {
    if (typeof source.visibility === "string") updates.visibility = source.visibility.trim() || null;
    else if (source.visibility === null) updates.visibility = null;
  }
  if (Object.prototype.hasOwnProperty.call(source, "location")) {
    if (typeof source.location === "string") updates.location = source.location.trim() || null;
    else if (source.location === null) updates.location = null;
  }
  if (Object.prototype.hasOwnProperty.call(source, "date_text")) {
    if (typeof source.date_text === "string") updates.date_text = source.date_text.trim() || null;
    else if (source.date_text === null) updates.date_text = null;
  }
  if (Object.prototype.hasOwnProperty.call(source, "notes")) {
    if (typeof source.notes === "string") updates.notes = source.notes.trim() || null;
    else if (source.notes === null) updates.notes = null;
  }
  if (typeof source.sp_needed === "number" && Number.isFinite(source.sp_needed)) {
    updates.sp_needed = Math.max(0, Math.round(source.sp_needed));
  }

  return Object.keys(updates).length ? updates : null;
}

function getSafeSessionUpdates(rawUpdates: unknown) {
  if (!rawUpdates || typeof rawUpdates !== "object") return null;

  const source = rawUpdates as Record<string, unknown>;
  const updates: Record<string, string | null> = {};

  if (typeof source.session_date === "string" || source.session_date === null) {
    updates.session_date =
      typeof source.session_date === "string" ? asText(source.session_date) || null : null;
  }
  if (typeof source.start_time === "string" || source.start_time === null) {
    updates.start_time =
      typeof source.start_time === "string" ? asText(source.start_time) || null : null;
  }
  if (typeof source.end_time === "string" || source.end_time === null) {
    updates.end_time =
      typeof source.end_time === "string" ? asText(source.end_time) || null : null;
  }

  return Object.keys(updates).length ? updates : null;
}

function getSafeSessionReplacementPayload(rawSessions: unknown, eventId: string, fallbackLocation: unknown) {
  if (!Array.isArray(rawSessions)) return null;

  const fallbackLocationText = asText(fallbackLocation) || null;
  const sessions = rawSessions
    .map((session) => {
      if (!session || typeof session !== "object") return null;
      const source = session as Record<string, unknown>;
      const sessionDate = normalizeLooseDateToIso(asText(source.session_date)) || asText(source.session_date) || null;
      const startTime = asText(source.start_time) || null;
      const endTime = asText(source.end_time) || null;
      const room = asText(source.room) || null;
      const location = asText(source.location) || fallbackLocationText;

      if (!sessionDate || !startTime) return null;

      return {
        event_id: eventId,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        room,
        location,
      };
    })
    .filter((session): session is {
      event_id: string;
      session_date: string;
      start_time: string;
      end_time: string | null;
      room: string | null;
      location: string | null;
    } => Boolean(session));

  return sessions;
}

function sanitizeEventForSp(event: {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  created_at: string | null;
}) {
  return {
    ...event,
    sp_needed: null,
    visibility: null,
    notes: null,
  };
}

function applyRelatedOrganizationReadScope<Query>(
  query: Query,
  organizationId?: string,
  includeLegacyUnscopedRows = false
): Query {
  const activeOrganizationId = asText(organizationId);
  if (!activeOrganizationId) return query;
  const scopedQuery = query as Query & {
    eq: (column: string, value: string) => Query;
    or: (filters: string) => Query;
  };
  return includeLegacyUnscopedRows
    ? scopedQuery.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`)
    : scopedQuery.eq("organization_id", activeOrganizationId);
}

export function relatedRowBelongsToAuthorizedEventScope(
  row: { event_id?: unknown; organization_id?: unknown },
  eventId: string,
  activeOrganizationId?: string | null
) {
  if (asText(row.event_id) !== asText(eventId)) return false;
  const activeOrgId = asText(activeOrganizationId);
  if (!activeOrgId) return true;
  const rowOrgId = asText(row.organization_id);
  return rowOrgId === activeOrgId || !rowOrgId;
}

function normalizeAssignmentRow(row: AssignmentApiRow): AssignmentApiRow {
  const normalizedStatus =
    asText(row.status) ||
    asText(row.assignment_status) ||
    asText(row.role_name) ||
    "";

  return {
    ...row,
    status: normalizedStatus || null,
    confirmed:
      typeof row.confirmed === "boolean"
        ? row.confirmed
        : normalizedStatus.toLowerCase() === "confirmed",
  };
}

async function loadEventAssignments(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  organizationId?: string,
  includeLegacyUnscopedRows = false
) {
  let primaryQuery = supabaseServer
    .from("event_sps")
    .select(
      "id,event_id,organization_id,sp_id,status,assignment_status,role_name,confirmed,notes,last_contacted_at,contact_method,created_at,training_attended,training_checked_in_at,event_checked_in_at,event_attendance_status,attendance_note"
    )
    .eq("event_id", eventId);
  primaryQuery = applyRelatedOrganizationReadScope(primaryQuery, organizationId, includeLegacyUnscopedRows);
  const primary = await primaryQuery;

  if (!primary.error) {
    return {
      assignments: ((primary.data || []) as AssignmentApiRow[]).map(normalizeAssignmentRow),
      error: null,
    };
  }

  let fallbackQuery = supabaseServer
    .from("event_sps")
    .select("id,event_id,organization_id,sp_id,status,assignment_status,role_name,confirmed,notes,last_contacted_at,contact_method,created_at")
    .eq("event_id", eventId);
  fallbackQuery = applyRelatedOrganizationReadScope(fallbackQuery, organizationId, includeLegacyUnscopedRows);
  const fallback = await fallbackQuery;

  return {
    assignments: ((fallback.data || []) as AssignmentApiRow[]).map((assignment) =>
      normalizeAssignmentRow({
        ...assignment,
        training_attended: false,
        training_checked_in_at: null,
        event_checked_in_at: null,
        event_attendance_status: "expected",
        attendance_note: null,
      })
    ),
    error: fallback.error,
  };
}

async function fetchAssignmentById(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  assignmentId: string,
  organizationId?: string,
  includeLegacyUnscopedRows = false
) {
  let primaryQuery = supabaseServer
    .from("event_sps")
    .select(
      "id,event_id,organization_id,sp_id,status,assignment_status,role_name,confirmed,notes,last_contacted_at,contact_method,created_at,training_attended,training_checked_in_at,event_checked_in_at,event_attendance_status,attendance_note"
    )
    .eq("event_id", eventId)
    .eq("id", assignmentId);
  primaryQuery = applyRelatedOrganizationReadScope(primaryQuery, organizationId, includeLegacyUnscopedRows);
  const primary = await primaryQuery.maybeSingle();

  if (!primary.error) {
    return {
      assignment: primary.data ? normalizeAssignmentRow(primary.data as AssignmentApiRow) : null,
      error: null,
    };
  }

  let fallbackQuery = supabaseServer
    .from("event_sps")
    .select("id,event_id,organization_id,sp_id,status,assignment_status,role_name,confirmed,notes,last_contacted_at,contact_method,created_at")
    .eq("event_id", eventId)
    .eq("id", assignmentId);
  fallbackQuery = applyRelatedOrganizationReadScope(fallbackQuery, organizationId, includeLegacyUnscopedRows);
  const fallback = await fallbackQuery.maybeSingle();

  return {
    assignment: fallback.data
      ? ({
          ...(fallback.data as AssignmentApiRow),
          training_attended: false,
          training_checked_in_at: null,
          event_checked_in_at: null,
          event_attendance_status: "expected",
          attendance_note: null,
        } satisfies AssignmentApiRow)
      : null,
    error: fallback.error,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);

    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return unauthorizedJson(organizationContext);
    }
    viewer.role = organizationContext.legacyRole;
    viewer.accessToken = organizationContext.accessToken;
    const activeOrganizationId = organizationContext.activeOrganization!.id;
    const isPlatformOwnerOrSuperAdmin =
      organizationContext.isPlatformOwner ||
      organizationContext.role === "platform_owner" ||
      organizationContext.legacyRole === "super_admin";
    const canUseAdminReadClient =
      isPlatformOwnerOrSuperAdmin ||
      organizationContext.role === "org_admin" ||
      organizationContext.role === "sim_ops" ||
      organizationContext.legacyRole === "admin" ||
      organizationContext.legacyRole === "sim_op";
    const canIncludeLegacyUnscopedRows =
      canUseAdminReadClient ||
      organizationContext.role === "org_admin" ||
      organizationContext.legacyRole === "admin";
    const viewerScopedClient = createViewerScopedClient(organizationContext.accessToken);
    const adminClient = canUseAdminReadClient ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || viewerScopedClient;

    const params = await context.params;
    const eventId = getRouteId(params);
    const explicitTrainingSourceId = asText(new URL(request.url).searchParams.get("trainingSource"));

    if (!eventId) {
      return applyAuthCookies(
        jsonEventDetailError(
          {
            error: "bad_request",
            message: "Missing event id.",
            status: 400,
          },
          { status: 400 }
        ),
        viewer
      );
    }

    const eventSelect = "id,name,status,date_text,sp_needed,visibility,location,notes,created_at,organization_id";
    const runEventQuery = async (mode: "active_org_plus_legacy" | "legacy_null" | "all_org_platform_owner_fallback" | "unscoped_no_org_column") => {
      let query = supabaseServer
        .from("events")
        .select(eventSelect)
        .eq("id", eventId);
      if (mode === "active_org_plus_legacy" && organizationContext.schemaAvailable) {
        query = canIncludeLegacyUnscopedRows
          ? query.or(`organization_id.eq.${activeOrganizationId},organization_id.is.null`)
          : query.eq("organization_id", activeOrganizationId);
      } else if (mode === "legacy_null" && organizationContext.schemaAvailable) {
        query = query.is("organization_id", null);
      }
      const result = await query.maybeSingle();
      return {
        event: result.data as EventDetailApiRow | null,
        error: result.error as SupabaseErrorLike | null,
      };
    };

    let eventLookupMode: "active_org_plus_legacy" | "legacy_null" | "all_org_platform_owner_fallback" | "unscoped_no_org_column" =
      organizationContext.schemaAvailable ? "active_org_plus_legacy" : "unscoped_no_org_column";
    let eventResult = await runEventQuery(eventLookupMode);
    let foundByScopedQuery = Boolean(eventResult.event);
    let foundByLegacyNullQuery = Boolean(eventResult.event && !asText(eventResult.event.organization_id));
    let foundByAllOrgFallback = false;

    if (eventResult.error && organizationContext.schemaAvailable && isMissingOrganizationColumnError(eventResult.error)) {
      logEventDetailFailure("event-scope-fallback", eventResult.error, { eventId, activeOrganizationId });
      eventLookupMode = "unscoped_no_org_column";
      eventResult = await runEventQuery(eventLookupMode);
    }

    if (eventResult.error) {
      logEventDetailFailure("event-query", eventResult.error, {
        eventId,
        userEmail: viewer.email,
        role: viewer.role,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
      });
      return applyAuthCookies(
        jsonEventDetailError(
          {
            error: "server_error",
            message: "Event details could not be loaded.",
            eventId,
            status: 500,
            diagnostics: {
              route: `/api/events/${eventId}`,
              activeOrgId: activeOrganizationId,
              role: viewer.role,
              exactError: exactSupabaseError(eventResult.error),
            },
          },
          { status: 500 }
        ),
        viewer
      );
    }

    if (!eventResult.event && isPlatformOwnerOrSuperAdmin && organizationContext.schemaAvailable) {
      eventLookupMode = "all_org_platform_owner_fallback";
      eventResult = await runEventQuery(eventLookupMode);
      foundByAllOrgFallback = Boolean(eventResult.event);
      if (eventResult.error) {
        logEventDetailFailure("event-all-org-fallback-query", eventResult.error, { eventId, activeOrganizationId });
      }
    }

    const event = eventResult.event
      ? {
          ...eventResult.event,
          event_type: parseEventMetadata(eventResult.event.notes).canonicalEventType,
        }
      : null;
    if (!event) {
      logEventDetail("not-found", {
        userEmail: viewer.email,
        role: viewer.role,
        organizationRole: organizationContext.role,
        activeOrganizationId,
        eventId,
        adminClientUsed: Boolean(adminClient),
        foundByScopedQuery,
        foundByLegacyNullQuery,
        foundByAllOrgFallback,
      });
      return applyAuthCookies(
        jsonEventDetailError(
          {
            error: "not_found",
            message: "Event details were not found for the current access scope.",
            eventId,
            status: 404,
            diagnostics: {
              route: `/api/events/${eventId}`,
              activeOrgId: activeOrganizationId,
              role: viewer.role,
              foundByScopedQuery,
              foundByLegacyNullQuery,
              foundByAllOrgFallback,
            },
          },
          { status: 404 }
        ),
        viewer
      );
    }

    foundByScopedQuery = foundByScopedQuery || eventLookupMode === "active_org_plus_legacy";
    foundByLegacyNullQuery = foundByLegacyNullQuery || !asText(event.organization_id);
    const relatedOrganizationId =
      organizationContext.schemaAvailable && asText(event.organization_id) === activeOrganizationId
        ? activeOrganizationId
        : undefined;
    const shouldScopeRelatedRows = Boolean(relatedOrganizationId);
    const includeLegacyUnscopedRelatedRows = Boolean(relatedOrganizationId);
    const relatedRowsScope = shouldScopeRelatedRows
      ? includeLegacyUnscopedRelatedRows
        ? "active_org_plus_legacy_null"
        : "active_org_only"
      : "event_unscoped";
    logEventDetail("loaded", {
      userEmail: viewer.email,
      role: viewer.role,
      organizationRole: organizationContext.role,
      activeOrganizationId,
      eventId,
      eventOrganizationId: asText(event.organization_id) || null,
      adminClientUsed: Boolean(adminClient),
      eventLookupMode,
      foundByScopedQuery,
      foundByLegacyNullQuery,
      foundByAllOrgFallback,
    });

    let sessionsQuery = supabaseServer
      .from("event_sessions")
      .select("id,event_id,organization_id,session_date,start_time,end_time,location,room,created_at")
      .eq("event_id", eventId)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true });
    sessionsQuery = applyRelatedOrganizationReadScope(
      sessionsQuery,
      shouldScopeRelatedRows ? relatedOrganizationId : undefined,
      includeLegacyUnscopedRelatedRows
    );
    const { data: sessions, error: sessionError } = await sessionsQuery;
    if (sessionError) {
      logEventDetailFailure("sessions-query", sessionError, { eventId, activeOrganizationId, relatedOrganizationId });
    }

    let spSelectColumns = [...spEventDetailBaseColumns, ...spEventDetailOptionalColumns];
    let sps: Array<Record<string, unknown>> = [];
    let spError: SupabaseErrorLike | null = null;
    const missingSpOptionalColumns = new Set<string>();
    for (let attempt = 0; attempt <= spEventDetailOptionalColumns.length; attempt += 1) {
      let spsQuery = supabaseServer
        .from("sps")
        .select(spSelectColumns.join(","));
      spsQuery = applyRelatedOrganizationReadScope(
        spsQuery,
        shouldScopeRelatedRows ? relatedOrganizationId : undefined,
        includeLegacyUnscopedRelatedRows
      );
      const result = await spsQuery;
      if (!result.error) {
        sps = ((result.data || []) as unknown) as Array<Record<string, unknown>>;
        spError = null;
        break;
      }
      const missingColumn = spEventDetailOptionalColumns.find(
        (column) => !missingSpOptionalColumns.has(column) && isMissingColumnError(result.error, column)
      );
      if (!missingColumn) {
        spError = result.error as SupabaseErrorLike;
        break;
      }
      missingSpOptionalColumns.add(missingColumn);
      spSelectColumns = spSelectColumns.filter((column) => column !== missingColumn);
      logEventDetail("sps-query-optional-column-fallback", { eventId, missingColumn });
    }
    const normalizedSps = sps.map((sp) => ({
      id: asText(sp.id),
      first_name: sp.first_name ?? null,
      last_name: sp.last_name ?? null,
      full_name: sp.full_name ?? null,
      working_email: sp.working_email ?? null,
      email: sp.email ?? null,
      phone: sp.phone ?? null,
      portrayal_age: sp.portrayal_age ?? null,
      race: sp.race ?? null,
      sex: sp.sex ?? null,
      telehealth: sp.telehealth ?? null,
      pt_preferred: sp.pt_preferred ?? null,
      other_roles: sp.other_roles ?? null,
      speaks_spanish: sp.speaks_spanish ?? null,
      notes: sp.notes ?? null,
      status: sp.status ?? null,
    }));

    if (spError) {
      logEventDetailFailure("sps-query", spError, { eventId, activeOrganizationId, relatedOrganizationId });
      return applyAuthCookies(
        jsonEventDetailError(
          {
            error: "server_error",
            message: "Event details could not be loaded.",
            eventId,
            status: 500,
            diagnostics: { route: `/api/events/${eventId}`, activeOrgId: activeOrganizationId, role: viewer.role, exactError: exactSupabaseError(spError) },
          },
          { status: 500 }
        ),
        viewer
      );
    }

    const assignmentResult = await loadEventAssignments(
      supabaseServer,
      eventId,
      shouldScopeRelatedRows ? relatedOrganizationId : undefined,
      includeLegacyUnscopedRelatedRows
    );
    const assignments: AssignmentApiRow[] = assignmentResult.assignments;
    const assignmentError = assignmentResult.error;

    if (assignmentError) {
      logEventDetailFailure("assignments-query", assignmentError, { eventId, activeOrganizationId, relatedOrganizationId });
      return applyAuthCookies(
        jsonEventDetailError(
          {
            error: "server_error",
            message: "Event details could not be loaded.",
            eventId,
            status: 500,
            diagnostics: { route: `/api/events/${eventId}`, activeOrgId: activeOrganizationId, role: viewer.role, exactError: exactSupabaseError(assignmentError) },
          },
          { status: 500 }
        ),
        viewer
      );
    }

    let availabilityQuery = supabaseServer
      .from("sp_availability")
      .select("*")
      .limit(1000);
    availabilityQuery = applyRelatedOrganizationReadScope(
      availabilityQuery,
      shouldScopeRelatedRows ? relatedOrganizationId : undefined,
      includeLegacyUnscopedRelatedRows
    );
    const { data: availabilityRows, error: availabilityError } = await availabilityQuery;
    if (availabilityError) {
      logEventDetailFailure("availability-query", availabilityError, { eventId, activeOrganizationId, relatedOrganizationId });
    }

    const parsedEventMetadataForDiagnostics = parseEventMetadata(event.notes);
    const parsedTrainingMetadataForDiagnostics = parsedEventMetadataForDiagnostics.training;
    const metadataKeysPresent = Object.entries(parsedTrainingMetadataForDiagnostics)
      .filter(([, value]) => Boolean(asText(value)))
      .map(([key]) => key);
    const assignmentRowsForDiagnostics = assignments || [];
    const sessionRowsForDiagnostics = sessions || [];
    const eventDetailDiagnostics = {
      route: `/api/events/${eventId}`,
      eventId,
      eventOrganizationId: asText(event.organization_id) || null,
      activeOrgId: activeOrganizationId,
      role: viewer.role,
      organizationRole: organizationContext.role || null,
      accessStatus: organizationContext.accessStatus || null,
      eventLookupMode,
      relatedRowsScope,
      foundByScopedQuery,
      foundByLegacyNullQuery,
      foundByAllOrgFallback,
      spNeeded: event.sp_needed ?? null,
      loadedAssignmentsCount: assignmentRowsForDiagnostics.length,
      confirmedAssignmentsCount: assignmentRowsForDiagnostics.filter((assignment) => normalizeAssignmentRow(assignment).confirmed).length,
      contactedAssignmentsCount: assignmentRowsForDiagnostics.filter((assignment) => {
        const status = asText(normalizeAssignmentRow(assignment).status).toLowerCase();
        return status === "contacted" || status === "invited";
      }).length,
      legacyNullAssignmentsCount: assignmentRowsForDiagnostics.filter((assignment) => !asText(assignment.organization_id)).length,
      loadedSessionsCount: sessionRowsForDiagnostics.length,
      legacyNullSessionsCount: sessionRowsForDiagnostics.filter((session) => !asText((session as { organization_id?: unknown }).organization_id)).length,
      loadedSpsCount: normalizedSps.length,
      availabilityRowsCount: (availabilityRows || []).length,
      parsedMetadataKeyCount: metadataKeysPresent.length,
      parsedMetadataKeysPresent: metadataKeysPresent.slice(0, 80),
    };
    const includeEventDetailDiagnostics = isOperatorRole(viewer.role) || process.env.NODE_ENV !== "production";

    if (viewer.role === "sp") {
      const viewerMatchedSpId = viewer.linkedSpId;
      const eventSpIds = new Set(
        (assignments || []).map((assignment) => asText((assignment as { sp_id?: unknown }).sp_id))
      );
      const matched = normalizedSps.some((sp) => {
        const spId = asText(sp.id);
        if (!eventSpIds.has(spId)) return false;
        if (viewerMatchedSpId && spId === viewerMatchedSpId) return true;
        return viewerMatchesAssignedSp(sp as AssignedSpApiRow, viewer);
      });

      if (!matched) {
        return applyAuthCookies(
          jsonEventDetailError(
            {
              error: "forbidden",
              message: "You do not have access to this event.",
              eventId,
              status: 403,
              diagnostics: { route: `/api/events/${eventId}`, activeOrgId: activeOrganizationId, role: viewer.role },
            },
            { status: 403 }
          ),
          viewer
        );
      }

      const matchingSp =
        normalizedSps.find((sp) => {
          const spId = asText(sp.id);
          if (viewerMatchedSpId && spId === viewerMatchedSpId) return true;
          return viewerMatchesAssignedSp(sp as AssignedSpApiRow, viewer);
        }) || null;
      const viewerSpId = asText(matchingSp?.id);
      const viewerAssignments = ((assignments || []) as Array<Record<string, unknown>>).filter(
        (assignment) => asText(assignment.sp_id) === viewerSpId
      );
      const metadata = parseTrainingEventMetadata(event.notes);
      const sessionDates = (sessions || [])
        .map((session) => normalizeLooseDateToIso(session.session_date, getImportedYearHint(event.notes)))
        .filter(Boolean);

      return applyAuthCookies(
        NextResponse.json({
          ok: true,
          viewerRole: "sp",
          event: sanitizeEventForSp(event),
          sessions: (sessions || []).map((session) => ({
            id: session.id,
            event_id: session.event_id,
            session_date: session.session_date,
            start_time: session.start_time,
            end_time: session.end_time,
            location: session.location,
            room: session.room,
            created_at: session.created_at,
          })),
          sps: matchingSp
            ? [
                {
                  id: matchingSp.id,
                  first_name: matchingSp.first_name,
                  last_name: matchingSp.last_name,
                  full_name: matchingSp.full_name,
                  working_email: matchingSp.working_email,
                  email: matchingSp.email,
                  phone: matchingSp.phone,
                  portrayal_age: null,
                  race: null,
                  sex: null,
                  telehealth: null,
                  pt_preferred: null,
                  other_roles: null,
                  speaks_spanish: null,
                  notes: null,
                  status: matchingSp.status,
                },
              ]
            : [],
          assignments: viewerAssignments,
          availabilityRows: (availabilityRows || []).filter((row) => asText((row as { sp_id?: unknown }).sp_id) === viewerSpId),
          errorMessage: "",
          sessionErrorMessage: sessionError ? "Could not load event sessions right now. Please retry." : "",
          availabilityErrorMessage: availabilityError ? "Could not load SP availability right now. Please retry." : "",
          ...(includeEventDetailDiagnostics ? { diagnostics: eventDetailDiagnostics } : {}),
          spPortal: {
            sp_link_status: viewer.linkedSpId ? "linked" : "pending",
            assigned_sp_name: asText(matchingSp?.full_name) || null,
            faculty_name: metadata.faculty_names || null,
            faculty_email: metadata.faculty_email || null,
            faculty_phone: metadata.faculty_phone || null,
            program: metadata.faculty_program || null,
            sim_contact: metadata.sim_contact || null,
            zoom_url: metadata.zoom_url || null,
            training_password: metadata.training_password || null,
            recording_url: metadata.recording_url || null,
            materials: [
              {
                key: "case",
                label: "Case",
                url: metadata.case_file_url || null,
                name: metadata.case_file_name || metadata.case_name || null,
              },
              {
                key: "doorsign",
                label: "Doorsign",
                url: metadata.doorsign_url || null,
                name: metadata.doorsign_file_name || null,
              },
              {
                key: "supplemental",
                label: "Supplemental docs",
                url: metadata.supplemental_doc_url || null,
                name: metadata.supplemental_doc_name || null,
              },
              {
                key: "recording",
                label: "Recording guide",
                url: metadata.recording_url || null,
                name: metadata.recording_url ? "Recording guide" : null,
              },
            ].filter((item) => item.url),
            session_dates: sessionDates,
          },
        }),
        viewer
      );
    }

    let relatedOperationalEvents = isOperatorRole(viewer.role)
        ? await loadRelatedOperationalEvents(
            supabaseServer,
            event as RelatedEventRow,
            shouldScopeRelatedRows ? relatedOrganizationId : undefined,
            includeLegacyUnscopedRelatedRows
          )
      : [];
    if (
      isOperatorRole(viewer.role) &&
      explicitTrainingSourceId &&
      explicitTrainingSourceId !== eventId &&
      !relatedOperationalEvents.some((node) => node.id === explicitTrainingSourceId)
    ) {
      let explicitTrainingQuery = supabaseServer
        .from("events")
        .select("id,name,status,date_text,location,notes,created_at,organization_id")
        .eq("id", explicitTrainingSourceId);
      explicitTrainingQuery = applyRelatedOrganizationReadScope(
        explicitTrainingQuery,
        shouldScopeRelatedRows ? relatedOrganizationId : undefined,
        includeLegacyUnscopedRelatedRows
      );
      const explicitTrainingResult = await explicitTrainingQuery.maybeSingle();
      if (explicitTrainingResult.error) {
        logEventDetailFailure("training-source-query", explicitTrainingResult.error, {
          eventId,
          trainingSourceId: explicitTrainingSourceId,
          activeOrganizationId,
          relatedOrganizationId,
        });
      } else if (explicitTrainingResult.data) {
        const trainingSource = explicitTrainingResult.data as RelatedEventRow;
        const trainingSourceKind = classifyRelatedEventNode(trainingSource);
        if (trainingSourceKind === "training") {
          relatedOperationalEvents = [
            {
              id: trainingSource.id,
              name: trainingSource.name,
              status: trainingSource.status,
              date_text: trainingSource.date_text,
              location: trainingSource.location,
              match_reason: "Linked from trainingSource URL parameter",
              match_confidence: "exact_course",
              kind: "training",
              isConfirmed: true,
              relationship: "Training",
              trainingMetadata: parseTrainingEventMetadata(trainingSource.notes),
              exact_course_match: true,
            },
            ...relatedOperationalEvents,
          ];
        }
      }
    }
    const primaryEventForTrainingRecord =
      isOperatorRole(viewer.role) && isStandaloneTrainingRecord(event as RelatedEventRow & { sp_needed?: number | null })
        ? pickPrimaryEventForTrainingRecord(relatedOperationalEvents)
        : null;
    const trainingRecordSearch =
      isOperatorRole(viewer.role) && isStandaloneTrainingRecord(event as RelatedEventRow & { sp_needed?: number | null })
        ? getTrainingRecordFallbackSearch(event as RelatedEventRow)
        : "";

    return applyAuthCookies(
      NextResponse.json({
        ok: true,
        viewerRole: viewer.role,
        redirectToPrimaryEventId: primaryEventForTrainingRecord ? asText(primaryEventForTrainingRecord.id) : "",
        redirectToPrimaryEventName: primaryEventForTrainingRecord ? asText(primaryEventForTrainingRecord.name) : "",
        sourceTrainingEventId: primaryEventForTrainingRecord || trainingRecordSearch ? event.id : "",
        redirectToEventsSearch: !primaryEventForTrainingRecord ? trainingRecordSearch : "",
        event,
        sessions: sessions || [],
        sps: [...normalizedSps],
        assignments: assignments || [],
        availabilityRows: availabilityRows || [],
        relatedEvents: relatedOperationalEvents,
        errorMessage: "",
        sessionErrorMessage: sessionError ? "Could not load event sessions right now. Please retry." : "",
        availabilityErrorMessage: availabilityError ? "Could not load SP availability right now. Please retry." : "",
        ...(includeEventDetailDiagnostics ? { diagnostics: eventDetailDiagnostics } : {}),
      }),
      viewer
    );
  } catch (error) {
    logEventDetailFailure("catch", error);
    return jsonEventDetailError(
      {
        error: "server_error",
        message: "Event details could not be loaded.",
        status: 500,
        diagnostics: {
          exactError: exactSupabaseError(error),
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
    if (!roleCanOperateOrganization(organizationContext.role)) {
      return forbiddenJson("Only Sim Ops or admin accounts can manage event staffing.", organizationContext);
    }

    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return unauthorizedJson(organizationContext);
    }
    viewer.role = organizationContext.legacyRole;
    viewer.accessToken = organizationContext.accessToken;
    const activeOrganizationId = organizationContext.activeOrganization!.id;
    const privilegedWrite = canUsePrivilegedEventWrite(organizationContext);
    const viewerScopedClient = createViewerScopedClient(organizationContext.accessToken);
    const adminClient = privilegedWrite ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || viewerScopedClient;
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json();
    const spId = typeof body?.sp_id === "string" ? body.sp_id : "";
    const requestedStatus = typeof body?.status === "string" ? body.status.trim() : "";
    const requestedConfirmed = typeof body?.confirmed === "boolean" ? body.confirmed : undefined;
    const requestedNotes =
      typeof body?.notes === "string" ? body.notes.trim() || null : body?.notes === null ? null : undefined;

    if (!eventId || !spId) {
      return applyAuthCookies(
        jsonEventDetailError({ error: "bad_request", message: "Missing event id or SP id.", eventId, status: 400 }, { status: 400 }),
        viewer
      );
    }

    const eventCheck = await supabaseServer
      .from("events")
      .select("id,organization_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventCheck.error && isMissingOrganizationColumnError(eventCheck.error)) {
      const fallbackEventCheck = await supabaseServer.from("events").select("id").eq("id", eventId).maybeSingle();
      if (fallbackEventCheck.error || !fallbackEventCheck.data) {
        logEventWriteFailure("assignment-event-check", fallbackEventCheck.error || "not_found", {
          route: "POST /api/events/[id]",
          eventId,
          userEmail: viewer.email,
          role: viewer.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
          payloadKeys: Object.keys(body || {}),
        });
        return applyAuthCookies(
          jsonEventDetailError({ error: fallbackEventCheck.error ? "server_error" : "not_found", message: fallbackEventCheck.error ? "Could not validate event before assignment." : "Event was not found.", eventId, status: fallbackEventCheck.error ? 500 : 404 }, { status: fallbackEventCheck.error ? 500 : 404 }),
          viewer
        );
      }
    } else if (eventCheck.error || !eventCheck.data) {
      logEventWriteFailure("assignment-event-check", eventCheck.error || "not_found", {
        route: "POST /api/events/[id]",
        eventId,
        userEmail: viewer.email,
        role: viewer.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
        payloadKeys: Object.keys(body || {}),
      });
      return applyAuthCookies(
        jsonEventDetailError({ error: eventCheck.error ? "server_error" : "not_found", message: eventCheck.error ? "Could not validate event before assignment." : "Event was not found.", eventId, status: eventCheck.error ? 500 : 404 }, { status: eventCheck.error ? 500 : 404 }),
        viewer
      );
    }

    const eventOrganizationId = asText((eventCheck.data as { organization_id?: unknown } | null)?.organization_id);
    if (!canMutateEventForActiveOrganization(organizationContext, eventOrganizationId)) {
      logEventWriteFailure("assignment-event-organization-check", "forbidden", {
        route: "POST /api/events/[id]",
        eventId,
        eventOrganizationId,
        activeOrganizationId,
        userEmail: viewer.email,
        role: viewer.role,
        adminClientUsed: Boolean(adminClient),
      });
      return forbiddenJson("You do not have permission to update this event.", organizationContext);
    }

    const spCheck = await supabaseServer.from("sps").select("id").eq("id", spId).maybeSingle();
    if (spCheck.error || !spCheck.data) {
      logEventWriteFailure("assignment-sp-check", spCheck.error || "not_found", {
        route: "POST /api/events/[id]",
        eventId,
        spId,
        userEmail: viewer.email,
        role: viewer.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
        payloadKeys: Object.keys(body || {}),
      });
      return applyAuthCookies(
        jsonEventDetailError({ error: spCheck.error ? "server_error" : "not_found", message: spCheck.error ? "Could not validate SP before assignment." : "SP was not found.", eventId, status: spCheck.error ? 500 : 404 }, { status: spCheck.error ? 500 : 404 }),
        viewer
      );
    }

    const existingAssignmentQuery = supabaseServer
      .from("event_sps")
      .select("id")
      .eq("event_id", eventId)
      .eq("sp_id", spId);
    const { data: existingAssignment, error: existingAssignmentError } = await existingAssignmentQuery.maybeSingle();

    if (existingAssignmentError) {
      logEventWriteFailure("assignment-existing-check", existingAssignmentError, {
        route: "POST /api/events/[id]",
        eventId,
        spId,
        userEmail: viewer.email,
        role: viewer.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
        payloadKeys: Object.keys(body || {}),
      });
      return applyAuthCookies(
        jsonEventDetailError({ error: "server_error", message: "Could not check existing assignment.", eventId, status: 500, diagnostics: { route: "POST /api/events/[id]", exactError: exactSupabaseError(existingAssignmentError) } }, { status: 500 }),
        viewer
      );
    }

    const nextStatus = requestedStatus || "invited";
    const nextConfirmed =
      typeof requestedConfirmed === "boolean" ? requestedConfirmed : nextStatus === "confirmed";

    const assignmentPayload = {
      event_id: eventId,
      ...(eventOrganizationId ? { organization_id: eventOrganizationId } : {}),
      sp_id: spId,
      status: nextStatus,
      assignment_status: nextStatus,
      role_name: nextStatus,
      confirmed: nextConfirmed,
      ...(requestedNotes !== undefined ? { notes: requestedNotes } : {}),
    };

    const saveResult = existingAssignment?.id
      ? await supabaseServer
          .from("event_sps")
          .update({
            status: nextStatus,
            assignment_status: nextStatus,
            role_name: nextStatus,
            confirmed: nextConfirmed,
            ...(requestedNotes !== undefined ? { notes: requestedNotes } : {}),
          })
          .eq("id", existingAssignment.id)
      : await supabaseServer
          .from("event_sps")
          .insert(assignmentPayload);

    if (saveResult.error) {
      logEventWriteFailure("assignment-save", saveResult.error, {
        route: "POST /api/events/[id]",
        eventId,
        spId,
        userEmail: viewer.email,
        role: viewer.role,
        activeOrganizationId,
        eventOrganizationId: eventOrganizationId || null,
        adminClientUsed: Boolean(adminClient),
        payloadKeys: Object.keys(body || {}),
      });
      return applyAuthCookies(
        jsonEventDetailError({ error: "server_error", message: "Could not save assignment.", eventId, status: 500, diagnostics: { route: "POST /api/events/[id]", exactError: exactSupabaseError(saveResult.error) } }, { status: 500 }),
        viewer
      );
    }

    const refreshedAssignment = existingAssignment?.id
      ? await fetchAssignmentById(supabaseServer, eventId, existingAssignment.id)
      : await supabaseServer
          .from("event_sps")
          .select("id,event_id,sp_id,status,assignment_status,role_name,confirmed,notes,last_contacted_at,contact_method,created_at")
          .eq("event_id", eventId)
          .eq("sp_id", spId)
          .maybeSingle();

    return applyAuthCookies(
      NextResponse.json({
        ok: true,
        updated_existing: Boolean(existingAssignment?.id),
        assignment: "assignment" in refreshedAssignment ? refreshedAssignment.assignment : refreshedAssignment.data,
      }, { status: existingAssignment?.id ? 200 : 201 }),
      viewer
    );
  } catch (error) {
    logEventWriteFailure("assignment-catch", error);
    return jsonEventDetailError({ error: "server_error", message: "Could not save assignment.", status: 500, diagnostics: { exactError: exactSupabaseError(error) } }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) {
      logEventSettingsSaveRejected("unauthorized", {
        reason: "missing_session",
        userId: null,
        organizationId: null,
        role: null,
      });
      return unauthorizedJson(organizationContext);
    }
    if (!requireActiveOrganization(organizationContext)) {
      logEventSettingsSaveRejected("forbidden", {
        reason: "no_active_organization",
        userId: organizationContext.user.id,
        organizationId: organizationContext.activeOrganization?.id || null,
        role: organizationContext.role || null,
      });
      return noActiveOrganizationJson(organizationContext);
    }
    if (!roleCanOperateOrganization(organizationContext.role)) {
      logEventSettingsSaveRejected("forbidden", {
        reason: "role_cannot_operate",
        userId: organizationContext.user.id,
        organizationId: organizationContext.activeOrganization?.id || null,
        role: organizationContext.role || null,
      });
      return forbiddenJson("Only Sim Ops or admin accounts can edit event operations.", organizationContext);
    }

    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      logEventSettingsSaveRejected("unauthorized", {
        reason: "viewer_context_unavailable",
        userId: organizationContext.user.id,
        organizationId: organizationContext.activeOrganization?.id || null,
        role: organizationContext.role || null,
      });
      return unauthorizedJson(organizationContext);
    }
    viewer.role = organizationContext.legacyRole;
    viewer.accessToken = organizationContext.accessToken;
    const activeOrganizationId = organizationContext.activeOrganization!.id;
    const privilegedWrite = canUsePrivilegedEventWrite(organizationContext);
    const shouldScopeByOrganization = organizationContext.schemaAvailable && !privilegedWrite;
    const viewerScopedClient = createViewerScopedClient(organizationContext.accessToken);
    const adminClient = privilegedWrite ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || viewerScopedClient;
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json();
    logEventSetupSave("received", {
      eventId,
      hasEventUpdates: Boolean(body && typeof body === "object" && body?.event_updates),
      eventUpdateKeys: typeof body?.event_updates === "object" && body?.event_updates !== null
        ? Object.keys(body.event_updates as Record<string, unknown>)
        : [],
      hasSessionUpdates: Boolean(body && typeof body === "object" && body?.session_updates),
      sessionUpdateKeys: typeof body?.session_updates === "object" && body?.session_updates !== null
        ? Object.keys(body.session_updates as Record<string, unknown>)
        : [],
      hasSessionReplacements: Array.isArray(body?.session_replacements),
      hasAssignmentId: Boolean(typeof body?.assignment_id === "string" && body.assignment_id),
      hasAssignmentUpdates: Boolean(typeof body?.updates === "object" && body?.updates !== null),
      activeOrganizationId,
      role: viewer.role,
      payloadKeys: Object.keys(body || {}),
    });
    const eventUpdates = getSafeEventUpdates(body?.event_updates);
    const sessionUpdates = getSafeSessionUpdates(body?.session_updates);
    const sessionReplacements = getSafeSessionReplacementPayload(
      body?.session_replacements,
      eventId,
      eventUpdates?.location
    );
    const hasSessionReplacements = Array.isArray(sessionReplacements) && sessionReplacements.length > 0;
    if (
      Array.isArray(body?.session_replacements) &&
      body.session_replacements.length > 0 &&
      !hasSessionReplacements
    ) {
      return jsonEventDetailError(
        {
          error: "bad_request",
          message: "At least one valid event session is required before saving.",
          eventId,
          status: 400,
        },
        { status: 400 }
      );
    }
    const assignmentId = typeof body?.assignment_id === "string" ? body.assignment_id : "";
    const updates = getSafeAssignmentUpdates(body?.updates);
    const attendanceAction =
      typeof body?.attendance_action === "string" ? body.attendance_action.trim().toLowerCase() : "";
    let eventOrganizationId = "";
    let eventBackup: Record<string, unknown> | null = null;
    let sessionBackup: Array<Record<string, unknown>> = [];
    if (eventId && (eventUpdates || sessionUpdates || sessionReplacements || attendanceAction || assignmentId)) {
      const eventCheck = await supabaseServer
        .from("events")
        .select("id,name,status,date_text,sp_needed,visibility,location,notes,organization_id")
        .eq("id", eventId)
        .maybeSingle();
      if (eventCheck.error && !isMissingOrganizationColumnError(eventCheck.error)) {
        logEventWriteFailure("patch-event-check", eventCheck.error, {
          route: "PATCH /api/events/[id]",
          eventId,
          userEmail: viewer.email,
          role: viewer.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
          payloadKeys: Object.keys(body || {}),
        });
        return applyAuthCookies(
          jsonEventDetailError({ error: "server_error", message: "Could not validate event before saving.", eventId, status: 500, diagnostics: { route: "PATCH /api/events/[id]", exactError: exactSupabaseError(eventCheck.error) } }, { status: 500 }),
          viewer
        );
      }
      if (!eventCheck.error && !eventCheck.data) {
        return applyAuthCookies(
          jsonEventDetailError({ error: "not_found", message: "Event was not found.", eventId, status: 404 }, { status: 404 }),
          viewer
        );
      }
      eventBackup = (eventCheck.data as Record<string, unknown> | null) || null;
      eventOrganizationId = asText((eventCheck.data as { organization_id?: unknown } | null)?.organization_id);
      if (!canMutateEventForActiveOrganization(organizationContext, eventOrganizationId)) {
        logEventSettingsSaveRejected("forbidden", {
          reason: "event_organization_mismatch",
          eventId,
          userId: organizationContext.user.id,
          userEmail: viewer.email,
          organizationId: eventOrganizationId || null,
          activeOrganizationId,
          role: organizationContext.role || null,
          legacyRole: organizationContext.legacyRole || null,
        });
        logEventWriteFailure("patch-event-organization-check", "forbidden", {
          route: "PATCH /api/events/[id]",
          eventId,
          eventOrganizationId,
          activeOrganizationId,
          userEmail: viewer.email,
          role: viewer.role,
          adminClientUsed: Boolean(adminClient),
          payloadKeys: Object.keys(body || {}),
        });
        return forbiddenJson("You do not have permission to update this event.", organizationContext);
      }
      if (!eventOrganizationId && organizationContext.schemaAvailable && activeOrganizationId) {
        eventOrganizationId = activeOrganizationId;
        logEventSetupSave("claiming legacy event organization", {
          eventId,
          activeOrganizationId,
          userEmail: viewer.email,
          role: viewer.role,
        });
      }

      if (sessionReplacements) {
        let backupSessionsQuery = supabaseServer
          .from("event_sessions")
          .select("id,event_id,session_date,start_time,end_time,location,room")
          .eq("event_id", eventId);
        backupSessionsQuery = applyRelatedOrganizationReadScope(
          backupSessionsQuery,
          shouldScopeByOrganization ? activeOrganizationId : undefined,
          shouldScopeByOrganization
        );
        const { data: existingSessions, error: existingSessionsError } = await backupSessionsQuery;
        if (existingSessionsError) {
          logEventWriteFailure("patch-session-backup", existingSessionsError, {
            route: "PATCH /api/events/[id]",
            eventId,
            activeOrganizationId,
          });
          return applyAuthCookies(
            jsonEventDetailError({ error: "server_error", message: "Could not validate existing sessions before saving.", eventId, status: 500 }, { status: 500 }),
            viewer
          );
        }
        sessionBackup = ((existingSessions || []) as Array<Record<string, unknown>>).map((session) => ({ ...session }));
      }
    }

    async function restoreEventPatchState(stage: string) {
      if (!eventId) return;
      if (eventBackup) {
        const eventRestorePayload = { ...eventBackup };
        delete eventRestorePayload.id;
        delete eventRestorePayload.organization_id;
        const { error: restoreEventError } = await supabaseServer
          .from("events")
          .update(eventRestorePayload)
          .eq("id", eventId);
        if (restoreEventError) {
          logEventWriteFailure("patch-restore-event", restoreEventError, { eventId, stage });
        }
      }

      if (sessionBackup.length || hasSessionReplacements) {
        const { error: deleteRestoreSessionsError } = await supabaseServer
          .from("event_sessions")
          .delete()
          .eq("event_id", eventId);
        if (deleteRestoreSessionsError) {
          logEventWriteFailure("patch-restore-delete-sessions", deleteRestoreSessionsError, { eventId, stage });
          return;
        }

        if (sessionBackup.length) {
          const restoreRows = sessionBackup.map((session) => ({
            ...session,
            event_id: eventId,
            ...(eventOrganizationId ? { organization_id: eventOrganizationId } : {}),
          }));
          const { error: restoreSessionsError } = await supabaseServer
            .from("event_sessions")
            .insert(restoreRows);
          if (restoreSessionsError) {
            logEventWriteFailure("patch-restore-insert-sessions", restoreSessionsError, { eventId, stage });
          }
        }
      }
    }

    if (eventId && (eventUpdates || sessionUpdates || hasSessionReplacements)) {
      const requestedEventUpdateKeys = eventUpdates ? Object.keys(eventUpdates) : [];
      const requestedSessionUpdateKeys = sessionUpdates ? Object.keys(sessionUpdates) : [];
      const requestedSessionReplacementCount = hasSessionReplacements ? sessionReplacements.length : 0;
      const nextEventUpdates = eventUpdates ? { ...eventUpdates } : {};
      if (
        organizationContext.schemaAvailable &&
        eventOrganizationId === activeOrganizationId &&
        !asText((eventBackup as { organization_id?: unknown } | null)?.organization_id)
      ) {
        nextEventUpdates.organization_id = activeOrganizationId;
      }
      if (
        Object.prototype.hasOwnProperty.call(nextEventUpdates, "sp_needed") &&
        Number(nextEventUpdates.sp_needed || 0) === 0 &&
        Number((eventBackup as { sp_needed?: unknown } | null)?.sp_needed || 0) > 0 &&
        body?.explicit_zero_sp_needed !== true
      ) {
        delete nextEventUpdates.sp_needed;
        logEventSetupSave("preserved nonzero sp_needed from implicit zero", {
          eventId,
          route: "PATCH /api/events/[id]",
          existingSpNeeded: Number((eventBackup as { sp_needed?: unknown } | null)?.sp_needed || 0),
          requestedSpNeeded: 0,
        });
      }
      let updatedEvent: Record<string, unknown> | null = null;
      if (eventUpdates && Object.prototype.hasOwnProperty.call(eventUpdates, "notes")) {
        const requestedNotes =
          typeof eventUpdates.notes === "string" || eventUpdates.notes === null
            ? eventUpdates.notes
            : null;
        let existingEventQuery = supabaseServer
          .from("events")
          .select("notes")
          .eq("id", eventId);
        if (shouldScopeByOrganization) existingEventQuery = existingEventQuery.eq("organization_id", activeOrganizationId);
        const { data: existingEvent, error: existingEventError } = await existingEventQuery.maybeSingle();

        if (existingEventError) {
          return applyAuthCookies(
            NextResponse.json(
              { error: getErrorMessage(existingEventError, "Could not load existing event notes.") },
              { status: 500 }
            ),
            viewer
          );
        }

        nextEventUpdates.notes = mergeEventNotesPreservingMetadata(
          existingEvent?.notes ?? null,
          requestedNotes
        );
      }

      if (sessionUpdates && "session_date" in sessionUpdates) {
        nextEventUpdates.date_text = sessionUpdates.session_date;
      }

      if (Object.keys(nextEventUpdates).length > 0) {
        let saveEventQuery = supabaseServer
          .from("events")
          .update(nextEventUpdates)
          .eq("id", eventId);
        if (shouldScopeByOrganization) saveEventQuery = saveEventQuery.eq("organization_id", activeOrganizationId);
        const { data: savedEvent, error } = await saveEventQuery
          .select("id,name,status,date_text,sp_needed,location,notes")
          .maybeSingle();

        if (error) {
          logEventSetupSaveFailure("patch-event-update", error, {
            eventId,
            requestedEventUpdateKeys,
            route: "PATCH /api/events/[id]",
          });
          logEventWriteFailure("patch-event-update", error, {
            route: "PATCH /api/events/[id]",
            eventId,
            eventOrganizationId,
            activeOrganizationId,
            userEmail: viewer.email,
            role: viewer.role,
            adminClientUsed: Boolean(adminClient),
            payloadKeys: Object.keys(body || {}),
          });
          logEventSetupSave("failed", {
            eventId,
            route: "PATCH /api/events/[id]",
            reason: "patch-event-update",
          });
          return applyAuthCookies(
            NextResponse.json(
              { error: getErrorMessage(error, "Could not save event details. Please refresh and try again.") },
              { status: 500 }
            ),
            viewer
          );
        }
        updatedEvent = (savedEvent as Record<string, unknown> | null) || null;
        logEventSetupSave("saved fields", {
          eventId,
          route: "PATCH /api/events/[id]",
          savedEventFields: Object.keys(nextEventUpdates),
          requestedEventUpdateKeys,
        });
        logEventSetupSave("preserved existing fields", {
          eventId,
          route: "PATCH /api/events/[id]",
          preservedEventFields: ["name", "status", "visibility", "location", "date_text", "notes", "sp_needed"].filter(
            (field) => !requestedEventUpdateKeys.includes(field)
          ),
        });
      }

      if (hasSessionReplacements) {
        logEventSetupSave("saved fields", {
          eventId,
          route: "PATCH /api/events/[id]",
          savedSessionReplacementCount: requestedSessionReplacementCount,
        });
        let deleteSessionsQuery = supabaseServer
          .from("event_sessions")
          .delete()
          .eq("event_id", eventId);
        deleteSessionsQuery = applyRelatedOrganizationReadScope(
          deleteSessionsQuery,
          shouldScopeByOrganization ? activeOrganizationId : undefined,
          shouldScopeByOrganization
        );
        const { error: deleteSessionsError } = await deleteSessionsQuery;

        if (deleteSessionsError) {
          logEventSetupSaveFailure("patch-session-replacements-delete", deleteSessionsError, { eventId });
          await restoreEventPatchState("delete-session-replacements");
          return applyAuthCookies(
            NextResponse.json(
              { error: getErrorMessage(deleteSessionsError, "Could not replace event sessions.") },
              { status: 500 }
            ),
            viewer
          );
        }

        if (hasSessionReplacements) {
          const { error: insertSessionsError } = await supabaseServer
            .from("event_sessions")
            .insert(
            (sessionReplacements || []).map((session) => ({
                ...session,
                ...(eventOrganizationId ? { organization_id: eventOrganizationId } : shouldScopeByOrganization ? { organization_id: activeOrganizationId } : {}),
              }))
            );

          if (insertSessionsError) {
            logEventSetupSaveFailure("patch-session-replacements-insert", insertSessionsError, {
              eventId,
              requestedSessionReplacementCount,
            });
            await restoreEventPatchState("insert-session-replacements");
            return applyAuthCookies(
              NextResponse.json(
                { error: getErrorMessage(insertSessionsError, "Could not save event sessions. The previous event schedule was restored.") },
                { status: 500 }
              ),
              viewer
            );
          }
        }
      } else if (sessionUpdates) {
        logEventSetupSave("saved fields", {
          eventId,
          route: "PATCH /api/events/[id]",
          savedSessionUpdateKeys: requestedSessionUpdateKeys,
        });
        let existingSessionQuery = supabaseServer
          .from("event_sessions")
          .select("id")
          .eq("event_id", eventId)
          .order("session_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(1);
        existingSessionQuery = applyRelatedOrganizationReadScope(
          existingSessionQuery,
          shouldScopeByOrganization ? activeOrganizationId : undefined,
          shouldScopeByOrganization
        );
        const { data: existingSession, error: existingSessionError } = await existingSessionQuery.maybeSingle();

        if (existingSessionError) {
          return applyAuthCookies(
            NextResponse.json(
              { error: getErrorMessage(existingSessionError, "Could not load event session.") },
              { status: 500 }
            ),
            viewer
          );
        }

        if (existingSession?.id) {
          logEventSetupSave("saved fields", {
            eventId,
            route: "PATCH /api/events/[id]",
            savedSessionUpdateKeys: requestedSessionUpdateKeys,
          });
          let updateSessionQuery = supabaseServer
            .from("event_sessions")
            .update(sessionUpdates)
            .eq("id", existingSession.id)
            .eq("event_id", eventId);
          updateSessionQuery = applyRelatedOrganizationReadScope(
            updateSessionQuery,
            shouldScopeByOrganization ? activeOrganizationId : undefined,
            shouldScopeByOrganization
          );
          const { error } = await updateSessionQuery;

          if (error) {
            logEventSetupSaveFailure("patch-session-update", error, {
              eventId,
              requestedSessionUpdateKeys,
            });
            return applyAuthCookies(
              NextResponse.json(
                { error: getErrorMessage(error, "Could not update event session.") },
                { status: 500 }
              ),
              viewer
            );
          }
        } else {
          const hasSessionValue = Object.values(sessionUpdates).some((value) => value !== null);
          if (hasSessionValue) {
            const { error } = await supabaseServer
              .from("event_sessions")
              .insert({
                event_id: eventId,
                ...(eventOrganizationId ? { organization_id: eventOrganizationId } : shouldScopeByOrganization ? { organization_id: activeOrganizationId } : {}),
                session_date: sessionUpdates.session_date ?? null,
                start_time: sessionUpdates.start_time ?? null,
                end_time: sessionUpdates.end_time ?? null,
              });

            if (error) {
              logEventSetupSaveFailure("patch-session-insert", error, {
                eventId,
                requestedSessionUpdateKeys,
              });
              await restoreEventPatchState("insert-single-session");
              return applyAuthCookies(
                NextResponse.json(
                  { error: getErrorMessage(error, "Could not create event session.") },
                  { status: 500 }
                ),
                viewer
              );
            }
          }
        }
      }

      const notesForContact =
        asText((nextEventUpdates as { notes?: unknown }).notes) ||
        asText((eventBackup as { notes?: unknown } | null)?.notes);
      const facultyMetadata = parseEventMetadata(notesForContact).training;
      const contactSave = await upsertOrganizationFacultyContact({
        db: supabaseServer,
        organizationId: activeOrganizationId,
        name: asText(facultyMetadata.faculty_names),
        email: asText(facultyMetadata.faculty_email),
        sourceEventId: eventId,
      });

      if (!contactSave.ok) {
        logEventWriteFailure("organization-contact-upsert", contactSave.warning, {
          eventId,
          activeOrganizationId,
        });
      }

      return applyAuthCookies(
        NextResponse.json({
          ok: true,
          event: updatedEvent,
          ...(contactSave.warning ? { warning: contactSave.warning } : {}),
        }),
        viewer
      );
    }

    if (eventId && (attendanceAction === "confirm_all" || attendanceAction === "clear_all")) {
      const nextAttended = attendanceAction === "confirm_all";
      const nextCheckedAt = nextAttended ? new Date().toISOString() : null;
      let updateAttendanceQuery = supabaseServer
        .from("event_sps")
        .update({
          training_attended: nextAttended,
          training_checked_in_at: nextCheckedAt,
        })
        .eq("event_id", eventId);
      updateAttendanceQuery = applyRelatedOrganizationReadScope(
        updateAttendanceQuery,
        shouldScopeByOrganization ? activeOrganizationId : undefined,
        shouldScopeByOrganization
      );
      const { error } = await updateAttendanceQuery;

      if (error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: getErrorMessage(error, "Could not update training attendance.") },
            { status: 500 }
          ),
          viewer
        );
      }

      const refreshedAssignments = await loadEventAssignments(
        supabaseServer,
        eventId,
        shouldScopeByOrganization ? activeOrganizationId : undefined,
        shouldScopeByOrganization
      );
      if (refreshedAssignments.error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: getErrorMessage(refreshedAssignments.error, "Could not reload assignments.") },
            { status: 500 }
          ),
          viewer
        );
      }

      return applyAuthCookies(
        NextResponse.json({
          ok: true,
          assignments: refreshedAssignments.assignments,
        }),
        viewer
      );
    }

    if (!eventId || !assignmentId || !updates) {
      return applyAuthCookies(
        NextResponse.json(
          { error: "Missing event id, assignment id, or updates." },
          { status: 400 }
        ),
        viewer
      );
    }

    let updateAssignmentQuery = supabaseServer
      .from("event_sps")
      .update(updates)
      .eq("event_id", eventId)
      .eq("id", assignmentId);
    updateAssignmentQuery = applyRelatedOrganizationReadScope(
      updateAssignmentQuery,
      shouldScopeByOrganization ? activeOrganizationId : undefined,
      shouldScopeByOrganization
    );
    const { error } = await updateAssignmentQuery;

    if (error) {
      return applyAuthCookies(
        NextResponse.json(
          { error: getErrorMessage(error, "Could not update assignment.") },
          { status: 500 }
        ),
        viewer
      );
    }
    const refreshedAssignment = await fetchAssignmentById(
      supabaseServer,
      eventId,
      assignmentId,
      shouldScopeByOrganization ? activeOrganizationId : undefined,
      shouldScopeByOrganization
    );
    if (refreshedAssignment.error) {
      return applyAuthCookies(
        NextResponse.json(
          { error: getErrorMessage(refreshedAssignment.error, "Could not reload assignment.") },
          { status: 500 }
        ),
        viewer
      );
    }

    return applyAuthCookies(
      NextResponse.json({ ok: true, assignment: refreshedAssignment.assignment }),
      viewer
    );
  } catch (error) {
    logEventSetupSaveFailure("patch-catch", error, {
      route: "PATCH /api/events/[id]",
      phase: "catch",
    });
    logEventWriteFailure("patch-catch", error);
    return NextResponse.json(
      { error: getErrorMessage(error, "Could not save event details. Please refresh and try again.") },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);

    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return unauthorizedJson(organizationContext);
    }
    viewer.role = organizationContext.legacyRole;
    viewer.accessToken = organizationContext.accessToken;
    const activeOrganizationId = organizationContext.activeOrganization!.id;
    const privilegedWrite = canUsePrivilegedEventWrite(organizationContext);
    const shouldScopeByOrganization = organizationContext.schemaAvailable && !privilegedWrite;
    if (!roleCanOperateOrganization(organizationContext.role)) {
      return forbiddenJson("Only Sim Ops or admin accounts can remove event assignments.", organizationContext);
    }

    const viewerScopedClient = createViewerScopedClient(organizationContext.accessToken);
    const adminClient = privilegedWrite ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || viewerScopedClient;
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json().catch(() => ({}));
    const assignmentId = typeof body?.assignment_id === "string" ? body.assignment_id : "";
    const shouldDeleteHistory = body?.delete_history === true;

    if (!eventId) {
      return applyAuthCookies(
        NextResponse.json({ error: "Missing event id." }, { status: 400 }),
        viewer
      );
    }

    const eventCheck = await supabaseServer
      .from("events")
      .select("id,organization_id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventCheck.error && isMissingOrganizationColumnError(eventCheck.error)) {
      const fallbackEventCheck = await supabaseServer.from("events").select("id").eq("id", eventId).maybeSingle();
      if (fallbackEventCheck.error || !fallbackEventCheck.data) {
        logEventWriteFailure("delete-event-check", fallbackEventCheck.error || "not_found", {
          route: "DELETE /api/events/[id]",
          eventId,
          assignmentId: assignmentId || null,
          userEmail: viewer.email,
          role: viewer.role,
          activeOrganizationId,
          adminClientUsed: Boolean(adminClient),
          payloadKeys: Object.keys(body || {}),
        });
        return applyAuthCookies(
          jsonEventDetailError(
            {
              error: fallbackEventCheck.error ? "server_error" : "not_found",
              message: fallbackEventCheck.error ? "Could not validate event before removing assignment." : "Event was not found.",
              eventId,
              status: fallbackEventCheck.error ? 500 : 404,
              diagnostics: {
                route: "DELETE /api/events/[id]",
                assignmentId: assignmentId || null,
                exactError: fallbackEventCheck.error ? exactSupabaseError(fallbackEventCheck.error) : null,
              },
            },
            { status: fallbackEventCheck.error ? 500 : 404 }
          ),
          viewer
        );
      }
    } else if (eventCheck.error || !eventCheck.data) {
      logEventWriteFailure("delete-event-check", eventCheck.error || "not_found", {
        route: "DELETE /api/events/[id]",
        eventId,
        assignmentId: assignmentId || null,
        userEmail: viewer.email,
        role: viewer.role,
        activeOrganizationId,
        adminClientUsed: Boolean(adminClient),
        payloadKeys: Object.keys(body || {}),
      });
      return applyAuthCookies(
        jsonEventDetailError(
          {
            error: eventCheck.error ? "server_error" : "not_found",
            message: eventCheck.error ? "Could not validate event before removing assignment." : "Event was not found.",
            eventId,
            status: eventCheck.error ? 500 : 404,
            diagnostics: {
              route: "DELETE /api/events/[id]",
              assignmentId: assignmentId || null,
              exactError: eventCheck.error ? exactSupabaseError(eventCheck.error) : null,
            },
          },
          { status: eventCheck.error ? 500 : 404 }
        ),
        viewer
      );
    }

    const eventOrganizationId = asText((eventCheck.data as { organization_id?: unknown } | null)?.organization_id);
    if (!canMutateEventForActiveOrganization(organizationContext, eventOrganizationId)) {
      logEventWriteFailure("delete-event-organization-check", "forbidden", {
        route: "DELETE /api/events/[id]",
        eventId,
        eventOrganizationId,
        activeOrganizationId,
        userEmail: viewer.email,
        role: viewer.role,
        adminClientUsed: Boolean(adminClient),
        payloadKeys: Object.keys(body || {}),
      });
      return forbiddenJson("You do not have permission to update this event.", organizationContext);
    }

    if (!assignmentId) {
      if (!roleCanManageOrganization(organizationContext.role)) {
        return forbiddenJson("Only admin users can delete events.", organizationContext);
      }

      let deleteAssignmentsQuery = supabaseServer.from("event_sps").delete().eq("event_id", eventId);
      if (shouldScopeByOrganization) deleteAssignmentsQuery = deleteAssignmentsQuery.eq("organization_id", activeOrganizationId);
      const deleteAssignments = await deleteAssignmentsQuery;
      if (deleteAssignments.error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: getErrorMessage(deleteAssignments.error, "Could not delete event assignments.") },
            { status: 500 }
          ),
          viewer
        );
      }

      let deleteSessionsQuery = supabaseServer.from("event_sessions").delete().eq("event_id", eventId);
      if (shouldScopeByOrganization) deleteSessionsQuery = deleteSessionsQuery.eq("organization_id", activeOrganizationId);
      const deleteSessions = await deleteSessionsQuery;
      if (deleteSessions.error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: getErrorMessage(deleteSessions.error, "Could not delete event sessions.") },
            { status: 500 }
          ),
          viewer
        );
      }

      let deleteEventQuery = supabaseServer.from("events").delete().eq("id", eventId);
      if (shouldScopeByOrganization) deleteEventQuery = deleteEventQuery.eq("organization_id", activeOrganizationId);
      const deleteEvent = await deleteEventQuery;
      if (deleteEvent.error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: getErrorMessage(deleteEvent.error, "Could not delete event.") },
            { status: 500 }
          ),
          viewer
        );
      }

      return applyAuthCookies(NextResponse.json({ ok: true, deleted: true }), viewer);
    }

    if (shouldDeleteHistory && !roleCanManageOrganization(organizationContext.role)) {
      return forbiddenJson("Only admin and super admin users can delete assignment history.", organizationContext);
    }

    let assignmentMutation = shouldDeleteHistory
      ? supabaseServer
          .from("event_sps")
          .delete()
          .eq("event_id", eventId)
          .eq("id", assignmentId)
          .select("id")
      : supabaseServer
          .from("event_sps")
          .update({ sp_id: null })
          .eq("event_id", eventId)
          .eq("id", assignmentId)
          .select("id,sp_id");
    if (shouldScopeByOrganization) assignmentMutation = assignmentMutation.eq("organization_id", activeOrganizationId);
    const { data: mutatedAssignments, error } = await assignmentMutation;

    if (error) {
      logEventWriteFailure("delete-assignment-mutation", error, {
        route: "DELETE /api/events/[id]",
        eventId,
        assignmentId,
        shouldDeleteHistory,
        activeOrganizationId,
        scopedByOrganization: shouldScopeByOrganization,
      });
      return applyAuthCookies(
        jsonEventDetailError(
          {
            error: "server_error",
            message: getErrorMessage(error, shouldDeleteHistory ? "Could not delete assignment history." : "Could not remove assignment."),
            eventId,
            status: 500,
            diagnostics: {
              route: "DELETE /api/events/[id]",
              assignmentId,
              shouldDeleteHistory,
              activeOrgId: activeOrganizationId,
              scopedByOrganization: shouldScopeByOrganization,
              exactError: exactSupabaseError(error),
            },
          },
          { status: 500 }
        ),
        viewer
      );
    }

    if (!mutatedAssignments || mutatedAssignments.length === 0) {
      logEventWriteFailure("delete-assignment-not-found", "not_found", {
        route: "DELETE /api/events/[id]",
        eventId,
        assignmentId,
        shouldDeleteHistory,
        activeOrganizationId,
        scopedByOrganization: shouldScopeByOrganization,
      });
      return applyAuthCookies(
        jsonEventDetailError(
          {
            error: "not_found",
            message: shouldDeleteHistory ? "Assignment history was not found." : "Assignment was not found or could not be removed.",
            eventId,
            status: 404,
            diagnostics: {
              route: "DELETE /api/events/[id]",
              assignmentId,
              shouldDeleteHistory,
              activeOrgId: activeOrganizationId,
              scopedByOrganization: shouldScopeByOrganization,
            },
          },
          { status: 404 }
        ),
        viewer
      );
    }

    return applyAuthCookies(
      NextResponse.json({
        ok: true,
        assignment_id: assignmentId,
        removed: !shouldDeleteHistory,
        deleted_history: shouldDeleteHistory,
        affected_count: mutatedAssignments.length,
      }),
      viewer
    );
  } catch (error) {
    logEventWriteFailure("delete-catch", error);
    return jsonEventDetailError(
      {
        error: "server_error",
        message: getErrorMessage(error, "Could not delete event data right now."),
        status: 500,
        diagnostics: { exactError: exactSupabaseError(error) },
      },
      { status: 500 }
    );
  }
}
