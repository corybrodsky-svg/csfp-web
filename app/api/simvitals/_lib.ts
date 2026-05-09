import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "@/app/lib/authCookies";
import { getProfileForUser } from "@/app/lib/profileServer";
import { createSupabaseAdminClient } from "@/app/lib/supabaseAdminClient";
import {
  createSupabaseServerClient,
  supabaseKey,
  supabaseUrl,
} from "@/app/lib/supabaseServerClient";

export const SIMVITALS_POST_TYPES = [
  "general_update",
  "staffing_alert",
  "faculty_note",
  "live_issue",
  "training_update",
  "system_notice",
] as const;

export const SIMVITALS_ROLES = ["sim_ops", "admin", "faculty", "sp", "system"] as const;
export const SIMVITALS_SCHEMA_MESSAGE =
  "SimVitals storage is not ready yet. Apply supabase/migrations/20260509_create_simvitals_tables.sql.";

export type SimVitalsPostType = (typeof SIMVITALS_POST_TYPES)[number];
export type SimVitalsRole = (typeof SIMVITALS_ROLES)[number];

export type SimVitalsViewer = {
  id: string;
  email: string;
  displayName: string;
  role: SimVitalsRole;
  accessToken: string;
};

export type SimVitalsContext = {
  db: SupabaseClient;
  viewer: SimVitalsViewer;
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
  };
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown): SimVitalsRole {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "super_admin" || role === "admin") return "admin";
  if (role === "sim_op" || role === "sim_ops") return "sim_ops";
  if (role === "faculty") return "faculty";
  if (role === "sp") return "sp";
  if (role === "system") return "system";
  return "sp";
}

function getDisplayName(user: User, profile: { full_name?: string | null; schedule_name?: string | null; email?: string | null } | null) {
  const profileName = asText(profile?.full_name) || asText(profile?.schedule_name);
  if (profileName) return profileName;

  const metadataName = asText(user.user_metadata?.full_name) || asText(user.user_metadata?.schedule_name);
  if (metadataName) return metadataName;

  const email = asText(profile?.email) || asText(user.email);
  const atIndex = email.indexOf("@");
  return atIndex > 0 ? email.slice(0, atIndex) : email || "CFSP Team";
}

function createViewerSupabaseClient(accessToken: string) {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Supabase error";
}

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export function applySimVitalsAuthCookies(response: NextResponse, context: SimVitalsContext | null) {
  if (context?.refreshedTokens) {
    setAuthCookies(response, context.refreshedTokens);
  }
  return response;
}

export function unauthorizedSimVitalsResponse() {
  const response = jsonNoStore({ ok: false, error: "Unauthorized" }, { status: 401 });
  clearAuthCookies(response);
  return response;
}

export function normalizePostType(value: unknown): SimVitalsPostType {
  const normalized = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return SIMVITALS_POST_TYPES.includes(normalized as SimVitalsPostType)
    ? (normalized as SimVitalsPostType)
    : "general_update";
}

export function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(
    new Set(
      value
        .map((item) => asText(item))
        .filter(Boolean)
        .slice(0, 8)
    )
  );
}

export function isMissingSimVitalsSchemaError(error: unknown) {
  const source = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const text = [source?.code, source?.message, source?.details, source?.hint].map(asText).join(" ");
  return (
    /\b42P01\b|PGRST205/i.test(text) ||
    /simvitals_(posts|comments|reactions)/i.test(text) ||
    /relation .*simvitals/i.test(text) ||
    /could not find .*simvitals/i.test(text)
  );
}

export async function getAuthenticatedSimVitalsContext(): Promise<SimVitalsContext | null> {
  const cookieStore = await cookies();
  const accessToken = asText(cookieStore.get(AUTH_ACCESS_COOKIE)?.value);
  const refreshToken = asText(cookieStore.get(AUTH_REFRESH_COOKIE)?.value);

  if (!accessToken && !refreshToken) return null;

  const supabase = createSupabaseServerClient();
  let activeAccessToken = accessToken;
  let activeUser: User | null = null;
  let refreshedTokens: SimVitalsContext["refreshedTokens"];

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data.user) {
      activeUser = data.user;
    }
  }

  if (!activeUser && refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (!error && refreshedUser && refreshedAccessToken && refreshedRefreshToken) {
      activeUser = refreshedUser;
      activeAccessToken = refreshedAccessToken;
      refreshedTokens = {
        accessToken: refreshedAccessToken,
        refreshToken: refreshedRefreshToken,
      };
    }
  }

  if (!activeUser || !activeAccessToken) return null;

  const profileResult = await getProfileForUser(activeUser.id, activeAccessToken);
  const profile = profileResult.profile;
  const viewer: SimVitalsViewer = {
    id: activeUser.id,
    email: asText(profile?.email) || asText(activeUser.email),
    displayName: getDisplayName(activeUser, profile),
    role: normalizeRole(profile?.role || activeUser.user_metadata?.role),
    accessToken: activeAccessToken,
  };
  const db = createSupabaseAdminClient() || createViewerSupabaseClient(activeAccessToken);

  if (!db) {
    throw new Error("Supabase is not configured for SimVitals.");
  }

  return {
    db,
    viewer,
    refreshedTokens,
  };
}
