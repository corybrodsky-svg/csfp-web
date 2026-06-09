export type BulkAssignmentRemovalFailure = {
  assignmentId: string;
  reason: string;
};

export type BulkAssignmentRemovalOutcome = {
  successfulAssignmentIds: string[];
  failures: BulkAssignmentRemovalFailure[];
};

export type StaffingAssignmentRemovalPayload = {
  assignment_id: string;
  delete_history?: true;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getFailureReason(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return asText(reason) || "Delete request failed.";
}

export function normalizeAssignmentIds(ids: unknown[]) {
  return Array.from(new Set(ids.map(asText).filter(Boolean)));
}

export function buildStaffingAssignmentRemovalPayload(
  assignmentId: unknown,
  options?: { deleteHistory?: boolean }
): StaffingAssignmentRemovalPayload {
  const normalizedAssignmentId = asText(assignmentId);
  if (!normalizedAssignmentId) {
    throw new Error("Missing assignment id for removal.");
  }

  return {
    assignment_id: normalizedAssignmentId,
    ...(options?.deleteHistory ? { delete_history: true as const } : {}),
  };
}

export function getBulkAssignmentRemovalOutcome(
  selectedAssignmentIds: string[],
  results: PromiseSettledResult<unknown>[]
): BulkAssignmentRemovalOutcome {
  const normalizedSelectedIds = normalizeAssignmentIds(selectedAssignmentIds);
  const failures = results
    .flatMap((result, index) =>
      result.status === "rejected"
        ? [{
            assignmentId: normalizedSelectedIds[index] || "",
            reason: getFailureReason(result.reason),
          }]
        : []
    )
    .filter((failure) => Boolean(failure.assignmentId));
  const failedIds = new Set(failures.map((failure) => failure.assignmentId));

  return {
    successfulAssignmentIds: normalizedSelectedIds.filter((assignmentId) => !failedIds.has(assignmentId)),
    failures,
  };
}

export function getAssignmentsStillPresentAfterRemoval(
  removedAssignmentIds: string[],
  refreshedAssignmentIds: string[]
) {
  const remainingIds = new Set(normalizeAssignmentIds(refreshedAssignmentIds));
  return normalizeAssignmentIds(removedAssignmentIds).filter((assignmentId) => remainingIds.has(assignmentId));
}
