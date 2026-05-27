import type { SupabaseClient } from "@supabase/supabase-js";

export const ORGANIZATION_COMMUNICATION_MODES = ["hybrid", "portal_only", "email_only", "microsoft_forms", "manual"] as const;
export const SP_COMMUNICATION_MODES = ["portal", "email", "microsoft_forms", "phone", "manual", "do_not_contact"] as const;
export const SP_PORTAL_STATUSES = ["not_invited", "invited", "linked", "needs_help", "disabled"] as const;
export const SP_ONBOARDING_STATUSES = ["not_started", "invited", "in_progress", "complete", "needs_help", "declined"] as const;

export type OrganizationCommunicationMode = (typeof ORGANIZATION_COMMUNICATION_MODES)[number];
export type SpCommunicationMode = (typeof SP_COMMUNICATION_MODES)[number];
export type SpPortalStatus = (typeof SP_PORTAL_STATUSES)[number];
export type SpOnboardingStatus = (typeof SP_ONBOARDING_STATUSES)[number];

export type OrganizationCommunicationSettings = {
  id: string | null;
  organization_id: string;
  default_sp_communication_mode: OrganizationCommunicationMode;
  allow_sp_portal: boolean;
  allow_email_workflow: boolean;
  allow_microsoft_forms_workflow: boolean;
  allow_manual_workflow: boolean;
  default_ms_forms_url: string | null;
  default_reply_to_email: string | null;
  sp_onboarding_message: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SpCommunicationPreference = {
  id: string | null;
  organization_id: string;
  sp_id: string;
  preferred_mode: SpCommunicationMode;
  portal_status: SpPortalStatus;
  onboarding_status: SpOnboardingStatus;
  last_invited_at: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const ORGANIZATION_COMMUNICATION_MODE_LABELS: Record<OrganizationCommunicationMode, string> = {
  hybrid: "Hybrid",
  portal_only: "Portal only",
  email_only: "Email only",
  microsoft_forms: "Microsoft Forms",
  manual: "Manual",
};

export const SP_COMMUNICATION_MODE_LABELS: Record<SpCommunicationMode, string> = {
  portal: "Portal",
  email: "Email",
  microsoft_forms: "Microsoft Forms",
  phone: "Phone",
  manual: "Manual",
  do_not_contact: "Do not contact",
};

export const SP_PORTAL_STATUS_LABELS: Record<SpPortalStatus, string> = {
  not_invited: "Not invited",
  invited: "Invited",
  linked: "Linked",
  needs_help: "Needs help",
  disabled: "Disabled",
};

export const SP_ONBOARDING_STATUS_LABELS: Record<SpOnboardingStatus, string> = {
  not_started: "Not started",
  invited: "Invited",
  in_progress: "In progress",
  complete: "Complete",
  needs_help: "Needs help",
  declined: "Declined",
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeToken(value: unknown) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = normalizeToken(value);
  if (text === "true" || text === "yes" || text === "1") return true;
  if (text === "false" || text === "no" || text === "0") return false;
  return fallback;
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const normalized = normalizeToken(value);
  return allowed.includes(normalized) ? normalized : fallback;
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return allowed.includes(normalizeToken(value));
}

export function getInvalidOrganizationCommunicationSettingsField(body: Record<string, unknown>) {
  if (hasOwn(body, "default_sp_communication_mode") && !isOneOf(body.default_sp_communication_mode, ORGANIZATION_COMMUNICATION_MODES)) {
    return "default_sp_communication_mode";
  }
  return "";
}

export function getInvalidSpCommunicationPreferenceField(body: Record<string, unknown>) {
  if (hasOwn(body, "preferred_mode") && !isOneOf(body.preferred_mode, SP_COMMUNICATION_MODES)) return "preferred_mode";
  if (hasOwn(body, "portal_status") && !isOneOf(body.portal_status, SP_PORTAL_STATUSES)) return "portal_status";
  if (hasOwn(body, "onboarding_status") && !isOneOf(body.onboarding_status, SP_ONBOARDING_STATUSES)) return "onboarding_status";
  return "";
}

export function normalizeOrganizationCommunicationMode(value: unknown): OrganizationCommunicationMode {
  return oneOf(value, ORGANIZATION_COMMUNICATION_MODES, "hybrid");
}

export function normalizeSpCommunicationMode(value: unknown, fallback: SpCommunicationMode = "email"): SpCommunicationMode {
  return oneOf(value, SP_COMMUNICATION_MODES, fallback);
}

export function normalizeSpPortalStatus(value: unknown, fallback: SpPortalStatus = "not_invited"): SpPortalStatus {
  return oneOf(value, SP_PORTAL_STATUSES, fallback);
}

export function normalizeSpOnboardingStatus(value: unknown, fallback: SpOnboardingStatus = "not_started"): SpOnboardingStatus {
  return oneOf(value, SP_ONBOARDING_STATUSES, fallback);
}

export function isMissingPreferenceSchemaError(error: unknown) {
  const source =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown })
      : {};
  const text = [source.code, source.message, source.details, source.hint].map(asText).join(" ").toLowerCase();
  return (
    text.includes("42p01") ||
    text.includes("pgrst205") ||
    text.includes("organization_communication_settings") ||
    text.includes("sp_communication_preferences") ||
    (text.includes("relation") && text.includes("does not exist"))
  );
}

