"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../../components/SiteShell";

type OrganizationRole = "platform_owner" | "org_admin" | "sim_ops" | "faculty" | "sp" | "viewer";

type MeResponse = {
  ok?: boolean;
  role?: string | null;
  memberships?: Array<{
    id?: string | null;
    organization_id?: string | null;
    role?: string | null;
    status?: string | null;
    organization?: {
      id?: string | null;
      name?: string | null;
      slug?: string | null;
      status?: string | null;
    } | null;
  }> | null;
  profile?: {
    role?: string | null;
    organization_role?: string | null;
  } | null;
  activeOrganization?: {
    id?: string | null;
    name?: string | null;
  } | null;
  error?: string;
};

type OrganizationOption = {
  id: string;
  name: string;
  slug: string | null;
  role: string;
  status: string;
  isActive: boolean;
};

type OrganizationsResponse = {
  ok?: boolean;
  organizations?: OrganizationOption[] | null;
  activeOrganization?: {
    id?: string | null;
    name?: string | null;
  } | null;
  role?: string | null;
  canCreateOrganizations?: boolean;
  error?: string;
};

type AccessRequest = {
  id: string;
  full_name: string;
  email: string;
  requested_role: string;
  note: string | null;
  status: string;
  created_at: string | null;
};

type AccessRequestResponse = {
  ok?: boolean;
  accessRequests?: AccessRequest[];
  error?: string;
};

type StaffMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  organization_role?: string;
  status: string;
  sp_link_status?: string;
  sp_link_sp_id?: string;
  sp_link_name?: string;
  sp_link_email?: string;
  sp_link_matched_by?: string;
  created_at: string | null;
  updated_at: string | null;
};

type StaffResponse = {
  ok?: boolean;
  members?: StaffMember[];
  error?: string;
};

type SpDirectoryItem = {
  id: string;
  name: string;
  working_email: string;
  email: string;
};

type SpDirectoryResponse = {
  sps?: Array<{
    id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    working_email?: string | null;
    email?: string | null;
  }>;
  error?: string;
};

type AccessCode = {
  id: string;
  code: string;
  label: string | null;
  allowed_email_domains: string[] | null;
  default_requested_role: string | null;
  active: boolean | null;
  requires_manual_approval: boolean | null;
  created_at: string | null;
};

type AccessCodesResponse = {
  ok?: boolean;
  accessCodes?: AccessCode[];
  error?: string;
};

type AccessCodeDraft = {
  label: string;
  domainsText: string;
  defaultRole: OrganizationRole;
  active: boolean;
  requiresManualApproval: boolean;
};

type NewOrganizationDraft = {
  name: string;
  slug: string;
  initialAccessCode: string;
  createInitialAccessCode: boolean;
};

const APPROVAL_ROLES: OrganizationRole[] = ["org_admin", "sim_ops", "faculty", "sp", "viewer"];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown): OrganizationRole {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "platform_owner" || role === "super_admin") return "platform_owner";
  if (role === "org_admin" || role === "admin") return "org_admin";
  if (role === "sim_ops" || role === "sim_op") return "sim_ops";
  if (role === "faculty") return "faculty";
  if (role === "sp") return "sp";
  return "viewer";
}

function normalizeApprovalRole(value: unknown): OrganizationRole {
  const normalized = normalizeRole(value);
  return APPROVAL_ROLES.includes(normalized) ? normalized : "viewer";
}

function formatRole(role: unknown) {
  const normalized = normalizeRole(role);
  if (normalized === "platform_owner") return "Platform Owner";
  if (normalized === "org_admin") return "Organization Admin";
  if (normalized === "sim_ops") return "Sim Ops";
  if (normalized === "faculty") return "Faculty";
  if (normalized === "sp") return "SP";
  return "Viewer";
}

type AccessRequestStatus = "pending" | "approved" | "invited" | "denied" | "unknown";

function normalizeAccessRequestStatus(value: unknown): AccessRequestStatus {
  const status = asText(value).toLowerCase();
  if (status === "pending" || status === "approved" || status === "invited" || status === "denied") return status;
  return "unknown";
}

function formatAccessRequestStatus(value: unknown) {
  const normalized = normalizeAccessRequestStatus(value);
  if (normalized === "pending") return "Pending";
  if (normalized === "approved") return "Approved";
  if (normalized === "invited") return "Invited";
  if (normalized === "denied") return "Denied";
  return "Unknown";
}

function formatDate(value: string | null | undefined) {
  const text = asText(value);
  if (!text) return "Not available";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
}

function domainsToText(value: string[] | null | undefined) {
  if (!Array.isArray(value) || value.length === 0) return "";
  return value.join(", ");
}

function parseDomains(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/g)
        .map((item) => asText(item).replace(/^@+/, "").toLowerCase())
      .filter(Boolean)
    )
  );
}

function organizationsFromMemberships(memberships: MeResponse["memberships"]) {
  if (!Array.isArray(memberships)) return [] as OrganizationOption[];
  return memberships
    .map((membership) => {
      const id = asText(membership.organization_id || membership.organization?.id);
      if (!id) return null;
      return {
        id,
        name: asText(membership.organization?.name) || "Organization",
        slug: asText(membership.organization?.slug) || null,
        role: asText(membership.role) || "viewer",
        status: asText(membership.status || membership.organization?.status) || "active",
        isActive: false,
      } satisfies OrganizationOption;
    })
    .filter(Boolean) as OrganizationOption[];
}

