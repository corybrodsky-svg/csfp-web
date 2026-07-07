import { describe, expect, it } from "vitest";

import {
  getSchedulePreviewCaseDisplayText,
  getSchedulePreviewLearnerDisplayText,
  shouldShowManualLearnerEntry,
} from "./scheduleCommandCenterUx";

describe("schedule command center UX helpers", () => {
  it("collapses manual learner entry by default when an imported roster exists", () => {
    expect(shouldShowManualLearnerEntry({ hasImportedLearnerRoster: true, manuallyOpened: false })).toBe(false);
    expect(shouldShowManualLearnerEntry({ hasImportedLearnerRoster: true, manuallyOpened: true })).toBe(true);
    expect(shouldShowManualLearnerEntry({ hasImportedLearnerRoster: false, manuallyOpened: false })).toBe(true);
  });

  it("shows saved or derived learner assignments instead of a false unassigned message", () => {
    expect(
      getSchedulePreviewLearnerDisplayText([], {
        learnerRosterImported: true,
        fallbackLearnerLabels: ["Alex Smith", "Jordan Lee"],
      })
    ).toBe("Alex Smith, Jordan Lee");
  });

  it("keeps boolean schedule flags out of the case label", () => {
    expect(getSchedulePreviewCaseDisplayText("yes", "Neurologic Assessment")).toBe("Neurologic Assessment");
    expect(getSchedulePreviewCaseDisplayText("Stroke Warning Signs", "Neurologic Assessment")).toBe("Stroke Warning Signs");
  });
});
