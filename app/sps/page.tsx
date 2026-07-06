"use client";

import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import SiteShell from "../components/SiteShell";
import { ActionFeedback, useActionFeedback } from "../components/SaveActionFeedback";
import { sanitizePublicErrorMessage } from "../lib/safeErrorMessage";

type SPRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  working_email?: string | null;
  email?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  portrayal_age?: string | null;
  race?: string | null;
  sex?: string | null;
  status?: string | null;
  do_not_hire_for?: string | null;
  telehealth?: string | null;
  pt_preferred?: string | null;
  other_roles?: string | null;
  birth_year?: string | number | null;
  secondary_email?: string | null;
  speaks_spanish?: string | boolean | null;
  notes?: string | null;
  created_at?: string | null;
  profile_status?: string | null;
  portal_login_status?: string | null;
  portal_login_status_label?: string | null;
  portal_status?: string | null;
  onboarding_status?: string | null;
  linked_user_id?: string | null;
  linked_user_email?: string | null;
  linked_user_role?: string | null;
  linked_user_last_sign_in_at?: string | null;
  last_portal_invite_sent_at?: string | null;
  latest_invite_status?: string | null;
  active_invite_expires_at?: string | null;
};

type NewSPForm = {
  first_name: string;
  last_name: string;
  full_name: string;
  working_email: string;
  phone: string;
  portrayal_age: string;
  race: string;
  sex: string;
  telehealth: string;
  pt_preferred: string;
  other_roles: string;
  status: string;
  notes: string;
};

type PortalActionState = "invite" | "login" | "";

type PortalActionResult = {
  kind: "invite" | "login";
  ok?: boolean;
  message?: string | null;
  error?: string | null;
  warning?: string | null;
  invite_url?: string | null;
  invite_message?: string | null;
  temporary_password?: string | null;
  email?: string | null;
  login_url?: string | null;
  action?: string | null;
};

type SPListPayload = {
  sps: SPRow[];
  canManageSpPortalAccounts: boolean;
};

const emptyForm: NewSPForm = {
  first_name: "",
  last_name: "",
  full_name: "",
  working_email: "",
  phone: "",
  portrayal_age: "",
  race: "",
  sex: "",
  telehealth: "",
  pt_preferred: "",
  other_roles: "",
  status: "Active",
  notes: "",
};

const cardStyle: CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "20px",
  padding: "18px",
  background: "#ffffff",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.05)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: "10px",
  padding: "10px 12px",
  fontSize: "14px",
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#334155",
  fontWeight: 700,
  fontSize: "13px",
};

const statStyle: CSSProperties = {
  border: "1px solid #dbe4ee",
  borderRadius: "16px",
  padding: "14px",
  background: "#f8fbff",
};

const buttonStyle: CSSProperties = {
  border: "1px solid #173b6c",
  borderRadius: "12px",
  background: "#173b6c",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 800,
  padding: "11px 16px",
};

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getFullName(sp: SPRow) {
  const explicit = asText(sp.full_name);
  if (explicit) return explicit;

  const joined = [sp.first_name, sp.last_name].map(asText).filter(Boolean).join(" ");
  return joined || "Unnamed SP";
}

function getEmail(sp: SPRow) {
  return asText(sp.working_email) || asText(sp.email);
}

function getSearchText(sp: SPRow) {
  return [
    getFullName(sp),
    getEmail(sp),
    sp.phone,
    sp.secondary_phone,
    sp.portrayal_age,
    sp.race,
    sp.sex,
    sp.telehealth,
    sp.pt_preferred,
    sp.other_roles,
    sp.status,
    sp.notes,
  ]
    .map(asText)
    .join(" ")
    .toLowerCase();
}

function sortSPs(a: SPRow, b: SPRow) {
  return getFullName(a).localeCompare(getFullName(b));
}

function formatDateTime(value: unknown) {
  const text = asText(value);
  if (!text) return "Not available";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
}

function formatRole(value: unknown) {
  const normalized = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "sp") return "SP";
  if (normalized === "sim_ops" || normalized === "sim_op") return "Sim Ops";
  if (normalized === "org_admin" || normalized === "admin") return "Organization Admin";
  if (normalized === "platform_owner" || normalized === "super_admin") return "Platform Owner";
  if (normalized === "faculty") return "Faculty";
  if (normalized === "viewer") return "Viewer";
  return asText(value) || "Not linked";
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

