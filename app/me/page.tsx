"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { signOutUserAndRedirect } from "../lib/clientAuth";

const sectionStyle: React.CSSProperties = {
  border: "1px solid #d8e0ec",
  borderRadius: "18px",
  padding: "18px",
  background: "#f8fbff",
  marginBottom: "16px",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.8fr)",
  gap: "16px",
  alignItems: "start",
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
};

const profileHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "96px minmax(0, 1fr)",
  gap: "16px",
  alignItems: "center",
};

const avatarFrameStyle: React.CSSProperties = {
  width: "96px",
  height: "96px",
  borderRadius: "24px",
  background: "linear-gradient(135deg, #173b6c 0%, #245ca1 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: "28px",
  overflow: "hidden",
  border: "1px solid #bfdbfe",
};

const metadataGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const metadataCardStyle: React.CSSProperties = {
  border: "1px solid #d8e0ec",
  borderRadius: "14px",
  padding: "12px 14px",
  background: "#ffffff",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#173b6c",
  fontWeight: 800,
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd7e6",
  borderRadius: "12px",
  padding: "12px 13px",
  background: "#ffffff",
  color: "#16213e",
  fontSize: "15px",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

const readOnlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#f8fafc",
  color: "#475569",
};

const statusMessageStyle: React.CSSProperties = {
  minHeight: "22px",
  fontSize: "14px",
  fontWeight: 700,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: "12px",
  border: "1px solid #173b6c",
  background: "#173b6c",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: "12px",
  border: "1px solid #cfd7e6",
  background: "#ffffff",
  color: "#173b6c",
  fontWeight: 800,
  cursor: "pointer",
};

type RoleValue = "sp" | "sim_op" | "admin" | "super_admin";

type MeResponse = {
  user?: {
    id: string;
    email?: string | null;
    created_at?: string | null;
    last_sign_in_at?: string | null;
    email_confirmed_at?: string | null;
  };
  profile?: {
    id: string;
    full_name: string | null;
    schedule_name?: string | null;
    email: string | null;
    role: string | null;
    is_active: boolean | null;
    profile_image_url?: string | null;
  } | null;
  profile_available?: boolean;
  message?: string;
  warning?: string;
  error?: string;
};

type FormState = {
  fullName: string;
  scheduleName: string;
  role: RoleValue;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const ROLE_OPTIONS: Array<{ value: RoleValue; label: string }> = [
  { value: "sp", label: "SP" },
  { value: "sim_op", label: "Sim Op" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown): RoleValue {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "sim_op" || role === "admin" || role === "super_admin" || role === "sp") return role;
  return "sp";
}

function formatRoleLabel(role: RoleValue) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || "SP";
}

function getFormState(body: MeResponse | null): FormState {
  return {
    fullName: asText(body?.profile?.full_name),
    scheduleName: asText(body?.profile?.schedule_name),
    role: normalizeRole(body?.profile?.role),
  };
}

function sameFormState(a: FormState, b: FormState) {
  return a.fullName === b.fullName && a.scheduleName === b.scheduleName && a.role === b.role;
}

function parseApiText(text: string) {
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as MeResponse;
  } catch {
    return null;
  }
}

function getApiErrorMessage(text: string, fallback: string) {
  const body = parseApiText(text);
  return asText(body?.error) || asText(body?.message) || asText(text) || fallback;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unavailable";
  return parsed.toLocaleString();
}

function getRoleTone(role: RoleValue): React.CSSProperties {
  if (role === "super_admin") {
    return { background: "#f5f3ff", color: "#6d28d9", border: "1px solid #c4b5fd" };
  }
  if (role === "admin") {
    return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  }
  if (role === "sim_op") {
    return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd" };
  }
  return { background: "#ecfdf3", color: "#166534", border: "1px solid #86efac" };
}