export default function UsersAndAccessPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeOrgName, setActiveOrgName] = useState("Organization");
  const [activeOrgId, setActiveOrgId] = useState("");
  const [organizationRole, setOrganizationRole] = useState<OrganizationRole>("viewer");
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [organizationsError, setOrganizationsError] = useState("");
  const [organizationMessage, setOrganizationMessage] = useState("");
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationOption[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [organizationSwitching, setOrganizationSwitching] = useState(false);
  const [organizationCreateSaving, setOrganizationCreateSaving] = useState(false);
  const [newOrganizationDraft, setNewOrganizationDraft] = useState<NewOrganizationDraft>({
    name: "",
    slug: "",
    initialAccessCode: "",
    createInitialAccessCode: false,
  });

  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [requestRoleOverrides, setRequestRoleOverrides] = useState<Record<string, OrganizationRole>>({});
  const [requestActionId, setRequestActionId] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, OrganizationRole>>({});
  const [memberSpLinkDrafts, setMemberSpLinkDrafts] = useState<Record<string, string>>({});
  const [memberSpFilters, setMemberSpFilters] = useState<Record<string, string>>({});
  const [memberActionId, setMemberActionId] = useState("");
  const [memberMessage, setMemberMessage] = useState("");
  const [spDirectoryLoading, setSpDirectoryLoading] = useState(false);
  const [spDirectoryError, setSpDirectoryError] = useState("");
  const [spDirectory, setSpDirectory] = useState<SpDirectoryItem[]>([]);

  const [codesLoading, setCodesLoading] = useState(false);
  const [codesError, setCodesError] = useState("");
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [codeDrafts, setCodeDrafts] = useState<Record<string, AccessCodeDraft>>({});
  const [codeActionId, setCodeActionId] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [newCodeDraft, setNewCodeDraft] = useState<AccessCodeDraft>({
    label: "",
    domainsText: "",
    defaultRole: "viewer",
    active: true,
    requiresManualApproval: true,
  });
  const [newCodeText, setNewCodeText] = useState("");

  const pendingRequests = useMemo(
    () => accessRequests.filter((request) => asText(request.status).toLowerCase() === "pending").length,
    [accessRequests]
  );

  const loadAccessRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError("");
    try {
      const response = await fetch("/api/access-requests", {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as AccessRequestResponse | null;
      if (!response.ok) {
        setRequestsError("Could not load access requests.");
        return;
      }
      const next = Array.isArray(body?.accessRequests) ? body.accessRequests : [];
      setAccessRequests(next);
      setRequestRoleOverrides(
        Object.fromEntries(next.map((request) => [request.id, normalizeApprovalRole(request.requested_role)]))
      );
    } catch {
      setRequestsError("Could not load access requests.");
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError("");
    try {
      const response = await fetch("/api/staff", {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as StaffResponse | null;
      if (!response.ok) {
        setMembersError(asText(body?.error) || "Could not load active users.");
        return;
      }
      const next = Array.isArray(body?.members) ? body.members : [];
      setMembers(next);
      setMemberRoleDrafts(
        Object.fromEntries(
          next.map((member) => [member.id, normalizeApprovalRole(member.organization_role || member.role)])
        )
      );
      setMemberSpLinkDrafts((current) =>
        Object.fromEntries(
          next.map((member) => [
            member.id,
            asText(member.sp_link_sp_id) || asText(current[member.id]),
          ])
        )
      );
    } catch (error) {
      setMembersError(error instanceof Error ? error.message : "Could not load active users.");
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const loadSpDirectory = useCallback(async () => {
    setSpDirectoryLoading(true);
    setSpDirectoryError("");
    try {
      const response = await fetch("/api/sps", {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as SpDirectoryResponse | null;
      if (!response.ok) {
        setSpDirectoryError(asText(body?.error) || "Could not load SP directory.");
        return;
      }
      const rows = Array.isArray(body?.sps) ? body.sps : [];
      const next = rows
        .map((sp) => {
          const id = asText(sp.id);
          if (!id) return null;
          const name =
            asText(sp.full_name) ||
            [asText(sp.first_name), asText(sp.last_name)].filter(Boolean).join(" ") ||
            "Unnamed SP";
          return {
            id,
            name,
            working_email: asText(sp.working_email),
            email: asText(sp.email),
          } satisfies SpDirectoryItem;
        })
        .filter(Boolean) as SpDirectoryItem[];
      next.sort((a, b) => a.name.localeCompare(b.name));
      setSpDirectory(next);
    } catch (error) {
      setSpDirectoryError(error instanceof Error ? error.message : "Could not load SP directory.");
    } finally {
      setSpDirectoryLoading(false);
    }
  }, []);

  function hydrateCodeDrafts(codes: AccessCode[]) {
    setCodeDrafts(
      Object.fromEntries(
        codes.map((code) => [
          code.id,
          {
            label: asText(code.label),
            domainsText: domainsToText(code.allowed_email_domains),
            defaultRole: normalizeApprovalRole(code.default_requested_role),
            active: code.active !== false,
            requiresManualApproval: code.requires_manual_approval !== false,
          },
        ])
      )
    );
  }

  const loadAccessCodes = useCallback(async () => {
    setCodesLoading(true);
    setCodesError("");
    try {
      const response = await fetch("/api/organization-access-codes", {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as AccessCodesResponse | null;
      if (!response.ok) {
        setCodesError(asText(body?.error) || "Could not load organization access codes.");
        return;
      }
      const next = Array.isArray(body?.accessCodes) ? body.accessCodes : [];
      setAccessCodes(next);
      hydrateCodeDrafts(next);
    } catch (error) {
      setCodesError(error instanceof Error ? error.message : "Could not load organization access codes.");
    } finally {
      setCodesLoading(false);
    }
  }, []);

  const loadOrganizations = useCallback(async () => {
    setOrganizationsLoading(true);
    setOrganizationsError("");
    try {
      const response = await fetch("/api/organizations", {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as OrganizationsResponse | null;
      if (!response.ok) {
        setOrganizationsError(asText(body?.error) || "Could not load organizations.");
        return;
      }

      const organizations = Array.isArray(body?.organizations)
        ? body.organizations
            .filter((organization) => asText(organization.id))
            .map((organization) => ({
              ...organization,
              id: asText(organization.id),
              name: asText(organization.name) || "Organization",
            }))
        : [];
      const nextActiveOrgId = asText(body?.activeOrganization?.id);
      const normalized = organizations.map((organization) => ({
        ...organization,
        isActive: organization.id === nextActiveOrgId,
      }));
      setOrganizationOptions(normalized);
      if (nextActiveOrgId) {
        setActiveOrgId(nextActiveOrgId);
        setSelectedOrganizationId(nextActiveOrgId);
      } else if (normalized[0]?.id) {
        setActiveOrgId(normalized[0].id);
        setSelectedOrganizationId(normalized[0].id);
      }
      setActiveOrgName(
        asText(body?.activeOrganization?.name) ||
          normalized.find((organization) => organization.id === nextActiveOrgId)?.name ||
          normalized[0]?.name ||
          "Organization"
      );
    } catch (error) {
      setOrganizationsError(error instanceof Error ? error.message : "Could not load organizations.");
    } finally {
      setOrganizationsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setAuthLoading(true);
      try {
        const meResponse = await fetch("/api/me", { cache: "no-store", credentials: "include" });
        if (meResponse.status === 401) {
          router.replace("/login");
          return;
        }

        const meBody = (await meResponse.json().catch(() => null)) as MeResponse | null;
        const role = normalizeRole(meBody?.role || meBody?.profile?.organization_role || meBody?.profile?.role);
        const canManage = role === "platform_owner" || role === "org_admin";
        const meOrganizations = organizationsFromMemberships(meBody?.memberships);
        const meActiveOrganizationId = asText(meBody?.activeOrganization?.id);

        if (cancelled) return;
        setOrganizationRole(role);
        setAuthorized(canManage);
        setActiveOrgId(meActiveOrganizationId);
        setSelectedOrganizationId(meActiveOrganizationId);
        setActiveOrgName(
          asText(meBody?.activeOrganization?.name) ||
            meOrganizations.find((organization) => organization.id === meActiveOrganizationId)?.name ||
            meOrganizations[0]?.name ||
            "Organization"
        );
        if (meOrganizations.length) {
          setOrganizationOptions((current) => (current.length ? current : meOrganizations));
        }

        if (!canManage) return;

        await Promise.all([loadOrganizations(), loadAccessRequests(), loadMembers(), loadAccessCodes(), loadSpDirectory()]);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [loadAccessCodes, loadAccessRequests, loadMembers, loadOrganizations, loadSpDirectory, router]);

  async function handleAccessRequestAction(requestId: string, action: "approve" | "deny") {
    setRequestActionId(requestId);
    setRequestMessage("");
    try {
      const response = await fetch("/api/access-requests", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId,
          action,
          role: requestRoleOverrides[requestId] || "viewer",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; status?: string; inviteSent?: boolean; warning?: string } | null;
      if (!response.ok) {
        setRequestMessage(asText(body?.error) || "Could not update access request.");
        return;
      }
      await Promise.all([loadAccessRequests(), loadMembers()]);
      if (action === "deny") {
        setRequestMessage("Access request denied.");
      } else {
        setRequestMessage(
          body?.inviteSent
            ? `Access request approved and invite sent.${body?.warning ? ` ${body.warning}` : ""}`
            : `Access request approved.${body?.warning ? ` ${body.warning}` : ""}`
        );
      }
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : "Could not update access request.");
    } finally {
      setRequestActionId("");
    }
  }

  async function handleMemberAction(userId: string, action: "change_role" | "suspend" | "remove") {
    if ((action === "suspend" || action === "remove") && typeof window !== "undefined") {
      const confirmed = window.confirm(
        action === "suspend" ? "Suspend this organization member?" : "Remove this organization member?"
      );
      if (!confirmed) return;
    }

    setMemberActionId(userId);
    setMemberMessage("");
    try {
      const response = await fetch("/api/staff", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action,
          role: memberRoleDrafts[userId] || "viewer",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setMemberMessage(asText(body?.error) || "Could not update user.");
        return;
      }

      await loadMembers();
      setMemberMessage(
        action === "change_role"
          ? "Role updated."
          : action === "suspend"
            ? "Membership suspended."
            : "Membership removed."
      );
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : "Could not update user.");
    } finally {
      setMemberActionId("");
    }
  }

  async function handleMemberSpLink(userId: string) {
    const spId = asText(memberSpLinkDrafts[userId]);
    if (!spId) {
      setMemberMessage("Select an SP directory record first.");
      return;
    }

    setMemberActionId(userId);
    setMemberMessage("");
    try {
      const response = await fetch("/api/staff", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "link_sp",
          sp_id: spId,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        warning?: string;
        sp_name?: string;
      } | null;
      if (!response.ok) {
        setMemberMessage(asText(body?.error) || "Could not save SP directory link.");
        return;
      }

      await loadMembers();
      const warning = asText(body?.warning);
      setMemberMessage(
        warning
          ? `SP directory link saved. ${warning}`
          : `SP directory link saved${asText(body?.sp_name) ? ` (${asText(body?.sp_name)})` : ""}.`
      );
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : "Could not save SP directory link.");
    } finally {
      setMemberActionId("");
    }
  }

  async function handleMemberSpUnlink(userId: string) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Unlink this user from the SP directory record?");
      if (!confirmed) return;
    }

    setMemberActionId(userId);
    setMemberMessage("");
    try {
      const response = await fetch("/api/staff", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          action: "unlink_sp",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setMemberMessage(asText(body?.error) || "Could not clear SP directory link.");
        return;
      }

      await loadMembers();
      setMemberSpLinkDrafts((current) => ({
        ...current,
        [userId]: "",
      }));
      setMemberMessage("SP directory link cleared.");
    } catch (error) {
      setMemberMessage(error instanceof Error ? error.message : "Could not clear SP directory link.");
    } finally {
      setMemberActionId("");
    }
  }

  async function handleCreateAccessCode() {
    setCodeMessage("");
    setCodeActionId("create");
    try {
      const response = await fetch("/api/organization-access-codes", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCodeText,
          label: newCodeDraft.label,
          allowed_email_domains: parseDomains(newCodeDraft.domainsText),
          default_requested_role: newCodeDraft.defaultRole,
          active: newCodeDraft.active,
          requires_manual_approval: newCodeDraft.requiresManualApproval,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setCodeMessage(asText(body?.error) || "Could not create access code.");
        return;
      }
      await loadAccessCodes();
      setCodeMessage("Access code created.");
      setNewCodeText("");
      setNewCodeDraft({
        label: "",
        domainsText: "",
        defaultRole: "viewer",
        active: true,
        requiresManualApproval: true,
      });
    } catch (error) {
      setCodeMessage(error instanceof Error ? error.message : "Could not create access code.");
    } finally {
      setCodeActionId("");
    }
  }

  async function handleSaveAccessCode(codeId: string) {
    const draft = codeDrafts[codeId];
    if (!draft) return;
    setCodeMessage("");
    setCodeActionId(codeId);
    try {
      const response = await fetch("/api/organization-access-codes", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: codeId,
          label: draft.label,
          allowed_email_domains: parseDomains(draft.domainsText),
          default_requested_role: draft.defaultRole,
          active: draft.active,
          requires_manual_approval: draft.requiresManualApproval,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setCodeMessage(asText(body?.error) || "Could not update access code.");
        return;
      }
      await loadAccessCodes();
      setCodeMessage("Access code updated.");
    } catch (error) {
      setCodeMessage(error instanceof Error ? error.message : "Could not update access code.");
    } finally {
      setCodeActionId("");
    }
  }

  async function handleCopyCode(code: string) {
    try {
      if (!navigator.clipboard) {
        setCodeMessage("Clipboard is unavailable in this browser.");
        return;
      }
      await navigator.clipboard.writeText(code);
      setCodeMessage(`Copied code ${code}.`);
    } catch {
      setCodeMessage("Could not copy access code.");
    }
  }

  async function handleOrganizationSwitch() {
    const organizationId = asText(selectedOrganizationId);
    if (!organizationId || organizationId === activeOrgId) return;
    setOrganizationSwitching(true);
    setOrganizationMessage("");
    setOrganizationsError("");
    try {
      const response = await fetch("/api/organizations/switch", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; activeOrganization?: { name?: string | null; id?: string | null } | null } | null;
      if (!response.ok) {
        setOrganizationMessage(asText(body?.error) || "Failed to switch organization.");
        return;
      }
      const switchedId = asText(body?.activeOrganization?.id) || organizationId;
      const switchedName =
        asText(body?.activeOrganization?.name) ||
        organizationOptions.find((organization) => organization.id === switchedId)?.name ||
        "Organization";
      setActiveOrgId(switchedId);
      setActiveOrgName(switchedName);
      setSelectedOrganizationId(switchedId);
      setOrganizationMessage("Organization switched.");
      await Promise.all([loadOrganizations(), loadAccessRequests(), loadMembers(), loadAccessCodes(), loadSpDirectory()]);
      router.refresh();
    } catch (error) {
      setOrganizationMessage(error instanceof Error ? error.message : "Failed to switch organization.");
    } finally {
      setOrganizationSwitching(false);
    }
  }

  async function handleCreateOrganization() {
    const name = asText(newOrganizationDraft.name);
    if (!name) {
      setOrganizationMessage("Organization name is required.");
      return;
    }
    if (organizationRole !== "platform_owner") {
      setOrganizationMessage("You do not have permission to create organizations.");
      return;
    }

    setOrganizationCreateSaving(true);
    setOrganizationMessage("");
    setOrganizationsError("");
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: asText(newOrganizationDraft.slug),
          initial_access_code: asText(newOrganizationDraft.initialAccessCode),
          create_initial_access_code: newOrganizationDraft.createInitialAccessCode,
        }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; organization?: { id?: string | null; name?: string | null } | null } | null;
      if (!response.ok) {
        setOrganizationMessage(asText(body?.error) || "Failed to create organization.");
        return;
      }

      setOrganizationMessage("Organization created.");
      setNewOrganizationDraft({
        name: "",
        slug: "",
        initialAccessCode: "",
        createInitialAccessCode: false,
      });
      const createdOrgId = asText(body?.organization?.id);
      const createdOrgName = asText(body?.organization?.name);
      if (createdOrgId) {
        setActiveOrgId(createdOrgId);
        setSelectedOrganizationId(createdOrgId);
      }
      if (createdOrgName) setActiveOrgName(createdOrgName);
      await Promise.all([loadOrganizations(), loadAccessRequests(), loadMembers(), loadAccessCodes(), loadSpDirectory()]);
      router.refresh();
    } catch (error) {
      setOrganizationMessage(error instanceof Error ? error.message : "Failed to create organization.");
    } finally {
      setOrganizationCreateSaving(false);
    }
  }

  const canCreateOrganizations = organizationRole === "platform_owner";
  const hasOtherOrganizations = organizationOptions.length > 1;

  return (
    <SiteShell
      title="User Management"
      subtitle="Manage organization access, pending requests, roles, and access codes."
    >
      <div className="grid gap-5">
        <section className="rounded-[20px] border border-[var(--cfsp-border)] bg-white px-5 py-4">
          <p className="cfsp-kicker">Organization</p>
          <h1 className="mt-1 text-2xl font-black text-[var(--cfsp-text)]">User Access Queue</h1>
          <p className="mt-2 text-sm font-semibold text-[var(--cfsp-text-muted)]">
            Active organization: <span className="font-black text-[var(--cfsp-text)]">{activeOrgName}</span>
          </p>

          {organizationMessage ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {organizationMessage}
            </div>
          ) : null}
          {organizationsError ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {organizationsError}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <article className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] p-4">
              <p className="cfsp-kicker">Switch organization</p>
              <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
                <select
                  value={selectedOrganizationId}
                  onChange={(event) => setSelectedOrganizationId(event.target.value)}
                  disabled={organizationsLoading || organizationSwitching || organizationOptions.length === 0}
                  className="cfsp-input"
                  aria-label="Choose organization"
                >
                  {organizationOptions.length === 0 ? (
                    <option value="">{organizationsLoading ? "Loading organizations..." : "No organizations available"}</option>
                  ) : (
                    organizationOptions.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={() => void handleOrganizationSwitch()}
                  disabled={
                    organizationsLoading ||
                    organizationSwitching ||
                    !selectedOrganizationId ||
                    selectedOrganizationId === activeOrgId
                  }
                  className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                >
                  {organizationSwitching ? "Switching..." : "Switch Workspace"}
                </button>
              </div>
              <p className="mt-2 text-xs font-semibold text-[var(--cfsp-text-muted)]">
                {hasOtherOrganizations
                  ? `${organizationOptions.length} workspaces available.`
                  : organizationsLoading
                    ? "Loading organizations..."
                    : "No other organizations yet."}
              </p>
            </article>

            <article className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] p-4">
              <p className="cfsp-kicker">Create organization</p>
              {canCreateOrganizations ? (
                <>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="grid gap-1">
                      <span className="cfsp-label">Organization name</span>
                      <input
                        value={newOrganizationDraft.name}
                        onChange={(event) =>
                          setNewOrganizationDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        className="cfsp-input"
                        placeholder="Simulation Operations Workspace"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="cfsp-label">Workspace slug (optional)</span>
                      <input
                        value={newOrganizationDraft.slug}
                        onChange={(event) =>
                          setNewOrganizationDraft((current) => ({
                            ...current,
                            slug: event.target.value,
                          }))
                        }
                        className="cfsp-input"
                        placeholder="sim-ops-workspace"
                      />
                    </label>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                    <label className="grid gap-1">
                      <span className="cfsp-label">First access code (optional)</span>
                      <input
                        value={newOrganizationDraft.initialAccessCode}
                        onChange={(event) =>
                          setNewOrganizationDraft((current) => ({
                            ...current,
                            initialAccessCode: event.target.value,
                          }))
                        }
                        className="cfsp-input"
                        placeholder="CFSP-SUMMER26"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm font-black text-[var(--cfsp-text)]">
                      <input
                        type="checkbox"
                        checked={newOrganizationDraft.createInitialAccessCode}
                        onChange={(event) =>
                          setNewOrganizationDraft((current) => ({
                            ...current,
                            createInitialAccessCode: event.target.checked,
                          }))
                        }
                      />
                      Create first access code
                    </label>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void handleCreateOrganization()}
                      disabled={organizationCreateSaving}
                      className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                    >
                      {organizationCreateSaving ? "Creating..." : "Create Organization"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-[var(--cfsp-text-muted)]">
                    {organizationOptions.length === 0
                      ? "Create your first organization."
                      : "New organizations are added to your workspace list immediately."}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                  You do not have permission to create organizations.
                </p>
              )}
            </article>
          </div>
        </section>

        {authLoading ? (
          <section className="rounded-[16px] border border-[var(--cfsp-border)] bg-white px-5 py-5 text-sm font-semibold text-[var(--cfsp-text-muted)]">
            Loading users and access controls...
          </section>
        ) : !authorized ? (
          <section className="rounded-[16px] border border-red-200 bg-red-50 px-5 py-5">
            <h2 className="text-lg font-black text-red-700">Restricted</h2>
            <p className="mt-2 text-sm font-semibold text-red-700">
              Only admins and platform owners can access User Management.
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-[16px] border border-[var(--cfsp-border)] bg-white px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="cfsp-kicker">Pending Access Requests</p>
                  <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">Review and approve access</h2>
                </div>
                <span className="rounded-full border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">
                  {pendingRequests} pending
                </span>
              </div>

              {requestsError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                  Could not load access requests.
                </div>
              ) : null}
              {requestMessage ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                  {requestMessage}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3">
                {requestsLoading ? (
                  <div className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                    Loading access requests...
                  </div>
                ) : accessRequests.length === 0 ? (
                  <div className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                    No access requests found for this organization.
                  </div>
                ) : (
                  accessRequests.map((request) => {
                    const status = normalizeAccessRequestStatus(request.status);
                    const pending = status === "pending";
                    return (
                      <article key={request.id} className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4">
                        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.9fr_0.9fr_auto] lg:items-end">
                          <div>
                            <h3 className="text-base font-black text-[var(--cfsp-text)]">{request.full_name}</h3>
                            <div className="mt-1 text-sm font-semibold text-[var(--cfsp-text-muted)]">{request.email}</div>
                            {request.note ? <p className="mt-2 text-sm font-semibold text-[var(--cfsp-text-muted)]">{request.note}</p> : null}
                          </div>
                          <label className="grid gap-1">
                            <span className="cfsp-label">Role</span>
                            <select
                              value={requestRoleOverrides[request.id] || normalizeApprovalRole(request.requested_role)}
                              onChange={(event) =>
                                setRequestRoleOverrides((current) => ({
                                  ...current,
                                  [request.id]: normalizeApprovalRole(event.target.value),
                                }))
                              }
                              disabled={!pending}
                              className="cfsp-input"
                            >
                              {APPROVAL_ROLES.map((role) => (
                                <option key={`request-role-${request.id}-${role}`} value={role}>
                                  {formatRole(role)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div>
                            <div className="cfsp-label">Status</div>
                            <div className="mt-1 text-sm font-black text-[var(--cfsp-text)]">{formatAccessRequestStatus(request.status)}</div>
                            <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">{formatDate(request.created_at)}</div>
                          </div>
                          {pending ? (
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                              <button
                                type="button"
                                onClick={() => void handleAccessRequestAction(request.id, "approve")}
                                disabled={requestActionId === request.id}
                                className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                              >
                                Approve &amp; Invite
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleAccessRequestAction(request.id, "deny")}
                                disabled={requestActionId === request.id}
                                className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                              >
                                Deny
                              </button>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-[var(--cfsp-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--cfsp-text-muted)]">
                              {status === "approved" || status === "invited"
                                ? "Managed in Active Users"
                                : "Request closed"}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-[16px] border border-[var(--cfsp-border)] bg-white px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="cfsp-kicker">Active Users</p>
                  <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">Organization memberships</h2>
                </div>
                <span className="rounded-full border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">
                  {members.length} active
                </span>
              </div>

              {membersError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                  {membersError}
                </div>
              ) : null}
              {memberMessage ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                  {memberMessage}
                </div>
              ) : null}
              {spDirectoryError ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                  {spDirectoryError}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3">
                {membersLoading ? (
                  <div className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                    Loading members...
                  </div>
                ) : members.length === 0 ? (
                  <div className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                    No active users found in this organization.
                  </div>
                ) : (
                  members.map((member) => {
                    const organizationRole = normalizeRole(member.organization_role || member.role);
                    const isPlatformOwnerMember = organizationRole === "platform_owner";
                    const isSpMember = normalizeRole(member.organization_role || member.role) === "sp";
                    const memberSpStatus = asText(member.sp_link_status).toLowerCase() === "linked" ? "linked" : "pending";
                    const memberSpLinkSource = asText(member.sp_link_matched_by);
                    const hasDurableSpLink = Boolean(asText(member.sp_link_sp_id)) && memberSpLinkSource === "membership_sp_id";
                    const linkedSpName = asText(member.sp_link_name);
                    const linkedSpEmail = asText(member.sp_link_email);
                    const linkedSpLabel = [linkedSpName, linkedSpEmail].filter(Boolean).join(" · ") || asText(member.sp_link_sp_id);
                    const filterText = asText(memberSpFilters[member.id]).toLowerCase();
                    const selectedSpId = asText(memberSpLinkDrafts[member.id]);
                    const linkCandidates = spDirectory
                      .filter((sp) => {
                        if (!filterText) return true;
                        const haystack = [sp.name, sp.working_email, sp.email].map((value) => asText(value).toLowerCase()).join(" ");
                        return haystack.includes(filterText);
                      })
                      .slice(0, 80);
                    return (
                      <article key={member.id} className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4">
                        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.9fr_1.1fr_auto] lg:items-end">
                          <div>
                            <h3 className="text-base font-black text-[var(--cfsp-text)]">{member.full_name || "Unnamed member"}</h3>
                            <div className="mt-1 text-sm font-semibold text-[var(--cfsp-text-muted)]">{member.email || "No email"}</div>
                            <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">Created {formatDate(member.created_at)}</div>
                          </div>
                          <div>
                            <div className="cfsp-label">Status</div>
                            <div className="mt-1 text-sm font-black text-[var(--cfsp-text)]">{asText(member.status) || "active"}</div>
                            <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">Updated {formatDate(member.updated_at)}</div>
                          </div>
                          {isPlatformOwnerMember ? (
                            <div className="grid gap-1">
                              <span className="cfsp-label">Role</span>
                              <span className="rounded-lg border border-[var(--cfsp-border)] bg-white px-3 py-2 text-sm font-black text-[var(--cfsp-text)]">
                                Platform Owner
                              </span>
                            </div>
                          ) : (
                            <div className="grid gap-2">
                              <label className="grid gap-1">
                                <span className="cfsp-label">Role</span>
                                <select
                                  value={memberRoleDrafts[member.id] || normalizeApprovalRole(member.organization_role || member.role)}
                                  onChange={(event) =>
                                    setMemberRoleDrafts((current) => ({
                                      ...current,
                                      [member.id]: normalizeApprovalRole(event.target.value),
                                    }))
                                  }
                                  className="cfsp-input"
                                >
                                  {APPROVAL_ROLES.map((role) => (
                                    <option key={`member-role-${member.id}-${role}`} value={role}>
                                      {formatRole(role)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              {isSpMember ? (
                                <div className="grid gap-2">
                                  <div className="rounded-lg border border-[var(--cfsp-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--cfsp-text-muted)]">
                                    {hasDurableSpLink
                                      ? `Linked SP: ${linkedSpLabel || "SP directory record"}`
                                      : memberSpStatus === "linked"
                                        ? `SP linked${linkedSpLabel ? `: ${linkedSpLabel}` : ""}`
                                      : "SP Directory link pending"}
                                  </div>
                                  {hasDurableSpLink ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleMemberSpUnlink(member.id)}
                                      disabled={memberActionId === member.id}
                                      className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                                      style={{ borderColor: "rgba(185, 28, 28, 0.35)", color: "#b91c1c" }}
                                    >
                                      Unlink SP
                                    </button>
                                  ) : memberSpStatus !== "linked" ? (
                                    <>
                                      <input
                                        value={memberSpFilters[member.id] || ""}
                                        onChange={(event) =>
                                          setMemberSpFilters((current) => ({
                                            ...current,
                                            [member.id]: event.target.value,
                                          }))
                                        }
                                        className="cfsp-input"
                                        placeholder="Search SP by name or email"
                                        disabled={spDirectoryLoading || memberActionId === member.id}
                                      />
                                      <select
                                        value={selectedSpId}
                                        onChange={(event) =>
                                          setMemberSpLinkDrafts((current) => ({
                                            ...current,
                                            [member.id]: event.target.value,
                                          }))
                                        }
                                        className="cfsp-input"
                                        disabled={spDirectoryLoading || memberActionId === member.id || linkCandidates.length === 0}
                                      >
                                        <option value="">
                                          {spDirectoryLoading
                                            ? "Loading SP directory..."
                                            : linkCandidates.length
                                              ? "Select SP directory record"
                                              : "No matching SP records"}
                                        </option>
                                        {linkCandidates.map((sp) => (
                                          <option key={`${member.id}:${sp.id}`} value={sp.id}>
                                            {sp.name}
                                            {sp.working_email ? ` · ${sp.working_email}` : sp.email ? ` · ${sp.email}` : ""}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => void handleMemberSpLink(member.id)}
                                        disabled={!selectedSpId || memberActionId === member.id || spDirectoryLoading}
                                        className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                                      >
                                        Link SP Directory
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          )}
                          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                            <button
                              type="button"
                              onClick={() => void handleMemberAction(member.id, "change_role")}
                              disabled={memberActionId === member.id || isPlatformOwnerMember}
                              className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                            >
                              Change Role
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMemberAction(member.id, "suspend")}
                              disabled={memberActionId === member.id || isPlatformOwnerMember}
                              className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                            >
                              Suspend
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleMemberAction(member.id, "remove")}
                              disabled={memberActionId === member.id || isPlatformOwnerMember}
                              className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-[16px] border border-[var(--cfsp-border)] bg-white px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="cfsp-kicker">Organization Access Codes</p>
                  <h2 className="mt-1 text-xl font-black text-[var(--cfsp-text)]">Invite and access controls</h2>
                </div>
                <span className="rounded-full border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-[var(--cfsp-text-muted)]">
                  {accessCodes.length} codes
                </span>
              </div>

              {codesError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                  {codesError}
                </div>
              ) : null}
              {codeMessage ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                  {codeMessage}
                </div>
              ) : null}

              <div className="mt-4 rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] p-4">
                <p className="cfsp-kicker">Create access code</p>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1">
                    <span className="cfsp-label">Code (optional)</span>
                    <input
                      value={newCodeText}
                      onChange={(event) => setNewCodeText(event.target.value)}
                      className="cfsp-input"
                      placeholder="Auto-generated if blank"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="cfsp-label">Label</span>
                    <input
                      value={newCodeDraft.label}
                      onChange={(event) => setNewCodeDraft((current) => ({ ...current, label: event.target.value }))}
                      className="cfsp-input"
                      placeholder="PA Spring Cohort"
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="cfsp-label">Default role</span>
                    <select
                      value={newCodeDraft.defaultRole}
                      onChange={(event) =>
                        setNewCodeDraft((current) => ({
                          ...current,
                          defaultRole: normalizeApprovalRole(event.target.value),
                        }))
                      }
                      className="cfsp-input"
                    >
                      {APPROVAL_ROLES.map((role) => (
                        <option key={`new-code-role-${role}`} value={role}>
                          {formatRole(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                  <label className="grid gap-1">
                    <span className="cfsp-label">Allowed email domains</span>
                    <input
                      value={newCodeDraft.domainsText}
                      onChange={(event) => setNewCodeDraft((current) => ({ ...current, domainsText: event.target.value }))}
                      className="cfsp-input"
                      placeholder="drexel.edu, partner.edu"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-black text-[var(--cfsp-text)]">
                    <input
                      type="checkbox"
                      checked={newCodeDraft.active}
                      onChange={(event) => setNewCodeDraft((current) => ({ ...current, active: event.target.checked }))}
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-2 text-sm font-black text-[var(--cfsp-text)]">
                    <input
                      type="checkbox"
                      checked={newCodeDraft.requiresManualApproval}
                      onChange={(event) =>
                        setNewCodeDraft((current) => ({
                          ...current,
                          requiresManualApproval: event.target.checked,
                        }))
                      }
                    />
                    Requires manual approval
                  </label>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void handleCreateAccessCode()}
                    disabled={codeActionId === "create"}
                    className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                  >
                    Create Access Code
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {codesLoading ? (
                  <div className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                    Loading access codes...
                  </div>
                ) : accessCodes.length === 0 ? (
                  <div className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4 text-sm font-semibold text-[var(--cfsp-text-muted)]">
                    No organization access codes found.
                  </div>
                ) : (
                  accessCodes.map((code) => {
                    const draft = codeDrafts[code.id] || {
                      label: asText(code.label),
                      domainsText: domainsToText(code.allowed_email_domains),
                      defaultRole: normalizeApprovalRole(code.default_requested_role),
                      active: code.active !== false,
                      requiresManualApproval: code.requires_manual_approval !== false,
                    };

                    return (
                      <article key={code.id} className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4">
                        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end">
                          <div>
                            <div className="cfsp-label">Code</div>
                            <div className="mt-1 text-sm font-black text-[var(--cfsp-text)]">{code.code}</div>
                            <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">Created {formatDate(code.created_at)}</div>
                          </div>
                          <label className="grid gap-1">
                            <span className="cfsp-label">Label</span>
                            <input
                              value={draft.label}
                              onChange={(event) =>
                                setCodeDrafts((current) => ({
                                  ...current,
                                  [code.id]: {
                                    ...draft,
                                    label: event.target.value,
                                  },
                                }))
                              }
                              className="cfsp-input"
                              placeholder="Label"
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="cfsp-label">Default role</span>
                            <select
                              value={draft.defaultRole}
                              onChange={(event) =>
                                setCodeDrafts((current) => ({
                                  ...current,
                                  [code.id]: {
                                    ...draft,
                                    defaultRole: normalizeApprovalRole(event.target.value),
                                  },
                                }))
                              }
                              className="cfsp-input"
                            >
                              {APPROVAL_ROLES.map((role) => (
                                <option key={`code-role-${code.id}-${role}`} value={role}>
                                  {formatRole(role)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                            <button
                              type="button"
                              onClick={() => void handleCopyCode(code.code)}
                              className="cfsp-btn cfsp-btn-secondary"
                            >
                              Copy Code
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCodeDrafts((current) => ({
                                  ...current,
                                  [code.id]: {
                                    ...draft,
                                    active: !draft.active,
                                  },
                                }))
                              }
                              className="cfsp-btn cfsp-btn-secondary"
                            >
                              {draft.active ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSaveAccessCode(code.id)}
                              disabled={codeActionId === code.id}
                              className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                          <label className="grid gap-1">
                            <span className="cfsp-label">Allowed email domains</span>
                            <input
                              value={draft.domainsText}
                              onChange={(event) =>
                                setCodeDrafts((current) => ({
                                  ...current,
                                  [code.id]: {
                                    ...draft,
                                    domainsText: event.target.value,
                                  },
                                }))
                              }
                              className="cfsp-input"
                              placeholder="drexel.edu, partner.edu"
                            />
                          </label>
                          <label className="flex items-center gap-2 text-sm font-black text-[var(--cfsp-text)]">
                            <input
                              type="checkbox"
                              checked={draft.requiresManualApproval}
                              onChange={(event) =>
                                setCodeDrafts((current) => ({
                                  ...current,
                                  [code.id]: {
                                    ...draft,
                                    requiresManualApproval: event.target.checked,
                                  },
                                }))
                              }
                            />
                            Requires manual approval
                          </label>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </SiteShell>
  );
}
