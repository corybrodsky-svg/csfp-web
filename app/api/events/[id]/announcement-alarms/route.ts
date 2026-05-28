import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../../lib/authCookies";
import { parseAnnouncementAlertSettings, serializeAnnouncementAlertSettings } from "../../../../lib/announcementCues";
import { upsertEventMetadata } from "../../../../lib/eventMetadata";
import { getProfileForUser } from "../../../../lib/profileServer";
import { sanitizePublicErrorMessage } from "../../../../lib/safeErrorMessage";
import { sanitizeScheduleWorkflowNotes } from "../../../../lib/scheduleWorkflowNotes";
import { supabaseKey, supabaseUrl } from "../../../../lib/supabaseServerClient";
import { parseTrainingEventMetadata } from "../../../../lib/trainingEventNotes";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getRouteId(params: unknown) {
  const raw =
    params && typeof params === "object" && "id" in params
      ? (params as { id?: string | string[] }).id
      : "";
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
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
    if (normalizedRole === "super_admin" || normalizedRole === "admin" || normalizedRole === "sim_op") {
      return normalizedRole;
    }
    return "super_admin";
  }

  return normalizedRole;
}

type ViewerContext = {
  accessToken: string;
  refreshToken: string;
  role: string;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  shouldClearCookies?: boolean;
};

function createViewerScopedClient(accessToken: string) {
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase configuration.");
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value || "";
    const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value || "";

    if (!accessToken && !refreshToken) {
      return { accessToken: "", refreshToken: "", user: null as Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"] | null };
    }

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (accessToken) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (!error && user) {
        return { accessToken, refreshToken, user, refreshedTokens: undefined, shouldClearCookies: false };
      }
    }

    if (!refreshToken) {
      return { accessToken, refreshToken, user: null, refreshedTokens: undefined, shouldClearCookies: true };
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (error || !refreshedUser || !refreshedAccessToken || !refreshedRefreshToken) {
      return { accessToken, refreshToken, user: null, refreshedTokens: undefined, shouldClearCookies: true };
    }

    return {
      accessToken: refreshedAccessToken,
      refreshToken: refreshedRefreshToken,
      user: refreshedUser,
      refreshedTokens: {
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken,
      },
      shouldClearCookies: false,
    };
  } catch {
    return { accessToken: "", refreshToken: "", user: null as null, refreshedTokens: undefined, shouldClearCookies: false };
  }
}

async function getAuthenticatedViewer(): Promise<ViewerContext | null> {
  const auth = await getAuthenticatedUser();
  if (!auth.user) return null;

  const profileResult = await getProfileForUser(auth.user.id, auth.accessToken);
  const profile = profileResult.profile;
  const email = asText(profile?.email) || asText(auth.user.email);

  return {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    role: getEffectiveRole(email, profile?.role || auth.user.user_metadata?.role),
    refreshedTokens: auth.refreshedTokens,
    shouldClearCookies: auth.shouldClearCookies,
  };
}

function applyAuthCookies(response: NextResponse, viewer: ViewerContext | null) {
  if (!viewer) return response;

  if (viewer.refreshedTokens) {
    setAuthCookies(response, viewer.refreshedTokens);
  }

  return response;
}

function jsonOk(body: Record<string, unknown>, viewer?: ViewerContext | null) {
  return applyAuthCookies(NextResponse.json({ ok: true, ...body }), viewer || null);
}

function sanitizeDiagnostics(diagnostics?: Record<string, unknown>) {
  if (!diagnostics) return {};
  return Object.fromEntries(
    Object.entries(diagnostics).map(([key, value]) => [
      key,
      key === "message" || key === "details" || key === "hint"
        ? sanitizePublicErrorMessage(value, "")
        : value,
    ])
  );
}

