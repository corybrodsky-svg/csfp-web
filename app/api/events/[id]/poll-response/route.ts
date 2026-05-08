import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../../lib/authCookies";
import { createSupabaseServerClient } from "../../../../lib/supabaseServerClient";
import { getProfileForUser } from "../../../../lib/profileServer";
import { resolveSpAccountLink } from "../../../../lib/spAccountLinking";
import { parseTrainingEventMetadata } from "../../../../lib/trainingEventNotes";

export const dynamic = "force-dynamic";

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

type PollAccessResult = {
  event: {
    id: string;
    name: string | null;
    status: string | null;
    date_text: string | null;
    location: string | null;
    notes: string | null;
  } | null;
  pollMetadata: PollMetadata;
  trainingMetadata: ReturnType<typeof parseTrainingEventMetadata> | null;
  sessions: Array<{
    id: string;
    event_id: string | null;
    session_date: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    room: string | null;
    created_at: string | null;
  }>;
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

type PollMetadata = {
  pollCreatedAt: string;
  pollSentAt: string;
  pollSelectedSpIds: string;
  pollSelectedSpEmails: string;
  pollStatus: string;
};

type PollResponseMetadata = {
  responseStatus: string;
  responseNote: string;
  responseSubmittedAt: string;
};

type ViewerSpRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  working_email: string | null;
  email: string | null;
};

type AssignmentRow = {
  id: string;
  event_id: string | null;
  sp_id: string | null;
  status: string | null;
  confirmed: boolean | null;
  notes: string | null;
  last_contacted_at: string | null;
  contact_method: string | null;
  created_at: string | null;
};

const POLL_METADATA_START = "[CFSP_POLL_METADATA]";
const POLL_METADATA_END = "[/CFSP_POLL_METADATA]";
const POLL_METADATA_KEYS: Array<keyof PollMetadata> = [
  "pollCreatedAt",
  "pollSentAt",
  "pollSelectedSpIds",
  "pollSelectedSpEmails",
  "pollStatus",
];
const POLL_RESPONSE_START = "[CFSP_POLL_RESPONSE]";
const POLL_RESPONSE_END = "[/CFSP_POLL_RESPONSE]";
const POLL_RESPONSE_KEYS: Array<keyof PollResponseMetadata> = [
  "responseStatus",
  "responseNote",
  "responseSubmittedAt",
];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "unknown";
}

function normalizeMatchValue(value: unknown) {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  const normalizedRole = normalizeRole(role);
  const coryAdminEmails = new Set(["cwb55@drexel.edu", "cory.brodsky@drexel.edu"]);

  if (coryAdminEmails.has(normalizedEmail) || localPart === "cory.brodsky") {
    if (normalizedRole === "super_admin" || normalizedRole === "admin" || normalizedRole === "sim_op") {
      return normalizedRole;
    }
    return "super_admin";
  }

  return normalizedRole;
}

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

function emptyPollMetadata(): PollMetadata {
  return {
    pollCreatedAt: "",
    pollSentAt: "",
    pollSelectedSpIds: "",
    pollSelectedSpEmails: "",
    pollStatus: "",
  };
}

function parsePollMetadata(notes?: string | null) {
  const metadata = emptyPollMetadata();
  const text = asText(notes);
  const match = text.match(new RegExp(`${POLL_METADATA_START}\\n?([\\s\\S]*?)\\n?${POLL_METADATA_END}`));
  if (!match) return metadata;

  match[1].split(/\r?\n/).forEach((line) => {
    const lineMatch = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (!lineMatch) return;
    const key = lineMatch[1] as keyof PollMetadata;
    if (!POLL_METADATA_KEYS.includes(key)) return;
    metadata[key] = lineMatch[2].trim();
  });

  return metadata;
}

function emptyPollResponseMetadata(): PollResponseMetadata {
  return {
    responseStatus: "",
    responseNote: "",
    responseSubmittedAt: "",
  };
}

