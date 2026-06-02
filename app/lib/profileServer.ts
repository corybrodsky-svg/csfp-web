import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabaseAdminClient";
import { supabaseKey, supabaseUrl } from "./supabaseServerClient";

export type AppProfile = {
  id: string;
  full_name: string | null;
  schedule_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean | null;
  profile_image_url?: string | null;
  sp_id?: string | null;
};

const ALLOWED_PROFILE_ROLES = new Set(["sp", "faculty", "sim_op", "admin", "super_admin"]);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isMissingProfilesTable(message: string) {
  return /relation .*profiles/i.test(message) || /table .*profiles/i.test(message);
}

function isMissingScheduleNameColumn(message: string) {
  return /column .*schedule_name/i.test(message);
}

function isMissingProfileImageColumn(message: string) {
  return /column .*profile_image_url/i.test(message);
}

function isMissingSpIdColumn(message: string) {
  return /column .*sp_id/i.test(message);
}

function getMissingOptionalProfileColumn(message: string) {
  if (isMissingScheduleNameColumn(message)) return "schedule_name" as const;
  if (isMissingProfileImageColumn(message)) return "profile_image_url" as const;
  if (isMissingSpIdColumn(message)) return "sp_id" as const;
  return null;
}

function normalizeProfileRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  return ALLOWED_PROFILE_ROLES.has(role) ? role : "sp";
}

function getRestAuthToken(accessToken?: string) {
  return asText(serviceRoleKey) || asText(accessToken) || "";
}

