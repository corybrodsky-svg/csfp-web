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
};

const ALLOWED_PROFILE_ROLES = new Set(["sp", "sim_op", "admin"]);
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

  const withScheduleUrl = `${supabaseUrl}/rest/v1/profiles?select=id,full_name,schedule_name,email,role,is_active&${query}`;
  const withScheduleResponse = await fetch(withScheduleUrl, {
    headers: getRestHeaders(accessToken),
  });
  const withScheduleText = await withScheduleResponse.text();

  if (withScheduleResponse.ok) {
    const body = parseJson<AppProfile[]>(withScheduleText);
    return {
      profiles: Array.isArray(body)
        ? body.map((profile) => ({
            id: asText(profile.id),
            full_name: profile.full_name ?? null,
            schedule_name: profile.schedule_name ?? null,
            email: profile.email ?? null,
            role: profile.role ?? null,
            is_active: profile.is_active ?? null,
          }))
        : [],
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
      return { profiles: [], available: false };
    }
    return { profiles: [], available: true, error: withScheduleError };
  }

  const withoutScheduleUrl = `${supabaseUrl}/rest/v1/profiles?select=id,full_name,email,role,is_active&${query}`;
  const withoutScheduleResponse = await fetch(withoutScheduleUrl, {
    headers: getRestHeaders(accessToken),
  });
  const withoutScheduleText = await withoutScheduleResponse.text();

  if (withoutScheduleResponse.ok) {
    const body = parseJson<Array<Omit<AppProfile, "schedule_name">>>(withoutScheduleText);
    return {
      profiles: Array.isArray(body)
        ? body.map((profile) => ({
            ...profile,
            schedule_name: null,
          }))
        : [],
      available: true,
    };
  }

  const withoutScheduleError =
    asText(parseJson<{ message?: string; error?: string }>(withoutScheduleText)?.message) ||
    asText(parseJson<{ message?: string; error?: string }>(withoutScheduleText)?.error) ||
    withoutScheduleText ||
    `${withoutScheduleResponse.status} ${withoutScheduleResponse.statusText}`;

  if (isMissingProfilesTable(withoutScheduleError)) {
    return { profiles: [], available: false };
  }

  return { profiles: [], available: true, error: withoutScheduleError };
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
    const body = parseJson<AppProfile[]>(withScheduleText);
    const profile = Array.isArray(body) && body[0] ? body[0] : null;
    return {
      profile: profile
        ? {
            id: asText(profile.id),
            full_name: profile.full_name ?? null,
            schedule_name: profile.schedule_name ?? values.schedule_name,
            email: profile.email ?? null,
            role: profile.role ?? null,
            is_active: profile.is_active ?? null,
          }
        : {
            id: values.id,
            full_name: values.full_name,
            schedule_name: values.schedule_name,
            email: values.email,
            role: values.role,
            is_active: values.is_active,
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
    const body = parseJson<Array<Omit<AppProfile, "schedule_name">>>(withoutScheduleText);
    const profile = Array.isArray(body) && body[0] ? body[0] : null;
    return {
      profile: profile
        ? {
            ...profile,
            schedule_name: values.schedule_name,
          }
        : {
            id: values.id,
            full_name: values.full_name,
            schedule_name: values.schedule_name,
            email: values.email,
            role: values.role,
            is_active: values.is_active,
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
    const combinedError = profileResult.error || metadataError;
    return {
      profile: profileResult.profile,
      available: profileResult.available,
      ...(combinedError ? { error: combinedError } : {}),
    } satisfies ProfileResult;
  }

  if (!metadataError) {
    return {
      profile: buildSyntheticProfile(user, {
        full_name: fullName,
        schedule_name: scheduleName,
        role,
      }),
      available: true,
      ...(profileResult.error ? { error: profileResult.error } : {}),
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
