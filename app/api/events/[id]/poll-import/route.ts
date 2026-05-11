import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as XLSX from "xlsx";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../../../lib/authCookies";
import { getProfileForUser } from "../../../../lib/profileServer";
import { resolveSpAccountLink } from "../../../../lib/spAccountLinking";
import { createSupabaseServerClient } from "../../../../lib/supabaseServerClient";

export const dynamic = "force-dynamic";

type PollResponseStatus = "available" | "maybe" | "not_available" | "no_response";
type ImportedPollMatchType = "sp_id" | "email" | "name" | "unmatched";

type ImportedPollResponseRecord = {
  name: string;
  email: string;
  normalizedEmail: string;
  responseStatus: PollResponseStatus;
  responseLabel: string;
  responseSubmittedAt: string;
  responseNote: string;
  matchedSpId: string;
  matchedSpEmail: string;
  matchedSpName: string;
  matchType: ImportedPollMatchType;
  matchConfidence: number;
  rawAnswer: string;
};

type PollMetadata = {
  pollCreatedAt: string;
  pollSentAt: string;
  pollSelectedSpIds: string;
  pollSelectedSpEmails: string;
  pollStatus: string;
  excludedSpIds: string;
  excludedSpEmails: string;
  importedPollResponses: string;
  pollImportCreatedAt: string;
  pollImportSource: string;
};

type PollImportDebugInfo = {
  detectedHeaders: string[];
  matchedNameHeader: string;
  matchedEmailHeader: string;
  matchedSpIdHeader: string;
  matchedTrainingResponseHeader: string;
  matchedEventResponseHeader: string;
  matchedNotesHeader: string;
  matchedResponseHeaders: string[];
  sampleRows: Array<Record<string, string>>;
  parsedRowCount: number;
  failedRows: Array<{ rowNumber: number; reason: string; values: Record<string, string> }>;
};

type SpImportRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  schedule_name?: string | null;
  working_email: string | null;
  email: string | null;
};

type AssignmentImportRow = {
  id: string;
  sp_id: string | null;
  notes: string | null;
};

type ViewerContext = {
  id: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  role: string;
  fullName: string;
  scheduleName: string;
  linkedSpId: string;
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

const POLL_METADATA_START = "[CFSP_POLL_METADATA]";
const POLL_METADATA_END = "[/CFSP_POLL_METADATA]";
const POLL_METADATA_KEYS: Array<keyof PollMetadata> = [
  "pollCreatedAt",
  "pollSentAt",
  "pollSelectedSpIds",
  "pollSelectedSpEmails",
  "pollStatus",
  "excludedSpIds",
  "excludedSpEmails",
  "importedPollResponses",
  "pollImportCreatedAt",
  "pollImportSource",
];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

class PollImportValidationError extends Error {}

function getImportErrorStatus(error: unknown) {
  return error instanceof PollImportValidationError ? 400 : 500;
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sp" || role === "faculty" || role === "sim_op" || role === "admin" || role === "super_admin") {
    return role;
  }
  return "unknown";
}

function isOperatorRole(role: string) {
  return role === "sim_op" || role === "admin" || role === "super_admin";
}

function getEffectiveRole(email: unknown, role: unknown) {
  const normalizedEmail = asText(email).toLowerCase();
  const localPart = normalizedEmail.split("@")[0] || "";
  const normalizedRole = normalizeRole(role);

  if (normalizedEmail === "cwb55@drexel.edu" || normalizedEmail === "cory.brodsky@drexel.edu" || localPart === "cory.brodsky") {
    return ["super_admin", "admin", "sim_op"].includes(normalizedRole) ? normalizedRole : "super_admin";
  }

  return normalizedRole;
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function normalizeMatchName(value: unknown) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFullName(sp: SpImportRow) {
  return asText(sp.full_name) || [sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" ") || "Unnamed SP";
}

function getEmail(sp: SpImportRow) {
  return asText(sp.working_email) || asText(sp.email);
}

async function getAuthenticatedUser(): Promise<AuthenticatedUserResult> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value || "";
    const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value || "";

    if (!accessToken && !refreshToken) return { accessToken: "", refreshToken: "", user: null };

    const supabase = createSupabaseServerClient();

    if (accessToken) {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(accessToken);

      if (!error && user) return { accessToken, refreshToken, user };
    }

    if (!refreshToken) return { accessToken, refreshToken, user: null, shouldClearCookies: true };

    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    const refreshedAccessToken = asText(data.session?.access_token);
    const refreshedRefreshToken = asText(data.session?.refresh_token);
    const refreshedUser = data.user ?? data.session?.user ?? null;

    if (error || !refreshedUser || !refreshedAccessToken || !refreshedRefreshToken) {
      return { accessToken, refreshToken, user: null, shouldClearCookies: true };
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
    const spLink = await resolveSpAccountLink({
      user: auth.user,
      profile: profile || null,
      accessToken: auth.accessToken,
    });

    return {
      id: auth.user.id,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      email,
      role: getEffectiveRole(email, profile?.role || auth.user.user_metadata?.role),
      fullName: asText(profile?.full_name) || asText(auth.user.user_metadata?.full_name),
      scheduleName: asText(profile?.schedule_name) || asText(auth.user.user_metadata?.schedule_name),
      linkedSpId: asText(spLink.sp_id),
      refreshedTokens: auth.refreshedTokens,
      shouldClearCookies: auth.shouldClearCookies,
    };
  } catch {
    return null;
  }
}

