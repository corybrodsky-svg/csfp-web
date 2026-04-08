"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { signOutUser } from "../lib/clientAuth";

const cardStyle: React.CSSProperties = {
  border: "1px solid #d8e0ec",
  borderRadius: "16px",
  padding: "18px",
  background: "#f8fbff",
  marginBottom: "16px",
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: "12px",
  border: "1px solid #cfd7e6",
  background: "#1d4ed8",
  color: "#fff",
  fontWeight: 700,
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
    email: string | null;
    role: string | null;
    is_active: boolean | null;
  } | null;
  profile_available?: boolean;
  error?: string;
};

export default function MePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/me", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as MeResponse | null;
        if (cancelled) return;

        if (!response.ok) {
          setErrorMessage(body?.error || "Could not load account details.");
          setLoading(false);
          return;
        }

        setData(body);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load account details.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSignOut() {
    await signOutUser();
    router.push("/login");
  }

  const fullName = data?.profile?.full_name || "Profile not set";
  const email = data?.profile?.email || data?.user?.email || "No email found";
  const role = data?.profile?.role || "viewer";
  const isActive =
    data?.profile?.is_active === null || data?.profile?.is_active === undefined
      ? "Unknown"
      : data.profile.is_active
        ? "Active"
        : "Inactive";

  return (
    <SiteShell title="Me" subtitle="Authenticated account and profile foundation.">
      {errorMessage ? (
        <div style={{ ...cardStyle, borderColor: "#fecaca", background: "#fff5f5", color: "#991b1b" }}>
          {errorMessage}
        </div>
      ) : null}

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Profile Snapshot</h3>
        {loading ? (
          <p style={{ marginBottom: 0 }}>Loading profile...</p>
        ) : (
          <>
            <p><strong>Name:</strong> {fullName}</p>
            <p><strong>Email:</strong> {email}</p>
            <p><strong>Role:</strong> {role}</p>
            <p><strong>Active:</strong> {isActive}</p>
            <p style={{ marginBottom: 0 }}>
              <strong>Profile Table:</strong> {data?.profile_available === false ? "Not available yet" : "Ready"}
            </p>
          </>
        )}
      </div>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Account Action</h3>
        <button type="button" style={buttonStyle} onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </SiteShell>
  );
}
