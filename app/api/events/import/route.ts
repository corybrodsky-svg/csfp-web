import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "../../../lib/supabaseServerClient";
import { asText, formatUsDate, normalizeLooseDateToIso } from "../../../lib/eventDateUtils";

export const dynamic = "force-dynamic";

type ParsedSession = {
  date: string;
  time: string | null;
};

type ParsedRosterRow = {
  email: string;
  name: string;
  caseText: string | null;
  assignmentText: string | null;
  notesText: string | null;
  statusByDate: Record<string, string>;
};

type ParsedSheet = {
  sheet: string;
  format: "sp_event_info" | "sp_info";
  title: string;
  term: string | null;
  sessions: ParsedSession[];
  trainingDate: string | null;
  eventTime: string | null;
  zoomLink: string | null;
  caseText: string | null;
  location: string | null;
  simStaffNames: string[];
  staffLine: string | null;
  eventLeadTeam: string | null;
  courseFaculty: string | null;
  rosterRows: ParsedRosterRow[];
};

type ImportEntry = {
  file: string;
  sheet: string;
  detectorMatched: ParsedSheet["format"];
  extractedTitle: string;
  extractedDates: string[];
  fieldsFound: string[];
  spFound: number;
  simStaffCount: number;
  staffExtracted: string | null;
  matchedEvent?: string;
  matchedEventId?: string;
  confidence?: number;
  confidenceLabel?: "exact" | "high" | "medium" | "low";
  willUpdate?: string[];
  needsReviewReason?: string;
  reason?: string;
  error?: string;
  checkedSheets?: string[];
  spMatched?: number;
  spAssignmentsCreated?: number;
  duplicatesAvoided?: number;
  unmatchedSpRows?: Array<{ name: string; email: string }>;
};

type ImportResponse = {
  preview: ImportEntry[];
  updated: ImportEntry[];
  skipped: ImportEntry[];
  errors: ImportEntry[];
  needsReview: ImportEntry[];
};

type EventRow = {
  id: string;
  name: string | null;
  date_text: string | null;
  notes: string | null;
  location: string | null;
  created_at: string | null;
};

type EventSessionRow = {
  event_id: string | null;
  session_date: string | null;
};

type SPDirectoryRow = {
  id: string;
  full_name: string | null;
  working_email: string | null;
  email: string | null;
};

type EventAssignmentRow = {
  id: string;
  event_id: string;
  sp_id: string;
  status: string | null;
  confirmed: boolean | null;
};

type MatchCandidate = {
  event: EventRow;
  confidence: number;
  label: "exact" | "high" | "medium" | "low";
  reason: string;
};

const IMPORT_START = "[SP_EVENT_INFO_IMPORT]";
const IMPORT_END = "[/SP_EVENT_INFO_IMPORT]";

function normalizeTitle(value: string) {
  return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeDateKey(value: string | null) {
  return formatUsDate(value) || asText(value);
}

function normalizeEmail(value: string | null | undefined) {
  return asText(value).toLowerCase();
}

function normalizeName(value: string | null | undefined) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMergedCellValue(sheet: XLSX.WorkSheet, address: string) {
  const direct = sheet[address];
  if (direct) return direct.v;

  const merges = sheet["!merges"] || [];
  const target = XLSX.utils.decode_cell(address);

  for (const merge of merges) {
    if (
      target.r >= merge.s.r &&
      target.r <= merge.e.r &&
      target.c >= merge.s.c &&
      target.c <= merge.e.c
    ) {
      const anchor = XLSX.utils.encode_cell(merge.s);
      return sheet[anchor]?.v;
    }
  }

  return undefined;
}

function getMergedCellText(sheet: XLSX.WorkSheet, address: string) {
  return asText(getMergedCellValue(sheet, address));
}

function parseExcelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  const raw = asText(value);
  if (!raw) return null;

  const mmddyy = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (mmddyy) {
    const yearText = mmddyy[3];
    const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : 2026;
    return `${year}-${String(Number(mmddyy[1])).padStart(2, "0")}-${String(Number(mmddyy[2])).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function parseTimeValue(value: unknown) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}:00`;
    }
  }

  const raw = asText(value);
  if (!raw) return null;

  const normalized = raw.replace(/[–—]/g, "-");
  const match = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const suffix = (match[3] || "").toLowerCase();

  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function formatTimeLabel(value: string | null) {
  if (!value) return null;
  const parts = value.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1] || "0");
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function isKnownHeader(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const exactHeaders = new Set([
    "sim staff",
    "staff hiring",
    "event",
    "event title",
    "zoom",
    "link",
    "training date",
    "event date",
    "event dates",
    "event time",
    "case",
    "sp emails",
    "sp names",
    "location",
    "room",
    "event lead",
    "event lead team",
    "course faculty",
    "faculty",
    "email",
    "sp hired",
    "assignment",
    "notes",
  ]);

  return exactHeaders.has(normalized);
}

