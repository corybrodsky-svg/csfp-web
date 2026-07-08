import { describe, expect, it } from "vitest";
import {
  SP_PORTAL_RESPONSE_ACTIONS,
  buildSpPortalReleaseState,
  buildSpPortalAdminReadinessSummary,
  buildSpPortalCommandCenterState,
  buildSpPortalReadinessChecklist,
  filterSpPortalAssignmentsForIdentity,
  getSpPortalAssignmentNextAction,
  getSpPortalPendingDetailLabels,
  getSpPortalReleasedDetailLabels,
  getSpPortalResponseDisplay,
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

  it("maps release gates to SP-facing visible, hidden, and needs-source states", () => {
    const release = buildSpPortalReleaseState({
      eventBasics: true,
      schedule: { checked: true, hasSourceInfo: false },
      training: { checked: true, hasSourceInfo: true },
      materials: false,
    });

    expect(release.eventBasics.released).toBe(true);
    expect(release.schedule.status).toBe("needs_source");
    expect(release.schedule.released).toBe(false);
    expect(release.schedule.statusLabel).toBe("Needs info before release");
    expect(release.training.released).toBe(true);
    expect(release.materials.spMessage).toBe("Training materials not released yet.");
    expect(getSpPortalReleasedDetailLabels(release)).toContain("Event basics");
    expect(getSpPortalReleasedDetailLabels(release)).toContain("Training details");
    expect(getSpPortalPendingDetailLabels(release)).toContain("Schedule preview");
    expect(getSpPortalPendingDetailLabels(release)).not.toContain("Event basics");
  });

  it("keeps response labels actionable only when a response is still needed", () => {
    expect(getSpPortalResponseDisplay(null)).toMatchObject({
      key: "awaiting_response",
      label: "Awaiting response",
      actionable: true,
    });
    expect(getSpPortalResponseDisplay("accepted")).toMatchObject({
      key: "accepted",
      label: "Accepted - awaiting confirmation",
      actionable: false,
    });
    expect(getSpPortalResponseDisplay("declined")).toMatchObject({
      key: "declined",
      label: "Declined",
      actionable: false,
    });
  });

  it("builds SP-facing readiness checklist states from release gates", () => {
    const checklist = buildSpPortalReadinessChecklist({
      eventBasics: true,
      schedule: { checked: true, hasSourceInfo: true },
      roleCase: { checked: true, hasSourceInfo: false },
      virtualAccess: { checked: false, hasSourceInfo: false },
    });

    expect(checklist.find((item) => item.key === "eventBasics")).toMatchObject({
      status: "available",
      statusLabel: "Available",
    });
    expect(checklist.find((item) => item.key === "schedule")).toMatchObject({
      status: "available",
      statusLabel: "Available",
    });
    expect(checklist.find((item) => item.key === "roleCase")).toMatchObject({
      status: "not_released",
      statusLabel: "Not released yet",
    });
    expect(checklist.find((item) => item.key === "virtualAccess")).toMatchObject({
      status: "not_needed",
      statusLabel: "Not needed",
    });
  });

  it("returns clear next actions for awaiting, accepted, declined, and confirmed work", () => {
    expect(getSpPortalAssignmentNextAction({ responseStatus: null })).toMatchObject({
      label: "Awaiting response",
      tone: "waiting",
    });
    expect(getSpPortalAssignmentNextAction({ responseStatus: "accepted" })).toMatchObject({
      label: "Accepted - awaiting confirmation",
      tone: "neutral",
    });
    expect(getSpPortalAssignmentNextAction({ responseStatus: "declined" })).toMatchObject({
      label: "Declined - no active assignment",
      tone: "neutral",
    });
    expect(getSpPortalAssignmentNextAction({
      assignmentStatus: "confirmed",
      pendingAcknowledgmentCount: 2,
    })).toMatchObject({
      label: "Acknowledge released details",
      tone: "waiting",
    });
    expect(getSpPortalAssignmentNextAction({
      assignmentStatus: "confirmed",
      readinessItems: buildSpPortalReadinessChecklist({ eventBasics: true, schedule: true, training: true }),
    })).toMatchObject({
      label: "Confirmed - no response needed",
      tone: "waiting",
    });
  });

  it("summarizes admin SP portal readiness counts and next action", () => {
    const summary = buildSpPortalAdminReadinessSummary(
      [
        { responseStatus: "accepted", confirmed: true, portalLinked: true, acknowledged: true },
        { responseStatus: "", portalLinked: false },
        { responseStatus: "declined", portalLinked: true },
      ],
      { hiddenReleaseGates: 2, sourceBlockedReleaseGates: 1 }
    );

    expect(summary).toMatchObject({
      totalAssigned: 3,
      accepted: 1,
      awaitingResponse: 1,
      declined: 1,
      portalLinked: 2,
      profileAttention: 1,
      acknowledged: 1,
      hiddenReleaseGates: 2,
      sourceBlockedReleaseGates: 1,
      blockerCount: 4,
      nextAction: "Resolve SP portal account links before relying on portal readiness.",
    });
  });

  it("filters assignments to the resolved linked SP identity", () => {
    const rows = [
      { id: "assignment-1", sp_id: "sp-linked" },
      { id: "assignment-2", sp_id: "sp-other" },
      { id: "assignment-3", spId: "sp-linked" },
      { id: "assignment-4" },
    ];

    expect(filterSpPortalAssignmentsForIdentity(rows, "sp-linked").map((row) => row.id)).toEqual([
      "assignment-1",
      "assignment-3",
    ]);
    expect(filterSpPortalAssignmentsForIdentity(rows, "")).toEqual([]);
  });

  it("shows the organization switcher only for multi-org SPs", () => {
    expect(shouldShowSpPortalOrgSwitcher(1)).toBe(false);
    expect(shouldShowSpPortalOrgSwitcher(2)).toBe(true);
  });
});
