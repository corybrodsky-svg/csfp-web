import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../../../../lib/authCookies";
import { getProfileForUser } from "../../../../lib/profileServer";
import { createSupabaseServerClient, supabaseKey, supabaseUrl } from "../../../../lib/supabaseServerClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "super_admin" || role === "admin" || role === "sim_op" || role === "faculty" || role === "sp") return role;
  return "";
}

async function resolveViewer() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value?.trim() || "";
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value?.trim() || "";
  const supabase = createSupabaseServerClient();
  let user = null as Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null;
  let resolvedAccessToken = accessToken;
  let refreshedTokens: { accessToken: string; refreshToken: string } | null = null;
  let shouldClearCookies = false;

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) user = data.user;
  }

  if (!user && refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedUser = data.user || data.session?.user || null;
    if (!error && data.session?.access_token && data.session.refresh_token && refreshedUser) {
      user = refreshedUser;
      resolvedAccessToken = data.session.access_token;
      refreshedTokens = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    }
  }

  if (!user) {
    shouldClearCookies = Boolean(accessToken || refreshToken);
    return { user: null, accessToken: "", role: "", refreshedTokens, shouldClearCookies };
  }

  const profile = await getProfileForUser(user.id, resolvedAccessToken);
  return {
    user,
    accessToken: resolvedAccessToken,
    role: normalizeRole(profile.profile?.role || user.user_metadata?.role),
    refreshedTokens,
    shouldClearCookies,
  };
}

function applySessionCookies(response: NextResponse, viewer: Awaited<ReturnType<typeof resolveViewer>>) {
  if (viewer.refreshedTokens) setAuthCookies(response, viewer.refreshedTokens);
  if (viewer.shouldClearCookies) clearAuthCookies(response);
  return response;
}

function canManageAttendance(role: string) {
  return role === "super_admin" || role === "admin" || role === "sim_op";
}

function createViewerScopedClient(accessToken: string) {
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase configuration.");
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const viewer = await resolveViewer();
  if (!viewer.user) return applySessionCookies(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), viewer);

  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return applySessionCookies(NextResponse.json({ error: "Missing event id." }, { status: 400 }), viewer);

  const supabase = createViewerScopedClient(viewer.accessToken);
  const { data, error } = await supabase
    .from("event_learner_attendance")
    .select("id,event_id,session_id,round_id,room,learner_name,learner_email,status,checked_in_at,note,created_at,updated_at")
    .eq("event_id", eventId)
    .order("learner_name", { ascending: true });

  if (error) {
    return applySessionCookies(NextResponse.json({ error: error.message || "Could not load learner attendance." }, { status: 500 }), viewer);
  }

  return applySessionCookies(NextResponse.json({ records: data || [] }), viewer);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id?: string | string[] }> }
) {
  const viewer = await resolveViewer();
  if (!viewer.user) return applySessionCookies(NextResponse.json({ error: "Unauthorized" }, { status: 401 }), viewer);
  if (!canManageAttendance(viewer.role)) {
    return applySessionCookies(NextResponse.json({ error: "Only Sim Ops or admin accounts can update attendance." }, { status: 403 }), viewer);
  }

  const params = await context.params;
  const eventId = getRouteId(params);
  if (!eventId) return applySessionCookies(NextResponse.json({ error: "Missing event id." }, { status: 400 }), viewer);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const learnerName = asText(body?.learner_name);
  if (!learnerName) {
    return applySessionCookies(NextResponse.json({ error: "Learner name is required." }, { status: 400 }), viewer);
  }

  const status = asText(body?.status) || "expected";
  const payload = {
    event_id: eventId,
    session_id: asText(body?.session_id) || null,
    round_id: asText(body?.round_id) || null,
    room: asText(body?.room) || null,
    learner_name: learnerName,
    learner_email: asText(body?.learner_email) || null,
    status,
    checked_in_at: status === "expected" ? null : asText(body?.checked_in_at) || new Date().toISOString(),
    note: asText(body?.note) || null,
    updated_at: new Date().toISOString(),
  };

  const supabase = createViewerScopedClient(viewer.accessToken);
  const { data: existing } = await supabase
    .from("event_learner_attendance")
    .select("id")
    .eq("event_id", eventId)
    .eq("round_id", payload.round_id)
    .eq("room", payload.room)
    .eq("learner_name", learnerName)
    .maybeSingle();

  const query = existing?.id
    ? supabase
        .from("event_learner_attendance")
        .update(payload)
        .eq("id", existing.id)
        .select("id,event_id,session_id,round_id,room,learner_name,learner_email,status,checked_in_at,note,created_at,updated_at")
        .single()
    : supabase
        .from("event_learner_attendance")
        .insert(payload)
        .select("id,event_id,session_id,round_id,room,learner_name,learner_email,status,checked_in_at,note,created_at,updated_at")
        .single();

  const { data, error } = await query;
  if (error) {
    return applySessionCookies(NextResponse.json({ error: error.message || "Could not update learner attendance." }, { status: 500 }), viewer);
  }

  return applySessionCookies(NextResponse.json({ ok: true, record: data }), viewer);
}