function toNullable(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function buildFullName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

async function parseApiError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return "Your session or organization access could not be verified for the SP database. Refresh and retry.";
  }
  try {
    const body = await response.json();
    return sanitizePublicErrorMessage(
      body?.error,
      "Could not load SP database right now. Please retry."
    );
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function fetchSPs(): Promise<SPListPayload> {
  const response = await fetch("/api/sps", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const data = await response.json();
  return {
    sps: Array.isArray(data?.sps) ? (data.sps as SPRow[]) : [],
    canManageSpPortalAccounts: data?.can_manage_sp_portal_accounts === true,
  };
}

export default function SPPage() {
  const [sps, setSps] = useState<SPRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<NewSPForm>(emptyForm);
  const [showAddForm, setShowAddForm] = useState(false);
  const [portalActionBySpId, setPortalActionBySpId] = useState<Record<string, PortalActionState>>({});
  const [portalActionResults, setPortalActionResults] = useState<Record<string, PortalActionResult>>({});
  const [portalActionMessage, setPortalActionMessage] = useState("");
  const [canManageSpPortalAccounts, setCanManageSpPortalAccounts] = useState(false);
  const { status: saveFeedback, begin, done, fail } = useActionFeedback();

  async function loadSPs() {
    try {
      const data = await fetchSPs();
      setSps(data.sps.sort(sortSPs));
      setCanManageSpPortalAccounts(data.canManageSpPortalAccounts);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(sanitizePublicErrorMessage(error instanceof Error ? error.message : error, "Could not load SP database right now. Please retry."));
      setSps([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void fetchSPs()
      .then((data) => {
        if (cancelled) return;
        setSps(data.sps.sort(sortSPs));
        setCanManageSpPortalAccounts(data.canManageSpPortalAccounts);
        setErrorMessage("");
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(sanitizePublicErrorMessage(error instanceof Error ? error.message : error, "Could not load SP database right now. Please retry."));
        setSps([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSps = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sps;
    return sps.filter((sp) => getSearchText(sp).includes(needle));
  }, [query, sps]);

  const activeCount = sps.filter((sp) => {
    const status = asText(sp.status).toLowerCase();
    return !status || status === "active";
  }).length;

  const spanishCount = sps.filter((sp) => {
    const value = sp.speaks_spanish;
    return value === true || asText(value).toLowerCase() === "yes";
  }).length;

  function updateForm(field: keyof NewSPForm, value: string) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "first_name" || field === "last_name") {
        next.full_name = buildFullName(
          field === "first_name" ? value : current.first_name,
          field === "last_name" ? value : current.last_name
        );
      }
      return next;
    });
  }

  function toggleAddForm() {
    setShowAddForm((current) => {
      const next = !current;
      setErrorMessage("");
      return next;
    });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    begin();
    setErrorMessage("");

    if (!form.first_name.trim() && !form.last_name.trim()) {
      setErrorMessage("Enter at least a first or last name.");
      fail("Enter at least one name field so CFSP can generate a full name.");
      return;
    }

    const fullName = buildFullName(form.first_name, form.last_name);
    if (!fullName) {
      setErrorMessage("Enter at least one name field so CFSP can generate a full name.");
      fail("Enter at least one name field so CFSP can generate a full name.");
      return;
    }

    const payload = {
      first_name: toNullable(form.first_name),
      last_name: toNullable(form.last_name),
      full_name: fullName,
      working_email: toNullable(form.working_email),
      phone: toNullable(form.phone),
      portrayal_age: toNullable(form.portrayal_age),
      race: toNullable(form.race),
      sex: toNullable(form.sex),
      telehealth: toNullable(form.telehealth),
      pt_preferred: toNullable(form.pt_preferred),
      other_roles: toNullable(form.other_roles),
      status: toNullable(form.status) || "Active",
      notes: toNullable(form.notes),
    };

    try {
      const response = await fetch("/api/sps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await parseApiError(response);
        setErrorMessage(message);
        fail(message);
        return;
      }
    } catch (error) {
      const message = sanitizePublicErrorMessage(error instanceof Error ? error.message : error, "Could not create SP right now. Please retry.");
      setErrorMessage(message);
      fail(message);
      return;
    }

    setForm(emptyForm);
    done("Saved SP");
    setShowAddForm(false);
    await loadSPs();
  }

  async function handleSendPortalInvite(sp: SPRow) {
    const spId = asText(sp.id);
    if (!spId) return;
    setPortalActionMessage("");
    setPortalActionBySpId((current) => ({ ...current, [spId]: "invite" }));
    try {
      const response = await fetch(`/api/sps/${encodeURIComponent(spId)}/portal-invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: 14 }),
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok || body?.ok === false) {
        const message = sanitizePublicErrorMessage(body?.error, "Could not create SP portal invite.");
        setPortalActionMessage(message);
        return;
      }
      const invite = (body?.invite || {}) as Record<string, unknown>;
      setPortalActionResults((current) => ({
        ...current,
        [spId]: {
          kind: "invite",
          ok: true,
          message: "Portal invite created. Share this invite link with the SP to finish account setup.",
          invite_url: asText(invite.invite_url),
          invite_message: asText(invite.invite_message),
        },
      }));
      setPortalActionMessage(`Portal invite created for ${getFullName(sp)}.`);
      await loadSPs();
    } catch (error) {
      setPortalActionMessage(sanitizePublicErrorMessage(error instanceof Error ? error.message : error, "Could not create SP portal invite."));
    } finally {
      setPortalActionBySpId((current) => ({ ...current, [spId]: "" }));
    }
  }

  async function handleCreatePortalLogin(sp: SPRow) {
    const spId = asText(sp.id);
    if (!spId) return;
    setPortalActionMessage("");
    setPortalActionBySpId((current) => ({ ...current, [spId]: "login" }));
    try {
      const response = await fetch(`/api/sps/${encodeURIComponent(spId)}/portal-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await response.json().catch(() => null)) as PortalActionResult | null;
      if (!response.ok || body?.ok === false) {
        const message = sanitizePublicErrorMessage(body?.message || body?.error, "Could not create or link SP portal login.");
        setPortalActionMessage(message);
        return;
      }
      setPortalActionResults((current) => ({
        ...current,
        [spId]: {
          ...body,
          kind: "login",
          message: body?.message || "SP portal login is linked.",
        },
      }));
      setPortalActionMessage(body?.message || `SP portal login is linked for ${getFullName(sp)}.`);
      await loadSPs();
    } catch (error) {
      setPortalActionMessage(sanitizePublicErrorMessage(error instanceof Error ? error.message : error, "Could not create or link SP portal login."));
    } finally {
      setPortalActionBySpId((current) => ({ ...current, [spId]: "" }));
    }
  }

  return (
    <SiteShell
      title="SP Database"
      subtitle="Live standardized-patient directory loaded from Supabase."
    >
      <div style={{ display: "grid", gap: "18px" }}>
        {errorMessage ? (
          <div
            style={{
              border: "1px solid #fecaca",
              borderRadius: "14px",
              background: "#fff5f5",
              color: "#991b1b",
              padding: "12px 14px",
              fontWeight: 700,
            }}
          >
            {errorMessage}
          </div>
        ) : null}
        {portalActionMessage ? (
          <div
            style={{
              border: "1px solid #bfdbfe",
              borderRadius: "14px",
              background: "#eff6ff",
              color: "#1e3a8a",
              padding: "12px 14px",
              fontWeight: 800,
            }}
          >
            {portalActionMessage}
          </div>
        ) : null}

        <section style={gridStyle}>
          <div style={statStyle}>
            <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
              Total SPs
            </div>
            <div style={{ color: "#173b6c", fontSize: "30px", fontWeight: 900 }}>
              {sps.length}
            </div>
          </div>

          <div style={statStyle}>
            <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
              Active / Unspecified
            </div>
            <div style={{ color: "#173b6c", fontSize: "30px", fontWeight: 900 }}>
              {activeCount}
            </div>
          </div>

          <div style={statStyle}>
            <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
              Spanish-Speaking
            </div>
            <div style={{ color: "#173b6c", fontSize: "30px", fontWeight: 900 }}>
              {spanishCount}
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, display: "grid", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "14px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: "#173b6c" }}>Directory</h2>
              <div style={{ color: "#64748b", fontWeight: 700, marginTop: "4px" }}>
                Search and manage your existing SP database first.
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={toggleAddForm}
                style={{ ...buttonStyle, background: "#ffffff", color: "#173b6c", border: "1px solid #cbd5e1" }}
              >
                {showAddForm ? "Close Add SP" : "+ Add SP"}
              </button>
              <button type="button" onClick={loadSPs} style={{ ...buttonStyle, background: "#ffffff", color: "#173b6c" }}>
                Refresh
              </button>
            </div>
          </div>

          <label style={labelStyle}>
            Search SPs
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email, phone, role, race, sex, notes..."
              style={inputStyle}
            />
          </label>

          {showAddForm ? (
            <form
              onSubmit={handleCreate}
              style={{
                border: "1px solid #dbe4ee",
                borderRadius: "16px",
                padding: "16px",
                background: "#f8fbff",
                display: "grid",
                gap: "14px",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#173b6c" }}>Add SP</h3>
                <div style={{ color: "#64748b", fontWeight: 700, marginTop: "4px" }}>
                  Enter at least a first or last name before saving. CFSP will generate the full name automatically.
                </div>
              </div>

              <div style={gridStyle}>
                <TextField label="First name" value={form.first_name} onChange={(value) => updateForm("first_name", value)} />
                <TextField label="Last name" value={form.last_name} onChange={(value) => updateForm("last_name", value)} />
                <TextField label="Full name" value={form.full_name} onChange={() => undefined} readOnly />
                <TextField label="Working email" value={form.working_email} onChange={(value) => updateForm("working_email", value)} />
                <TextField label="Phone" value={form.phone} onChange={(value) => updateForm("phone", value)} />
                <TextField label="Portrayal age" value={form.portrayal_age} onChange={(value) => updateForm("portrayal_age", value)} />
                <TextField label="Race" value={form.race} onChange={(value) => updateForm("race", value)} />
                <TextField label="Sex" value={form.sex} onChange={(value) => updateForm("sex", value)} />
                <TextField label="Telehealth" value={form.telehealth} onChange={(value) => updateForm("telehealth", value)} />
                <TextField label="PT preferred" value={form.pt_preferred} onChange={(value) => updateForm("pt_preferred", value)} />
                <TextField label="Other roles" value={form.other_roles} onChange={(value) => updateForm("other_roles", value)} />
                <TextField label="Status" value={form.status} onChange={(value) => updateForm("status", value)} />
                <TextField label="Notes" value={form.notes} onChange={(value) => updateForm("notes", value)} />
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={saveFeedback.state === "saving"}
                  style={{ ...buttonStyle, opacity: saveFeedback.state === "saving" ? 0.7 : 1 }}
                >
                  {saveFeedback.state === "saving" ? "Saving..." : "Save SP to Supabase"}
                </button>
                <button
                  type="button"
                  onClick={toggleAddForm}
                  style={{ ...buttonStyle, background: "#ffffff", color: "#173b6c", border: "1px solid #cbd5e1" }}
                >
                  Cancel
                </button>
                <ActionFeedback feedback={saveFeedback} />
              </div>
            </form>
          ) : null}

          {loading ? (
            <p style={{ margin: 0, color: "#64748b" }}>Loading SPs from Supabase...</p>
          ) : filteredSps.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>No SPs match the current search.</p>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {filteredSps.map((sp, index) => (
                <SPCard
                  key={asText(sp.id) || `${getEmail(sp)}-${index}`}
                  sp={sp}
                  portalAction={portalActionBySpId[asText(sp.id)] || ""}
                  portalActionResult={portalActionResults[asText(sp.id)] || null}
                  canManageSpPortalAccounts={canManageSpPortalAccounts}
                  onSendPortalInvite={handleSendPortalInvite}
                  onCreatePortalLogin={handleCreatePortalLogin}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </SiteShell>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label style={labelStyle}>
      {props.label}
      <input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        readOnly={props.readOnly}
        style={{
          ...inputStyle,
          background: props.readOnly ? "#f8fafc" : inputStyle.background,
          color: props.readOnly ? "#475569" : undefined,
        }}
      />
    </label>
  );
}

function getPortalBadgeStyle(status: string): CSSProperties {
  const normalized = asText(status).toLowerCase();
  if (normalized === "linked") return { borderColor: "#bfe4d6", color: "#166534", background: "#eaf7f2" };
  if (normalized === "invite_pending") return { borderColor: "#bfdbfe", color: "#1d4ed8", background: "#eff6ff" };
  if (normalized === "needs_help") return { borderColor: "#fde68a", color: "#92400e", background: "#fffbeb" };
  if (normalized === "inactive" || normalized === "disabled") return { borderColor: "#fecaca", color: "#991b1b", background: "#fff5f5" };
  return { borderColor: "#dbe4ee", color: "#475569", background: "#f8fafc" };
}

function SPCard({
  sp,
  portalAction,
  portalActionResult,
  canManageSpPortalAccounts,
  onSendPortalInvite,
  onCreatePortalLogin,
}: {
  sp: SPRow;
  portalAction: PortalActionState;
  portalActionResult: PortalActionResult | null;
  canManageSpPortalAccounts: boolean;
  onSendPortalInvite: (sp: SPRow) => void;
  onCreatePortalLogin: (sp: SPRow) => void;
}) {
  const status = asText(sp.status) || "Active";
  const email = getEmail(sp);
  const demographics = [sp.portrayal_age, sp.race, sp.sex].map(asText).filter(Boolean);
  const roleDetails = [sp.telehealth, sp.pt_preferred, sp.other_roles].map(asText).filter(Boolean);
  const portalLoginStatus = asText(sp.portal_login_status) || "no_login";
  const portalLoginLabel = asText(sp.portal_login_status_label) || "No portal login yet";
  const linkedUserEmail = asText(sp.linked_user_email);
  const hasWorkingEmail = Boolean(email);
  const previewHref = asText(sp.id) ? `/sp?previewSpId=${encodeURIComponent(asText(sp.id))}` : "/sp";
  const actionInProgress = Boolean(portalAction);
  const accountActionsDisabled =
    actionInProgress || !canManageSpPortalAccounts || !hasWorkingEmail || portalLoginStatus === "disabled";
  const adminOnlyTitle = "Only organization admins and platform owners can manage SP portal logins or preview as an SP.";

  return (
    <article
      style={{
        border: "1px solid #dbe4ee",
        borderRadius: "16px",
        padding: "16px",
        background: "#f8fbff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0, color: "#173b6c", fontSize: "24px" }}>
            {getFullName(sp)}
          </h3>
          <div style={{ color: "#64748b", fontWeight: 700, marginTop: "4px" }}>
            {status}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "flex-end" }}>
          <div
            style={{
              border: "1px solid #bfdbfe",
              color: "#1d4ed8",
              background: "#eff6ff",
              borderRadius: "999px",
              padding: "7px 11px",
              height: "fit-content",
              fontWeight: 800,
              fontSize: "12px",
            }}
          >
            SP profile
          </div>
          <div
            style={{
              ...getPortalBadgeStyle(portalLoginStatus),
              border: "1px solid",
              borderRadius: "999px",
              padding: "7px 11px",
              height: "fit-content",
              fontWeight: 900,
              fontSize: "12px",
            }}
          >
            {portalLoginLabel}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "12px", display: "grid", gap: "6px", color: "#334155" }}>
        <div
          style={{
            border: "1px solid #dbe4ee",
            borderRadius: "12px",
            background: "#ffffff",
            padding: "10px 12px",
            color: "#475569",
            fontWeight: 750,
          }}
        >
          This is an SP directory profile. It does not change the logged-in account role. Use a portal invite, a separate SP login,
          or admin preview to test the SP experience.
          {!canManageSpPortalAccounts ? " Portal-login actions are owner/admin-only." : ""}
        </div>
        <div><strong>Email:</strong> {email || "-"}</div>
        <div><strong>Phone:</strong> {asText(sp.phone) || "-"}</div>
        <div><strong>Secondary phone:</strong> {asText(sp.secondary_phone) || "-"}</div>
        <div><strong>Demographics:</strong> {demographics.join(" / ") || "-"}</div>
        <div><strong>Preferences / roles:</strong> {roleDetails.join(" / ") || "-"}</div>
        <div><strong>Do not hire for:</strong> {asText(sp.do_not_hire_for) || "-"}</div>
        <div><strong>Secondary email:</strong> {asText(sp.secondary_email) || "-"}</div>
        <div><strong>Spanish:</strong> {asText(sp.speaks_spanish) || "-"}</div>
        <div><strong>Notes:</strong> {asText(sp.notes) || "-"}</div>
      </div>

      <div style={{ marginTop: "14px", display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <StatusTile label="Profile status" value={asText(sp.profile_status) || status} />
        <StatusTile label="Portal login status" value={portalLoginLabel} />
        <StatusTile label="Linked user email" value={linkedUserEmail || "No linked user"} />
        <StatusTile label="Role" value={formatRole(sp.linked_user_role)} />
        <StatusTile label="Last portal invite sent" value={formatDateTime(sp.last_portal_invite_sent_at)} />
        <StatusTile label="Last login" value={formatDateTime(sp.linked_user_last_sign_in_at)} />
      </div>

      <div style={{ marginTop: "14px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onSendPortalInvite(sp)}
          disabled={accountActionsDisabled}
          title={
            !canManageSpPortalAccounts
              ? adminOnlyTitle
              : !hasWorkingEmail
              ? "Add a working email before sending an SP portal invite."
              : portalLoginStatus === "disabled"
                ? "This SP profile is disabled or inactive."
                : "Create a portal invite link for this SP profile."
          }
          style={{
            ...buttonStyle,
            background: "#ffffff",
            color: "#173b6c",
            border: "1px solid #cbd5e1",
            opacity: accountActionsDisabled ? 0.58 : 1,
          }}
        >
          {portalAction === "invite" ? "Creating invite..." : "Send SP portal invite"}
        </button>
        <button
          type="button"
          onClick={() => onCreatePortalLogin(sp)}
          disabled={accountActionsDisabled}
          title={
            !canManageSpPortalAccounts
              ? adminOnlyTitle
              : !hasWorkingEmail
              ? "Add a working email before creating or linking an SP login."
              : portalLoginStatus === "disabled"
                ? "This SP profile is disabled or inactive."
                : "Create or link a separate SP-only login for this profile."
          }
          style={{
            ...buttonStyle,
            opacity: accountActionsDisabled ? 0.58 : 1,
          }}
        >
          {portalAction === "login" ? "Linking login..." : "Create / link SP portal login"}
        </button>
        {canManageSpPortalAccounts ? (
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            style={{
              ...buttonStyle,
              background: "#f8fafc",
              color: "#173b6c",
              border: "1px solid #cbd5e1",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Preview SP Portal as {getFullName(sp)}
          </a>
        ) : (
          <span
            title={adminOnlyTitle}
            style={{
              ...buttonStyle,
              background: "#f8fafc",
              color: "#64748b",
              border: "1px solid #cbd5e1",
              opacity: 0.58,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Preview SP Portal as {getFullName(sp)}
          </span>
        )}
      </div>

      {portalActionResult ? (
        <div
          style={{
            marginTop: "12px",
            border: "1px solid #bfdbfe",
            borderRadius: "14px",
            background: "#eff6ff",
            padding: "12px",
            color: "#1e3a8a",
            display: "grid",
            gap: "8px",
            fontWeight: 750,
          }}
        >
          <div style={{ fontWeight: 950 }}>
            {portalActionResult.kind === "invite" ? "SP portal invite" : "SP portal login"}
          </div>
          {portalActionResult.message ? <div>{portalActionResult.message}</div> : null}
          {portalActionResult.email ? <div><strong>Login email:</strong> {portalActionResult.email}</div> : null}
          {portalActionResult.temporary_password ? (
            <div>
              <strong>Temporary password:</strong>{" "}
              <code style={{ background: "#ffffff", borderRadius: "8px", padding: "3px 6px" }}>{portalActionResult.temporary_password}</code>
            </div>
          ) : null}
          {portalActionResult.invite_url ? (
            <div style={{ display: "grid", gap: "6px" }}>
              <label style={labelStyle}>
                Invite link
                <input readOnly value={portalActionResult.invite_url} style={{ ...inputStyle, background: "#ffffff" }} />
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void copyTextToClipboard(asText(portalActionResult.invite_url))}
                  style={{ ...buttonStyle, background: "#ffffff", color: "#173b6c", border: "1px solid #cbd5e1" }}
                >
                  Copy invite link
                </button>
                <a href={asText(portalActionResult.invite_url)} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", fontWeight: 900 }}>
                  Open invite link
                </a>
              </div>
            </div>
          ) : null}
          {portalActionResult.invite_message ? (
            <label style={labelStyle}>
              Invite message
              <textarea readOnly value={portalActionResult.invite_message} style={{ ...inputStyle, minHeight: 92, background: "#ffffff" }} />
            </label>
          ) : null}
          {portalActionResult.warning ? <div style={{ color: "#92400e" }}>{portalActionResult.warning}</div> : null}
        </div>
      ) : null}
    </article>
  );
}

function StatusTile(props: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #dbe4ee", borderRadius: "12px", background: "#ffffff", padding: "10px 12px" }}>
      <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {props.label}
      </div>
      <div style={{ marginTop: "5px", color: "#173b6c", fontSize: "13px", fontWeight: 900, overflowWrap: "anywhere" }}>
        {props.value || "Not available"}
      </div>
    </div>
  );
}
