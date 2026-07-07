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
export type CommunicationOutreachMode = "cfsp" | "ms_forms";

export function getCommunicationPollOutreachSummary({
  quality,
  count,
  mode = "ms_forms",
}: {
  quality: CommunicationPollOutreachSourceQuality;
  count: number;
  mode?: CommunicationOutreachMode;
}) {
  const safeCount = Math.max(0, count);
  const label = mode === "cfsp" ? "CFSP Outreach Recipients" : "Poll Outreach List";
  if (quality === "saved") {
    return {
      label,
      status: `${safeCount} saved`,
      hasOriginalPollList: safeCount > 0,
    };
  }
  if (quality === "legacy") {
    return {
      label,
      status: `${safeCount} from legacy metadata`,
      hasOriginalPollList: safeCount > 0,
    };
  }
  if (quality === "recovered") {
    return {
      label,
      status: `${safeCount} recovered from assigned SPs`,
      hasOriginalPollList: false,
    };
  }
  return {
    label,
    status: "Not available",
    hasOriginalPollList: false,
  };
}

type PollOutreachSourceQualityForPollClosed = CommunicationPollOutreachSourceQuality;

export type PollClosedDraftAvailability = {
  canDraft: boolean;
  disabledReason: string;
};

export function getPollClosedDraftAvailability(input: {
  originalPollRecipientCount: number;
  nonDraftablePollRecipientCount: number;
  pollOutreachSourceQuality: PollOutreachSourceQualityForPollClosed;
}): PollClosedDraftAvailability {
  const originalPollRecipientCount = Math.max(0, Number(input.originalPollRecipientCount) || 0);
  const nonDraftablePollRecipientCount = Math.max(0, Number(input.nonDraftablePollRecipientCount) || 0);

  if (nonDraftablePollRecipientCount > 0) {
    return {
      canDraft: true,
      disabledReason: "",
    };
  }

  if (originalPollRecipientCount > 0) {
    return {
      canDraft: false,
      disabledReason:
        "All original poll recipients are currently selected or hired; no non-hired SP recipients are available.",
    };
  }

  return {
    canDraft: false,
    disabledReason:
      input.pollOutreachSourceQuality === "recovered"
        ? "Recovered poll outreach list — verify before sending."
        : "Poll Closed email cannot be drafted because the original poll list was not saved for this event. Future polls will save this automatically.",
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

export type StaffingWorkflowTone = "complete" | "action" | "warning" | "info";

export type StaffingWorkflowStatusInput = {
  staffingRelevant: boolean;
  primaryRequired: number;
  primaryConfirmed: number;
  backupRequired: number;
  backupConfirmed: number;
  unconfirmedContactedCount: number;
  confirmationNeeded: boolean;
  confirmationStatus: "not_needed" | "needs_info" | "ready_to_draft" | "drafted" | "sent" | "completed";
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getActionableStaffingWorkflowStatus(input: StaffingWorkflowStatusInput) {
  const primaryRequired = Math.max(0, input.primaryRequired);
  const primaryConfirmed = Math.max(0, input.primaryConfirmed);
  const backupRequired = Math.max(0, input.backupRequired);
  const backupConfirmed = Math.max(0, input.backupConfirmed);
  const primaryMissing = Math.max(primaryRequired - primaryConfirmed, 0);
  const backupMissing = Math.max(backupRequired - backupConfirmed, 0);
  const unconfirmedContactedCount = Math.max(0, input.unconfirmedContactedCount);
  const counts = {
    primaryRequired,
    primaryConfirmed,
    backupRequired,
    backupConfirmed,
    unconfirmedContactedCount,
  };

  if (!input.staffingRelevant) {
    return {
      label: "SP staffing not required",
      pillLabel: "SP STAFFING NOT REQUIRED",
      subtext: "This event has no active SP staffing target.",
      nextAction: "No staffing action needed.",
      tone: "complete" as StaffingWorkflowTone,
      counts,
    };
  }

  if (primaryMissing > 0) {
    return {
      label: "Need SPs",
      pillLabel: `NEED ${pluralize(primaryMissing, "SP", "SPS")}`,
      subtext: `${pluralize(primaryRequired, "SP")} required. Add or confirm ${pluralize(primaryMissing, "remaining SP")}.`,
      nextAction: "Add SPs or confirm contacted SPs.",
      tone: "action" as StaffingWorkflowTone,
      counts,
    };
  }

  if (backupMissing > 0) {
    return {
      label: "Need backup SPs",
      pillLabel: `NEED ${pluralize(backupMissing, "BACKUP", "BACKUPS")}`,
      subtext: `${pluralize(backupRequired, "backup")} required. Add or confirm ${pluralize(backupMissing, "backup SP")}.`,
      nextAction: "Add or confirm backup SPs.",
      tone: "action" as StaffingWorkflowTone,
      counts,
    };
  }

  if (input.confirmationNeeded) {
    if (input.confirmationStatus === "sent") {
      return {
        label: "Hire Confirmation sent",
        pillLabel: "HIRE CONFIRMATION SENT",
        subtext: "Waiting for SPs to confirm, unless they are already marked confirmed.",
        nextAction: unconfirmedContactedCount > 0
          ? `Review ${pluralize(unconfirmedContactedCount, "unconfirmed SP")}.`
          : "No immediate action unless SPs reply with changes.",
        tone: unconfirmedContactedCount > 0 ? "warning" as StaffingWorkflowTone : "complete" as StaffingWorkflowTone,
        counts,
      };
    }

    if (input.confirmationStatus === "drafted") {
      return {
        label: "Hire Confirmation drafted",
        pillLabel: "HIRE CONFIRMATION DRAFTED",
        subtext: "Send the confirmation email or mark it sent when complete.",
        nextAction: "Send the Hire Confirmation email or mark it sent.",
        tone: "warning" as StaffingWorkflowTone,
        counts,
      };
    }

    if (input.confirmationStatus === "completed") {
      return {
        label: "Staffing complete",
        pillLabel: "STAFFING COMPLETE",
        subtext: "All required staffing and confirmation steps are complete.",
        nextAction: "No staffing action needed.",
        tone: "complete" as StaffingWorkflowTone,
        counts,
      };
    }

    return {
      label: "Next step: send Hire Confirmation",
      pillLabel: "SEND HIRE CONFIRMATION",
      subtext: "SPs are staged for confirmation. Send confirmation by email and portal to officially confirm assignments.",
      nextAction: "Draft and send the email and portal confirmation.",
      tone: "action" as StaffingWorkflowTone,
      counts,
    };
  }

  if (unconfirmedContactedCount > 0) {
    return {
      label: "Awaiting SP confirmations",
      pillLabel: `AWAITING ${pluralize(unconfirmedContactedCount, "SP CONFIRMATION", "SP CONFIRMATIONS")}`,
      subtext: `${pluralize(unconfirmedContactedCount, "contacted SP")} have not confirmed yet.`,
      nextAction: "Review contacted SPs and mark confirmed, backup, declined, or remove them.",
      tone: "warning" as StaffingWorkflowTone,
      counts,
    };
  }

  return {
    label: "Staffing complete",
    pillLabel: input.confirmationStatus === "not_needed"
      ? "STAFFING COMPLETE · NO CONFIRMATION NEEDED"
      : "STAFFING COMPLETE",
    subtext: input.confirmationStatus === "not_needed"
      ? "SPs are already marked confirmed. No Hire Confirmation email is required."
      : "All required SPs are confirmed.",
    nextAction: "No staffing action needed.",
    tone: "complete" as StaffingWorkflowTone,
    counts,
  };
}
