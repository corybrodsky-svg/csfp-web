"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SiteShell from "../components/SiteShell";
import {
  PEOPLE_ACCESS_ROLES,
  buildStaffPatchPayload,
  filterPeopleAccessMembers,
  getPeopleAccessRoleLabel,
  getPeopleAccessStatusLabel,
  getSpLinkReviewQueue,
  getSpLinkStatusLabel,
  memberNeedsPeopleAccessAttention,
  normalizePeopleAccessRole,
  normalizePeopleAccessStatus,
  normalizeSpLinkStatus,
  type PeopleAccessRole,
  type StaffPatchAction,
} from "../lib/peopleAccess";

type StaffMember = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  organization_role?: string;
  organization_id?: string;
  schedule_match_name: string;
  sp_link_status?: string;
  sp_link_sp_id?: string;
  sp_link_name?: string;
  sp_link_email?: string;
  sp_link_matched_by?: string;
  sp_link_reason?: string;
  sp_link_candidate_count?: number;
  sp_link_candidates?: Array<{
    sp_id: string;
    sp_name: string;
    sp_email: string;
    matched_by: string;
  }>;
  status: string;
  account_status?: string;
  account_status_label?: string;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type OrganizationSummary = {
  id: string;
  name: string;
  slug?: string | null;
  status?: string | null;
  role?: string | null;
  isActive?: boolean;
};

type MembershipSummary = {
  organization_id?: string | null;
  role?: string | null;
  status?: string | null;
  organization?: {
    id?: string | null;
    name?: string | null;
    slug?: string | null;
    status?: string | null;
  } | null;
};

type StaffSpOption = {
  id: string;
  name: string;
  email: string;
  organization_id: string;
};

type StaffResponse = {
  ok?: boolean;
  members?: StaffMember[];
  spDirectory?: StaffSpOption[];
  platformSpDirectory?: StaffSpOption[];
  limited?: boolean;
  role?: string;
  currentUserRole?: string | null;
  isPlatformOwner?: boolean;
  activeOrganization?: OrganizationSummary | null;
  memberships?: MembershipSummary[];
  warning?: string;
  error?: string;
};

type OrganizationsResponse = {
  organizations?: OrganizationSummary[];
  memberships?: MembershipSummary[];
};

type AccessRequest = {
  id: string;
  full_name: string;
  email: string;
  requested_role: string;
  approval_role?: string;
  note: string | null;
  status: string;
  created_at: string | null;
  auth_user_exists?: boolean;
  auth_user_id?: string | null;
  auth_user_confirmed?: boolean;
  auth_user_last_sign_in_at?: string | null;
  org_membership_exists?: boolean;
  org_membership_status?: string | null;
  membership_role?: string | null;
  role?: string | null;
  invite_sent?: boolean;
  invite_sent_at?: string | null;
  last_invite_status?: string | null;
};

type AccessRequestsResponse = {
  ok?: boolean;
  accessRequests?: AccessRequest[];
  error?: string;
};

type AccessRequestAction = "approve" | "deny" | "send_invite" | "generate_invite_link";

type AccessRequestActionResponse = {
  error?: string;
  status?: string;
  inviteSent?: boolean;
  inviteLink?: string;
  inviteLinkType?: string;
  warning?: string;
};

type SectionKey = "members" | "requests" | "sp-links" | "organizations";

const SECTION_LABELS: Array<{ key: SectionKey; label: string }> = [
  { key: "members", label: "Members" },
  { key: "requests", label: "Access Requests" },
  { key: "sp-links", label: "SP Link Review" },
  { key: "organizations", label: "Organizations" },
];

const ROLE_OPTIONS: Array<{ value: PeopleAccessRole; label: string }> = PEOPLE_ACCESS_ROLES.map((role) => ({
  value: role,
  label: getPeopleAccessRoleLabel(role),
}));

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function formatDate(value: string | null) {
  const text = asText(value);
  if (!text) return "Not available";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value: string | null | undefined) {
  const text = asText(value);
  if (!text) return "Not available";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
}

function formatBoolean(value: unknown) {
  return value ? "Yes" : "No";
}

function formatAccessRequestStatus(value: string) {
  const status = asText(value).toLowerCase();
  if (status === "pending") return "Pending";
  if (status === "approved") return "Approved";
  if (status === "invited") return "Invite Sent";
  if (status === "denied") return "Denied";
  return asText(value) || "Unknown";
}

function getRoleTone(role: unknown) {
  const normalized = normalizePeopleAccessRole(role);
  if (normalized === "org_admin") return { background: "#edf5fb", borderColor: "#c7dcee", color: "#165a96" };
  if (normalized === "sim_ops") return { background: "#f4f7fb", borderColor: "#d6e0e8", color: "#4f677d" };
  if (normalized === "sp") return { background: "#eaf7f2", borderColor: "#bfe4d6", color: "#196b57" };
  if (normalized === "viewer") return { background: "#fff6e8", borderColor: "#f1d1a7", color: "#a86411" };
  return { background: "#f5f3ff", borderColor: "#ddd6fe", color: "#6d28d9" };
}

function getStatusTone(status: unknown) {
  const normalized = normalizePeopleAccessStatus(status);
  if (normalized === "active") return { background: "#eaf7f2", borderColor: "#bfe4d6", color: "#196b57" };
  if (normalized === "suspended" || normalized === "inactive") {
    return { background: "#fff1f2", borderColor: "#fecdd3", color: "#9f1239" };
  }
  return { background: "#f4f7fb", borderColor: "#d6e0e8", color: "#5e7388" };
}

