import * as XLSX from "xlsx";

import { normalizeDisplayText, normalizeLearnerName, normalizeLearnerNames } from "./learnerNames";
import type { TrainingEventMetadata } from "./trainingEventNotes";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export const LEARNER_ROSTER_TEMPLATE_SHEET_NAME = "Students";
export const LEARNER_ROSTER_TEMPLATE_FILENAME = "CFSP Student Roster Template.xlsx";
export const LEARNER_ROSTER_TEMPLATE_HEADERS = [
  "First Name",
  "Last Name",
  "Preferred Name",
  "Student ID",
  "Email",
  "Cohort",
  "Group",
  "Enrollment",
  "Graduation",
  "Campus",
  "Student Category",
] as const;

export type LearnerRosterProfile = {
  firstName: string;
  lastName: string;
  preferredName: string;
  studentId: string;
  email: string;
  cohort: string;
  group: string;
  enrollment: string;
  graduation: string;
  campus: string;
  studentCategory: string;
};

export type LearnerRosterSkippedRowDiagnostic = {
  rowNumber: number;
  reason: string;
  values: string[];
};

export type LearnerRosterImportDiagnostics = {
  parserVersion: string;
  uploadedFilename: string;
  worksheetNames: string[];
  selectedWorksheetName: string;
  declaredRange: string;
  detectedUsedRange: string;
  detectedUsedRowCount: number;
  objectRowCount: number;
  parsedLearnerRowCount: number;
  savedLearnerRowCount: number;
  skippedRowCount: number;
  skippedRows: LearnerRosterSkippedRowDiagnostic[];
};

type LearnerRosterObjectRow = Record<string, unknown> & {
  __rowNumber?: number;
  __values?: string[];
};

type LearnerRosterProfileParseResult = {
  profiles: LearnerRosterProfile[];
  skippedRows: LearnerRosterSkippedRowDiagnostic[];
};

type LearnerRosterWorkbookParseResult = {
  profiles: LearnerRosterProfile[];
  diagnostics: LearnerRosterImportDiagnostics;
};

const LEARNER_ROSTER_IMPORT_PARSER_VERSION = "xlsx-cell-scan-v2";

export function getLearnerRosterDisplayName(profile: Partial<LearnerRosterProfile>) {
  const preferredName = normalizeLearnerName(profile.preferredName);
  if (preferredName) return preferredName;
  return normalizeLearnerName([profile.firstName, profile.lastName].filter(Boolean).join(" "));
}

export function normalizeLearnerRosterProfile(value: Partial<LearnerRosterProfile>) {
  const normalizeRosterName = (name: unknown) => {
    const text = asText(name);
    const trimmed = normalizeLearnerName(text);
    const bracketedMatch = trimmed.match(/^\s*<\s*(.*?)\s*>\s*$/);
    return normalizeLearnerName(bracketedMatch ? bracketedMatch[1] : text);
  };
  const firstNameFromUpload = asText(value.firstName);
  const lastNameFromUpload = asText(value.lastName);
  const firstName = normalizeRosterName(firstNameFromUpload);
  const lastName = normalizeRosterName(lastNameFromUpload);
  const firstNameWasBracketed = /^\s*<[^<>]*>\s*$/.test(firstNameFromUpload);
  const lastNameWasBracketed = /^\s*<[^<>]*>\s*$/.test(lastNameFromUpload);

  const normalizedFirstName =
    lastNameWasBracketed && !firstNameWasBracketed && firstName && lastName ? lastName : firstName;
  const normalizedLastName =
    lastNameWasBracketed && !firstNameWasBracketed && firstName && lastName ? firstName : lastName;

  return {
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    preferredName: normalizeRosterName(value.preferredName),
    studentId: asText(value.studentId),
    email: asText(value.email).toLowerCase(),
    cohort: asText(value.cohort),
    group: asText(value.group),
    enrollment: asText(value.enrollment),
    graduation: asText(value.graduation),
    campus: asText(value.campus),
    studentCategory: asText(value.studentCategory),
  } satisfies LearnerRosterProfile;
}