export function getDefaultOrganizationCommunicationSettings(organizationId: string): OrganizationCommunicationSettings {
  return {
    id: null,
    organization_id: organizationId,
    default_sp_communication_mode: "hybrid",
    allow_sp_portal: true,
    allow_email_workflow: true,
    allow_microsoft_forms_workflow: true,
    allow_manual_workflow: true,
    default_ms_forms_url: null,
    default_reply_to_email: null,
    sp_onboarding_message: null,
  };
}

export function getDefaultSpCommunicationPreference(args: {
  organizationId: string;
  spId: string;
  linked?: boolean;
}): SpCommunicationPreference {
  const linked = args.linked === true;
  return {
    id: null,
    organization_id: args.organizationId,
    sp_id: args.spId,
    preferred_mode: linked ? "portal" : "email",
    portal_status: linked ? "linked" : "not_invited",
    onboarding_status: linked ? "complete" : "not_started",
    last_invited_at: null,
    notes: null,
  };
}

export function normalizeOrganizationCommunicationSettingsRow(
  row: Record<string, unknown> | null | undefined,
  organizationId: string
): OrganizationCommunicationSettings {
  const fallback = getDefaultOrganizationCommunicationSettings(organizationId);
  if (!row) return fallback;
  return {
    id: asText(row.id) || null,
    organization_id: asText(row.organization_id) || organizationId,
    default_sp_communication_mode: normalizeOrganizationCommunicationMode(row.default_sp_communication_mode),
    allow_sp_portal: asBoolean(row.allow_sp_portal, true),
    allow_email_workflow: asBoolean(row.allow_email_workflow, true),
    allow_microsoft_forms_workflow: asBoolean(row.allow_microsoft_forms_workflow, true),
    allow_manual_workflow: asBoolean(row.allow_manual_workflow, true),
    default_ms_forms_url: asText(row.default_ms_forms_url) || null,
    default_reply_to_email: asText(row.default_reply_to_email) || null,
    sp_onboarding_message: asText(row.sp_onboarding_message) || null,
    created_at: asText(row.created_at) || null,
    updated_at: asText(row.updated_at) || null,
  };
}

export function normalizeSpCommunicationPreferenceRow(
  row: Record<string, unknown> | null | undefined,
  fallback: SpCommunicationPreference
): SpCommunicationPreference {
  if (!row) return fallback;
  return {
    id: asText(row.id) || null,
    organization_id: asText(row.organization_id) || fallback.organization_id,
    sp_id: asText(row.sp_id) || fallback.sp_id,
    preferred_mode: normalizeSpCommunicationMode(row.preferred_mode, fallback.preferred_mode),
    portal_status: normalizeSpPortalStatus(row.portal_status, fallback.portal_status),
    onboarding_status: normalizeSpOnboardingStatus(row.onboarding_status, fallback.onboarding_status),
    last_invited_at: asText(row.last_invited_at) || null,
    notes: asText(row.notes) || null,
    created_at: asText(row.created_at) || null,
    updated_at: asText(row.updated_at) || null,
  };
}

export function withoutSpCommunicationNotes(preference: SpCommunicationPreference) {
  const publicPreference = { ...preference };
  delete publicPreference.notes;
  return publicPreference;
}

