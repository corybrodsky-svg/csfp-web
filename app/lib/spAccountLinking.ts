import type { User } from "@supabase/supabase-js";
import type { AppProfile } from "./profileServer";
import { supabaseKey, supabaseUrl } from "./supabaseServerClient";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

type MinimalSpRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  working_email?: string | null;
  email?: string | null;
  secondary_email?: string | null;
};

export type SpLinkStatus = "linked" | "pending";
export type SpLinkMatchSource = "saved_link" | "working_email" | "email" | "schedule_name" | "full_name" | "none";

export type SpLinkCandidate = {
  sp_id: string;
  sp_name: string;
  matched_by: SpLinkMatchSource;
  matched_fields: string[];
};

export type SpLinkDiagnostics = {
  checkedFields: string[];
  candidateCount: number;
  candidates?: SpLinkCandidate[];
  explicitSpId?: string | null;
  userEmail?: string | null;
  fullName?: string | null;
  scheduleMatchName?: string | null;
};

export type SpAccountLink = {
  status: SpLinkStatus;
  sp_id: string | null;
  sp_name: string | null;
  matched_by: SpLinkMatchSource;
  diagnostics?: SpLinkDiagnostics;
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

function getSpComparableName(sp: MinimalSpRow) {
  return normalizeName(asText(sp.full_name) || [asText(sp.first_name), asText(sp.last_name)].filter(Boolean).join(" "));
}

function uniqueSortedStringList(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean).map((value) => asText(value).toLowerCase()).filter(Boolean))).sort();
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

function strongestMatchSource(sources: Set<SpLinkMatchSource>) {
  const rank: Array<SpLinkMatchSource> = ["full_name", "schedule_name", "email", "working_email", "saved_link"];
  return rank
    .slice()
    .reverse()
    .find((source) => sources.has(source)) || "none";
}