function getRestHeaders(accessToken?: string, includeJson = false) {
  const token = getRestAuthToken(accessToken);
  const headers: Record<string, string> = {
    apikey: serviceRoleKey || supabaseKey || "",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function parseJson<T>(text: string) {
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function buildSyntheticProfile(
  user: User,
  values: { full_name: string | null; schedule_name: string | null; role: string | null }
) {
  return {
    id: user.id,
    full_name: values.full_name,
    schedule_name: values.schedule_name,
    email: user.email || null,
    role: values.role,
    is_active: true,
  } satisfies AppProfile;
}

export type ProfileResult = {
  profile: AppProfile | null;
  available: boolean;
  error?: string;
  warning?: string;
};

type ProfileDirectoryResult = {
  profiles: AppProfile[];
  available: boolean;
  error?: string;
};

async function fetchProfiles(
  query: string,
  accessToken?: string
): Promise<{ profiles: AppProfile[]; available: boolean; error?: string }> {
  if (!supabaseUrl || !supabaseKey) {
    return { profiles: [], available: false };
  }

  const token = getRestAuthToken(accessToken);
  if (!token) {
    return { profiles: [], available: false };
  }

  const optionalColumns = new Set(["schedule_name", "profile_image_url", "sp_id"]);
  const baseColumns = ["id", "full_name", "email", "role", "is_active"];

  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const selectColumns = [...baseColumns, ...Array.from(optionalColumns)].join(",");
    const url = `${supabaseUrl}/rest/v1/profiles?select=${encodeURIComponent(selectColumns)}&${query}`;
    const response = await fetch(url, {
      headers: getRestHeaders(accessToken),
    });
    const responseText = await response.text();

    if (response.ok) {
      const body = parseJson<Array<Record<string, unknown>>>(responseText);
      return {
        profiles: Array.isArray(body)
          ? body.map((profile) => ({
              id: asText(profile.id),
              full_name: asText(profile.full_name) || null,
              schedule_name: optionalColumns.has("schedule_name") ? asText(profile.schedule_name) || null : null,
              email: asText(profile.email) || null,
              role: asText(profile.role) || null,
              is_active: typeof profile.is_active === "boolean" ? profile.is_active : null,
              profile_image_url: optionalColumns.has("profile_image_url")
                ? asText(profile.profile_image_url) || null
                : null,
              sp_id: optionalColumns.has("sp_id") ? asText(profile.sp_id) || null : null,
            }))
          : [],
        available: true,
      };
    }

    const responseError =
      asText(parseJson<{ message?: string; error?: string }>(responseText)?.message) ||
      asText(parseJson<{ message?: string; error?: string }>(responseText)?.error) ||
      responseText ||
      `${response.status} ${response.statusText}`;

    if (isMissingProfilesTable(responseError)) {
      return { profiles: [], available: false };
    }

    const missingOptionalColumn = getMissingOptionalProfileColumn(responseError);
    if (missingOptionalColumn && optionalColumns.has(missingOptionalColumn)) {
      optionalColumns.delete(missingOptionalColumn);
      continue;
    }

    return { profiles: [], available: true, error: responseError };
  }

  return { profiles: [], available: true, error: "Could not load profiles." };
}

async function upsertProfile(
  values: {
    id: string;
    full_name: string | null;
    schedule_name: string | null;
    email: string | null;
    role: string;
    is_active: boolean;
  },
  accessToken?: string
): Promise<ProfileResult> {
  if (!supabaseUrl || !supabaseKey) {
    return { profile: null, available: false };
  }

  const token = getRestAuthToken(accessToken);
  if (!token) {
    return { profile: null, available: false };
  }

  const withScheduleResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=id&select=*`, {
    method: "POST",
    headers: {
      ...getRestHeaders(accessToken, true),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([values]),
  });
  const withScheduleText = await withScheduleResponse.text();

  if (withScheduleResponse.ok) {
    const body = parseJson<Array<Record<string, unknown>>>(withScheduleText);
    const profile = Array.isArray(body) && body[0] ? body[0] : null;
    return {
      profile: profile
        ? {
            id: asText(profile.id),
            full_name: asText(profile.full_name) || null,
            schedule_name: asText(profile.schedule_name) || values.schedule_name,
            email: asText(profile.email) || null,
            role: asText(profile.role) || null,
            is_active: typeof profile.is_active === "boolean" ? profile.is_active : null,
            profile_image_url: asText(profile.profile_image_url) || null,
            sp_id: asText(profile.sp_id) || null,
          }
        : {
            id: values.id,
            full_name: values.full_name,
            schedule_name: values.schedule_name,
            email: values.email,
            role: values.role,
            is_active: values.is_active,
            profile_image_url: null,
            sp_id: null,
          },
      available: true,
    };
  }

  const withScheduleError =
    asText(parseJson<{ message?: string; error?: string }>(withScheduleText)?.message) ||
    asText(parseJson<{ message?: string; error?: string }>(withScheduleText)?.error) ||
    withScheduleText ||
    `${withScheduleResponse.status} ${withScheduleResponse.statusText}`;

  if (!isMissingScheduleNameColumn(withScheduleError)) {
    if (isMissingProfilesTable(withScheduleError)) {
      return { profile: null, available: false };
    }
    return { profile: null, available: true, error: withScheduleError };
  }

  const withoutScheduleName = {
    id: values.id,
    full_name: values.full_name,
    email: values.email,
    role: values.role,
    is_active: values.is_active,
  };
  const withoutScheduleResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=id&select=*`, {
    method: "POST",
    headers: {
      ...getRestHeaders(accessToken, true),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([withoutScheduleName]),
  });
  const withoutScheduleText = await withoutScheduleResponse.text();

  if (withoutScheduleResponse.ok) {
    const body = parseJson<Array<Record<string, unknown>>>(withoutScheduleText);
    const profile = Array.isArray(body) && body[0] ? body[0] : null;
    return {
      profile: profile
        ? {
            id: asText(profile.id),
            full_name: asText(profile.full_name) || null,
            schedule_name: values.schedule_name,
            email: asText(profile.email) || null,
            role: asText(profile.role) || null,
            is_active: typeof profile.is_active === "boolean" ? profile.is_active : null,
            profile_image_url: asText(profile.profile_image_url) || null,
            sp_id: asText(profile.sp_id) || null,
          }
        : {
            id: values.id,
            full_name: values.full_name,
            schedule_name: values.schedule_name,
            email: values.email,
            role: values.role,
            is_active: values.is_active,
            profile_image_url: null,
            sp_id: null,
          },
      available: true,
    };
  }

  const withoutScheduleError =
    asText(parseJson<{ message?: string; error?: string }>(withoutScheduleText)?.message) ||
    asText(parseJson<{ message?: string; error?: string }>(withoutScheduleText)?.error) ||
    withoutScheduleText ||
    `${withoutScheduleResponse.status} ${withoutScheduleResponse.statusText}`;

  if (isMissingProfilesTable(withoutScheduleError)) {
    return { profile: null, available: false };
  }

  return { profile: null, available: true, error: withoutScheduleError };
}

async function updateUserMetadata(
  user: User,
  accessToken: string | undefined,
  values: {
    full_name: string | null;
    schedule_name: string | null;
    role: string;
    profile_image_url: string | null;
  }
) {
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        full_name: values.full_name,
        schedule_name: values.schedule_name,
        role: values.role,
        profile_image_url: values.profile_image_url,
      },
    });

    return error?.message || "";
  }

  const token = asText(accessToken);
  if (!token || !supabaseUrl || !supabaseKey) {
    return "Could not update auth profile metadata.";
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          ...user.user_metadata,
          full_name: values.full_name,
          schedule_name: values.schedule_name,
          role: values.role,
          profile_image_url: values.profile_image_url,
        },
      }),
    });

    if (response.ok) return "";

    const text = await response.text().catch(() => "");
    const errorBody = parseJson<{ msg?: string; message?: string; error?: string }>(text);
    return asText(errorBody?.msg) || asText(errorBody?.message) || asText(errorBody?.error) || text || `${response.status} ${response.statusText}`;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not update auth profile metadata.";
  }
}

