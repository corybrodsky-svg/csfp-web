import { describe, expect, it } from "vitest";
import {
  getCommunicationPollOutreachSummary,
  getEventCommunicationHubState,
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