async function listSps(accessToken?: string, organizationId?: string | null) {
  if (!supabaseUrl || (!supabaseKey && !serviceRoleKey)) return [] as MinimalSpRow[];
  const authToken = asText(serviceRoleKey) || asText(accessToken) || asText(supabaseKey);
  const baseUrl = `${supabaseUrl}/rest/v1/sps?select=id,first_name,last_name,full_name,working_email,email,secondary_email`;
  const scopedUrl = organizationId ? `${baseUrl}&organization_id=eq.${encodeURIComponent(asText(organizationId))}` : baseUrl;

  const fetchRows = async (url: string) => {
    const headers: Record<string, string> = {
      apikey: asText(serviceRoleKey || supabaseKey),
      Authorization: `Bearer ${authToken}`,
    };
    const response = await fetch(url, {
      headers,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => [])) as MinimalSpRow[];
    return Array.isArray(body) ? body : [];
  };

  const scopedRows = await fetchRows(scopedUrl);
  if (scopedRows) return scopedRows;
  if (!organizationId) return [] as MinimalSpRow[];
  const unscopedRows = await fetchRows(baseUrl);
  return unscopedRows || [];
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

function addMatchCandidate(
  candidates: Map<string, { sp: MinimalSpRow; matchedFields: Set<string>; sources: Set<SpLinkMatchSource> }>,
  sp: MinimalSpRow,
  field: string,
  source: SpLinkMatchSource
) {
  const spId = asText(sp.id);
  if (!spId) return;

  const current = candidates.get(spId);
  if (current) {
    current.matchedFields.add(field);
    current.sources.add(source);
    return;
  }

  candidates.set(spId, {
    sp,
    matchedFields: new Set([field]),
    sources: new Set([source]),
  });
}

export async function resolveSpAccountLink(args: {
  user: User;
  profile?: AppProfile | null;
  accessToken?: string;
  organizationId?: string | null;
  membershipSpId?: string | null;
  additionalEmails?: string[];
}) {
  const { user, profile, accessToken, organizationId, membershipSpId } = args;
  const profileSpId = asText((profile as { sp_id?: unknown } | null)?.sp_id);
  const existing = getSpLinkFromMetadata(user.user_metadata, profile?.full_name);
  const requestedExplicitSpId = asText(membershipSpId) || profileSpId || existing.sp_id || null;
  const sps = await listSps(accessToken, organizationId);

  const emailCandidates = uniqueSortedStringList([
    asText(profile?.email),
    asText(user.email),
    asText(user.user_metadata?.email),
    asText(user.user_metadata?.working_email),
    asText(user.user_metadata?.user_email),
    ...((args.additionalEmails || []).map((email) => asText(email))),
  ]);

  const scheduleNameCandidates = uniqueSortedStringList([
    asText(profile?.schedule_name),
    asText((profile as { schedule_match_name?: unknown } | null)?.schedule_match_name),
    asText(user.user_metadata?.schedule_name),
    asText(user.user_metadata?.schedule_match_name),
  ]);

  const fullNameCandidates = uniqueSortedStringList([
    asText(profile?.full_name),
    asText(user.user_metadata?.full_name),
  ]);

  const checkedFields: string[] = [
    "explicit_sp_id",
    "membership_sp_id",
    "profile_sp_id",
    "metadata_sp_id",
    "metadata_linked_sp_id",
    "metadata_sp_link_sp_id",
  ];

  if (requestedExplicitSpId) {
    checkedFields.push("existing_sp_id", "saved_link_validation");
    const explicitMatch = sps.find((sp) => asText(sp.id) === requestedExplicitSpId);
    if (explicitMatch) {
      return {
        status: "linked",
        sp_id: explicitMatch.id,
        sp_name: getSpDisplayName(explicitMatch),
        matched_by: "saved_link",
        diagnostics: {
          checkedFields,
          candidateCount: 1,
          candidates: [
            {
              sp_id: explicitMatch.id,
              sp_name: getSpDisplayName(explicitMatch),
              matched_by: "saved_link",
              matched_fields: ["explicit_sp_id"],
            },
          ],
          explicitSpId: requestedExplicitSpId,
          userEmail: asText(user.email) || null,
          fullName:
            asText(profile?.full_name) || asText(user.user_metadata?.full_name) || null,
          scheduleMatchName:
            asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name) || asText(user.user_metadata?.schedule_match_name) || null,
        },
      } satisfies SpAccountLink;
    }

    return {
      status: "pending",
      sp_id: requestedExplicitSpId,
      sp_name:
        asText(existing.sp_name) ||
        asText(profile?.full_name || user.user_metadata?.full_name) ||
        asText(user.user_metadata?.schedule_name) ||
        null,
      matched_by: "saved_link",
      diagnostics: {
        checkedFields,
        candidateCount: 0,
        explicitSpId: requestedExplicitSpId,
        userEmail: asText(user.email) || null,
        fullName: asText(profile?.full_name) || asText(user.user_metadata?.full_name) || null,
        scheduleMatchName:
          asText(profile?.schedule_name) ||
          asText(user.user_metadata?.schedule_name) ||
          asText(user.user_metadata?.schedule_match_name) ||
          null,
      },
    } satisfies SpAccountLink;
  }

  const emailCandidatesChecked = emailCandidates.length > 0;
  if (emailCandidatesChecked) checkedFields.push("working_email", "email", "secondary_email");

  const emailMatches = new Map<string, { sp: MinimalSpRow; matchedFields: Set<string>; sources: Set<SpLinkMatchSource> }>();
  for (const sp of sps) {
    const spEmailCandidates = uniqueSortedStringList([sp.working_email, sp.email, sp.secondary_email]);
    if (!spEmailCandidates.length) continue;

    const workingEmailMatch = spEmailCandidates.includes(normalizeEmail(sp.working_email))
      && sp.working_email
      && emailCandidates.includes(normalizeEmail(sp.working_email));
    const regularEmailMatch = spEmailCandidates.some((value) => value && value !== normalizeEmail(sp.working_email) && emailCandidates.includes(value));
    if (!workingEmailMatch && !regularEmailMatch) continue;

    const matchedSource: SpLinkMatchSource = workingEmailMatch ? "working_email" : "email";
    addMatchCandidate(emailMatches, sp, workingEmailMatch ? "working_email" : "email", matchedSource);
    if (workingEmailMatch && emailCandidates.includes(normalizeEmail(sp.email))) {
      addMatchCandidate(emailMatches, sp, "email", "email");
    }
  }

  const emailCandidatesList = Array.from(emailMatches.entries()).map(([spId, value]) => ({
    sp_id: spId,
    sp_name: getSpDisplayName(value.sp),
    matched_by: strongestMatchSource(value.sources),
    matched_fields: Array.from(value.matchedFields),
  }));

  if (emailCandidatesList.length === 1) {
    const first = emailCandidatesList[0];
    return {
      status: "linked",
      sp_id: first.sp_id,
      sp_name: first.sp_name,
      matched_by: first.matched_by,
      diagnostics: {
        checkedFields,
        candidateCount: 1,
        candidates: emailCandidatesList,
        userEmail: asText(user.email) || null,
        fullName:
          asText(profile?.full_name) || asText(user.user_metadata?.full_name) || null,
        scheduleMatchName:
          asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name) || asText(user.user_metadata?.schedule_match_name) || null,
      },
    } satisfies SpAccountLink;
  }

  if (emailCandidatesList.length > 1) {
    const diagnostics: SpLinkDiagnostics = {
      checkedFields,
      candidateCount: emailCandidatesList.length,
      candidates: emailCandidatesList,
      userEmail: asText(user.email) || null,
      fullName:
        asText(profile?.full_name) || asText(user.user_metadata?.full_name) || null,
      scheduleMatchName:
        asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name) || asText(user.user_metadata?.schedule_match_name) || null,
    };

    return {
      status: "pending",
      sp_id: null,
      sp_name:
        asText(profile?.full_name || user.user_metadata?.full_name) ||
        asText(profile?.schedule_name || user.user_metadata?.schedule_name) ||
        null,
      matched_by: "none",
      diagnostics,
    } satisfies SpAccountLink;
  }

  const nameCandidates = new Map<string, { sp: MinimalSpRow; matchedFields: Set<string>; sources: Set<SpLinkMatchSource> }>();
  const checkedNameFields = [
    scheduleNameCandidates.length ? "schedule_name" : null,
    fullNameCandidates.length ? "full_name" : null,
  ].filter(Boolean) as string[];
  if (checkedNameFields.length) checkedFields.push(...checkedNameFields);

  for (const sp of sps) {
    const spName = getSpComparableName(sp);
    if (!spName) continue;

    const matchesScheduleName = spName && scheduleNameCandidates.includes(spName);
    const matchesFullName = spName && fullNameCandidates.includes(spName);
    if (!matchesScheduleName && !matchesFullName) continue;

    if (matchesScheduleName) addMatchCandidate(nameCandidates, sp, "schedule_name", "schedule_name");
    if (matchesFullName) addMatchCandidate(nameCandidates, sp, "full_name", "full_name");
  }

  const nameCandidatesList = Array.from(nameCandidates.entries()).map(([spId, value]) => ({
    sp_id: spId,
    sp_name: getSpDisplayName(value.sp),
    matched_by: strongestMatchSource(value.sources),
    matched_fields: Array.from(value.matchedFields),
  }));

  if (nameCandidatesList.length === 1) {
    const first = nameCandidatesList[0];
    return {
      status: "linked",
      sp_id: first.sp_id,
      sp_name: first.sp_name,
      matched_by: first.matched_by,
      diagnostics: {
        checkedFields,
        candidateCount: 1,
        candidates: nameCandidatesList,
        userEmail: asText(user.email) || null,
        fullName:
          asText(profile?.full_name) || asText(user.user_metadata?.full_name) || null,
        scheduleMatchName:
          asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name) || asText(user.user_metadata?.schedule_match_name) || null,
      },
    } satisfies SpAccountLink;
  }

  if (nameCandidatesList.length > 1) {
    const checked = checkedFields.includes("full_name") ? checkedFields : [...checkedFields, "full_name"];
    return {
      status: "pending",
      sp_id: null,
      sp_name:
        asText(profile?.full_name || user.user_metadata?.full_name) ||
        asText(profile?.schedule_name || user.user_metadata?.schedule_name) ||
        null,
      matched_by: "none",
      diagnostics: {
        checkedFields: checked,
        candidateCount: nameCandidatesList.length,
        candidates: nameCandidatesList,
        userEmail: asText(user.email) || null,
        fullName:
          asText(profile?.full_name) || asText(user.user_metadata?.full_name) || null,
        scheduleMatchName:
          asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name) || asText(user.user_metadata?.schedule_match_name) || null,
      },
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
    diagnostics: {
      checkedFields,
      candidateCount: 0,
      userEmail: asText(user.email) || null,
      fullName:
        asText(profile?.full_name) || asText(user.user_metadata?.full_name) || null,
      scheduleMatchName:
        asText(profile?.schedule_name) || asText(user.user_metadata?.schedule_name) || asText(user.user_metadata?.schedule_match_name) || null,
    },
  } satisfies SpAccountLink;
}

export async function persistSpAccountLink(args: {
  user: User;
  link: SpAccountLink;
  accessToken?: string;
}) {
  const { user, link, accessToken } = args;
  const apiKey = serviceRoleKey || supabaseKey;
  const current = getSpLinkFromMetadata(user.user_metadata, null);
  if (
    sameLink(current, link) ||
    linkStrength(current) > linkStrength(link) ||
    !supabaseUrl ||
    !apiKey ||
    !accessToken
  ) {
    return "";
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          ...user.user_metadata,
          sp_id: link.sp_id,
          linked_sp_id: link.sp_id,
          sp_link_sp_id: link.sp_id,
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