export function serializeScheduleLearnerRosterMetadata(learners: string[]) {
  return encodeURIComponent(JSON.stringify(normalizeLearnerNames(learners)));
}

export function serializeLearnerRosterProfilesMetadata(profiles: LearnerRosterProfile[]) {
  return encodeURIComponent(JSON.stringify(profiles.map(normalizeLearnerRosterProfile)));
}

export function parseLearnerRosterProfilesMetadata(value: unknown) {
  const text = asText(value);
  if (!text) return [] as LearnerRosterProfile[];

  const candidates = [text];
  try {
    candidates.unshift(decodeURIComponent(text));
  } catch {
    // Legacy metadata may already be plain JSON.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed)) continue;
      return parsed
        .map((item) => normalizeLearnerRosterProfile((item || {}) as Partial<LearnerRosterProfile>))
        .filter((profile) => profile.firstName || profile.lastName || getLearnerRosterDisplayName(profile));
    } catch {
      // Fall through to the next candidate.
    }
  }

  return [];
}

function getEmbeddedLearnerEmail(value: string) {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function getLearnerNameWithoutEmbeddedEmail(value: string) {
  const email = getEmbeddedLearnerEmail(value);
  if (!email) return normalizeLearnerName(value);
  return normalizeLearnerName(value.replace(email, "").replace(/[<>()]/g, " "));
}

export function buildLearnerRosterProfilesFromNames(names: string[]) {
  return normalizeLearnerNames(names).map((name) => {
    const cleanName = getLearnerNameWithoutEmbeddedEmail(name);
    const email = getEmbeddedLearnerEmail(name);
    const parts = cleanName.split(/\s+/).filter(Boolean);
    const firstName = parts.shift() || cleanName;
    const lastName = parts.join(" ");
    return normalizeLearnerRosterProfile({
      firstName,
      lastName,
      email,
    });
  });
}

function normalizeRosterUploadHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getFirstNonEmptyRosterUploadCell(row: unknown[]) {
  for (const cell of row) {
    const text = normalizeLearnerName(cell);
    if (text) return text;
  }
  return "";
}

function getRosterUploadCell(row: Record<string, unknown>, candidates: string[]) {
  const sourceKey = Object.keys(row).find((key) => candidates.includes(normalizeRosterUploadHeader(key)));
  return sourceKey ? asText(row[sourceKey]) : "";
}

function getRosterUploadCellByHeader(row: Record<string, unknown>, header: string) {
  const normalizedHeader = normalizeRosterUploadHeader(header);
  const candidates = normalizedHeader === "preferred name" ? [normalizedHeader, "preferred"] : [normalizedHeader];
  return getRosterUploadCell(row, candidates);
}

function formatRosterUploadLearner(name: unknown, email: unknown) {
  const normalizedName = normalizeLearnerName(name);
  const normalizedEmail = asText(email).toLowerCase();
  if (!normalizedName && !normalizedEmail) return "";
  if (normalizedEmail && normalizedName && !normalizedName.toLowerCase().includes(normalizedEmail)) {
    return `${normalizedName} <${normalizedEmail}>`;
  }
  return normalizedName || normalizedEmail;
}

function getCellDisplayValue(cell: XLSX.CellObject | undefined) {
  if (!cell) return "";
  return normalizeDisplayText(cell.v ?? cell.w ?? cell.f ?? "");
}

function getWorksheetCellEntries(sheet: XLSX.WorkSheet) {
  if (Array.isArray(sheet)) {
    const entries: Array<{ address: string; cell: XLSX.CellObject | undefined }> = [];
    sheet.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;
      row.forEach((cell, columnIndex) => {
        entries.push({
          address: XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex }),
          cell,
        });
      });
    });
    return entries;
  }

  return Object.keys(sheet)
    .filter((address) => !address.startsWith("!"))
    .map((address) => ({ address, cell: sheet[address] as XLSX.CellObject | undefined }));
}

