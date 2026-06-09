import { describe, expect, it } from "vitest";
import { getEventCommunicationHubState } from "./eventCommunicationHub";

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
