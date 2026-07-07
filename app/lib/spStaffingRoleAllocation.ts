export type EffectiveStaffingAssignmentInput = {
  id?: unknown;
  sp_id?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  last_contacted_at?: unknown;
  confirmed_at?: unknown;
  selected_at?: unknown;
};

export type EffectiveStaffingRoleAllocation<T> = {
  primaryAssignments: T[];
  backupAssignments: T[];
  primaryCount: number;
  backupCount: number;
  primaryShortage: number;
  backupShortage: number;
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeCount(value: unknown) {
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function getAssignmentOrderTimestamp(assignment: EffectiveStaffingAssignmentInput) {
  const candidates = [
    assignment.selected_at,
    assignment.confirmed_at,
    assignment.created_at,
    assignment.last_contacted_at,
    assignment.updated_at,
  ];
  for (const candidate of candidates) {
    const parsed = Date.parse(asText(candidate));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getAssignmentStableKey(assignment: EffectiveStaffingAssignmentInput) {
  return asText(assignment.id) || asText(assignment.sp_id);
}

export function allocateEffectiveStaffingRoles<T extends EffectiveStaffingAssignmentInput>(
  assignments: T[],
  options: {
    primaryTarget: unknown;
    backupTarget?: unknown;
  }
): EffectiveStaffingRoleAllocation<T> {
  const primaryTarget = normalizeCount(options.primaryTarget);
  const backupTarget = normalizeCount(options.backupTarget);
  const sortedAssignments = [...assignments].sort((a, b) => {
    const timestampDifference = getAssignmentOrderTimestamp(a) - getAssignmentOrderTimestamp(b);
    if (timestampDifference !== 0) return timestampDifference;
    return getAssignmentStableKey(a).localeCompare(getAssignmentStableKey(b));
  });
  const primaryAssignments = sortedAssignments.slice(0, primaryTarget);
  const backupAssignments = sortedAssignments.slice(primaryTarget, primaryTarget + backupTarget);

  return {
    primaryAssignments,
    backupAssignments,
    primaryCount: primaryAssignments.length,
    backupCount: backupAssignments.length,
    primaryShortage: Math.max(primaryTarget - primaryAssignments.length, 0),
    backupShortage: Math.max(backupTarget - backupAssignments.length, 0),
  };
}
