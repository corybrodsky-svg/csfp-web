import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../lib/authCookies";
import { getImportedYearHint, normalizeLooseDateToIso } from "../../../lib/eventDateUtils";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";
import { getProfileForUser } from "../../../lib/profileServer";
import { resolveSpAccountLink } from "../../../lib/spAccountLinking";
import { parseTrainingEventMetadata } from "../../../lib/trainingEventNotes";

export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
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

function mergeEventNotesPreservingMetadata(currentNotes?: string | null, incomingNotes?: string | null) {
  if (incomingNotes === null) return null;

  const currentBlocks = extractCfspMetadataBlocks(currentNotes);
  const incomingBlocks = extractCfspMetadataBlocks(incomingNotes);
  const mergedBlocks = new Map(currentBlocks);
  for (const [key, value] of incomingBlocks.entries()) mergedBlocks.set(key, value);

  const currentVisibleNotes = stripCfspMetadataBlocks(currentNotes);
  const incomingVisibleNotes = stripCfspMetadataBlocks(incomingNotes);
  const mergedVisibleNotes =
    incomingVisibleNotes || (incomingBlocks.size > 0 ? currentVisibleNotes : incomingVisibleNotes);

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
  sp_id: string | null;
  status: string | null;
  confirmed: boolean | null;
  notes?: string | null;
  last_contacted_at?: string | null;
  contact_method?: string | null;
  created_at?: string | null;
  training_attended?: boolean | null;
  training_checked_in_at?: string | null;
};

type RelatedEventRow = {
  id: string;
  name: string | null;
  status: string | null;
  date_text: string | null;
  location: string | null;
  notes: string | null;
  created_at?: string | null;
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

function unauthorizedResponse(viewer?: ViewerContext | null) {
  const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer?.shouldClearCookies) {
    clearAuthCookies(response);
  }
  return response;
}

