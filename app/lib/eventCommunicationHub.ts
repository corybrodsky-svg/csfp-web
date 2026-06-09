export type EventCommunicationHubInput = {
  spPollBuilderHiringStarted: boolean;
  pollResponsesImported: boolean;
  originalPollOutreachCount: number;
  recoveredAssignedSpCount: number;
  recoveredHireConfirmationStarted: boolean;
  spPollBuilderSavedPollUrl: string;
};

export function getEventCommunicationHubState(input: EventCommunicationHubInput) {
  const hasWorkflow = Boolean(
    input.spPollBuilderHiringStarted ||
      input.pollResponsesImported ||
      input.originalPollOutreachCount > 0 ||
      input.recoveredHireConfirmationStarted ||
      input.recoveredAssignedSpCount > 0 ||
      input.spPollBuilderSavedPollUrl
  );

  return {
    hasWorkflow,
    recoveredPollBucketsUnavailable: hasWorkflow && !input.pollResponsesImported,
  };
}