function getSpTone(member: StaffMember) {
  const status = normalizeSpLinkStatus(member.sp_link_status, member.organization_role || member.role);
  if (status === "linked") return { background: "#eaf7f2", borderColor: "#bfe4d6", color: "#196b57" };
  if (status === "not_applicable") return { background: "#f4f7fb", borderColor: "#d6e0e8", color: "#5e7388" };
  return { background: "#fff6e8", borderColor: "#f1d1a7", color: "#a86411" };
}

async function copyTextToClipboard(value: string) {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function includesSpOption(option: StaffSpOption, query: string) {
  if (!query) return true;
  return [option.name, option.email, option.id].map((value) => asText(value).toLowerCase()).some((value) => value.includes(query));
}

function AccessProgress({ request }: { request: AccessRequest }) {
  const status = asText(request.status).toLowerCase();
  const steps = [
    { key: "requested", label: "Requested", complete: true },
    { key: "approved", label: "Approved", complete: status === "approved" || status === "invited" },
    { key: "invited", label: "Invite Sent", complete: Boolean(request.invite_sent) || status === "invited" },
    { key: "activated", label: "Account Activated", complete: Boolean(request.auth_user_confirmed || request.auth_user_last_sign_in_at) },
  ];

  return (
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Access request progress">
      {steps.map((step) => (
        <li
          key={step.key}
          className="rounded-lg border px-3 py-2 text-xs font-black"
          style={
            step.complete
              ? { borderColor: "#bfe4d6", background: "#eaf7f2", color: "#196b57" }
              : { borderColor: "#dce6ee", background: "#ffffff", color: "#5e7388" }
          }
        >
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function PeopleAccessContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedSection = asText(searchParams.get("section")) as SectionKey;
  const [section, setSection] = useState<SectionKey>(
    SECTION_LABELS.some((item) => item.key === requestedSection) ? requestedSection : "members"
  );
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [spDirectory, setSpDirectory] = useState<StaffSpOption[]>([]);
  const [platformSpDirectory, setPlatformSpDirectory] = useState<StaffSpOption[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<OrganizationSummary | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [limited, setLimited] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [spLinkFilter, setSpLinkFilter] = useState("all");
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [requestRoleOverrides, setRequestRoleOverrides] = useState<Record<string, string>>({});
  const [requestMessage, setRequestMessage] = useState("");
  const [requestActionId, setRequestActionId] = useState("");
  const [requestInviteLinks, setRequestInviteLinks] = useState<Record<string, string>>({});
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);
  const [memberRole, setMemberRole] = useState<PeopleAccessRole>("viewer");
  const [selectedSpId, setSelectedSpId] = useState("");
  const [spSearch, setSpSearch] = useState("");
  const [modalBusyAction, setModalBusyAction] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [targetOrganizationId, setTargetOrganizationId] = useState("");
  const [targetOrganizationRole, setTargetOrganizationRole] = useState<PeopleAccessRole>("viewer");
  const [targetOrganizationSpId, setTargetOrganizationSpId] = useState("");
  const modalRef = useRef<HTMLDivElement | null>(null);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/staff", {
        cache: "no-store",
        credentials: "include",
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      const body = (await response.json().catch(() => null)) as StaffResponse | null;
      if (!response.ok) {
        setErrorMessage(asText(body?.error) || "Could not load People & Access.");
        return;
      }

      setMembers(Array.isArray(body?.members) ? body.members : []);
      setSpDirectory(Array.isArray(body?.spDirectory) ? body.spDirectory : []);
      setPlatformSpDirectory(Array.isArray(body?.platformSpDirectory) ? body.platformSpDirectory : []);
      setLimited(Boolean(body?.limited));
      setWarningMessage(asText(body?.warning));
      setActiveOrganization(body?.activeOrganization || null);
      setMemberships(Array.isArray(body?.memberships) ? body.memberships : []);
      setCurrentUserRole(asText(body?.currentUserRole || body?.role));
      setIsPlatformOwner(Boolean(body?.isPlatformOwner));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load People & Access.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const loadAccessRequests = useCallback(async () => {
    if (limited) return;
    const requestsResponse = await fetch("/api/access-requests", {
      cache: "no-store",
      credentials: "include",
    });
    const requestsBody = (await requestsResponse.json().catch(() => null)) as AccessRequestsResponse | null;
    if (!requestsResponse.ok) return;
    const nextRequests = Array.isArray(requestsBody?.accessRequests) ? requestsBody.accessRequests : [];
    setAccessRequests(nextRequests);
    setRequestRoleOverrides(
      Object.fromEntries(
        nextRequests.map((request) => [
          request.id,
          asText(request.approval_role || request.role || request.requested_role) || "viewer",
        ])
      )
    );
  }, [limited]);

  const loadOrganizations = useCallback(async () => {
    const response = await fetch("/api/organizations", {
      cache: "no-store",
      credentials: "include",
    });
    if (!response.ok) return;
    const body = (await response.json().catch(() => null)) as OrganizationsResponse | null;
    setOrganizations(Array.isArray(body?.organizations) ? body.organizations : []);
    if (Array.isArray(body?.memberships)) setMemberships(body.memberships);
  }, []);

  useEffect(() => {
    void loadStaff();
    void loadOrganizations();
  }, [loadOrganizations, loadStaff]);

  useEffect(() => {
    if (!limited) void loadAccessRequests();
  }, [limited, loadAccessRequests]);

  useEffect(() => {
    const nextSection = asText(searchParams.get("section")) as SectionKey;
    if (SECTION_LABELS.some((item) => item.key === nextSection)) setSection(nextSection);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedMember) return;
    const latestMember = members.find((member) => member.id === selectedMember.id);
    if (latestMember) setSelectedMember(latestMember);
  }, [members, selectedMember]);

  useEffect(() => {
    if (!selectedMember) return;
    const nextRole = normalizePeopleAccessRole(selectedMember.organization_role || selectedMember.role) || "viewer";
    setMemberRole(nextRole);
    setSelectedSpId(asText(selectedMember.sp_link_sp_id));
    setSpSearch("");
    setModalMessage("");
    setTargetOrganizationId("");
    setTargetOrganizationRole("viewer");
    setTargetOrganizationSpId("");
    window.setTimeout(() => modalRef.current?.focus(), 0);
  }, [selectedMember]);

  useEffect(() => {
    if (!selectedMember) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !modalBusyAction) setSelectedMember(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalBusyAction, selectedMember]);

  function selectSection(nextSection: SectionKey) {
    setSection(nextSection);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", nextSection);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleOrganizationChange(organizationId: string) {
    if (!organizationId || organizationId === asText(activeOrganization?.id)) return;
    const response = await fetch("/api/organizations/active", {
      method: "POST",
      cache: "no-store",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: organizationId }),
    });
    if (response.ok) window.location.reload();
  }

  async function refreshAfterMutation(message: string) {
    await loadStaff();
    await loadAccessRequests();
    setSuccessMessage(message);
  }

  async function runStaffAction(args: {
    action: StaffPatchAction;
    userId?: string;
    role?: string;
    spId?: string;
    success: string;
    close?: boolean;
  }) {
    const targetUserId = args.userId || selectedMember?.id || "";
    setModalBusyAction(args.action);
    setModalMessage("");
    setSuccessMessage("");
    setErrorMessage("");

    try {
      const payload = buildStaffPatchPayload({
        userId: targetUserId,
        action: args.action,
        role: args.role,
        spId: args.spId,
      });
      const response = await fetch("/api/staff", {
        method: "PATCH",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; warning?: string } | null;
      if (!response.ok) {
        const message = [asText(body?.error) || "Could not update this member.", asText(body?.warning)].filter(Boolean).join(" ");
        setModalMessage(message);
        return;
      }
      await refreshAfterMutation([args.success, asText(body?.warning)].filter(Boolean).join(" "));
      if (args.close) setSelectedMember(null);
    } catch (error) {
      setModalMessage(error instanceof Error ? error.message : "Could not update this member.");
    } finally {
      setModalBusyAction("");
    }
  }

  async function addMembershipToOrganization() {
    if (!selectedMember || !targetOrganizationId) {
      setModalMessage("Choose a target organization first.");
      return;
    }

    setModalBusyAction("add_membership");
    setModalMessage("");

    try {
      const response = await fetch("/api/staff/memberships", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: selectedMember.id,
          organization_id: targetOrganizationId,
          role: targetOrganizationRole,
          sp_id: targetOrganizationRole === "sp" ? targetOrganizationSpId : "",
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setModalMessage(asText(body?.error) || "Could not add this membership.");
        return;
      }
      await refreshAfterMutation("Membership added to the selected organization.");
      setModalMessage("Membership added. The current organization membership was not changed.");
    } catch (error) {
      setModalMessage(error instanceof Error ? error.message : "Could not add this membership.");
    } finally {
      setModalBusyAction("");
    }
  }

  async function handleAccessRequestAction(requestId: string, action: AccessRequestAction) {
    setRequestActionId(requestId);
    setRequestMessage("");
    setSuccessMessage("");

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
      const body = (await response.json().catch(() => null)) as AccessRequestActionResponse | null;
      if (!response.ok) {
        setRequestMessage([asText(body?.error) || "Could not update access request.", asText(body?.warning)].filter(Boolean).join(" "));
        return;
      }

      if (body?.inviteLink) {
        const copied = await copyTextToClipboard(body.inviteLink);
        setRequestInviteLinks((current) => ({ ...current, [requestId]: body.inviteLink || "" }));
        setRequestMessage(
          `${body.inviteLinkType === "recovery" ? "Setup" : "Invite"} link generated${copied ? " and copied" : ""}.${body.warning ? ` ${body.warning}` : ""}`
        );
      } else {
        setRequestMessage(
          action === "deny"
            ? "Access request denied."
            : action === "send_invite"
              ? `Invite email sent.${body?.warning ? ` ${body.warning}` : ""}`
              : body?.inviteSent
                ? `Access request approved and invite sent.${body.warning ? ` ${body.warning}` : ""}`
                : `Access request approved. Use Send Invite or Copy Invite Link to complete onboarding.${body?.warning ? ` ${body.warning}` : ""}`
        );
      }
      await loadAccessRequests();
      await loadStaff();
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : "Could not update access request.");
    } finally {
      setRequestActionId("");
    }
  }

  const organizationOptions = useMemo(() => {
    const fromOrganizations = organizations.map((organization) => ({
      id: asText(organization.id),
      name: asText(organization.name) || "Organization",
      status: asText(organization.status) || "active",
      role: asText(organization.role),
      isActive: Boolean(organization.isActive || asText(organization.id) === asText(activeOrganization?.id)),
    }));
    const fromMemberships = memberships
      .filter((membership) => asText(membership.organization_id) && asText(membership.organization?.name))
      .map((membership) => ({
        id: asText(membership.organization_id),
        name: asText(membership.organization?.name),
        status: asText(membership.organization?.status) || asText(membership.status) || "active",
        role: asText(membership.role),
        isActive: asText(membership.organization_id) === asText(activeOrganization?.id),
      }));
    return Array.from(new Map([...fromOrganizations, ...fromMemberships].map((item) => [item.id, item])).values())
      .filter((item) => item.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeOrganization?.id, memberships, organizations]);

  const visibleSections = useMemo(
    () => SECTION_LABELS.filter((item) => item.key !== "organizations" || isPlatformOwner),
    [isPlatformOwner]
  );
  const filteredMembers = useMemo(
    () =>
      filterPeopleAccessMembers(members, {
        search: searchTerm,
        role: roleFilter,
        status: statusFilter,
        spLinkStatus: spLinkFilter,
        needsAttention: needsAttentionOnly,
      }) as StaffMember[],
    [members, needsAttentionOnly, roleFilter, searchTerm, spLinkFilter, statusFilter]
  );
  const reviewMembers = useMemo(() => getSpLinkReviewQueue(members) as StaffMember[], [members]);
  const attentionCount = useMemo(() => members.filter(memberNeedsPeopleAccessAttention).length, [members]);
  const pendingAccessCount = useMemo(
    () => accessRequests.filter((request) => asText(request.status).toLowerCase() === "pending").length,
    [accessRequests]
  );
  const filteredSpOptions = useMemo(
    () => spDirectory.filter((option) => includesSpOption(option, spSearch.toLowerCase())),
    [spDirectory, spSearch]
  );
  const selectedMemberRole = selectedMember ? normalizePeopleAccessRole(selectedMember.organization_role || selectedMember.role) : "";
  const selectedMemberIsSp = memberRole === "sp";
  const targetOrganizationSpOptions = useMemo(
    () => platformSpDirectory.filter((option) => asText(option.organization_id) === asText(targetOrganizationId)),
    [platformSpDirectory, targetOrganizationId]
  );

  const pageSubtitle = activeOrganization
    ? `Manage organization memberships, access requests, roles, and SP-directory links for ${activeOrganization.name}.`
    : "Manage organization memberships, access requests, roles, and SP-directory links.";

  return (
    <SiteShell title="People & Access" subtitle={pageSubtitle}>
      <div className="grid gap-5">
        <section className="cfsp-panel px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="cfsp-kicker">Active organization</p>
              <h2 className="mt-2 text-[1.45rem] font-black text-[#14304f]">
                {activeOrganization?.name || "Organization"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e7388]">
                Displayed members, access requests, roles, and SP-directory links are scoped to the active organization.
                Schedule Alias is only used to match imported schedule text and does not control organization access.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
              <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                <div className="cfsp-label">Current role</div>
                <div className="mt-1 text-base font-black text-[#14304f]">{getPeopleAccessRoleLabel(currentUserRole)}</div>
              </div>
              <label className="grid gap-2 rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                <span className="cfsp-label">Organization</span>
                <select
                  value={asText(activeOrganization?.id)}
                  onChange={(event) => void handleOrganizationChange(event.target.value)}
                  disabled={organizationOptions.length <= 1}
                  className="cfsp-input"
                >
                  {organizationOptions.length ? (
                    organizationOptions.map((organization) => (
                      <option key={organization.id} value={organization.id}>
                        {organization.name}
                      </option>
                    ))
                  ) : (
                    <option value={asText(activeOrganization?.id)}>{activeOrganization?.name || "Organization"}</option>
                  )}
                </select>
              </label>
            </div>
          </div>
        </section>

        {warningMessage ? <div className="cfsp-alert cfsp-alert-info">{warningMessage}</div> : null}
        {errorMessage ? <div className="cfsp-alert cfsp-alert-error">{errorMessage}</div> : null}
        {successMessage ? <div className="cfsp-alert cfsp-alert-info">{successMessage}</div> : null}
        {requestMessage ? <div className="cfsp-alert cfsp-alert-info">{requestMessage}</div> : null}

        <nav className="cfsp-panel flex flex-wrap gap-2 px-3 py-3" aria-label="People and access sections">
          {visibleSections.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => selectSection(item.key)}
              className={`cfsp-btn ${section === item.key ? "cfsp-btn-primary" : "cfsp-btn-secondary"}`}
              aria-current={section === item.key ? "page" : undefined}
            >
              {item.label}
              {item.key === "members" ? ` (${members.length})` : ""}
              {item.key === "requests" ? ` (${pendingAccessCount})` : ""}
              {item.key === "sp-links" ? ` (${reviewMembers.length})` : ""}
            </button>
          ))}
        </nav>

        {section === "members" ? (
          <section className="grid gap-4">
            <div className="cfsp-panel px-5 py-5">
              <div className="grid gap-3 lg:grid-cols-[1.5fr_0.8fr_0.8fr_0.9fr_auto] lg:items-end">
                <label className="grid gap-2">
                  <span className="cfsp-label">Search</span>
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Name, email, role, alias, or SP record"
                    className="cfsp-input"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Role</span>
                  <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="cfsp-input">
                    <option value="all">All roles</option>
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">Status</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="cfsp-input">
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending">Pending</option>
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className="cfsp-label">SP link</span>
                  <select value={spLinkFilter} onChange={(event) => setSpLinkFilter(event.target.value)} className="cfsp-input">
                    <option value="all">All SP statuses</option>
                    <option value="linked">Linked</option>
                    <option value="needs_review">Needs review</option>
                    <option value="not_found">No match</option>
                    <option value="multiple_matches">Multiple matches</option>
                    <option value="invalid_organization">Invalid org link</option>
                  </select>
                </label>
                <label className="flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-3 py-2 text-sm font-bold text-[#14304f]">
                  <input
                    type="checkbox"
                    checked={needsAttentionOnly}
                    onChange={(event) => setNeedsAttentionOnly(event.target.checked)}
                  />
                  Needs attention ({attentionCount})
                </label>
              </div>
            </div>

            <div className="hidden overflow-hidden rounded-[12px] border border-[#dce6ee] bg-white lg:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-[#f8fbfd] text-xs uppercase tracking-[0.08em] text-[#5e7388]">
                  <tr>
                    <th className="px-4 py-3">Person</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Membership</th>
                    <th className="px-4 py-3">Schedule Alias</th>
                    <th className="px-4 py-3">SP Directory</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="px-4 py-5 font-semibold text-[#5e7388]" colSpan={7}>Loading members...</td></tr>
                  ) : filteredMembers.length === 0 ? (
                    <tr><td className="px-4 py-5 font-semibold text-[#5e7388]" colSpan={7}>No members match these filters.</td></tr>
                  ) : (
                    filteredMembers.map((member) => (
                      <tr key={member.id} className="border-t border-[#e6edf3]">
                        <td className="px-4 py-3">
                          <div className="font-black text-[#14304f]">{member.full_name || "Unnamed member"}</div>
                          <div className="mt-1 font-semibold text-[#5e7388]">{member.email || "No email"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="cfsp-badge" style={getRoleTone(member.organization_role || member.role)}>
                            {getPeopleAccessRoleLabel(member.organization_role || member.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="cfsp-badge" style={getStatusTone(member.status)}>
                            {getPeopleAccessStatusLabel(member.status)}
                          </span>
                          <div className="mt-1 text-xs font-semibold text-[#5e7388]">{activeOrganization?.name || "Active organization"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-[#14304f]">{member.schedule_match_name || "Not set"}</div>
                          <div className="mt-1 text-xs font-semibold text-[#5e7388]">Used only for schedule imports.</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="cfsp-badge" style={getSpTone(member)}>
                            {getSpLinkStatusLabel(member.sp_link_status, member.organization_role || member.role)}
                          </span>
                          {member.sp_link_name ? (
                            <div className="mt-1 text-xs font-semibold text-[#5e7388]">
                              {member.sp_link_name}{member.sp_link_email ? ` · ${member.sp_link_email}` : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#5e7388]">{formatDate(member.created_at)}</td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setSelectedMember(member)} className="cfsp-btn cfsp-btn-secondary">
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 lg:hidden">
              {loading ? (
                <div className="cfsp-panel px-5 py-5 text-sm font-semibold text-[#5e7388]">Loading members...</div>
              ) : filteredMembers.length === 0 ? (
                <div className="cfsp-panel px-5 py-5 text-sm font-semibold text-[#5e7388]">No members match these filters.</div>
              ) : (
                filteredMembers.map((member) => (
                  <article key={member.id} className="cfsp-panel px-5 py-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="m-0 break-words text-[1.15rem] font-black text-[#14304f]">{member.full_name || "Unnamed member"}</h3>
                        <div className="mt-1 break-words text-sm font-semibold text-[#5e7388]">{member.email || "No email"}</div>
                      </div>
                      <button type="button" onClick={() => setSelectedMember(member)} className="cfsp-btn cfsp-btn-secondary">
                        Manage
                      </button>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                        <div className="cfsp-label">Role</div>
                        <div className="mt-2 font-black text-[#14304f]">{getPeopleAccessRoleLabel(member.organization_role || member.role)}</div>
                      </div>
                      <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                        <div className="cfsp-label">Schedule Alias</div>
                        <div className="mt-2 font-black text-[#14304f]">{member.schedule_match_name || "Not set"}</div>
                        <div className="mt-1 text-xs font-semibold text-[#5e7388]">Used to match imported schedule text.</div>
                      </div>
                      <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                        <div className="cfsp-label">SP Directory</div>
                        <div className="mt-2 font-black text-[#14304f]">
                          {getSpLinkStatusLabel(member.sp_link_status, member.organization_role || member.role)}
                        </div>
                        {member.sp_link_name ? <div className="mt-1 text-xs font-semibold text-[#5e7388]">{member.sp_link_name}</div> : null}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}

        {section === "requests" ? (
          <section className="cfsp-panel px-5 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="cfsp-kicker">Access Requests</p>
                <h2 className="mt-2 text-[1.35rem] font-black text-[#14304f]">Organization access queue</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 font-semibold text-[#5e7388]">
                  The access code selects the organization. Approval creates or updates membership only for this organization.
                </p>
              </div>
              <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-3">
                <div className="cfsp-label">Pending</div>
                <div className="mt-1 text-xl font-black text-[#14304f]">{pendingAccessCount}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {accessRequests.length === 0 ? (
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4 text-sm font-semibold text-[#5e7388]">
                  No access requests found for this organization.
                </div>
              ) : (
                accessRequests.map((request) => {
                  const pending = asText(request.status).toLowerCase() === "pending";
                  const status = asText(request.status).toLowerCase();
                  const canInvite = status === "approved" || status === "invited";
                  const effectiveRole = request.membership_role || request.approval_role || request.role || request.requested_role;
                  const requestInviteLink = requestInviteLinks[request.id] || "";
                  return (
                    <article key={request.id} className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                      <div className="grid gap-4">
                        <div className="grid gap-3 lg:grid-cols-[1.3fr_0.8fr_0.8fr_auto] lg:items-end">
                          <div>
                            <h3 className="m-0 text-[1rem] font-black text-[#14304f]">{request.full_name}</h3>
                            <div className="mt-1 text-sm font-semibold text-[#5e7388]">{request.email}</div>
                            {request.note ? <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">{request.note}</p> : null}
                          </div>
                          <label className="grid gap-2">
                            <span className="cfsp-label">Approval role</span>
                            <select
                              value={requestRoleOverrides[request.id] || effectiveRole || "viewer"}
                              onChange={(event) =>
                                setRequestRoleOverrides((current) => ({ ...current, [request.id]: event.target.value }))
                              }
                              disabled={!pending}
                              className="cfsp-input"
                            >
                              {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                          <div>
                            <div className="cfsp-label">Status</div>
                            <div className="mt-2 text-sm font-black text-[#14304f]">{formatAccessRequestStatus(request.status)}</div>
                            <div className="mt-1 text-xs font-semibold text-[#5e7388]">{formatDate(request.created_at)}</div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            {pending ? (
                              <>
                                <button
                                  type="button"
                                  disabled={requestActionId === request.id}
                                  onClick={() => void handleAccessRequestAction(request.id, "approve")}
                                  className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={requestActionId === request.id}
                                  onClick={() => void handleAccessRequestAction(request.id, "deny")}
                                  className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                                >
                                  Deny
                                </button>
                              </>
                            ) : canInvite ? (
                              <>
                                <button
                                  type="button"
                                  disabled={requestActionId === request.id}
                                  onClick={() => void handleAccessRequestAction(request.id, "send_invite")}
                                  className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                                >
                                  {request.invite_sent ? "Resend Invite" : "Send Invite"}
                                </button>
                                <button
                                  type="button"
                                  disabled={requestActionId === request.id}
                                  onClick={() => void handleAccessRequestAction(request.id, "generate_invite_link")}
                                  className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                                >
                                  Copy Setup Link
                                </button>
                              </>
                            ) : (
                              <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2 text-xs font-bold text-[#5e7388]">
                                Request closed
                              </div>
                            )}
                          </div>
                        </div>

                        <AccessProgress request={request} />

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                            <div className="cfsp-label">Auth user</div>
                            <div className="mt-1 text-sm font-black text-[#14304f]">{formatBoolean(request.auth_user_exists)}</div>
                          </div>
                          <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                            <div className="cfsp-label">Org membership</div>
                            <div className="mt-1 text-sm font-black text-[#14304f]">
                              {formatBoolean(request.org_membership_exists)}
                              {request.org_membership_status ? ` · ${request.org_membership_status}` : ""}
                            </div>
                          </div>
                          <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                            <div className="cfsp-label">Assigned role</div>
                            <div className="mt-1 text-sm font-black text-[#14304f]">{getPeopleAccessRoleLabel(effectiveRole)}</div>
                          </div>
                          <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                            <div className="cfsp-label">Invite status</div>
                            <div className="mt-1 text-sm font-black text-[#14304f]">{request.last_invite_status || "Not sent"}</div>
                            <div className="mt-1 text-xs font-semibold text-[#5e7388]">
                              Sent: {formatBoolean(request.invite_sent)}
                              {request.invite_sent_at ? ` · ${formatDateTime(request.invite_sent_at)}` : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                      {requestInviteLink ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                          <div className="cfsp-label text-amber-800">Generated setup link</div>
                          <div className="mt-2 flex flex-col gap-2 lg:flex-row">
                            <input readOnly value={requestInviteLink} className="cfsp-input flex-1 bg-white" />
                            <button type="button" onClick={() => void copyTextToClipboard(requestInviteLink)} className="cfsp-btn cfsp-btn-secondary">
                              Copy Link
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {section === "sp-links" ? (
          <section className="cfsp-panel px-5 py-5">
            <p className="cfsp-kicker">SP Link Review</p>
            <h2 className="mt-2 text-[1.35rem] font-black text-[#14304f]">SP memberships needing review</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e7388]">
              These SP memberships do not have a confirmed organization-scoped SP Database link.
            </p>
            <div className="mt-4 grid gap-3">
              {reviewMembers.length === 0 ? (
                <div className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4 text-sm font-semibold text-[#5e7388]">
                  No SP link review items for this organization.
                </div>
              ) : (
                reviewMembers.map((member) => (
                  <article key={member.id} className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                    <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_auto] lg:items-start">
                      <div>
                        <h3 className="m-0 text-[1rem] font-black text-[#14304f]">{member.full_name || "Unnamed member"}</h3>
                        <div className="mt-1 text-sm font-semibold text-[#5e7388]">{member.email}</div>
                        <div className="mt-2 text-sm font-bold text-[#14304f]">Schedule Alias: {member.schedule_match_name || "Not set"}</div>
                        <div className="mt-1 text-xs font-semibold text-[#5e7388]">{activeOrganization?.name || "Active organization"}</div>
                      </div>
                      <div>
                        <span className="cfsp-badge" style={getSpTone(member)}>
                          {getSpLinkStatusLabel(member.sp_link_status, member.organization_role || member.role)}
                        </span>
                        <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                          {member.sp_link_reason || "Link has not yet been reviewed."}
                        </p>
                        {member.sp_link_candidates?.length ? (
                          <div className="mt-3 grid gap-2">
                            {member.sp_link_candidates.map((candidate) => (
                              <div key={candidate.sp_id} className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2 text-sm">
                                <div className="font-black text-[#14304f]">{candidate.sp_name}</div>
                                <div className="font-semibold text-[#5e7388]">
                                  {candidate.sp_email || "No email"} · {candidate.matched_by.replace(/_/g, " ")}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <button type="button" onClick={() => setSelectedMember(member)} className="cfsp-btn cfsp-btn-primary">
                        Review Link
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}

        {section === "organizations" && isPlatformOwner ? (
          <section className="cfsp-panel px-5 py-5">
            <p className="cfsp-kicker">Platform Owner</p>
            <h2 className="mt-2 text-[1.35rem] font-black text-[#14304f]">Organizations</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5e7388]">
              Platform-level view of organizations available to this account. Opening an organization switches the active organization and keeps admins scoped there.
            </p>
            <div className="mt-4 grid gap-3">
              {organizationOptions.map((organization) => {
                const isActive = organization.id === asText(activeOrganization?.id);
                return (
                  <article key={organization.id} className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
                      <div>
                        <h3 className="m-0 text-[1rem] font-black text-[#14304f]">{organization.name}</h3>
                        <div className="mt-1 text-sm font-semibold text-[#5e7388]">{organization.status || "active"}</div>
                      </div>
                      <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                        <div className="cfsp-label">Members</div>
                        <div className="mt-1 text-sm font-black text-[#14304f]">{isActive ? members.length : "Open to view"}</div>
                      </div>
                      <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                        <div className="cfsp-label">Review Queue</div>
                        <div className="mt-1 text-sm font-black text-[#14304f]">{isActive ? reviewMembers.length : "Open to view"}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleOrganizationChange(organization.id)}
                        disabled={isActive}
                        className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                      >
                        {isActive ? "Active" : "Open"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {selectedMember ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(11,31,51,0.42)] px-3 py-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-management-title"
          >
            <div
              ref={modalRef}
              tabIndex={-1}
              className="w-full max-w-4xl rounded-[16px] border border-[#dce6ee] bg-white p-5 shadow-2xl outline-none"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="cfsp-kicker">Manage member</p>
                  <h2 id="member-management-title" className="mt-2 text-[1.35rem] font-black text-[#14304f]">
                    {selectedMember.full_name || "Unnamed member"}
                  </h2>
                  <div className="mt-1 text-sm font-semibold text-[#5e7388]">{selectedMember.email}</div>
                </div>
                <button type="button" onClick={() => setSelectedMember(null)} className="cfsp-btn cfsp-btn-secondary">
                  Close
                </button>
              </div>

              {modalMessage ? <div className="cfsp-alert cfsp-alert-info mt-4">{modalMessage}</div> : null}

              <div className="mt-5 grid gap-4">
                <section className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                  <h3 className="m-0 text-[1rem] font-black text-[#14304f]">Account</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="cfsp-label">Name</div>
                      <div className="mt-1 font-bold text-[#14304f]">{selectedMember.full_name || "Not set"}</div>
                    </div>
                    <div>
                      <div className="cfsp-label">Email</div>
                      <div className="mt-1 break-words font-bold text-[#14304f]">{selectedMember.email || "Not set"}</div>
                    </div>
                    <div>
                      <div className="cfsp-label">Auth / invite status</div>
                      <div className="mt-1 font-bold text-[#14304f]">{selectedMember.account_status_label || "Active account"}</div>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-black text-[#14304f]">Technical details</summary>
                    <div className="mt-2 break-all rounded-lg border border-[#dce6ee] bg-white px-3 py-2 text-xs font-semibold text-[#5e7388]">
                      User ID: {selectedMember.id}
                    </div>
                  </details>
                </section>

                <section className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                  <h3 className="m-0 text-[1rem] font-black text-[#14304f]">Organization Access</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                    <div>
                      <div className="cfsp-label">Organization</div>
                      <div className="mt-1 font-bold text-[#14304f]">{activeOrganization?.name || "Active organization"}</div>
                    </div>
                    <label className="grid gap-2">
                      <span className="cfsp-label">Role</span>
                      <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as PeopleAccessRole)} className="cfsp-input">
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={modalBusyAction === "change_role"}
                      onClick={() => void runStaffAction({ action: "change_role", role: memberRole, success: "Member role saved." })}
                      className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                    >
                      Save Role
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                      <div className="cfsp-label">Membership status</div>
                      <div className="mt-1 font-black text-[#14304f]">{getPeopleAccessStatusLabel(selectedMember.status)}</div>
                    </div>
                    <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                      <div className="cfsp-label">Current role</div>
                      <div className="mt-1 font-black text-[#14304f]">{getPeopleAccessRoleLabel(selectedMemberRole)}</div>
                    </div>
                    <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                      <div className="cfsp-label">Joined</div>
                      <div className="mt-1 font-black text-[#14304f]">{formatDate(selectedMember.created_at)}</div>
                    </div>
                  </div>
                </section>

                {selectedMemberIsSp ? (
                  <section className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                    <h3 className="m-0 text-[1rem] font-black text-[#14304f]">SP Directory Link</h3>
                    <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                      Search only shows SP Database records in {activeOrganization?.name || "the active organization"}.
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                        <div className="cfsp-label">Current linked record</div>
                        <div className="mt-1 font-black text-[#14304f]">{selectedMember.sp_link_name || "Not linked"}</div>
                        {selectedMember.sp_link_email ? <div className="mt-1 text-xs font-semibold text-[#5e7388]">{selectedMember.sp_link_email}</div> : null}
                      </div>
                      <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                        <div className="cfsp-label">Link source</div>
                        <div className="mt-1 font-black text-[#14304f]">{selectedMember.sp_link_matched_by?.replace(/_/g, " ") || "Not reviewed"}</div>
                      </div>
                      <div className="rounded-lg border border-[#dce6ee] bg-white px-3 py-2">
                        <div className="cfsp-label">Status</div>
                        <div className="mt-1 font-black text-[#14304f]">
                          {getSpLinkStatusLabel(selectedMember.sp_link_status, selectedMember.organization_role || selectedMember.role)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <label className="grid gap-2">
                        <span className="cfsp-label">Search SP Database</span>
                        <input
                          value={spSearch}
                          onChange={(event) => setSpSearch(event.target.value)}
                          placeholder="Search by SP name, email, or ID"
                          className="cfsp-input"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="cfsp-label">Select SP record</span>
                        <select value={selectedSpId} onChange={(event) => setSelectedSpId(event.target.value)} className="cfsp-input">
                          <option value="">Choose an organization-scoped SP record</option>
                          {filteredSpOptions.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.name}{sp.email ? ` · ${sp.email}` : ""} · {sp.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!selectedSpId || modalBusyAction === "link_sp"}
                          onClick={() => void runStaffAction({ action: "link_sp", spId: selectedSpId, success: "SP directory link confirmed." })}
                          className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                        >
                          Link Selected Record
                        </button>
                        <button
                          type="button"
                          disabled={modalBusyAction === "unlink_sp"}
                          onClick={() => void runStaffAction({ action: "unlink_sp", success: "SP directory link cleared." })}
                          className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                        >
                          Unlink
                        </button>
                        <a href="/sps" className="cfsp-btn cfsp-btn-secondary no-underline">
                          Open SP Database
                        </a>
                      </div>
                    </div>
                  </section>
                ) : null}

                {isPlatformOwner ? (
                  <section className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                    <h3 className="m-0 text-[1rem] font-black text-[#14304f]">Other Organizations</h3>
                    <p className="mt-2 mb-0 text-sm leading-6 text-[#5e7388]">
                      Add an active membership in another organization. This does not delete history or remove the current membership.
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="grid gap-2">
                        <span className="cfsp-label">Organization</span>
                        <select value={targetOrganizationId} onChange={(event) => setTargetOrganizationId(event.target.value)} className="cfsp-input">
                          <option value="">Choose organization</option>
                          {organizationOptions
                            .filter((organization) => organization.id !== asText(activeOrganization?.id))
                            .map((organization) => (
                              <option key={organization.id} value={organization.id}>{organization.name}</option>
                            ))}
                        </select>
                      </label>
                      <label className="grid gap-2">
                        <span className="cfsp-label">Role</span>
                        <select
                          value={targetOrganizationRole}
                          onChange={(event) => setTargetOrganizationRole(event.target.value as PeopleAccessRole)}
                          className="cfsp-input"
                        >
                          {ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      {targetOrganizationRole === "sp" ? (
                        <label className="grid gap-2">
                          <span className="cfsp-label">SP record</span>
                          <select value={targetOrganizationSpId} onChange={(event) => setTargetOrganizationSpId(event.target.value)} className="cfsp-input">
                            <option value="">Choose an SP record in the target organization</option>
                            {targetOrganizationSpOptions.map((sp) => (
                              <option key={sp.id} value={sp.id}>{sp.name}{sp.email ? ` · ${sp.email}` : ""}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!targetOrganizationId || modalBusyAction === "add_membership"}
                        onClick={() => void addMembershipToOrganization()}
                        className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                      >
                        Save Membership
                      </button>
                      <button
                        type="button"
                        disabled={modalBusyAction === "suspend"}
                        onClick={() => {
                          const confirmed = window.prompt(
                            `Type SUSPEND to suspend ${selectedMember.full_name || selectedMember.email} in ${activeOrganization?.name || "this organization"}. Their Auth user, SP Database record, historical assignments, and other organization memberships will remain.`
                          );
                          if (confirmed === "SUSPEND") {
                            void runStaffAction({ action: "suspend", success: "Current organization membership suspended." });
                          }
                        }}
                        className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                      >
                        Suspend membership in {activeOrganization?.name || "current organization"}
                      </button>
                    </div>
                  </section>
                ) : null}

                <section className="rounded-[12px] border border-[#dce6ee] bg-[#f8fbfd] px-4 py-4">
                  <h3 className="m-0 text-[1rem] font-black text-[#14304f]">Account Actions</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={modalBusyAction === "send_invite"}
                      onClick={() => void runStaffAction({ action: "send_invite", success: "Setup email sent." })}
                      className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                    >
                      Resend Invite
                    </button>
                    {normalizePeopleAccessStatus(selectedMember.status) === "active" ? (
                      <button
                        type="button"
                        disabled={modalBusyAction === "suspend" || selectedMember.id === ""}
                        onClick={() => {
                          const confirmed = window.prompt(
                            `Type SUSPEND to suspend ${selectedMember.full_name || selectedMember.email} in ${activeOrganization?.name || "this organization"}. This will set only this organization membership to suspended and will not delete the Auth user, SP Database record, historical event assignments, or other organization records.`
                          );
                          if (confirmed === "SUSPEND") void runStaffAction({ action: "suspend", success: "Membership suspended.", close: true });
                        }}
                        className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                      >
                        Suspend Membership
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={modalBusyAction === "reactivate"}
                        onClick={() => void runStaffAction({ action: "reactivate", success: "Membership reactivated.", close: true })}
                        className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                      >
                        Reactivate Membership
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={modalBusyAction === "remove"}
                      onClick={() => {
                        const confirmed = window.prompt(
                          `Type REMOVE to remove ${selectedMember.full_name || selectedMember.email} from ${activeOrganization?.name || "this organization"}. This removes only this organization membership and will not delete the Auth user, SP Database record, historical event assignments, or other organization records.`
                        );
                        if (confirmed === "REMOVE") void runStaffAction({ action: "remove", success: "Membership removed.", close: true });
                      }}
                      className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                    >
                      Remove from Organization
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SiteShell>
  );
}

export default function StaffPage() {
  return (
    <Suspense
      fallback={
        <SiteShell title="People & Access" subtitle="Loading organization access tools.">
          <div className="cfsp-panel px-5 py-5 text-sm font-semibold text-[#5e7388]">Loading People & Access...</div>
        </SiteShell>
      }
    >
      <PeopleAccessContent />
    </Suspense>
  );
}
