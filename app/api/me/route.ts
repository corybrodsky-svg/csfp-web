import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE } from "../../lib/authCookies";
import { ensureProfileForUser, getProfileForUser, updateProfileForUser } from "../../lib/profileServer";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function getAuthenticatedUser() {
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
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (!auth.user) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  let profileResult = await getProfileForUser(auth.user.id);
  if (!profileResult.profile && profileResult.available !== false) {
    profileResult = await ensureProfileForUser(auth.user);
  }

  if (profileResult.error && !profileResult.profile) {
    return NextResponse.json(
      { error: profileResult.error, profile_available: profileResult.available },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
    },
    profile: profileResult.profile
      ? {
          ...profileResult.profile,
          schedule_name:
            profileResult.profile.schedule_name ||
            asText(auth.user.user_metadata?.schedule_name) ||
            null,
        }
      : null,
    profile_available: profileResult.available,
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

    if (!fullName) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }

    const profileResult = await updateProfileForUser(auth.user, {
      full_name: fullName,
      schedule_name: scheduleName || null,
    });

    if (profileResult.available === false) {
      return NextResponse.json(
        { error: "Profiles are not available on this deployment yet.", profile_available: false },
        { status: 500 }
      );
    }

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
      },
      profile: profileResult.profile
        ? {
            ...profileResult.profile,
            schedule_name: profileResult.profile.schedule_name || scheduleName || null,
          }
        : null,
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
