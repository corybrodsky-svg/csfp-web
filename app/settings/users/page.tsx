"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../../components/SiteShell";

type OrganizationRole = "platform_owner" | "org_admin" | "sim_ops" | "faculty" | "sp" | "viewer";

type MeResponse = {
  ok?: boolean;
  role?: string | null;
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
  created_at: string | null;
  updated_at: string | null;
};

type StaffResponse = {
  ok?: boolean;
  members?: StaffMember[];
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

export default function UsersAndAccessPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeOrgName, setActiveOrgName] = useState("Organization");

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
  const [memberActionId, setMemberActionId] = useState("");
  const [memberMessage, setMemberMessage] = useState("");

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
    } catch (error) {
      setMembersError(error instanceof Error ? error.message : "Could not load active users.");
    } finally {
      setMembersLoading(false);
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

        if (cancelled) return;
        setAuthorized(canManage);
        setActiveOrgName(asText(meBody?.activeOrganization?.name) || "Organization");

        if (!canManage) return;

        await Promise.all([loadAccessRequests(), loadMembers(), loadAccessCodes()]);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [loadAccessCodes, loadAccessRequests, loadMembers, router]);

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

  return (
    <SiteShell
      title="Users & Access"
      subtitle="Manage organization access, pending requests, roles, and access codes."
    >
      <div className="grid gap-5">
        <section className="rounded-[20px] border border-[var(--cfsp-border)] bg-white px-5 py-4">
          <p className="cfsp-kicker">Organization</p>
          <h1 className="mt-1 text-2xl font-black text-[var(--cfsp-text)]">Users &amp; Access</h1>
          <p className="mt-2 text-sm font-semibold text-[var(--cfsp-text-muted)]">
            Active organization: <span className="font-black text-[var(--cfsp-text)]">{activeOrgName}</span>
          </p>
        </section>

        {authLoading ? (
          <section className="rounded-[16px] border border-[var(--cfsp-border)] bg-white px-5 py-5 text-sm font-semibold text-[var(--cfsp-text-muted)]">
            Loading users and access controls...
          </section>
        ) : !authorized ? (
          <section className="rounded-[16px] border border-red-200 bg-red-50 px-5 py-5">
            <h2 className="text-lg font-black text-red-700">Restricted</h2>
            <p className="mt-2 text-sm font-semibold text-red-700">
              Only platform owners and organization admins can access Users &amp; Access.
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
                    const pending = asText(request.status).toLowerCase() === "pending";
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
                            <div className="mt-1 text-sm font-black text-[var(--cfsp-text)]">{asText(request.status) || "Unknown"}</div>
                            <div className="mt-1 text-xs font-semibold text-[var(--cfsp-text-muted)]">{formatDate(request.created_at)}</div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            <button
                              type="button"
                              onClick={() => void handleAccessRequestAction(request.id, "approve")}
                              disabled={!pending || requestActionId === request.id}
                              className="cfsp-btn cfsp-btn-primary disabled:opacity-60"
                            >
                              Approve &amp; Invite
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAccessRequestAction(request.id, "deny")}
                              disabled={!pending || requestActionId === request.id}
                              className="cfsp-btn cfsp-btn-secondary disabled:opacity-60"
                            >
                              Deny
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
                    return (
                      <article key={member.id} className="rounded-xl border border-[var(--cfsp-border)] bg-[var(--cfsp-surface-muted)] px-4 py-4">
                        <div className="grid gap-3 lg:grid-cols-[1.4fr_0.9fr_1fr_auto] lg:items-end">
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
