export type SpCoverageAllocationInput = {
  primaryTarget: number;
  backupTarget?: number;
  confirmedWorkingSpCount: number;
  explicitlyAssignedBackupCount?: number;
};

export type SpCoverageAllocation = {
  primaryTarget: number;
  backupTarget: number;
  totalTarget: number;
  totalConfirmedWorkingSpCount: number;
  explicitlyAssignedBackupCount: number;
  effectivePrimaryConfirmed: number;
  remainingConfirmedAfterPrimary: number;
  effectiveBackupConfirmed: number;
  primaryShortage: number;
  backupShortage: number;
  totalShortage: number;
};

function normalizeCoverageCount(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.floor(Number(value)));
}

export function allocateSpCoverage(input: SpCoverageAllocationInput): SpCoverageAllocation {
  const primaryTarget = normalizeCoverageCount(input.primaryTarget);
  const backupTarget = normalizeCoverageCount(input.backupTarget);
  const totalConfirmedWorkingSpCount = normalizeCoverageCount(input.confirmedWorkingSpCount);
  const explicitlyAssignedBackupCount = normalizeCoverageCount(input.explicitlyAssignedBackupCount);
  const effectivePrimaryConfirmed = Math.min(totalConfirmedWorkingSpCount, primaryTarget);
  const remainingConfirmedAfterPrimary = Math.max(totalConfirmedWorkingSpCount - primaryTarget, 0);
  const effectiveBackupConfirmed = Math.min(remainingConfirmedAfterPrimary, backupTarget);

  return {
    primaryTarget,
    backupTarget,
    totalTarget: primaryTarget + backupTarget,
    totalConfirmedWorkingSpCount,
    explicitlyAssignedBackupCount,
    effectivePrimaryConfirmed,
    remainingConfirmedAfterPrimary,
    effectiveBackupConfirmed,
    primaryShortage: Math.max(primaryTarget - effectivePrimaryConfirmed, 0),
    backupShortage: Math.max(backupTarget - effectiveBackupConfirmed, 0),
    totalShortage: Math.max(primaryTarget + backupTarget - totalConfirmedWorkingSpCount, 0),
  };
}
