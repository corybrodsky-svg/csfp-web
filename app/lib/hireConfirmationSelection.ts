const HIRE_CONFIRMATION_SELECTION_BLOCK = "CFSP_HIRE_CONFIRMATION_SELECTION";

type HireConfirmationRecipientInput = {
  sp?: {
    id?: unknown;
  } | null;
  email?: unknown;
  name?: unknown;
};

type HireConfirmationAssignmentInput = {
  sp_id?: unknown;
  status?: unknown;
  assignment_status?: unknown;
  role_name?: unknown;
  confirmed?: unknown;
  notes?: unknown;
};

export type HireConfirmationPendingSelection = {
  spId: string;
  email: string;
  name: string;
  assignmentType: "primary" | "backup";
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function getHireConfirmationSelectionDetail(notes: unknown) {
  const text = asText(notes);
  const pattern = new RegExp(`\\[${HIRE_CONFIRMATION_SELECTION_BLOCK}\\]([\\s\\S]*?)\\[\\/${HIRE_CONFIRMATION_SELECTION_BLOCK}\\]`);
  const match = text.match(pattern);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAssignmentStatus(assignment: HireConfirmationAssignmentInput | null | undefined) {
  return (
    asText(assignment?.status) ||
    asText(assignment?.assignment_status) ||
    asText(assignment?.role_name)
  ).toLowerCase();
}

function isExplicitBackupAssignment(assignment: HireConfirmationAssignmentInput | null | undefined) {
  if (!assignment) return false;
  if (getAssignmentStatus(assignment) === "backup") return true;
  const detail = getHireConfirmationSelectionDetail(assignment.notes);
  return asText(detail?.assignment_type).toLowerCase() === "backup";
}

export function buildHireConfirmationPendingSelectionSummary({
  recipients,
  assignments,
}: {
  recipients: HireConfirmationRecipientInput[];
  assignments: HireConfirmationAssignmentInput[];
}) {
  const assignmentBySpId = new Map(
    assignments
      .map((assignment) => [asText(assignment.sp_id), assignment] as const)
      .filter(([spId]) => Boolean(spId))
  );
  const seen = new Set<string>();
  const selected: HireConfirmationPendingSelection[] = [];

  recipients.forEach((recipient) => {
    const spId = asText(recipient.sp?.id);
    const email = normalizeEmail(recipient.email);
    if (!spId || !email || seen.has(spId)) return;
    seen.add(spId);
    selected.push({
      spId,
      email,
      name: asText(recipient.name),
      assignmentType: isExplicitBackupAssignment(assignmentBySpId.get(spId)) ? "backup" : "primary",
    });
  });

  const primarySelectionCount = selected.filter((entry) => entry.assignmentType === "primary").length;
  const backupSelectionCount = selected.filter((entry) => entry.assignmentType === "backup").length;

  return {
    selected,
    selectedCount: selected.length,
    primarySelectionCount,
    backupSelectionCount,
  };
}