export function getCommunicationBadge(preference: Pick<SpCommunicationPreference, "preferred_mode" | "portal_status" | "onboarding_status">) {
  if (preference.preferred_mode === "do_not_contact") return { label: "Do not contact", tone: "danger" as const };
  if (preference.portal_status === "needs_help" || preference.onboarding_status === "needs_help") {
    return { label: "Needs help", tone: "warning" as const };
  }
  if (preference.portal_status === "linked" || preference.preferred_mode === "portal") {
    return { label: "Portal-ready", tone: "success" as const };
  }
  if (preference.portal_status === "invited" || preference.onboarding_status === "invited") {
    return { label: "Invited", tone: "info" as const };
  }
  if (preference.preferred_mode === "email") return { label: "Email-only", tone: "default" as const };
  if (preference.preferred_mode === "microsoft_forms") return { label: "MS Forms", tone: "default" as const };
  if (preference.preferred_mode === "phone" || preference.preferred_mode === "manual") {
    return { label: "Phone/manual", tone: "default" as const };
  }
  return { label: "Not invited", tone: "muted" as const };
}

export async function getOrganizationCommunicationSettings(
  db: SupabaseClient,
  organizationId: string
): Promise<{ settings: OrganizationCommunicationSettings; schemaAvailable: boolean }> {
  const fallback = getDefaultOrganizationCommunicationSettings(organizationId);
  const { data, error } = await db
    .from("organization_communication_settings")
    .select(
      "id,organization_id,default_sp_communication_mode,allow_sp_portal,allow_email_workflow,allow_microsoft_forms_workflow,allow_manual_workflow,default_ms_forms_url,default_reply_to_email,sp_onboarding_message,created_at,updated_at"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    if (isMissingPreferenceSchemaError(error)) return { settings: fallback, schemaAvailable: false };
    throw error;
  }

  return {
    settings: normalizeOrganizationCommunicationSettingsRow((data || null) as Record<string, unknown> | null, organizationId),
    schemaAvailable: true,
  };
}

export async function getSpCommunicationPreference(
  db: SupabaseClient,
  args: { organizationId: string; spId: string; linked?: boolean }
): Promise<{ preference: SpCommunicationPreference; schemaAvailable: boolean }> {
  const fallback = getDefaultSpCommunicationPreference(args);
  const { data, error } = await db
    .from("sp_communication_preferences")
    .select(
      "id,organization_id,sp_id,preferred_mode,portal_status,onboarding_status,last_invited_at,notes,created_at,updated_at"
    )
    .eq("organization_id", args.organizationId)
    .eq("sp_id", args.spId)
    .maybeSingle();

  if (error) {
    if (isMissingPreferenceSchemaError(error)) return { preference: fallback, schemaAvailable: false };
    throw error;
  }

  return {
    preference: normalizeSpCommunicationPreferenceRow((data || null) as Record<string, unknown> | null, fallback),
    schemaAvailable: true,
  };
}

export function buildOrganizationCommunicationSettingsPayload(
  body: Record<string, unknown>,
  organizationId: string
) {
  return {
    organization_id: organizationId,
    default_sp_communication_mode: normalizeOrganizationCommunicationMode(body.default_sp_communication_mode),
    allow_sp_portal: asBoolean(body.allow_sp_portal, true),
    allow_email_workflow: asBoolean(body.allow_email_workflow, true),
    allow_microsoft_forms_workflow: asBoolean(body.allow_microsoft_forms_workflow, true),
    allow_manual_workflow: asBoolean(body.allow_manual_workflow, true),
    default_ms_forms_url: asText(body.default_ms_forms_url) || null,
    default_reply_to_email: asText(body.default_reply_to_email) || null,
    sp_onboarding_message: asText(body.sp_onboarding_message) || null,
  };
}

export function buildSpCommunicationPreferencePayload(
  body: Record<string, unknown>,
  args: { organizationId: string; spId: string; fallback?: SpCommunicationPreference }
) {
  const fallback = args.fallback || getDefaultSpCommunicationPreference({ organizationId: args.organizationId, spId: args.spId });
  return {
    organization_id: args.organizationId,
    sp_id: args.spId,
    preferred_mode: hasOwn(body, "preferred_mode")
      ? normalizeSpCommunicationMode(body.preferred_mode, fallback.preferred_mode)
      : fallback.preferred_mode,
    portal_status: hasOwn(body, "portal_status")
      ? normalizeSpPortalStatus(body.portal_status, fallback.portal_status)
      : fallback.portal_status,
    onboarding_status: hasOwn(body, "onboarding_status")
      ? normalizeSpOnboardingStatus(body.onboarding_status, fallback.onboarding_status)
      : fallback.onboarding_status,
    last_invited_at: hasOwn(body, "last_invited_at")
      ? asText(body.last_invited_at) || null
      : fallback.last_invited_at,
    notes: hasOwn(body, "notes") ? asText(body.notes) || null : fallback.notes || null,
  };
}
