import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  applyOrganizationAuthCookies,
  createSupabaseUserClient,
  forbiddenJson,
  getOrganizationContext,
  noActiveOrganizationJson,
  requireActiveOrganization,
  roleCanOperateOrganization,
  type OrganizationContext,
  unauthorizedJson,
} from "../../../../lib/organizationAuth";
import { createSupabaseAdminClient } from "../../../../lib/supabaseAdminClient";

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
  responseCompletedAt: string;
  responseStartedAt: string;
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
  hireConfirmationCandidateSpIds: string;
  hireConfirmationCandidateEmails: string;
  hireConfirmationSelectionUpdatedAt: string;
};

type PollImportDebugInfo = {
  detectedHeaders: string[];
  matchedNameHeader: string;
  matchedEmailHeader: string;
  matchedSpIdHeader: string;
  matchedTrainingResponseHeader: string;
  matchedEventResponseHeader: string;
  matchedNotesHeader: string;
  matchedCompletionTimeHeader: string;
  matchedStartTimeHeader: string;
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
  working_email?: string | null;
  email: string | null;
};

type AssignmentImportRow = {
  id: string;
  sp_id: string | null;
  notes: string | null;
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
  "hireConfirmationCandidateSpIds",
  "hireConfirmationCandidateEmails",
  "hireConfirmationSelectionUpdatedAt",
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

type SupabaseErrorLike = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

function toSupabaseError(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== "object") return {};
  const source = error as SupabaseErrorLike;
  return {
    message: source.message || null,
    code: source.code || null,
    details: source.details || null,
    hint: source.hint || null,
  };
}