function getWorksheetUsedRange(sheet: XLSX.WorkSheet) {
  let minRow = Number.POSITIVE_INFINITY;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  let maxColumn = -1;

  for (const { address, cell } of getWorksheetCellEntries(sheet)) {
    if (!getCellDisplayValue(cell)) continue;
    try {
      const decoded = XLSX.utils.decode_cell(address);
      minRow = Math.min(minRow, decoded.r);
      minColumn = Math.min(minColumn, decoded.c);
      maxRow = Math.max(maxRow, decoded.r);
      maxColumn = Math.max(maxColumn, decoded.c);
    } catch {
      // Ignore non-cell worksheet keys.
    }
  }

  if (maxRow < 0 || maxColumn < 0) return "";

  return XLSX.utils.encode_range({
    s: { r: minRow, c: minColumn },
    e: { r: maxRow, c: maxColumn },
  });
}

function getWorksheetRows(sheet: XLSX.WorkSheet) {
  const range = getWorksheetUsedRange(sheet) || sheet["!ref"];
  if (!range) return [] as unknown[][];

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    range,
  });
}

function rowHasAnyValue(row: unknown[]) {
  return row.some((cell) => Boolean(normalizeLearnerName(cell)));
}

function getNonEmptyWorksheetRowCount(rows: unknown[][]) {
  return rows.filter((row) => Array.isArray(row) && rowHasAnyValue(row)).length;
}

function getRosterHeaderScore(row: unknown[]) {
  const headers = new Set(row.map((cell) => normalizeRosterUploadHeader(asText(cell))).filter(Boolean));
  if (headers.has("first name") && headers.has("last name")) return 100;
  if (
    ["student name", "learner name", "participant name", "full name", "name", "student", "learner", "participant"].some(
      (header) => headers.has(header)
    )
  ) {
    return 50;
  }
  return rowHasAnyValue(row) ? 1 : 0;
}

function getLearnerRosterObjectRowsFromWorksheet(sheet: XLSX.WorkSheet) {
  const rows = getWorksheetRows(sheet);
  const headerIndex = rows.findIndex((row) => Array.isArray(row) && getRosterHeaderScore(row) >= 50);
  const resolvedHeaderIndex =
    headerIndex >= 0 ? headerIndex : rows.findIndex((row) => Array.isArray(row) && rowHasAnyValue(row));
  if (resolvedHeaderIndex < 0) return [] as LearnerRosterObjectRow[];

  const headerRow = rows[resolvedHeaderIndex] || [];
  const headers = headerRow.map((cell) => asText(cell));
  return rows
    .slice(resolvedHeaderIndex + 1)
    .map((row, rowOffset) => ({ row, rowNumber: resolvedHeaderIndex + rowOffset + 2 }))
    .filter(({ row }) => Array.isArray(row) && rowHasAnyValue(row))
    .map(({ row, rowNumber }) => {
      const record: LearnerRosterObjectRow = {
        __rowNumber: rowNumber,
        __values: row.map((cell) => asText(cell)).filter(Boolean),
      };
      const columnCount = Math.max(headers.length, row.length);
      for (let index = 0; index < columnCount; index += 1) {
        const header = headers[index];
        if (!header) continue;
        record[header] = row[index] ?? "";
      }
      return record;
    });
}

function buildSkippedRowDiagnostic(
  row: LearnerRosterObjectRow,
  fallbackRowNumber: number,
  reason: string
) {
  return {
    rowNumber: row.__rowNumber || fallbackRowNumber,
    reason,
    values: row.__values || Object.values(row).map((value) => asText(value)).filter(Boolean),
  } satisfies LearnerRosterSkippedRowDiagnostic;
}