export default function MePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [data, setData] = useState<MeResponse | null>(null);
  const [fullName, setFullName] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [role, setRole] = useState<RoleValue>("sp");
  const [savedForm, setSavedForm] = useState<FormState>({
    fullName: "",
    scheduleName: "",
    role: "sp",
  });
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
    router.refresh();
    window.location.replace("/login");
  }, [router]);

  const applyResponseToForm = useCallback((body: MeResponse | null) => {
    const nextForm = getFormState(body);
    setData(body);
    setFullName(nextForm.fullName);
    setScheduleName(nextForm.scheduleName);
    setRole(nextForm.role);
    setSavedForm(nextForm);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setWarningMessage("");

    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
        credentials: "include",
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const responseText = await response.text();
      const body = parseApiText(responseText);

      if (!response.ok) {
        setErrorMessage(asText(body?.error) || "Could not load account details.");
        setLoading(false);
        return;
      }

      applyResponseToForm(body);
      setLoading(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load account details.");
      setLoading(false);
    }
  }, [applyResponseToForm, redirectToLogin]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      await loadProfile();
      if (cancelled) return;
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  const currentForm = useMemo<FormState>(
    () => ({
      fullName,
      scheduleName,
      role,
    }),
    [fullName, role, scheduleName]
  );

  const isDirty = useMemo(() => !sameFormState(currentForm, savedForm), [currentForm, savedForm]);

  const clearSaveFeedback = useCallback(() => {
    setSaveState("idle");
    setSuccessMessage("");
    setErrorMessage("");
  }, []);

  const email = data?.profile?.email || data?.user?.email || "";
  const profileId = data?.profile?.id || "Unavailable";
  const userId = data?.user?.id || "Unavailable";
  const avatarFallback = (asText(fullName) || asText(email) || "CF")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isActive = useMemo(() => {
    if (data?.profile?.is_active === null || data?.profile?.is_active === undefined) {
      return "Unknown";
    }
    return data.profile.is_active ? "Active" : "Inactive";
  }, [data]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");
    setWarningMessage("");

    const payload = {
      full_name: fullName,
      schedule_name: scheduleName,
      role: normalizeRole(role),
    };

    try {
      const response = await fetch("/api/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const responseText = await response.text();
      const body = parseApiText(responseText);

      if (!response.ok) {
        setErrorMessage(getApiErrorMessage(responseText, `${response.status} ${response.statusText}`));
        setWarningMessage(asText(body?.warning));
        setSaveState("error");
        return;
      }

      applyResponseToForm(body);
      setSuccessMessage(asText(body?.message) || "Profile saved.");
      setWarningMessage(asText(body?.warning));
      setSaveState("saved");
      await loadProfile();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save profile.");
      setSaveState("error");
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutUserAndRedirect();
      return;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not sign out cleanly.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SiteShell
      title="Profile Settings"
      subtitle="Manage the profile details CFSP uses to match events, staffing, and operational ownership."
    >
      {errorMessage ? (
        <div style={{ ...sectionStyle, borderColor: "#fecaca", background: "#fff5f5", color: "#991b1b" }}>
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div
          style={{
            ...sectionStyle,
            borderColor: "#86efac",
            background: "#ecfdf3",
            color: "#166534",
            fontWeight: 800,
          }}
        >
          {successMessage}
        </div>
      ) : null}

      {warningMessage ? (
        <div style={{ ...sectionStyle, borderColor: "#fed7aa", background: "#fff7ed", color: "#9a3412" }}>
          {warningMessage}
        </div>
      ) : null}

      <div style={gridStyle}>
        <form onSubmit={handleSave} style={sectionStyle}>
          <div style={profileHeaderStyle}>
            <div style={avatarFrameStyle}>
              {avatarFallback}
            </div>

            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  padding: "6px 10px",
                  fontWeight: 900,
                  fontSize: "12px",
                  ...getRoleTone(role),
                }}
              >
                {formatRoleLabel(role)}
              </div>
              <h2 style={{ margin: "10px 0 0", color: "#173b6c", fontSize: "28px" }}>
                {fullName || "Member Profile"}
              </h2>
              <div style={{ marginTop: "6px", color: "#475569", fontWeight: 700 }}>
                {email || "No email on file"}
              </div>
              <div style={{ marginTop: "6px", color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                Account status: {isActive}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ margin: "18px 0 0", color: "#173b6c" }}>Editable Profile</h2>
            <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.6 }}>
              Update the internal member details used by scheduling and operations tools.
            </p>
          </div>

          {loading ? (
            <p style={{ marginBottom: 0, color: "#64748b", fontWeight: 700 }}>Loading profile...</p>
          ) : (
            <div style={fieldGridStyle}>
              <label style={labelStyle}>
                Full Name
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setFullName(event.target.value);
                  }}
                  style={inputStyle}
                  placeholder="Enter your full name"
                />
              </label>

              <label style={labelStyle}>
                Schedule Match Name
                <input
                  type="text"
                  value={scheduleName}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setScheduleName(event.target.value);
                  }}
                  style={inputStyle}
                  placeholder="Example: Cory"
                />
              </label>

              <div style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.6, marginTop: "-2px" }}>
                Use the name that appears in imported schedule lead/team text, such as `Cory` or `Cory Brodsky`.
              </div>

              <label style={labelStyle}>
                Email
                <input type="email" value={email} readOnly style={readOnlyInputStyle} />
              </label>

              <label style={labelStyle}>
                Role
                <select
                  value={role}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setRole(normalizeRole(event.target.value));
                  }}
                  style={selectStyle}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                <button
                  type="submit"
                  style={{
                    ...primaryButtonStyle,
                    opacity: saveState === "saving" ? 0.7 : 1,
                    background:
                      saveState === "saved" ? "#166534" : saveState === "error" ? "#b91c1c" : "#173b6c",
                    border:
                      saveState === "saved"
                        ? "1px solid #166534"
                        : saveState === "error"
                          ? "1px solid #b91c1c"
                          : "1px solid #173b6c",
                    boxShadow: saveState === "saved" ? "0 0 0 3px rgba(34, 197, 94, 0.18)" : "none",
                    transition: "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
                  }}
                  disabled={saveState === "saving" || (!isDirty && saveState === "idle")}
                >
                  {saveState === "saving"
                    ? "Saving..."
                    : saveState === "saved"
                      ? "Saved"
                      : saveState === "error"
                        ? "Error saving"
                        : "Save Profile"}
                </button>
              </div>

              <div
                style={{
                  ...statusMessageStyle,
                  color:
                    saveState === "error"
                      ? "#991b1b"
                      : saveState === "saved"
                        ? "#166534"
                        : "#64748b",
                }}
              >
                {saveState === "saving"
                  ? "Saving your profile..."
                  : saveState === "saved"
                    ? successMessage || "Profile saved."
                    : saveState === "error"
                      ? errorMessage || "Could not save profile."
                      : "Update your profile details and save when you are ready."}
              </div>
            </div>
          )}
        </form>

        <div style={{ display: "grid", gap: "16px" }}>
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Member Details</h2>
            {loading ? (
              <p style={{ margin: "12px 0 0", color: "#64748b", fontWeight: 700 }}>Loading account state...</p>
            ) : (
              <div style={{ ...metadataGridStyle, marginTop: "14px" }}>
                <div style={metadataCardStyle}>
                  <div style={statLabel}>Schedule Match Name</div>
                  <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                    {scheduleName || "Not set"}
                  </div>
                </div>
                <div style={metadataCardStyle}>
                  <div style={statLabel}>Role</div>
                  <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                    {formatRoleLabel(role)}
                  </div>
                </div>
                <div style={metadataCardStyle}>
                  <div style={statLabel}>Account State</div>
                  <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                    {isActive}
                  </div>
                </div>
                <div style={metadataCardStyle}>
                  <div style={statLabel}>Profile Storage</div>
                  <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                    {data?.profile_available === false ? "Not available on this deployment" : "Ready"}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={sectionStyle}>
            <button
              type="button"
              onClick={() => setShowAdvancedDetails((value) => !value)}
              style={{
                ...secondaryButtonStyle,
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Advanced account details</span>
              <span>{showAdvancedDetails ? "Hide" : "Show"}</span>
            </button>
            {showAdvancedDetails ? (
              loading ? (
                <p style={{ margin: "12px 0 0", color: "#64748b", fontWeight: 700 }}>Loading internal details...</p>
              ) : (
                <div style={{ ...metadataGridStyle, marginTop: "14px" }}>
                  <div style={metadataCardStyle}>
                    <div style={statLabel}>User ID</div>
                    <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>{userId}</div>
                  </div>
                  <div style={metadataCardStyle}>
                    <div style={statLabel}>Profile ID</div>
                    <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>{profileId}</div>
                  </div>
                  <div style={metadataCardStyle}>
                    <div style={statLabel}>Email</div>
                    <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>{email || "Unavailable"}</div>
                  </div>
                  <div style={metadataCardStyle}>
                    <div style={statLabel}>Created</div>
                    <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>
                      {formatTimestamp(data?.user?.created_at)}
                    </div>
                  </div>
                  <div style={metadataCardStyle}>
                    <div style={statLabel}>Last Sign-In</div>
                    <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>
                      {formatTimestamp(data?.user?.last_sign_in_at)}
                    </div>
                  </div>
                  <div style={metadataCardStyle}>
                    <div style={statLabel}>Email Confirmed</div>
                    <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>
                      {formatTimestamp(data?.user?.email_confirmed_at)}
                    </div>
                  </div>
                </div>
              )
            ) : (
              <p style={{ margin: "12px 0 0", color: "#64748b", lineHeight: 1.6 }}>
                Internal account identifiers and timestamps are hidden by default to keep your profile page focused.
              </p>
            )}
          </div>

          <div style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Account Actions</h2>
            <p style={{ margin: "8px 0 14px", color: "#64748b", lineHeight: 1.6 }}>
              Sign out when you are done or if you need to switch confidential member accounts.
            </p>
            <button
              type="button"
              style={{ ...secondaryButtonStyle, opacity: signingOut ? 0.7 : 1 }}
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
