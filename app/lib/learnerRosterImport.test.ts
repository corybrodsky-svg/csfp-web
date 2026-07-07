import * as XLSX from "xlsx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  APPLE_NUMBERS_UNSUPPORTED_MESSAGE,
  LEARNER_ROSTER_TEMPLATE_HEADERS,
  LEARNER_ROSTER_TEMPLATE_SHEET_NAME,
  buildLearnerRosterTemplateCsv,
  buildLearnerRosterTemplateWorkbook,
  buildLearnerRosterReplacementMetadata,
  parseLearnerRosterUploadFileWithDiagnostics,
  parseLearnerRosterWorkbookBuffer,
  parseLearnerRosterProfilesFromWorkbook,
  type LearnerRosterProfile,
} from "./learnerRosterImport";

function buildRosterProfiles(count: number, prefix: string): LearnerRosterProfile[] {
  return Array.from({ length: count }, (_, index) => ({
    firstName: prefix,
    lastName: `Learner ${index + 1}`,
    preferredName: "",
    studentId: `${prefix.toLowerCase()}-${index + 1}`,
    email: `${prefix.toLowerCase()}-${index + 1}@example.edu`,
    cohort: "",
    group: "",
    enrollment: "",
    graduation: "",
    campus: "",
    studentCategory: "",
  }));
}

function decodeJsonMetadata(value: string | undefined) {
  return JSON.parse(decodeURIComponent(value || "[]")) as unknown[];
}

function buildRosterRows(count: number) {
  return [
    [...LEARNER_ROSTER_TEMPLATE_HEADERS],
    ...Array.from({ length: count }, (_, index) => [
      `Student${index + 1}`,
      `Last${index + 1}`,
      "",
      `S-${index + 1}`,
      `student${index + 1}@example.edu`,
      "",
      "",
      "",
      "",
      "",
      "",
    ]),
  ];
}

async function buildWorkbookBufferWithStaleWorksheetDimension(rows: unknown[][], staleRange: string) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, LEARNER_ROSTER_TEMPLATE_SHEET_NAME);
  const workbookBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const zip = await JSZip.loadAsync(workbookBuffer);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheetFile = zip.file(sheetPath);
  expect(sheetFile).toBeTruthy();

  const sheetXml = await sheetFile!.async("string");
  const staleSheetXml = sheetXml.replace(/<dimension ref="[^"]+"\/>/, `<dimension ref="${staleRange}"/>`);
  zip.file(sheetPath, staleSheetXml);
  return zip.generateAsync({ type: "uint8array" });
}

describe("learner roster import", () => {
  it("re-uploads the downloaded CSV template after learners are added", () => {
    const csvTemplate = buildLearnerRosterTemplateCsv(buildRosterRows(32).slice(1));

    const result = parseLearnerRosterWorkbookBuffer(new TextEncoder().encode(csvTemplate), "student-roster-template.csv");

    expect(result.profiles).toHaveLength(32);
    expect(result.diagnostics).toMatchObject({
      uploadedFilename: "student-roster-template.csv",
      parsedLearnerRowCount: 32,
      skippedRowCount: 0,
    });
    expect(result.profiles[31]).toMatchObject({
      firstName: "Student32",
      lastName: "Last32",
      email: "student32@example.edu",
    });
  });

  it("re-uploads the downloaded XLSX template after 32 learner rows are added", () => {
    const workbook = buildLearnerRosterTemplateWorkbook();
    XLSX.utils.sheet_add_aoa(workbook.Sheets[LEARNER_ROSTER_TEMPLATE_SHEET_NAME], buildRosterRows(32).slice(1), {
      origin: "A3",
    });
    const workbookBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    const result = parseLearnerRosterWorkbookBuffer(workbookBuffer, "student-roster-template.xlsx");

    expect(result.profiles).toHaveLength(32);
    expect(result.diagnostics).toMatchObject({
      uploadedFilename: "student-roster-template.xlsx",
      selectedWorksheetName: LEARNER_ROSTER_TEMPLATE_SHEET_NAME,
      detectedUsedRange: "A1:K34",
      parsedLearnerRowCount: 32,
      skippedRowCount: 0,
    });
  });

  it("rejects Apple Numbers uploads with an actionable message", async () => {
    const numbersFile = new File(["not a supported roster"], "student-roster.numbers");

    await expect(parseLearnerRosterUploadFileWithDiagnostics(numbersFile)).rejects.toThrow(
      APPLE_NUMBERS_UNSUPPORTED_MESSAGE
    );
  });

  it("reads valid learner rows beyond a stale XLSX worksheet range", () => {
    const rows = buildRosterRows(32);
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: 16, c: LEARNER_ROSTER_TEMPLATE_HEADERS.length - 1 },
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, LEARNER_ROSTER_TEMPLATE_SHEET_NAME);

    const profiles = parseLearnerRosterProfilesFromWorkbook(workbook);

    expect(profiles).toHaveLength(32);
    expect(profiles[31]).toMatchObject({
      firstName: "Student32",
      lastName: "Last32",
      email: "student32@example.edu",
    });
  });

  it("imports all populated XLSX row nodes when the worksheet dimension still says 16 rows", async () => {
    const workbookBuffer = await buildWorkbookBufferWithStaleWorksheetDimension(buildRosterRows(32), "A1:K17");

    const result = parseLearnerRosterWorkbookBuffer(workbookBuffer, "stale-dimension-roster.xlsx");

    expect(result.profiles).toHaveLength(32);
    expect(result.diagnostics).toMatchObject({
      uploadedFilename: "stale-dimension-roster.xlsx",
      selectedWorksheetName: LEARNER_ROSTER_TEMPLATE_SHEET_NAME,
      declaredRange: "A1:K17",
      detectedUsedRange: "A1:K33",
      detectedUsedRowCount: 33,
      parsedLearnerRowCount: 32,
      savedLearnerRowCount: 0,
      skippedRowCount: 0,
    });
    expect(result.profiles[31]).toMatchObject({
      firstName: "Student32",
      lastName: "Last32",
      email: "student32@example.edu",
    });
  });

  it("builds replacement metadata from the new roster without preserving prior active rows", () => {
    const oldProfiles = buildRosterProfiles(16, "Old");
    const newProfiles = buildRosterProfiles(32, "New");
    const oldReplacement = buildLearnerRosterReplacementMetadata(
      oldProfiles,
      "old-roster.xlsx",
      "2026-07-07T10:00:00.000Z"
    );
    const newReplacement = buildLearnerRosterReplacementMetadata(
      newProfiles,
      "new-roster.xlsx",
      "2026-07-07T11:00:00.000Z"
    );

    const oldSavedProfiles = decodeJsonMetadata(oldReplacement.metadata.schedule_learner_profiles);
    const newSavedProfiles = decodeJsonMetadata(newReplacement.metadata.schedule_learner_profiles);
    const newSavedRoster = decodeJsonMetadata(newReplacement.metadata.schedule_learner_roster);

    expect(oldSavedProfiles).toHaveLength(16);
    expect(newSavedProfiles).toHaveLength(32);
    expect(newSavedRoster).toHaveLength(32);
    expect(newReplacement.metadata.student_roster_file_name).toBe("new-roster.xlsx");
    expect(newReplacement.metadata.student_roster_uploaded_at).toBe("2026-07-07T11:00:00.000Z");
    expect(newReplacement.metadata.schedule_learner_count).toBeUndefined();
    expect(JSON.stringify(newSavedProfiles)).not.toContain("Old Learner");
  });
});
