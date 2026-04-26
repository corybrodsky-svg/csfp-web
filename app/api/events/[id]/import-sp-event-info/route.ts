import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as XLSX from "xlsx";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../../lib/authCookies";
import { createSupabaseServerClient } from "../../../../lib/supabaseServerClient";
import { getProfileForUser } from "../../../../lib/profileServer";

export const dynamic = "force-dynamic";

type ViewerContext = {
  id: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  role: string;
  fullName: string;
  scheduleName: string;
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
  if (role === "sp" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "sp";
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  if (localPart === "cory.brodsky") return "super_admin";
  return normalizeRole(role);
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

    return {
      id: auth.user.id,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      email,
      role: getEffectiveRole(email, profile?.role || auth.user.user_metadata?.role),
      fullName: asText(profile?.full_name) || asText(auth.user.user_metadata?.full_name),
      scheduleName: asText(profile?.schedule_name) || asText(auth.user.user_metadata?.schedule_name),
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

function isKnownHeader(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const exactHeaders = new Set([
    "sim staff",
    "event",
    "event title",
    "zoom",
    "link",
    "training date",
    "event date",
    "event dates",
    "event time",
    "case",
    "sp emails",
    "sp names",
    "location",
    "room",
  ]);

  return exactHeaders.has(normalized);
}

function looksLikeDateOrTime(value: string) {
  const normalized = value.toLowerCase();
  return (
    /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(normalized) ||
    /^\d{1,2}:\d{2}(?:\s?[ap]m)?$/i.test(value) ||
    /^\d{1,2}\s?[ap]m$/i.test(value) ||
    /\b(am|pm)\b/i.test(value) ||
    /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(normalized)
  );
}

function looksLikeLocation(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("zoom") ||
    normalized.includes("room") ||
    normalized.includes("location") ||
    normalized.includes("building") ||
    normalized.includes("campus") ||
    normalized.includes("hall")
  );
}

function looksLikeNonPersonValue(value: string) {
  const normalized = value.toLowerCase();

  if (!normalized) return true;
  if (isKnownHeader(value)) return true;
  if (looksLikeDateOrTime(value)) return true;
  if (looksLikeLocation(value)) return true;
  if (normalized.includes("@")) return true;
  if (/https?:\/\//i.test(value)) return true;
  if (/^\d+$/.test(normalized)) return true;
  if (/[0-9]{3,}/.test(normalized)) return true;
  if (normalized.length < 3) return true;

  return false;
}

function extractSimStaffNames(sheet: XLSX.WorkSheet) {
  const names: string[] = [];
  const seen = new Set<string>();
  const rangeRef = sheet["!ref"];

  if (!rangeRef) {
    return names;
  }

  const range = XLSX.utils.decode_range(rangeRef);

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const cellAddress = XLSX.utils.encode_cell({ c: 1, r: row });
    const cell = sheet[cellAddress];
    const value = asText(cell?.v);

    if (!value || looksLikeNonPersonValue(value)) {
      continue;
    }

    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    names.push(value);
  }

  return names;
}

function upsertSimStaffLine(notes: string | null, simStaffNames: string[]) {
  const existingNotes = asText(notes);
  const nextLine = `Sim Staff: ${simStaffNames.join(", ")}`;

  if (!existingNotes) return nextLine;

  const lines = existingNotes
    .split(/\r?\n/)
    .map((line) => line.trimEnd());

  let replaced = false;
  const nextLines = lines.map((line) => {
    if (/^Sim Staff\s*:/i.test(line)) {
      replaced = true;
      return nextLine;
    }
    return line;
  });

  if (!replaced) {
    nextLines.push(nextLine);
  }

  return nextLines.filter(Boolean).join("\n");
}

export async function POST(
  request: Request,
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

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Upload an Excel workbook." }, { status: 400 }),
        viewer
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const targetSheetName = workbook.SheetNames[0] || "";
    const targetSheet = targetSheetName ? workbook.Sheets[targetSheetName] : null;

    if (!targetSheet) {
      return applyAuthCookies(
        NextResponse.json({ error: "Workbook does not contain a readable sheet." }, { status: 400 }),
        viewer
      );
    }

    const simStaffNames = extractSimStaffNames(targetSheet);

    const { data: event, error: eventError } = await supabaseServer
      .from("events")
      .select("id,notes")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return applyAuthCookies(
        NextResponse.json({ error: eventError?.message || "Event not found." }, { status: 404 }),
        viewer
      );
    }

    const nextNotes =
      simStaffNames.length > 0 ? upsertSimStaffLine(event.notes, simStaffNames) : event.notes;

    if (nextNotes !== event.notes) {
      const { error: updateError } = await supabaseServer
        .from("events")
        .update({ notes: nextNotes })
        .eq("id", eventId);

      if (updateError) {
        return applyAuthCookies(
          NextResponse.json({ error: updateError.message }, { status: 500 }),
          viewer
        );
      }
    }

    return applyAuthCookies(
      NextResponse.json({
        imported: {
          sheet: targetSheetName,
          sim_staff_names_detected: simStaffNames.length,
          sim_staff_names: simStaffNames,
          stored_in: "event.notes",
        },
      }),
      viewer
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import SP Event Info workbook." },
      { status: 500 }
    );
  }
}
