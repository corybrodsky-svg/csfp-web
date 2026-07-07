import { describe, expect, it } from "vitest";
import { buildHireConfirmationPendingSelectionSummary } from "./hireConfirmationSelection";

describe("buildHireConfirmationPendingSelectionSummary", () => {
  it("does not infer a backup from target math when six selected SPs are explicit primary assignments", () => {
    const recipients = Array.from({ length: 6 }, (_, index) => ({
      sp: { id: `sp-${index + 1}` },
      email: `sp${index + 1}@example.edu`,
      name: `SP ${index + 1}`,
    }));
    const assignments = recipients.map((recipient) => ({
      sp_id: recipient.sp.id,
      status: "confirmed",
      confirmed: true,
    }));

    const summary = buildHireConfirmationPendingSelectionSummary({
      recipients,
      assignments,
    });

    expect(summary.selectedCount).toBe(6);
    expect(summary.primarySelectionCount).toBe(6);
    expect(summary.backupSelectionCount).toBe(0);
    expect(summary.selected.map((entry) => entry.assignmentType)).toEqual([
      "primary",
      "primary",
      "primary",
      "primary",
      "primary",
      "primary",
    ]);
  });

  it("counts only explicitly backup assignments as backup", () => {
    const summary = buildHireConfirmationPendingSelectionSummary({
      recipients: [
        { sp: { id: "sp-primary" }, email: "primary@example.edu", name: "Primary SP" },
        { sp: { id: "sp-backup" }, email: "backup@example.edu", name: "Backup SP" },
      ],
      assignments: [
        { sp_id: "sp-primary", status: "confirmed", confirmed: true },
        { sp_id: "sp-backup", status: "backup", confirmed: true },
      ],
    });

    expect(summary.primarySelectionCount).toBe(1);
    expect(summary.backupSelectionCount).toBe(1);
    expect(summary.selected).toEqual([
      expect.objectContaining({ spId: "sp-primary", assignmentType: "primary" }),
      expect.objectContaining({ spId: "sp-backup", assignmentType: "backup" }),
    ]);
  });
});