function applyAuthCookies(response: NextResponse, viewer: ViewerContext | null) {
  if (!viewer) return response;
  if (viewer.refreshedTokens) setAuthCookies(response, viewer.refreshedTokens);
  return response;
}

function unauthorizedResponse(viewer?: ViewerContext | null) {
  const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (viewer?.shouldClearCookies) clearAuthCookies(response);
  return response;
}

function emptyPollMetadata(): PollMetadata {
  return {
    pollCreatedAt: "",
    pollSentAt: "",
    pollSelectedSpIds: "",
    pollSelectedSpEmails: "",
    pollStatus: "",
    excludedSpIds: "",
    excludedSpEmails: "",
    importedPollResponses: "",
    pollImportCreatedAt: "",
    pollImportSource: "",
  };
}

function getPollMetadataBlock(notes?: string | null) {
  const text = asText(notes);
  if (!text) return "";
  const startIndex = text.indexOf(POLL_METADATA_START);
  const endIndex = text.indexOf(POLL_METADATA_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return "";
  return text.slice(startIndex + POLL_METADATA_START.length, endIndex).trim();
}

function parsePollMetadata(notes?: string | null) {
  const metadata = emptyPollMetadata();
  const block = getPollMetadataBlock(notes);
  if (!block) return metadata;

  block.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (!match) return;
    const key = match[1] as keyof PollMetadata;
    if (!POLL_METADATA_KEYS.includes(key)) return;
    metadata[key] = match[2].trim();
  });

  return metadata;
}

function upsertPollMetadata(notes: string | null | undefined, partial: Partial<PollMetadata>) {
  const current = parsePollMetadata(notes);
  const next = {
    ...current,
    ...Object.fromEntries(Object.entries(partial).map(([key, value]) => [key, asText(value)])),
  } as PollMetadata;

  const lines = POLL_METADATA_KEYS.map((key) => (next[key] ? `${key}: ${next[key]}` : "")).filter(Boolean);
  const text = asText(notes);
  const withoutExisting = text
    .replace(new RegExp(`\\n?${POLL_METADATA_START}[\\s\\S]*?${POLL_METADATA_END}\\n?`, "g"), "\n")
    .trim();

  if (!lines.length) return withoutExisting;

  const block = [POLL_METADATA_START, ...lines, POLL_METADATA_END].join("\n");
  return withoutExisting ? `${block}\n${withoutExisting}` : block;
}

function encodeImportedPollResponses(entries: ImportedPollResponseRecord[]) {
  return encodeURIComponent(JSON.stringify(entries));
}

