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

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export default function MePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [data, setData] = useState<MeResponse | null>(null);
  const [fullName, setFullName] = useState("");
  const [scheduleName, setScheduleName] = useState("");

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
    router.refresh();
    window.location.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");
      setWarningMessage("");

      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as MeResponse | null;
        if (cancelled) return;

        if (response.status === 401) {
          redirectToLogin();
          return;
        }

        if (!response.ok) {
          setErrorMessage(body?.error || "Could not load account details.");
          setLoading(false);
          return;
        }

        setData(body);
        setFullName(asText(body?.profile?.full_name));
        setScheduleName(asText(body?.profile?.schedule_name));
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load account details.");
        setLoading(false);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [redirectToLogin]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    setWarningMessage("");

    try {
      const response = await fetch("/api/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          schedule_name: scheduleName,
        }),
      });

      const body = (await response.json().catch(() => null)) as MeResponse | null;
      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        setErrorMessage(body?.error || "Could not save profile.");
        setSaving(false);
        return;
      }

      setData(body);
      setFullName(asText(body?.profile?.full_name));
      setScheduleName(asText(body?.profile?.schedule_name));
      setSuccessMessage(body?.message || "Profile saved.");
      setWarningMessage(asText(body?.warning));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setSaving(false);
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

  const email = data?.profile?.email || data?.user?.email || "";
  const role = data?.profile?.role || "viewer";
  const isActive = useMemo(() => {
    if (data?.profile?.is_active === null || data?.profile?.is_active === undefined) {
      return "Unknown";
    }
    return data.profile.is_active ? "Active" : "Inactive";
  }, [data]);

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
        <div style={{ ...sectionStyle, borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" }}>
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
                  onChange={(event) => setFullName(event.target.value)}
                  style={inputStyle}
                  placeholder="Enter your full name"
                />
              </label>

              <label style={labelStyle}>
                Schedule Match Name
                <input
                  type="text"
                  value={scheduleName}
                  onChange={(event) => setScheduleName(event.target.value)}
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
                <input type="text" value={role} readOnly style={readOnlyInputStyle} />
              </label>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                <button type="submit" style={{ ...primaryButtonStyle, opacity: saving ? 0.7 : 1 }} disabled={saving}>
                  {saving ? "Saving..." : "Save Profile"}
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
                <div><strong>Role:</strong> {role}</div>
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
