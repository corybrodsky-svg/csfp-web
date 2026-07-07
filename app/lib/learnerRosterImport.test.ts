import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import {
  LEARNER_ROSTER_TEMPLATE_HEADERS,
  LEARNER_ROSTER_TEMPLATE_SHEET_NAME,
  buildLearnerRosterReplacementMetadata,
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

describe("learner roster import", () => {
  it("reads valid learner rows beyond a stale XLSX worksheet range", () => {
    const rows = [
      [...LEARNER_ROSTER_TEMPLATE_HEADERS],
      ...Array.from({ length: 32 }, (_, index) => [
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