function looksLikeDateOrTime(value: string) {
  return (
    /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(value) ||
    /^\d{1,2}:\d{2}(?:\s?[ap]m)?$/i.test(value) ||
    /^\d{1,2}\s?[ap]m$/i.test(value) ||
    /\b(am|pm)\b/i.test(value.toLowerCase()) ||
    /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.test(value.toLowerCase())
  );
}

function looksLikeLocation(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("zoom") ||
    normalized.includes("room") ||
    normalized.includes("location") ||
    normalized.includes("building") ||
    normalized.includes("campus") ||
    normalized.includes("hall")
  );
}

function looksLikePersonName(value: string) {
  if (!value) return false;
  if (isKnownHeader(value)) return false;
  if (looksLikeDateOrTime(value)) return false;
  if (looksLikeLocation(value)) return false;
  if (value.includes("@")) return false;
  if (/https?:\/\//i.test(value)) return false;
  if (/\d{2,}/.test(value)) return false;

  const words = value
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z'.-]/g, ""))
    .filter(Boolean);

  return words.length >= 1 && words.length <= 4;
}

function splitPeopleList(raw: string) {
  return asText(raw)
    .replace(/^(sim staff|staff hiring|event lead\/team|event lead|team|course faculty|faculty)\s*:\s*/i, "")
    .replace(/\r/g, "\n")
    .split(/\s*(?:\n|,|;|\/| and | & )\s*/i)
    .map((part) => part.trim())
    .filter((part) => looksLikePersonName(part));
}

function extractSimStaffNamesFromColumnB(sheet: XLSX.WorkSheet) {
  const names: string[] = [];
  const seen = new Set<string>();
  const rangeRef = sheet["!ref"];
  if (!rangeRef) return names;

  const range = XLSX.utils.decode_range(rangeRef);

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const value = asText(getMergedCellValue(sheet, `B${row + 1}`));
    if (!looksLikePersonName(value)) continue;

    const normalized = normalizeName(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(value);
  }

  return names;
}

function getSheetRange(sheet: XLSX.WorkSheet) {
  if (!sheet["!ref"]) return null;
  return XLSX.utils.decode_range(sheet["!ref"]);
}

function findLabeledValue(sheet: XLSX.WorkSheet, labels: string[]) {
  const range = getSheetRange(sheet);
  if (!range) return null;
  const normalizedLabels = labels.map((label) => label.toLowerCase());

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const value = asText(getMergedCellValue(sheet, address));
      if (!value) continue;

      const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
      const matches = normalizedLabels.some(
        (label) => normalized === label || normalized.startsWith(`${label}:`)
      );
      if (!matches) continue;

      const inlineMatch = value.match(/:\s*(.+)$/);
      if (inlineMatch?.[1]) return asText(inlineMatch[1]);

      const rightValue = asText(getMergedCellValue(sheet, XLSX.utils.encode_cell({ r: row, c: col + 1 })));
      if (rightValue) return rightValue;

      const belowValue = asText(getMergedCellValue(sheet, XLSX.utils.encode_cell({ r: row + 1, c: col })));
      if (belowValue) return belowValue;
    }
  }

  return null;
}