function tokenizeFamilyText(value: unknown) {
  return asText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function extractCourseToken(value: unknown) {
  const text = asText(value).toUpperCase().replace(/\s+/g, " ");
  const match =
    text.match(/\b[A-Z]{2,}\s*-?\s*\d{3,4}[A-Z]?\b/) ||
    text.match(/\b\d{3,4}[A-Z]?\b/);
  return match ? match[0].replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim() : "";
}

function getEventFamilySignals(event: RelatedEventRow) {
  const metadata = parseTrainingEventMetadata(event.notes);
  const familySource = [
    event.name,
    event.status,
    event.date_text,
    event.location,
    metadata.faculty_program,
    metadata.linked_event_title,
    metadata.training_notes,
  ]
    .map(asText)
    .filter(Boolean)
    .join(" ");
  const courseToken = extractCourseToken(familySource);
  const tokens = Array.from(new Set(tokenizeFamilyText(familySource))).filter(
    (token) =>
      ![
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
      ].includes(token)
  );

  return {
    courseToken,
    tokens,
    metadata,
  };
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

function getRelatedEventScore(source: RelatedEventRow, candidate: RelatedEventRow) {
  if (source.id === candidate.id) return 0;

  const sourceSignals = getEventFamilySignals(source);
  const candidateSignals = getEventFamilySignals(candidate);
  const sourceText = [source.name, source.status, source.date_text, source.location, source.notes]
    .map(asText)
    .join(" ")
    .toLowerCase();
  const candidateText = [candidate.name, candidate.status, candidate.date_text, candidate.location, candidate.notes]
    .map(asText)
    .join(" ")
    .toLowerCase();
  let score = 0;

  if (sourceSignals.courseToken && candidateSignals.courseToken === sourceSignals.courseToken) score += 70;

  const sharedTokens = sourceSignals.tokens.filter((token) => candidateSignals.tokens.includes(token));
  score += Math.min(sharedTokens.length * 12, 36);

  const sourceProgram = normalizeMatchValue(sourceSignals.metadata.faculty_program);
  const candidateProgram = normalizeMatchValue(candidateSignals.metadata.faculty_program);
  if (sourceProgram && candidateProgram && sourceProgram === candidateProgram) score += 30;

  const explicitLinkedId = asText(sourceSignals.metadata.linked_event_id);
  if (explicitLinkedId && explicitLinkedId === candidate.id) score += 100;
  const reverseLinkedId = asText(candidateSignals.metadata.linked_event_id);
  if (reverseLinkedId && reverseLinkedId === source.id) score += 100;
  if (candidateText.includes(source.id.toLowerCase()) || sourceText.includes(candidate.id.toLowerCase())) score += 80;

  const sourceDate = normalizeLooseDateToIso(source.date_text, getImportedYearHint(source.notes));
  const candidateDate = normalizeLooseDateToIso(candidate.date_text, getImportedYearHint(candidate.notes));
  if (sourceDate && candidateDate) {
    const deltaDays = Math.abs(new Date(candidateDate).getTime() - new Date(sourceDate).getTime()) / 86400000;
    if (deltaDays <= 45) score += 12;
  }

  if (classifyRelatedEventNode(candidate) === "training") score += 8;
  return score;
}

async function loadRelatedOperationalEvents(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  sourceEvent: RelatedEventRow
) {
  const sourceSignals = getEventFamilySignals(sourceEvent);
  const fallbackKeyword = sourceSignals.courseToken || sourceSignals.tokens[0] || "";
  if (!fallbackKeyword) return [] as Array<Record<string, unknown>>;

  const { data, error } = await supabaseServer
    .from("events")
    .select("id,name,status,date_text,location,notes,created_at")
    .limit(250);

  if (error) return [] as Array<Record<string, unknown>>;

  return ((data || []) as RelatedEventRow[])
    .map((candidate) => {
      const score = getRelatedEventScore(sourceEvent, candidate);
      if (score < 45) return null;
      const kind = classifyRelatedEventNode(candidate);
      const metadata = parseTrainingEventMetadata(candidate.notes);
      return {
        id: candidate.id,
        name: candidate.name,
        status: candidate.status,
        date_text: candidate.date_text,
        location: candidate.location,
        kind,
        score,
        exact_course_match: Boolean(
          sourceSignals.courseToken &&
            getEventFamilySignals(candidate).courseToken === sourceSignals.courseToken
        ),
        relationship:
          kind === "training"
            ? "Training"
            : kind === "skills"
              ? "Related skills/IPE session"
              : kind === "virtual"
                ? "Related virtual session"
                : "Simulation date",
        trainingMetadata: kind === "training" ? metadata : null,
      };
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .sort((a, b) => {
      if (a.kind === "training" && b.kind !== "training") return -1;
      if (a.kind !== "training" && b.kind === "training") return 1;
      if (b.score !== a.score) return b.score - a.score;
      return asText(a.name).localeCompare(asText(b.name));
    })
    .slice(0, 12);
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

  if (typeof source.status === "string") updates.status = source.status;
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

  return Object.keys(updates).length ? updates : null;
}

function getSafeEventUpdates(rawUpdates: unknown) {
  if (!rawUpdates || typeof rawUpdates !== "object") return null;

  const source = rawUpdates as Record<string, unknown>;
  const updates: Record<string, string | number | null> = {};

  if (typeof source.name === "string") updates.name = source.name.trim() || null;
  if (typeof source.status === "string") updates.status = source.status.trim() || null;
  if (typeof source.visibility === "string") updates.visibility = source.visibility.trim() || null;
  if (typeof source.location === "string") updates.location = source.location.trim() || null;
  if (typeof source.date_text === "string" || source.date_text === null) {
    updates.date_text = typeof source.date_text === "string" ? source.date_text.trim() || null : null;
  }
  if (typeof source.notes === "string" || source.notes === null) {
    updates.notes = typeof source.notes === "string" ? source.notes.trim() || null : null;
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

async function loadEventAssignments(supabaseServer: ReturnType<typeof createSupabaseServerClient>, eventId: string) {
  const primary = await supabaseServer
    .from("event_sps")
    .select(
      "id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method,created_at,training_attended,training_checked_in_at"
    )
    .eq("event_id", eventId);

  if (!primary.error) {
    return {
      assignments: (primary.data || []) as AssignmentApiRow[],
      error: null,
    };
  }

  const fallback = await supabaseServer
    .from("event_sps")
    .select("id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method,created_at")
    .eq("event_id", eventId);

  return {
    assignments: ((fallback.data || []) as AssignmentApiRow[]).map((assignment) => ({
      ...assignment,
      training_attended: false,
      training_checked_in_at: null,
    })),
    error: fallback.error,
  };
}

async function fetchAssignmentById(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  assignmentId: string
) {
  const primary = await supabaseServer
    .from("event_sps")
    .select(
      "id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method,created_at,training_attended,training_checked_in_at"
    )
    .eq("event_id", eventId)
    .eq("id", assignmentId)
    .maybeSingle();

  if (!primary.error) {
    return {
      assignment: (primary.data || null) as AssignmentApiRow | null,
      error: null,
    };
  }

  const fallback = await supabaseServer
    .from("event_sps")
    .select("id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method,created_at")
    .eq("event_id", eventId)
    .eq("id", assignmentId)
    .maybeSingle();

  return {
    assignment: fallback.data
      ? ({
          ...(fallback.data as AssignmentApiRow),
          training_attended: false,
          training_checked_in_at: null,
        } satisfies AssignmentApiRow)
      : null,
    error: fallback.error,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const supabaseServer = createSupabaseServerClient();
    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return unauthorizedResponse();
    }

    const params = await context.params;
    const eventId = getRouteId(params);

    if (!eventId) {
      return applyAuthCookies(
        NextResponse.json({ error: "Missing event id." }, { status: 400 }),
        viewer
      );
    }

    const { data: event, error: eventError } = await supabaseServer
      .from("events")
      .select("id,name,status,date_text,sp_needed,visibility,location,notes,created_at")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      return applyAuthCookies(
        NextResponse.json(
          { error: eventError.message || "Could not load event from Supabase." },
          { status: 500 }
        ),
        viewer
      );
    }

    if (!event) {
      return applyAuthCookies(
        NextResponse.json({ error: "Event details were not found." }, { status: 404 }),
        viewer
      );
    }

    const { data: sessions, error: sessionError } = await supabaseServer
      .from("event_sessions")
      .select("id,event_id,session_date,start_time,end_time,location,room,created_at")
      .eq("event_id", eventId)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true });

    const { data: sps, error: spError } = await supabaseServer
      .from("sps")
      .select("id,first_name,last_name,full_name,working_email,email,phone,portrayal_age,race,sex,telehealth,pt_preferred,other_roles,speaks_spanish,notes,status");

    if (spError) {
      return applyAuthCookies(
        NextResponse.json(
          { error: spError.message || "Could not load SPs from Supabase." },
          { status: 500 }
        ),
        viewer
      );
    }

    const assignmentResult = await loadEventAssignments(supabaseServer, eventId);
    const assignments: AssignmentApiRow[] = assignmentResult.assignments;
    const assignmentError = assignmentResult.error;

    if (assignmentError) {
      return applyAuthCookies(
        NextResponse.json(
          { error: assignmentError.message || "Could not load assignments from Supabase." },
          { status: 500 }
        ),
        viewer
      );
    }

    const { data: availabilityRows, error: availabilityError } = await supabaseServer
      .from("sp_availability")
      .select("*")
      .limit(1000);

    if (viewer.role === "sp") {
      const viewerMatchedSpId = viewer.linkedSpId;
      const eventSpIds = new Set(
        (assignments || []).map((assignment) => asText((assignment as { sp_id?: unknown }).sp_id))
      );
      const matched = (sps || []).some((sp) => {
        const spId = asText(sp.id);
        if (!eventSpIds.has(spId)) return false;
        if (viewerMatchedSpId && spId === viewerMatchedSpId) return true;
        return viewerMatchesAssignedSp(sp as AssignedSpApiRow, viewer);
      });

      if (!matched) {
        return applyAuthCookies(
          NextResponse.json({ error: "You do not have access to this event." }, { status: 403 }),
          viewer
        );
      }

      const matchingSp =
        (sps || []).find((sp) => {
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
          sessionErrorMessage: sessionError
            ? sessionError.message || "Could not load event sessions from Supabase."
            : "",
          availabilityErrorMessage: availabilityError
            ? availabilityError.message || "Could not load SP availability from Supabase."
            : "",
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

    const relatedOperationalEvents = isOperatorRole(viewer.role)
      ? await loadRelatedOperationalEvents(supabaseServer, event as RelatedEventRow)
      : [];

    return applyAuthCookies(
      NextResponse.json({
        viewerRole: viewer.role,
        event,
        sessions: sessions || [],
        sps: [...(sps || [])],
        assignments: assignments || [],
        availabilityRows: availabilityRows || [],
        relatedEvents: relatedOperationalEvents,
        errorMessage: "",
        sessionErrorMessage: sessionError
          ? sessionError.message || "Could not load event sessions from Supabase."
          : "",
        availabilityErrorMessage: availabilityError
          ? availabilityError.message || "Could not load SP availability from Supabase."
          : "",
      }),
      viewer
    );
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return unauthorizedResponse();
    }
    if (!isOperatorRole(viewer.role)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Only Sim Ops or admin accounts can manage event staffing." }, { status: 403 }),
        viewer
      );
    }

    const supabaseServer = createSupabaseServerClient();
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
        NextResponse.json({ error: "Missing event id or SP id." }, { status: 400 }),
        viewer
      );
    }

    const { data: existingAssignment, error: existingAssignmentError } = await supabaseServer
      .from("event_sps")
      .select("id")
      .eq("event_id", eventId)
      .eq("sp_id", spId)
      .maybeSingle();

    if (existingAssignmentError) {
      return applyAuthCookies(
        NextResponse.json(
          { error: existingAssignmentError.message || "Could not check existing assignment." },
          { status: 500 }
        ),
        viewer
      );
    }

    if (existingAssignment?.id) {
      return applyAuthCookies(
        NextResponse.json({ ok: true, already_assigned: true }),
        viewer
      );
    }

    const { error } = await supabaseServer.from("event_sps").insert({
      event_id: eventId,
      sp_id: spId,
      status: requestedStatus || "invited",
      confirmed: typeof requestedConfirmed === "boolean" ? requestedConfirmed : requestedStatus === "confirmed",
      ...(requestedNotes !== undefined ? { notes: requestedNotes } : {}),
    });

    if (error) {
      return applyAuthCookies(
        NextResponse.json(
          { error: error.message || "Could not save assignment." },
          { status: 500 }
        ),
        viewer
      );
    }

    return applyAuthCookies(NextResponse.json({ ok: true }, { status: 201 }), viewer);
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return unauthorizedResponse();
    }
    if (!isOperatorRole(viewer.role)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Only Sim Ops or admin accounts can edit event operations." }, { status: 403 }),
        viewer
      );
    }

    const supabaseServer = createSupabaseServerClient();
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json();
    const eventUpdates = getSafeEventUpdates(body?.event_updates);
    const sessionUpdates = getSafeSessionUpdates(body?.session_updates);
    const assignmentId = typeof body?.assignment_id === "string" ? body.assignment_id : "";
    const updates = getSafeAssignmentUpdates(body?.updates);
    const attendanceAction =
      typeof body?.attendance_action === "string" ? body.attendance_action.trim().toLowerCase() : "";

    if (eventId && (eventUpdates || sessionUpdates)) {
      const nextEventUpdates = eventUpdates ? { ...eventUpdates } : {};
      let updatedEvent: Record<string, unknown> | null = null;
      if (eventUpdates && Object.prototype.hasOwnProperty.call(eventUpdates, "notes")) {
        const requestedNotes =
          typeof eventUpdates.notes === "string" || eventUpdates.notes === null
            ? eventUpdates.notes
            : null;
        const { data: existingEvent, error: existingEventError } = await supabaseServer
          .from("events")
          .select("notes")
          .eq("id", eventId)
          .maybeSingle();

        if (existingEventError) {
          return applyAuthCookies(
            NextResponse.json(
              { error: existingEventError.message || "Could not load existing event notes." },
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
        const { data: savedEvent, error } = await supabaseServer
          .from("events")
          .update(nextEventUpdates)
          .eq("id", eventId)
          .select("id,name,status,date_text,sp_needed,location,notes")
          .maybeSingle();

        if (error) {
          return applyAuthCookies(
            NextResponse.json(
              { error: error.message || "Could not update event details." },
              { status: 500 }
            ),
            viewer
          );
        }
        updatedEvent = (savedEvent as Record<string, unknown> | null) || null;
      }

      if (sessionUpdates) {
        const { data: existingSession, error: existingSessionError } = await supabaseServer
          .from("event_sessions")
          .select("id")
          .eq("event_id", eventId)
          .order("session_date", { ascending: true })
          .order("start_time", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (existingSessionError) {
          return applyAuthCookies(
            NextResponse.json(
              { error: existingSessionError.message || "Could not load event session." },
              { status: 500 }
            ),
            viewer
          );
        }

        if (existingSession?.id) {
          const { error } = await supabaseServer
            .from("event_sessions")
            .update(sessionUpdates)
            .eq("id", existingSession.id)
            .eq("event_id", eventId);

          if (error) {
            return applyAuthCookies(
              NextResponse.json(
                { error: error.message || "Could not update event session." },
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
                session_date: sessionUpdates.session_date ?? null,
                start_time: sessionUpdates.start_time ?? null,
                end_time: sessionUpdates.end_time ?? null,
              });

            if (error) {
              return applyAuthCookies(
                NextResponse.json(
                  { error: error.message || "Could not create event session." },
                  { status: 500 }
                ),
                viewer
              );
            }
          }
        }
      }

      return applyAuthCookies(NextResponse.json({ ok: true, event: updatedEvent }), viewer);
    }

    if (eventId && (attendanceAction === "confirm_all" || attendanceAction === "clear_all")) {
      const nextAttended = attendanceAction === "confirm_all";
      const nextCheckedAt = nextAttended ? new Date().toISOString() : null;
      const { error } = await supabaseServer
        .from("event_sps")
        .update({
          training_attended: nextAttended,
          training_checked_in_at: nextCheckedAt,
        })
        .eq("event_id", eventId);

      if (error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: error.message || "Could not update training attendance." },
            { status: 500 }
          ),
          viewer
        );
      }

      const refreshedAssignments = await loadEventAssignments(supabaseServer, eventId);
      if (refreshedAssignments.error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: refreshedAssignments.error.message || "Could not reload assignments." },
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

    const { error } = await supabaseServer
      .from("event_sps")
      .update(updates)
      .eq("event_id", eventId)
      .eq("id", assignmentId);

    if (error) {
      return applyAuthCookies(
        NextResponse.json(
          { error: error.message || "Could not update assignment." },
          { status: 500 }
        ),
        viewer
      );
    }
    const refreshedAssignment = await fetchAssignmentById(supabaseServer, eventId, assignmentId);
    if (refreshedAssignment.error) {
      return applyAuthCookies(
        NextResponse.json(
          { error: refreshedAssignment.error.message || "Could not reload assignment." },
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
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return unauthorizedResponse();
    }
    if (!isOperatorRole(viewer.role)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Only Sim Ops or admin accounts can remove event assignments." }, { status: 403 }),
        viewer
      );
    }

    const supabaseServer = createSupabaseServerClient();
    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json().catch(() => ({}));
    const assignmentId = typeof body?.assignment_id === "string" ? body.assignment_id : "";

    if (!eventId) {
      return applyAuthCookies(
        NextResponse.json({ error: "Missing event id." }, { status: 400 }),
        viewer
      );
    }

    if (!assignmentId) {
      if (viewer.role !== "admin" && viewer.role !== "super_admin") {
        return applyAuthCookies(
          NextResponse.json({ error: "Only admin users can delete events." }, { status: 403 }),
          viewer
        );
      }

      const deleteAssignments = await supabaseServer.from("event_sps").delete().eq("event_id", eventId);
      if (deleteAssignments.error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: deleteAssignments.error.message || "Could not delete event assignments." },
            { status: 500 }
          ),
          viewer
        );
      }

      const deleteSessions = await supabaseServer.from("event_sessions").delete().eq("event_id", eventId);
      if (deleteSessions.error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: deleteSessions.error.message || "Could not delete event sessions." },
            { status: 500 }
          ),
          viewer
        );
      }

      const deleteEvent = await supabaseServer.from("events").delete().eq("id", eventId);
      if (deleteEvent.error) {
        return applyAuthCookies(
          NextResponse.json(
            { error: deleteEvent.error.message || "Could not delete event." },
            { status: 500 }
          ),
          viewer
        );
      }

      return applyAuthCookies(NextResponse.json({ ok: true, deleted: true }), viewer);
    }

    const { error } = await supabaseServer
      .from("event_sps")
      .delete()
      .eq("event_id", eventId)
      .eq("id", assignmentId);

    if (error) {
      return applyAuthCookies(
        NextResponse.json(
          { error: error.message || "Could not remove assignment." },
          { status: 500 }
        ),
        viewer
      );
    }

    return applyAuthCookies(NextResponse.json({ ok: true }), viewer);
  } catch (error) {
    return NextResponse.json(
      { error: `Supabase request failed: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