function isMissingColumnError(error: unknown, columnName: string) {
  const source = toSupabaseError(error);
  const code = asText(source.code).toLowerCase();
  const text = [source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  const target = columnName.toLowerCase();
  return code === "42703" || (text.includes(target) && (text.includes("does not exist") || text.includes("schema cache") || text.includes("column")));
}

function isMissingOrganizationColumnError(error: unknown) {
  return isMissingColumnError(error, "organization_id");
}

class PollImportValidationError extends Error {}

class PollImportSchemaMismatchError extends Error {
  databaseMessage: string;

  constructor(databaseMessage: string) {
    super("Poll responses parsed, but CFSP could not match SP records because of a database field mismatch.");
    this.name = "PollImportSchemaMismatchError";
    this.databaseMessage = databaseMessage;
  }
}

function getImportErrorStatus(error: unknown) {
  return error instanceof PollImportValidationError ? 400 : 500;
}

function getImportErrorMessage(error: unknown) {
  if (error instanceof PollImportSchemaMismatchError) return error.message;
  return getErrorMessage(error) || "Could not import poll results.";
}

function getRouteId(params: { id?: string | string[] }) {
  const raw = params.id;
  if (Array.isArray(raw)) return raw[0] || "";
  return typeof raw === "string" ? raw : "";
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

function canUsePrivilegedEventWrite(context: {
  role: string | null | undefined;
  legacyRole: string | null | undefined;
  isPlatformOwner: boolean;
}) {
  return Boolean(
    context.isPlatformOwner ||
      context.role === "platform_owner" ||
      context.role === "org_admin" ||
      context.role === "sim_ops" ||
      context.legacyRole === "super_admin" ||
      context.legacyRole === "admin" ||
      context.legacyRole === "sim_op"
  );
}

function applyAuthCookies(response: NextResponse, context: OrganizationContext | null) {
  return applyOrganizationAuthCookies(response, context);
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
    hireConfirmationCandidateSpIds: "",
    hireConfirmationCandidateEmails: "",
    hireConfirmationSelectionUpdatedAt: "",
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
    .replace(/\u00a0/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyResponderEmail(value: unknown) {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
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
  const normalizedHeader = normalizeImportHeader(header);
  const matched = getImportHeaderEntries(row).find(
    (entry) => entry.key === header || entry.normalizedKey === normalizedHeader
  );
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
    if (/(^| )(start time|completion time|finish time|submit date|timestamp|duration|id|email)( |$)/.test(normalized)) return -1;
    if (/^(full name|enter your full name|responder full name|respondent full name|please enter your full name)$/.test(normalized)) return 150;
    if (/^(first and last name|first last name|sp name|standardized patient name)$/.test(normalized)) return 145;
    if (/^(name)$/.test(normalized)) return sampleValues.some((value) => Boolean(asText(value))) ? 90 : -1;
    if (/^(respondent name|responder name|display name)$/.test(normalized)) return 120;
    if (/(^| )full name( |$)/.test(normalized)) return 130;
    if (/(^| )name( |$)/.test(normalized)) return 85;
    return -1;
  }

  if (type === "email") {
    const hasRealEmailSample = sampleValues.some(isLikelyResponderEmail);
    const hasOnlyAnonymousSamples =
      sampleValues.some((value) => Boolean(asText(value))) &&
      sampleValues.every((value) => !asText(value) || normalizeImportHeader(value) === "anonymous");
    if (/^(enter your email address|please enter your email address|email address|sp email)$/.test(normalized)) return 150;
    if (/^(responder email|respondent email|email|e mail|user email)$/.test(normalized)) {
      if (hasOnlyAnonymousSamples) return -1;
      return hasRealEmailSample ? 135 : 60;
    }
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
  if (/(^| )(start time|completion time|finish time|timestamp|email|name|respondent|responder|comments?|notes?|questions?)( |$)/.test(normalized)) {
    return -1;
  }

  let score = 0;
  const hasAvailabilityLanguage = /availability|available|not available|maybe|can you attend|can you work|can you do|interested|interest/.test(normalized);
  const hasTypeLanguage =
    type === "training"
      ? /(^| )(sp training|training|orientation)( |$)/.test(normalized)
      : /(^| )(event|case|shift)( |$)/.test(normalized) || /available for (this )?event/.test(normalized);
  if (!hasTypeLanguage && !hasAvailabilityLanguage) return -1;
  if (hasTypeLanguage) score += 60;
  if (type === "training" && /sp training/.test(normalized)) score += 35;
  if (type === "event" && /available for (this )?event/.test(normalized)) score += 35;
  if (hasAvailabilityLanguage) score += 25;
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
  if (/^(completion time|finish time|completed at|submitted at|submitted|submission time|time submitted|timestamp|response submitted at)$/.test(normalized)) return 120;
  if (/^(start time|started at)$/.test(normalized)) return 60;
  if (/(^| )(completion|finish|submitted|submission|timestamp|completed)( |$)/.test(normalized)) return 90;
  return -1;
}

function scoreCompletionTimestampHeader(header: string) {
  const normalized = normalizeImportHeader(header);
  if (/^(completion time|finish time|completed at|submitted at|submitted|completed|submission time|time submitted|response submitted at)$/.test(normalized)) return 150;
  if (/^(timestamp)$/.test(normalized)) return 110;
  if (/(^| )(completion|finish|completed|submitted|submission)( |$)/.test(normalized)) return 120;
  return -1;
}

function scoreStartTimestampHeader(header: string) {
  const normalized = normalizeImportHeader(header);
  if (/^(start time|started at)$/.test(normalized)) return 150;
  if (/(^| )(start time|started)( |$)/.test(normalized)) return 120;
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
  const completionTimestampCandidates = detectedHeaders
    .map((header) => ({ header, score: scoreCompletionTimestampHeader(header) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const startTimestampCandidates = detectedHeaders
    .map((header) => ({ header, score: scoreStartTimestampHeader(header) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);
  const trainingHeader = trainingResponseCandidates[0]?.header || "";
  const eventHeader = eventResponseCandidates.find((entry) => entry.header !== trainingHeader)?.header || "";
  const completionHeader = completionTimestampCandidates[0]?.header || "";
  const startHeader = startTimestampCandidates.find((entry) => entry.header !== completionHeader)?.header || "";

  return {
    detectedHeaders,
    matchedNameHeader: nameCandidates[0]?.header || "",
    matchedEmailHeader: emailCandidates[0]?.header || "",
    matchedSpIdHeader: spIdCandidates[0]?.header || "",
    matchedTrainingResponseHeader: trainingHeader,
    matchedEventResponseHeader: eventHeader,
    matchedNotesHeader: notesCandidates[0]?.header || "",
    matchedCompletionTimeHeader: completionHeader,
    matchedStartTimeHeader: startHeader,
    matchedResponseHeaders: responseCandidates.slice(0, 4).map((entry) => entry.header),
    matchedTimestampHeader: completionHeader || startHeader || timestampCandidates[0]?.header || "",
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
  return rows
    .map((row) => {
      const seenHeaders = new Map<string, number>();
      return Object.fromEntries(
        Object.entries(row).map(([key, value]) => {
          const trimmedKey = asText(key) || key;
          const seenCount = seenHeaders.get(trimmedKey) || 0;
          seenHeaders.set(trimmedKey, seenCount + 1);
          return [seenCount ? `${trimmedKey}_${seenCount}` : trimmedKey, value];
        })
      );
    })
    .filter((row) => Object.values(row).some((value) => asText(value)));
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
    [sp.full_name, [sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" ")]
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
    getImportFieldValue(row, [
      "Enter your email address",
      "Email",
      "Email Address",
      "SP Email",
      "Respondent Email",
      "Responder Email",
      "User Email",
      "Please enter your email address",
    ]);
  const linkedSpId =
    getImportFieldValueFromHeader(row, debugInfo.matchedSpIdHeader) ||
    getImportFieldValue(row, ["SP ID", "Directory ID", "Linked SP ID", "Participant ID"]);

  return { name, email: isLikelyResponderEmail(email) ? email : "", linkedSpId };
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
    const completionTimestamp =
      getImportFieldValueFromHeader(row, debugInfo.matchedCompletionTimeHeader) ||
      getImportFieldValue(row, [
        "Completion time",
        "Finish time",
        "Submitted at",
        "Submitted",
        "Completed",
        "Completed At",
        "Time submitted",
        "Submission Time",
        "Timestamp",
      ]);
    const startTimestamp =
      getImportFieldValueFromHeader(row, debugInfo.matchedStartTimeHeader) ||
      getImportFieldValue(row, ["Start time", "Started At"]);
    const timestamp = completionTimestamp || startTimestamp || getImportFieldValueFromHeader(row, debugInfo.matchedTimestampHeader);
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
    const emailMatch = normalizedEmail ? spIndexes.byEmail.get(normalizedEmail) : undefined;
    const nameMatch = !emailMatch && normalizedName ? spIndexes.byName.get(normalizedName) : undefined;
    const linkedSp = !emailMatch && !nameMatch && linkedSpId && spIndexes.byId.has(String(linkedSpId)) ? spIndexes.byId.get(String(linkedSpId)) : undefined;
    const matchedSp = emailMatch || nameMatch || linkedSp;

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
        responseCompletedAt: completionTimestamp,
        responseStartedAt: startTimestamp,
        responseNote: notes,
        matchedSpId,
        matchedSpEmail: matchedSp ? getEmail(matchedSp) : "",
        matchedSpName: matchedSp ? getFullName(matchedSp) : "",
        matchType: matchedSp ? (emailMatch ? "email" : nameMatch ? "name" : "sp_id") : "unmatched",
        matchConfidence: matchedSp ? (emailMatch ? 100 : nameMatch ? 70 : 100) : 0,
        rawAnswer: fallbackAnswer || [trainingResponse, eventResponse].filter(Boolean).join(" | "),
      } satisfies ImportedPollResponseRecord,
    ];
  });

  const getResponseSortTimestamp = (entry: ImportedPollResponseRecord) => {
    const completed = Date.parse(entry.responseCompletedAt || "");
    if (!Number.isNaN(completed)) return completed;
    const submitted = Date.parse(entry.responseSubmittedAt || "");
    if (!Number.isNaN(submitted)) return submitted;
    const started = Date.parse(entry.responseStartedAt || "");
    if (!Number.isNaN(started)) return started;
    return Number.POSITIVE_INFINITY;
  };

  const parsedByKey = new Map<string, ImportedPollResponseRecord>();
  rawParsedResponses.forEach((entry, index) => {
    const key = entry.matchedSpId || entry.normalizedEmail || normalizeMatchName(entry.name) || entry.rawAnswer || `row-${index}`;
    const existing = parsedByKey.get(key);
    if (!existing || getResponseSortTimestamp(entry) > getResponseSortTimestamp(existing)) {
      parsedByKey.set(key, entry);
    }
  });

  const parsedResponses = Array.from(parsedByKey.values()).sort((a, b) => {
    const aTime = getResponseSortTimestamp(a);
    const bTime = getResponseSortTimestamp(b);
    if (aTime !== bTime) return aTime - bTime;
    return normalizeMatchName(a.matchedSpName || a.name).localeCompare(normalizeMatchName(b.matchedSpName || b.name));
  });

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

function formatDetectedPollImportHeaders(headers: string[]) {
  if (!headers.length) return "none";
  const visibleHeaders = headers.slice(0, 12);
  const suffix = headers.length > visibleHeaders.length ? `, ... +${headers.length - visibleHeaders.length} more` : "";
  return `${visibleHeaders.join(", ")}${suffix}`;
}

function getMissingPollImportFields(debugInfo: PollImportDebugInfo) {
  const missing: string[] = [];
  if (!debugInfo.matchedNameHeader) missing.push("SP name column");
  if (!debugInfo.matchedEmailHeader) missing.push("SP email column");
  if (!debugInfo.matchedCompletionTimeHeader && !debugInfo.matchedStartTimeHeader) {
    missing.push("submitted/completed timestamp column");
  }
  return missing;
}

function buildNoResponderRowsError(debugInfo: PollImportDebugInfo) {
  const missing = getMissingPollImportFields(debugInfo);
  const failedReason = debugInfo.failedRows[0]?.reason ? ` First skipped row: ${debugInfo.failedRows[0].reason}` : "";
  const missingText = missing.length ? ` Missing required fields: ${missing.join(", ")}.` : " No required columns appear to be missing, but no rows had usable responder values.";
  return `No responder rows were found in that poll export. Found headers: ${formatDetectedPollImportHeaders(debugInfo.detectedHeaders)}.${missingText}${failedReason}`;
}

export async function POST(request: Request, context: { params: Promise<{ id?: string | string[] }> }) {
  let organizationContext: OrganizationContext | null = null;
  let eventId = "";

  try {
    organizationContext = await getOrganizationContext();
    if (!organizationContext.user) return unauthorizedJson(organizationContext);
    if (!requireActiveOrganization(organizationContext)) return noActiveOrganizationJson(organizationContext);
    if (!roleCanOperateOrganization(organizationContext.role)) {
      return forbiddenJson("Only Sim Ops or admin accounts can import poll results.", organizationContext);
    }

    const params = await context.params;
    eventId = getRouteId(params);
    if (!eventId) {
      return applyAuthCookies(NextResponse.json({ ok: false, error: "Missing event id." }, { status: 400 }), organizationContext);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return applyAuthCookies(
        NextResponse.json({ ok: false, error: "Upload request must be multipart/form-data." }, { status: 400 }),
        organizationContext
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return applyAuthCookies(
        NextResponse.json({ ok: false, error: "Upload a CSV, XLSX, or XLS poll results file." }, { status: 400 }),
        organizationContext
      );
    }

    const activeOrganizationId = organizationContext.activeOrganization!.id;
    const shouldScopeByOrganization = organizationContext.schemaAvailable;
    const supabaseUserClient = createSupabaseUserClient(organizationContext.accessToken);
    const adminClient = canUsePrivilegedEventWrite(organizationContext) ? createSupabaseAdminClient() : null;
    const supabaseServer = adminClient || supabaseUserClient;

    let eventQuery = supabaseServer.from("events").select("id,notes,organization_id").eq("id", eventId);
    if (shouldScopeByOrganization) eventQuery = eventQuery.eq("organization_id", activeOrganizationId);
    const { data: scopedEvent, error: eventError } = await eventQuery.maybeSingle();

    let hasOrganizationColumn = shouldScopeByOrganization;
    const event = scopedEvent as ({ id: string; notes: string | null; organization_id?: unknown } | null) | null;
    let eventErrorObj = eventError?.message ? eventError : null;

    let resolvedEvent: { id: string; notes: string | null; organization_id?: unknown } | null = event;

    if (eventErrorObj && isMissingOrganizationColumnError(eventErrorObj)) {
      const { data: unscopedEvent, error: unscopedEventError } = await supabaseServer
        .from("events")
        .select("id,notes")
        .eq("id", eventId)
        .maybeSingle();
      if (unscopedEventError) {
        return applyAuthCookies(
          NextResponse.json(
            { ok: false, error: unscopedEventError.message || "Could not load event." },
            { status: 500 }
          ),
          organizationContext
        );
      }
      if (!unscopedEvent) {
        return applyAuthCookies(NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 }), organizationContext);
      }
      resolvedEvent = unscopedEvent as { id: string; notes: string | null; organization_id?: unknown };
      hasOrganizationColumn = false;
      eventErrorObj = null;
    } else if (!resolvedEvent || eventErrorObj) {
      if (eventErrorObj) {
        return applyAuthCookies(
          NextResponse.json({ ok: false, error: eventErrorObj.message || "Could not load event." }, { status: 500 }),
          organizationContext
        );
      }
      return applyAuthCookies(NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 }), organizationContext);
    }

    const organizationMatched =
      !hasOrganizationColumn ||
      asText((resolvedEvent as { organization_id?: unknown }).organization_id) === activeOrganizationId;
    if (!organizationMatched) {
      return applyAuthCookies(
        NextResponse.json({ ok: false, error: "Event not found for your active organization." }, { status: 404 }),
        organizationContext
      );
    }

    const parsedFile = await parsePollFile(file);
    const detected = detectPollImportHeaders(parsedFile.rows);

    const eventOrganizationId = asText((resolvedEvent as { organization_id?: unknown }).organization_id);
    const shouldScopeRosterByOrganization = shouldScopeByOrganization && Boolean(eventOrganizationId);
    const loadSpsWithColumns = async (columns: string) => {
      let query = supabaseServer.from("sps").select(columns).limit(5000);
      if (shouldScopeRosterByOrganization) query = query.eq("organization_id", eventOrganizationId);
      return query;
    };

    let spsResult = await loadSpsWithColumns("id,first_name,last_name,full_name,working_email,email");
    if (spsResult.error && isMissingColumnError(spsResult.error, "working_email")) {
      console.warn("[poll-import] sps.working_email column unavailable; falling back to minimal SP identity fields.", {
        eventId,
        message: spsResult.error.message || "",
        code: spsResult.error.code || "",
        details: spsResult.error.details || "",
        hint: spsResult.error.hint || "",
      });
      spsResult = await loadSpsWithColumns("id,first_name,last_name,full_name,email");
    }
    if (spsResult.error) {
      const databaseMessage = spsResult.error.message || "Could not load SP roster.";
      if (
        isMissingColumnError(spsResult.error, "schedule_name") ||
        isMissingColumnError(spsResult.error, "first_name") ||
        isMissingColumnError(spsResult.error, "last_name") ||
        isMissingColumnError(spsResult.error, "full_name") ||
        isMissingColumnError(spsResult.error, "email")
      ) {
        throw new PollImportSchemaMismatchError(databaseMessage);
      }
      throw new Error(databaseMessage);
    }

    const { data: assignments, error: assignmentsError } = await supabaseServer
      .from("event_sps")
      .select("id,sp_id,notes")
      .eq("event_id", eventId);
    if (assignmentsError) throw new Error(assignmentsError.message || "Could not load event assignments.");

    const { parsedResponses, failedRows } = parseRowsToResponses({
      rows: parsedFile.rows,
      debugInfo: detected,
      sps: (spsResult.data || []) as unknown as SpImportRow[],
    });

    const debugInfo: PollImportDebugInfo = {
      ...detected,
      failedRows,
    };

    if (!parsedResponses.length) {
      return applyAuthCookies(
        NextResponse.json(
          {
            ok: false,
            error: buildNoResponderRowsError(debugInfo),
            debug: debugInfo,
          },
          { status: 400 }
        ),
        organizationContext
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

    const nextNotes = upsertPollMetadata(resolvedEvent.notes, {
      importedPollResponses: encodeImportedPollResponses(parsedResponses),
      pollImportCreatedAt: new Date().toISOString(),
      pollImportSource: file.name || parsedFile.sheetName || "Poll results upload",
      hireConfirmationCandidateSpIds: "",
      hireConfirmationCandidateEmails: "",
      hireConfirmationSelectionUpdatedAt: "",
    });
    const { error: updateEventError } = await supabaseServer
      .from("events")
      .update({ notes: nextNotes })
      .eq("id", eventId);
    if (updateEventError) throw new Error(updateEventError.message || "Could not save imported poll results.");

    const summary = summarizeResponses(parsedResponses, failedRows, noteUpdates.length);

    return applyAuthCookies(
      NextResponse.json({
        ok: true,
        message: `Imported ${parsedResponses.length} poll response${parsedResponses.length === 1 ? "" : "s"}.`,
        importedPollResponses: parsedResponses,
        eventNotes: nextNotes,
        debug: debugInfo,
        summary,
      }),
      organizationContext
    );
  } catch (error) {
    const supabaseError = toSupabaseError(error);
    const databaseMessage = error instanceof PollImportSchemaMismatchError ? error.databaseMessage : "";
    console.error("[poll-import] failed", {
      eventId,
      stage: "POST /api/events/[id]/poll-import",
      message: databaseMessage || supabaseError.message || "",
      code: supabaseError.code || "",
      details: supabaseError.details || "",
      hint: supabaseError.hint || "",
    });
    return applyAuthCookies(
      NextResponse.json(
        { ok: false, error: getImportErrorMessage(error) },
        { status: getImportErrorStatus(error) }
      ),
      organizationContext
    );
  }
}