function addUniqueDateSession(sessions: ParsedSession[], date: string | null, time: string | null) {
  if (!date) return;
  const key = `${date}|${time || ""}`;
  if (sessions.some((session) => `${session.date}|${session.time || ""}` === key)) return;
  sessions.push({ date, time });
}

function parseSpEventInfoRoster(sheet: XLSX.WorkSheet) {
  const rows: ParsedRosterRow[] = [];
  let blankRowStreak = 0;

  for (let row = 16; row <= 220; row += 1) {
    const email = getMergedCellText(sheet, `B${row}`);
    const name = getMergedCellText(sheet, `C${row}`);
    const caseText = getMergedCellText(sheet, `D${row}`) || null;
    const assignmentText = getMergedCellText(sheet, `E${row}`) || null;
    const notesText = getMergedCellText(sheet, `F${row}`) || null;
    const isBlank = !email && !name && !caseText && !assignmentText && !notesText;

    if (isBlank) {
      blankRowStreak += 1;
      if (blankRowStreak >= 5) break;
      continue;
    }

    blankRowStreak = 0;
    if (!email && !name) continue;

    rows.push({
      email,
      name,
      caseText,
      assignmentText,
      notesText,
      statusByDate: {},
    });
  }

  return rows;
}

function parseSpEventInfoSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedSheet | null {
  const title = getMergedCellText(sheet, "B2");
  const simStaffAnchorText = [
    getMergedCellText(sheet, "D12"),
    getMergedCellText(sheet, "E12"),
    getMergedCellText(sheet, "F12"),
  ]
    .join(" ")
    .toLowerCase();
  const zoomLink = getMergedCellText(sheet, "B7") || null;
  const trainingDate = parseExcelDate(getMergedCellValue(sheet, "D14"));
  const eventTime = parseTimeValue(getMergedCellValue(sheet, "D15"));
  const caseText = getMergedCellText(sheet, "D83") || null;
  const sessions: ParsedSession[] = [];

  ["E14", "F14", "G14", "H14", "I14"].forEach((address) => {
    addUniqueDateSession(sessions, parseExcelDate(getMergedCellValue(sheet, address)), eventTime);
  });

  if (!title || sessions.length === 0 || !simStaffAnchorText.includes("sim staff")) {
    return null;
  }

  const labeledSimStaff = splitPeopleList(findLabeledValue(sheet, ["Sim Staff", "Staff Hiring"]) || "");
  const columnSimStaff = extractSimStaffNamesFromColumnB(sheet);
  const simStaffNames = Array.from(new Set([...labeledSimStaff, ...columnSimStaff]));
  const eventLeadTeam = findLabeledValue(sheet, ["Event Lead/Team", "Event Lead", "Team"]);
  const courseFaculty = findLabeledValue(sheet, ["Course Faculty", "Faculty"]);
  const location = findLabeledValue(sheet, ["Location", "Room"]);
  const rosterRows = parseSpEventInfoRoster(sheet);

  return {
    sheet: sheetName,
    format: "sp_event_info",
    title,
    term: null,
    sessions,
    trainingDate,
    eventTime,
    zoomLink,
    caseText,
    location: location || null,
    simStaffNames,
    staffLine: simStaffNames.length ? `Sim Staff: ${simStaffNames.join(", ")}` : null,
    eventLeadTeam: eventLeadTeam ? `Event Lead/Team: ${eventLeadTeam}` : null,
    courseFaculty: courseFaculty ? `Course Faculty: ${courseFaculty}` : null,
    rosterRows,
  };
}

function parseSpInfoSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedSheet | null {
  const title = getMergedCellText(sheet, "A1");
  const term = getMergedCellText(sheet, "A2") || null;
  const emailHeader = getMergedCellText(sheet, "A14").toLowerCase();
  const hiredHeader = getMergedCellText(sheet, "B14").toLowerCase();
  const staffHiringRaw = getMergedCellText(sheet, "D13");
  const sessions: ParsedSession[] = [];
  const dateColumns = ["D", "E", "F", "G"];
  const statusColumnsByDate = new Map<string, string>();

  dateColumns.forEach((column) => {
    const date = parseExcelDate(getMergedCellValue(sheet, `${column}14`));
    const time = parseTimeValue(getMergedCellValue(sheet, `${column}15`));
    addUniqueDateSession(sessions, date, time);
    if (date) statusColumnsByDate.set(date, column);
  });

  const looksValid =
    Boolean(title) &&
    emailHeader.includes("email") &&
    hiredHeader.includes("sp hired") &&
    sessions.length > 0;

  if (!looksValid) return null;

  const rosterRows: ParsedRosterRow[] = [];
  let blankRowStreak = 0;

  for (let row = 16; row <= 250; row += 1) {
    const email = getMergedCellText(sheet, `A${row}`);
    const name = getMergedCellText(sheet, `B${row}`);
    const caseText = getMergedCellText(sheet, `H${row}`) || null;
    const assignmentText = getMergedCellText(sheet, `I${row}`) || null;
    const notesText = getMergedCellText(sheet, `J${row}`) || null;

    const statuses = Object.fromEntries(
      [...statusColumnsByDate.entries()].map(([date, column]) => [date, getMergedCellText(sheet, `${column}${row}`)])
    );
    const hasUsefulStatus = Object.values(statuses).some(Boolean);
    const isBlank = !email && !name && !caseText && !assignmentText && !notesText && !hasUsefulStatus;

    if (isBlank) {
      blankRowStreak += 1;
      if (blankRowStreak >= 5) break;
      continue;
    }

    blankRowStreak = 0;
    if (!email && !name) continue;

    rosterRows.push({
      email,
      name,
      caseText,
      assignmentText,
      notesText,
      statusByDate: statuses,
    });
  }

  const staffLine = staffHiringRaw
    ? /^staff hiring\s*:/i.test(staffHiringRaw)
      ? staffHiringRaw
      : `Staff Hiring: ${staffHiringRaw}`
    : null;
  const simStaffNames = splitPeopleList(staffHiringRaw);
  const caseText = rosterRows.map((row) => row.caseText).find(Boolean) || null;

  return {
    sheet: sheetName,
    format: "sp_info",
    title,
    term,
    sessions,
    trainingDate: null,
    eventTime: sessions[0]?.time || null,
    zoomLink: null,
    caseText,
    location: null,
    simStaffNames,
    staffLine,
    eventLeadTeam: null,
    courseFaculty: null,
    rosterRows,
  };
}

function parseSupportedSheet(sheet: XLSX.WorkSheet, sheetName: string) {
  return parseSpEventInfoSheet(sheet, sheetName) || parseSpInfoSheet(sheet, sheetName);
}

