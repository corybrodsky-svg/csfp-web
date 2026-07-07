import { describe, expect, it } from "vitest";
import {
  getActionableStaffingWorkflowStatus,
  getCommunicationPollOutreachSummary,
  getEventCommunicationHubState,
  getPollClosedDraftAvailability,
  getReconciledHiringStatusLabel,
} from "./eventCommunicationHub";

describe("getEventCommunicationHubState", () => {
  it("renders the hub for an advanced event with assigned SPs and Hire Confirmation activity even without imported response buckets", () => {
    const state = getEventCommunicationHubState({
      spPollBuilderHiringStarted: false,
      pollResponsesImported: false,
      originalPollOutreachCount: 0,
      recoveredAssignedSpCount: 17,
      recoveredHireConfirmationStarted: true,
      spPollBuilderSavedPollUrl: "",
    });

    expect(state).toEqual({
      hasWorkflow: true,
      recoveredPollBucketsUnavailable: true,
    });
  });

  it("does not render recovered workflow tools when no event-level poll or hiring state exists", () => {
    const state = getEventCommunicationHubState({
      spPollBuilderHiringStarted: false,
      pollResponsesImported: false,
      originalPollOutreachCount: 0,
      recoveredAssignedSpCount: 0,
      recoveredHireConfirmationStarted: false,
      spPollBuilderSavedPollUrl: "",
    });

    expect(state).toEqual({
      hasWorkflow: false,
      recoveredPollBucketsUnavailable: false,
    });
  });

  it("renders normal imported poll workflow without a recovered-state warning", () => {
    const state = getEventCommunicationHubState({
      spPollBuilderHiringStarted: false,
      pollResponsesImported: true,
      originalPollOutreachCount: 35,
      recoveredAssignedSpCount: 17,
      recoveredHireConfirmationStarted: true,
      spPollBuilderSavedPollUrl: "https://forms.office.com/example",
    });

    expect(state).toEqual({
      hasWorkflow: true,
      recoveredPollBucketsUnavailable: false,
    });
  });
});

describe("getCommunicationPollOutreachSummary", () => {
  it("labels saved original poll lists as original source-of-truth data", () => {
    expect(getCommunicationPollOutreachSummary({ quality: "saved", count: 35 })).toEqual({
      label: "Poll Outreach List",
      status: "35 saved",
      hasOriginalPollList: true,
    });
  });

  it("labels assigned-only older event recovery without claiming a full original list", () => {
    expect(getCommunicationPollOutreachSummary({ quality: "recovered", count: 14 })).toEqual({
      label: "Poll Outreach List",
      status: "14 recovered from assigned SPs",
      hasOriginalPollList: false,
    });
  });

  it("labels legacy poll outreach list metadata as legacy", () => {
    expect(getCommunicationPollOutreachSummary({ quality: "legacy", count: 8 })).toEqual({
      label: "Poll Outreach List",
      status: "8 from legacy metadata",
      hasOriginalPollList: true,
    });
  });

  it("uses CFSP recipient wording for CFSP Portal + Email outreach", () => {
    expect(getCommunicationPollOutreachSummary({ quality: "saved", count: 6, mode: "cfsp" })).toEqual({
      label: "CFSP Outreach Recipients",
      status: "6 saved",
      hasOriginalPollList: true,
    });
  });
});

describe("getReconciledHiringStatusLabel", () => {
  it("does not return not-started when assigned SPs prove the workflow advanced", () => {
    expect(
      getReconciledHiringStatusLabel({
        assignedSpCount: 14,
        hireConfirmationStarted: true,
        fallbackStatusLabel: "Not started",
      })
    ).toBe("ASSIGNED/CONFIRMED SPS PRESENT");
  });

  it("prefers Hire Confirmation drafted state before generic fallback", () => {
    expect(
      getReconciledHiringStatusLabel({
        hireConfirmationStatus: "drafted",
        assignedSpCount: 0,
        hireConfirmationStarted: true,
        fallbackStatusLabel: "Not started",
      })
    ).toBe("Hire Confirmation Drafted");
  });

  it("prefers Hire Confirmation sent over drafted", () => {
    expect(
      getReconciledHiringStatusLabel({
        hireConfirmationStatus: "sent",
        assignedSpCount: 1,
        hireConfirmationStarted: true,
        fallbackStatusLabel: "Not started",
      })
    ).toBe("Hire Confirmation Sent");
  });

  it("prefers Hire Confirmation completed over drafted", () => {
    expect(
      getReconciledHiringStatusLabel({
        hireConfirmationStatus: "completed",
        hireConfirmationStatusTimestamp: "2026-06-09 11:45",
        assignedSpCount: 3,
        hireConfirmationStarted: true,
        fallbackStatusLabel: "Needs info",
      })
    ).toBe("Hire Confirmation Completed · 2026-06-09 11:45");
  });

  it("includes hire confirmation sent timestamp when provided", () => {
    expect(
      getReconciledHiringStatusLabel({
        hireConfirmationStatus: "sent",
        hireConfirmationStatusTimestamp: "2026-06-09 11:30",
        assignedSpCount: 0,
        hireConfirmationStarted: true,
        fallbackStatusLabel: "Not started",
      })
    ).toBe("Hire Confirmation Sent · 2026-06-09 11:30");
  });
});

