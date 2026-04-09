"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { signOutUserAndRedirect } from "../lib/clientAuth";

const sectionStyle: React.CSSProperties = {
  border: "1px solid #d8e0ec",
  borderRadius: "18px",
  padding: "20px",
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

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#173b6c",
  fontWeight: 800,
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

type MeResponse = {
  user?: {
    id: string;
    email?: string | null;
  };
  profile?: {
    id: string;
    full_name: string | null;
    schedule_name?: string | null;
    email: string | null;
    role: string | null;
    is_active: boolean | null;
  } | null;
  profile_available?: boolean;
  message?: string;
  warning?: string;
  error?: string;
};

type FormState = {
  fullName: string;
  scheduleName: string;
  role: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const ROLE_OPTIONS = [
  { value: "sp", label: "SP" },
  { value: "sim_op", label: "Sim Op" },
  { value: "admin", label: "Admin" },
] as const;

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown) {
  const role = asText(value).toLowerCase();
  if (role === "sim_op" || role === "admin" || role === "sp") return role;
  return "sp";
}

function formatRoleLabel(role: string) {
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
  const [role, setRole] = useState("sp");
  const [savedForm, setSavedForm] = useState<FormState>({
    fullName: "",
    scheduleName: "",
    role: "sp",
  });

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
      const body = (await response.json().catch(() => null)) as MeResponse | null;

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        setErrorMessage(body?.error || "Could not load account details.");
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

    function handleFocus() {
      void loadProfile();
    }

    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadProfile]);

  const currentForm = useMemo(
    () => ({
      fullName,
      scheduleName,
      role,
    }),
    [fullName, scheduleName, role]
  );

  const isDirty = useMemo(() => !sameFormState(currentForm, savedForm), [currentForm, savedForm]);

  const resetSaveFeedbackOnEdit = useCallback(() => {
    if (saveState !== "idle") {
      setSaveState("idle");
    }
    if (successMessage) {
      setSuccessMessage("");
    }
    if (errorMessage) {
      setErrorMessage("");
    }
  }, [errorMessage, saveState, successMessage]);

  const email = data?.profile?.email || data?.user?.email || "";
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

    try {
      const response = await fetch("/api/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          full_name: fullName,
          schedule_name: scheduleName,
          role,
        }),
      });

      const body = (await response.json().catch(() => null)) as MeResponse | null;

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        setErrorMessage(body?.error || "Could not save profile.");
        setWarningMessage(asText(body?.warning));
        setSaveState("error");
        return;
      }

      applyResponseToForm(body);
      setSuccessMessage(body?.message || "Profile saved.");
      setWarningMessage(asText(body?.warning));
      setSaveState("saved");
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
      title="My Account"
      subtitle="Complete your CFSP profile so the operations board can reflect your account details cleanly."
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
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Profile Builder</h2>
            <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.6 }}>
              Finish your account details after sign-in. If this is your first visit, saving this form will create your
              profile row automatically.
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
                    resetSaveFeedbackOnEdit();
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
                    resetSaveFeedbackOnEdit();
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
                    resetSaveFeedbackOnEdit();
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
                        ? "Error"
                        : "Save Profile"}
                </button>
              </div>
            </div>
          )}
        </form>

        <div style={{ display: "grid", gap: "16px" }}>
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Account Status</h2>
            {loading ? (
              <p style={{ margin: "12px 0 0", color: "#64748b", fontWeight: 700 }}>Loading account state...</p>
            ) : (
              <div style={{ display: "grid", gap: "10px", marginTop: "14px", color: "#334155" }}>
                <div><strong>User ID:</strong> {data?.user?.id || "Unavailable"}</div>
                <div><strong>Email:</strong> {email || "Unavailable"}</div>
                <div><strong>Role:</strong> {formatRoleLabel(role)}</div>
                <div><strong>Account State:</strong> {isActive}</div>
                <div>
                  <strong>Profile Storage:</strong>{" "}
                  {data?.profile_available === false ? "Not available on this deployment" : "Ready"}
                </div>
              </div>
            )}
          </div>

          <div style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Account Actions</h2>
            <p style={{ margin: "8px 0 14px", color: "#64748b", lineHeight: 1.6 }}>
              Use sign out when you are done, or after verifying a different account and signing back in.
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
