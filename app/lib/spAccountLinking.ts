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
export type SpLinkMatchSource = "saved_link" | "working_email" | "email" | "schedule_name" | "full_name" | "none";

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

function linkStrength(link: SpAccountLink) {
  if (link.matched_by === "saved_link") return 5;
  if (link.matched_by === "working_email") return 4;
  if (link.matched_by === "email") return 3;
  if (link.matched_by === "schedule_name") return 2;
  if (link.matched_by === "full_name") return 1;
  return 0;
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
  const spId =
    asText(metadata?.sp_id) ||
    asText(metadata?.linked_sp_id) ||
    asText(metadata?.sp_link_sp_id) ||
    null;
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
      matchedBy === "schedule_name" ||
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

    return {
      status: "linked",
      sp_id: existing.sp_id,
      sp_name: existing.sp_name || asText(profile?.full_name || user.user_metadata?.full_name) || null,
      matched_by: "saved_link",
    } satisfies SpAccountLink;
  }

  const emailCandidates = Array.from(
    new Set(
      [
        normalizeEmail(profile?.email),
        normalizeEmail(user.email),
        normalizeEmail(user.user_metadata?.email),
        normalizeEmail(user.user_metadata?.working_email),
      ].filter(Boolean)
    )
  );
  const scheduleNameCandidates = Array.from(
    new Set(
      [
        normalizeName(profile?.schedule_name),
        normalizeName(user.user_metadata?.schedule_name),
      ].filter(Boolean)
    )
  );
  const fullNameCandidates = Array.from(
    new Set(
      [
        normalizeName(profile?.full_name),
        normalizeName(user.user_metadata?.full_name),
      ].filter(Boolean)
    )
  );

  const workingEmailMatch = sps.find((sp) => {
    const spEmail = normalizeEmail(sp.working_email);
    return spEmail && emailCandidates.includes(spEmail);
  });
  if (workingEmailMatch) {
    return {
      status: "linked",
      sp_id: workingEmailMatch.id,
      sp_name: getSpDisplayName(workingEmailMatch),
      matched_by: "working_email",
    } satisfies SpAccountLink;
  }

  const emailMatch = sps.find((sp) => {
    const spEmail = normalizeEmail(sp.email);
    return spEmail && emailCandidates.includes(spEmail);
  });
  if (emailMatch) {
    return {
      status: "linked",
      sp_id: emailMatch.id,
      sp_name: getSpDisplayName(emailMatch),
      matched_by: "email",
    } satisfies SpAccountLink;
  }

  const nameMatches = sps.filter((sp) => {
    const spName = normalizeName(sp.full_name || [sp.first_name, sp.last_name].filter(Boolean).join(" "));
    return Boolean(spName) && (scheduleNameCandidates.includes(spName) || fullNameCandidates.includes(spName));
  });

  if (nameMatches.length === 1) {
    const matchedSp = nameMatches[0];
    const spName = normalizeName(matchedSp.full_name || [matchedSp.first_name, matchedSp.last_name].filter(Boolean).join(" "));
    const matchedBy = scheduleNameCandidates.includes(spName) ? "schedule_name" : "full_name";
    return {
      status: "linked",
      sp_id: matchedSp.id,
      sp_name: getSpDisplayName(matchedSp),
      matched_by: matchedBy,
    } satisfies SpAccountLink;
  }

  return {
    status: "pending",
    sp_id: null,
    sp_name:
      asText(profile?.full_name || user.user_metadata?.full_name) ||
      asText(profile?.schedule_name || user.user_metadata?.schedule_name) ||
      null,
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
  if (
    sameLink(current, link) ||
    linkStrength(current) > linkStrength(link) ||
    !supabaseUrl ||
    !supabaseKey ||
    !accessToken
  ) {
    return "";
  }

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