function parsePollResponseMetadata(notes?: string | null) {
  const metadata = emptyPollResponseMetadata();
  const text = asText(notes);
  const match = text.match(new RegExp(`${POLL_RESPONSE_START}\\n?([\\s\\S]*?)\\n?${POLL_RESPONSE_END}`));
  if (!match) return metadata;

  match[1].split(/\r?\n/).forEach((line) => {
    const lineMatch = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (!lineMatch) return;
    const key = lineMatch[1] as keyof PollResponseMetadata;
    if (!POLL_RESPONSE_KEYS.includes(key)) return;
    metadata[key] = lineMatch[2].trim();
  });

  return metadata;
}

function upsertPollResponseMetadata(notes: string | null | undefined, partial: Partial<PollResponseMetadata>) {
  const current = parsePollResponseMetadata(notes);
  const next = {
    ...current,
    ...Object.fromEntries(Object.entries(partial).map(([key, value]) => [key, asText(value)])),
  } as PollResponseMetadata;

  const lines = POLL_RESPONSE_KEYS
    .map((key) => (next[key] ? `${key}: ${next[key]}` : ""))
    .filter(Boolean);

  const text = asText(notes);
  const withoutExisting = text.replace(
    new RegExp(`\\n?${POLL_RESPONSE_START}[\\s\\S]*?${POLL_RESPONSE_END}\\n?`, "g"),
    "\n"
  ).trim();

  if (!lines.length) return withoutExisting;

  const block = [POLL_RESPONSE_START, ...lines, POLL_RESPONSE_END].join("\n");
  return withoutExisting ? `${block}\n${withoutExisting}` : block;
}

async function findViewerSp(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  viewer: ViewerContext
) {
  const { data, error } = await supabaseServer
    .from("sps")
    .select("id,first_name,last_name,full_name,working_email,email")
    .limit(2000);

  if (error) throw new Error(error.message || "Could not load SP records.");

  const sps = (data || []) as ViewerSpRow[];
  const viewerEmail = normalizeEmail(viewer.email);
  const viewerNames = new Set(
    [normalizeMatchValue(viewer.fullName), normalizeMatchValue(viewer.scheduleName)].filter(Boolean)
  );

  return (
    sps.find((sp) => viewer.linkedSpId && asText(sp.id) === viewer.linkedSpId) ||
    sps.find((sp) => normalizeEmail(sp.working_email) === viewerEmail) ||
    sps.find((sp) => normalizeEmail(sp.email) === viewerEmail) ||
    sps.find((sp) => {
      const spName =
        normalizeMatchValue(sp.full_name) ||
        normalizeMatchValue([sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" "));
      return Boolean(spName) && viewerNames.has(spName);
    }) ||
    null
  );
}

async function getEventAndViewerAccess(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  viewer: ViewerContext
) {
  const { data: event, error: eventError } = await supabaseServer
    .from("events")
    .select("id,name,status,date_text,location,notes")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) throw new Error(eventError.message || "Could not load event.");
  if (!event) return { event: null, viewerSp: null, assignment: null, pollMetadata: emptyPollMetadata(), trainingMetadata: null };

  const viewerSp = await findViewerSp(supabaseServer, viewer);
  const pollMetadata = parsePollMetadata(event.notes);
  const trainingMetadata = parseTrainingEventMetadata(event.notes);

  if (!viewerSp) {
    throw new Error("Your SP account is awaiting directory matching.");
  }

  const { data: assignment, error: assignmentError } = await supabaseServer
    .from("event_sps")
    .select("id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method,created_at")
    .eq("event_id", eventId)
    .eq("sp_id", viewerSp.id)
    .maybeSingle();

  if (assignmentError) {
    throw new Error(assignmentError.message || "Could not load your event assignment.");
  }

  const selectedIds = new Set(
    pollMetadata.pollSelectedSpIds
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const selectedEmails = new Set(
    pollMetadata.pollSelectedSpEmails
      .split(",")
      .map((item) => normalizeEmail(item))
      .filter(Boolean)
  );
  const viewerEmails = [viewer.email, viewerSp.working_email, viewerSp.email]
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  const selected = selectedIds.has(asText(viewerSp.id)) || viewerEmails.some((email) => selectedEmails.has(email));

  if (!selected && !assignment?.id) {
    return { event, viewerSp, assignment: assignment || null, pollMetadata, trainingMetadata, selected: false };
  }

  return {
    event,
    viewerSp,
    assignment: (assignment as AssignmentRow | null) || null,
    pollMetadata,
    trainingMetadata,
    selected: true,
  };
}

