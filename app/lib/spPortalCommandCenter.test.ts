import { describe, expect, it } from "vitest";
import {
  SP_PORTAL_RESPONSE_ACTIONS,
  buildSpPortalCommandCenterState,
  isConfirmedAssignment,
  shouldShowSpPortalOrgSwitcher,
} from "./spPortalCommandCenter";

const now = new Date("2026-07-07T12:00:00.000Z");

describe("SP Portal Command Center state", () => {
  it("keeps only offers needing a response in Open Shifts", () => {
    const state = buildSpPortalCommandCenterState({
      now,
      assignedEvents: [],
      myResponses: [
        {
          id: "response-1",
          openingId: "opening-accepted",
          response: "accepted",
          event: { id: "event-1", date: "2026-07-30", start_time: "08:00:00", end_time: "10:00:00" },
        },
      ],
      openShifts: [
        { openingId: "opening-new", currentResponse: null },
        { openingId: "opening-accepted", currentResponse: { response: "accepted" } },
        { openingId: "opening-declined", currentResponse: { response: "declined" } },
      ],
    });

    expect(state.openShifts.map((shift) => shift.openingId)).toEqual(["opening-new"]);
    expect(state.counts.openShifts).toBe(1);
  });

  it("moves accepted responses awaiting confirmation into Pending Responses", () => {
    const state = buildSpPortalCommandCenterState({
      now,
      openShifts: [],
      assignedEvents: [],
      myResponses: [
        {
          id: "response-1",
          openingId: "opening-accepted",
          response: "accepted",
          event: { id: "event-1", date: "2026-07-30", start_time: "08:00:00", end_time: "10:00:00" },
        },
      ],
    });

    expect(state.pendingResponses).toHaveLength(1);
    expect(state.counts.pendingResponses).toBe(1);
  });

  it("does not keep declined offers actionable", () => {
    const state = buildSpPortalCommandCenterState({
      now,
      assignedEvents: [],
      openShifts: [{ openingId: "opening-declined", currentResponse: { response: "declined" } }],
      myResponses: [{ id: "response-1", openingId: "opening-declined", response: "declined" }],
    });

    expect(state.openShifts).toHaveLength(0);
    expect(state.declinedResponses).toHaveLength(1);
    expect(state.pastResponses).toHaveLength(1);
  });

  it("counts confirmed assignments when status is confirmed even if the boolean is missing", () => {
    expect(isConfirmedAssignment({ id: "assignment-1", status: "confirmed", confirmed: false })).toBe(true);
    expect(isConfirmedAssignment({ id: "assignment-2", assignment_status: "confirmed_primary", confirmed: false })).toBe(true);

    const state = buildSpPortalCommandCenterState({
      now,
      openShifts: [],
      myResponses: [],
      assignedEvents: [
        {
          id: "assignment-1",
          eventId: "event-1",
          status: "confirmed",
          confirmed: false,
          event: { id: "event-1", date: "2026-07-30", start_time: "08:00:00", end_time: "10:00:00" },
        },
      ],
    });

    expect(state.confirmedAssignments).toHaveLength(1);
    expect(state.counts.confirmedAssignments).toBe(1);
  });

  it("does not render Maybe as an SP portal response action", () => {
    expect(SP_PORTAL_RESPONSE_ACTIONS).toEqual(["accepted", "declined"]);
    expect(SP_PORTAL_RESPONSE_ACTIONS).not.toContain("maybe");
  });

  it("shows the organization switcher only for multi-org SPs", () => {
    expect(shouldShowSpPortalOrgSwitcher(1)).toBe(false);
    expect(shouldShowSpPortalOrgSwitcher(2)).toBe(true);
  });
});