function jsonError(
  error: string,
  message: string,
  status: number,
  viewer?: ViewerContext | null,
  diagnostics?: Record<string, unknown>
) {
  return applyAuthCookies(
    NextResponse.json(
      {
        ok: false,
        error,
        message: sanitizePublicErrorMessage(message, "Could not save announcement alarm settings."),
        status,
        diagnostics: {
          route: "/api/events/[id]/announcement-alarms",
          ...sanitizeDiagnostics(diagnostics),
        },
      },
      { status }
    ),
    viewer || null
  );
}

function unauthorizedResponse(viewer?: ViewerContext | null) {
  const response = jsonError("unauthorized", "Authentication is required.", 401, viewer || null);
  if (viewer?.shouldClearCookies) {
    clearAuthCookies(response);
  }
  return response;
}

function getSafeAnnouncementAlarmUpdates(rawUpdates: unknown) {
  if (!rawUpdates || typeof rawUpdates !== "object") return null;

  const source = rawUpdates as Record<string, unknown>;
  const updates: Record<string, boolean | string> = {};

  if (typeof source.liveModeActive === "boolean") {
    updates.liveModeActive = source.liveModeActive;
  }
  if (typeof source.muteAlerts === "boolean") {
    updates.muteAlerts = source.muteAlerts;
  }
  if (typeof source.notificationsEnabled === "boolean") {
    updates.notificationsEnabled = source.notificationsEnabled;
  }
  if (typeof source.lastStartedAt === "string") {
    updates.lastStartedAt = asText(source.lastStartedAt);
  }

  return Object.keys(updates).length ? updates : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<unknown> }
) {
  try {
    const viewer = await getAuthenticatedViewer();
    if (!viewer) {
      return unauthorizedResponse();
    }
    if (!isOperatorRole(viewer.role)) {
      return jsonError("forbidden", "Only Sim Ops or admin accounts can edit announcement alarms.", 403, viewer);
    }

    const params = await context.params;
    const eventId = getRouteId(params);
    if (!eventId) {
      return jsonError("bad_request", "Missing event id.", 400, viewer);
    }

    const body = await request.json().catch(() => null);
    const alertUpdates = getSafeAnnouncementAlarmUpdates(body?.alert_settings);
    if (!alertUpdates) {
      return jsonError("bad_request", "No announcement alarm settings were provided.", 400, viewer, { eventId, role: viewer.role });
    }

    const supabase = createViewerScopedClient(viewer.accessToken);
    const { data: existingEvent, error: loadError } = await supabase
      .from("events")
      .select("notes")
      .eq("id", eventId)
      .maybeSingle();

    if (loadError) {
      return jsonError("server_error", "Could not load current event notes.", 500, viewer, {
        eventId,
        role: viewer.role,
        code: asText(loadError.code),
        message: asText(loadError.message),
      });
    }

    const currentNotes = sanitizeScheduleWorkflowNotes(existingEvent?.notes ?? "");
    const currentTrainingMetadata = parseTrainingEventMetadata(currentNotes);
    const currentAlertSettings = parseAnnouncementAlertSettings(currentTrainingMetadata.announcement_alert_settings);
    const nextAlertSettings = {
      ...currentAlertSettings,
      ...alertUpdates,
    };

    const nextNotes = upsertEventMetadata(currentNotes, {
      training: {
        announcement_alert_settings: serializeAnnouncementAlertSettings(nextAlertSettings),
      },
    });

    const { error: updateError } = await supabase
      .from("events")
      .update({ notes: nextNotes })
      .eq("id", eventId);

    if (updateError) {
      return jsonError("server_error", "Could not save announcement alarm settings.", 500, viewer, {
        eventId,
        role: viewer.role,
        code: asText(updateError.code),
        message: asText(updateError.message),
      });
    }

    return jsonOk({ alert_settings: nextAlertSettings }, viewer);
  } catch (error) {
    return jsonError(
      "server_error",
      error instanceof Error ? error.message : "Could not save announcement alarm settings.",
      500,
      null
    );
  }
}
