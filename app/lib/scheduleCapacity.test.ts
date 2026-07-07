import { describe, expect, it } from "vitest";
import {
  calculateScheduleCapacity,
  getScheduleCapacityConflictMessage,
  getScheduleCapacitySuggestedActions,
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

  it("respects configured students per room when deriving rounds and learner slots", () => {
    const capacity = calculateScheduleCapacity({
      learnerCount: 32,
      roomCount: 4,
      learnersPerRoom: 2,
      startTime: "08:00",
      endTime: "12:00",
      encounterMinutes: 25,
      feedbackMinutes: 5,
      transitionMinutes: 0,
      prebriefMinutes: 0,
    });

    expect(capacity.learnerSlotsPerRound).toBe(8);
    expect(capacity.requiredRounds).toBe(4);
    expect(capacity.availableLearnerSlots).toBe(64);
    expect(capacity.unscheduledLearners).toBe(0);
    expect(capacity.hasConflict).toBe(false);
  });

  it("returns actionable suggestions for capacity conflicts", () => {
    const capacity = calculateScheduleCapacity({
      learnerCount: 32,
      roomCount: 4,
      learnersPerRoom: 1,
      startTime: "08:00",
      endTime: "12:00",
      encounterMinutes: 25,
      feedbackMinutes: 5,
      transitionMinutes: 5,
      prebriefMinutes: 20,
    });

    expect(getScheduleCapacitySuggestedActions(capacity).map((action) => action.label)).toEqual([
      "Extend end time to 1:00 PM",
      "Adjust students per room",
      "Regenerate schedule from Event Settings",
      "Review timing settings",
    ]);
  });
});