function tokenizeTitle(value: string) {
  return normalizeTitle(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreTitleSimilarity(a: string, b: string) {
  const normalizedA = normalizeTitle(a);
  const normalizedB = normalizeTitle(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.9;

  const aTokens = new Set(tokenizeTitle(a));
  const bTokens = new Set(tokenizeTitle(b));
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  return intersection / union;
}

function dateDistanceDays(a: string | null, b: string | null) {
  const isoA = normalizeLooseDateToIso(a);
  const isoB = normalizeLooseDateToIso(b);
  if (!isoA || !isoB) return Number.POSITIVE_INFINITY;
  const timeA = Date.parse(`${isoA}T00:00:00`);
  const timeB = Date.parse(`${isoB}T00:00:00`);
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return Number.POSITIVE_INFINITY;
  return Math.abs(timeA - timeB) / (24 * 60 * 60 * 1000);
}

function scoreDateCloseness(a: string | null, b: string | null) {
  const distance = dateDistanceDays(a, b);
  if (!Number.isFinite(distance)) return 0;
  if (distance === 0) return 1;
  if (distance <= 1) return 0.92;
  if (distance <= 3) return 0.84;
  if (distance <= 7) return 0.72;
  return 0.2;
}

function classifyConfidence(score: number, exact: boolean): MatchCandidate["label"] {
  if (exact || score >= 0.95) return "exact";
  if (score >= 0.86) return "high";
  if (score >= 0.72) return "medium";
  return "low";
}

function getPrimaryDate(parsed: ParsedSheet) {
  return parsed.sessions[0]?.date || null;
}

function getEventReferenceDate(event: EventRow, sessionDatesByEventId: Map<string, string | null>) {
  return sessionDatesByEventId.get(event.id) || event.date_text || null;
}

function findBestEventMatch(
  parsed: ParsedSheet,
  existingEvents: EventRow[],
  sessionDatesByEventId: Map<string, string | null>
) {
  const primaryDate = getPrimaryDate(parsed);
  const exactMatch = existingEvents.find((event) => {
    const sameTitle = normalizeTitle(event.name || "") === normalizeTitle(parsed.title);
    const sameDate = normalizeDateKey(getEventReferenceDate(event, sessionDatesByEventId)) === normalizeDateKey(primaryDate);
    return sameTitle && sameDate;
  });

  if (exactMatch) {
    return {
      event: exactMatch,
      confidence: 1,
      label: "exact" as const,
      reason: "Exact title and date match",
    };
  }

  let best: MatchCandidate | null = null;

  existingEvents.forEach((event) => {
    const titleScore = scoreTitleSimilarity(parsed.title, event.name || "");
    if (titleScore < 0.45) return;
    const dateScore = scoreDateCloseness(primaryDate, getEventReferenceDate(event, sessionDatesByEventId));
    const confidence = titleScore * 0.72 + dateScore * 0.28;
    const label = classifyConfidence(confidence, false);
    const candidate: MatchCandidate = {
      event,
      confidence,
      label,
      reason:
        label === "high"
          ? "Strong title match with nearby date"
          : label === "medium"
            ? "Possible title/date match needs review"
            : "Low-confidence match",
    };

    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    }
  });

  return best;
}

function buildFieldsFound(parsed: ParsedSheet) {
  const fields: string[] = [];
  if (parsed.title) fields.push("Event title");
  if (parsed.sessions.length) fields.push("Event dates");
  if (parsed.eventTime) fields.push("Event time");
  if (parsed.trainingDate) fields.push("Training date");
  if (parsed.location) fields.push("Location");
  if (parsed.caseText) fields.push("Case");
  if (parsed.zoomLink) fields.push("Zoom");
  if (parsed.simStaffNames.length) fields.push("Sim Staff");
  if (parsed.eventLeadTeam) fields.push("Event Lead/Team");
  if (parsed.courseFaculty) fields.push("Course Faculty");
  return fields;
}

function buildWillUpdate(parsed: ParsedSheet, event: EventRow | null) {
  const updates: string[] = [];
  updates.push("Append or refresh [SP_EVENT_INFO_IMPORT] notes section");
  if (parsed.simStaffNames.length) updates.push("Update Team / Sim Staff details in notes");
  if (parsed.eventLeadTeam) updates.push("Update Event Lead/Team notes");
  if (parsed.courseFaculty) updates.push("Update Course Faculty notes");
  if (parsed.zoomLink) updates.push("Store Zoom / virtual logistics");
  if (parsed.trainingDate) updates.push("Store training date");
  if (parsed.sessions.length) updates.push("Ensure event sessions exist for imported dates");
  if (!asText(event?.location) && parsed.location) updates.push("Fill missing location from workbook");
  if (parsed.rosterRows.length) updates.push("Create missing SP assignments from workbook roster");
  return updates;
}

function upsertImportSection(existingNotes: string | null, parsed: ParsedSheet, sourceFile: string) {
  const base = asText(existingNotes);
  const withoutSection = base
    .replace(new RegExp(`${IMPORT_START}[\\s\\S]*?${IMPORT_END}\\n*`, "g"), "")
    .trimEnd();

  const sectionLines = [
    IMPORT_START,
    `Source File: ${sourceFile}`,
    `Imported Title: ${parsed.title}`,
    parsed.sessions.length ? `Event Dates: ${parsed.sessions.map((session) => normalizeDateKey(session.date)).join(", ")}` : "",
    parsed.eventTime ? `Event Time: ${formatTimeLabel(parsed.eventTime)}` : "",
    parsed.trainingDate ? `Training Date: ${normalizeDateKey(parsed.trainingDate)}` : "",
    parsed.location ? `Location: ${parsed.location}` : "",
    parsed.zoomLink ? `Zoom: ${parsed.zoomLink}` : "",
    parsed.caseText ? `Case: ${parsed.caseText}` : "",
    parsed.staffLine || "",
    parsed.eventLeadTeam || "",
    parsed.courseFaculty || "",
    IMPORT_END,
  ].filter(Boolean);

  const section = sectionLines.join("\n");
  return withoutSection ? `${withoutSection}\n\n${section}` : section;
}

function buildPreviewEntry(
  fileName: string,
  parsed: ParsedSheet,
  match: MatchCandidate | null,
  event: EventRow | null
): ImportEntry {
  return {
    file: fileName,
    sheet: parsed.sheet,
    detectorMatched: parsed.format,
    extractedTitle: parsed.title,
    extractedDates: parsed.sessions.map((session) => normalizeDateKey(session.date)),
    fieldsFound: buildFieldsFound(parsed),
    spFound: parsed.rosterRows.length,
    simStaffCount: parsed.simStaffNames.length,
    staffExtracted: parsed.staffLine || parsed.eventLeadTeam || parsed.courseFaculty || null,
    matchedEvent: event?.name || undefined,
    matchedEventId: event?.id || undefined,
    confidence: match ? Number(match.confidence.toFixed(2)) : undefined,
    confidenceLabel: match?.label,
    willUpdate: buildWillUpdate(parsed, event),
  };
}

async function ensureSessions(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  parsed: ParsedSheet
) {
  const { data: existingSessions, error: sessionFetchError } = await supabaseServer
    .from("event_sessions")
    .select("id,event_id,session_date,start_time,end_time,location,room")
    .eq("event_id", eventId);

  if (sessionFetchError) throw new Error(sessionFetchError.message);

  const existingKeys = new Set(
    (existingSessions || []).map((session) => `${asText(session.session_date)}|${asText(session.start_time)}`)
  );

  const inserts = parsed.sessions
    .filter((session) => !existingKeys.has(`${session.date}|${session.time || ""}`))
    .map((session) => ({
      event_id: eventId,
      session_date: session.date,
      start_time: session.time,
      end_time: null,
      location: parsed.location || null,
      room: null,
    }));

  if (!inserts.length) return;

  const { error } = await supabaseServer.from("event_sessions").insert(inserts);
  if (error) throw new Error(error.message);
}

function rowIndicatesConfirmed(row: ParsedRosterRow) {
  const allTexts = [
    row.assignmentText,
    row.notesText,
    ...Object.values(row.statusByDate),
  ]
    .map(asText)
    .join(" ")
    .toLowerCase();

  return allTexts.includes("confirmed");
}

function rowIsActionable(row: ParsedRosterRow, format: ParsedSheet["format"]) {
  if (format === "sp_event_info") {
    return Boolean(asText(row.email) || asText(row.name));
  }

  return Object.values(row.statusByDate).some((value) => {
    const normalized = asText(value).toLowerCase();
    return ["x", "yes", "y", "assigned", "hired", "confirmed", "contacted", "invited"].includes(normalized);
  });
}

async function syncRosterAssignments(
  supabaseServer: ReturnType<typeof createSupabaseServerClient>,
  eventId: string,
  parsed: ParsedSheet,
  spDirectory: SPDirectoryRow[]
) {
  const actionableRows = parsed.rosterRows.filter((row) => rowIsActionable(row, parsed.format));
  if (!actionableRows.length) {
    return {
      spMatched: 0,
      spAssignmentsCreated: 0,
      duplicatesAvoided: 0,
      unmatchedSpRows: [] as Array<{ name: string; email: string }>,
    };
  }

  const { data: existingAssignments, error: existingAssignmentError } = await supabaseServer
    .from("event_sps")
    .select("id,event_id,sp_id,status,confirmed")
    .eq("event_id", eventId);

  if (existingAssignmentError) throw new Error(existingAssignmentError.message);

  const assignmentBySpId = new Map<string, EventAssignmentRow>();
  (existingAssignments || []).forEach((assignment) => {
    assignmentBySpId.set(asText(assignment.sp_id), assignment as EventAssignmentRow);
  });

  let spMatched = 0;
  let spAssignmentsCreated = 0;
  let duplicatesAvoided = 0;
  const unmatchedSpRows: Array<{ name: string; email: string }> = [];

  for (const row of actionableRows) {
    const normalizedEmail = normalizeEmail(row.email);
    const normalizedName = normalizeName(row.name);
    const matchedSp =
      spDirectory.find((sp) => normalizedEmail && normalizeEmail(sp.working_email) === normalizedEmail) ||
      spDirectory.find((sp) => normalizedEmail && normalizeEmail(sp.email) === normalizedEmail) ||
      spDirectory.find((sp) => normalizedName && normalizeName(sp.full_name) === normalizedName);

    if (!matchedSp) {
      unmatchedSpRows.push({ name: row.name, email: row.email });
      continue;
    }

    spMatched += 1;
    const shouldConfirm = rowIndicatesConfirmed(row);
    const nextStatus = shouldConfirm ? "confirmed" : "contacted";
    const existingAssignment = assignmentBySpId.get(matchedSp.id);

    if (existingAssignment) {
      duplicatesAvoided += 1;
      if (shouldConfirm && (existingAssignment.status !== "confirmed" || existingAssignment.confirmed !== true)) {
        const { error } = await supabaseServer
          .from("event_sps")
          .update({ status: "confirmed", confirmed: true })
          .eq("id", existingAssignment.id);
        if (error) throw new Error(error.message);
      }
      continue;
    }

    const { data: insertedAssignment, error: insertError } = await supabaseServer
      .from("event_sps")
      .insert({
        event_id: eventId,
        sp_id: matchedSp.id,
        status: nextStatus,
        confirmed: shouldConfirm,
      })
      .select("id,event_id,sp_id,status,confirmed")
      .single();

    if (insertError) throw new Error(insertError.message);

    if (insertedAssignment) {
      assignmentBySpId.set(matchedSp.id, insertedAssignment as EventAssignmentRow);
      spAssignmentsCreated += 1;
    }
  }

  return { spMatched, spAssignmentsCreated, duplicatesAvoided, unmatchedSpRows };
}

async function analyzeWorkbookFile(
  file: File,
  existingEvents: EventRow[],
  sessionDatesByEventId: Map<string, string | null>
) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const checkedSheets = [...workbook.SheetNames];
  const parsedSheets = workbook.SheetNames
    .map((sheetName) => parseSupportedSheet(workbook.Sheets[sheetName], sheetName))
    .filter((value): value is ParsedSheet => Boolean(value));

  if (!parsedSheets.length) {
    return {
      preview: [] as Array<{ parsed: ParsedSheet; match: MatchCandidate | null; entry: ImportEntry }>,
      skipped: [
        {
          file: file.name,
          sheet: "",
          detectorMatched: "sp_event_info" as const,
          extractedTitle: "",
          extractedDates: [],
          fieldsFound: [],
          spFound: 0,
          simStaffCount: 0,
          staffExtracted: null,
          checkedSheets,
          reason: `No supported sheet format found. Checked sheets: ${checkedSheets.join(", ")}`,
        } satisfies ImportEntry,
      ],
      errors: [] as ImportEntry[],
    };
  }

  const preview = parsedSheets.map((parsed) => {
    const match = findBestEventMatch(parsed, existingEvents, sessionDatesByEventId);
    const event = match?.event || null;
    return {
      parsed,
      match,
      entry: buildPreviewEntry(file.name, parsed, match, event),
    };
  });

  return {
    preview,
    skipped: [] as ImportEntry[],
    errors: [] as ImportEntry[],
  };
}

export async function POST(request: Request) {
  try {
    const supabaseServer = createSupabaseServerClient();
    const formData = await request.formData();
    const action = asText(formData.get("action")).toLowerCase() || "preview";
    const uploadedFiles = [
      ...formData.getAll("files").filter((value): value is File => value instanceof File),
      ...formData.getAll("file").filter((value): value is File => value instanceof File),
    ];

    if (!uploadedFiles.length) {
      return NextResponse.json({ error: "Upload one or more Excel workbooks." }, { status: 400 });
    }

    const { data: existingEvents, error: existingError } = await supabaseServer
      .from("events")
      .select("id,name,date_text,notes,location,created_at");

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const { data: eventSessions, error: sessionError } = await supabaseServer
      .from("event_sessions")
      .select("event_id,session_date")
      .order("session_date", { ascending: true });

    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    const sessionDatesByEventId = new Map<string, string | null>();
    (eventSessions || []).forEach((session) => {
      const eventId = asText((session as EventSessionRow).event_id);
      if (!eventId || sessionDatesByEventId.has(eventId)) return;
      sessionDatesByEventId.set(eventId, asText((session as EventSessionRow).session_date) || null);
    });

    const { data: spDirectory, error: spDirectoryError } = await supabaseServer
      .from("sps")
      .select("id,full_name,working_email,email");

    if (spDirectoryError) {
      return NextResponse.json({ error: spDirectoryError.message }, { status: 500 });
    }

    const results: ImportResponse = {
      preview: [],
      updated: [],
      skipped: [],
      errors: [],
      needsReview: [],
    };

    for (const file of uploadedFiles) {
      try {
        const analyzed = await analyzeWorkbookFile(file, [...(existingEvents || [])], sessionDatesByEventId);
        results.skipped.push(...analyzed.skipped);
        results.errors.push(...analyzed.errors);

        for (const item of analyzed.preview) {
          const entry = item.entry;
          results.preview.push(entry);

          if (!item.match || item.match.label === "low" || item.match.label === "medium") {
            results.needsReview.push({
              ...entry,
              needsReviewReason: item.match?.reason || "No confident event match found",
            });
            continue;
          }

          if (action !== "apply") continue;

          const matchedEvent = item.match.event;
          const nextNotes = upsertImportSection(matchedEvent.notes, item.parsed, file.name);
          const updatePayload: Record<string, unknown> = { notes: nextNotes };

          if (!asText(matchedEvent.location) && item.parsed.location) {
            updatePayload.location = item.parsed.location;
          }

          const primaryDate = getPrimaryDate(item.parsed);
          if (!asText(matchedEvent.date_text) && primaryDate) {
            updatePayload.date_text = normalizeDateKey(primaryDate);
          }

          const { error: updateError } = await supabaseServer
            .from("events")
            .update(updatePayload)
            .eq("id", matchedEvent.id);

          if (updateError) {
            results.errors.push({
              ...entry,
              matchedEvent: matchedEvent.name || undefined,
              matchedEventId: matchedEvent.id,
              error: updateError.message,
            });
            continue;
          }

          await ensureSessions(supabaseServer, matchedEvent.id, item.parsed);
          const assignmentResult = await syncRosterAssignments(
            supabaseServer,
            matchedEvent.id,
            item.parsed,
            [...(spDirectory || [])] as SPDirectoryRow[]
          );

          results.updated.push({
            ...entry,
            matchedEvent: matchedEvent.name || undefined,
            matchedEventId: matchedEvent.id,
            spMatched: assignmentResult.spMatched,
            spAssignmentsCreated: assignmentResult.spAssignmentsCreated,
            duplicatesAvoided: assignmentResult.duplicatesAvoided,
            unmatchedSpRows: assignmentResult.unmatchedSpRows,
          });
        }
      } catch (error) {
        results.errors.push({
          file: file.name,
          sheet: "",
          detectorMatched: "sp_event_info",
          extractedTitle: "",
          extractedDates: [],
          fieldsFound: [],
          spFound: 0,
          simStaffCount: 0,
          staffExtracted: null,
          error: error instanceof Error ? error.message : "Could not process workbook.",
        });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import workbooks." },
      { status: 500 }
    );
  }
}