function parseCfspLearnerRosterProfileRows(objectRows: LearnerRosterObjectRow[]) {
  if (!objectRows.length) return null;
  const availableHeaders = new Set(Object.keys(objectRows[0] || {}).map((key) => normalizeRosterUploadHeader(key)));
  const hasCfspRequiredHeaders = availableHeaders.has("first name") && availableHeaders.has("last name");
  if (!hasCfspRequiredHeaders) return null;

  const skippedRows: LearnerRosterSkippedRowDiagnostic[] = [];
  const profiles = objectRows
    .map((row, rowIndex) => {
      const rowNumber = row.__rowNumber || rowIndex + 2;
      const hasAnyValue = LEARNER_ROSTER_TEMPLATE_HEADERS.some((header) => getRosterUploadCellByHeader(row, header));
      if (!hasAnyValue) {
        skippedRows.push(buildSkippedRowDiagnostic(row, rowNumber, "No learner fields matched the roster template headers."));
        return null;
      }

      const profile = normalizeLearnerRosterProfile({
        firstName: getRosterUploadCellByHeader(row, "First Name"),
        lastName: getRosterUploadCellByHeader(row, "Last Name"),
        preferredName: getRosterUploadCellByHeader(row, "Preferred Name"),
        studentId: getRosterUploadCellByHeader(row, "Student ID"),
        email: getRosterUploadCellByHeader(row, "Email"),
        cohort: getRosterUploadCellByHeader(row, "Cohort"),
        group: getRosterUploadCellByHeader(row, "Group"),
        enrollment: getRosterUploadCellByHeader(row, "Enrollment"),
        graduation: getRosterUploadCellByHeader(row, "Graduation"),
        campus: getRosterUploadCellByHeader(row, "Campus"),
        studentCategory: getRosterUploadCellByHeader(row, "Student Category"),
      });

      if (!profile.firstName || !profile.lastName) {
        skippedRows.push(buildSkippedRowDiagnostic(row, rowNumber, "Missing First Name or Last Name."));
        return null;
      }

      return profile;
    })
    .filter((profile): profile is LearnerRosterProfile => Boolean(profile));

  return { profiles, skippedRows } satisfies LearnerRosterProfileParseResult;
}

export function parseLearnerRosterFromWorkbook(workbook: XLSX.WorkBook) {
  const firstSheetName = workbook.SheetNames.includes(LEARNER_ROSTER_TEMPLATE_SHEET_NAME)
    ? LEARNER_ROSTER_TEMPLATE_SHEET_NAME
    : workbook.SheetNames[0];
  if (!firstSheetName) return [] as string[];

  const sheet = workbook.Sheets[firstSheetName];
  const objectRows = getLearnerRosterObjectRowsFromWorksheet(sheet);
  const cfspProfiles = parseCfspLearnerRosterProfileRows(objectRows);
  if (cfspProfiles) return cfspProfiles.profiles.map(getLearnerRosterDisplayName).filter(Boolean);

  const nameHeaders = [
    "student name",
    "learner name",
    "participant name",
    "full name",
    "name",
    "student",
    "learner",
    "participant",
  ];
  const emailHeaders = ["email address", "student email", "learner email", "participant email", "email"];

  if (objectRows.length) {
    const rows = objectRows
      .map((row) => formatRosterUploadLearner(getRosterUploadCell(row, nameHeaders), getRosterUploadCell(row, emailHeaders)))
      .filter(Boolean);
    if (rows.length) return Array.from(new Set(rows));
  }

  const rows = getWorksheetRows(sheet);
  const rawLearners = rows
    .map((row) => {
      if (!Array.isArray(row)) return "";
      const first = getFirstNonEmptyRosterUploadCell(row);
      const email = row.map((cell) => asText(cell)).find((cell) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(cell));
      return formatRosterUploadLearner(first, email || "");
    })
    .filter(Boolean);
  const [firstLearner, ...restLearners] = rawLearners;
  const skipHeader =
    restLearners.length > 0 && /\b(name|learner|student|participant|email|group|cohort|notes)\b/i.test(firstLearner);

  return Array.from(new Set(skipHeader ? restLearners : rawLearners));
}

export function parseLearnerRosterProfilesFromWorkbook(workbook: XLSX.WorkBook) {
  return parseLearnerRosterProfilesFromWorkbookWithDiagnostics(workbook).profiles;
}