async function getPublicPollAccess(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string
): Promise<PollAccessResult> {
  const { data: event, error: eventError } = await supabaseServer
    .from("events")
    .select("id,name,status,date_text,location,notes")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) throw new Error(eventError.message || "Could not load event.");

  const { data: sessions, error: sessionsError } = await supabaseServer
    .from("event_sessions")
    .select("id,event_id,session_date,start_time,end_time,location,room,created_at")
    .eq("event_id", eventId)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (sessionsError) throw new Error(sessionsError.message || "Could not load event sessions.");

  return {
    event: event || null,
    pollMetadata: parsePollMetadata(event?.notes),
    trainingMetadata: event ? parseTrainingEventMetadata(event.notes) : null,
    sessions: sessions || [],
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const viewer = await getAuthenticatedViewer();
    const params = await context.params;
    const eventId = getRouteId(params);
    if (!eventId) {
      return applyAuthCookies(NextResponse.json({ error: "Missing event id." }, { status: 400 }), viewer);
    }

    const supabaseServer = createSupabaseServerClient();
    const publicAccess = await getPublicPollAccess(supabaseServer, eventId);
    if (!publicAccess.event) {
      return applyAuthCookies(NextResponse.json({ error: "Event not found." }, { status: 404 }), viewer);
    }
    const isLoggedIn = Boolean(viewer);
    const viewerRole = viewer?.role === "sp" || viewer?.role === "sim_op" || viewer?.role === "admin" || viewer?.role === "super_admin"
      ? viewer.role
      : "unknown";
    let responseMetadata = emptyPollResponseMetadata();
    let assignmentStatus: string | null = null;
    let assignmentId: string | null = null;
    let canRespond = false;
    let responseAccessMessage = "";
    let sp = {
      id: "",
      name: "",
      email: "",
    };

    if (!viewer) {
      responseAccessMessage = "Log in or create an SP account to submit your availability.";
    } else if (viewer.role !== "sp") {
      responseAccessMessage =
        "This poll is for SP availability responses. Please create or switch to an SP account to respond.";
    } else {
      const access = await getEventAndViewerAccess(supabaseServer, eventId, viewer);
      if (!access.viewerSp) {
        responseAccessMessage = "Your SP account is awaiting directory matching before you can submit this poll.";
      } else if (!access.selected) {
        responseAccessMessage = "Your SP account is not included in this availability poll.";
      } else {
        canRespond = true;
        responseMetadata = parsePollResponseMetadata(access.assignment?.notes);
        assignmentStatus = access.assignment?.status || null;
        assignmentId = access.assignment?.id || null;
        sp = {
          id: access.viewerSp.id || "",
          name:
            asText(access.viewerSp.full_name) ||
            [asText(access.viewerSp.first_name), asText(access.viewerSp.last_name)].filter(Boolean).join(" ") ||
            "SP account",
          email: asText(access.viewerSp.working_email) || asText(access.viewerSp.email),
        };
      }
    }

    return applyAuthCookies(
      NextResponse.json({
        viewerRole,
        isLoggedIn,
        event: {
          id: publicAccess.event.id,
          name: publicAccess.event.name,
          status: publicAccess.event.status,
          date_text: publicAccess.event.date_text,
          location: publicAccess.event.location,
        },
        sessions: publicAccess.sessions,
        sp,
        poll: {
          status: publicAccess.pollMetadata.pollStatus || "not_created",
          createdAt: publicAccess.pollMetadata.pollCreatedAt || null,
          sentAt: publicAccess.pollMetadata.pollSentAt || null,
        },
        response: {
          assignmentId,
          current: responseMetadata.responseStatus || null,
          note: responseMetadata.responseNote || "",
          submittedAt: responseMetadata.responseSubmittedAt || null,
          assignmentStatus,
        },
        access: {
          zoomUrl: publicAccess.trainingMetadata?.zoom_url || null,
          trainingPassword: publicAccess.trainingMetadata?.training_password || null,
        },
        canRespond,
        responseAccessMessage,
      }),
      viewer
    );
  } catch (error) {
    return NextResponse.json({ error: `Supabase request failed: ${getErrorMessage(error)}` }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) return unauthorizedResponse();
    if (viewer.role !== "sp") {
      return applyAuthCookies(
        NextResponse.json({ error: "Only SP accounts can submit poll responses." }, { status: 403 }),
        viewer
      );
    }

    const params = await context.params;
    const eventId = getRouteId(params);
    const body = await request.json().catch(() => ({}));
    const responseStatus = asText(body?.response).toLowerCase();
    const responseNote = typeof body?.note === "string" ? body.note.trim() : "";

    if (!eventId) {
      return applyAuthCookies(NextResponse.json({ error: "Missing event id." }, { status: 400 }), viewer);
    }
    if (!["available", "maybe", "not_available"].includes(responseStatus)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Select Available, Not Available, or Maybe / Need to discuss." }, { status: 400 }),
        viewer
      );
    }

    const supabaseServer = createSupabaseServerClient();
    const access = await getEventAndViewerAccess(supabaseServer, eventId, viewer);
    if (!access.event) {
      return applyAuthCookies(NextResponse.json({ error: "Event not found." }, { status: 404 }), viewer);
    }
    if (!access.selected || !access.viewerSp) {
      return applyAuthCookies(
        NextResponse.json({ error: "You are not included in this availability poll." }, { status: 403 }),
        viewer
      );
    }

    const submittedAt = new Date().toISOString();
    const nextNotes = upsertPollResponseMetadata(access.assignment?.notes, {
      responseStatus,
      responseNote,
      responseSubmittedAt: submittedAt,
    });
    const assignmentStatus = responseStatus === "not_available" ? "declined" : "contacted";

    if (access.assignment?.id) {
      const { error } = await supabaseServer
        .from("event_sps")
        .update({
          status: assignmentStatus,
          confirmed: false,
          notes: nextNotes,
          last_contacted_at: submittedAt,
          contact_method: "email",
        })
        .eq("event_id", eventId)
        .eq("id", access.assignment.id);

      if (error) {
        return applyAuthCookies(
          NextResponse.json({ error: error.message || "Could not save your poll response." }, { status: 500 }),
          viewer
        );
      }
    } else {
      const { error } = await supabaseServer.from("event_sps").insert({
        event_id: eventId,
        sp_id: access.viewerSp.id,
        status: assignmentStatus,
        confirmed: false,
        notes: nextNotes,
        last_contacted_at: submittedAt,
        contact_method: "email",
      });

      if (error) {
        return applyAuthCookies(
          NextResponse.json({ error: error.message || "Could not create your poll response." }, { status: 500 }),
          viewer
        );
      }
    }

    const { data: refreshedAssignment, error: refreshedError } = await supabaseServer
      .from("event_sps")
      .select("id,event_id,sp_id,status,confirmed,notes,last_contacted_at,contact_method,created_at")
      .eq("event_id", eventId)
      .eq("sp_id", access.viewerSp.id)
      .maybeSingle();

    if (refreshedError) {
      return applyAuthCookies(
        NextResponse.json({ error: refreshedError.message || "Could not reload your poll response." }, { status: 500 }),
        viewer
      );
    }

    const responseMetadata = parsePollResponseMetadata(refreshedAssignment?.notes);

    return applyAuthCookies(
      NextResponse.json({
        ok: true,
        response: {
          assignmentId: refreshedAssignment?.id || null,
          current: responseMetadata.responseStatus || responseStatus,
          note: responseMetadata.responseNote || responseNote,
          submittedAt: responseMetadata.responseSubmittedAt || submittedAt,
          assignmentStatus: refreshedAssignment?.status || assignmentStatus,
        },
      }),
      viewer
    );
  } catch (error) {
    return NextResponse.json({ error: `Supabase request failed: ${getErrorMessage(error)}` }, { status: 500 });
  }
}