export async function ensureProfileForUser(user: User, accessToken?: string): Promise<ProfileResult> {
  const fullName = asText(user.user_metadata?.full_name) || null;
  const scheduleName = asText(user.user_metadata?.schedule_name) || null;
  const email = user.email || null;
  const role = normalizeProfileRole(user.user_metadata?.role);

  return upsertProfile(
    {
      id: user.id,
      full_name: fullName,
      schedule_name: scheduleName,
      email,
      role,
      is_active: true,
    },
    accessToken
  );
}

export async function getProfileForUser(userId: string, accessToken?: string): Promise<ProfileResult> {
  const result = await fetchProfiles(`id=eq.${encodeURIComponent(userId)}`, accessToken);
  return {
    profile: result.profiles[0] || null,
    available: result.available,
    ...(result.error ? { error: result.error } : {}),
  } satisfies ProfileResult;
}

export async function updateProfileForUser(
  user: User,
  updates: {
    full_name?: string | null;
    schedule_name?: string | null;
    role?: string | null;
    profile_image_url?: string | null;
  },
  accessToken?: string
): Promise<ProfileResult> {
  const fullName = Object.prototype.hasOwnProperty.call(updates, "full_name")
    ? asText(updates.full_name) || null
    : asText(user.user_metadata?.full_name) || null;
  const scheduleName = Object.prototype.hasOwnProperty.call(updates, "schedule_name")
    ? asText(updates.schedule_name) || null
    : asText(user.user_metadata?.schedule_name) || null;
  const email = user.email || null;
  const role = Object.prototype.hasOwnProperty.call(updates, "role")
    ? normalizeProfileRole(updates.role)
    : normalizeProfileRole(user.user_metadata?.role);
  const profileImageUrl = Object.prototype.hasOwnProperty.call(updates, "profile_image_url")
    ? asText(updates.profile_image_url) || null
    : asText(user.user_metadata?.profile_image_url) || null;

  const profileResult = await upsertProfile(
    {
      id: user.id,
      full_name: fullName,
      schedule_name: scheduleName,
      email,
      role,
      is_active: true,
    },
    accessToken
  );

  const metadataError = await updateUserMetadata(user, accessToken, {
    full_name: fullName,
    schedule_name: scheduleName,
    role,
    profile_image_url: profileImageUrl,
  });

  if (profileResult.profile) {
    const metadataWarning = metadataError || "";
    return {
      profile: profileResult.profile,
      available: profileResult.available,
      ...(profileResult.error ? { error: profileResult.error } : {}),
      ...(metadataWarning ? { warning: metadataWarning } : {}),
    } satisfies ProfileResult;
  }

  if (!metadataError) {
    const profileSaveError = profileResult.error || "Could not save profile changes.";
    return {
      profile: buildSyntheticProfile(user, {
        full_name: fullName,
        schedule_name: scheduleName,
        role,
      }),
      available: profileResult.available,
      error: profileSaveError,
    } satisfies ProfileResult;
  }

  return {
    profile: null,
    available: profileResult.available,
    error: profileResult.error || metadataError,
  } satisfies ProfileResult;
}

export async function getProfilesByIds(userIds: string[]): Promise<ProfileDirectoryResult> {
  const ids = Array.from(new Set(userIds.map(asText).filter(Boolean)));
  if (!ids.length) {
    return { profiles: [], available: true };
  }

  if (!serviceRoleKey) {
    return { profiles: [], available: false };
  }

  const query = ids.map((id) => encodeURIComponent(id)).join(",");
  const result = await fetchProfiles(`id=in.(${query})`);

  return {
    profiles: result.profiles,
    available: result.available,
    ...(result.error ? { error: result.error } : {}),
  };
}
