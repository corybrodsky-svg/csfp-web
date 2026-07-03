import { describe, expect, it } from "vitest";
import { allocateSpCoverage } from "./spCoverageAllocation";

describe("allocateSpCoverage", () => {
  it("prioritizes primary coverage when total confirmed is below the primary target", () => {
    expect(
      allocateSpCoverage({
        primaryTarget: 6,
        backupTarget: 1,
        confirmedWorkingSpCount: 5,
        explicitlyAssignedBackupCount: 1,
      })
    ).toMatchObject({
      effectivePrimaryConfirmed: 5,
      effectiveBackupConfirmed: 0,
      primaryShortage: 1,
      backupShortage: 1,
      totalShortage: 2,
    });
  });

  it("does not count backup coverage until primary coverage is full", () => {
    expect(
      allocateSpCoverage({
        primaryTarget: 6,
        backupTarget: 1,
        confirmedWorkingSpCount: 6,
        explicitlyAssignedBackupCount: 1,
      })
    ).toMatchObject({
      effectivePrimaryConfirmed: 6,
      effectiveBackupConfirmed: 0,
      primaryShortage: 0,
      backupShortage: 1,
      totalShortage: 1,
    });
  });

  it("counts backup coverage after the primary target is satisfied", () => {
    expect(
      allocateSpCoverage({
        primaryTarget: 6,
        backupTarget: 1,
        confirmedWorkingSpCount: 7,
        explicitlyAssignedBackupCount: 1,
      })
    ).toMatchObject({
      effectivePrimaryConfirmed: 6,
      effectiveBackupConfirmed: 1,
      primaryShortage: 0,
      backupShortage: 0,
      totalShortage: 0,
    });
  });
});
