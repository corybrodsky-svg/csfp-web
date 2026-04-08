import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE } from "../../lib/authCookies";
import { ensureProfileForUser, getProfileForUser } from "../../lib/profileServer";
import { createSupabaseServerClient } from "../../lib/supabaseServerClient";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let profileResult = await getProfileForUser(user.id);
  if (!profileResult.profile && profileResult.available !== false) {
    profileResult = await ensureProfileForUser(user);
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
    profile: profileResult.profile,
    profile_available: profileResult.available,
  });
}
