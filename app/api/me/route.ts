import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE } from "../../lib/authCookies";
import {
  ensureProfileForUser,
  getProfileForUser,
  updateProfileForUser,
  type ProfileResult,
} from "../../lib/profileServer";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeProfileRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sim_op" || role === "admin" || role === "super_admin" || role === "sp") return role;
  return "sp";
}

function getForcedSuperAdminRole(email: unknown, role: string) {
  const normalizedEmail = asText(email).toLowerCase();
  const emailLocalPart = normalizedEmail.split("@")[0] || "";
  if (role === "super_admin" || emailLocalPart === "cory.brodsky") {
    return "super_admin";
  }
  return role;
}

function buildProfileResponse(
  user: Awaited<ReturnType<typeof getAuthenticatedUser>>["user"],
  profile: {
    id: string;
    full_name: string | null;
    schedule_name: string | null;
    email: string | null;
    role: string | null;
    is_active: boolean | null;
  } | null,
  overrides?: {
    full_name?: string | null;
    schedule_name?: string | null;
    role?: string | null;
    profile_image_url?: string | null;
  }
) {
  if (!user) return null;

  const fallbackFullName = asText(user.user_metadata?.full_name) || null;
  const fallbackScheduleName = asText(user.user_metadata?.schedule_name) || null;

  return {
    id: profile?.id || user.id,
    full_name: profile?.full_name ?? overrides?.full_name ?? fallbackFullName,
    schedule_name: profile?.schedule_name ?? overrides?.schedule_name ?? fallbackScheduleName,
    email: profile?.email || user.email || null,
    role: getForcedSuperAdminRole(
      profile?.email || user.email || null,
      normalizeProfileRole(profile?.role || overrides?.role || user.user_metadata?.role)
    ),
    is_active: profile?.is_active ?? null,
    profile_image_url:
      asText(overrides?.profile_image_url) ||
      asText(user.user_metadata?.profile_image_url) ||
      null,
  };
}

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;

    if (!accessToken) {
      return { accessToken: "", user: null, error: "Unauthorized" };
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return { accessToken, user: null, error: "Unauthorized" };
    }

    return { accessToken, user, error: "" };
  } catch {
    return { accessToken: "", user: null, error: "Unauthorized" };
  }
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  let profileResult: ProfileResult = await getProfileForUser(auth.user.id, auth.accessToken);
  if (!profileResult.profile && profileResult.available !== false) {
    profileResult = await ensureProfileForUser(auth.user, auth.accessToken);
  }

  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      created_at: auth.user.created_at || null,
      last_sign_in_at: auth.user.last_sign_in_at || null,
      email_confirmed_at: auth.user.email_confirmed_at || null,
    },
    profile: buildProfileResponse(auth.user, profileResult.profile),
    profile_available: profileResult.available,
    ...(profileResult.error ? { warning: profileResult.error } : {}),
  });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const fullName = asText(body && typeof body === "object" ? (body as { full_name?: unknown }).full_name : "");
    const scheduleName = asText(
      body && typeof body === "object" ? (body as { schedule_name?: unknown }).schedule_name : ""
    );
    const role = normalizeProfileRole(
      body && typeof body === "object" ? (body as { role?: unknown }).role : ""
    );
    const profileImageUrl = asText(
      body && typeof body === "object" ? (body as { profile_image_url?: unknown }).profile_image_url : ""
    );

    if (!fullName) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }

    const profileResult = await updateProfileForUser(
      auth.user,
      {
        full_name: fullName,
        schedule_name: scheduleName || null,
        role,
        profile_image_url: profileImageUrl || null,
      },
      auth.accessToken
    );

    if (profileResult.error && !profileResult.profile) {
      return NextResponse.json(
        { error: profileResult.error, profile_available: profileResult.available },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Profile saved.",
      user: {
        id: auth.user.id,
        email: auth.user.email,
        created_at: auth.user.created_at || null,
        last_sign_in_at: auth.user.last_sign_in_at || null,
        email_confirmed_at: auth.user.email_confirmed_at || null,
      },
      profile: buildProfileResponse(auth.user, profileResult.profile, {
        full_name: fullName,
        schedule_name: scheduleName || null,
        role,
        profile_image_url: profileImageUrl || null,
      }),
      profile_available: profileResult.available,
      warning: profileResult.error || "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save profile." },
      { status: 500 }
    );
  }
}
