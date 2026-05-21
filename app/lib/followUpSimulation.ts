function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export type FollowUpCopyOptions = {
  copyLearnerRoster: boolean;
  copySpRoster: boolean;
  copyCases: boolean;
  copyScheduleStructure: boolean;
  copyMaterials: boolean;
  copyEmailTemplateContext: boolean;
  copyTrainingReferences: boolean;
  createCompletedSchedule: boolean;
};

export const DEFAULT_FOLLOW_UP_COPY_OPTIONS: FollowUpCopyOptions = {
  copyLearnerRoster: true,
  copySpRoster: true,
  copyCases: true,
  copyScheduleStructure: true,
  copyMaterials: false,
  copyEmailTemplateContext: false,
  copyTrainingReferences: false,
  createCompletedSchedule: false,
};

export const FOLLOW_UP_COPY_OPTION_LABELS: Record<keyof FollowUpCopyOptions, string> = {
  copyLearnerRoster: "Copy learner roster / groups",
  copySpRoster: "Copy SP roster",
  copyCases: "Copy case files / case assignments",
  copyScheduleStructure: "Copy schedule structure / rotation logic",
  copyMaterials: "Copy materials",
  copyEmailTemplateContext: "Copy email template context if applicable",
  copyTrainingReferences: "Copy training references if applicable",
  createCompletedSchedule: "Create schedule as completed snapshot",
};

export const FOLLOW_UP_VISIBILITY_OPTIONS = [
  { value: "team", label: "Team" },
  { value: "personal", label: "Personal" },
] as const;

export const FOLLOW_UP_STATUS_OPTIONS = [
  { value: "Planning", label: "Planning" },
  { value: "Needs SPs", label: "Needs SPs" },
  { value: "Scheduled", label: "Scheduled" },
] as const;

const CFSP_METADATA_BLOCK_PATTERN = /\[(CFSP_[A-Z0-9_]+)\][\s\S]*?\[\/\1\]/g;

export function buildDefaultFollowUpEventName(name?: string | null) {
  const baseName = asText(name) || "Simulation Event";
  return `${baseName} — Follow-Up`;
}

export function stripCfspMetadataBlocks(notes?: string | null) {
  return asText(notes).replace(CFSP_METADATA_BLOCK_PATTERN, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeFollowUpCopyOptions(
  value: Partial<FollowUpCopyOptions> | null | undefined
): FollowUpCopyOptions {
  return {
    copyLearnerRoster: value?.copyLearnerRoster !== false,
    copySpRoster: value?.copySpRoster !== false,
    copyCases: value?.copyCases !== false,
    copyScheduleStructure: value?.copyScheduleStructure !== false,
    copyMaterials: value?.copyMaterials === true,
    copyEmailTemplateContext: value?.copyEmailTemplateContext === true,
    copyTrainingReferences: value?.copyTrainingReferences === true,
    createCompletedSchedule: value?.createCompletedSchedule === true,
  };
}

export function parseFollowUpList(value: string | null | undefined) {
  const text = asText(value);
  if (!text) return [] as string[];

  const candidates = [text];
  try {
    candidates.unshift(decodeURIComponent(text));
  } catch {
    // Already plain text.
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => asText(item)).filter(Boolean);
      }
    } catch {
      // Fall through to legacy delimiter parsing.
    }
  }

  return text
    .split(/[\n,;|]/g)
    .map((item) => asText(item))
    .filter(Boolean);
}

export function serializeFollowUpList(values: string[]) {
  const cleaned = Array.from(new Set(values.map((item) => asText(item)).filter(Boolean)));
  return cleaned.length ? encodeURIComponent(JSON.stringify(cleaned)) : "";
}
