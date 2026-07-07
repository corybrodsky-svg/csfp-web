function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown) {
  return asText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

export type LegacyScheduleBuilderAccessRecord = {
  isPlatformOwner?: unknown;
  role?: unknown;
  legacyRole?: unknown;
  organizationRole?: unknown;
  activeOrganization?: unknown;
  profile?: {
    role?: unknown;
    organization_role?: unknown;
  } | null;
};

export function canAccessLegacyGlobalScheduleBuilder(record: LegacyScheduleBuilderAccessRecord | null | undefined) {
  if (!record) return false;
  if (record.isPlatformOwner === true) return true;
  const roles = [
    record.role,
    record.organizationRole,
    record.profile?.organization_role,
    record.profile?.role,
  ].map(normalizeRole);
  return roles.includes("platform_owner") || roles.includes("owner") || roles.includes("app_owner");
}

export function getLegacyGlobalScheduleBuilderUnavailableHref(record: LegacyScheduleBuilderAccessRecord | null | undefined) {
  const activeOrganization = record?.activeOrganization && typeof record.activeOrganization === "object"
    ? (record.activeOrganization as { slug?: unknown })
    : null;
  const slug = normalizeRole(activeOrganization?.slug);
  return slug.includes("sandbox") || slug.includes("demo") ? "/events" : "/dashboard";
}
