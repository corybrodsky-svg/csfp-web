import { describe, expect, it } from "vitest";

import {
  buildStaffingAssignmentRemovalPayload,
  getAssignmentsStillPresentAfterRemoval,
  getBulkAssignmentRemovalOutcome,
  normalizeAssignmentIds,
} from "./staffingAssignmentRemoval";

describe("normalizeAssignmentIds", () => {
  it("removes blank ids and duplicates before bulk removal", () => {
    expect(normalizeAssignmentIds(["a-1", "", null, "a-1", " a-2 "])).toEqual(["a-1", "a-2"]);
  });
});

describe("buildStaffingAssignmentRemovalPayload", () => {
  it("builds the event assignment DELETE payload from the assignment id", () => {
    expect(buildStaffingAssignmentRemovalPayload(" assignment-1 ")).toEqual({
      assignment_id: "assignment-1",
    });
  });

  it("adds the history delete flag only when requested", () => {
    expect(buildStaffingAssignmentRemovalPayload("assignment-1", { deleteHistory: true })).toEqual({
      assignment_id: "assignment-1",
      delete_history: true,
    });
  });

  it("rejects missing assignment ids before a DELETE request can be fired", () => {
    expect(() => buildStaffingAssignmentRemovalPayload(null)).toThrow("Missing assignment id for removal.");
  });
});

describe("getBulkAssignmentRemovalOutcome", () => {
  it("keeps successful and failed assignment ids separate", () => {
    const outcome = getBulkAssignmentRemovalOutcome(["a-1", "a-2", "a-3"], [
      { status: "fulfilled", value: { ok: true } },
      { status: "rejected", reason: new Error("No matching assignment") },
      { status: "fulfilled", value: { ok: true } },
    ]);

    expect(outcome.successfulAssignmentIds).toEqual(["a-1", "a-3"]);
    expect(outcome.failures).toEqual([{ assignmentId: "a-2", reason: "No matching assignment" }]);
  });
});

describe("getAssignmentsStillPresentAfterRemoval", () => {
  it("detects server success that did not actually remove refreshed rows", () => {
    expect(getAssignmentsStillPresentAfterRemoval(["a-1", "a-2", "a-3"], ["a-2", "a-4"])).toEqual(["a-2"]);
  });
});
