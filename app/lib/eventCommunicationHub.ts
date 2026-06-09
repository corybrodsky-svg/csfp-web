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

export type CommunicationPollOutreachSourceQuality = "saved" | "legacy" | "recovered" | "missing";

export function getCommunicationPollOutreachSummary({
  quality,
  count,
}: {
  quality: CommunicationPollOutreachSourceQuality;
  count: number;
}) {
  const safeCount = Math.max(0, count);
  if (quality === "saved") {
    return {
      label: "Poll Outreach List",
      status: `${safeCount} saved`,
      hasOriginalPollList: safeCount > 0,
    };
  }
  if (quality === "legacy") {
    return {
      label: "Poll Outreach List",
      status: `${safeCount} from legacy metadata`,
      hasOriginalPollList: safeCount > 0,
    };
  }
  if (quality === "recovered") {
    return {
      label: "Poll Outreach List",
      status: `${safeCount} recovered from assigned SPs`,
      hasOriginalPollList: false,
    };
  }
  return {
    label: "Poll Outreach List",
    status: "Not available",
    hasOriginalPollList: false,
  };
}

export function getReconciledHiringStatusLabel({
  responseWorkflowDetail,
  availabilityWorkflowDetail,
  hireConfirmationStatus,
  hireConfirmationStatusTimestamp,
  confirmationDrafted,
  assignedSpCount,
  hireConfirmationStarted,
  fallbackStatusLabel,
}: {
  responseWorkflowDetail?: string;
  availabilityWorkflowDetail?: string;
  hireConfirmationStatus?: string;
  hireConfirmationStatusTimestamp?: string;
  confirmationDrafted?: boolean;
  assignedSpCount: number;
  hireConfirmationStarted: boolean;
  fallbackStatusLabel: string;
}) {
  if (hireConfirmationStatus === "sent" || hireConfirmationStatus === "completed") {
    const timestamp = hireConfirmationStatusTimestamp ? ` · ${hireConfirmationStatusTimestamp}` : "";
    return hireConfirmationStatus === "sent"
      ? `Hire Confirmation Sent${timestamp}`
      : `Hire Confirmation Completed${timestamp}`;
  }
  if (hireConfirmationStatus === "drafted" || confirmationDrafted) {
    return "Hire Confirmation Drafted";
  }
  if (responseWorkflowDetail) return responseWorkflowDetail;
  if (availabilityWorkflowDetail) return availabilityWorkflowDetail;
  if (assignedSpCount > 0) return "ASSIGNED/CONFIRMED SPS PRESENT";
  if (hireConfirmationStarted) return "HIRING STARTED";
  return fallbackStatusLabel;
}
