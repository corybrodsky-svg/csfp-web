import { describe, expect, it } from "vitest";
import { allocateEffectiveStaffingRoles } from "./spStaffingRoleAllocation";

describe("allocateEffectiveStaffingRoles", () => {
  it("keeps exactly six selected SPs as primary when the event needs six primary and one backup", () => {
    const assignments = Array.from({ length: 6 }, (_, index) => ({
      id: `assignment-${index + 1}`,
      sp_id: `sp-${index + 1}`,
      created_at: `2026-07-07T12:0${index}:00.000Z`,
    }));

    const allocation = allocateEffectiveStaffingRoles(assignments, {
      primaryTarget: 6,
      backupTarget: 1,
    });

    expect(allocation.primaryAssignments.map((assignment) => assignment.sp_id)).toEqual([
      "sp-1",
      "sp-2",
      "sp-3",
      "sp-4",
      "sp-5",
      "sp-6",
    ]);
    expect(allocation.backupAssignments).toEqual([]);
    expect(allocation.primaryCount).toBe(6);
    expect(allocation.backupCount).toBe(0);
    expect(allocation.primaryShortage).toBe(0);
    expect(allocation.backupShortage).toBe(1);
  });

  it("only assigns backup after the primary target is filled", () => {
    const assignments = Array.from({ length: 7 }, (_, index) => ({
      id: `assignment-${index + 1}`,
      sp_id: `sp-${index + 1}`,
      created_at: `2026-07-07T12:0${index}:00.000Z`,
    }));

    const allocation = allocateEffectiveStaffingRoles(assignments, {
      primaryTarget: 6,
      backupTarget: 1,
    });

    expect(allocation.primaryAssignments).toHaveLength(6);
    expect(allocation.backupAssignments.map((assignment) => assignment.sp_id)).toEqual(["sp-7"]);
    expect(allocation.backupShortage).toBe(0);
  });
});
