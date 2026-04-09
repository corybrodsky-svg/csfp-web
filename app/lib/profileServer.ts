import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabaseAdminClient";

export type AppProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean | null;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isMissingProfilesTable(message: string) {
  return /relation .*profiles/i.test(message) || /table .*profiles/i.test(message);
}

type ProfileResult = {
  profile: AppProfile | null;
  available: boolean;
  error?: string;
};

export async function ensureProfileForUser(user: User) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { profile: null as AppProfile | null, available: false } satisfies ProfileResult;
  }

  const fullName = asText(user.user_metadata?.full_name) || null;
  const email = user.email || null;
  const role = asText(user.user_metadata?.role) || "viewer";

  const { data, error } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: fullName,
        email,
        role,
        is_active: true,
      },
      { onConflict: "id" }
    )
    .select("id,full_name,email,role,is_active")
    .maybeSingle();

  if (error) {
    if (isMissingProfilesTable(error.message)) {
      return { profile: null as AppProfile | null, available: false } satisfies ProfileResult;
    }
    return { profile: null as AppProfile | null, available: true, error: error.message } satisfies ProfileResult;
  }

  return {
    profile: (data as AppProfile | null) || null,
    available: true,
  } satisfies ProfileResult;
}

export async function getProfileForUser(userId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { profile: null as AppProfile | null, available: false } satisfies ProfileResult;
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id,full_name,email,role,is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingProfilesTable(error.message)) {
      return { profile: null as AppProfile | null, available: false } satisfies ProfileResult;
    }
    return { profile: null as AppProfile | null, available: true, error: error.message } satisfies ProfileResult;
  }

  return {
    profile: (data as AppProfile | null) || null,
    available: true,
  } satisfies ProfileResult;
}

export async function updateProfileForUser(user: User, updates: { full_name?: string | null }) {
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { profile: null as AppProfile | null, available: false } satisfies ProfileResult;
  }

  const fullName = Object.prototype.hasOwnProperty.call(updates, "full_name")
    ? asText(updates.full_name) || null
    : asText(user.user_metadata?.full_name) || null;
  const email = user.email || null;
  const role = asText(user.user_metadata?.role) || "viewer";

  const { data, error } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: fullName,
        email,
        role,
        is_active: true,
      },
      { onConflict: "id" }
    )
    .select("id,full_name,email,role,is_active")
    .maybeSingle();

  if (error) {
    if (isMissingProfilesTable(error.message)) {
      return { profile: null as AppProfile | null, available: false } satisfies ProfileResult;
    }
    return { profile: null as AppProfile | null, available: true, error: error.message } satisfies ProfileResult;
  }

  const metadataError = await admin.auth.admin
    .updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        full_name: fullName,
        role,
      },
    })
    .then(({ error: authError }) => authError?.message || "");

  return {
    profile: (data as AppProfile | null) || null,
    available: true,
    ...(metadataError ? { error: metadataError } : {}),
  } satisfies ProfileResult;
}
