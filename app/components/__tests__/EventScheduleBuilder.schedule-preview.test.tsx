import { describe, expect, it } from "vitest";
import {
  expandPartialResolvedRounds,
  formatRoundRhythmBreakdown,
  getExpectedSchedulePreviewRoundCount,
  getSchedulePreviewRounds,
  type ScheduleRhythmRound,
} from "../../lib/schedulePreviewGuardrails";

const rhythmRounds: ScheduleRhythmRound[] = Array.from({ length: 4 }, (_, index) => {
  const start = 18 * 60 + 15 + index * 25;
  return {
    round: index + 1,
    start,
    end: start + 25,
    subBlocks: [
      { label: "Encounter", start, end: start + 15, visibleTo: "both" },
      { label: "Feedback", start: start + 15, end: start + 20, visibleTo: "both" },
      { label: "Transition", start: start + 20, end: start + 25, visibleTo: "both" },
    ],
    roomSlots: [
      { roomName: "Exam 1", learnerLabels: [`Learner ${index + 1}A`], assignedSpName: "SP 1", capacity: 1 },
      { roomName: "Exam 2", learnerLabels: [`Learner ${index + 1}B`], assignedSpName: "SP 2", capacity: 1 },
      { roomName: "Exam 3", learnerLabels: [`Learner ${index + 1}C`], assignedSpName: "SP 3", capacity: 1 },
      { roomName: "Exam 4", learnerLabels: [], assignedSpName: "SP 4", capacity: 1 },
    ],
  };
});

const partialResolvedRounds = [
  {
    round: 1,
    sessionDate: "2026-05-20",
    startTime: "18:15",
    endTime: "18:40",
    roomSlots: rhythmRounds[0].roomSlots,
  },
];

describe("schedule preview hydration guardrails", () => {
  it("expands partial saved resolvedRounds instead of rendering only Round 1", () => {
    const rounds = getSchedulePreviewRounds({
      resolvedRounds: partialResolvedRounds,
      scheduleRoundCount: 4,
      roundCount: 4,
      rhythmRounds,
    });

    expect(getExpectedSchedulePreviewRoundCount({ resolvedRounds: partialResolvedRounds, scheduleRoundCount: 4 })).toBe(4);
    expect(rounds.map((round) => round.round)).toEqual([1, 2, 3, 4]);
    expect(rounds).toHaveLength(4);
    expect(rounds).not.toHaveLength(1);

    const firstBreakdown = formatRoundRhythmBreakdown(rhythmRounds[0]);
    expect(firstBreakdown).toContain("Encounter 15m");
    expect(firstBreakdown).toContain("Feedback 5m");
    expect(firstBreakdown).toContain("Transition 5m");
    expect(firstBreakdown).not.toBe("Encounter 25m");
  });

  it("preserves empty rooms and unassigned learner visibility", () => {
    const rounds = expandPartialResolvedRounds({
      resolvedRounds: partialResolvedRounds,
      expectedRoundCount: 4,
      rhythmRounds,
    });
    const roundOneRooms = rounds[0].roomSlots || [];
    const emptyRoom = roundOneRooms.find((slot) => slot.roomName === "Exam 4");

    expect(roundOneRooms).toHaveLength(4);
    expect(emptyRoom).toBeTruthy();
    expect(emptyRoom?.learnerLabels || []).toHaveLength(0);
    expect((emptyRoom?.learnerLabels || []).length ? emptyRoom?.learnerLabels?.join(", ") : "No learner assigned").toBe(
      "No learner assigned"
    );
  });

  it("keeps Student and Admin preview round counts in parity", () => {
    const studentRounds = getSchedulePreviewRounds({
      resolvedRounds: partialResolvedRounds,
      scheduleRoundCount: 4,
      rhythmRounds,
    });
    const adminRounds = getSchedulePreviewRounds({
      resolvedRounds: partialResolvedRounds,
      scheduleRoundCount: 4,
      rhythmRounds,
    });

    expect(studentRounds.map((round) => round.round)).toEqual([1, 2, 3, 4]);
    expect(adminRounds.map((round) => round.round)).toEqual([1, 2, 3, 4]);
    expect(studentRounds).toHaveLength(adminRounds.length);
    expect(formatRoundRhythmBreakdown(rhythmRounds[1])).toBe("Encounter 15m · Feedback 5m · Transition 5m");
  });
});
