import type { User } from "@supabase/supabase-js";
import type { AppProfile } from "./profileServer";
import { supabaseKey, supabaseUrl } from "./supabaseServerClient";

type MinimalSpRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  working_email?: string | null;
  email?: string | null;
};

export type SpLinkStatus = "linked" | "pending";
export type SpLinkMatchSource = "saved_link" | "working_email" | "email" | "full_name" | "none";

export type SpAccountLink = {
  status: SpLinkStatus;
  sp_id: string | null;
  sp_name: string | null;
  matched_by: SpLinkMatchSource;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeName(value: unknown) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSpDisplayName(sp: MinimalSpRow) {
  return (
    asText(sp.full_name) ||
    [asText(sp.first_name), asText(sp.last_name)].filter(Boolean).join(" ") ||
    "Unnamed SP"
  );
}

function sameLink(a: SpAccountLink, b: SpAccountLink) {
  return (
    a.status === b.status &&
    a.sp_id === b.sp_id &&
    a.sp_name === b.sp_name &&
    a.matched_by === b.matched_by
  );
}

async function listSps(accessToken?: string) {
  if (!supabaseUrl || !supabaseKey) return [] as MinimalSpRow[];

  const response = await fetch(
    `${supabaseUrl}/rest/v1/sps?select=id,first_name,last_name,full_name,working_email,email`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken || supabaseKey}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) return [] as MinimalSpRow[];
  const body = (await response.json().catch(() => [])) as MinimalSpRow[];
  return Array.isArray(body) ? body : [];
}

export function getSpLinkFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  fallbackFullName?: string | null
) {
  const spId = asText(metadata?.sp_id) || null;
  const spName = asText(metadata?.sp_link_name) || asText(fallbackFullName) || null;
  const status = asText(metadata?.sp_link_status).toLowerCase() === "linked" ? "linked" : "pending";
  const matchedBy = asText(metadata?.sp_link_matched_by).toLowerCase();

  return {
    status: spId ? "linked" : status,
    sp_id: spId,
    sp_name: spName,
    matched_by:
      matchedBy === "saved_link" ||
      matchedBy === "working_email" ||
      matchedBy === "email" ||
      matchedBy === "full_name"
        ? (matchedBy as SpLinkMatchSource)
        : spId
          ? "saved_link"
          : "none",
  } satisfies SpAccountLink;
}

export async function resolveSpAccountLink(args: {
  user: User;
  profile?: AppProfile | null;
  accessToken?: string;
}) {
  const { user, profile, accessToken } = args;
  const existing = getSpLinkFromMetadata(user.user_metadata, profile?.full_name);
  const sps = await listSps(accessToken);

  if (existing.sp_id) {
    const savedMatch = sps.find((sp) => asText(sp.id) === existing.sp_id);
    if (savedMatch) {
      return {
        status: "linked",
        sp_id: savedMatch.id,
        sp_name: getSpDisplayName(savedMatch),
        matched_by: "saved_link",
      } satisfies SpAccountLink;
    }
  }

  const email = normalizeEmail(profile?.email || user.email);
  const fullName = normalizeName(profile?.full_name || user.user_metadata?.full_name);

  const workingEmailMatch = sps.find((sp) => normalizeEmail(sp.working_email) === email);
  if (workingEmailMatch) {
    return {
      status: "linked",
      sp_id: workingEmailMatch.id,
      sp_name: getSpDisplayName(workingEmailMatch),
      matched_by: "working_email",
    } satisfies SpAccountLink;
  }

  const emailMatch = sps.find((sp) => normalizeEmail(sp.email) === email);
  if (emailMatch) {
    return {
      status: "linked",
      sp_id: emailMatch.id,
      sp_name: getSpDisplayName(emailMatch),
      matched_by: "email",
    } satisfies SpAccountLink;
  }

  const fullNameMatch = fullName
    ? sps.find((sp) => normalizeName(sp.full_name || [sp.first_name, sp.last_name].filter(Boolean).join(" ")) === fullName)
    : null;
  if (fullNameMatch) {
    return {
      status: "linked",
      sp_id: fullNameMatch.id,
      sp_name: getSpDisplayName(fullNameMatch),
      matched_by: "full_name",
    } satisfies SpAccountLink;
  }

  return {
    status: "pending",
    sp_id: null,
    sp_name: asText(profile?.full_name || user.user_metadata?.full_name) || null,
    matched_by: "none",
  } satisfies SpAccountLink;
}

export async function persistSpAccountLink(args: {
  user: User;
  link: SpAccountLink;
  accessToken?: string;
}) {
  const { user, link, accessToken } = args;
  const current = getSpLinkFromMetadata(user.user_metadata, null);
  if (sameLink(current, link) || !supabaseUrl || !supabaseKey || !accessToken) return "";

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          ...user.user_metadata,
          sp_id: link.sp_id,
          sp_link_status: link.status,
          sp_link_matched_by: link.matched_by,
          sp_link_name: link.sp_name,
        },
      }),
    });

    if (response.ok) return "";
    return await response.text().catch(() => "Could not persist SP account link.");
  } catch (error) {
    return error instanceof Error ? error.message : "Could not persist SP account link.";
  }
}
