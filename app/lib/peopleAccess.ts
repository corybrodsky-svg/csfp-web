export const PEOPLE_ACCESS_ROLES = ["org_admin", "sim_ops", "faculty", "sp", "viewer"] as const;

export type PeopleAccessRole = (typeof PEOPLE_ACCESS_ROLES)[number];

export type PeopleAccessSpLinkStatus =
  | "linked"
  | "needs_review"
  | "not_found"
  | "multiple_matches"
  | "invalid_organization"
  | "not_applicable";

export type PeopleAccessMember = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  organization_role?: string | null;
  status?: string | null;
  schedule_match_name?: string | null;
  sp_link_status?: string | null;
  sp_link_sp_id?: string | null;
  sp_link_name?: string | null;
  sp_link_email?: string | null;
  sp_link_reason?: string | null;
  sp_link_candidate_count?: number | null;
};

export type PeopleAccessFilters = {
  search?: string;
  role?: string;
  status?: string;
  spLinkStatus?: string;
  needsAttention?: boolean;
};

export type StaffPatchAction =
  | "change_role"
  | "link_sp"
  | "unlink_sp"
  | "suspend"
  | "reactivate"
  | "remove"
  | "send_invite"
  | "resend_invite";

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizePeopleAccessRole(value: unknown): PeopleAccessRole | "" {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "admin") return "org_admin";
  if (role === "sim_op") return "sim_ops";
  if (PEOPLE_ACCESS_ROLES.includes(role as PeopleAccessRole)) return role as PeopleAccessRole;
  return "";
}

export function getPeopleAccessRoleLabel(value: unknown) {
  const role = normalizePeopleAccessRole(value);
  if (role === "org_admin") return "Organization Admin";
  if (role === "sim_ops") return "Sim Ops";
  if (role === "faculty") return "Faculty";
  if (role === "sp") return "SP";
  if (role === "viewer") return "Viewer";
  if (asText(value).toLowerCase() === "platform_owner") return "Platform Owner";
  return "Unknown";
}

export function normalizePeopleAccessStatus(value: unknown) {
  const status = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "disabled") return "inactive";
  if (status === "suspended") return "suspended";
  if (status === "pending" || status === "invited" || status === "inactive" || status === "active") return status;
  return status || "unknown";
}

export function getPeopleAccessStatusLabel(value: unknown) {
  const status = normalizePeopleAccessStatus(value);
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  if (status === "suspended") return "Suspended";
  if (status === "pending") return "Pending";
  if (status === "invited") return "Invited";
  return asText(value) || "Unknown";
}

export function normalizeSpLinkStatus(value: unknown, role?: unknown): PeopleAccessSpLinkStatus {
  const normalizedRole = normalizePeopleAccessRole(role);
  if (normalizedRole && normalizedRole !== "sp") return "not_applicable";
  const status = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (status === "linked" || status === "confirmed") return "linked";
  if (status === "not_found" || status === "no_match") return "not_found";
  if (status === "multiple_matches" || status === "ambiguous") return "multiple_matches";
  if (status === "invalid_organization" || status === "cross_organization" || status === "invalid") return "invalid_organization";
  if (status === "not_applicable") return "not_applicable";
  return "needs_review";
}

export function getSpLinkStatusLabel(value: unknown, role?: unknown) {
  const status = normalizeSpLinkStatus(value, role);
  if (status === "linked") return "Linked to SP Database";
  if (status === "not_found") return "No matching SP record found";
  if (status === "multiple_matches") return "Multiple possible SP records";
  if (status === "invalid_organization") return "SP link invalid for this organization";
  if (status === "not_applicable") return "Not applicable";
  return "SP link needs review";
}

export function memberNeedsPeopleAccessAttention(member: PeopleAccessMember) {
  const role = normalizePeopleAccessRole(member.organization_role || member.role);
  const membershipStatus = normalizePeopleAccessStatus(member.status);
  if (membershipStatus && membershipStatus !== "active") return true;
  if (role === "sp") return normalizeSpLinkStatus(member.sp_link_status, role) !== "linked";
  return false;
}

export function filterPeopleAccessMembers(
  members: PeopleAccessMember[],
  filters: PeopleAccessFilters
) {
  const query = asText(filters.search).toLowerCase();
  const roleFilter = asText(filters.role).toLowerCase();
  const statusFilter = asText(filters.status).toLowerCase();
  const spLinkFilter = asText(filters.spLinkStatus).toLowerCase();

  return members.filter((member) => {
    const role = normalizePeopleAccessRole(member.organization_role || member.role);
    const membershipStatus = normalizePeopleAccessStatus(member.status);
    const spLinkStatus = normalizeSpLinkStatus(member.sp_link_status, role);

    if (roleFilter && roleFilter !== "all" && role !== roleFilter) return false;
    if (statusFilter && statusFilter !== "all" && membershipStatus !== statusFilter) return false;
    if (spLinkFilter && spLinkFilter !== "all" && spLinkStatus !== spLinkFilter) return false;
    if (filters.needsAttention && !memberNeedsPeopleAccessAttention(member)) return false;
    if (!query) return true;

    return [
      member.full_name,
      member.email,
      member.schedule_match_name,
      getPeopleAccessRoleLabel(role),
      getPeopleAccessStatusLabel(membershipStatus),
      getSpLinkStatusLabel(spLinkStatus, role),
      member.sp_link_name,
      member.sp_link_email,
    ]
      .map((value) => asText(value).toLowerCase())
      .some((value) => value.includes(query));
  });
}

export function getSpLinkReviewQueue(members: PeopleAccessMember[]) {
  return members.filter((member) => {
    const role = normalizePeopleAccessRole(member.organization_role || member.role);
    return role === "sp" && normalizeSpLinkStatus(member.sp_link_status, role) !== "linked";
  });
}

export function buildStaffPatchPayload(args: {
  userId: string;
  action: StaffPatchAction;
  role?: string;
  spId?: string;
}) {
  const userId = asText(args.userId);
  const action = asText(args.action);
  if (!userId || !action) throw new Error("User id and action are required.");

  const payload: Record<string, string> = {
    user_id: userId,
    action,
  };

  if (args.role !== undefined) {
    const role = normalizePeopleAccessRole(args.role);
    if (!role) throw new Error("Role is not allowed for organization members.");
    payload.role = role;
  }
  if (args.spId !== undefined) payload.sp_id = asText(args.spId);

  return payload;
}