function normalizeImportedResponseText(value: string) {
  return asText(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[“”"']+|[“”"'.!?]+$/g, "")
    .toLowerCase();
}

function responseContainsNotAvailable(value: string) {
  const normalized = normalizeImportedResponseText(value);
  return /\b(no|not available|unavailable|unable|cannot|can not|can't|decline|declined)\b/.test(normalized);
}

function responseContainsMaybe(value: string) {
  return /\b(maybe|need to discuss|depends|unsure|not sure|possibly|can discuss|conditional)\b/.test(normalizeImportedResponseText(value));
}

function responseIsAvailable(value: string) {
  const normalized = normalizeImportedResponseText(value);
  return normalized === "available" || normalized === "yes" || /\b(i am available|i'm available|can do|works for me|attend|attending)\b/.test(normalized);
}

function notesContainConcernText(value: string) {
  const normalized = normalizeImportedResponseText(value);
  if (!normalized) return false;
  return /\b(concern|conflict|maybe|depends|unsure|not sure|question|issue|problem|limited|limitation|partial|only|prefer|late|early|cannot|can't|unable|need to discuss)\b/.test(normalized);
}

function classifyImportedAvailabilityResponse(value: string) {
  const normalized = normalizeImportedResponseText(value);
  if (!normalized) return { status: "no_response" as const, label: "No clear response" };

  if (
    /\b(not available|unavailable|cannot|can not|can't|decline|declined|no,? not available|not attending|unable)\b/.test(normalized) ||
    normalized === "no"
  ) {
    return { status: "not_available" as const, label: "Not Available" };
  }

  if (responseContainsMaybe(normalized)) return { status: "maybe" as const, label: "Maybe / Need to discuss" };
  if (responseIsAvailable(normalized)) return { status: "available" as const, label: "Available" };
  return { status: "no_response" as const, label: value || "No clear response" };
}

function classifyImportedPollResponsesByField({
  trainingResponse,
  eventResponse,
  fallbackResponse,
  notes,
}: {
  trainingResponse: string;
  eventResponse: string;
  fallbackResponse: string;
  notes: string;
}) {
  const training = normalizeImportedResponseText(trainingResponse);
  const event = normalizeImportedResponseText(eventResponse);
  const noteText = normalizeImportedResponseText(notes);

  if (responseContainsNotAvailable(training) || responseContainsNotAvailable(event)) {
    return { status: "not_available" as const, label: "Not Available" };
  }

  const trainingAvailable = responseIsAvailable(training);
  const eventAvailable = responseIsAvailable(event);
  const trainingMaybeOrMissing = !training || responseContainsMaybe(training);
  const eventMaybeOrMissing = !event || responseContainsMaybe(event);

  if (
    responseContainsMaybe(training) ||
    responseContainsMaybe(event) ||
    notesContainConcernText(noteText) ||
    (trainingAvailable && eventMaybeOrMissing) ||
    (eventAvailable && trainingMaybeOrMissing)
  ) {
    return { status: "maybe" as const, label: "Maybe / Need to discuss" };
  }

  if (trainingAvailable && eventAvailable) return { status: "available" as const, label: "Available" };

  const fallback = classifyImportedAvailabilityResponse(fallbackResponse);
  if (fallback.status !== "no_response") return fallback;

  return { status: "no_response" as const, label: "No clear response" };
}

function normalizeImportHeader(value: unknown) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getImportHeaderEntries(row: Record<string, unknown>) {
  return Object.entries(row).map(([key, value]) => ({
    key,
    normalizedKey: normalizeImportHeader(key),
    value: asText(value),
  }));
}

function getImportFieldValue(row: Record<string, unknown>, aliases: string[]) {
  const entries = getImportHeaderEntries(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeImportHeader(alias);
    const matched = entries.find((entry) => entry.normalizedKey === normalizedAlias);
    if (matched) return matched.value;
  }
  return "";
}

function getImportFieldValueFromHeader(row: Record<string, unknown>, header: string) {
  if (!header) return "";
  const matched = getImportHeaderEntries(row).find((entry) => entry.key === header);
  return matched?.value || "";
}

function rowToStringRecord(row: Record<string, unknown>) {
  const next: Record<string, string> = {};
  Object.entries(row).forEach(([key, value]) => {
    next[key] = asText(value);
  });
  return next;
}

function scoreIdentityHeader(header: string, type: "name" | "email" | "sp_id", sampleValues: string[] = []) {
  const normalized = normalizeImportHeader(header);
  if (!normalized || /^empty/.test(normalized)) return -1;

  if (type === "name") {
    if (/(^| )(start time|completion time|submit date|timestamp|duration|id|email)( |$)/.test(normalized)) return -1;
    if (/^(full name|enter your full name|responder full name|respondent full name|please enter your full name)$/.test(normalized)) return 150;
    if (/^(first and last name|first last name|sp name|standardized patient name)$/.test(normalized)) return 145;
    if (/^(name)$/.test(normalized)) return sampleValues.some((value) => Boolean(asText(value))) ? 90 : -1;
    if (/^(respondent name|responder name|display name)$/.test(normalized)) return 120;
    if (/(^| )full name( |$)/.test(normalized)) return 130;
    if (/(^| )name( |$)/.test(normalized)) return 85;
    return -1;
  }

  if (type === "email") {
    if (/^(enter your email address|please enter your email address|email address)$/.test(normalized)) return 150;
    if (/^(responder email|respondent email|email|e mail|user email)$/.test(normalized)) return 135;
    if (/(^| )email address( |$)/.test(normalized)) return 125;
    if (/(^| )(email|e mail)( |$)/.test(normalized)) return 90;
    return -1;
  }

  if (/^(sp id|spid|directory id|linked sp id|participant id|respondent id)$/.test(normalized)) return 110;
  if (/(^| )(sp id|directory id|participant id)( |$)/.test(normalized)) return 80;
  return -1;
}

function scoreResponseHeader(header: string, sampleValues: string[]) {
  const normalized = normalizeImportHeader(header);
  if (!normalized || /^empty/.test(normalized)) return -1;
  if (
    /(^| )(start time|completion time|timestamp|email|name|respondent|responder|comments? only)( |$)/.test(normalized) &&
    !/available|can you work|are you available|availability/.test(normalized)
  ) {
    return -1;
  }

  let score = 0;
  if (/availability|are you available|can you work|can you attend|can you do|event|training|interested|interest/.test(normalized)) score += 24;
  if (/yes no maybe|available|not available|maybe/.test(normalized)) score += 26;

  const classifiedMatches = sampleValues.reduce((total, value) => {
    const status = classifyImportedAvailabilityResponse(value).status;
    return total + (status !== "no_response" ? 1 : 0);
  }, 0);
  score += classifiedMatches * 10;

  return score > 0 ? score : -1;
}

function scorePollAvailabilityHeader(header: string, type: "training" | "event", sampleValues: string[] = []) {
  const normalized = normalizeImportHeader(header);
  if (!normalized || /^empty/.test(normalized)) return -1;
  if (/(^| )(start time|completion time|timestamp|email|name|respondent|responder|comments?|notes?|questions?)( |$)/.test(normalized)) {
    return -1;
  }

  let score = 0;
  if (new RegExp(`(^| )${type}( |$)`).test(normalized)) score += 60;
  if (/availability|available|not available|maybe|can you attend|can you work|can you do|interested|interest/.test(normalized)) score += 25;
  score += sampleValues.filter((value) => classifyImportedAvailabilityResponse(value).status !== "no_response").length * 3;
  return score > 0 ? score : -1;
}

function scorePollNotesHeader(header: string) {
  const normalized = normalizeImportHeader(header);
  if (!normalized || /^empty/.test(normalized)) return -1;
  if (/(^| )(email|name|respondent|responder|start time|completion time|timestamp)( |$)/.test(normalized)) return -1;
  if (/^do you have any questions concerns$/.test(normalized)) return 160;
  if (/^do you have any questions or concerns$/.test(normalized)) return 155;
  if (/(^| )questions concerns( |$)/.test(normalized)) return 145;
  if (/^(notes|comments|comment|questions|additional notes|anything else)$/.test(normalized)) return 100;
  if (/(^| )(notes?|comments?|questions?|anything else)( |$)/.test(normalized)) return 80;
  return -1;
}

function scoreTimestampHeader(header: string) {
  const normalized = normalizeImportHeader(header);
  if (/^(completion time|completed at|submitted at|submission time|timestamp|response submitted at)$/.test(normalized)) return 120;
  if (/^(start time|started at)$/.test(normalized)) return 60;
  if (/(^| )(completion|submitted|submission|timestamp|completed)( |$)/.test(normalized)) return 90;
  return -1;
}

function detectPollImportHeaders(rows: Array<Record<string, unknown>>): PollImportDebugInfo & { matchedTimestampHeader: string } {
  const detectedHeaders = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row).map(asText).filter((key) => key && !/^__EMPTY/i.test(key))))
  );

  const sampleRows = rows.slice(0, 3).map(rowToStringRecord);
  const sampleValuesForHeader = (header: string) => rows.slice(0, 20).map((row) => getImportFieldValueFromHeader(row, header));
  const byScore = (type: "name" | "email" | "sp_id") =>
    detectedHeaders
      .map((header) => ({ header, score: scoreIdentityHeader(header, type, sampleValuesForHeader(header)) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score);

  const nameCandidates = byScore("name");
  const emailCandidates = byScore("email");
  const spIdCandidates = byScore("sp_id");
  const responseCandidates = detectedHeaders
    .map((header) => ({ header, score: scoreResponseHeader(header, sampleValuesForHeader(header)) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const trainingResponseCandidates = detectedHeaders
    .map((header) => ({ header, score: scorePollAvailabilityHeader(header, "training", sampleValuesForHeader(header)) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const eventResponseCandidates = detectedHeaders
    .map((header) => ({ header, score: scorePollAvailabilityHeader(header, "event", sampleValuesForHeader(header)) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const notesCandidates = detectedHeaders
    .map((header) => ({ header, score: scorePollNotesHeader(header) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const timestampCandidates = detectedHeaders
    .map((header) => ({ header, score: scoreTimestampHeader(header) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const trainingHeader = trainingResponseCandidates[0]?.header || "";
  const eventHeader = eventResponseCandidates.find((entry) => entry.header !== trainingHeader)?.header || "";

  return {
    detectedHeaders,
    matchedNameHeader: nameCandidates[0]?.header || "",
    matchedEmailHeader: emailCandidates[0]?.header || "",
    matchedSpIdHeader: spIdCandidates[0]?.header || "",
    matchedTrainingResponseHeader: trainingHeader,
    matchedEventResponseHeader: eventHeader,
    matchedNotesHeader: notesCandidates[0]?.header || "",
    matchedResponseHeaders: responseCandidates.slice(0, 4).map((entry) => entry.header),
    matchedTimestampHeader: timestampCandidates[0]?.header || "",
    sampleRows,
    parsedRowCount: rows.length,
    failedRows: [],
  };
}

function fillMergedCells(sheet: XLSX.WorkSheet) {
  const merges = sheet["!merges"] || [];
  merges.forEach((merge) => {
    const source = sheet[XLSX.utils.encode_cell(merge.s)];
    if (!source) return;
    for (let row = merge.s.r; row <= merge.e.r; row += 1) {
      for (let column = merge.s.c; column <= merge.e.c; column += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        if (!sheet[address]) sheet[address] = { ...source };
      }
    }
  });
}

function normalizeParsedRows(rows: Array<Record<string, unknown>>) {
  return rows.filter((row) => Object.values(row).some((value) => asText(value)));
}

async function parsePollFile(file: File) {
  const fileName = asText(file.name);
  const lowerName = fileName.toLowerCase();
  const fileType = asText(file.type).toLowerCase();
  const isCsv = lowerName.endsWith(".csv") || fileType.includes("csv") || fileType.includes("text/plain");
  const isExcel =
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    fileType.includes("spreadsheet") ||
    fileType.includes("excel");

  if (!isCsv && !isExcel) {
    throw new PollImportValidationError("Unsupported file format. Upload a CSV, XLSX, or XLS poll export.");
  }

  if (file.size <= 0) throw new PollImportValidationError("That file is empty. Upload a poll export with responder rows.");

  const buffer = await file.arrayBuffer();
  if (!buffer.byteLength) throw new PollImportValidationError("That file is empty. Upload a poll export with responder rows.");

  const workbook = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string", cellDates: true })
    : XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetResults = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { sheetName, rows: [] as Array<Record<string, unknown>> };
    fillMergedCells(sheet);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
      blankrows: false,
    });
    return { sheetName, rows: normalizeParsedRows(rows) };
  }).filter((entry) => entry.rows.length);

  const selected = sheetResults.sort((a, b) => b.rows.length - a.rows.length)[0];
  if (!selected) throw new PollImportValidationError("No responder rows were found. Check that the poll export has a header row and response data.");

  return selected;
}

function buildSpIndexes(sps: SpImportRow[]) {
  const byId = new Map<string, SpImportRow>();
  const byEmail = new Map<string, SpImportRow>();
  const byName = new Map<string, SpImportRow>();

  sps.forEach((sp) => {
    byId.set(String(sp.id), sp);
    [sp.working_email, sp.email].map(normalizeEmail).filter(Boolean).forEach((email) => {
      if (!byEmail.has(email)) byEmail.set(email, sp);
    });
    [sp.full_name, [sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" "), sp.schedule_name]
      .map(normalizeMatchName)
      .filter(Boolean)
      .forEach((name) => {
        if (!byName.has(name)) byName.set(name, sp);
      });
  });

  return { byId, byEmail, byName };
}

function getRowIdentity(row: Record<string, unknown>, debugInfo: ReturnType<typeof detectPollImportHeaders>) {
  const firstName = getImportFieldValue(row, ["First Name", "First"]);
  const lastName = getImportFieldValue(row, ["Last Name", "Last", "Surname"]);
  const name =
    getImportFieldValueFromHeader(row, debugInfo.matchedNameHeader) ||
    getImportFieldValue(row, [
      "Name",
      "Full Name",
      "First and Last Name",
      "SP Name",
      "Standardized Patient Name",
      "Responder",
      "Respondent",
      "Respondent Name",
      "Responder Name",
      "Please enter your full name",
    ]) ||
    [firstName, lastName].map(asText).filter(Boolean).join(" ");
  const email =
    getImportFieldValueFromHeader(row, debugInfo.matchedEmailHeader) ||
    getImportFieldValue(row, ["Email", "Email Address", "Respondent Email", "Responder Email", "Please enter your email address"]);
  const linkedSpId =
    getImportFieldValueFromHeader(row, debugInfo.matchedSpIdHeader) ||
    getImportFieldValue(row, ["SP ID", "Directory ID", "Linked SP ID", "Participant ID"]);

  return { name, email, linkedSpId };
}

function parseRowsToResponses({
  rows,
  debugInfo,
  sps,
}: {
  rows: Array<Record<string, unknown>>;
  debugInfo: ReturnType<typeof detectPollImportHeaders>;
  sps: SpImportRow[];
}) {
  const spIndexes = buildSpIndexes(sps);
  const failedRows: PollImportDebugInfo["failedRows"] = [];

  const rawParsedResponses = rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const { name, email, linkedSpId } = getRowIdentity(row, debugInfo);
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeMatchName(name);
    const notes =
      getImportFieldValueFromHeader(row, debugInfo.matchedNotesHeader) ||
      getImportFieldValue(row, [
        "Do you have any questions/concerns?",
        "Do you have any questions or concerns?",
        "Questions/Concerns",
        "Questions or concerns",
        "Notes",
        "Comments",
        "Comment",
        "Questions",
        "Additional Notes",
        "Anything else",
      ]);
    const timestamp =
      getImportFieldValueFromHeader(row, debugInfo.matchedTimestampHeader) ||
      getImportFieldValue(row, ["Completion time", "Completed At", "Start time", "Timestamp", "Submitted At", "Submission Time"]);
    const trainingResponse =
      getImportFieldValueFromHeader(row, debugInfo.matchedTrainingResponseHeader) ||
      getImportFieldValue(row, ["Training", "Training Availability", "Training Response"]);
    const eventResponse =
      getImportFieldValueFromHeader(row, debugInfo.matchedEventResponseHeader) ||
      getImportFieldValue(row, ["Event", "Event Availability", "Event Response"]);
    const detectedResponseText = debugInfo.matchedResponseHeaders
      .map((header) => getImportFieldValueFromHeader(row, header))
      .filter(Boolean)
      .join(" | ");
    const fallbackAnswer =
      detectedResponseText ||
      getImportFieldValue(row, [
        "Availability",
        "Available",
        "Are you available",
        "Can you work",
        "Can you attend",
        "Response",
        "Answer",
        "Status",
        "Interest",
        "Interested",
      ]);
    const classified = classifyImportedPollResponsesByField({
      trainingResponse,
      eventResponse,
      fallbackResponse: fallbackAnswer,
      notes,
    });
    const linkedSp = linkedSpId && spIndexes.byId.has(String(linkedSpId)) ? spIndexes.byId.get(String(linkedSpId)) : undefined;
    const emailMatch = !linkedSp && normalizedEmail ? spIndexes.byEmail.get(normalizedEmail) : undefined;
    const nameMatch = !linkedSp && !emailMatch && normalizedName ? spIndexes.byName.get(normalizedName) : undefined;
    const matchedSp = linkedSp || emailMatch || nameMatch;

    if (!name && !email && !linkedSpId && classified.status === "no_response" && !fallbackAnswer && !notes) return [];

    if (!name && !email && !linkedSpId) {
      failedRows.push({ rowNumber, reason: "Missing SP name or email.", values: rowToStringRecord(row) });
      return [];
    }

    const matchedSpId = matchedSp ? String(matchedSp.id) : "";

    return [
      {
        name,
        email,
        normalizedEmail,
        responseStatus: classified.status,
        responseLabel: classified.label,
        responseSubmittedAt: timestamp,
        responseNote: notes,
        matchedSpId,
        matchedSpEmail: matchedSp ? getEmail(matchedSp) : "",
        matchedSpName: matchedSp ? getFullName(matchedSp) : "",
        matchType: matchedSp ? (linkedSp ? "sp_id" : emailMatch ? "email" : "name") : "unmatched",
        matchConfidence: matchedSp ? (linkedSp ? 100 : emailMatch ? 100 : 70) : 0,
        rawAnswer: fallbackAnswer || [trainingResponse, eventResponse].filter(Boolean).join(" | "),
      } satisfies ImportedPollResponseRecord,
    ];
  });

  const parsedResponses = Array.from(
    new Map(
      rawParsedResponses
        .sort((a, b) => Date.parse(a.responseSubmittedAt || "") - Date.parse(b.responseSubmittedAt || ""))
        .map((entry, index) => [
          entry.matchedSpId || entry.normalizedEmail || normalizeMatchName(entry.name) || entry.rawAnswer || `row-${index}`,
          entry,
        ])
    ).values()
  );

  return { parsedResponses, failedRows };
}

function formatImportedPollAssignmentNote(note: string) {
  const cleaned = asText(note);
  return cleaned ? `Poll note: ${cleaned}` : "";
}

function normalizeAssignmentNoteForCompare(value: string) {
  return asText(value).toLowerCase().replace(/\s+/g, " ");
}

function mergeImportedPollNoteIntoAssignmentNotes(existingNotes: string | null | undefined, importedNote: string | null | undefined) {
  const formattedPollNote = formatImportedPollAssignmentNote(asText(importedNote));
  const currentNotes = asText(existingNotes);
  if (!formattedPollNote) return currentNotes;
  if (!currentNotes) return formattedPollNote;

  const normalizedCurrent = normalizeAssignmentNoteForCompare(currentNotes);
  const normalizedRawNote = normalizeAssignmentNoteForCompare(importedNote || "");
  const normalizedFormattedNote = normalizeAssignmentNoteForCompare(formattedPollNote);
  if (
    normalizedCurrent.includes(normalizedFormattedNote) ||
    (normalizedRawNote && normalizedCurrent.includes(normalizedRawNote))
  ) {
    return currentNotes;
  }

  return `${currentNotes}\n\n${formattedPollNote}`;
}

function summarizeResponses(entries: ImportedPollResponseRecord[], failedRows: PollImportDebugInfo["failedRows"], assignmentNotesUpdated: number) {
  const availableCount = entries.filter((entry) => entry.responseStatus === "available").length;
  const maybeCount = entries.filter((entry) => entry.responseStatus === "maybe").length;
  const notAvailableCount = entries.filter((entry) => entry.responseStatus === "not_available").length;
  const noResponseCount = entries.filter((entry) => entry.responseStatus === "no_response").length;
  const matchedCount = entries.filter((entry) => entry.matchedSpId).length;

  return {
    parsedResponses: entries.length,
    matchedCount,
    unmatchedCount: entries.length - matchedCount,
    failedRows: failedRows.length,
    availableCount,
    maybeCount,
    notAvailableCount,
    noResponseCount,
    assignmentNotesUpdated,
  };
}

export async function POST(request: Request, context: { params: Promise<{ id?: string | string[] }> }) {
  let viewer: ViewerContext | null = null;

  try {
    viewer = await getAuthenticatedViewer();
    if (!viewer) return unauthorizedResponse();
    if (!isOperatorRole(viewer.role)) {
      return applyAuthCookies(
        NextResponse.json({ error: "Only Sim Ops or admin accounts can import poll results." }, { status: 403 }),
        viewer
      );
    }

    const params = await context.params;
    const eventId = getRouteId(params);
    if (!eventId) {
      return applyAuthCookies(NextResponse.json({ error: "Missing event id." }, { status: 400 }), viewer);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return applyAuthCookies(
        NextResponse.json({ error: "Upload request must be multipart/form-data." }, { status: 400 }),
        viewer
      );
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return applyAuthCookies(NextResponse.json({ error: "Upload a CSV, XLSX, or XLS poll results file." }, { status: 400 }), viewer);
    }

    console.info("CFSP poll import upload start", {
      eventId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      viewerRole: viewer.role,
    });

    const supabaseServer = createSupabaseServerClient();
    const [{ data: event, error: eventError }, { data: sps, error: spsError }, { data: assignments, error: assignmentsError }] =
      await Promise.all([
        supabaseServer.from("events").select("id,notes").eq("id", eventId).maybeSingle(),
        supabaseServer
          .from("sps")
          .select("id,first_name,last_name,full_name,schedule_name,working_email,email")
          .limit(5000),
        supabaseServer.from("event_sps").select("id,sp_id,notes").eq("event_id", eventId),
      ]);

    if (eventError) throw new Error(eventError.message || "Could not load event.");
    if (!event) throw new Error("Event not found.");
    if (spsError) throw new Error(spsError.message || "Could not load SP roster.");
    if (assignmentsError) throw new Error(assignmentsError.message || "Could not load event assignments.");

    const parsedFile = await parsePollFile(file);
    console.info("CFSP poll import parsed rows", {
      eventId,
      sheetName: parsedFile.sheetName,
      parsedRows: parsedFile.rows.length,
    });

    const detected = detectPollImportHeaders(parsedFile.rows);
    console.info("CFSP poll import detected columns", {
      eventId,
      detectedHeaders: detected.detectedHeaders,
      matchedNameHeader: detected.matchedNameHeader,
      matchedEmailHeader: detected.matchedEmailHeader,
      matchedSpIdHeader: detected.matchedSpIdHeader,
      matchedTrainingResponseHeader: detected.matchedTrainingResponseHeader,
      matchedEventResponseHeader: detected.matchedEventResponseHeader,
      matchedResponseHeaders: detected.matchedResponseHeaders,
    });

    const { parsedResponses, failedRows } = parseRowsToResponses({
      rows: parsedFile.rows,
      debugInfo: detected,
      sps: (sps || []) as SpImportRow[],
    });

    const debugInfo: PollImportDebugInfo = {
      ...detected,
      failedRows,
    };

    if (!parsedResponses.length) {
      return applyAuthCookies(
        NextResponse.json(
          {
            error: failedRows.length
              ? "No usable poll responses were found. Check that the export includes SP names or emails."
              : "No responder rows were found in that poll export.",
            debug: debugInfo,
          },
          { status: 400 }
        ),
        viewer
      );
    }

    const assignmentsBySpId = new Map(
      ((assignments || []) as AssignmentImportRow[])
        .filter((assignment) => asText(assignment.sp_id))
        .map((assignment) => [String(assignment.sp_id), assignment])
    );
    const noteUpdates = parsedResponses
      .map((entry) => {
        const assignment = entry.matchedSpId ? assignmentsBySpId.get(String(entry.matchedSpId)) : null;
        const nextNotes = assignment ? mergeImportedPollNoteIntoAssignmentNotes(assignment.notes, entry.responseNote) : "";
        return assignment && asText(entry.responseNote) && nextNotes !== asText(assignment.notes)
          ? { assignment, nextNotes }
          : null;
      })
      .filter((entry): entry is { assignment: AssignmentImportRow; nextNotes: string } => Boolean(entry));

    for (const update of noteUpdates) {
      const { error } = await supabaseServer
        .from("event_sps")
        .update({ notes: update.nextNotes || null })
        .eq("id", update.assignment.id);
      if (error) throw new Error(error.message || "Could not save imported poll note.");
    }

    const nextNotes = upsertPollMetadata(event.notes, {
      importedPollResponses: encodeImportedPollResponses(parsedResponses),
      pollImportCreatedAt: new Date().toISOString(),
      pollImportSource: file.name || parsedFile.sheetName || "Poll results upload",
    });
    const { error: updateEventError } = await supabaseServer.from("events").update({ notes: nextNotes }).eq("id", eventId);
    if (updateEventError) throw new Error(updateEventError.message || "Could not save imported poll results.");

    console.info("CFSP poll import DB writes", {
      eventId,
      importedResponses: parsedResponses.length,
      eventMetadataUpdated: true,
      assignmentNotesUpdated: noteUpdates.length,
    });

    const summary = summarizeResponses(parsedResponses, failedRows, noteUpdates.length);
    console.info("CFSP poll import final response", { eventId, summary });

    return applyAuthCookies(
      NextResponse.json({
        ok: true,
        message: `Imported ${parsedResponses.length} poll response${parsedResponses.length === 1 ? "" : "s"}.`,
        importedPollResponses: parsedResponses,
        eventNotes: nextNotes,
        debug: debugInfo,
        summary,
      }),
      viewer
    );
  } catch (error) {
    console.error("CFSP poll import failed", { error: getErrorMessage(error) });
    return applyAuthCookies(
      NextResponse.json(
        { error: getErrorMessage(error) || "Could not import poll results." },
        { status: getImportErrorStatus(error) }
      ),
      viewer
    );
  }
}