describe("getPollClosedDraftAvailability", () => {
  it("enables draft when non-draftable recipients exist", () => {
    expect(
      getPollClosedDraftAvailability({
        originalPollRecipientCount: 20,
        nonDraftablePollRecipientCount: 7,
        pollOutreachSourceQuality: "saved",
      })
    ).toEqual({ canDraft: true, disabledReason: "" });
  });

  it("shows recovered-list warning when recovered source has no closed recipients", () => {
    expect(
      getPollClosedDraftAvailability({
        originalPollRecipientCount: 0,
        nonDraftablePollRecipientCount: 0,
        pollOutreachSourceQuality: "recovered",
      })
    ).toEqual({
      canDraft: false,
      disabledReason: "Recovered poll outreach list — verify before sending.",
    });
  });

  it("shows saved-list message when all original poll recipients were selected or hired", () => {
    expect(
      getPollClosedDraftAvailability({
        originalPollRecipientCount: 6,
        nonDraftablePollRecipientCount: 0,
        pollOutreachSourceQuality: "legacy",
      })
    ).toEqual({
      canDraft: false,
      disabledReason:
        "All original poll recipients are currently selected or hired; no non-hired SP recipients are available.",
    });
  });

  it("shows explicit unrecoverable-list message when poll outreach source is missing", () => {
    expect(
      getPollClosedDraftAvailability({
        originalPollRecipientCount: 0,
        nonDraftablePollRecipientCount: 0,
        pollOutreachSourceQuality: "missing",
      })
    ).toEqual({
      canDraft: false,
      disabledReason:
        "Poll Closed email cannot be drafted because the original poll list was not saved for this event. Future polls will save this automatically.",
    });
  });
});

describe("getActionableStaffingWorkflowStatus", () => {
  it("shows a green complete state when confirmation is not needed and staffing is complete", () => {
    const status = getActionableStaffingWorkflowStatus({
      staffingRelevant: true,
      primaryRequired: 14,
      primaryConfirmed: 14,
      backupRequired: 0,
      backupConfirmed: 0,
      unconfirmedContactedCount: 0,
      confirmationNeeded: false,
      confirmationStatus: "not_needed",
    });

    expect(status.pillLabel).toBe("STAFFING COMPLETE · NO CONFIRMATION NEEDED");
    expect(status.tone).toBe("complete");
    expect(status.subtext).toBe("SPs are already marked confirmed. No Hire Confirmation email is required.");
  });

  it("prioritizes missing primaries over confirmation-not-needed wording", () => {
    const status = getActionableStaffingWorkflowStatus({
      staffingRelevant: true,
      primaryRequired: 17,
      primaryConfirmed: 14,
      backupRequired: 0,
      backupConfirmed: 0,
      unconfirmedContactedCount: 0,
      confirmationNeeded: false,
      confirmationStatus: "not_needed",
    });

    expect(status.pillLabel).toBe("NEED 3 SPS");
    expect(status.subtext).toContain("Add or confirm 3 remaining SPs.");
    expect(status.pillLabel).not.toContain("CONFIRMATION NOT NEEDED");
  });

  it("prioritizes missing backups after primary staffing is complete", () => {
    const status = getActionableStaffingWorkflowStatus({
      staffingRelevant: true,
      primaryRequired: 14,
      primaryConfirmed: 14,
      backupRequired: 3,
      backupConfirmed: 0,
      unconfirmedContactedCount: 0,
      confirmationNeeded: false,
      confirmationStatus: "not_needed",
    });

    expect(status.pillLabel).toBe("NEED 3 BACKUPS");
    expect(status.nextAction).toBe("Add or confirm backup SPs.");
  });

  it("shows the next confirmation action once staffing counts are met", () => {
    const status = getActionableStaffingWorkflowStatus({
      staffingRelevant: true,
      primaryRequired: 14,
      primaryConfirmed: 14,
      backupRequired: 1,
      backupConfirmed: 1,
      unconfirmedContactedCount: 0,
      confirmationNeeded: true,
      confirmationStatus: "ready_to_draft",
    });

    expect(status.pillLabel).toBe("SEND HIRE CONFIRMATION");
    expect(status.subtext).toBe("SPs are staged for confirmation. Send confirmation by email and portal to officially confirm assignments.");
  });

  it("counts primary and backup coverage separately for staffing status", () => {
    const status = getActionableStaffingWorkflowStatus({
      staffingRelevant: true,
      primaryRequired: 8,
      primaryConfirmed: 8,
      backupRequired: 2,
      backupConfirmed: 2,
      unconfirmedContactedCount: 0,
      confirmationNeeded: false,
      confirmationStatus: "not_needed",
    });

    expect(status.tone).toBe("complete");
    expect(status.label).toBe("Staffing complete");
  });

  it("keeps backup-only coverage separate when detailed requirements are provided", () => {
    const status = getActionableStaffingWorkflowStatus({
      staffingRelevant: true,
      primaryRequired: 8,
      primaryConfirmed: 6,
      backupRequired: 2,
      backupConfirmed: 4,
      unconfirmedContactedCount: 0,
      confirmationNeeded: false,
      confirmationStatus: "not_needed",
    });

    expect(status.pillLabel).toBe("NEED 2 SPS");
    expect(status.nextAction).toBe("Add SPs or confirm contacted SPs.");
  });

  it("shows drafted confirmation as the current state and send/mark-sent as the next action", () => {
    const status = getActionableStaffingWorkflowStatus({
      staffingRelevant: true,
      primaryRequired: 14,
      primaryConfirmed: 14,
      backupRequired: 0,
      backupConfirmed: 0,
      unconfirmedContactedCount: 0,
      confirmationNeeded: true,
      confirmationStatus: "drafted",
    });

    expect(status.pillLabel).toBe("HIRE CONFIRMATION DRAFTED");
    expect(status.nextAction).toBe("Send the Hire Confirmation email or mark it sent.");
  });
});
