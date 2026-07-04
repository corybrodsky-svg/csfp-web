import { describe, expect, it } from "vitest";
import {
  calculateScheduleCapacity,
  getScheduleCapacityConflictMessage,
} from "./scheduleCapacity";

describe("calculateScheduleCapacity", () => {
  it("prioritizes one learner per room per round and surfaces unscheduled learners", () => {
    const capacity = calculateScheduleCapacity({
      learnerCount: 32,
      roomCount: 4,
      startTime: "08:00",
      endTime: "12:00",
      encounterMinutes: 25,
      feedbackMinutes: 5,
      transitionMinutes: 5,
      prebriefMinutes: 20,
    });

    expect(capacity.requiredRounds).toBe(8);
    expect(capacity.availableRounds).toBe(6);
    expect(capacity.availableLearnerSlots).toBe(24);
    expect(capacity.scheduledLearnerSlots).toBe(24);
    expect(capacity.unscheduledLearners).toBe(8);
    expect(capacity.firstEncounterStartMinutes).toBe(500);
    expect(capacity.requiredEndTime).toBe("1:00 PM");
    expect(getScheduleCapacityConflictMessage(capacity)).toContain("32 learners require 8 rounds");
  });
});
