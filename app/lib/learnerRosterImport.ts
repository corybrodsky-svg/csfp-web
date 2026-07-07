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

function getWorksheetUsedRange(sheet: XLSX.WorkSheet) {
  let minRow = Number.POSITIVE_INFINITY;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  let maxColumn = -1;

  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    if (!getCellDisplayValue(sheet[address])) continue;

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
  if (resolvedHeaderIndex < 0) return [] as Record<string, unknown>[];

  const headerRow = rows[resolvedHeaderIndex] || [];
  const headers = headerRow.map((cell) => asText(cell));
  return rows
    .slice(resolvedHeaderIndex + 1)
    .filter((row) => Array.isArray(row) && rowHasAnyValue(row))
    .map((row) => {
      const record: Record<string, unknown> = {};
      const columnCount = Math.max(headers.length, row.length);
      for (let index = 0; index < columnCount; index += 1) {
        const header = headers[index];
        if (!header) continue;
        record[header] = row[index] ?? "";
      }
      return record;
    });
}

function parseCfspLearnerRosterProfileRows(objectRows: Record<string, unknown>[]) {
  if (!objectRows.length) return null;
  const availableHeaders = new Set(Object.keys(objectRows[0] || {}).map((key) => normalizeRosterUploadHeader(key)));
  const hasCfspRequiredHeaders = availableHeaders.has("first name") && availableHeaders.has("last name");
  if (!hasCfspRequiredHeaders) return null;

  const profiles = objectRows
    .map((row, rowIndex) => {
      const hasAnyValue = LEARNER_ROSTER_TEMPLATE_HEADERS.some((header) => getRosterUploadCellByHeader(row, header));
      if (!hasAnyValue) return null;

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
        throw new Error(`Row ${rowIndex + 2} is missing First Name or Last Name.`);
      }

      return profile;
    })
    .filter((profile): profile is LearnerRosterProfile => Boolean(profile));

  return profiles;
}

export function parseLearnerRosterFromWorkbook(workbook: XLSX.WorkBook) {
  const firstSheetName = workbook.SheetNames.includes(LEARNER_ROSTER_TEMPLATE_SHEET_NAME)
    ? LEARNER_ROSTER_TEMPLATE_SHEET_NAME
    : workbook.SheetNames[0];
  if (!firstSheetName) return [] as string[];

  const sheet = workbook.Sheets[firstSheetName];
  const objectRows = getLearnerRosterObjectRowsFromWorksheet(sheet);
  const cfspProfiles = parseCfspLearnerRosterProfileRows(objectRows);
  if (cfspProfiles) return cfspProfiles.map(getLearnerRosterDisplayName).filter(Boolean);

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
  const sheetName = workbook.SheetNames.includes(LEARNER_ROSTER_TEMPLATE_SHEET_NAME)
    ? LEARNER_ROSTER_TEMPLATE_SHEET_NAME
    : workbook.SheetNames[0];
  if (!sheetName) return [] as LearnerRosterProfile[];

  const sheet = workbook.Sheets[sheetName];
  const objectRows = getLearnerRosterObjectRowsFromWorksheet(sheet);
  const cfspProfiles = parseCfspLearnerRosterProfileRows(objectRows);
  if (cfspProfiles) return cfspProfiles;
  return buildLearnerRosterProfilesFromNames(parseLearnerRosterFromWorkbook(workbook));
}

export async function parseLearnerRosterUploadFile(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  return parseLearnerRosterProfilesFromWorkbook(workbook);
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