export function parseLearnerRosterProfilesFromWorkbookWithDiagnostics(
  workbook: XLSX.WorkBook,
  uploadedFilename = ""
) {
  const sheetName = workbook.SheetNames.includes(LEARNER_ROSTER_TEMPLATE_SHEET_NAME)
    ? LEARNER_ROSTER_TEMPLATE_SHEET_NAME
    : workbook.SheetNames[0];
  if (!sheetName) {
    return {
      profiles: [] as LearnerRosterProfile[],
      diagnostics: {
        parserVersion: LEARNER_ROSTER_IMPORT_PARSER_VERSION,
        uploadedFilename,
        worksheetNames: workbook.SheetNames,
        selectedWorksheetName: "",
        declaredRange: "",
        detectedUsedRange: "",
        detectedUsedRowCount: 0,
        objectRowCount: 0,
        parsedLearnerRowCount: 0,
        savedLearnerRowCount: 0,
        skippedRowCount: 0,
        skippedRows: [],
      },
    } satisfies LearnerRosterWorkbookParseResult;
  }
  const sheet = workbook.Sheets[sheetName];
  const worksheetRows = getWorksheetRows(sheet);
  const objectRows = getLearnerRosterObjectRowsFromWorksheet(sheet);
  const cfspProfiles = parseCfspLearnerRosterProfileRows(objectRows);
  const profiles = cfspProfiles
    ? cfspProfiles.profiles
    : buildLearnerRosterProfilesFromNames(parseLearnerRosterFromWorkbook(workbook));
  const skippedRows = cfspProfiles?.skippedRows || [];

  return {
    profiles,
    diagnostics: {
      parserVersion: LEARNER_ROSTER_IMPORT_PARSER_VERSION,
      uploadedFilename,
      worksheetNames: workbook.SheetNames,
      selectedWorksheetName: sheetName,
      declaredRange: asText(sheet["!ref"]),
      detectedUsedRange: getWorksheetUsedRange(sheet),
      detectedUsedRowCount: getNonEmptyWorksheetRowCount(worksheetRows),
      objectRowCount: objectRows.length,
      parsedLearnerRowCount: profiles.length,
      savedLearnerRowCount: 0,
      skippedRowCount: skippedRows.length,
      skippedRows: skippedRows.slice(0, 12),
    },
  } satisfies LearnerRosterWorkbookParseResult;
}

export function parseLearnerRosterWorkbookBuffer(buffer: ArrayBuffer | Uint8Array, uploadedFilename = "") {
  const workbook = XLSX.read(buffer, {
    type: "array",
    sheetStubs: true,
    cellText: true,
  });
  return parseLearnerRosterProfilesFromWorkbookWithDiagnostics(workbook, uploadedFilename);
}

export async function parseLearnerRosterUploadFile(file: File) {
  return (await parseLearnerRosterUploadFileWithDiagnostics(file)).profiles;
}

export async function parseLearnerRosterUploadFileWithDiagnostics(file: File) {
  const buffer = await file.arrayBuffer();
  return parseLearnerRosterWorkbookBuffer(buffer, file.name);
}

export function buildLearnerRosterReplacementMetadata(
  profiles: LearnerRosterProfile[],
  fileName: string,
  importedAt: string
) {
  const roster = profiles.map(getLearnerRosterDisplayName).filter(Boolean);
  const metadata: Partial<TrainingEventMetadata> = {
    schedule_learner_roster: serializeScheduleLearnerRosterMetadata(roster),
    schedule_learner_profiles: serializeLearnerRosterProfilesMetadata(profiles),
    student_roster_file_name: fileName,
    student_roster_uploaded_at: importedAt,
  };

  return { roster, metadata };
}

export function withSavedLearnerRosterCount(
  diagnostics: LearnerRosterImportDiagnostics,
  savedLearnerRowCount: number
) {
  return {
    ...diagnostics,
    savedLearnerRowCount,
  } satisfies LearnerRosterImportDiagnostics;
}
